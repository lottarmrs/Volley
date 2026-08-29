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

interface CutoverRow extends QueryResultRow {
  session_id: string;
  source_authority: string;
  target_model_version: number;
  cutover_kind: string;
  command_id: string | null;
  source_fingerprint: string | null;
  cutover_by_user_id: string | null;
}

if (!isTestDatabaseConfigured()) {
  test(`Session cohort cutover requires ${TEST_DATABASE_URL_VAR}`, () => {
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

  async function createLegacySession(ownerId: string, name: string): Promise<string> {
    const { rows } = await client.query<{ id: string }>(
      `insert into public.sessions (owner_id, name, date, status, type)
       values ($1, $2, '2030-01-01', 'finished', 'free_play')
       returning id`,
      [ownerId, name],
    );
    return rows[0].id;
  }

  async function cutoverRows(sessionId: string): Promise<CutoverRow[]> {
    const { rows } = await client.query<CutoverRow>(
      `select session_id, source_authority, target_model_version, cutover_kind,
              command_id, source_fingerprint, cutover_by_user_id
         from app_private.session_authority_cutovers
        where session_id = $1`,
      [sessionId],
    );
    return rows;
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
        column_default: '1',
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
        column_default: null,
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
        order by columns::text`,
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
      trigger_name: string;
      role_name: string;
    }>(
      `with browser_roles(role_name) as (values ('anon'), ('authenticated'))
       select trigger.tgname as trigger_name, browser_roles.role_name
         from pg_trigger trigger
         join pg_proc procedure on procedure.oid = trigger.tgfoid
         cross join browser_roles
        where trigger.tgrelid = 'app_private.session_authority_cutovers'::regclass
          and not trigger.tgisinternal
          and has_function_privilege(browser_roles.role_name, procedure.oid, 'EXECUTE')
        order by trigger_name, role_name`,
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
      { sql: 'delete from app_private.session_authority_cutovers where session_id = $1' },
    ]) {
      const error = await client.query(mutation.sql, [sessionId]).catch((error: Error) => error);
      assertSqlState(error, '55000');
    }

    await client.query('delete from auth.users where id = $1', [actor]);
    const rowsAfterAnonymization = await cutoverRows(sessionId);
    assert.deepEqual(rowsAfterAnonymization, [
      {
        ...ledger,
        cutover_by_user_id: null,
      },
    ]);
  });

  test('pre-existing target Sessions receive one NEW_TARGET ledger row while legacy Sessions receive none', async () => {
    const actor = await newUser('cutover-backfill@test.local');
    const targetSessionId = await createTargetSession(actor, 'Pre-existing target Session');
    const legacySessionId = await createLegacySession(actor, 'Pre-existing legacy Session');

    assert.deepEqual(await cutoverRows(targetSessionId), [
      {
        session_id: targetSessionId,
        source_authority: 'NONE',
        target_model_version: 1,
        cutover_kind: 'NEW_TARGET',
        command_id: null,
        source_fingerprint: null,
        cutover_by_user_id: actor,
      },
    ]);
    assert.deepEqual(await cutoverRows(legacySessionId), []);
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
    assert.deepEqual(await cutoverRows(sessionId), [
      {
        session_id: sessionId,
        source_authority: 'NONE',
        target_model_version: 1,
        cutover_kind: 'NEW_TARGET',
        command_id: null,
        source_fingerprint: null,
        cutover_by_user_id: actor,
      },
    ]);
  });
}
