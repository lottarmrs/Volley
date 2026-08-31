import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { Client, Pool, QueryResultRow } from 'pg';
import {
  asIdentityCommitting,
  connect,
  createPool,
  isTestDatabaseConfigured,
  rebuildFromMigrations,
  TEST_DATABASE_URL_VAR,
} from './harness';

/**
 * RED contract for the Registration schema (XS-W4-01 task 1).
 *
 * Nothing under test exists yet: `public.registration_windows` and
 * `public.registration_entries` are both created by a later task (XS-W4-02). Every
 * assertion here is expected to fail against the missing tables (`42P01`) or against an
 * assertion on an empty catalog-query result until that task lands.
 */

if (!isTestDatabaseConfigured()) {
  test(`registration schema requires ${TEST_DATABASE_URL_VAR}`, () => {
    assert.fail(`${TEST_DATABASE_URL_VAR} is not set; run \`npm run test:db\`.`);
  });
} else {
  let client: Client;
  let pool: Pool;

  test.before(async () => {
    client = await connect();
    await rebuildFromMigrations(client);
    pool = createPool();
  });

  test.after(async () => {
    await pool?.end();
    await client?.end();
  });

  async function newUser(email: string): Promise<string> {
    const { rows } = await client.query<{ id: string }>(
      'insert into auth.users (email) values ($1) returning id',
      [email],
    );
    await client.query(
      'insert into public.profiles (id, email) values ($1, $2) on conflict do nothing',
      [rows[0].id, email],
    );
    return rows[0].id;
  }

  async function call<T extends QueryResultRow = QueryResultRow>(
    userId: string | null,
    sql: string,
    params: unknown[] = [],
  ) {
    const db = await pool.connect();
    try {
      return await asIdentityCommitting(db, userId, () => db.query<T>(sql, params));
    } finally {
      db.release();
    }
  }

  const callFailing = (userId: string | null, sql: string, params: unknown[] = []) =>
    call(userId, sql, params).catch((error: Error) => error);

  function assertSqlState(error: unknown, expectedCode: string): asserts error is Error {
    assert.ok(error instanceof Error);
    assert.equal((error as { code?: string }).code, expectedCode);
  }

  async function targetCommunity(ownerId: string, name: string): Promise<string> {
    const { rows } = await call<{ id: string }>(
      ownerId,
      'select public.create_community_with_owner($1) as id',
      [name],
    );
    return rows[0].id;
  }

  async function activeMembership(
    communityId: string,
    userId: string,
    status: 'active' | 'suspended' = 'active',
  ): Promise<void> {
    await client.query(
      `insert into public.community_memberships (community_id, user_id, role, status)
       values ($1, $2, 'member', $3)
       on conflict (community_id, user_id)
       do update set status = excluded.status`,
      [communityId, userId, status],
    );
  }

  async function grantOrganizer(communityId: string, userId: string): Promise<void> {
    await client.query(
      `insert into public.community_responsibilities (community_id, user_id, responsibility)
       values ($1, $2, 'ORGANIZER')
       on conflict (community_id, user_id, responsibility)
       do update set revoked_at = null`,
      [communityId, userId],
    );
  }

  async function createTargetSession(
    actorId: string,
    input: {
      id?: string;
      communityId?: string | null;
      context?: 'QUICK' | 'COMMUNITY';
      name?: string;
    } = {},
  ): Promise<string> {
    const sessionId = input.id ?? randomUUID();
    const { rows } = await call<{ id: string }>(
      actorId,
      `select public.create_target_session(
         $1, $2, $3, 'FREE_PLAY', $4, null, null
       ) as id`,
      [
        sessionId,
        input.communityId ?? null,
        input.context ?? 'QUICK',
        input.name ?? 'Target roster Session',
      ],
    );
    assert.deepEqual(rows, [{ id: sessionId }]);
    return sessionId;
  }

  async function createPlayer(
    ownerId: string,
    input: {
      id?: string;
      localId?: string | null;
      name?: string;
      nickname?: string | null;
      userId?: string | null;
      active?: boolean;
      deletedAt?: string | null;
    } = {},
  ): Promise<string> {
    const id = input.id ?? randomUUID();
    await client.query(
      `insert into public.players (
         id, owner_id, local_id, name, nickname, user_id,
         has_account_identity_history, active, deleted_at
       )
       values ($1, $2, $3, $4, $5, $6::uuid, $6::uuid is not null, $7, $8::timestamptz)`,
      [
        id,
        ownerId,
        input.localId ?? null,
        input.name ?? 'Jogadora',
        input.nickname ?? null,
        input.userId ?? null,
        input.active ?? true,
        input.deletedAt ?? null,
      ],
    );
    return id;
  }

  // A COMMUNITY target Session, which is the only context allowed to own a Window.
  // create_target_session requires session.manage (an active ORGANIZER responsibility) for
  // the COMMUNITY context, which the plain Community owner does not hold automatically.
  async function communitySession(
    actorId: string,
    communityId: string,
    name = 'Registration Session',
  ): Promise<string> {
    await grantOrganizer(communityId, actorId);
    return createTargetSession(actorId, { communityId, context: 'COMMUNITY', name });
  }

  // Privileged direct insert. Windows have no command until XS-W4-02.
  async function insertWindow(input: {
    id?: string;
    sessionId: string;
    capacity?: number;
    status?: string;
    closesAt?: string | null;
  }): Promise<string> {
    const id = input.id ?? randomUUID();
    await client.query(
      `insert into public.registration_windows (id, session_id, status, capacity, closes_at)
       values ($1, $2, $3, $4, $5::timestamptz)`,
      [id, input.sessionId, input.status ?? 'DRAFT', input.capacity ?? 12, input.closesAt ?? null],
    );
    return id;
  }

  // Privileged direct insert. Entries have no command until XS-W4-02.
  async function insertEntry(input: {
    id?: string;
    registrationWindowId: string;
    playerId: string;
    status?: string;
    queueSequence?: number | null;
    source?: string;
    removalReason?: string | null;
  }): Promise<string> {
    const id = input.id ?? randomUUID();
    await client.query(
      `insert into public.registration_entries (
         id, registration_window_id, player_id, status, queue_sequence, source, removal_reason
       ) values ($1, $2, $3, $4, $5, $6, $7)`,
      [
        id,
        input.registrationWindowId,
        input.playerId,
        input.status ?? 'CONFIRMED',
        input.queueSequence ?? null,
        input.source ?? 'SELF_JOIN',
        input.removalReason ?? null,
      ],
    );
    return id;
  }

  // ── Step 2: literal columns ──────────────────────────────────────────────

  test('registration_windows and registration_entries expose the approved literal columns and nullability', async () => {
    const { rows } = await client.query<{
      table_name: string;
      column_name: string;
      udt_name: string;
      is_nullable: string;
    }>(
      `select table_name, column_name, udt_name, is_nullable
         from information_schema.columns
        where table_schema = 'public'
          and table_name in ('registration_windows', 'registration_entries')
        order by table_name, ordinal_position`,
    );
    assert.deepEqual(rows, [
      {
        table_name: 'registration_entries',
        column_name: 'id',
        udt_name: 'uuid',
        is_nullable: 'NO',
      },
      {
        table_name: 'registration_entries',
        column_name: 'registration_window_id',
        udt_name: 'uuid',
        is_nullable: 'NO',
      },
      {
        table_name: 'registration_entries',
        column_name: 'player_id',
        udt_name: 'uuid',
        is_nullable: 'NO',
      },
      {
        table_name: 'registration_entries',
        column_name: 'status',
        udt_name: 'text',
        is_nullable: 'NO',
      },
      {
        table_name: 'registration_entries',
        column_name: 'queue_sequence',
        udt_name: 'int8',
        is_nullable: 'YES',
      },
      {
        table_name: 'registration_entries',
        column_name: 'source',
        udt_name: 'text',
        is_nullable: 'NO',
      },
      {
        table_name: 'registration_entries',
        column_name: 'joined_at',
        udt_name: 'timestamptz',
        is_nullable: 'NO',
      },
      {
        table_name: 'registration_entries',
        column_name: 'status_changed_at',
        udt_name: 'timestamptz',
        is_nullable: 'NO',
      },
      {
        table_name: 'registration_entries',
        column_name: 'withdrawn_at',
        udt_name: 'timestamptz',
        is_nullable: 'YES',
      },
      {
        table_name: 'registration_entries',
        column_name: 'removed_at',
        udt_name: 'timestamptz',
        is_nullable: 'YES',
      },
      {
        table_name: 'registration_entries',
        column_name: 'removal_reason',
        udt_name: 'text',
        is_nullable: 'YES',
      },
      {
        table_name: 'registration_entries',
        column_name: 'created_by_user_id',
        udt_name: 'uuid',
        is_nullable: 'YES',
      },
      {
        table_name: 'registration_windows',
        column_name: 'id',
        udt_name: 'uuid',
        is_nullable: 'NO',
      },
      {
        table_name: 'registration_windows',
        column_name: 'session_id',
        udt_name: 'uuid',
        is_nullable: 'NO',
      },
      {
        table_name: 'registration_windows',
        column_name: 'status',
        udt_name: 'text',
        is_nullable: 'NO',
      },
      {
        table_name: 'registration_windows',
        column_name: 'capacity',
        udt_name: 'int4',
        is_nullable: 'NO',
      },
      {
        table_name: 'registration_windows',
        column_name: 'closes_at',
        udt_name: 'timestamptz',
        is_nullable: 'YES',
      },
      {
        table_name: 'registration_windows',
        column_name: 'revision',
        udt_name: 'int4',
        is_nullable: 'NO',
      },
      {
        table_name: 'registration_windows',
        column_name: 'next_queue_sequence',
        udt_name: 'int8',
        is_nullable: 'NO',
      },
      {
        table_name: 'registration_windows',
        column_name: 'opened_at',
        udt_name: 'timestamptz',
        is_nullable: 'YES',
      },
      {
        table_name: 'registration_windows',
        column_name: 'closed_at',
        udt_name: 'timestamptz',
        is_nullable: 'YES',
      },
      {
        table_name: 'registration_windows',
        column_name: 'locked_at',
        udt_name: 'timestamptz',
        is_nullable: 'YES',
      },
      {
        table_name: 'registration_windows',
        column_name: 'created_by_user_id',
        udt_name: 'uuid',
        is_nullable: 'YES',
      },
      {
        table_name: 'registration_windows',
        column_name: 'created_at',
        udt_name: 'timestamptz',
        is_nullable: 'NO',
      },
      {
        table_name: 'registration_windows',
        column_name: 'updated_at',
        udt_name: 'timestamptz',
        is_nullable: 'NO',
      },
    ]);
  });

  // ── Step 3: value-set and capacity checks ────────────────────────────────

  test('registration_windows rejects an unapproved status and a non-positive capacity with 23514', async () => {
    const organizer = await newUser('registration-window-checks@test.local');
    const community = await targetCommunity(organizer, 'Window checks');
    const sessionId = await communitySession(organizer, community);

    const invalidStatus = await insertWindow({ sessionId, status: 'OPENISH' }).catch(
      (error: Error) => error,
    );
    assertSqlState(invalidStatus, '23514');

    const zeroCapacity = await insertWindow({ sessionId, capacity: 0 }).catch(
      (error: Error) => error,
    );
    assertSqlState(zeroCapacity, '23514');

    const negativeCapacity = await insertWindow({ sessionId, capacity: -1 }).catch(
      (error: Error) => error,
    );
    assertSqlState(negativeCapacity, '23514');
  });

  test('registration_entries rejects unapproved status, source, a null queue_sequence while WAITLISTED, and a blank removal_reason', async () => {
    const organizer = await newUser('registration-entry-checks@test.local');
    const community = await targetCommunity(organizer, 'Entry checks');
    const sessionId = await communitySession(organizer, community);
    const windowId = await insertWindow({ sessionId });
    const playerId = await createPlayer(organizer);

    const invalidStatus = await insertEntry({
      registrationWindowId: windowId,
      playerId,
      status: 'PENDING',
    }).catch((error: Error) => error);
    assertSqlState(invalidStatus, '23514');

    const invalidSource = await insertEntry({
      registrationWindowId: windowId,
      playerId,
      source: 'ROBOT',
    }).catch((error: Error) => error);
    assertSqlState(invalidSource, '23514');

    const waitlistedWithoutSequence = await insertEntry({
      registrationWindowId: windowId,
      playerId,
      status: 'WAITLISTED',
      queueSequence: null,
    }).catch((error: Error) => error);
    assertSqlState(waitlistedWithoutSequence, '23514');

    const blankRemovalReason = await insertEntry({
      registrationWindowId: windowId,
      playerId,
      status: 'REMOVED',
      removalReason: '   ',
    }).catch((error: Error) => error);
    assertSqlState(blankRemovalReason, '23514');
  });

  test('a CONFIRMED entry is accepted both with a null queue_sequence and with a non-null one', async () => {
    const organizer = await newUser('registration-confirmed-asymmetry@test.local');
    const community = await targetCommunity(organizer, 'Confirmed asymmetry');
    const sessionId = await communitySession(organizer, community);
    const windowId = await insertWindow({ sessionId });
    const walkedInPlayer = await createPlayer(organizer, { name: 'Walked in' });
    const promotedPlayer = await createPlayer(organizer, { name: 'Promoted' });

    const walkedInId = await insertEntry({
      registrationWindowId: windowId,
      playerId: walkedInPlayer,
      status: 'CONFIRMED',
      queueSequence: null,
    });
    const promotedId = await insertEntry({
      registrationWindowId: windowId,
      playerId: promotedPlayer,
      status: 'CONFIRMED',
      queueSequence: 1,
    });

    const { rows } = await client.query<{
      id: string;
      status: string;
      queue_sequence: string | null;
    }>(
      `select id, status, queue_sequence from public.registration_entries
        where id in ($1, $2) order by id`,
      [walkedInId, promotedId].sort(),
    );
    assert.deepEqual(
      new Map(
        rows.map((row) => [row.id, { status: row.status, queue_sequence: row.queue_sequence }]),
      ),
      new Map([
        [walkedInId, { status: 'CONFIRMED', queue_sequence: null }],
        [promotedId, { status: 'CONFIRMED', queue_sequence: '1' }],
      ]),
    );
  });

  // ── Step 4: Session-context boundary ─────────────────────────────────────

  test('a Window is accepted only for a COMMUNITY target Session', async () => {
    const organizer = await newUser('registration-window-context@test.local');
    const community = await targetCommunity(organizer, 'Window context');

    const quickSessionId = await createTargetSession(organizer, { context: 'QUICK' });
    const rejectedQuick = await insertWindow({ sessionId: quickSessionId }).catch(
      (error: Error) => error,
    );
    assertSqlState(rejectedQuick, '23514');

    const legacy = await client.query<{ id: string }>(
      `insert into public.sessions (owner_id, name, date, status, type)
       values ($1, 'Legacy Session', '2030-01-01', 'draft', 'free_play') returning id`,
      [organizer],
    );
    const rejectedLegacy = await insertWindow({ sessionId: legacy.rows[0].id }).catch(
      (error: Error) => error,
    );
    assertSqlState(rejectedLegacy, '23514');

    const missingSession = await insertWindow({ sessionId: randomUUID() }).catch(
      (error: Error) => error,
    );
    assertSqlState(missingSession, '23503');

    const communitySessionId = await communitySession(organizer, community);
    await insertWindow({ sessionId: communitySessionId });
    const secondWindow = await insertWindow({ sessionId: communitySessionId }).catch(
      (error: Error) => error,
    );
    assertSqlState(secondWindow, '23505');
  });

  // ── Step 5: constraints ──────────────────────────────────────────────────

  test('a Player has at most one effective CONFIRMED or WAITLISTED entry per Window', async () => {
    const organizer = await newUser('registration-effective-unique@test.local');
    const community = await targetCommunity(organizer, 'Effective uniqueness');
    const sessionId = await communitySession(organizer, community);
    const windowId = await insertWindow({ sessionId });
    const playerId = await createPlayer(organizer);

    const firstConfirmed = await insertEntry({
      registrationWindowId: windowId,
      playerId,
      status: 'CONFIRMED',
    });

    const duplicateConfirmed = await insertEntry({
      registrationWindowId: windowId,
      playerId,
      status: 'CONFIRMED',
    }).catch((error: Error) => error);
    assertSqlState(duplicateConfirmed, '23505');

    const duplicateWaitlisted = await insertEntry({
      registrationWindowId: windowId,
      playerId,
      status: 'WAITLISTED',
      queueSequence: 1,
    }).catch((error: Error) => error);
    assertSqlState(duplicateWaitlisted, '23505');

    await client.query(
      `update public.registration_entries set status = 'WITHDRAWN', withdrawn_at = now()
        where id = $1`,
      [firstConfirmed],
    );
    const afterWithdrawal = await insertEntry({
      registrationWindowId: windowId,
      playerId,
      status: 'CONFIRMED',
    }).catch((error: Error) => error);
    assert.ok(
      typeof afterWithdrawal === 'string',
      'a new effective entry after WITHDRAWN must be accepted',
    );
  });

  test('queue_sequence is unique per Window but reused freely across Windows', async () => {
    const organizer = await newUser('registration-queue-sequence-unique@test.local');
    const community = await targetCommunity(organizer, 'Queue sequence uniqueness');
    const firstSessionId = await communitySession(organizer, community, 'First Window Session');
    const secondSessionId = await communitySession(organizer, community, 'Second Window Session');
    const firstWindow = await insertWindow({ sessionId: firstSessionId });
    const secondWindow = await insertWindow({ sessionId: secondSessionId });
    const firstPlayer = await createPlayer(organizer, { name: 'First' });
    const secondPlayer = await createPlayer(organizer, { name: 'Second' });
    const thirdPlayer = await createPlayer(organizer, { name: 'Third' });

    await insertEntry({
      registrationWindowId: firstWindow,
      playerId: firstPlayer,
      status: 'WAITLISTED',
      queueSequence: 1,
    });
    const duplicateInSameWindow = await insertEntry({
      registrationWindowId: firstWindow,
      playerId: secondPlayer,
      status: 'WAITLISTED',
      queueSequence: 1,
    }).catch((error: Error) => error);
    assertSqlState(duplicateInSameWindow, '23505');

    const sameSequenceOtherWindow = await insertEntry({
      registrationWindowId: secondWindow,
      playerId: thirdPlayer,
      status: 'WAITLISTED',
      queueSequence: 1,
    }).catch((error: Error) => error);
    assert.ok(
      typeof sameSequenceOtherWindow === 'string',
      'the same queue_sequence in a different Window must be accepted',
    );
  });

  test('foreign key delete actions on registration_windows and registration_entries match the approved shape', async () => {
    const { rows } = await client.query<{
      table_name: string;
      columns: string[];
      foreign_table: string;
      delete_action: string;
    }>(
      `select foreign_key.table_name,
              foreign_key.columns,
              foreign_key.foreign_table,
              foreign_key.delete_action
         from (
       select
         con.conrelid::regclass::text as table_name,
         array(
           select att.attname::text
             from unnest(con.conkey) with ordinality as key(attnum, ord)
             join pg_attribute att
               on att.attrelid = con.conrelid
              and att.attnum = key.attnum
            order by key.ord
         ) as columns,
         con.confrelid::regclass::text as foreign_table,
         case con.confdeltype
           when 'r' then 'RESTRICT'
           when 'n' then 'SET NULL'
           when 'a' then 'NO ACTION'
           when 'c' then 'CASCADE'
           else con.confdeltype::text
         end as delete_action
        from pg_constraint con
       where con.contype = 'f'
         and con.conrelid in (
           'public.registration_windows'::regclass,
           'public.registration_entries'::regclass
         )
         ) as foreign_key
       order by foreign_key.table_name, foreign_key.columns::text`,
    );
    assert.deepEqual(rows, [
      {
        table_name: 'registration_entries',
        columns: ['created_by_user_id'],
        foreign_table: 'auth.users',
        delete_action: 'SET NULL',
      },
      {
        table_name: 'registration_entries',
        columns: ['player_id'],
        foreign_table: 'players',
        delete_action: 'RESTRICT',
      },
      {
        table_name: 'registration_entries',
        columns: ['registration_window_id'],
        foreign_table: 'registration_windows',
        delete_action: 'RESTRICT',
      },
      {
        table_name: 'registration_windows',
        columns: ['created_by_user_id'],
        foreign_table: 'auth.users',
        delete_action: 'SET NULL',
      },
      {
        table_name: 'registration_windows',
        columns: ['session_id'],
        foreign_table: 'sessions',
        delete_action: 'RESTRICT',
      },
    ]);
  });

  test('every registration foreign key has a valid complete leading-column btree index', async () => {
    const { rows } = await client.query<{ table_name: string; constraint_name: string }>(
      `select con.conrelid::regclass::text as table_name, con.conname as constraint_name
         from pg_constraint con
        where con.contype = 'f'
          and con.conrelid in (
            'public.registration_windows'::regclass,
            'public.registration_entries'::regclass
          )
          and not exists (
            select 1
              from pg_index idx
              join pg_class index_class on index_class.oid = idx.indexrelid
              join pg_am access_method on access_method.oid = index_class.relam
             where idx.indrelid = con.conrelid
               and idx.indisvalid
               and idx.indisready
               and idx.indpred is null
               and access_method.amname = 'btree'
               and idx.indnkeyatts >= cardinality(con.conkey)
               and not exists (
                 select 1
                   from generate_subscripts(con.conkey, 1) position
                  where idx.indkey[position - 1] <> con.conkey[position]
               )
          )
        order by table_name, constraint_name`,
    );
    assert.deepEqual(rows, []);
  });

  test('a partial index backs the waitlist queue ordering per Window', async () => {
    const { rows } = await client.query<{ indexdef: string }>(
      `select indexdef from pg_indexes
        where schemaname = 'public' and tablename = 'registration_entries'
          and indexdef ilike '%(registration_window_id, queue_sequence)%'
          and indexdef ilike '%where%status = ''WAITLISTED''%'`,
    );
    assert.ok(
      rows.length >= 1,
      'expected a partial index on (registration_window_id, queue_sequence) where status = WAITLISTED',
    );
  });

  // ── Step 6: access boundary ───────────────────────────────────────────────

  test('anon and authenticated hold no privilege on registration_entries, and authenticated holds only SELECT on registration_windows', async () => {
    const { rows } = await client.query<{
      table_name: string;
      anon_select: boolean;
      authenticated_select: boolean;
      anon_insert: boolean;
      authenticated_insert: boolean;
      anon_update: boolean;
      authenticated_update: boolean;
      anon_delete: boolean;
      authenticated_delete: boolean;
    }>(
      `select c.relname as table_name,
              has_table_privilege('anon', c.oid, 'SELECT') as anon_select,
              has_table_privilege('authenticated', c.oid, 'SELECT') as authenticated_select,
              has_table_privilege('anon', c.oid, 'INSERT') as anon_insert,
              has_table_privilege('authenticated', c.oid, 'INSERT') as authenticated_insert,
              has_table_privilege('anon', c.oid, 'UPDATE') as anon_update,
              has_table_privilege('authenticated', c.oid, 'UPDATE') as authenticated_update,
              has_table_privilege('anon', c.oid, 'DELETE') as anon_delete,
              has_table_privilege('authenticated', c.oid, 'DELETE') as authenticated_delete
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relname in ('registration_windows', 'registration_entries')
        order by c.relname`,
    );
    assert.deepEqual(rows, [
      {
        table_name: 'registration_entries',
        anon_select: false,
        authenticated_select: false,
        anon_insert: false,
        authenticated_insert: false,
        anon_update: false,
        authenticated_update: false,
        anon_delete: false,
        authenticated_delete: false,
      },
      {
        table_name: 'registration_windows',
        anon_select: false,
        authenticated_select: true,
        anon_insert: false,
        authenticated_insert: false,
        anon_update: false,
        authenticated_update: false,
        anon_delete: false,
        authenticated_delete: false,
      },
    ]);
  });

  test('row level security is enabled on registration_windows and registration_entries', async () => {
    const { rows } = await client.query<{ relname: string; relrowsecurity: boolean }>(
      `select relname, relrowsecurity from pg_class
        where oid in (
          'public.registration_windows'::regclass,
          'public.registration_entries'::regclass
        )
        order by relname`,
    );
    assert.deepEqual(rows, [
      { relname: 'registration_entries', relrowsecurity: true },
      { relname: 'registration_windows', relrowsecurity: true },
    ]);
  });

  test('an authenticated Community member can select the Window while an outsider selects zero rows (QA-INV-005)', async () => {
    const owner = await newUser('registration-visibility-owner@test.local');
    const member = await newUser('registration-visibility-member@test.local');
    const outsider = await newUser('registration-visibility-outsider@test.local');
    const community = await targetCommunity(owner, 'Visibility');
    await activeMembership(community, member);
    const sessionId = await communitySession(owner, community);
    const windowId = await insertWindow({ sessionId });

    const memberRead = await call<{ id: string }>(
      member,
      'select id from public.registration_windows where id = $1',
      [windowId],
    );
    assert.deepEqual(memberRead.rows, [{ id: windowId }]);

    const outsiderRead = await call<{ id: string }>(
      outsider,
      'select id from public.registration_windows where id = $1',
      [windowId],
    );
    assert.deepEqual(outsiderRead.rows, []);
  });

  test('an authenticated caller cannot insert, update or delete registration_windows or registration_entries directly', async () => {
    const organizer = await newUser('registration-direct-write@test.local');
    const mutations = [
      'insert into public.registration_windows default values',
      'update public.registration_windows set status = status where false',
      'delete from public.registration_windows where false',
      'insert into public.registration_entries default values',
      'update public.registration_entries set status = status where false',
      'delete from public.registration_entries where false',
    ];
    for (const sql of mutations) {
      const rejected = await callFailing(organizer, sql);
      assertSqlState(rejected, '42501');
    }
  });

  test('BOLA: a member of one Community cannot select a second Community real Window by id (QA-INV-006)', async () => {
    const firstOwner = await newUser('registration-bola-first-owner@test.local');
    const firstMember = await newUser('registration-bola-first-member@test.local');
    const secondOwner = await newUser('registration-bola-second-owner@test.local');
    const firstCommunity = await targetCommunity(firstOwner, 'BOLA first Community');
    await activeMembership(firstCommunity, firstMember);
    await communitySession(firstOwner, firstCommunity, 'First Community Session');

    const secondCommunity = await targetCommunity(secondOwner, 'BOLA second Community');
    const secondSessionId = await communitySession(
      secondOwner,
      secondCommunity,
      'Second Community Session',
    );
    const secondWindowId = await insertWindow({ sessionId: secondSessionId });

    const crossCommunityRead = await call<{ id: string }>(
      firstMember,
      'select id from public.registration_windows where id = $1',
      [secondWindowId],
    );
    assert.deepEqual(
      crossCommunityRead.rows,
      [],
      'a member of the first Community must not see a real Window belonging to the second',
    );
  });
}
