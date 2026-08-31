import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import type { Client, Pool, PoolClient, QueryResultRow } from 'pg';
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

interface TransitionRow extends QueryResultRow {
  session_id: string;
  session_revision: number;
  authority_model: string;
  target_model_version: number;
}

interface ReadinessRow extends QueryResultRow {
  ready: boolean;
  blockers: Array<{ code: string }>;
  revisions: Record<string, unknown>;
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

  async function setMembership(
    communityId: string,
    userId: string,
    status: 'active' | 'suspended',
  ): Promise<void> {
    await client.query(
      `insert into public.community_memberships (community_id, user_id, role, status)
       values ($1, $2, 'member', $3)
       on conflict (community_id, user_id)
       do update set status = excluded.status`,
      [communityId, userId, status],
    );
  }

  async function setOrganizerResponsibility(
    communityId: string,
    userId: string,
    revokedAt: string | null = null,
  ): Promise<void> {
    await client.query(
      `insert into public.community_responsibilities (
         community_id, user_id, responsibility, revoked_at
       ) values ($1, $2, 'ORGANIZER', $3)
       on conflict (community_id, user_id, responsibility)
       do update set revoked_at = excluded.revoked_at`,
      [communityId, userId, revokedAt],
    );
  }

  async function inspectCutover(actorId: string | null, sessionId: string) {
    return call<CutoverInspectionRow>(
      actorId,
      'select * from public.inspect_legacy_session_cutover($1)',
      [sessionId],
    );
  }

  async function transitionLegacySession(
    actorId: string | null,
    input: {
      commandId: string;
      sessionId: string;
      expectedSourceFingerprint: string;
      sessionContext: string;
      playMode: string;
    },
  ) {
    return call<TransitionRow>(
      actorId,
      `select * from public.transition_legacy_session_to_target(
         p_command_id := $1,
         p_session_id := $2,
         p_expected_source_fingerprint := $3,
         p_session_context := $4,
         p_play_mode := $5
       )`,
      [
        input.commandId,
        input.sessionId,
        input.expectedSourceFingerprint,
        input.sessionContext,
        input.playMode,
      ],
    );
  }

  async function setLocalIdentity(db: PoolClient, userId: string): Promise<void> {
    await db.query('select set_config($1, $2, true)', ['request.jwt.claim.sub', userId]);
    await db.query('select set_config($1, $2, true)', ['request.jwt.claim.role', 'authenticated']);
    await db.query('select set_config($1, $2, true)', [
      'request.jwt.claims',
      JSON.stringify({ sub: userId, role: 'authenticated' }),
    ]);
    await db.query('set local role authenticated');
  }

  async function beginIdentity(db: PoolClient, userId: string): Promise<void> {
    await db.query('begin');
    await db.query("set local statement_timeout = '10s'");
    await setLocalIdentity(db, userId);
  }

  async function assertBlockedBy(waiterPids: number[], blockerPid: number): Promise<void> {
    let blockedPids: number[] = [];
    const deadline = Date.now() + 5000;
    while (blockedPids.length < waiterPids.length && Date.now() < deadline) {
      const { rows } = await client.query<{ pid: number }>(
        `with recursive blocker_chain(waiter_pid, blocker_pid) as (
           select activity.pid, blocker.pid
             from pg_catalog.pg_stat_activity activity
             cross join lateral pg_catalog.unnest(
               pg_catalog.pg_blocking_pids(activity.pid)
             ) blocker(pid)
            where activity.pid = any($1::integer[])
           union
           select blocker_chain.waiter_pid, blocker.pid
             from blocker_chain
             cross join lateral pg_catalog.unnest(
               pg_catalog.pg_blocking_pids(blocker_chain.blocker_pid)
             ) blocker(pid)
         )
         select waiter_pid as pid
           from blocker_chain
          where blocker_pid = $2::integer
          group by waiter_pid
          order by waiter_pid`,
        [waiterPids, blockerPid],
      );
      blockedPids = rows.map(({ pid }) => pid);
    }
    assert.deepEqual(
      blockedPids,
      [...waiterPids].sort((a, b) => a - b),
    );
  }

  async function transitionInOpenTransaction(
    db: PoolClient,
    input: {
      commandId: string;
      sessionId: string;
      expectedSourceFingerprint: string;
      sessionContext: string;
      playMode: string;
    },
  ) {
    return db.query<TransitionRow>(
      `select * from public.transition_legacy_session_to_target(
         $1::uuid, $2::uuid, $3::text, $4::text, $5::text
       )`,
      [
        input.commandId,
        input.sessionId,
        input.expectedSourceFingerprint,
        input.sessionContext,
        input.playMode,
      ],
    );
  }

  async function targetArtifactCounts(sessionId: string) {
    const { rows } = await client.query<{
      participants: string;
      roster_revisions: string;
      roster_entries: string;
      organizer_assignments: string;
      courts: string;
      rules_snapshots: string;
      ledger_rows: string;
      receipts: string;
    }>(
      `select
         (select count(*) from public.session_participants where session_id = $1)::text
           as participants,
         (select count(*) from public.roster_revisions where session_id = $1)::text
           as roster_revisions,
         (select count(*) from public.roster_revision_entries where session_id = $1)::text
           as roster_entries,
         (select count(*) from public.session_organizer_assignments where session_id = $1)::text
           as organizer_assignments,
         (select count(*) from public.session_courts where session_id = $1)::text as courts,
         (select count(*) from public.session_rules_snapshots where session_id = $1)::text
           as rules_snapshots,
         (select count(*) from app_private.session_authority_cutovers where session_id = $1)::text
           as ledger_rows,
         (select count(*) from app_private.command_receipts where aggregate_id = $1
            and command_type = 'transition_legacy_session_to_target')::text as receipts`,
      [sessionId],
    );
    return rows[0];
  }

  async function assertLegacyWithoutTargetArtifacts(sessionId: string): Promise<void> {
    const { rows } = await client.query<{
      authority_model: string;
      revision: number;
      target_model_version: number | null;
    }>(
      `select authority_model, revision, target_model_version
         from public.sessions where id = $1`,
      [sessionId],
    );
    assert.deepEqual(rows, [
      { authority_model: 'legacy', revision: 0, target_model_version: null },
    ]);
    assert.deepEqual(await targetArtifactCounts(sessionId), {
      participants: '0',
      roster_revisions: '0',
      roster_entries: '0',
      organizer_assignments: '0',
      courts: '0',
      rules_snapshots: '0',
      ledger_rows: '0',
      receipts: '0',
    });
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

  test('the inspector requires active Community Membership and active ORGANIZER responsibility', async () => {
    const owner = await newUser('cutover-community-owner@test.local');
    const allowed = await newUser('cutover-community-allowed@test.local');
    const missingMembership = await newUser('cutover-community-missing-membership@test.local');
    const suspendedMembership = await newUser('cutover-community-suspended@test.local');
    const missingResponsibility = await newUser(
      'cutover-community-missing-responsibility@test.local',
    );
    const revokedResponsibility = await newUser('cutover-community-revoked@test.local');
    const communityId = await createCommunity(owner, 'Inspectable Community');
    const sessionId = await createLegacySession(owner, 'Community legacy draft', { communityId });

    await setMembership(communityId, allowed, 'active');
    await setOrganizerResponsibility(communityId, allowed);
    assert.equal((await inspectCutover(allowed, sessionId)).rows[0].eligible, true);

    await setOrganizerResponsibility(communityId, missingMembership);
    const noMembership = await callFailing(
      missingMembership,
      'select * from public.inspect_legacy_session_cutover($1)',
      [sessionId],
    );
    assertSqlState(noMembership, '42501');

    await setMembership(communityId, suspendedMembership, 'suspended');
    await setOrganizerResponsibility(communityId, suspendedMembership);
    const suspended = await callFailing(
      suspendedMembership,
      'select * from public.inspect_legacy_session_cutover($1)',
      [sessionId],
    );
    assertSqlState(suspended, '42501');

    await setMembership(communityId, missingResponsibility, 'active');
    const noResponsibility = await callFailing(
      missingResponsibility,
      'select * from public.inspect_legacy_session_cutover($1)',
      [sessionId],
    );
    assertSqlState(noResponsibility, '42501');

    await setMembership(communityId, revokedResponsibility, 'active');
    await setOrganizerResponsibility(
      communityId,
      revokedResponsibility,
      '2030-01-01T00:00:00.000Z',
    );
    const revoked = await callFailing(
      revokedResponsibility,
      'select * from public.inspect_legacy_session_cutover($1)',
      [sessionId],
    );
    assertSqlState(revoked, '42501');
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
    const notDraftSessionIds: string[] = [];
    for (const status of [
      'players_selected',
      'configured',
      'teams_generated',
      'active',
      'paused',
      'finished',
      'cancelled',
    ]) {
      notDraftSessionIds.push(
        await createLegacySession(owner, `Legacy ${status} Session`, { status }),
      );
    }
    const deletedSessionId = await createLegacySession(owner, 'Deleted legacy draft', {
      deletedAt: '2030-01-02T00:00:00.000Z',
    });
    const gameSessionIds: string[] = [];
    for (const [label, status, deletedAt] of [
      ['non-terminal', 'in_progress', null],
      ['terminal', 'finished', null],
      ['soft-deleted', 'cancelled', '2030-01-03T00:00:00.000Z'],
    ] as const) {
      const sessionId = await createLegacySession(owner, `${label} Game evidence draft`);
      await client.query(
        `insert into public.games (
           owner_id, session_id, type, sequence_number, team_a_id, team_b_id, status, deleted_at
         ) values ($1, $2, 'free_play', $3, 'team-a', 'team-b', $4, $5)`,
        [owner, sessionId, 1, status, deletedAt],
      );
      gameSessionIds.push(sessionId);
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
      ...notDraftSessionIds.map((sessionId) => [sessionId, ['NOT_DRAFT']] as [string, string[]]),
      [deletedSessionId, ['SOFT_DELETED']],
      ...gameSessionIds.map(
        (sessionId) => [sessionId, ['HAS_GAME_EVIDENCE']] as [string, string[]],
      ),
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

  test('the inspector returns every coexistable adjacent blocker pair in lexical order', async () => {
    const owner = await newUser('cutover-sorted-blockers@test.local');
    const repeatedPlayerId = await createPlayer(owner, { name: 'Repeated ordering Player' });
    const ambiguousPlayerId = await createPlayer(owner, { name: 'Ambiguous ordering Player' });
    await createPlayer(owner, {
      localId: ambiguousPlayerId,
      name: 'Ambiguous local ordering Player',
    });
    const collidingPlayerId = await createPlayer(owner, {
      localId: 'ordering-local-collision',
      name: 'Colliding ordering Player',
    });

    const gameAndArtifact = await createLegacySession(owner, 'Game and artifact ordering');
    await client.query(
      `insert into public.games (
         owner_id, session_id, type, sequence_number, team_a_id, team_b_id, status
       ) values ($1, $2, 'free_play', 1, 'team-a', 'team-b', 'in_progress')`,
      [owner, gameAndArtifact],
    );
    await client.query(
      `insert into public.session_courts (id, session_id, label, court_order)
       values ($1, $2, 'Quadra de ordem', 1)`,
      [randomUUID(), gameAndArtifact],
    );

    const artifactAndTeam = await createLegacySession(owner, 'Artifact and team ordering', {
      teamIds: ['ordering-team'],
    });
    await client.query(
      `insert into public.session_courts (id, session_id, label, court_order)
       values ($1, $2, 'Quadra de ordem', 1)`,
      [randomUUID(), artifactAndTeam],
    );

    const teamAndNotDraft = await createLegacySession(owner, 'Team and draft ordering', {
      status: 'finished',
      teamIds: ['ordering-team'],
    });

    const notDraftAndNotLegacy = await createTargetSession(owner, 'Draft and legacy ordering');
    await client.query('delete from public.session_courts where session_id = $1', [
      notDraftAndNotLegacy,
    ]);
    await client.query('delete from public.session_organizer_assignments where session_id = $1', [
      notDraftAndNotLegacy,
    ]);
    await client.query("update public.sessions set status = 'finished' where id = $1", [
      notDraftAndNotLegacy,
    ]);

    const notLegacyAndColliding = await createTargetSession(owner, 'Legacy and collision ordering');
    await client.query('delete from public.session_courts where session_id = $1', [
      notLegacyAndColliding,
    ]);
    await client.query('delete from public.session_organizer_assignments where session_id = $1', [
      notLegacyAndColliding,
    ]);
    await client.query(
      'update public.sessions set selected_player_ids = array[$2, $3] where id = $1',
      [notLegacyAndColliding, collidingPlayerId, 'ordering-local-collision'],
    );

    const collidingAndAmbiguous = await createLegacySession(
      owner,
      'Collision and ambiguity ordering',
      {
        selectedPlayerIds: [collidingPlayerId, 'ordering-local-collision', ambiguousPlayerId],
      },
    );
    const ambiguousAndRepeated = await createLegacySession(
      owner,
      'Ambiguity and repeated ordering',
      {
        selectedPlayerIds: [ambiguousPlayerId, repeatedPlayerId, repeatedPlayerId],
      },
    );
    const repeatedAndUnresolved = await createLegacySession(
      owner,
      'Repeated and unresolved ordering',
      {
        selectedPlayerIds: [repeatedPlayerId, repeatedPlayerId, 'ordering-missing-player'],
      },
    );
    const unresolvedAndDeleted = await createLegacySession(
      owner,
      'Unresolved and deleted ordering',
      {
        selectedPlayerIds: ['ordering-missing-player'],
        deletedAt: '2030-01-03T00:00:00.000Z',
      },
    );

    for (const [sessionId, blockers] of [
      [gameAndArtifact, ['HAS_GAME_EVIDENCE', 'HAS_TARGET_ARTIFACTS']],
      [artifactAndTeam, ['HAS_TARGET_ARTIFACTS', 'HAS_TEAM_EVIDENCE']],
      [teamAndNotDraft, ['HAS_TEAM_EVIDENCE', 'NOT_DRAFT']],
      [notDraftAndNotLegacy, ['NOT_DRAFT', 'NOT_LEGACY']],
      [notLegacyAndColliding, ['NOT_LEGACY', 'ROSTER_PLAYERS_COLLIDE']],
      [collidingAndAmbiguous, ['ROSTER_PLAYERS_COLLIDE', 'ROSTER_TOKEN_AMBIGUOUS']],
      [ambiguousAndRepeated, ['ROSTER_TOKEN_AMBIGUOUS', 'ROSTER_TOKEN_REPEATED']],
      [repeatedAndUnresolved, ['ROSTER_TOKEN_REPEATED', 'ROSTER_TOKEN_UNRESOLVED']],
      [unresolvedAndDeleted, ['ROSTER_TOKEN_UNRESOLVED', 'SOFT_DELETED']],
    ] as Array<[string, string[]]>) {
      const { rows } = await inspectCutover(owner, sessionId);
      assert.equal(rows[0].eligible, false);
      assert.deepEqual(rows[0].blockers, blockers);
    }
  });

  test('the private roster resolver preserves terminal-import token resolution, order, display snapshots, and hash', async () => {
    const owner = await newUser('cutover-resolver@test.local');
    const foreignOwner = await newUser('cutover-resolver-foreign-owner@test.local');
    const uuidPlayerId = await createPlayer(owner, { name: 'Alice', nickname: ' Ali ' });
    const localPlayerId = await createPlayer(owner, {
      localId: 'cutover-local-bruna',
      name: ' Bruna ',
    });
    await createPlayer(foreignOwner, {
      localId: 'cutover-local-bruna',
      name: 'Foreign Bruna',
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
        'controlling user',
        'update public.sessions set controlled_by_user_id = $2 where id = $1',
        [sessionId, replacementOwner],
      ],
      [
        'control claim time',
        "update public.sessions set control_claimed_at = '2030-01-03T00:00:00.000Z' where id = $1",
        [sessionId],
      ],
      [
        'control device',
        "update public.sessions set control_device_id = 'fingerprint-device' where id = $1",
        [sessionId],
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

    async function assertFingerprintExcludes(
      field: string,
      sql: string,
      params: unknown[] = [],
    ): Promise<void> {
      await client.query('begin');
      try {
        const before = await fingerprintFor(sessionId);
        await client.query(sql, params);
        assert.equal(
          await fingerprintFor(sessionId),
          before,
          `${field} must not enter the checkpoint`,
        );
      } finally {
        await client.query('rollback');
      }
    }

    await client.query('begin');
    try {
      const before = await fingerprintFor(sessionId);
      await client.query(
        `insert into app_private.session_authority_cutovers (
           session_id, source_authority, target_model_version, cutover_kind,
           command_id, source_fingerprint, cutover_by_user_id
         ) values ($1, 'LEGACY', 1, 'LEGACY_EXPLICIT', $2, 'irrelevant-ledger-value', $3)`,
        [sessionId, randomUUID(), owner],
      );
      assert.equal(await fingerprintFor(sessionId), before);
    } finally {
      await client.query('rollback');
    }

    for (const [field, sql, params] of [
      [
        'target model version',
        'update public.sessions set target_model_version = 1 where id = $1',
        [sessionId],
      ],
      [
        'target context',
        "update public.sessions set session_context = 'QUICK' where id = $1",
        [sessionId],
      ],
      [
        'target play mode',
        "update public.sessions set play_mode = 'FREE_PLAY' where id = $1",
        [sessionId],
      ],
      [
        'target lifecycle',
        "update public.sessions set lifecycle_status = 'DRAFT' where id = $1",
        [sessionId],
      ],
      [
        'target publication',
        "update public.sessions set publication_state = 'PRIVATE' where id = $1",
        [sessionId],
      ],
      [
        'planned start',
        "update public.sessions set planned_start_at = '2030-01-04T10:00:00.000Z' where id = $1",
        [sessionId],
      ],
      [
        'planned end',
        "update public.sessions set planned_end_at = '2030-01-04T11:00:00.000Z' where id = $1",
        [sessionId],
      ],
      [
        'actual start',
        "update public.sessions set actual_started_at = '2030-01-04T10:00:00.000Z' where id = $1",
        [sessionId],
      ],
      [
        'actual finish',
        "update public.sessions set actual_finished_at = '2030-01-04T11:00:00.000Z' where id = $1",
        [sessionId],
      ],
      [
        'cancellation time',
        "update public.sessions set cancelled_at = '2030-01-04T12:00:00.000Z' where id = $1",
        [sessionId],
      ],
      [
        'cancellation actor',
        'update public.sessions set cancelled_by_user_id = $2 where id = $1',
        [sessionId, replacementOwner],
      ],
      [
        'cancellation reason',
        "update public.sessions set cancel_reason = 'Fingerprint exclusion' where id = $1",
        [sessionId],
      ],
      ['target revision', 'update public.sessions set revision = 1 where id = $1', [sessionId]],
    ] as Array<[string, string, unknown[]]>) {
      await assertFingerprintExcludes(field, sql, params);
    }

    await client.query('begin');
    try {
      const before = await fingerprintFor(sessionId);
      await client.query("select set_config('app.session_authority_cutover', 'on', true)");
      await client.query(
        `update public.sessions
            set authority_model = 'target', target_model_version = 1,
                session_context = 'QUICK', play_mode = 'FREE_PLAY',
                lifecycle_status = 'DRAFT', publication_state = 'PRIVATE', revision = 1
          where id = $1`,
        [sessionId],
      );
      assert.equal(await fingerprintFor(sessionId), before);
    } finally {
      await client.query('rollback');
    }
  });

  test('transition_legacy_session_to_target writes the empty Quick root, assignment, ledger, receipt, and readiness gaps without fabricating target artifacts', async () => {
    const actor = await newUser('cutover-transition-empty@test.local');
    const sessionId = await createLegacySession(actor, 'Empty Quick cutover');
    const commandId = randomUUID();
    const fingerprint = (await inspectCutover(actor, sessionId)).rows[0].source_fingerprint;

    const { rows } = await transitionLegacySession(actor, {
      commandId,
      sessionId,
      expectedSourceFingerprint: fingerprint,
      sessionContext: 'QUICK',
      playMode: 'FREE_PLAY',
    });

    assert.deepEqual(rows, [
      {
        session_id: sessionId,
        session_revision: 1,
        authority_model: 'target',
        target_model_version: 1,
      },
    ]);
    const persistedRoot = await client.query<{
      authority_model: string;
      target_model_version: number;
      session_context: string;
      play_mode: string;
      lifecycle_status: string;
      publication_state: string;
      revision: number;
      status: string;
      type: string;
      actual_started_at: Date | null;
      actual_finished_at: Date | null;
      cancelled_at: Date | null;
      cancelled_by_user_id: string | null;
      cancel_reason: string | null;
    }>(
      `select authority_model, target_model_version, session_context, play_mode,
              lifecycle_status, publication_state, revision, status, type,
              actual_started_at, actual_finished_at, cancelled_at,
              cancelled_by_user_id, cancel_reason
         from public.sessions where id = $1`,
      [sessionId],
    );
    assert.deepEqual(persistedRoot.rows, [
      {
        authority_model: 'target',
        target_model_version: 1,
        session_context: 'QUICK',
        play_mode: 'FREE_PLAY',
        lifecycle_status: 'DRAFT',
        publication_state: 'PRIVATE',
        revision: 1,
        status: 'draft',
        type: 'free_play',
        actual_started_at: null,
        actual_finished_at: null,
        cancelled_at: null,
        cancelled_by_user_id: null,
        cancel_reason: null,
      },
    ]);
    const assignments = await client.query<{
      community_membership_id: string | null;
      organizer_user_id: string;
      assigned_by_user_id: string;
      revoked_at: Date | null;
    }>(
      `select community_membership_id, organizer_user_id, assigned_by_user_id, revoked_at
         from public.session_organizer_assignments where session_id = $1`,
      [sessionId],
    );
    assert.deepEqual(assignments.rows, [
      {
        community_membership_id: null,
        organizer_user_id: actor,
        assigned_by_user_id: actor,
        revoked_at: null,
      },
    ]);
    assert.deepEqual(await targetArtifactCounts(sessionId), {
      participants: '0',
      roster_revisions: '0',
      roster_entries: '0',
      organizer_assignments: '1',
      courts: '0',
      rules_snapshots: '0',
      ledger_rows: '1',
      receipts: '1',
    });
    const [ledger] = await cutoverRows(sessionId);
    assert.ok(ledger);
    const { cutover_at, ...ledgerShape } = ledger;
    assert.deepEqual(ledgerShape, {
      session_id: sessionId,
      source_authority: 'LEGACY',
      target_model_version: 1,
      cutover_kind: 'LEGACY_EXPLICIT',
      command_id: commandId,
      source_fingerprint: fingerprint,
      cutover_by_user_id: actor,
    });
    assert.ok(cutover_at instanceof Date);
    const receipt = await client.query<{
      actor_id: string;
      command_type: string;
      aggregate_id: string;
      result: Record<string, unknown>;
      retention_class: string;
    }>(
      `select actor_id, command_type, aggregate_id, result, retention_class
         from app_private.command_receipts where command_id = $1`,
      [commandId],
    );
    assert.deepEqual(receipt.rows, [
      {
        actor_id: actor,
        command_type: 'transition_legacy_session_to_target',
        aggregate_id: sessionId,
        result: {
          session_id: sessionId,
          session_revision: 1,
          authority_model: 'target',
          target_model_version: 1,
        },
        retention_class: 'SESSION_AUTHORITY_CUTOVER',
      },
    ]);
    const readiness = await call<ReadinessRow>(
      actor,
      'select * from public.read_target_session_readiness($1)',
      [sessionId],
    );
    assert.equal(readiness.rows[0].ready, false);
    assert.deepEqual(readiness.rows[0].blockers.map(({ code }) => code).sort(), [
      'COURT_CONFIGURATION_INVALID',
      'NO_EFFECTIVE_ROSTER',
      'RULES_INVALID',
    ]);
  });

  test('transition_legacy_session_to_target materializes the exact selected roster and preserves every legacy evidence byte without Registration or FIFO facts', async () => {
    const actor = await newUser('cutover-transition-roster@test.local');
    const uuidPlayer = await createPlayer(actor, { name: 'Alice', nickname: ' Ali ' });
    const localPlayer = await createPlayer(actor, {
      localId: 'cutover-transition-local-bruna',
      name: ' Bruna ',
    });
    const sessionId = await createLegacySession(actor, 'Exact cutover roster', {
      selectedPlayerIds: [uuidPlayer, 'cutover-transition-local-bruna'],
      config: { nested: { bestOf: 3 }, courtLabel: 'Quadra antiga' },
    });
    await client.query(
      `update public.sessions
          set local_id = 'cutover-session-local-evidence', sync_version = 37
        where id = $1`,
      [sessionId],
    );
    const legacyEvidence = async () =>
      client.query<{
        selected_player_ids_bytes: string;
        config_bytes: string;
        local_id: string;
        sync_version: number;
        updated_at: Date;
      }>(
        `select pg_catalog.encode(pg_catalog.array_send(selected_player_ids), 'hex')
                  as selected_player_ids_bytes,
                pg_catalog.encode(pg_catalog.jsonb_send(config), 'hex') as config_bytes,
                local_id, sync_version, updated_at
           from public.sessions where id = $1`,
        [sessionId],
      );
    const before = (await legacyEvidence()).rows;
    const { rows: hashRows } = await client.query<{ source_hash: string }>(
      `select pg_catalog.md5(pg_catalog.to_jsonb(selected_player_ids)::text) as source_hash
         from public.sessions where id = $1`,
      [sessionId],
    );
    const fingerprint = (await inspectCutover(actor, sessionId)).rows[0].source_fingerprint;

    await transitionLegacySession(actor, {
      commandId: randomUUID(),
      sessionId,
      expectedSourceFingerprint: fingerprint,
      sessionContext: 'QUICK',
      playMode: 'FREE_PLAY',
    });

    assert.deepEqual((await legacyEvidence()).rows, before);
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
      [sessionId],
    );
    assert.equal(revision.rows.length, 1);
    const { id: revisionId, ...revisionShape } = revision.rows[0];
    assert.deepEqual(revisionShape, {
      revision_number: 1,
      source_kind: 'LEGACY_SELECTED_ROSTER',
      source_session_revision: 1,
      source_registration_revision: null,
      source_payload_hash: hashRows[0].source_hash,
      created_by_user_id: actor,
    });
    const participants = await client.query<{
      id: string;
      player_id: string;
      source_kind: string;
      display_name: string;
      participation_status: string;
      created_by_user_id: string;
    }>(
      `select id, player_id, source_kind, display_name, participation_status, created_by_user_id
         from public.session_participants where session_id = $1 order by display_name`,
      [sessionId],
    );
    assert.equal(participants.rows.length, 2);
    const [aliceParticipant, brunaParticipant] = participants.rows;
    assert.notEqual(aliceParticipant.id, brunaParticipant.id);
    assert.deepEqual(
      participants.rows.map(({ id: _id, ...participant }) => participant),
      [
        {
          player_id: uuidPlayer,
          source_kind: 'LEGACY_SELECTED_ROSTER',
          display_name: 'Ali',
          participation_status: 'INCLUDED',
          created_by_user_id: actor,
        },
        {
          player_id: localPlayer,
          source_kind: 'LEGACY_SELECTED_ROSTER',
          display_name: 'Bruna',
          participation_status: 'INCLUDED',
          created_by_user_id: actor,
        },
      ],
    );
    const entries = await client.query<{
      participant_id: string;
      entry_order: number;
      identity_kind: string;
      player_id: string;
      display_name_at_time: string;
    }>(
      `select participant_id, entry_order, identity_kind, player_id, display_name_at_time
         from public.roster_revision_entries
        where roster_revision_id = $1 order by entry_order`,
      [revisionId],
    );
    assert.deepEqual(entries.rows, [
      {
        participant_id: aliceParticipant.id,
        entry_order: 0,
        identity_kind: 'PLAYER',
        player_id: uuidPlayer,
        display_name_at_time: 'Ali',
      },
      {
        participant_id: brunaParticipant.id,
        entry_order: 1,
        identity_kind: 'PLAYER',
        player_id: localPlayer,
        display_name_at_time: 'Bruna',
      },
    ]);
    // XS-W4-01 gives public.registration_windows/registration_entries real schema, unrelated
    // to this cohort cutover. The invariant this proves is unchanged: the transition must not
    // fabricate a Registration or FIFO fact for this Session, so assert zero rows for it
    // rather than the tables' prior nonexistence.
    const noRegistrationFacts = await client.query<{ windows: string; entries: string }>(
      `select
         (select count(*) from public.registration_windows where session_id = $1)::text as windows,
         (select count(*) from public.registration_entries e
            join public.registration_windows w on w.id = e.registration_window_id
           where w.session_id = $1)::text as entries`,
      [sessionId],
    );
    assert.deepEqual(noRegistrationFacts.rows, [{ windows: '0', entries: '0' }]);
    const noFabricatedExecution = await client.query<{ courts: string; rules: string }>(
      `select
         (select count(*) from public.session_courts where session_id = $1)::text as courts,
         (select count(*) from public.session_rules_snapshots where session_id = $1)::text as rules`,
      [sessionId],
    );
    assert.deepEqual(noFabricatedExecution.rows, [{ courts: '0', rules: '0' }]);
    const immutable = await client
      .query('update public.roster_revisions set revision_number = 2 where id = $1', [revisionId])
      .catch((error: Error) => error);
    assertSqlState(immutable, '55000');
  });

  test('transition_legacy_session_to_target uses explicit play_mode instead of inferring it from legacy type', async () => {
    const actor = await newUser('cutover-explicit-mode@test.local');
    const sessionId = await createLegacySession(actor, 'Legacy tournament as free play', {
      type: 'tournament',
    });
    const fingerprint = (await inspectCutover(actor, sessionId)).rows[0].source_fingerprint;

    await transitionLegacySession(actor, {
      commandId: randomUUID(),
      sessionId,
      expectedSourceFingerprint: fingerprint,
      sessionContext: 'QUICK',
      playMode: 'FREE_PLAY',
    });

    const { rows } = await client.query<{
      play_mode: string;
      type: string;
      lifecycle_status: string;
      status: string;
    }>(`select play_mode, type, lifecycle_status, status from public.sessions where id = $1`, [
      sessionId,
    ]);
    assert.deepEqual(rows, [
      { play_mode: 'FREE_PLAY', type: 'free_play', lifecycle_status: 'DRAFT', status: 'draft' },
    ]);
  });

  test('transition_legacy_session_to_target rejects unbounded context and play-mode literals with 23514', async () => {
    const actor = await newUser('cutover-invalid-dimensions@test.local');
    for (const [label, sessionContext, playMode] of [
      ['context', 'CLUB', 'FREE_PLAY'],
      ['play mode', 'QUICK', 'KING_OF_COURT'],
    ]) {
      const sessionId = await createLegacySession(actor, `Invalid ${label} cutover`);
      const fingerprint = (await inspectCutover(actor, sessionId)).rows[0].source_fingerprint;
      const rejected = await transitionLegacySession(actor, {
        commandId: randomUUID(),
        sessionId,
        expectedSourceFingerprint: fingerprint,
        sessionContext,
        playMode,
      }).catch((error: Error) => error);
      assertSqlState(rejected, '23514');
      await assertLegacyWithoutTargetArtifacts(sessionId);
    }
  });

  test('transition_legacy_session_to_target rejects QUICK-with-Community and COMMUNITY-without-Community instead of fabricating context', async () => {
    const actor = await newUser('cutover-context-community@test.local');
    const communityId = await createCommunity(actor, 'Cutover dimension Community');
    await setOrganizerResponsibility(communityId, actor);
    const quickWithCommunity = await createLegacySession(actor, 'Quick with Community', {
      communityId,
    });
    const communityWithoutCommunity = await createLegacySession(actor, 'Community without one');

    for (const [sessionId, sessionContext] of [
      [quickWithCommunity, 'QUICK'],
      [communityWithoutCommunity, 'COMMUNITY'],
    ]) {
      const fingerprint = (await inspectCutover(actor, sessionId)).rows[0].source_fingerprint;
      const rejected = await transitionLegacySession(actor, {
        commandId: randomUUID(),
        sessionId,
        expectedSourceFingerprint: fingerprint,
        sessionContext,
        playMode: 'FREE_PLAY',
      }).catch((error: Error) => error);
      assertSqlState(rejected, '23514');
      await assertLegacyWithoutTargetArtifacts(sessionId);
    }
  });

  test('transition_legacy_session_to_target authorizes current Community responsibility and assigns the authenticated caller rather than the legacy owner', async () => {
    const owner = await newUser('cutover-community-transition-owner@test.local');
    const allowed = await newUser('cutover-community-transition-allowed@test.local');
    const missingMembership = await newUser(
      'cutover-community-transition-missing-membership@test.local',
    );
    const suspended = await newUser('cutover-community-transition-suspended@test.local');
    const missingResponsibility = await newUser(
      'cutover-community-transition-missing-responsibility@test.local',
    );
    const revoked = await newUser('cutover-community-transition-revoked@test.local');
    const outsider = await newUser('cutover-community-transition-outsider@test.local');
    const communityId = await createCommunity(owner, 'Transition authorization Community');
    const outsiderCommunityId = await createCommunity(outsider, 'Other transition Community');
    const sessionId = await createLegacySession(owner, 'Community transition draft', {
      communityId,
    });

    await setOrganizerResponsibility(communityId, missingMembership);
    await setMembership(communityId, suspended, 'suspended');
    await setOrganizerResponsibility(communityId, suspended);
    await setMembership(communityId, missingResponsibility, 'active');
    await setMembership(communityId, revoked, 'active');
    await setOrganizerResponsibility(communityId, revoked, '2030-01-01T00:00:00.000Z');
    await setOrganizerResponsibility(outsiderCommunityId, outsider);
    await setMembership(communityId, allowed, 'active');
    await setOrganizerResponsibility(communityId, allowed);

    const fingerprint = (await inspectCutover(allowed, sessionId)).rows[0].source_fingerprint;
    for (const deniedActor of [
      missingMembership,
      suspended,
      missingResponsibility,
      revoked,
      outsider,
    ]) {
      const rejected = await transitionLegacySession(deniedActor, {
        commandId: randomUUID(),
        sessionId,
        expectedSourceFingerprint: fingerprint,
        sessionContext: 'COMMUNITY',
        playMode: 'FREE_PLAY',
      }).catch((error: Error) => error);
      assertSqlState(rejected, '42501');
      await assertLegacyWithoutTargetArtifacts(sessionId);
    }

    await transitionLegacySession(allowed, {
      commandId: randomUUID(),
      sessionId,
      expectedSourceFingerprint: fingerprint,
      sessionContext: 'COMMUNITY',
      playMode: 'FREE_PLAY',
    });

    const { rows: membershipRows } = await client.query<{ id: string }>(
      `select id from public.community_memberships
        where community_id = $1 and user_id = $2 and status = 'active'`,
      [communityId, allowed],
    );
    assert.equal(membershipRows.length, 1);
    const assignments = await client.query<{
      community_membership_id: string;
      organizer_user_id: string;
      assigned_by_user_id: string;
    }>(
      `select community_membership_id, organizer_user_id, assigned_by_user_id
         from public.session_organizer_assignments where session_id = $1`,
      [sessionId],
    );
    assert.deepEqual(assignments.rows, [
      {
        community_membership_id: membershipRows[0].id,
        organizer_user_id: allowed,
        assigned_by_user_id: allowed,
      },
    ]);
    assert.notEqual(assignments.rows[0].organizer_user_id, owner);
  });

  test('transition_legacy_session_to_target resolves the same-command receipt before a stale fingerprint and returns the identical row', async () => {
    const actor = await newUser('cutover-receipt-first@test.local');
    const sessionId = await createLegacySession(actor, 'Receipt-first cutover');
    const commandId = randomUUID();
    const fingerprint = (await inspectCutover(actor, sessionId)).rows[0].source_fingerprint;
    const first = await transitionLegacySession(actor, {
      commandId,
      sessionId,
      expectedSourceFingerprint: fingerprint,
      sessionContext: 'QUICK',
      playMode: 'FREE_PLAY',
    });

    const retry = await transitionLegacySession(actor, {
      commandId,
      sessionId,
      expectedSourceFingerprint: 'stale-fingerprint-must-not-be-read',
      sessionContext: 'QUICK',
      playMode: 'FREE_PLAY',
    });

    assert.deepEqual(retry.rows, first.rows);
    assert.deepEqual(await targetArtifactCounts(sessionId), {
      participants: '0',
      roster_revisions: '0',
      roster_entries: '0',
      organizer_assignments: '1',
      courts: '0',
      rules_snapshots: '0',
      ledger_rows: '1',
      receipts: '1',
    });
  });

  for (const replayCase of [
    'foreign Quick actor',
    'cross-Community actor',
    'revoked responsibility',
  ]) {
    test(`transition_legacy_session_to_target denies saved receipt replay by ${replayCase}`, async () => {
      const actor = await newUser(`cutover-replay-${replayCase}@test.local`);
      const outsider = await newUser(`cutover-replay-outsider-${replayCase}@test.local`);
      const communityId =
        replayCase === 'foreign Quick actor'
          ? null
          : await createCommunity(actor, `Replay ${replayCase}`);
      if (communityId) await setOrganizerResponsibility(communityId, actor);
      if (replayCase === 'cross-Community actor') {
        const outsiderCommunity = await createCommunity(outsider, 'Replay outsider Community');
        await setOrganizerResponsibility(outsiderCommunity, outsider);
      }
      const sessionId = await createLegacySession(actor, `Replay ${replayCase}`, { communityId });
      const input = {
        commandId: randomUUID(),
        sessionId,
        expectedSourceFingerprint: (await inspectCutover(actor, sessionId)).rows[0]
          .source_fingerprint,
        sessionContext: communityId ? 'COMMUNITY' : 'QUICK',
        playMode: 'FREE_PLAY',
      };
      await transitionLegacySession(actor, input);
      const before = await targetArtifactCounts(sessionId);
      if (replayCase === 'revoked responsibility') {
        await setOrganizerResponsibility(communityId!, actor, '2030-01-01T00:00:00.000Z');
      }

      const replay = await transitionLegacySession(
        replayCase === 'revoked responsibility' ? actor : outsider,
        { ...input, expectedSourceFingerprint: 'stale-replay-fingerprint' },
      ).catch((error: Error) => error);

      assertSqlState(replay, '42501');
      assert.deepEqual(await targetArtifactCounts(sessionId), before);
    });
  }

  test('transition_legacy_session_to_target rejects command_id reuse across another Session or command type with 23505', async () => {
    const actor = await newUser('cutover-command-collision@test.local');
    const firstSessionId = await createLegacySession(actor, 'First collision cutover');
    const secondSessionId = await createLegacySession(actor, 'Second collision cutover');
    const firstFingerprint = (await inspectCutover(actor, firstSessionId)).rows[0]
      .source_fingerprint;
    const secondFingerprint = (await inspectCutover(actor, secondSessionId)).rows[0]
      .source_fingerprint;
    const reusedCommandId = randomUUID();
    await transitionLegacySession(actor, {
      commandId: reusedCommandId,
      sessionId: firstSessionId,
      expectedSourceFingerprint: firstFingerprint,
      sessionContext: 'QUICK',
      playMode: 'FREE_PLAY',
    });

    const aggregateCollision = await transitionLegacySession(actor, {
      commandId: reusedCommandId,
      sessionId: secondSessionId,
      expectedSourceFingerprint: secondFingerprint,
      sessionContext: 'QUICK',
      playMode: 'FREE_PLAY',
    }).catch((error: Error) => error);
    assertSqlState(aggregateCollision, '23505');
    await assertLegacyWithoutTargetArtifacts(secondSessionId);

    const typeCollisionCommandId = randomUUID();
    await client.query(
      `select app_private.record_command_receipt(
         $1, $2, 'another_command_type', $3, '{"ok":true}'::jsonb, 'TEST_COLLISION'
       )`,
      [typeCollisionCommandId, actor, secondSessionId],
    );
    const typeCollision = await transitionLegacySession(actor, {
      commandId: typeCollisionCommandId,
      sessionId: secondSessionId,
      expectedSourceFingerprint: secondFingerprint,
      sessionContext: 'QUICK',
      playMode: 'FREE_PLAY',
    }).catch((error: Error) => error);
    assertSqlState(typeCollision, '23505');
    await assertLegacyWithoutTargetArtifacts(secondSessionId);
  });

  test('transition_legacy_session_to_target gives distinct commands one completed graph and one receipt each', async () => {
    const actor = await newUser('cutover-distinct-commands@test.local');
    const playerId = await createPlayer(actor, { name: 'Distinct command Player' });
    const sessionId = await createLegacySession(actor, 'Distinct command cutover', {
      selectedPlayerIds: [playerId],
    });
    const fingerprint = (await inspectCutover(actor, sessionId)).rows[0].source_fingerprint;
    const commandIds = [randomUUID(), randomUUID()];
    const first = await transitionLegacySession(actor, {
      commandId: commandIds[0],
      sessionId,
      expectedSourceFingerprint: fingerprint,
      sessionContext: 'QUICK',
      playMode: 'FREE_PLAY',
    });
    const second = await transitionLegacySession(actor, {
      commandId: commandIds[1],
      sessionId,
      expectedSourceFingerprint: fingerprint,
      sessionContext: 'QUICK',
      playMode: 'FREE_PLAY',
    });

    assert.deepEqual(second.rows, first.rows);
    assert.deepEqual(await targetArtifactCounts(sessionId), {
      participants: '1',
      roster_revisions: '1',
      roster_entries: '1',
      organizer_assignments: '1',
      courts: '0',
      rules_snapshots: '0',
      ledger_rows: '1',
      receipts: '2',
    });
    const receipts = await client.query<{ command_id: string }>(
      `select command_id from app_private.command_receipts
        where command_id = any($1::uuid[]) order by command_id`,
      [commandIds],
    );
    assert.deepEqual(
      receipts.rows.map(({ command_id }) => command_id).sort(),
      [...commandIds].sort(),
    );
  });

  test('transition_legacy_session_to_target rolls back an injected unresolved roster without selecting target authority or writing any artifact', async () => {
    const actor = await newUser('cutover-invalid-roster-rollback@test.local');
    const sessionId = await createLegacySession(actor, 'Invalid roster rollback', {
      selectedPlayerIds: ['missing-cutover-transition-player'],
    });
    const inspection = await inspectCutover(actor, sessionId);
    assert.deepEqual(inspection.rows[0].blockers, ['ROSTER_TOKEN_UNRESOLVED']);

    const rejected = await transitionLegacySession(actor, {
      commandId: randomUUID(),
      sessionId,
      expectedSourceFingerprint: inspection.rows[0].source_fingerprint,
      sessionContext: 'QUICK',
      playMode: 'FREE_PLAY',
    }).catch((error: Error) => error);

    assertSqlState(rejected, '23514');
    await assertLegacyWithoutTargetArtifacts(sessionId);
  });

  test('transition_legacy_session_to_target rolls back its entire graph when the authority-ledger command key conflicts', async () => {
    const actor = await newUser('cutover-ledger-conflict-rollback@test.local');
    const playerId = await createPlayer(actor, { name: 'Ledger rollback Player' });
    const sessionId = await createLegacySession(actor, 'Ledger conflict rollback', {
      selectedPlayerIds: [playerId],
    });
    const conflictSessionId = await createLegacySession(actor, 'Ledger conflict fixture');
    const fingerprint = (await inspectCutover(actor, sessionId)).rows[0].source_fingerprint;
    const conflictFingerprint = await fingerprintFor(conflictSessionId);
    const commandId = randomUUID();
    const db = await pool.connect();
    try {
      await db.query('begin');
      await db.query(
        `insert into app_private.session_authority_cutovers (
           session_id, source_authority, target_model_version, cutover_kind,
           command_id, source_fingerprint, cutover_by_user_id
         ) values ($1, 'LEGACY', 1, 'LEGACY_EXPLICIT', $2, $3, $4)`,
        [conflictSessionId, commandId, conflictFingerprint, actor],
      );
      await setLocalIdentity(db, actor);
      const rejected = await transitionInOpenTransaction(db, {
        commandId,
        sessionId,
        expectedSourceFingerprint: fingerprint,
        sessionContext: 'QUICK',
        playMode: 'FREE_PLAY',
      }).catch((error: Error) => error);
      assertSqlState(rejected, '23505');
    } finally {
      await db.query('rollback').catch(() => undefined);
      db.release();
    }

    await assertLegacyWithoutTargetArtifacts(sessionId);
    assert.deepEqual(await cutoverRows(conflictSessionId), []);
  });

  test('transition_legacy_session_to_target rolls back roster materialization when organizer assignment fails and removes the failure fixture', async () => {
    const actor = await newUser('cutover-assignment-failure-rollback@test.local');
    const playerId = await createPlayer(actor, { name: 'Assignment rollback Player' });
    const sessionId = await createLegacySession(actor, 'Assignment failure rollback', {
      selectedPlayerIds: [playerId],
    });
    const fingerprint = (await inspectCutover(actor, sessionId)).rows[0].source_fingerprint;
    await client.query(`
      create function pg_temp.reject_cutover_assignment_fixture()
      returns trigger
      language plpgsql
      as $$
      begin
        raise exception 'injected assignment failure' using errcode = 'P0001';
      end;
      $$
    `);
    await client.query(`
      create trigger reject_cutover_assignment_fixture_trigger
      before insert on public.session_organizer_assignments
      for each row execute function pg_temp.reject_cutover_assignment_fixture()
    `);
    try {
      const rejected = await transitionLegacySession(actor, {
        commandId: randomUUID(),
        sessionId,
        expectedSourceFingerprint: fingerprint,
        sessionContext: 'QUICK',
        playMode: 'FREE_PLAY',
      }).catch((error: Error) => error);
      assertSqlState(rejected, 'P0001');
    } finally {
      await client.query(
        'drop trigger if exists reject_cutover_assignment_fixture_trigger on public.session_organizer_assignments',
      );
      await client.query('drop function if exists pg_temp.reject_cutover_assignment_fixture()');
    }

    await assertLegacyWithoutTargetArtifacts(sessionId);
    const { rows: fixtureRows } = await client.query<{ trigger_name: string }>(
      `select trigger_name
         from information_schema.triggers
        where event_object_schema = 'public'
          and event_object_table = 'session_organizer_assignments'
          and trigger_name = 'reject_cutover_assignment_fixture_trigger'`,
    );
    assert.deepEqual(fixtureRows, []);
  });

  test('transition_legacy_session_to_target waits across a final legacy UPDATE and fences its committed source with 40001 before reinspection', async () => {
    const actor = await newUser('cutover-source-race@test.local');
    const sessionId = await createLegacySession(actor, 'Source race before write');
    const firstFingerprint = (await inspectCutover(actor, sessionId)).rows[0].source_fingerprint;
    const writer = await pool.connect();
    const cutter = await pool.connect();
    let writerOpen = false;
    let cutterOpen = false;
    let pendingCutover:
      | Promise<Awaited<ReturnType<typeof transitionInOpenTransaction>> | Error>
      | undefined;
    try {
      await writer.query('begin');
      await writer.query("set local statement_timeout = '10s'");
      writerOpen = true;
      const { rows: writerPidRows } = await writer.query<{ pid: number }>(
        'select pg_catalog.pg_backend_pid() as pid',
      );
      const changed = await writer.query(
        `update public.sessions set notes = 'committed immediately before cutover'
          where id = $1 returning id`,
        [sessionId],
      );
      assert.equal(changed.rowCount, 1);

      await beginIdentity(cutter, actor);
      cutterOpen = true;
      const { rows: cutterPidRows } = await cutter.query<{ pid: number }>(
        'select pg_catalog.pg_backend_pid() as pid',
      );
      pendingCutover = transitionInOpenTransaction(cutter, {
        commandId: randomUUID(),
        sessionId,
        expectedSourceFingerprint: firstFingerprint,
        sessionContext: 'QUICK',
        playMode: 'FREE_PLAY',
      }).catch((error: Error) => error);
      await assertBlockedBy([cutterPidRows[0].pid], writerPidRows[0].pid);
      await writer.query('commit');
      writerOpen = false;
      const stale = await pendingCutover;
      assertSqlState(stale, '40001');
      await cutter.query('rollback');
      cutterOpen = false;
      await assertLegacyWithoutTargetArtifacts(sessionId);

      const secondInspection = await inspectCutover(actor, sessionId);
      const secondFingerprint = secondInspection.rows[0].source_fingerprint;
      assert.notEqual(secondFingerprint, firstFingerprint);
      const { rows: sourceRows } = await client.query<{ notes: string }>(
        'select notes from public.sessions where id = $1',
        [sessionId],
      );
      assert.equal(sourceRows[0].notes, 'committed immediately before cutover');
      await beginIdentity(cutter, actor);
      cutterOpen = true;
      const committed = await transitionInOpenTransaction(cutter, {
        commandId: randomUUID(),
        sessionId,
        expectedSourceFingerprint: secondFingerprint,
        sessionContext: 'QUICK',
        playMode: 'FREE_PLAY',
      });
      await cutter.query('commit');
      cutterOpen = false;
      assert.deepEqual(committed.rows, [
        {
          session_id: sessionId,
          session_revision: 1,
          authority_model: 'target',
          target_model_version: 1,
        },
      ]);
      const { rows: targetRows } = await client.query<{ notes: string; authority_model: string }>(
        'select notes, authority_model from public.sessions where id = $1',
        [sessionId],
      );
      assert.deepEqual(targetRows, [
        { notes: 'committed immediately before cutover', authority_model: 'target' },
      ]);
      assert.equal((await cutoverRows(sessionId))[0].source_fingerprint, secondFingerprint);
    } finally {
      if (writerOpen) await writer.query('rollback').catch(() => undefined);
      if (pendingCutover) await pendingCutover;
      if (cutterOpen) await cutter.query('rollback').catch(() => undefined);
      writer.release();
      cutter.release();
    }
  });

  for (const commandMode of ['same', 'distinct'] as const) {
    test(`concurrent ${commandMode}-command transition_legacy_session_to_target retries serialize behind one row lock and a final authenticated legacy update cannot mutate target state`, async () => {
      const actor = await newUser(`cutover-${commandMode}-command-race@test.local`);
      const probeSessionId = await createLegacySession(actor, 'Concurrency RPC probe');
      const probeFingerprint = (await inspectCutover(actor, probeSessionId)).rows[0]
        .source_fingerprint;
      await transitionLegacySession(actor, {
        commandId: randomUUID(),
        sessionId: probeSessionId,
        expectedSourceFingerprint: probeFingerprint,
        sessionContext: 'QUICK',
        playMode: 'FREE_PLAY',
      });

      const playerId = await createPlayer(actor, { name: 'Concurrent cutover Player' });
      const sessionId = await createLegacySession(actor, 'Concurrent legacy cutover', {
        selectedPlayerIds: [playerId],
      });
      const fingerprint = (await inspectCutover(actor, sessionId)).rows[0].source_fingerprint;
      const firstCommandId = randomUUID();
      const commandIds = [firstCommandId, commandMode === 'same' ? firstCommandId : randomUUID()];
      const gate = await pool.connect();
      const first = await pool.connect();
      const second = await pool.connect();
      let gateOpen = false;
      const attempts: Array<
        Promise<Awaited<ReturnType<typeof transitionInOpenTransaction>> | Error>
      > = [];
      try {
        await gate.query('begin');
        gateOpen = true;
        const { rows: gatePidRows } = await gate.query<{ pid: number }>(
          'select pg_catalog.pg_backend_pid() as pid',
        );
        await gate.query('select id from public.sessions where id = $1 for update', [sessionId]);
        await beginIdentity(first, actor);
        await beginIdentity(second, actor);
        const { rows: firstPidRows } = await first.query<{ pid: number }>(
          'select pg_catalog.pg_backend_pid() as pid',
        );
        const { rows: secondPidRows } = await second.query<{ pid: number }>(
          'select pg_catalog.pg_backend_pid() as pid',
        );

        const attempt = async (db: PoolClient, commandId: string) => {
          try {
            const result = await transitionInOpenTransaction(db, {
              commandId,
              sessionId,
              expectedSourceFingerprint: fingerprint,
              sessionContext: 'QUICK',
              playMode: 'FREE_PLAY',
            });
            await db.query('commit');
            return result;
          } catch (error) {
            await db.query('rollback').catch(() => undefined);
            return error as Error;
          }
        };
        attempts.push(attempt(first, commandIds[0]), attempt(second, commandIds[1]));

        const waiterPids = [firstPidRows[0].pid, secondPidRows[0].pid];
        await assertBlockedBy(waiterPids, gatePidRows[0].pid);
        await gate.query('commit');
        gateOpen = false;

        const outcomes = await Promise.all(attempts);
        for (const outcome of outcomes) {
          assert.ok(
            !(outcome instanceof Error),
            outcome instanceof Error ? outcome.message : undefined,
          );
        }
        assert.deepEqual(
          outcomes.map((outcome) => {
            assert.ok(!(outcome instanceof Error));
            return outcome.rows[0];
          }),
          [
            {
              session_id: sessionId,
              session_revision: 1,
              authority_model: 'target',
              target_model_version: 1,
            },
            {
              session_id: sessionId,
              session_revision: 1,
              authority_model: 'target',
              target_model_version: 1,
            },
          ],
        );
      } finally {
        if (gateOpen) await gate.query('rollback').catch(() => undefined);
        await Promise.allSettled(attempts);
        await first.query('rollback').catch(() => undefined);
        await second.query('rollback').catch(() => undefined);
        gate.release();
        first.release();
        second.release();
      }

      assert.deepEqual(await targetArtifactCounts(sessionId), {
        participants: '1',
        roster_revisions: '1',
        roster_entries: '1',
        organizer_assignments: '1',
        courts: '0',
        rules_snapshots: '0',
        ledger_rows: '1',
        receipts: commandMode === 'same' ? '1' : '2',
      });
      const beforeLegacyWrite = await client.query<{
        authority_model: string;
        name: string;
        revision: number;
      }>('select authority_model, name, revision from public.sessions where id = $1', [sessionId]);
      const legacyWrite = await call<{ id: string }>(
        actor,
        `update public.sessions set name = 'forbidden legacy write after cutover'
        where id = $1 returning id`,
        [sessionId],
      ).catch((error: Error) => error);
      if (legacyWrite instanceof Error) {
        assertSqlState(legacyWrite, '42501');
      } else {
        assert.equal(legacyWrite.rowCount, 0);
      }
      const afterLegacyWrite = await client.query<{
        authority_model: string;
        name: string;
        revision: number;
      }>('select authority_model, name, revision from public.sessions where id = $1', [sessionId]);
      assert.deepEqual(afterLegacyWrite.rows, beforeLegacyWrite.rows);
    });
  }
}
