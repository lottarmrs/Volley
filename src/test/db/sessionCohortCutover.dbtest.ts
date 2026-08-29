import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import type { Client, Pool, QueryResultRow } from 'pg';
import {
  asIdentityCommitting,
  connect,
  createPool,
  isTestDatabaseConfigured,
  rebuildFromMigrations,
  splitSqlStatements,
  TEST_DATABASE_URL_VAR,
} from './harness';

interface CutoverRow extends QueryResultRow {
  session_id: string;
  source_authority: string;
  target_model_version: number;
  cutover_kind: string;
  command_id: string | null;
  source_fingerprint: string | null;
  cutover_by_user_id: string | null;
  cutover_at: Date;
}

interface CutoverInspectionRow extends QueryResultRow {
  eligible: boolean;
  blockers: string[];
  source_fingerprint: string;
  selected_player_count: number;
}

const CUTOVER_MIGRATION_NAME = '20260829120000_target_session_cohort_cutover.sql';
const CUTOVER_MIGRATION_PATH = `supabase/migrations/${CUTOVER_MIGRATION_NAME}`;

if (!isTestDatabaseConfigured()) {
  test(`Session cohort cutover requires ${TEST_DATABASE_URL_VAR}`, () => {
    assert.fail(`${TEST_DATABASE_URL_VAR} is not set; run \`npm run test:db\`.`);
  });
} else {
  let client: Client;
  let pool: Pool;
  let preCutoverTargetSessionId: string;
  let preCutoverLegacySessionId: string;
  let preCutoverActorId: string;

  test.before(async () => {
    client = await connect();
    await rebuildFromMigrations(client, {
      excludeMigrationNames: [CUTOVER_MIGRATION_NAME],
    });
    pool = createPool();
    preCutoverActorId = await newUser('cutover-pre-migration@test.local');
    preCutoverTargetSessionId = await createTargetSession(
      preCutoverActorId,
      'Pre-migration target Session',
    );
    preCutoverLegacySessionId = await createLegacySession(
      preCutoverActorId,
      'Pre-migration legacy Session',
    );
    await applyCutoverMigrationIfPresent();
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

  async function createTargetSession(actorId: string, name: string): Promise<string> {
    const sessionId = randomUUID();
    const { rows } = await call<{ id: string }>(
      actorId,
      `select public.create_target_session(
         $1, null, 'QUICK', 'FREE_PLAY', $2, null, null
       ) as id`,
      [sessionId, name],
    );
    assert.deepEqual(rows, [{ id: sessionId }]);
    return sessionId;
  }

  async function createLegacySession(
    ownerId: string,
    name: string,
    input: {
      communityId?: string | null;
      status?: string;
      type?: 'free_play' | 'tournament';
      selectedPlayerIds?: string[];
      teamIds?: string[];
      config?: Record<string, unknown>;
      deletedAt?: string | null;
    } = {},
  ): Promise<string> {
    const { rows } = await client.query<{ id: string }>(
      `insert into public.sessions (
         owner_id, community_id, name, date, status, type,
         selected_player_ids, team_ids, config, deleted_at
       ) values ($1, $2, $3, '2030-01-01', $4, $5, $6::text[], $7::text[], $8::jsonb, $9)
       returning id`,
      [
        ownerId,
        input.communityId ?? null,
        name,
        input.status ?? 'draft',
        input.type ?? 'free_play',
        input.selectedPlayerIds ?? [],
        input.teamIds ?? [],
        JSON.stringify(input.config ?? {}),
        input.deletedAt ?? null,
      ],
    );
    return rows[0].id;
  }

  async function createPlayer(
    ownerId: string,
    input: { localId?: string | null; name?: string; nickname?: string | null } = {},
  ): Promise<string> {
    const id = randomUUID();
    await client.query(
      `insert into public.players (id, owner_id, local_id, name, nickname)
       values ($1, $2, $3, $4, $5)`,
      [id, ownerId, input.localId ?? null, input.name ?? 'Jogadora', input.nickname ?? null],
    );
    return id;
  }

  async function createCommunity(ownerId: string, name: string): Promise<string> {
    const { rows } = await call<{ id: string }>(
      ownerId,
      'select public.create_community_with_owner($1) as id',
      [name],
    );
    return rows[0].id;
  }

  async function inspectCutover(actorId: string | null, sessionId: string) {
    return call<CutoverInspectionRow>(
      actorId,
      'select * from public.inspect_legacy_session_cutover($1)',
      [sessionId],
    );
  }

  async function fingerprintFor(sessionId: string): Promise<string> {
    const { rows } = await client.query<{ source_fingerprint: string }>(
      `select app_private.legacy_session_cutover_fingerprint(s) as source_fingerprint
         from public.sessions s where s.id = $1`,
      [sessionId],
    );
    return rows[0].source_fingerprint;
  }

  async function cutoverRows(sessionId: string): Promise<CutoverRow[]> {
    const { rows } = await client.query<CutoverRow>(
      `select session_id, source_authority, target_model_version, cutover_kind,
              command_id, source_fingerprint, cutover_by_user_id, cutover_at
         from app_private.session_authority_cutovers
        where session_id = $1`,
      [sessionId],
    );
    return rows;
  }

  async function applyCutoverMigrationIfPresent(): Promise<void> {
    if (!existsSync(CUTOVER_MIGRATION_PATH)) return;
    const sql = readFileSync(CUTOVER_MIGRATION_PATH, 'utf8');
    for (const statement of splitSqlStatements(sql)) {
      await client.query(statement);
    }
  }

  function assertNewTargetLedger(
    rows: CutoverRow[],
    sessionId: string,
    actorId: string | null,
  ): CutoverRow {
    assert.equal(rows.length, 1);
    const [row] = rows;
    assert.ok(row);
    const { cutover_at, ...shape } = row;
    assert.deepEqual(shape, {
      session_id: sessionId,
      source_authority: 'NONE',
      target_model_version: 1,
      cutover_kind: 'NEW_TARGET',
      command_id: null,
      source_fingerprint: null,
      cutover_by_user_id: actorId,
    });
    assert.ok(cutover_at instanceof Date);
    assert.ok(!Number.isNaN(cutover_at.getTime()));
    return row;
  }

  test('the authority ledger exposes the approved literal columns and nullability', async () => {
    const { rows } = await client.query<{
      column_name: string;
      udt_name: string;
      is_nullable: string;
      column_default: string | null;
    }>(
      `select column_name, udt_name, is_nullable, column_default
         from information_schema.columns
        where table_schema = 'app_private'
          and table_name = 'session_authority_cutovers'
          and 'app_private.session_authority_cutovers'::regclass is not null
        order by ordinal_position`,
    );
    assert.deepEqual(rows, [
      { column_name: 'session_id', udt_name: 'uuid', is_nullable: 'NO', column_default: null },
      {
        column_name: 'source_authority',
        udt_name: 'text',
        is_nullable: 'NO',
        column_default: null,
      },
      {
        column_name: 'target_model_version',
        udt_name: 'int4',
        is_nullable: 'NO',
        column_default: null,
      },
      { column_name: 'cutover_kind', udt_name: 'text', is_nullable: 'NO', column_default: null },
      { column_name: 'command_id', udt_name: 'uuid', is_nullable: 'YES', column_default: null },
      {
        column_name: 'source_fingerprint',
        udt_name: 'text',
        is_nullable: 'YES',
        column_default: null,
      },
      {
        column_name: 'cutover_by_user_id',
        udt_name: 'uuid',
        is_nullable: 'YES',
        column_default: null,
      },
      {
        column_name: 'cutover_at',
        udt_name: 'timestamptz',
        is_nullable: 'NO',
        column_default: 'now()',
      },
    ]);
  });

  test('the authority ledger has the target keys, deletion actions, and leading indexes', async () => {
    const { rows: primaryKey } = await client.query<{ columns: string[] }>(
      `select array(
          select att.attname::text
            from unnest(con.conkey) with ordinality as key(attnum, ord)
            join pg_attribute att
              on att.attrelid = con.conrelid and att.attnum = key.attnum
           order by key.ord
        ) as columns
         from pg_constraint con
        where con.conrelid = 'app_private.session_authority_cutovers'::regclass
          and con.contype = 'p'`,
    );
    assert.deepEqual(primaryKey, [{ columns: ['session_id'] }]);

    const { rows: foreignKeys } = await client.query<{
      columns: string[];
      foreign_table: string;
      delete_action: string;
    }>(
      `select array(
          select att.attname::text
            from unnest(con.conkey) with ordinality as key(attnum, ord)
            join pg_attribute att
              on att.attrelid = con.conrelid and att.attnum = key.attnum
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
          and con.conrelid = 'app_private.session_authority_cutovers'::regclass
        order by con.conname`,
    );
    assert.deepEqual(foreignKeys, [
      { columns: ['cutover_by_user_id'], foreign_table: 'auth.users', delete_action: 'SET NULL' },
      { columns: ['session_id'], foreign_table: 'sessions', delete_action: 'RESTRICT' },
    ]);

    const { rows: unindexedForeignKeys } = await client.query<{
      constraint_name: string;
    }>(
      `select con.conname as constraint_name
         from pg_constraint con
        where con.contype = 'f'
          and con.conrelid = 'app_private.session_authority_cutovers'::regclass
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
        order by constraint_name`,
    );
    assert.deepEqual(unindexedForeignKeys, []);
  });

  test('the target ledger admits only its approved authority, cutover, fingerprint, and command shapes', async () => {
    const actor = await newUser('cutover-ledger-shapes@test.local');
    const sessionId = await createLegacySession(actor, 'Ledger shape Session');
    await client.query(`select 'app_private.session_authority_cutovers'::regclass`);
    const invalidRows = [
      {
        sourceAuthority: 'TARGET',
        targetModelVersion: 1,
        cutoverKind: 'NEW_TARGET',
        sourceFingerprint: null,
      },
      {
        sourceAuthority: 'NONE',
        targetModelVersion: 2,
        cutoverKind: 'NEW_TARGET',
        sourceFingerprint: null,
      },
      {
        sourceAuthority: 'LEGACY',
        targetModelVersion: 1,
        cutoverKind: 'UNKNOWN',
        sourceFingerprint: 'fingerprint',
      },
      {
        sourceAuthority: 'NONE',
        targetModelVersion: 1,
        cutoverKind: 'NEW_TARGET',
        sourceFingerprint: 'fingerprint',
      },
      {
        sourceAuthority: 'LEGACY',
        targetModelVersion: 1,
        cutoverKind: 'LEGACY_EXPLICIT',
        sourceFingerprint: null,
      },
      {
        sourceAuthority: 'NONE',
        targetModelVersion: 1,
        cutoverKind: 'LEGACY_EXPLICIT',
        sourceFingerprint: 'fingerprint',
      },
      {
        sourceAuthority: 'LEGACY',
        targetModelVersion: 1,
        cutoverKind: 'NEW_TARGET',
        sourceFingerprint: null,
      },
    ];
    for (const invalid of invalidRows) {
      const error = await client
        .query(
          `insert into app_private.session_authority_cutovers (
             session_id, source_authority, target_model_version, cutover_kind,
             source_fingerprint, cutover_at
           ) values ($1, $2, $3, $4, $5, now())`,
          [
            sessionId,
            invalid.sourceAuthority,
            invalid.targetModelVersion,
            invalid.cutoverKind,
            invalid.sourceFingerprint,
          ],
        )
        .catch((error: Error) => error);
      assertSqlState(error, '23514');
    }
  });

  test('command identifiers are unique only when present and never reference a mutable command table', async () => {
    const { rows: commandIndexes } = await client.query<{
      unique: boolean;
      predicate: string | null;
    }>(
      `select idx.indisunique as unique,
              pg_get_expr(idx.indpred, idx.indrelid) as predicate
         from pg_index idx
        where idx.indrelid = 'app_private.session_authority_cutovers'::regclass
          and idx.indisunique
          and array(
            select att.attname::text
              from unnest(idx.indkey::smallint[]) with ordinality as key(attnum, ord)
              join pg_attribute att
                on att.attrelid = idx.indrelid and att.attnum = key.attnum
             order by key.ord
          ) = array['command_id']`,
    );
    assert.deepEqual(commandIndexes, [{ unique: true, predicate: '(command_id IS NOT NULL)' }]);

    const { rows: commandForeignKeys } = await client.query<{ foreign_table: string }>(
      `select con.confrelid::regclass::text as foreign_table
         from pg_constraint con
        where con.contype = 'f'
          and con.conrelid = 'app_private.session_authority_cutovers'::regclass
          and exists (
            select 1
              from unnest(con.conkey) key(attnum)
              join pg_attribute att
                on att.attrelid = con.conrelid and att.attnum = key.attnum
             where att.attname = 'command_id'
          )`,
    );
    assert.deepEqual(commandForeignKeys, []);
  });

  test('the authority ledger is RLS-protected and inaccessible to browser roles and trigger callers', async () => {
    const { rows: rlsRows } = await client.query<{ relrowsecurity: boolean }>(
      `select relrowsecurity
         from pg_class
        where oid = 'app_private.session_authority_cutovers'::regclass`,
    );
    assert.deepEqual(rlsRows, [{ relrowsecurity: true }]);

    const { rows: tablePrivileges } = await client.query<{
      role_name: string;
      privilege_type: string;
    }>(
      `with browser_roles(role_name) as (values ('anon'), ('authenticated')),
            table_privileges(privilege_type) as (
              values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'),
                     ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')
            )
       select browser_roles.role_name, table_privileges.privilege_type
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
         cross join browser_roles
         cross join table_privileges
        where n.nspname = 'app_private'
          and c.relname = 'session_authority_cutovers'
          and has_table_privilege(browser_roles.role_name, c.oid, table_privileges.privilege_type)
        order by browser_roles.role_name, table_privileges.privilege_type`,
    );
    assert.deepEqual(tablePrivileges, []);

    const { rows: functionPrivileges } = await client.query<{
      table_name: string;
      trigger_name: string;
      role_name: string;
    }>(
      `with browser_roles(role_name) as (values ('anon'), ('authenticated'))
       select trigger.tgrelid::regclass::text as table_name,
              trigger.tgname as trigger_name,
              browser_roles.role_name
         from pg_trigger trigger
         join pg_proc procedure on procedure.oid = trigger.tgfoid
         cross join browser_roles
        where trigger.tgrelid in (
          'app_private.session_authority_cutovers'::regclass,
          'public.sessions'::regclass
        )
          and not trigger.tgisinternal
          and has_function_privilege(browser_roles.role_name, procedure.oid, 'EXECUTE')
        order by table_name, trigger_name, role_name`,
    );
    assert.deepEqual(functionPrivileges, []);

    const browserRead = await callFailing(
      null,
      'select * from app_private.session_authority_cutovers',
    );
    assertSqlState(browserRead, '42501');
  });

  test('the authority ledger is immutable except for Auth FK anonymization', async () => {
    const actor = await newUser('cutover-immutable@test.local');
    const sessionId = await createTargetSession(actor, 'Immutable authority Session');
    const [ledger] = await cutoverRows(sessionId);
    assert.ok(ledger);

    for (const mutation of [
      {
        sql: `update app_private.session_authority_cutovers
                 set source_authority = 'LEGACY'
               where session_id = $1`,
      },
      {
        sql: `update app_private.session_authority_cutovers
                 set cutover_by_user_id = null
               where session_id = $1`,
      },
      { sql: 'delete from app_private.session_authority_cutovers where session_id = $1' },
    ]) {
      const error = await client.query(mutation.sql, [sessionId]).catch((error: Error) => error);
      assertSqlState(error, '55000');
    }

    await client.query(
      'alter table public.players disable trigger trg_guard_player_account_identity_history',
    );
    await client.query('alter table public.players disable trigger trg_guard_player_user_id');
    await client.query('alter table public.players disable trigger audit_players');
    await client.query('alter table public.sessions disable trigger audit_sessions');
    try {
      await client.query('delete from auth.users where id = $1', [actor]);
    } finally {
      await client.query('alter table public.sessions enable trigger audit_sessions');
      await client.query('alter table public.players enable trigger audit_players');
      await client.query('alter table public.players enable trigger trg_guard_player_user_id');
      await client.query(
        'alter table public.players enable trigger trg_guard_player_account_identity_history',
      );
    }
    const rowsAfterAnonymization = await cutoverRows(sessionId);
    assert.deepEqual(rowsAfterAnonymization, [
      {
        ...ledger,
        cutover_by_user_id: null,
      },
    ]);
  });

  test('pre-existing target Sessions receive one NEW_TARGET ledger row while legacy Sessions receive none', async () => {
    assertNewTargetLedger(
      await cutoverRows(preCutoverTargetSessionId),
      preCutoverTargetSessionId,
      null,
    );
    assert.deepEqual(await cutoverRows(preCutoverLegacySessionId), []);
  });

  test('the selector cannot move a target Session back to legacy outside the cutover command', async () => {
    const actor = await newUser('cutover-target-to-legacy@test.local');
    const sessionId = await createTargetSession(actor, 'Target selector Session');
    const error = await client
      .query(`update public.sessions set authority_model = 'legacy' where id = $1`, [sessionId])
      .catch((error: Error) => error);
    assertSqlState(error, '55000');
  });

  test('the selector cannot move a legacy Session to target outside the cutover command', async () => {
    const actor = await newUser('cutover-legacy-to-target@test.local');
    const sessionId = await createLegacySession(actor, 'Legacy selector Session');
    const error = await client
      .query(
        `update public.sessions
            set authority_model = 'target', target_model_version = 1,
                session_context = 'QUICK', play_mode = 'FREE_PLAY',
                lifecycle_status = 'DRAFT', publication_state = 'PRIVATE', revision = 1
          where id = $1`,
        [sessionId],
      )
      .catch((error: Error) => error);
    assertSqlState(error, '55000');
  });

  test('a direct target-shaped Session without ledger provenance cannot commit', async () => {
    const actor = await newUser('cutover-unproven-target@test.local');
    const sessionId = randomUUID();
    await client.query('begin');
    let commitError: unknown;
    try {
      await client.query(
        `insert into public.sessions (
           id, owner_id, name, date, status, type,
           authority_model, target_model_version, session_context, play_mode,
           lifecycle_status, publication_state, revision
         ) values (
           $1, $2, 'Unproven target Session', '2030-01-01', 'draft', 'free_play',
           'target', 1, 'QUICK', 'FREE_PLAY', 'DRAFT', 'PRIVATE', 1
         )`,
        [sessionId, actor],
      );
      await client.query('commit');
    } catch (error) {
      commitError = error;
      await client.query('rollback').catch(() => undefined);
    }
    if (!commitError) {
      await client.query('delete from public.sessions where id = $1', [sessionId]);
    }
    assertSqlState(commitError, '55000');
  });

  test('create_target_session commits exactly one NEW_TARGET ledger row', async () => {
    const actor = await newUser('cutover-create-target@test.local');
    const sessionId = await createTargetSession(actor, 'Created target Session');
    assertNewTargetLedger(await cutoverRows(sessionId), sessionId, actor);
  });

  test('the inspector authorizes an owned empty Quick draft and returns its cutover checkpoint', async () => {
    const actor = await newUser('cutover-inspect-owned@test.local');
    const sessionId = await createLegacySession(actor, 'Inspectable legacy draft');

    const { rows } = await inspectCutover(actor, sessionId);

    assert.equal(rows.length, 1);
    assert.deepEqual(rows[0].blockers, []);
    assert.equal(rows[0].eligible, true);
    assert.match(rows[0].source_fingerprint, /^[0-9a-f]{32}$/);
    assert.equal(rows[0].selected_player_count, 0);
  });

  test('the inspector resolves absence before authorization and denies foreign Quick and Community Sessions', async () => {
    const owner = await newUser('cutover-inspect-owner@test.local');
    const otherUser = await newUser('cutover-inspect-other@test.local');
    const ownedSessionId = await createLegacySession(otherUser, 'Owned authorization draft');
    const foreignQuickSessionId = await createLegacySession(owner, 'Foreign Quick draft');
    const ownerCommunityId = await createCommunity(owner, 'Owner cutover Community');
    const otherCommunityId = await createCommunity(otherUser, 'Other cutover Community');
    const foreignCommunitySessionId = await createLegacySession(owner, 'Foreign Community draft', {
      communityId: ownerCommunityId,
    });

    assert.equal((await inspectCutover(otherUser, ownedSessionId)).rows[0].eligible, true);

    const absent = await callFailing(
      otherUser,
      'select * from public.inspect_legacy_session_cutover($1)',
      [randomUUID()],
    );
    assertSqlState(absent, 'P0002');

    const foreignQuick = await callFailing(
      otherUser,
      'select * from public.inspect_legacy_session_cutover($1)',
      [foreignQuickSessionId],
    );
    assertSqlState(foreignQuick, '42501');

    const crossCommunity = await callFailing(
      otherUser,
      'select * from public.inspect_legacy_session_cutover($1)',
      [foreignCommunitySessionId],
    );
    assertSqlState(crossCommunity, '42501');
    assert.notEqual(ownerCommunityId, otherCommunityId);
  });

  test('the inspector reports each legacy eligibility blocker with its bounded literal', async () => {
    const owner = await newUser('cutover-blockers@test.local');
    const repeatedPlayer = await createPlayer(owner, { name: 'Repetida' });
    const ambiguousPlayer = await createPlayer(owner, { name: 'UUID' });
    await createPlayer(owner, { localId: ambiguousPlayer, name: 'Local ambígua' });
    const collidingPlayer = await createPlayer(owner, {
      localId: 'cutover-local-collision',
      name: 'Colidida',
    });
    const nonLegacySessionId = await createTargetSession(owner, 'Target without target artifacts');
    await client.query('delete from public.session_courts where session_id = $1', [
      nonLegacySessionId,
    ]);
    await client.query('delete from public.session_organizer_assignments where session_id = $1', [
      nonLegacySessionId,
    ]);
    const notDraftSessionId = await createLegacySession(owner, 'Finished legacy draft', {
      status: 'finished',
    });
    const deletedSessionId = await createLegacySession(owner, 'Deleted legacy draft', {
      deletedAt: '2030-01-02T00:00:00.000Z',
    });
    const gamesSessionId = await createLegacySession(owner, 'Game evidence draft');
    for (const [sequence, status, deletedAt] of [
      [1, 'in_progress', null],
      [2, 'finished', null],
      [3, 'cancelled', '2030-01-03T00:00:00.000Z'],
    ] as const) {
      await client.query(
        `insert into public.games (
           owner_id, session_id, type, sequence_number, team_a_id, team_b_id, status, deleted_at
         ) values ($1, $2, 'free_play', $3, 'team-a', 'team-b', $4, $5)`,
        [owner, gamesSessionId, sequence, status, deletedAt],
      );
    }
    const teamArraySessionId = await createLegacySession(owner, 'Team array evidence draft', {
      teamIds: ['legacy-team-array'],
    });
    const teamsTableSessionId = await createLegacySession(owner, 'Teams table evidence draft');
    await client.query(
      `insert into public.teams (owner_id, session_id, name, deleted_at)
       values ($1, $2, 'Historical team', '2030-01-03T00:00:00.000Z')`,
      [owner, teamsTableSessionId],
    );
    const repeatedSessionId = await createLegacySession(owner, 'Repeated roster token', {
      selectedPlayerIds: [repeatedPlayer, repeatedPlayer],
    });
    const unresolvedSessionId = await createLegacySession(owner, 'Unresolved roster token', {
      selectedPlayerIds: ['missing-cutover-player'],
    });
    const ambiguousSessionId = await createLegacySession(owner, 'Ambiguous roster token', {
      selectedPlayerIds: [ambiguousPlayer],
    });
    const collidingSessionId = await createLegacySession(owner, 'Colliding roster Players', {
      selectedPlayerIds: [collidingPlayer, 'cutover-local-collision'],
    });

    for (const [sessionId, blockers] of [
      [nonLegacySessionId, ['NOT_LEGACY']],
      [notDraftSessionId, ['NOT_DRAFT']],
      [deletedSessionId, ['SOFT_DELETED']],
      [gamesSessionId, ['HAS_GAME_EVIDENCE']],
      [teamArraySessionId, ['HAS_TEAM_EVIDENCE']],
      [teamsTableSessionId, ['HAS_TEAM_EVIDENCE']],
      [repeatedSessionId, ['ROSTER_TOKEN_REPEATED']],
      [unresolvedSessionId, ['ROSTER_TOKEN_UNRESOLVED']],
      [ambiguousSessionId, ['ROSTER_TOKEN_AMBIGUOUS']],
      [collidingSessionId, ['ROSTER_PLAYERS_COLLIDE']],
    ] as Array<[string, string[]]>) {
      const { rows } = await inspectCutover(owner, sessionId);
      assert.equal(rows.length, 1);
      assert.equal(rows[0].eligible, false);
      assert.deepEqual(rows[0].blockers, blockers);
    }
  });

  test('the inspector blocks every unexpected target artifact representation', async () => {
    const owner = await newUser('cutover-target-artifacts@test.local');
    const playerId = await createPlayer(owner, { name: 'Artifact player' });
    const artifactSessions: string[] = [];
    for (const artifact of ['organizer', 'court', 'rules', 'roster', 'participant']) {
      artifactSessions.push(await createLegacySession(owner, `Unexpected ${artifact} artifact`));
    }
    const [
      organizerSessionId,
      courtSessionId,
      rulesSessionId,
      rosterSessionId,
      participantSessionId,
    ] = artifactSessions;
    await client.query(
      `insert into public.session_organizer_assignments (
         session_id, organizer_user_id, assigned_by_user_id
       ) values ($1, $2, $2)`,
      [organizerSessionId, owner],
    );
    await client.query(
      `insert into public.session_courts (id, session_id, label, court_order)
       values ($1, $2, 'Quadra inesperada', 1)`,
      [randomUUID(), courtSessionId],
    );
    await client.query(
      `insert into public.session_rules_snapshots (
         id, session_id, rules_scope, rules_schema_version, rules_payload, source_kind
       ) values ($1, $2, 'SESSION_MATCH_EXECUTION', 1, '{}'::jsonb, 'SESSION_EXPLICIT')`,
      [randomUUID(), rulesSessionId],
    );
    await client.query(
      `insert into public.roster_revisions (
         id, session_id, revision_number, source_kind
       ) values ($1, $2, 1, 'QUICK_DIRECT')`,
      [randomUUID(), rosterSessionId],
    );
    await client.query(
      `insert into public.session_participants (
         id, session_id, identity_kind, player_id, source_kind, display_name, participation_status
       ) values ($1, $2, 'PLAYER', $3, 'QUICK_DIRECT', 'Artifact player', 'INCLUDED')`,
      [randomUUID(), participantSessionId, playerId],
    );

    for (const sessionId of artifactSessions) {
      const { rows } = await inspectCutover(owner, sessionId);
      assert.deepEqual(rows[0].blockers, ['HAS_TARGET_ARTIFACTS']);
      assert.equal(rows[0].eligible, false);
    }
  });

  test('the inspector sorts simultaneous eligibility blockers instead of returning fixture order', async () => {
    const owner = await newUser('cutover-sorted-blockers@test.local');
    const sessionId = await createLegacySession(owner, 'Multiple cutover blockers', {
      status: 'finished',
      teamIds: ['legacy-team-array'],
      selectedPlayerIds: ['missing-cutover-player'],
    });
    await client.query(
      `insert into public.games (
         owner_id, session_id, type, sequence_number, team_a_id, team_b_id, status
       ) values ($1, $2, 'free_play', 1, 'team-a', 'team-b', 'in_progress')`,
      [owner, sessionId],
    );

    const { rows } = await inspectCutover(owner, sessionId);

    assert.deepEqual(rows[0].blockers, [
      'HAS_GAME_EVIDENCE',
      'HAS_TEAM_EVIDENCE',
      'NOT_DRAFT',
      'ROSTER_TOKEN_UNRESOLVED',
    ]);
  });

  test('the private roster resolver preserves terminal-import token resolution, order, display snapshots, and hash', async () => {
    const owner = await newUser('cutover-resolver@test.local');
    const uuidPlayerId = await createPlayer(owner, { name: 'Alice', nickname: ' Ali ' });
    const localPlayerId = await createPlayer(owner, {
      localId: 'cutover-local-bruna',
      name: ' Bruna ',
    });
    const sessionId = await createLegacySession(owner, 'Exact resolver draft', {
      selectedPlayerIds: [uuidPlayerId, 'cutover-local-bruna'],
    });
    const { rows: hashRows } = await client.query<{ source_hash: string }>(
      `select pg_catalog.md5(to_jsonb(selected_player_ids)::text) as source_hash
         from public.sessions where id = $1`,
      [sessionId],
    );
    const { rows } = await client.query<{ resolution: Record<string, unknown> }>(
      `select app_private.resolve_legacy_session_roster(s) as resolution
         from public.sessions s where s.id = $1`,
      [sessionId],
    );

    assert.deepEqual(rows[0].resolution, {
      source_hash: hashRows[0].source_hash,
      blockers: [],
      entries: [
        {
          entry_order: 0,
          identity_kind: 'PLAYER',
          player_id: uuidPlayerId,
          display_name: 'Ali',
          source_ordinal: 1,
          source_token: uuidPlayerId,
        },
        {
          entry_order: 1,
          identity_kind: 'PLAYER',
          player_id: localPlayerId,
          display_name: 'Bruna',
          source_ordinal: 2,
          source_token: 'cutover-local-bruna',
        },
      ],
    });
  });

  test('the source fingerprint covers every legacy authority field and excludes target-ledger rows', async () => {
    const owner = await newUser('cutover-fingerprint@test.local');
    const replacementOwner = await newUser('cutover-fingerprint-replacement@test.local');
    const communityId = await createCommunity(owner, 'Fingerprint Community');
    const sessionId = await createLegacySession(owner, 'Fingerprint legacy draft');
    const changes: Array<[string, string, unknown[]]> = [
      ['status', "update public.sessions set status = 'finished' where id = $1", [sessionId]],
      ['type', "update public.sessions set type = 'tournament' where id = $1", [sessionId]],
      [
        'selected roster',
        "update public.sessions set selected_player_ids = array['fingerprint-token'] where id = $1",
        [sessionId],
      ],
      [
        'team roster',
        "update public.sessions set team_ids = array['fingerprint-team'] where id = $1",
        [sessionId],
      ],
      [
        'config',
        'update public.sessions set config = \'{"bestOf":3}\'::jsonb where id = $1',
        [sessionId],
      ],
      [
        'Community',
        'update public.sessions set community_id = $2 where id = $1',
        [sessionId, communityId],
      ],
      [
        'name',
        "update public.sessions set name = 'Changed fingerprint name' where id = $1",
        [sessionId],
      ],
      ['date', "update public.sessions set date = '2030-01-02' where id = $1", [sessionId]],
      ['location', "update public.sessions set location = 'New court' where id = $1", [sessionId]],
      ['notes', "update public.sessions set notes = 'New notes' where id = $1", [sessionId]],
      [
        'deletion marker',
        "update public.sessions set deleted_at = '2030-01-03T00:00:00.000Z' where id = $1",
        [sessionId],
      ],
      [
        'created at',
        "update public.sessions set created_at = '2030-01-03T00:00:00.000Z' where id = $1",
        [sessionId],
      ],
      [
        'owner control',
        'update public.sessions set owner_id = $2 where id = $1',
        [sessionId, replacementOwner],
      ],
      [
        'local ID',
        "update public.sessions set local_id = 'fingerprint-local' where id = $1",
        [sessionId],
      ],
      ['sync version', 'update public.sessions set sync_version = 2 where id = $1', [sessionId]],
      [
        'updated at',
        "update public.sessions set updated_at = '2030-01-04T00:00:00.000Z' where id = $1",
        [sessionId],
      ],
    ];

    for (const [field, sql, params] of changes) {
      await client.query('begin');
      try {
        const before = await fingerprintFor(sessionId);
        await client.query(sql, params);
        const after = await fingerprintFor(sessionId);
        assert.notEqual(after, before, `${field} must invalidate the cutover checkpoint`);
      } finally {
        await client.query('rollback');
      }
    }

    const fingerprintBeforeTargetLedger = await fingerprintFor(sessionId);
    await createTargetSession(owner, 'Unrelated target ledger Session');
    assert.equal(await fingerprintFor(sessionId), fingerprintBeforeTargetLedger);
  });
}
