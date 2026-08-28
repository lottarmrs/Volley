import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import {
  connect,
  isTestDatabaseConfigured,
  rebuildFromMigrations,
  TEST_DATABASE_URL_VAR,
} from './harness';

/**
 * RED contract for the command-idempotency substrate (XS-W3-06 task 1).
 *
 * Nothing under test exists yet: `app_private.command_receipts`,
 * `app_private.record_command_receipt` and `app_private.find_command_receipt` are all
 * created by a later task. Every assertion here is expected to fail against the missing
 * table (`42P01`) or the missing functions (`42883`) until that task lands.
 */

if (!isTestDatabaseConfigured()) {
  test(`command receipts require ${TEST_DATABASE_URL_VAR}`, () => {
    assert.fail(`${TEST_DATABASE_URL_VAR} is not set; run \`npm run test:db\`.`);
  });
} else {
  let client: Client;

  test.before(async () => {
    client = await connect();
    await rebuildFromMigrations(client);
  });

  test.after(async () => {
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

  function assertSqlState(error: unknown, expectedCode: string): asserts error is Error {
    assert.ok(error instanceof Error);
    assert.equal((error as { code?: string }).code, expectedCode);
  }

  async function recordReceipt(input: {
    commandId: string;
    actorId: string | null;
    commandType: string;
    aggregateId: string;
    result?: unknown;
    retentionClass?: string;
  }) {
    return client.query(
      `select app_private.record_command_receipt($1, $2, $3, $4, $5::jsonb, $6)`,
      [
        input.commandId,
        input.actorId,
        input.commandType,
        input.aggregateId,
        JSON.stringify(input.result ?? {}),
        input.retentionClass ?? 'STANDARD',
      ],
    );
  }

  test('app_private.command_receipts exposes exactly the approved literal columns and nullability', async () => {
    const { rows } = await client.query<{
      column_name: string;
      udt_name: string;
      is_nullable: string;
    }>(
      `select column_name, udt_name, is_nullable
         from information_schema.columns
        where table_schema = 'app_private' and table_name = 'command_receipts'
        order by ordinal_position`,
    );
    assert.deepEqual(rows, [
      { column_name: 'command_id', udt_name: 'uuid', is_nullable: 'NO' },
      { column_name: 'actor_id', udt_name: 'uuid', is_nullable: 'YES' },
      { column_name: 'command_type', udt_name: 'text', is_nullable: 'NO' },
      { column_name: 'aggregate_id', udt_name: 'uuid', is_nullable: 'NO' },
      { column_name: 'result', udt_name: 'jsonb', is_nullable: 'NO' },
      { column_name: 'committed_at', udt_name: 'timestamptz', is_nullable: 'NO' },
      { column_name: 'retention_class', udt_name: 'text', is_nullable: 'NO' },
    ]);
  });

  test('command_id is the primary key of app_private.command_receipts', async () => {
    const { rows } = await client.query<{ columns: string[] }>(
      `select array(
          select att.attname::text
            from unnest(con.conkey) with ordinality as key(attnum, ord)
            join pg_attribute att
              on att.attrelid = con.conrelid
             and att.attnum = key.attnum
           order by key.ord
        ) as columns
         from pg_constraint con
        where con.conrelid = 'app_private.command_receipts'::regclass
          and con.contype = 'p'`,
    );
    assert.deepEqual(rows, [{ columns: ['command_id'] }]);
  });

  test('actor_id references auth.users with ON DELETE SET NULL', async () => {
    const { rows } = await client.query<{
      columns: string[];
      foreign_table: string;
      delete_action: string;
    }>(
      `select array(
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
          and con.conrelid = 'app_private.command_receipts'::regclass
          and con.confrelid = 'auth.users'::regclass`,
    );
    assert.deepEqual(rows, [
      { columns: ['actor_id'], foreign_table: 'auth.users', delete_action: 'SET NULL' },
    ]);
  });

  test('command_type and retention_class reject blank strings with 23514', async () => {
    const actorId = await newUser('receipt-blank@test.local');

    const blankCommandType = await client
      .query(
        `insert into app_private.command_receipts
           (command_id, actor_id, command_type, aggregate_id, result, committed_at, retention_class)
         values ($1, $2, '   ', $3, '{}'::jsonb, now(), 'STANDARD')`,
        [randomUUID(), actorId, randomUUID()],
      )
      .catch((error: Error) => error);
    assertSqlState(blankCommandType, '23514');

    const blankRetentionClass = await client
      .query(
        `insert into app_private.command_receipts
           (command_id, actor_id, command_type, aggregate_id, result, committed_at, retention_class)
         values ($1, $2, 'CreateSession', $3, '{}'::jsonb, now(), '')`,
        [randomUUID(), actorId, randomUUID()],
      )
      .catch((error: Error) => error);
    assertSqlState(blankRetentionClass, '23514');
  });

  test('every foreign key on app_private.command_receipts has a valid complete leading-column btree index', async () => {
    const { rows } = await client.query<{ table_name: string; constraint_name: string }>(
      `select con.conrelid::regclass::text as table_name, con.conname as constraint_name
         from pg_constraint con
        where con.contype = 'f'
          and con.conrelid = 'app_private.command_receipts'::regclass
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

  test('row level security is enabled on app_private.command_receipts', async () => {
    const { rows } = await client.query<{ relrowsecurity: boolean }>(
      `select relrowsecurity from pg_class where oid = 'app_private.command_receipts'::regclass`,
    );
    assert.deepEqual(rows, [{ relrowsecurity: true }]);
  });

  test('anon and authenticated hold no privilege on app_private.command_receipts', async () => {
    const { rows } = await client.query<{
      anon_select: boolean;
      authenticated_select: boolean;
      anon_insert: boolean;
      authenticated_insert: boolean;
    }>(
      `select has_table_privilege('anon', c.oid, 'SELECT') as anon_select,
              has_table_privilege('authenticated', c.oid, 'SELECT') as authenticated_select,
              has_table_privilege('anon', c.oid, 'INSERT') as anon_insert,
              has_table_privilege('authenticated', c.oid, 'INSERT') as authenticated_insert
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'app_private' and c.relname = 'command_receipts'`,
    );
    assert.deepEqual(rows, [
      {
        anon_select: false,
        authenticated_select: false,
        anon_insert: false,
        authenticated_insert: false,
      },
    ]);
  });

  test('anon and authenticated cannot execute record_command_receipt or find_command_receipt', async () => {
    const { rows } = await client.query<{
      proname: string;
      anon_exec: boolean;
      authenticated_exec: boolean;
    }>(
      `select p.proname,
              has_function_privilege('anon', p.oid, 'EXECUTE') as anon_exec,
              has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_exec
         from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'app_private'
          and p.proname in ('record_command_receipt', 'find_command_receipt')
        order by p.proname`,
    );
    assert.deepEqual(rows, [
      { proname: 'find_command_receipt', anon_exec: false, authenticated_exec: false },
      { proname: 'record_command_receipt', anon_exec: false, authenticated_exec: false },
    ]);
  });

  test('privileged UPDATE and DELETE of a receipt both fail with 55000', async () => {
    const actorId = await newUser('receipt-immutability@test.local');
    const commandId = randomUUID();
    await recordReceipt({
      commandId,
      actorId,
      commandType: 'CreateSession',
      aggregateId: randomUUID(),
    });

    const mutations = [
      {
        sql: `update app_private.command_receipts
                 set retention_class = 'TAMPERED'
               where command_id = $1`,
        params: [commandId],
      },
      {
        sql: 'delete from app_private.command_receipts where command_id = $1',
        params: [commandId],
      },
    ];
    for (const mutation of mutations) {
      const error = await client
        .query(mutation.sql, mutation.params)
        .catch((queryError: Error) => queryError);
      assertSqlState(error, '55000');
    }
  });

  test('record_command_receipt inserts one row and returns the stored result unchanged', async () => {
    const actorId = await newUser('receipt-record@test.local');
    const commandId = randomUUID();
    const aggregateId = randomUUID();
    const result = { ok: true, value: 42 };

    const { rows } = await client.query<{ record_command_receipt: unknown }>(
      `select app_private.record_command_receipt($1, $2, $3, $4, $5::jsonb, $6)`,
      [commandId, actorId, 'CreateSession', aggregateId, JSON.stringify(result), 'STANDARD'],
    );
    assert.deepEqual(rows, [{ record_command_receipt: result }]);

    const stored = await client.query<{
      command_id: string;
      actor_id: string;
      command_type: string;
      aggregate_id: string;
      result: unknown;
      retention_class: string;
    }>(
      `select command_id, actor_id, command_type, aggregate_id, result, retention_class
         from app_private.command_receipts
        where command_id = $1`,
      [commandId],
    );
    assert.deepEqual(stored.rows, [
      {
        command_id: commandId,
        actor_id: actorId,
        command_type: 'CreateSession',
        aggregate_id: aggregateId,
        result,
        retention_class: 'STANDARD',
      },
    ]);
  });

  test('find_command_receipt returns the recorded result for an exact match', async () => {
    const actorId = await newUser('receipt-find@test.local');
    const commandId = randomUUID();
    const aggregateId = randomUUID();
    const result = { done: true };
    await recordReceipt({
      commandId,
      actorId,
      commandType: 'CancelSession',
      aggregateId,
      result,
    });

    const { rows } = await client.query<{ find_command_receipt: unknown }>(
      'select app_private.find_command_receipt($1, $2, $3)',
      [commandId, 'CancelSession', aggregateId],
    );
    assert.deepEqual(rows, [{ find_command_receipt: result }]);
  });

  test('find_command_receipt returns null for an unknown command_id', async () => {
    const { rows } = await client.query<{ find_command_receipt: unknown }>(
      'select app_private.find_command_receipt($1, $2, $3)',
      [randomUUID(), 'CancelSession', randomUUID()],
    );
    assert.deepEqual(rows, [{ find_command_receipt: null }]);
  });

  test('looking up a recorded command_id under a different command_type raises 23505', async () => {
    const actorId = await newUser('receipt-mismatch-type@test.local');
    const commandId = randomUUID();
    const aggregateId = randomUUID();
    await recordReceipt({ commandId, actorId, commandType: 'CreateSession', aggregateId });

    const mismatched = await client
      .query('select app_private.find_command_receipt($1, $2, $3)', [
        commandId,
        'CancelSession',
        aggregateId,
      ])
      .catch((error: Error) => error);
    assertSqlState(mismatched, '23505');
  });

  test('looking up a recorded command_id under a different aggregate_id raises 23505', async () => {
    const actorId = await newUser('receipt-mismatch-aggregate@test.local');
    const commandId = randomUUID();
    await recordReceipt({
      commandId,
      actorId,
      commandType: 'CreateSession',
      aggregateId: randomUUID(),
    });

    const mismatched = await client
      .query('select app_private.find_command_receipt($1, $2, $3)', [
        commandId,
        'CreateSession',
        randomUUID(),
      ])
      .catch((error: Error) => error);
    assertSqlState(mismatched, '23505');
  });

  test('recording the same command_id twice raises 23505 rather than overwriting', async () => {
    const actorId = await newUser('receipt-duplicate@test.local');
    const commandId = randomUUID();
    const aggregateId = randomUUID();
    await recordReceipt({
      commandId,
      actorId,
      commandType: 'CreateSession',
      aggregateId,
      result: { first: true },
    });

    const duplicate = await recordReceipt({
      commandId,
      actorId,
      commandType: 'CreateSession',
      aggregateId,
      result: { second: true },
    }).catch((error: Error) => error);
    assertSqlState(duplicate, '23505');

    const stored = await client.query<{ result: unknown }>(
      'select result from app_private.command_receipts where command_id = $1',
      [commandId],
    );
    assert.deepEqual(stored.rows, [{ result: { first: true } }]);
  });

  test('deleting the actor nulls actor_id without tripping the immutability guard', async () => {
    const actorId = await newUser('receipt-actor-delete@test.local');
    const commandId = randomUUID();
    const aggregateId = randomUUID();
    const result = { ok: true };
    await recordReceipt({ commandId, actorId, commandType: 'CreateSession', aggregateId, result });

    await client.query('delete from auth.users where id = $1', [actorId]);

    const stored = await client.query<{
      actor_id: string | null;
      command_type: string;
      aggregate_id: string;
      result: unknown;
    }>(
      `select actor_id, command_type, aggregate_id, result
         from app_private.command_receipts
        where command_id = $1`,
      [commandId],
    );
    assert.deepEqual(stored.rows, [
      { actor_id: null, command_type: 'CreateSession', aggregate_id: aggregateId, result },
    ]);
  });
}
