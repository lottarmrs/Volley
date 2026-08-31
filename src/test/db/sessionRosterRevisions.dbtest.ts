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

type ParticipantPayload =
  | {
      participant_id: string;
      identity_kind: 'PLAYER';
      player_id: string;
    }
  | {
      participant_id: string;
      identity_kind: 'GUEST';
      display_name: string;
    };

interface RosterCommandRow extends QueryResultRow {
  roster_revision_id: string;
  roster_revision_number: number;
  session_revision: number;
}

interface RosterReadRow extends QueryResultRow {
  roster_revision_id: string;
  session_id: string;
  roster_revision_number: number;
  source_kind: string;
  source_session_revision: number | null;
  source_registration_revision: string | null;
  source_payload_hash: string | null;
  created_by_user_id: string | null;
  created_at: string;
  entries: Array<{
    participant_id: string;
    identity_kind: string;
    player_id: string | null;
    display_name_at_time: string;
  }>;
}

if (!isTestDatabaseConfigured()) {
  test(`session roster revisions require ${TEST_DATABASE_URL_VAR}`, () => {
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

  async function relateCommunityPlayer(
    communityId: string,
    playerId: string,
    ownerId: string,
    status: 'active' | 'inactive' = 'active',
  ): Promise<void> {
    await client.query(
      `insert into public.community_players (
         community_id, player_id, owner_id, active, status
       ) values ($1, $2, $3, $4, $5)`,
      [communityId, playerId, ownerId, status === 'active', status],
    );
  }

  async function replaceQuickRoster(
    actorId: string | null,
    input: {
      revisionId?: string | null;
      sessionId?: string | null;
      expectedRevision?: number | null;
      participants?: unknown;
    },
  ) {
    const participants = input.participants === undefined ? [] : input.participants;
    return call<RosterCommandRow>(
      actorId,
      `select * from public.replace_target_quick_session_roster(
         $1, $2, $3, $4::jsonb
       )`,
      [
        input.revisionId === undefined ? randomUUID() : input.revisionId,
        input.sessionId === undefined ? randomUUID() : input.sessionId,
        input.expectedRevision === undefined ? 1 : input.expectedRevision,
        participants === null ? null : JSON.stringify(participants),
      ],
    );
  }

  async function readRoster(actorId: string | null, revisionId: string | null) {
    return call<RosterReadRow>(actorId, 'select * from public.read_target_roster_revision($1)', [
      revisionId,
    ]);
  }

  async function seedRevision(input: {
    revisionId?: string;
    sessionId: string;
    participantId: string;
    identityKind: 'PLAYER' | 'GUEST';
    playerId?: string | null;
    displayName: string;
    actorId?: string | null;
    revisionNumber?: number;
  }): Promise<string> {
    const revisionId = input.revisionId ?? randomUUID();
    await client.query(
      `insert into public.session_participants (
         id, session_id, identity_kind, player_id, source_kind, display_name,
         participation_status, created_by_user_id
       ) values ($1, $2, $3, $4, 'QUICK_DIRECT', $5, 'INCLUDED', $6)`,
      [
        input.participantId,
        input.sessionId,
        input.identityKind,
        input.playerId ?? null,
        input.displayName,
        input.actorId ?? null,
      ],
    );
    await client.query(
      `insert into public.roster_revisions (
         id, session_id, revision_number, source_kind, source_session_revision,
         created_by_user_id
       ) values ($1, $2, $3, 'QUICK_DIRECT', 1, $4)`,
      [revisionId, input.sessionId, input.revisionNumber ?? 1, input.actorId ?? null],
    );
    await client.query(
      `insert into public.roster_revision_entries (
         roster_revision_id, session_id, participant_id, entry_order,
         identity_kind, player_id, display_name_at_time
       ) values ($1, $2, $3, 0, $4, $5, $6)`,
      [
        revisionId,
        input.sessionId,
        input.participantId,
        input.identityKind,
        input.playerId ?? null,
        input.displayName,
      ],
    );
    return revisionId;
  }

  test('the normalized roster tables expose the approved literal columns and nullability', async () => {
    const { rows } = await client.query<{
      table_name: string;
      column_name: string;
      udt_name: string;
      is_nullable: string;
    }>(
      `select table_name, column_name, udt_name, is_nullable
         from information_schema.columns
        where table_schema = 'public'
          and table_name in (
            'session_participants',
            'roster_revisions',
            'roster_revision_entries'
          )
          and table_name in (
            'public.session_participants'::regclass::text,
            'public.roster_revisions'::regclass::text,
            'public.roster_revision_entries'::regclass::text
          )
        order by table_name, ordinal_position`,
    );
    assert.deepEqual(rows, [
      {
        table_name: 'roster_revision_entries',
        column_name: 'roster_revision_id',
        udt_name: 'uuid',
        is_nullable: 'NO',
      },
      {
        table_name: 'roster_revision_entries',
        column_name: 'session_id',
        udt_name: 'uuid',
        is_nullable: 'NO',
      },
      {
        table_name: 'roster_revision_entries',
        column_name: 'participant_id',
        udt_name: 'uuid',
        is_nullable: 'NO',
      },
      {
        table_name: 'roster_revision_entries',
        column_name: 'entry_order',
        udt_name: 'int4',
        is_nullable: 'NO',
      },
      {
        table_name: 'roster_revision_entries',
        column_name: 'identity_kind',
        udt_name: 'text',
        is_nullable: 'NO',
      },
      {
        table_name: 'roster_revision_entries',
        column_name: 'player_id',
        udt_name: 'uuid',
        is_nullable: 'YES',
      },
      {
        table_name: 'roster_revision_entries',
        column_name: 'display_name_at_time',
        udt_name: 'text',
        is_nullable: 'NO',
      },
      {
        table_name: 'roster_revisions',
        column_name: 'id',
        udt_name: 'uuid',
        is_nullable: 'NO',
      },
      {
        table_name: 'roster_revisions',
        column_name: 'session_id',
        udt_name: 'uuid',
        is_nullable: 'NO',
      },
      {
        table_name: 'roster_revisions',
        column_name: 'revision_number',
        udt_name: 'int4',
        is_nullable: 'NO',
      },
      {
        table_name: 'roster_revisions',
        column_name: 'source_kind',
        udt_name: 'text',
        is_nullable: 'NO',
      },
      {
        table_name: 'roster_revisions',
        column_name: 'source_session_revision',
        udt_name: 'int4',
        is_nullable: 'YES',
      },
      {
        table_name: 'roster_revisions',
        column_name: 'source_registration_revision',
        udt_name: 'int8',
        is_nullable: 'YES',
      },
      {
        table_name: 'roster_revisions',
        column_name: 'source_payload_hash',
        udt_name: 'text',
        is_nullable: 'YES',
      },
      {
        table_name: 'roster_revisions',
        column_name: 'created_by_user_id',
        udt_name: 'uuid',
        is_nullable: 'YES',
      },
      {
        table_name: 'roster_revisions',
        column_name: 'created_at',
        udt_name: 'timestamptz',
        is_nullable: 'NO',
      },
      {
        table_name: 'session_participants',
        column_name: 'id',
        udt_name: 'uuid',
        is_nullable: 'NO',
      },
      {
        table_name: 'session_participants',
        column_name: 'session_id',
        udt_name: 'uuid',
        is_nullable: 'NO',
      },
      {
        table_name: 'session_participants',
        column_name: 'identity_kind',
        udt_name: 'text',
        is_nullable: 'NO',
      },
      {
        table_name: 'session_participants',
        column_name: 'player_id',
        udt_name: 'uuid',
        is_nullable: 'YES',
      },
      {
        table_name: 'session_participants',
        column_name: 'source_kind',
        udt_name: 'text',
        is_nullable: 'NO',
      },
      {
        table_name: 'session_participants',
        column_name: 'display_name',
        udt_name: 'text',
        is_nullable: 'NO',
      },
      {
        table_name: 'session_participants',
        column_name: 'participation_status',
        udt_name: 'text',
        is_nullable: 'NO',
      },
      {
        table_name: 'session_participants',
        column_name: 'created_by_user_id',
        udt_name: 'uuid',
        is_nullable: 'YES',
      },
      {
        table_name: 'session_participants',
        column_name: 'created_at',
        udt_name: 'timestamptz',
        is_nullable: 'NO',
      },
      {
        table_name: 'session_participants',
        column_name: 'updated_at',
        udt_name: 'timestamptz',
        is_nullable: 'NO',
      },
    ]);
  });

  test('roster checks reject invalid truth classes, ordering, numbering, source shapes, and blank snapshots', async () => {
    const organizer = await newUser('roster-checks@test.local');
    const sessionId = await createTargetSession(organizer);
    const playerId = await createPlayer(organizer);
    const guestId = randomUUID();
    const revisionId = randomUUID();

    const statements: Array<{ sql: string; params: unknown[] }> = [
      {
        sql: `insert into public.session_participants (
                id, session_id, identity_kind, player_id, source_kind,
                display_name, participation_status
              ) values ($1, $2, 'GUEST', $3, 'QUICK_DIRECT', 'Ana', 'INCLUDED')`,
        params: [randomUUID(), sessionId, playerId],
      },
      {
        sql: `insert into public.session_participants (
                id, session_id, identity_kind, source_kind,
                display_name, participation_status
              ) values ($1, $2, 'ROBOT', 'QUICK_DIRECT', 'Ana', 'INCLUDED')`,
        params: [randomUUID(), sessionId],
      },
      {
        sql: `insert into public.session_participants (
                id, session_id, identity_kind, source_kind,
                display_name, participation_status
              ) values ($1, $2, 'GUEST', 'MANUAL', 'Ana', 'INCLUDED')`,
        params: [randomUUID(), sessionId],
      },
      {
        sql: `insert into public.session_participants (
                id, session_id, identity_kind, source_kind,
                display_name, participation_status
              ) values ($1, $2, 'GUEST', 'QUICK_DIRECT', 'Ana', 'WAITING')`,
        params: [randomUUID(), sessionId],
      },
      {
        sql: `insert into public.roster_revisions (
                id, session_id, revision_number, source_kind, source_session_revision
              ) values ($1, $2, 0, 'QUICK_DIRECT', 1)`,
        params: [randomUUID(), sessionId],
      },
      {
        sql: `insert into public.roster_revisions (
                id, session_id, revision_number, source_kind
              ) values ($1, $2, 1, 'MANUAL')`,
        params: [randomUUID(), sessionId],
      },
      {
        sql: `insert into public.roster_revisions (
                id, session_id, revision_number, source_kind,
                source_session_revision, source_registration_revision
              ) values ($1, $2, 1, 'QUICK_DIRECT', 1, 9)`,
        params: [randomUUID(), sessionId],
      },
      {
        sql: `insert into public.roster_revisions (
                id, session_id, revision_number, source_kind,
                source_registration_revision, source_payload_hash
              ) values ($1, $2, 1, 'LEGACY_SELECTED_ROSTER', 9, 'legacy-hash')`,
        params: [randomUUID(), sessionId],
      },
    ];

    for (const statement of statements) {
      const error = await client
        .query(statement.sql, statement.params)
        .catch((queryError: Error) => queryError);
      assertSqlState(error, '23514');
    }

    await client.query(
      `insert into public.session_participants (
         id, session_id, identity_kind, source_kind, display_name, participation_status
       ) values ($1, $2, 'GUEST', 'QUICK_DIRECT', 'Ana', 'INCLUDED')`,
      [guestId, sessionId],
    );
    await client.query(
      `insert into public.roster_revisions (
         id, session_id, revision_number, source_kind, source_session_revision
       ) values ($1, $2, 1, 'QUICK_DIRECT', 1)`,
      [revisionId, sessionId],
    );

    for (const [entryOrder, displayName, identityKind, entryPlayerId] of [
      [-1, 'Ana', 'GUEST', null],
      [0, '   ', 'GUEST', null],
      [0, 'Ana', 'ROBOT', null],
      [0, 'Ana', 'GUEST', playerId],
    ] as const) {
      const error = await client
        .query(
          `insert into public.roster_revision_entries (
             roster_revision_id, session_id, participant_id, entry_order,
             identity_kind, player_id, display_name_at_time
           ) values ($1, $2, $3, $4, $5, $6, $7)`,
          [revisionId, sessionId, guestId, entryOrder, identityKind, entryPlayerId, displayName],
        )
        .catch((queryError: Error) => queryError);
      assertSqlState(error, '23514');
    }
  });

  test('a linked Player is unique per Session while equal Guest display names remain distinct', async () => {
    const organizer = await newUser('roster-uniqueness@test.local');
    const sessionId = await createTargetSession(organizer);
    const playerId = await createPlayer(organizer);

    await client.query(
      `insert into public.session_participants (
         id, session_id, identity_kind, player_id, source_kind,
         display_name, participation_status
       ) values
         ($1, $4, 'PLAYER', $5, 'QUICK_DIRECT', 'Bia', 'INCLUDED'),
         ($2, $4, 'GUEST', null, 'QUICK_DIRECT', 'Ana', 'INCLUDED'),
         ($3, $4, 'GUEST', null, 'QUICK_DIRECT', 'Ana', 'INCLUDED')`,
      [randomUUID(), randomUUID(), randomUUID(), sessionId, playerId],
    );
    const duplicatePlayer = await client
      .query(
        `insert into public.session_participants (
           id, session_id, identity_kind, player_id, source_kind,
           display_name, participation_status
         ) values ($1, $2, 'PLAYER', $3, 'QUICK_DIRECT', 'Bia outra vez', 'INCLUDED')`,
        [randomUUID(), sessionId, playerId],
      )
      .catch((error: Error) => error);

    assertSqlState(duplicatePlayer, '23505');
    const { rows } = await client.query<{ display_name: string }>(
      `select display_name from public.session_participants
        where session_id = $1 and identity_kind = 'GUEST'
        order by id`,
      [sessionId],
    );
    assert.deepEqual(rows, [{ display_name: 'Ana' }, { display_name: 'Ana' }]);
  });

  test('a Session accepts only one legacy selected-roster revision', async () => {
    const organizer = await newUser('roster-legacy-unique@test.local');
    const sessionId = await createTargetSession(organizer);
    await client.query(
      `insert into public.roster_revisions (
         id, session_id, revision_number, source_kind, source_payload_hash
       ) values ($1, $2, 1, 'LEGACY_SELECTED_ROSTER', 'first-hash')`,
      [randomUUID(), sessionId],
    );
    const duplicateLegacy = await client
      .query(
        `insert into public.roster_revisions (
           id, session_id, revision_number, source_kind, source_payload_hash
         ) values ($1, $2, 2, 'LEGACY_SELECTED_ROSTER', 'second-hash')`,
        [randomUUID(), sessionId],
      )
      .catch((error: Error) => error);
    assertSqlState(duplicateLegacy, '23505');
  });

  test('revision numbers and entry order and participant identity are unique inside their aggregate', async () => {
    const organizer = await newUser('roster-aggregate-unique@test.local');
    const sessionId = await createTargetSession(organizer);
    const firstParticipant = randomUUID();
    const secondParticipant = randomUUID();
    const revisionId = randomUUID();
    await client.query(
      `insert into public.session_participants (
         id, session_id, identity_kind, source_kind, display_name, participation_status
       ) values
         ($1, $3, 'GUEST', 'QUICK_DIRECT', 'Ana', 'INCLUDED'),
         ($2, $3, 'GUEST', 'QUICK_DIRECT', 'Bia', 'INCLUDED')`,
      [firstParticipant, secondParticipant, sessionId],
    );
    await client.query(
      `insert into public.roster_revisions (
         id, session_id, revision_number, source_kind, source_session_revision
       ) values ($1, $2, 1, 'QUICK_DIRECT', 1)`,
      [revisionId, sessionId],
    );
    const duplicateRevisionNumber = await client
      .query(
        `insert into public.roster_revisions (
           id, session_id, revision_number, source_kind, source_session_revision
         ) values ($1, $2, 1, 'QUICK_DIRECT', 1)`,
        [randomUUID(), sessionId],
      )
      .catch((error: Error) => error);
    assertSqlState(duplicateRevisionNumber, '23505');

    await client.query(
      `insert into public.roster_revision_entries (
         roster_revision_id, session_id, participant_id, entry_order,
         identity_kind, display_name_at_time
       ) values ($1, $2, $3, 0, 'GUEST', 'Ana')`,
      [revisionId, sessionId, firstParticipant],
    );
    const duplicateEntryOrder = await client
      .query(
        `insert into public.roster_revision_entries (
           roster_revision_id, session_id, participant_id, entry_order,
           identity_kind, display_name_at_time
         ) values ($1, $2, $3, 0, 'GUEST', 'Bia')`,
        [revisionId, sessionId, secondParticipant],
      )
      .catch((error: Error) => error);
    const duplicateEntryParticipant = await client
      .query(
        `insert into public.roster_revision_entries (
           roster_revision_id, session_id, participant_id, entry_order,
           identity_kind, display_name_at_time
         ) values ($1, $2, $3, 1, 'GUEST', 'Ana')`,
        [revisionId, sessionId, firstParticipant],
      )
      .catch((error: Error) => error);
    assertSqlState(duplicateEntryOrder, '23505');
    assertSqlState(duplicateEntryParticipant, '23505');
  });

  test('both composite foreign keys prevent revision entries from crossing Session aggregates', async () => {
    const organizer = await newUser('roster-composite-fk@test.local');
    const firstSession = await createTargetSession(organizer, { name: 'First aggregate' });
    const secondSession = await createTargetSession(organizer, { name: 'Second aggregate' });
    const participantId = randomUUID();
    const revisionId = randomUUID();
    await client.query(
      `insert into public.session_participants (
         id, session_id, identity_kind, source_kind, display_name, participation_status
       ) values ($1, $2, 'GUEST', 'QUICK_DIRECT', 'Ana', 'INCLUDED')`,
      [participantId, secondSession],
    );
    await client.query(
      `insert into public.roster_revisions (
         id, session_id, revision_number, source_kind, source_session_revision
       ) values ($1, $2, 1, 'QUICK_DIRECT', 1)`,
      [revisionId, firstSession],
    );

    const crossedParticipant = await client
      .query(
        `insert into public.roster_revision_entries (
           roster_revision_id, session_id, participant_id, entry_order,
           identity_kind, display_name_at_time
         ) values ($1, $2, $3, 0, 'GUEST', 'Ana')`,
        [revisionId, firstSession, participantId],
      )
      .catch((error: Error) => error);
    const crossedRevision = await client
      .query(
        `insert into public.roster_revision_entries (
           roster_revision_id, session_id, participant_id, entry_order,
           identity_kind, display_name_at_time
         ) values ($1, $2, $3, 0, 'GUEST', 'Ana')`,
        [revisionId, secondSession, participantId],
      )
      .catch((error: Error) => error);
    assertSqlState(crossedParticipant, '23503');
    assertSqlState(crossedRevision, '23503');
  });

  test('Session, Player, and actor foreign keys use the approved deletion actions', async () => {
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
           'public.session_participants'::regclass,
           'public.roster_revisions'::regclass,
           'public.roster_revision_entries'::regclass
         )
         and con.confrelid in (
           'public.sessions'::regclass,
           'public.players'::regclass,
           'auth.users'::regclass
         )
         ) as foreign_key
       order by foreign_key.table_name, foreign_key.columns::text`,
    );
    assert.deepEqual(rows, [
      {
        table_name: 'roster_revision_entries',
        columns: ['player_id'],
        foreign_table: 'players',
        delete_action: 'SET NULL',
      },
      {
        table_name: 'roster_revisions',
        columns: ['created_by_user_id'],
        foreign_table: 'auth.users',
        delete_action: 'SET NULL',
      },
      {
        table_name: 'roster_revisions',
        columns: ['session_id'],
        foreign_table: 'sessions',
        delete_action: 'RESTRICT',
      },
      {
        table_name: 'session_participants',
        columns: ['created_by_user_id'],
        foreign_table: 'auth.users',
        delete_action: 'SET NULL',
      },
      {
        table_name: 'session_participants',
        columns: ['player_id'],
        foreign_table: 'players',
        delete_action: 'SET NULL',
      },
      {
        table_name: 'session_participants',
        columns: ['session_id'],
        foreign_table: 'sessions',
        delete_action: 'RESTRICT',
      },
    ]);
  });

  test('every roster foreign key has a valid complete leading-column btree index', async () => {
    const { rows } = await client.query<{ table_name: string; constraint_name: string }>(
      `select con.conrelid::regclass::text as table_name, con.conname as constraint_name
         from pg_constraint con
        where con.contype = 'f'
          and con.conrelid in (
            'public.session_participants'::regclass,
            'public.roster_revisions'::regclass,
            'public.roster_revision_entries'::regclass
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

  test('privileged writes cannot update or delete immutable revisions or entries', async () => {
    const organizer = await newUser('roster-immutability@test.local');
    const sessionId = await createTargetSession(organizer);
    const participantId = randomUUID();
    const revisionId = await seedRevision({
      sessionId,
      participantId,
      identityKind: 'GUEST',
      displayName: 'Ana',
      actorId: organizer,
    });

    const mutations = [
      {
        sql: `update public.roster_revisions
                 set source_payload_hash = 'tampered'
               where id = $1`,
        params: [revisionId],
      },
      {
        sql: 'delete from public.roster_revisions where id = $1',
        params: [revisionId],
      },
      {
        sql: `update public.roster_revision_entries
                 set display_name_at_time = 'Tampered'
               where roster_revision_id = $1`,
        params: [revisionId],
      },
      {
        sql: 'delete from public.roster_revision_entries where roster_revision_id = $1',
        params: [revisionId],
      },
    ];
    for (const mutation of mutations) {
      const error = await client
        .query(mutation.sql, mutation.params)
        .catch((queryError: Error) => queryError);
      assertSqlState(error, '55000');
    }
  });

  test('deleting a Player nulls current and snapshot references without erasing identity evidence', async () => {
    const organizer = await newUser('roster-player-delete@test.local');
    const sessionId = await createTargetSession(organizer);
    const playerId = await createPlayer(organizer, {
      name: 'Beatriz',
      nickname: 'Bia',
    });
    const participantId = randomUUID();
    const revisionId = await seedRevision({
      sessionId,
      participantId,
      identityKind: 'PLAYER',
      playerId,
      displayName: 'Bia',
      actorId: organizer,
    });

    await client.query('delete from public.players where id = $1', [playerId]);

    const participant = await client.query<{
      identity_kind: string;
      player_id: string | null;
      display_name: string;
    }>(
      `select identity_kind, player_id, display_name
         from public.session_participants where id = $1`,
      [participantId],
    );
    const entry = await client.query<{
      identity_kind: string;
      player_id: string | null;
      display_name_at_time: string;
    }>(
      `select identity_kind, player_id, display_name_at_time
         from public.roster_revision_entries where roster_revision_id = $1`,
      [revisionId],
    );
    assert.deepEqual(participant.rows, [
      { identity_kind: 'PLAYER', player_id: null, display_name: 'Bia' },
    ]);
    assert.deepEqual(entry.rows, [
      { identity_kind: 'PLAYER', player_id: null, display_name_at_time: 'Bia' },
    ]);
  });

  test('Quick replacement creates linked and same-name Guest participants in payload order', async () => {
    const organizer = await newUser('roster-quick-happy@test.local');
    const sessionId = await createTargetSession(organizer);
    const playerId = await createPlayer(organizer, {
      name: ' Natália ',
      nickname: ' Nani ',
    });
    const revisionId = randomUUID();
    const playerParticipantId = randomUUID();
    const guestOneId = randomUUID();
    const guestTwoId = randomUUID();
    const participants: ParticipantPayload[] = [
      {
        participant_id: playerParticipantId,
        identity_kind: 'PLAYER',
        player_id: playerId,
      },
      { participant_id: guestOneId, identity_kind: 'GUEST', display_name: ' Ana ' },
      { participant_id: guestTwoId, identity_kind: 'GUEST', display_name: 'Ana' },
    ];

    const result = await replaceQuickRoster(organizer, {
      revisionId,
      sessionId,
      expectedRevision: 1,
      participants,
    });
    assert.deepEqual(result.rows, [
      {
        roster_revision_id: revisionId,
        roster_revision_number: 1,
        session_revision: 2,
      },
    ]);
    const revision = await client.query<{
      source_kind: string;
      source_session_revision: number;
      created_by_user_id: string;
    }>(
      `select source_kind, source_session_revision, created_by_user_id
         from public.roster_revisions where id = $1`,
      [revisionId],
    );
    assert.deepEqual(revision.rows, [
      {
        source_kind: 'QUICK_DIRECT',
        source_session_revision: 1,
        created_by_user_id: organizer,
      },
    ]);
    const current = await client.query<{
      id: string;
      identity_kind: string;
      player_id: string | null;
      display_name: string;
      participation_status: string;
      source_kind: string;
    }>(
      `select id, identity_kind, player_id, display_name, participation_status, source_kind
         from public.session_participants where session_id = $1 order by id`,
      [sessionId],
    );
    assert.deepEqual(
      new Map(current.rows.map((row) => [row.id, row])),
      new Map([
        [
          playerParticipantId,
          {
            id: playerParticipantId,
            identity_kind: 'PLAYER',
            player_id: playerId,
            display_name: 'Nani',
            participation_status: 'INCLUDED',
            source_kind: 'QUICK_DIRECT',
          },
        ],
        [
          guestOneId,
          {
            id: guestOneId,
            identity_kind: 'GUEST',
            player_id: null,
            display_name: 'Ana',
            participation_status: 'INCLUDED',
            source_kind: 'QUICK_DIRECT',
          },
        ],
        [
          guestTwoId,
          {
            id: guestTwoId,
            identity_kind: 'GUEST',
            player_id: null,
            display_name: 'Ana',
            participation_status: 'INCLUDED',
            source_kind: 'QUICK_DIRECT',
          },
        ],
      ]),
    );
    const entries = await client.query<{
      participant_id: string;
      entry_order: number;
      identity_kind: string;
      player_id: string | null;
      display_name_at_time: string;
    }>(
      `select participant_id, entry_order, identity_kind, player_id, display_name_at_time
         from public.roster_revision_entries
        where roster_revision_id = $1 order by entry_order`,
      [revisionId],
    );
    assert.deepEqual(entries.rows, [
      {
        participant_id: playerParticipantId,
        entry_order: 0,
        identity_kind: 'PLAYER',
        player_id: playerId,
        display_name_at_time: 'Nani',
      },
      {
        participant_id: guestOneId,
        entry_order: 1,
        identity_kind: 'GUEST',
        player_id: null,
        display_name_at_time: 'Ana',
      },
      {
        participant_id: guestTwoId,
        entry_order: 2,
        identity_kind: 'GUEST',
        player_id: null,
        display_name_at_time: 'Ana',
      },
    ]);
  });

  test('a published scheduled Quick Session still accepts a pre-start roster replacement', async () => {
    const organizer = await newUser('roster-scheduled-published@test.local');
    const sessionId = await createTargetSession(organizer);
    await client.query(
      `update public.sessions
          set lifecycle_status = 'SCHEDULED',
              publication_state = 'PUBLISHED',
              status = 'draft'
        where id = $1`,
      [sessionId],
    );
    const revisionId = randomUUID();
    const result = await replaceQuickRoster(organizer, {
      revisionId,
      sessionId,
      expectedRevision: 1,
      participants: [
        {
          participant_id: randomUUID(),
          identity_kind: 'GUEST',
          display_name: 'Ana',
        },
      ],
    });
    assert.deepEqual(result.rows, [
      {
        roster_revision_id: revisionId,
        roster_revision_number: 1,
        session_revision: 2,
      },
    ]);
    const session = await client.query<{
      lifecycle_status: string;
      publication_state: string;
      revision: number;
    }>(
      `select lifecycle_status, publication_state, revision
         from public.sessions where id = $1`,
      [sessionId],
    );
    assert.deepEqual(session.rows, [
      {
        lifecycle_status: 'SCHEDULED',
        publication_state: 'PUBLISHED',
        revision: 2,
      },
    ]);
  });

  test('empty replacement removes omitted participants and later Guest replacement reactivates identity without rewriting history', async () => {
    const organizer = await newUser('roster-guest-revision@test.local');
    const sessionId = await createTargetSession(organizer);
    const participantId = randomUUID();
    const firstRevision = randomUUID();
    const emptyRevision = randomUUID();
    const reactivatedRevision = randomUUID();

    await replaceQuickRoster(organizer, {
      revisionId: firstRevision,
      sessionId,
      expectedRevision: 1,
      participants: [
        { participant_id: participantId, identity_kind: 'GUEST', display_name: 'Ana' },
      ],
    });
    const empty = await replaceQuickRoster(organizer, {
      revisionId: emptyRevision,
      sessionId,
      expectedRevision: 2,
      participants: [],
    });
    assert.deepEqual(empty.rows, [
      {
        roster_revision_id: emptyRevision,
        roster_revision_number: 2,
        session_revision: 3,
      },
    ]);
    assert.deepEqual(
      (
        await client.query(
          'select participation_status from public.session_participants where id = $1',
          [participantId],
        )
      ).rows,
      [{ participation_status: 'REMOVED' }],
    );

    await replaceQuickRoster(organizer, {
      revisionId: reactivatedRevision,
      sessionId,
      expectedRevision: 3,
      participants: [
        { participant_id: participantId, identity_kind: 'GUEST', display_name: 'Ana Paula' },
      ],
    });
    const current = await client.query<{
      id: string;
      display_name: string;
      participation_status: string;
    }>(
      `select id, display_name, participation_status
         from public.session_participants where session_id = $1`,
      [sessionId],
    );
    assert.deepEqual(current.rows, [
      {
        id: participantId,
        display_name: 'Ana Paula',
        participation_status: 'INCLUDED',
      },
    ]);
    const history = await client.query<{
      roster_revision_id: string;
      display_name_at_time: string;
    }>(
      `select roster_revision_id, display_name_at_time
         from public.roster_revision_entries
        where roster_revision_id in ($1, $2)
        order by roster_revision_id`,
      [firstRevision, reactivatedRevision],
    );
    assert.deepEqual(
      new Map(history.rows.map((row) => [row.roster_revision_id, row.display_name_at_time])),
      new Map([
        [firstRevision, 'Ana'],
        [reactivatedRevision, 'Ana Paula'],
      ]),
    );
    const emptyEntries = await client.query(
      'select 1 from public.roster_revision_entries where roster_revision_id = $1',
      [emptyRevision],
    );
    assert.equal(emptyEntries.rowCount, 0);
  });

  test('a later Player rename changes only current state and the new immutable snapshot', async () => {
    const organizer = await newUser('roster-player-rename@test.local');
    const sessionId = await createTargetSession(organizer);
    const playerId = await createPlayer(organizer, { name: 'Beatriz', nickname: 'Bia' });
    const participantId = randomUUID();
    const firstRevision = randomUUID();
    const secondRevision = randomUUID();
    const payload: ParticipantPayload[] = [
      { participant_id: participantId, identity_kind: 'PLAYER', player_id: playerId },
    ];
    await replaceQuickRoster(organizer, {
      revisionId: firstRevision,
      sessionId,
      expectedRevision: 1,
      participants: payload,
    });
    await client.query(
      `update public.players set name = 'Beatriz Nova', nickname = ' Bibi ' where id = $1`,
      [playerId],
    );
    await replaceQuickRoster(organizer, {
      revisionId: secondRevision,
      sessionId,
      expectedRevision: 2,
      participants: payload,
    });

    const current = await client.query<{ display_name: string }>(
      'select display_name from public.session_participants where id = $1',
      [participantId],
    );
    const entries = await client.query<{
      roster_revision_id: string;
      display_name_at_time: string;
    }>(
      `select roster_revision_id, display_name_at_time
         from public.roster_revision_entries
        where roster_revision_id in ($1, $2)
        order by display_name_at_time`,
      [firstRevision, secondRevision],
    );
    assert.deepEqual(current.rows, [{ display_name: 'Bibi' }]);
    assert.deepEqual(entries.rows, [
      { roster_revision_id: firstRevision, display_name_at_time: 'Bia' },
      { roster_revision_id: secondRevision, display_name_at_time: 'Bibi' },
    ]);
  });

  test('Quick replacement rejects malformed payloads before inserting or advancing the Session', async () => {
    const organizer = await newUser('roster-validation@test.local');
    const playerId = await createPlayer(organizer);
    const duplicateParticipant = randomUUID();
    const invalidCommands: Array<{
      name: string;
      input: Parameters<typeof replaceQuickRoster>[1];
    }> = [
      { name: 'null revision id', input: { revisionId: null, sessionId: randomUUID() } },
      { name: 'null Session id', input: { sessionId: null } },
      {
        name: 'null expected revision',
        input: { sessionId: randomUUID(), expectedRevision: null },
      },
      { name: 'null payload', input: { sessionId: randomUUID(), participants: null } },
      { name: 'non-array payload', input: { sessionId: randomUUID(), participants: {} } },
      {
        name: 'scalar participant item',
        input: { sessionId: randomUUID(), participants: ['Ana'] },
      },
      {
        name: 'null participant item',
        input: { sessionId: randomUUID(), participants: [null] },
      },
      {
        name: 'null participant id',
        input: {
          sessionId: randomUUID(),
          participants: [{ participant_id: null, identity_kind: 'GUEST', display_name: 'Ana' }],
        },
      },
      {
        name: 'null identity kind',
        input: {
          sessionId: randomUUID(),
          participants: [
            {
              participant_id: randomUUID(),
              identity_kind: null,
              display_name: 'Ana',
            },
          ],
        },
      },
      {
        name: 'Player missing player id',
        input: {
          sessionId: randomUUID(),
          participants: [
            {
              participant_id: randomUUID(),
              identity_kind: 'PLAYER',
            },
          ],
        },
      },
      {
        name: 'Player with null player id',
        input: {
          sessionId: randomUUID(),
          participants: [
            {
              participant_id: randomUUID(),
              identity_kind: 'PLAYER',
              player_id: null,
            },
          ],
        },
      },
      {
        name: 'invalid Player UUID',
        input: {
          sessionId: randomUUID(),
          participants: [
            {
              participant_id: randomUUID(),
              identity_kind: 'PLAYER',
              player_id: 'not-a-uuid',
            },
          ],
        },
      },
      {
        name: 'Guest missing display name',
        input: {
          sessionId: randomUUID(),
          participants: [
            {
              participant_id: randomUUID(),
              identity_kind: 'GUEST',
            },
          ],
        },
      },
      {
        name: 'Guest with null display name',
        input: {
          sessionId: randomUUID(),
          participants: [
            {
              participant_id: randomUUID(),
              identity_kind: 'GUEST',
              display_name: null,
            },
          ],
        },
      },
      {
        name: 'arbitrary extra key',
        input: {
          sessionId: randomUUID(),
          participants: [
            {
              participant_id: randomUUID(),
              identity_kind: 'GUEST',
              display_name: 'Ana',
              unexpected: true,
            },
          ],
        },
      },
      {
        name: 'duplicate participant ids',
        input: {
          sessionId: randomUUID(),
          participants: [
            {
              participant_id: duplicateParticipant,
              identity_kind: 'GUEST',
              display_name: 'Ana',
            },
            {
              participant_id: duplicateParticipant,
              identity_kind: 'GUEST',
              display_name: 'Bia',
            },
          ],
        },
      },
      {
        name: 'duplicate Player ids',
        input: {
          sessionId: randomUUID(),
          participants: [
            {
              participant_id: randomUUID(),
              identity_kind: 'PLAYER',
              player_id: playerId,
            },
            {
              participant_id: randomUUID(),
              identity_kind: 'PLAYER',
              player_id: playerId,
            },
          ],
        },
      },
      {
        name: 'blank Guest name',
        input: {
          sessionId: randomUUID(),
          participants: [
            {
              participant_id: randomUUID(),
              identity_kind: 'GUEST',
              display_name: '   ',
            },
          ],
        },
      },
      {
        name: 'oversized Guest name',
        input: {
          sessionId: randomUUID(),
          participants: [
            {
              participant_id: randomUUID(),
              identity_kind: 'GUEST',
              display_name: 'A'.repeat(10_001),
            },
          ],
        },
      },
      {
        name: 'invalid participant UUID',
        input: {
          sessionId: randomUUID(),
          participants: [
            { participant_id: 'not-a-uuid', identity_kind: 'GUEST', display_name: 'Ana' },
          ],
        },
      },
      {
        name: 'unsupported identity',
        input: {
          sessionId: randomUUID(),
          participants: [
            {
              participant_id: randomUUID(),
              identity_kind: 'TEAM',
              display_name: 'Ana',
            },
          ],
        },
      },
      {
        name: 'Player shape with extra Guest field',
        input: {
          sessionId: randomUUID(),
          participants: [
            {
              participant_id: randomUUID(),
              identity_kind: 'PLAYER',
              player_id: playerId,
              display_name: 'forged',
            },
          ],
        },
      },
      {
        name: 'Guest shape with extra Player field',
        input: {
          sessionId: randomUUID(),
          participants: [
            {
              participant_id: randomUUID(),
              identity_kind: 'GUEST',
              player_id: playerId,
              display_name: 'Ana',
            },
          ],
        },
      },
    ];

    for (const invalid of invalidCommands) {
      if (invalid.input.sessionId !== null) {
        invalid.input.sessionId = await createTargetSession(organizer, {
          id: invalid.input.sessionId ?? randomUUID(),
          name: `Invalid roster ${invalid.name}`,
        });
      }
      const rejected = await replaceQuickRoster(organizer, invalid.input).catch(
        (error: Error) => error,
      );
      assertSqlState(rejected, '23514');
      if (invalid.input.sessionId) {
        const state = await client.query<{
          revision: number;
          participants: string;
          revisions: string;
          entries: string;
        }>(
          `select s.revision,
                  (select count(*) from public.session_participants p
                    where p.session_id = s.id)::text as participants,
                  (select count(*) from public.roster_revisions r
                    where r.session_id = s.id)::text as revisions,
                  (select count(*) from public.roster_revision_entries e
                    where e.session_id = s.id)::text as entries
             from public.sessions s where s.id = $1`,
          [invalid.input.sessionId],
        );
        assert.deepEqual(state.rows, [
          { revision: 1, participants: '0', revisions: '0', entries: '0' },
        ]);
      }
    }
  });

  test('a participant UUID cannot be rebound to another identity kind or Player', async () => {
    const organizer = await newUser('roster-rebinding@test.local');
    const sessionId = await createTargetSession(organizer);
    const firstPlayer = await createPlayer(organizer, { name: 'Primeira' });
    const secondPlayer = await createPlayer(organizer, { name: 'Segunda' });
    const participantId = randomUUID();
    await replaceQuickRoster(organizer, {
      revisionId: randomUUID(),
      sessionId,
      expectedRevision: 1,
      participants: [
        {
          participant_id: participantId,
          identity_kind: 'PLAYER',
          player_id: firstPlayer,
        },
      ],
    });

    for (const participants of [
      [{ participant_id: participantId, identity_kind: 'GUEST', display_name: 'Ana' }],
      [
        {
          participant_id: participantId,
          identity_kind: 'PLAYER',
          player_id: secondPlayer,
        },
      ],
    ]) {
      const rejected = await replaceQuickRoster(organizer, {
        revisionId: randomUUID(),
        sessionId,
        expectedRevision: 2,
        participants,
      }).catch((error: Error) => error);
      assertSqlState(rejected, '23514');
    }
    const current = await client.query<{ player_id: string; identity_kind: string }>(
      'select player_id, identity_kind from public.session_participants where id = $1',
      [participantId],
    );
    assert.deepEqual(current.rows, [{ player_id: firstPlayer, identity_kind: 'PLAYER' }]);
  });

  test('Quick Player selection accepts owned, linked-account, and active shared Players only', async () => {
    const organizer = await newUser('roster-player-access@test.local');
    const otherOwner = await newUser('roster-player-access-owner@test.local');
    const community = await targetCommunity(otherOwner, 'Roster Player sharing');
    await activeMembership(community, organizer);
    const owned = await createPlayer(organizer, { name: 'Owned' });
    const linkedAccountPlayer = await client.query<{ id: string }>(
      `update public.players
          set owner_id = $2, name = 'Linked'
        where user_id = $1
        returning id`,
      [organizer, otherOwner],
    );
    assert.equal(linkedAccountPlayer.rows.length, 1);
    const linked = linkedAccountPlayer.rows[0].id;
    const shared = await createPlayer(otherOwner, { name: 'Shared' });
    await relateCommunityPlayer(community, shared, otherOwner);
    const sessionId = await createTargetSession(organizer);

    const allowed = [owned, linked, shared].map((playerId) => ({
      participant_id: randomUUID(),
      identity_kind: 'PLAYER' as const,
      player_id: playerId,
    }));
    const result = await replaceQuickRoster(organizer, {
      revisionId: randomUUID(),
      sessionId,
      expectedRevision: 1,
      participants: allowed,
    });
    assert.equal(result.rows.length, 1);

    await activeMembership(community, organizer, 'suspended');
    const suspendedMembershipSession = await createTargetSession(organizer, {
      name: 'Rejected suspended Membership Player',
    });
    const suspendedMembership = await replaceQuickRoster(organizer, {
      revisionId: randomUUID(),
      sessionId: suspendedMembershipSession,
      expectedRevision: 1,
      participants: [
        {
          participant_id: randomUUID(),
          identity_kind: 'PLAYER',
          player_id: shared,
        },
      ],
    }).catch((error: Error) => error);
    assertSqlState(suspendedMembership, '42501');
    await activeMembership(community, organizer);

    const unrelated = await createPlayer(otherOwner, { name: 'Unrelated' });
    const inactiveOwned = await createPlayer(organizer, { name: 'Inactive', active: false });
    const inactiveShared = await createPlayer(otherOwner, { name: 'Inactive shared' });
    await relateCommunityPlayer(community, inactiveShared, otherOwner, 'inactive');
    const softDeletedShared = await createPlayer(otherOwner, { name: 'Soft-deleted shared' });
    await relateCommunityPlayer(community, softDeletedShared, otherOwner);
    await client.query(
      `update public.community_players
          set deleted_at = '2030-01-01T00:00:00Z'
        where community_id = $1 and player_id = $2`,
      [community, softDeletedShared],
    );
    const deleted = await createPlayer(otherOwner, {
      name: 'Deleted',
      deletedAt: '2030-01-01T00:00:00Z',
    });
    for (const playerId of [unrelated, inactiveOwned, inactiveShared, softDeletedShared, deleted]) {
      const rejectedSession = await createTargetSession(organizer, {
        name: `Rejected Player ${playerId}`,
      });
      const rejected = await replaceQuickRoster(organizer, {
        revisionId: randomUUID(),
        sessionId: rejectedSession,
        expectedRevision: 1,
        participants: [
          {
            participant_id: randomUUID(),
            identity_kind: 'PLAYER',
            player_id: playerId,
          },
        ],
      }).catch((error: Error) => error);
      assertSqlState(rejected, '42501');
    }
  });

  test('Quick replacement enforces authentication, assignment, target context, and pre-start lifecycle', async () => {
    const assigned = await newUser('roster-authority-assigned@test.local');
    const outsider = await newUser('roster-authority-outsider@test.local');
    const eligibleUnassigned = await newUser('roster-authority-unassigned@test.local');
    const owner = await newUser('roster-authority-owner@test.local');
    const community = await targetCommunity(owner, 'Roster authority');
    await activeMembership(community, assigned);
    await activeMembership(community, eligibleUnassigned);
    await grantOrganizer(community, assigned);
    await grantOrganizer(community, eligibleUnassigned);
    const quickSession = await createTargetSession(assigned);
    const communitySession = await createTargetSession(assigned, {
      communityId: community,
      context: 'COMMUNITY',
    });
    const legacy = await client.query<{ id: string }>(
      `insert into public.sessions (owner_id, name, date, status, type)
       values ($1, 'Legacy roster', '2030-01-01', 'draft', 'free_play') returning id`,
      [assigned],
    );
    const inProgress = await createTargetSession(assigned, { name: 'In progress roster' });
    const completed = await createTargetSession(assigned, { name: 'Completed roster' });
    const cancelled = await createTargetSession(assigned, { name: 'Cancelled roster' });
    await client.query(
      `update public.sessions
          set lifecycle_status = 'IN_PROGRESS', status = 'active', actual_started_at = now()
        where id = $1`,
      [inProgress],
    );
    await client.query(
      `update public.sessions
          set lifecycle_status = 'COMPLETED', status = 'finished',
              actual_started_at = now() - interval '1 hour', actual_finished_at = now()
        where id = $1`,
      [completed],
    );
    await client.query(
      `update public.sessions
          set lifecycle_status = 'CANCELLED', status = 'cancelled',
              cancelled_at = now(), cancelled_by_user_id = $2
        where id = $1`,
      [cancelled, assigned],
    );

    const cases: Array<[string | null, string, string]> = [
      [null, quickSession, '42501'],
      [outsider, quickSession, '42501'],
      [eligibleUnassigned, quickSession, '42501'],
      [assigned, communitySession, '23514'],
      [assigned, legacy.rows[0].id, 'P0002'],
      [assigned, inProgress, '23514'],
      [assigned, completed, '23514'],
      [assigned, cancelled, '23514'],
    ];
    for (const [actor, sessionId, sqlState] of cases) {
      const rejected = await replaceQuickRoster(actor, {
        revisionId: randomUUID(),
        sessionId,
        expectedRevision: 1,
        participants: [],
      }).catch((error: Error) => error);
      assertSqlState(rejected, sqlState);
    }
  });

  test('authenticated browser roles cannot directly mutate any roster table', async () => {
    const organizer = await newUser('roster-direct-write@test.local');
    const mutations = [
      'insert into public.session_participants default values',
      'update public.session_participants set display_name = display_name where false',
      'delete from public.session_participants where false',
      'insert into public.roster_revisions default values',
      'update public.roster_revisions set source_kind = source_kind where false',
      'delete from public.roster_revisions where false',
      'insert into public.roster_revision_entries default values',
      `update public.roster_revision_entries
          set display_name_at_time = display_name_at_time where false`,
      'delete from public.roster_revision_entries where false',
    ];
    for (const sql of mutations) {
      const rejected = await callFailing(organizer, sql);
      assertSqlState(rejected, '42501');
    }
  });

  test('the exact reader returns revision provenance and an ordered entry array, including empty rosters', async () => {
    const organizer = await newUser('roster-reader-shape@test.local');
    const sessionId = await createTargetSession(organizer);
    const firstGuest = randomUUID();
    const secondGuest = randomUUID();
    const populatedRevision = randomUUID();
    const emptyRevision = randomUUID();
    await replaceQuickRoster(organizer, {
      revisionId: populatedRevision,
      sessionId,
      expectedRevision: 1,
      participants: [
        { participant_id: firstGuest, identity_kind: 'GUEST', display_name: 'Bia' },
        { participant_id: secondGuest, identity_kind: 'GUEST', display_name: 'Ana' },
      ],
    });
    await replaceQuickRoster(organizer, {
      revisionId: emptyRevision,
      sessionId,
      expectedRevision: 2,
      participants: [],
    });

    const populated = await readRoster(organizer, populatedRevision);
    assert.equal(populated.rows.length, 1);
    const { created_at: populatedCreatedAt, ...populatedStable } = populated.rows[0];
    assert.ok(populatedCreatedAt);
    assert.deepEqual(populatedStable, {
      roster_revision_id: populatedRevision,
      session_id: sessionId,
      roster_revision_number: 1,
      source_kind: 'QUICK_DIRECT',
      source_session_revision: 1,
      source_registration_revision: null,
      source_payload_hash: null,
      created_by_user_id: organizer,
      entries: [
        {
          participant_id: firstGuest,
          identity_kind: 'GUEST',
          player_id: null,
          display_name_at_time: 'Bia',
        },
        {
          participant_id: secondGuest,
          identity_kind: 'GUEST',
          player_id: null,
          display_name_at_time: 'Ana',
        },
      ],
    });

    const empty = await readRoster(organizer, emptyRevision);
    assert.equal(empty.rows.length, 1);
    assert.deepEqual(empty.rows[0].entries, []);
    assert.equal(empty.rows[0].roster_revision_number, 2);

    const missing = await readRoster(organizer, randomUUID()).catch((error: Error) => error);
    assertSqlState(missing, 'P0002');
  });

  test('target visibility governs roster RLS and RPC reads for Community and Quick audiences', async () => {
    const owner = await newUser('roster-read-owner@test.local');
    const organizer = await newUser('roster-read-organizer@test.local');
    const member = await newUser('roster-read-member@test.local');
    const suspended = await newUser('roster-read-suspended@test.local');
    const outsider = await newUser('roster-read-outsider@test.local');
    const quickOrganizer = await newUser('roster-read-quick@test.local');
    const community = await targetCommunity(owner, 'Roster readers');
    await activeMembership(community, organizer);
    await activeMembership(community, member);
    await activeMembership(community, suspended);
    await grantOrganizer(community, organizer);
    const communitySession = await createTargetSession(organizer, {
      communityId: community,
      context: 'COMMUNITY',
    });
    const communityRevision = await seedRevision({
      sessionId: communitySession,
      participantId: randomUUID(),
      identityKind: 'GUEST',
      displayName: 'Ana',
      actorId: organizer,
    });
    const quickSession = await createTargetSession(quickOrganizer);
    const quickRevision = randomUUID();
    const quickParticipant = randomUUID();
    await replaceQuickRoster(quickOrganizer, {
      revisionId: quickRevision,
      sessionId: quickSession,
      expectedRevision: 1,
      participants: [
        {
          participant_id: quickParticipant,
          identity_kind: 'GUEST',
          display_name: 'Bia',
        },
      ],
    });

    for (const [actor, sessionId, revisionId] of [
      [member, communitySession, communityRevision],
      [quickOrganizer, quickSession, quickRevision],
    ] as const) {
      const revisions = await call<{ id: string }>(
        actor,
        'select id from public.roster_revisions where id = $1',
        [revisionId],
      );
      const participants = await call<{ session_id: string }>(
        actor,
        'select session_id from public.session_participants where session_id = $1',
        [sessionId],
      );
      const entries = await call<{ roster_revision_id: string }>(
        actor,
        `select roster_revision_id from public.roster_revision_entries
          where roster_revision_id = $1`,
        [revisionId],
      );
      assert.deepEqual(revisions.rows, [{ id: revisionId }]);
      assert.deepEqual(participants.rows, [{ session_id: sessionId }]);
      assert.deepEqual(entries.rows, [{ roster_revision_id: revisionId }]);
      assert.equal((await readRoster(actor, revisionId)).rows.length, 1);
    }

    await activeMembership(community, suspended, 'suspended');
    await client.query(
      'update public.session_organizer_assignments set revoked_at = now() where session_id = $1',
      [quickSession],
    );
    for (const [actor, sessionId, revisionId] of [
      [outsider, communitySession, communityRevision],
      [suspended, communitySession, communityRevision],
      [quickOrganizer, quickSession, quickRevision],
    ] as const) {
      const revisions = await call(actor, 'select id from public.roster_revisions where id = $1', [
        revisionId,
      ]);
      const participants = await call(
        actor,
        'select session_id from public.session_participants where session_id = $1',
        [sessionId],
      );
      const entries = await call(
        actor,
        `select roster_revision_id from public.roster_revision_entries
          where roster_revision_id = $1`,
        [revisionId],
      );
      assert.deepEqual(revisions.rows, []);
      assert.deepEqual(participants.rows, []);
      assert.deepEqual(entries.rows, []);
      const rpc = await readRoster(actor, revisionId).catch((error: Error) => error);
      assertSqlState(rpc, '42501');
    }
    const anonymousReads = await Promise.all(
      [
        ['select id from public.roster_revisions where id = $1', communityRevision],
        ['select id from public.session_participants where session_id = $1', communitySession],
        [
          'select roster_revision_id from public.roster_revision_entries where roster_revision_id = $1',
          communityRevision,
        ],
      ].map(([sql, value]) => callFailing(null, sql, [value])),
    );
    const anonymousRpc = await readRoster(null, communityRevision).catch((error: Error) => error);
    for (const anonymousRead of anonymousReads) {
      assertSqlState(anonymousRead, '42501');
    }
    assertSqlState(anonymousRpc, '42501');
  });

  test('an identical retry returns the original revision before stale Session validation', async () => {
    const organizer = await newUser('roster-retry@test.local');
    const sessionId = await createTargetSession(organizer);
    const playerId = await createPlayer(organizer, { name: 'Beatriz', nickname: 'Bia' });
    const revisionId = randomUUID();
    const participants: ParticipantPayload[] = [
      {
        participant_id: randomUUID(),
        identity_kind: 'PLAYER',
        player_id: playerId,
      },
      {
        participant_id: randomUUID(),
        identity_kind: 'GUEST',
        display_name: ' Ana ',
      },
    ];
    const first = await replaceQuickRoster(organizer, {
      revisionId,
      sessionId,
      expectedRevision: 1,
      participants,
    });
    await client.query(
      `update public.players set name = 'Nome novo', nickname = 'Apelido novo' where id = $1`,
      [playerId],
    );
    const retry = await replaceQuickRoster(organizer, {
      revisionId,
      sessionId,
      expectedRevision: 1,
      participants,
    });
    assert.deepEqual(retry.rows, first.rows);
    const counts = await client.query<{
      revisions: string;
      entries: string;
      session_revision: number;
    }>(
      `select
         (select count(*) from public.roster_revisions where session_id = $1)::text as revisions,
         (select count(*) from public.roster_revision_entries
           where roster_revision_id = $2)::text as entries,
         (select revision from public.sessions where id = $1) as session_revision`,
      [sessionId, revisionId],
    );
    assert.deepEqual(counts.rows, [{ revisions: '1', entries: '2', session_revision: 2 }]);
  });

  test('same revision UUID collisions reject changed order, participant identity, Player, or Guest label', async () => {
    const organizer = await newUser('roster-collision@test.local');
    const sessionId = await createTargetSession(organizer);
    const firstPlayer = await createPlayer(organizer, { name: 'Primeira' });
    const secondPlayer = await createPlayer(organizer, { name: 'Segunda' });
    const revisionId = randomUUID();
    const playerParticipant = randomUUID();
    const guestParticipant = randomUUID();
    const original: ParticipantPayload[] = [
      {
        participant_id: playerParticipant,
        identity_kind: 'PLAYER',
        player_id: firstPlayer,
      },
      {
        participant_id: guestParticipant,
        identity_kind: 'GUEST',
        display_name: 'Ana',
      },
    ];
    await replaceQuickRoster(organizer, {
      revisionId,
      sessionId,
      expectedRevision: 1,
      participants: original,
    });
    const collisions: unknown[] = [
      [original[1], original[0]],
      [original[0], { participant_id: randomUUID(), identity_kind: 'GUEST', display_name: 'Ana' }],
      [
        {
          participant_id: playerParticipant,
          identity_kind: 'PLAYER',
          player_id: secondPlayer,
        },
        original[1],
      ],
      [
        original[0],
        {
          participant_id: guestParticipant,
          identity_kind: 'GUEST',
          display_name: 'Ana Paula',
        },
      ],
    ];
    for (const participants of collisions) {
      const rejected = await replaceQuickRoster(organizer, {
        revisionId,
        sessionId,
        expectedRevision: 1,
        participants,
      }).catch((error: Error) => error);
      assertSqlState(rejected, '23505');
    }
    const originalEntries = await client.query<{
      participant_id: string;
      entry_order: number;
      player_id: string | null;
      display_name_at_time: string;
    }>(
      `select participant_id, entry_order, player_id, display_name_at_time
         from public.roster_revision_entries
        where roster_revision_id = $1 order by entry_order`,
      [revisionId],
    );
    assert.deepEqual(originalEntries.rows, [
      {
        participant_id: playerParticipant,
        entry_order: 0,
        player_id: firstPlayer,
        display_name_at_time: 'Primeira',
      },
      {
        participant_id: guestParticipant,
        entry_order: 1,
        player_id: null,
        display_name_at_time: 'Ana',
      },
    ]);
  });

  test('two distinct roster UUIDs on one expected Session revision serialize to one 40001 loser', async () => {
    const organizer = await newUser('roster-concurrency@test.local');
    const sessionId = await createTargetSession(organizer);
    const firstRevision = randomUUID();
    const secondRevision = randomUUID();
    const a = await pool.connect();
    const b = await pool.connect();
    try {
      const replace = (db: typeof a, revisionId: string, participantId: string) =>
        asIdentityCommitting(db, organizer, () =>
          db.query<RosterCommandRow>(
            `select * from public.replace_target_quick_session_roster(
               $1, $2, 1, $3::jsonb
             )`,
            [
              revisionId,
              sessionId,
              JSON.stringify([
                {
                  participant_id: participantId,
                  identity_kind: 'GUEST',
                  display_name: 'Ana',
                },
              ]),
            ],
          ),
        ).catch((error: Error) => error);
      const outcomes = await Promise.all([
        replace(a, firstRevision, randomUUID()),
        replace(b, secondRevision, randomUUID()),
      ]);
      const committed = outcomes.filter((outcome) => !(outcome instanceof Error));
      const rejected = outcomes.filter((outcome): outcome is Error => outcome instanceof Error);
      assert.equal(committed.length, 1);
      assert.equal(rejected.length, 1);
      assertSqlState(rejected[0], '40001');
      const state = await client.query<{ revision: number; roster_revisions: string }>(
        `select revision,
                (select count(*) from public.roster_revisions r
                  where r.session_id = sessions.id)::text as roster_revisions
           from public.sessions where id = $1`,
        [sessionId],
      );
      assert.deepEqual(state.rows, [{ revision: 2, roster_revisions: '1' }]);
    } finally {
      a.release();
      b.release();
    }
  });

  test('a failed replacement rolls back participant changes, revision rows, entries, and Session advancement', async () => {
    const organizer = await newUser('roster-rollback@test.local');
    const sessionId = await createTargetSession(organizer);
    const participantId = randomUUID();
    await replaceQuickRoster(organizer, {
      revisionId: randomUUID(),
      sessionId,
      expectedRevision: 1,
      participants: [
        { participant_id: participantId, identity_kind: 'GUEST', display_name: 'Ana' },
      ],
    });
    await replaceQuickRoster(organizer, {
      revisionId: randomUUID(),
      sessionId,
      expectedRevision: 2,
      participants: [],
    });
    const rejectedRevision = randomUUID();
    const rejected = await replaceQuickRoster(organizer, {
      revisionId: rejectedRevision,
      sessionId,
      expectedRevision: 3,
      participants: [
        {
          participant_id: participantId,
          identity_kind: 'GUEST',
          display_name: 'Changed before failure',
        },
        {
          participant_id: randomUUID(),
          identity_kind: 'GUEST',
          display_name: '   ',
        },
      ],
    }).catch((error: Error) => error);
    assertSqlState(rejected, '23514');

    const state = await client.query<{
      revision: number;
      display_name: string;
      participation_status: string;
      revisions: string;
      rejected_entries: string;
    }>(
      `select s.revision, p.display_name, p.participation_status,
              (select count(*) from public.roster_revisions r
                where r.session_id = s.id)::text as revisions,
              (select count(*) from public.roster_revision_entries e
                where e.roster_revision_id = $3)::text as rejected_entries
         from public.sessions s
         join public.session_participants p on p.session_id = s.id and p.id = $2
        where s.id = $1`,
      [sessionId, participantId, rejectedRevision],
    );
    assert.deepEqual(state.rows, [
      {
        revision: 3,
        display_name: 'Ana',
        participation_status: 'REMOVED',
        revisions: '2',
        rejected_entries: '0',
      },
    ]);
  });

  test('changing a target Session legacy selected Player array does not affect roster writes or exact reads', async () => {
    const organizer = await newUser('roster-legacy-array-independence@test.local');
    const sessionId = await createTargetSession(organizer);
    const participantId = randomUUID();
    const firstRevision = randomUUID();
    const secondRevision = randomUUID();
    await client.query(
      `update public.sessions
          set selected_player_ids = array['legacy-before-write']
        where id = $1`,
      [sessionId],
    );
    await replaceQuickRoster(organizer, {
      revisionId: firstRevision,
      sessionId,
      expectedRevision: 1,
      participants: [
        {
          participant_id: participantId,
          identity_kind: 'GUEST',
          display_name: 'Ana',
        },
      ],
    });
    const firstRead = await readRoster(organizer, firstRevision);

    await client.query(
      `update public.sessions
          set selected_player_ids = array['legacy-after-write', 'unrelated-token']
        where id = $1`,
      [sessionId],
    );
    const secondWrite = await replaceQuickRoster(organizer, {
      revisionId: secondRevision,
      sessionId,
      expectedRevision: 2,
      participants: [
        {
          participant_id: participantId,
          identity_kind: 'GUEST',
          display_name: 'Bia',
        },
      ],
    });
    const firstReadAfterArrayChange = await readRoster(organizer, firstRevision);
    const secondRead = await readRoster(organizer, secondRevision);

    assert.deepEqual(secondWrite.rows, [
      {
        roster_revision_id: secondRevision,
        roster_revision_number: 2,
        session_revision: 3,
      },
    ]);
    assert.deepEqual(firstReadAfterArrayChange.rows, firstRead.rows);
    assert.deepEqual(firstRead.rows[0].entries, [
      {
        participant_id: participantId,
        identity_kind: 'GUEST',
        player_id: null,
        display_name_at_time: 'Ana',
      },
    ]);
    assert.deepEqual(secondRead.rows[0].entries, [
      {
        participant_id: participantId,
        identity_kind: 'GUEST',
        player_id: null,
        display_name_at_time: 'Bia',
      },
    ]);
    const legacyArray = await client.query<{ selected_player_ids: string[] }>(
      'select selected_player_ids from public.sessions where id = $1',
      [sessionId],
    );
    assert.deepEqual(legacyArray.rows, [
      { selected_player_ids: ['legacy-after-write', 'unrelated-token'] },
    ]);
  });

  test('target roster commands, readers, and private helpers never consult the legacy selected Player array', async () => {
    const { rows } = await client.query<{
      schema_name: string;
      function_name: string;
      definition: string;
    }>(
      `select namespace.nspname as schema_name,
              procedure.proname as function_name,
              pg_get_functiondef(procedure.oid) as definition
         from pg_proc procedure
         join pg_namespace namespace on namespace.oid = procedure.pronamespace
        where (
            namespace.nspname = 'public'
            and procedure.proname in (
              'replace_target_quick_session_roster',
              'read_target_roster_revision'
            )
          )
           or (
            namespace.nspname = 'app_private'
            and procedure.proname in (
              'current_user_can_select_target_quick_roster_player',
              'materialize_target_session_roster'
            )
          )
        order by namespace.nspname, procedure.proname`,
    );
    assert.deepEqual(
      rows.map((row) => [row.schema_name, row.function_name]),
      [
        ['app_private', 'current_user_can_select_target_quick_roster_player'],
        ['app_private', 'materialize_target_session_roster'],
        ['public', 'read_target_roster_revision'],
        ['public', 'replace_target_quick_session_roster'],
      ],
    );
    for (const row of rows) {
      assert.doesNotMatch(row.definition, /selected_player_ids/i);
    }
  });

  async function createLegacySession(
    input: {
      ownerId?: string | null;
      status?: string;
      selected?: string[];
      name?: string;
    } = {},
  ): Promise<string> {
    const { rows } = await client.query<{ id: string }>(
      `insert into public.sessions (
         owner_id, name, date, status, type, selected_player_ids
       ) values ($1, $2, '2030-01-01', $3, 'free_play', $4::text[])
       returning id`,
      [
        input.ownerId ?? null,
        input.name ?? 'Legacy roster Session',
        input.status ?? 'finished',
        input.selected ?? [],
      ],
    );
    return rows[0].id;
  }

  async function importLegacyRosters(sourceRelease: string): Promise<string> {
    const { rows } = await client.query<{ run_id: string }>(
      'select app_private.import_legacy_session_rosters($1) as run_id',
      [sourceRelease],
    );
    return rows[0].run_id;
  }

  async function legacySourceHash(sessionId: string): Promise<string> {
    const { rows } = await client.query<{ hash: string }>(
      `select pg_catalog.md5(to_jsonb(selected_player_ids)::text) as hash
         from public.sessions where id = $1`,
      [sessionId],
    );
    return rows[0].hash;
  }

  async function rosterFootprint(sessionId: string) {
    const { rows } = await client.query<{
      participants: string;
      revisions: string;
      entries: string;
    }>(
      `select
         (select count(*) from public.session_participants p
           where p.session_id = $1)::text as participants,
         (select count(*) from public.roster_revisions r
           where r.session_id = $1)::text as revisions,
         (select count(*) from public.roster_revision_entries e
           where e.session_id = $1)::text as entries`,
      [sessionId],
    );
    return rows;
  }

  async function anomaliesFor(runId: string, sessionId: string) {
    const { rows } = await client.query<{
      reason: string;
      status: string;
      details: Record<string, unknown>;
    }>(
      `select reason, status, details
         from app_private.migration_anomalies
        where run_id = $1
          and source_type = 'legacy_session_selected_roster'
          and source_id = $2
        order by reason`,
      [runId, sessionId],
    );
    return rows;
  }

  async function mappingsFor(runId: string, sessionId: string) {
    const { rows } = await client.query<{
      source_type: string;
      source_id: string;
      target_type: string;
      target_id: string;
      mapping_kind: string;
      confidence: string;
    }>(
      `select source_type, source_id, target_type, target_id, mapping_kind, confidence
         from app_private.migration_entity_map
        where run_id = $1 and (source_id = $2 or source_id like $2 || '#%')
        order by source_type, source_id`,
      [runId, sessionId],
    );
    return rows;
  }

  async function runRow(runId: string) {
    const { rows } = await client.query<{
      name: string;
      source_release: string;
      status: string;
      finished: boolean;
    }>(
      `select name, source_release, status, finished_at is not null as finished
         from app_private.migration_runs where run_id = $1`,
      [runId],
    );
    return rows;
  }

  test('terminal legacy Sessions import exact rosters with provenance and no invented history', async () => {
    const owner = await newUser('legacy-import-owner@test.local');
    const uuidPlayer = await createPlayer(owner, { name: 'Alice', nickname: ' Ali ' });
    const localPlayer = await createPlayer(owner, {
      name: ' Bruna ',
      localId: 'legacy-local-bruna',
    });
    const cancelledPlayer = await createPlayer(owner, { name: 'Carla' });
    const finishedSession = await createLegacySession({
      ownerId: owner,
      status: 'finished',
      selected: [uuidPlayer, 'legacy-local-bruna'],
      name: 'Legacy finished roster',
    });
    const cancelledSession = await createLegacySession({
      ownerId: owner,
      status: 'cancelled',
      selected: [cancelledPlayer],
      name: 'Legacy cancelled roster',
    });
    const expectedHash = await legacySourceHash(finishedSession);

    const runId = await importLegacyRosters('release-legacy-import');

    const revision = await client.query<{
      id: string;
      revision_number: number;
      source_kind: string;
      source_session_revision: number | null;
      source_registration_revision: string | null;
      source_payload_hash: string | null;
      created_by_user_id: string | null;
    }>(
      `select id, revision_number, source_kind, source_session_revision,
              source_registration_revision, source_payload_hash, created_by_user_id
         from public.roster_revisions where session_id = $1`,
      [finishedSession],
    );
    assert.equal(revision.rows.length, 1);
    const { id: revisionId, ...revisionShape } = revision.rows[0];
    assert.deepEqual(revisionShape, {
      revision_number: 1,
      source_kind: 'LEGACY_SELECTED_ROSTER',
      source_session_revision: null,
      source_registration_revision: null,
      source_payload_hash: expectedHash,
      created_by_user_id: null,
    });

    const entries = await client.query<{
      entry_order: number;
      identity_kind: string;
      player_id: string;
      display_name_at_time: string;
    }>(
      `select entry_order, identity_kind, player_id, display_name_at_time
         from public.roster_revision_entries
        where roster_revision_id = $1 order by entry_order`,
      [revisionId],
    );
    assert.deepEqual(entries.rows, [
      {
        entry_order: 0,
        identity_kind: 'PLAYER',
        player_id: uuidPlayer,
        display_name_at_time: 'Ali',
      },
      {
        entry_order: 1,
        identity_kind: 'PLAYER',
        player_id: localPlayer,
        display_name_at_time: 'Bruna',
      },
    ]);

    const participants = await client.query<{
      identity_kind: string;
      player_id: string;
      source_kind: string;
      participation_status: string;
      created_by_user_id: string | null;
    }>(
      `select identity_kind, player_id, source_kind, participation_status, created_by_user_id
         from public.session_participants where session_id = $1 order by display_name`,
      [finishedSession],
    );
    assert.deepEqual(participants.rows, [
      {
        identity_kind: 'PLAYER',
        player_id: uuidPlayer,
        source_kind: 'LEGACY_SELECTED_ROSTER',
        participation_status: 'INCLUDED',
        created_by_user_id: null,
      },
      {
        identity_kind: 'PLAYER',
        player_id: localPlayer,
        source_kind: 'LEGACY_SELECTED_ROSTER',
        participation_status: 'INCLUDED',
        created_by_user_id: null,
      },
    ]);

    assert.deepEqual(await rosterFootprint(cancelledSession), [
      { participants: '1', revisions: '1', entries: '1' },
    ]);

    const legacySource = await client.query<{
      authority_model: string;
      status: string;
      selected_player_ids: string[];
      revision: number;
      session_context: string | null;
      lifecycle_status: string | null;
    }>(
      `select authority_model, status, selected_player_ids, revision,
              session_context, lifecycle_status
         from public.sessions where id = $1`,
      [finishedSession],
    );
    assert.deepEqual(legacySource.rows, [
      {
        authority_model: 'legacy',
        status: 'finished',
        selected_player_ids: [uuidPlayer, 'legacy-local-bruna'],
        revision: 0,
        session_context: null,
        lifecycle_status: null,
      },
    ]);

    const participantIds = await client.query<{ id: string; player_id: string }>(
      'select id, player_id from public.session_participants where session_id = $1',
      [finishedSession],
    );
    const participantByPlayer = new Map(participantIds.rows.map((row) => [row.player_id, row.id]));
    assert.deepEqual(await mappingsFor(runId, finishedSession), [
      {
        source_type: 'legacy_session_selected_player',
        source_id: `${finishedSession}#1:${uuidPlayer}`,
        target_type: 'session_participant',
        target_id: participantByPlayer.get(uuidPlayer),
        mapping_kind: 'ONE_TO_ONE',
        confidence: 'EXACT',
      },
      {
        source_type: 'legacy_session_selected_player',
        source_id: `${finishedSession}#2:legacy-local-bruna`,
        target_type: 'session_participant',
        target_id: participantByPlayer.get(localPlayer),
        mapping_kind: 'ONE_TO_ONE',
        confidence: 'EXACT',
      },
      {
        source_type: 'legacy_session_selected_roster',
        source_id: finishedSession,
        target_type: 'roster_revision',
        target_id: revisionId,
        mapping_kind: 'ONE_TO_ONE',
        confidence: 'EXACT',
      },
    ]);
    assert.deepEqual(await anomaliesFor(runId, finishedSession), []);
    assert.deepEqual(await anomaliesFor(runId, cancelledSession), []);

    const targetTypes = await client.query<{ target_type: string }>(
      `select distinct target_type from app_private.migration_entity_map
        where run_id = $1 order by target_type`,
      [runId],
    );
    assert.deepEqual(
      targetTypes.rows.map((row) => row.target_type),
      ['roster_revision', 'session_participant'],
    );
    // XS-W4-01 gives public.registration_windows/registration_entries real schema, unrelated
    // to this legacy import. The invariant this proves is unchanged: the import must not
    // invent a Registration or FIFO fact for this Session, so assert zero rows for it rather
    // than the tables' prior nonexistence.
    const noRegistrationFacts = await client.query<{ windows: string; entries: string }>(
      `select
         (select count(*) from public.registration_windows where session_id = $1)::text as windows,
         (select count(*) from public.registration_entries e
            join public.registration_windows w on w.id = e.registration_window_id
           where w.session_id = $1)::text as entries`,
      [finishedSession],
    );
    assert.deepEqual(noRegistrationFacts.rows, [{ windows: '0', entries: '0' }]);
    assert.deepEqual(await runRow(runId), [
      {
        name: 'import_legacy_session_rosters',
        source_release: 'release-legacy-import',
        status: 'COMPLETED',
        finished: true,
      },
    ]);
  });

  test('an inexact legacy roster quarantines the whole Session without partial target rows', async () => {
    const owner = await newUser('legacy-quarantine-owner@test.local');
    const knownPlayer = await createPlayer(owner, { name: 'Conhecida' });
    const shadowedPlayer = await createPlayer(owner, { name: 'Sombra' });
    await client.query('update public.players set local_id = $2 where id = $1', [
      shadowedPlayer,
      knownPlayer,
    ]);
    const collidingPlayer = await createPlayer(owner, {
      name: 'Repetida',
      localId: 'legacy-local-repetida',
    });
    const repeatedPlayer = await createPlayer(owner, { name: 'Duplicada' });
    await createPlayer(owner, {
      name: 'Sem dono',
      localId: 'legacy-local-sem-dono',
    });

    const unresolved = await createLegacySession({
      ownerId: owner,
      selected: ['legacy-token-inexistente'],
      name: 'Legacy unresolved token',
    });
    const ambiguous = await createLegacySession({
      ownerId: owner,
      selected: [knownPlayer],
      name: 'Legacy ambiguous token',
    });
    const repeated = await createLegacySession({
      ownerId: owner,
      selected: [repeatedPlayer, repeatedPlayer],
      name: 'Legacy repeated token',
    });
    const colliding = await createLegacySession({
      ownerId: owner,
      selected: [collidingPlayer, 'legacy-local-repetida'],
      name: 'Legacy colliding Players',
    });
    const ownerless = await createLegacySession({
      ownerId: null,
      selected: ['legacy-local-sem-dono'],
      name: 'Legacy ownerless local token',
    });

    const runId = await importLegacyRosters('release-legacy-quarantine');

    const expectations: Array<[string, string, string[]]> = [
      [unresolved, 'LEGACY_ROSTER_TOKEN_UNRESOLVED', ['legacy-token-inexistente']],
      [ambiguous, 'LEGACY_ROSTER_TOKEN_AMBIGUOUS', [knownPlayer]],
      [repeated, 'LEGACY_ROSTER_TOKEN_REPEATED', [repeatedPlayer]],
      [
        colliding,
        'LEGACY_ROSTER_PLAYERS_COLLIDE',
        [collidingPlayer, 'legacy-local-repetida'].sort(),
      ],
      [ownerless, 'LEGACY_ROSTER_OWNER_UNKNOWN', ['legacy-local-sem-dono']],
    ];
    for (const [sessionId, reason, rejectedTokens] of expectations) {
      const anomalies = await anomaliesFor(runId, sessionId);
      assert.equal(anomalies.length, 1, `${reason} must record exactly one anomaly`);
      assert.equal(anomalies[0].reason, reason);
      assert.equal(anomalies[0].status, 'QUARANTINED');
      assert.deepEqual(
        (anomalies[0].details.rejected_tokens as string[]).slice().sort(),
        rejectedTokens,
      );
      assert.equal(anomalies[0].details.source_hash, await legacySourceHash(sessionId));
      assert.deepEqual(await rosterFootprint(sessionId), [
        { participants: '0', revisions: '0', entries: '0' },
      ]);
      assert.deepEqual(await mappingsFor(runId, sessionId), []);
    }

    const ambiguousCandidates = (await anomaliesFor(runId, ambiguous))[0].details
      .candidates as Array<{ token: string; player_ids: string[] }>;
    assert.deepEqual(
      ambiguousCandidates.map((candidate) => ({
        token: candidate.token,
        player_ids: candidate.player_ids.slice().sort(),
      })),
      [{ token: knownPlayer, player_ids: [knownPlayer, shadowedPlayer].sort() }],
    );
    assert.deepEqual(await runRow(runId), [
      {
        name: 'import_legacy_session_rosters',
        source_release: 'release-legacy-quarantine',
        status: 'COMPLETED',
        finished: true,
      },
    ]);
  });

  test('non-terminal, empty, and already-target legacy cohorts are left untouched', async () => {
    const owner = await newUser('legacy-cohort-owner@test.local');
    const playerId = await createPlayer(owner, { name: 'Fora do escopo' });
    const ignored: string[] = [];
    for (const status of [
      'active',
      'paused',
      'draft',
      'players_selected',
      'configured',
      'teams_generated',
    ]) {
      ignored.push(
        await createLegacySession({
          ownerId: owner,
          status,
          selected: [playerId],
          name: `Legacy ${status} roster`,
        }),
      );
    }
    ignored.push(
      await createLegacySession({
        ownerId: owner,
        status: 'finished',
        selected: [],
        name: 'Legacy finished empty roster',
      }),
    );
    const alreadyTarget = await createTargetSession(owner, { name: 'Already target roster' });
    await client.query(
      `update public.sessions
          set selected_player_ids = array[$2]::text[], status = 'finished'
        where id = $1`,
      [alreadyTarget, playerId],
    );
    ignored.push(alreadyTarget);

    const runId = await importLegacyRosters('release-legacy-cohort');

    for (const sessionId of ignored) {
      assert.deepEqual(
        await rosterFootprint(sessionId),
        [{ participants: '0', revisions: '0', entries: '0' }],
        `${sessionId} must stay outside the terminal import cohort`,
      );
      assert.deepEqual(await anomaliesFor(runId, sessionId), []);
      assert.deepEqual(await mappingsFor(runId, sessionId), []);
    }
  });

  test('a rerun reuses an unchanged legacy import and quarantines source drift', async () => {
    const owner = await newUser('legacy-rerun-owner@test.local');
    const playerId = await createPlayer(owner, { name: 'Estável' });
    const driftPlayer = await createPlayer(owner, { name: 'Acrescentada' });
    const sessionId = await createLegacySession({
      ownerId: owner,
      selected: [playerId],
      name: 'Legacy rerun roster',
    });
    const originalHash = await legacySourceHash(sessionId);

    const firstRun = await importLegacyRosters('release-legacy-rerun-1');
    const firstState = await client.query<{ id: string; created_at: string }>(
      'select id, created_at from public.roster_revisions where session_id = $1',
      [sessionId],
    );
    assert.equal(firstState.rows.length, 1);
    const revisionId = firstState.rows[0].id;

    const secondRun = await importLegacyRosters('release-legacy-rerun-2');
    const secondState = await client.query<{ id: string; created_at: string }>(
      'select id, created_at from public.roster_revisions where session_id = $1',
      [sessionId],
    );
    assert.deepEqual(secondState.rows, firstState.rows);
    assert.deepEqual(await rosterFootprint(sessionId), [
      { participants: '1', revisions: '1', entries: '1' },
    ]);
    assert.deepEqual(await anomaliesFor(secondRun, sessionId), []);
    assert.deepEqual(
      (await mappingsFor(secondRun, sessionId)).map((row) => [row.source_type, row.target_id]),
      [
        ['legacy_session_selected_player', (await participantIdOf(sessionId)) as string],
        ['legacy_session_selected_roster', revisionId],
      ],
    );

    await client.query(
      `update public.sessions
          set selected_player_ids = array[$2, $3]::text[]
        where id = $1`,
      [sessionId, playerId, driftPlayer],
    );
    const driftedHash = await legacySourceHash(sessionId);
    const thirdRun = await importLegacyRosters('release-legacy-rerun-3');

    const drift = await anomaliesFor(thirdRun, sessionId);
    assert.equal(drift.length, 1);
    assert.equal(drift[0].reason, 'LEGACY_ROSTER_SOURCE_CHANGED_AFTER_IMPORT');
    assert.equal(drift[0].details.source_hash, driftedHash);
    assert.equal(drift[0].details.imported_source_hash, originalHash);
    assert.equal(drift[0].details.roster_revision_id, revisionId);
    const driftedState = await client.query<{ id: string; created_at: string }>(
      'select id, created_at from public.roster_revisions where session_id = $1',
      [sessionId],
    );
    assert.deepEqual(driftedState.rows, firstState.rows);
    assert.deepEqual(await rosterFootprint(sessionId), [
      { participants: '1', revisions: '1', entries: '1' },
    ]);

    for (const runId of [firstRun, secondRun, thirdRun]) {
      const [row] = await runRow(runId);
      assert.equal(row.status, 'COMPLETED');
      assert.equal(row.finished, true);
    }
  });

  async function participantIdOf(sessionId: string): Promise<string> {
    const { rows } = await client.query<{ id: string }>(
      'select id from public.session_participants where session_id = $1',
      [sessionId],
    );
    return rows[0].id;
  }
}
