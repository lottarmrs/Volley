import test from 'node:test';
import assert from 'node:assert/strict';
import type { Client } from 'pg';
import {
  asIdentity,
  connect,
  isTestDatabaseConfigured,
  loadMigrations,
  rebuildFromMigrations,
  splitSqlStatements,
  TEST_DATABASE_URL_VAR,
} from './harness';
import { seedWorld, type SeededWorld } from './seed';

const MIGRATION = '20260915150000_advisor_security_findings.sql';

const ANON_HELPERS = [
  'public.current_user_active_player_id()',
  'public.current_user_has_community_capability(uuid, text)',
  'public.current_user_is_active_community_member(uuid)',
  'public.player_is_linked_to_current_user(uuid)',
];

/**
 * Supabase security advisor of 2026-09-15, reproduced on plain PostgreSQL.
 *
 * The cloud project grants `anon` ALL on every table and EXECUTE on every function in
 * `public` through default privileges, which a plain Postgres never does. The suite applies
 * those grants after the rebuild and then replays the migration, so it proves the migration
 * closes the Supabase shape and not just the harness shape.
 */

if (!isTestDatabaseConfigured()) {
  test(`advisor security findings require ${TEST_DATABASE_URL_VAR}`, () => {
    assert.fail(`${TEST_DATABASE_URL_VAR} is not set, so no security property was proven.`);
  });
} else {
  let client: Client;
  let world: SeededWorld;

  const replayMigration = async () => {
    const migration = loadMigrations().find(({ name }) => name === MIGRATION);
    assert.ok(migration, `missing ${MIGRATION}`);
    for (const statement of splitSqlStatements(migration.sql)) {
      await client.query(statement);
    }
  };

  test.before(async () => {
    client = await connect();
    const { failures } = await rebuildFromMigrations(client);
    assert.deepEqual(
      failures.filter((failure) => failure.migration === MIGRATION),
      [],
      'the migration must apply cleanly in the chain',
    );
    world = await seedWorld(client);
    await client.query("update public.profiles set name = 'Dono A' where id = $1", [world.ownerA]);

    await client.query(`
      grant all on all tables in schema public to anon;
      grant all on all sequences in schema public to anon;
      alter default privileges for role postgres in schema public grant all on tables to anon;
      alter default privileges for role postgres in schema public grant all on sequences to anon;
      alter default privileges for role postgres in schema public grant execute on functions to anon;
      grant execute on function public.rls_auto_enable() to public, anon, authenticated;
    `);
    for (const helper of ANON_HELPERS) {
      await client.query(`grant execute on function ${helper} to anon`);
    }

    await replayMigration();
  });

  test.after(async () => {
    await client?.end();
  });

  test('anon holds no table or sequence privilege in public, even after Supabase grants', async () => {
    const { rows } = await client.query<{ relname: string }>(`
      select c.relname
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and (
          (c.relkind in ('r', 'v', 'm', 'p')
            and (has_table_privilege('anon', c.oid, 'SELECT')
              or has_table_privilege('anon', c.oid, 'INSERT')
              or has_table_privilege('anon', c.oid, 'UPDATE')
              or has_table_privilege('anon', c.oid, 'DELETE')
              or has_table_privilege('anon', c.oid, 'TRUNCATE')))
          or (c.relkind = 'S' and has_sequence_privilege('anon', c.oid, 'USAGE'))
        )
      order by c.relname
    `);

    assert.deepEqual(
      rows.map((row) => row.relname),
      [],
    );
  });

  test('objects created later in public do not inherit anon privileges', async () => {
    const { rows } = await client.query<{ acl: string }>(`
      select array_to_string(d.defaclacl, ',') as acl
      from pg_default_acl d join pg_namespace n on n.oid = d.defaclnamespace
      where n.nspname = 'public' and d.defaclrole = 'postgres'::regrole
    `);

    for (const row of rows) {
      assert.doesNotMatch(row.acl, /(^|,)anon=/, `default privileges still grant anon: ${row.acl}`);
    }
  });

  test('anon cannot execute the SECURITY DEFINER helpers the advisor listed', async () => {
    for (const helper of ANON_HELPERS) {
      const { rows } = await client.query<{ allowed: boolean }>(
        `select has_function_privilege('anon', $1, 'EXECUTE') as allowed`,
        [helper],
      );
      assert.equal(rows[0].allowed, false, `${helper} is still executable by anon`);

      const { rows: authenticated } = await client.query<{ allowed: boolean }>(
        `select has_function_privilege('authenticated', $1, 'EXECUTE') as allowed`,
        [helper],
      );
      assert.equal(authenticated[0].allowed, true, `${helper} must stay usable by RLS policies`);
    }
  });

  test('rls_auto_enable is not exposed as an RPC to any API role', async () => {
    for (const role of ['public', 'anon', 'authenticated']) {
      const { rows } = await client.query<{ allowed: boolean }>(
        `select has_function_privilege($1, 'public.rls_auto_enable()', 'EXECUTE') as allowed`,
        [role],
      );
      assert.equal(rows[0].allowed, false, `rls_auto_enable is executable by ${role}`);
    }
  });

  test('sync_community_player_active_status pins an empty search_path and still syncs', async () => {
    const { rows } = await client.query<{ config: string | null }>(`
      select array_to_string(proconfig, ',') as config
      from pg_proc where oid = 'public.sync_community_player_active_status()'::regprocedure
    `);
    assert.equal(rows[0].config, 'search_path=""');

    await client.query('begin');
    try {
      const { rows: updated } = await client.query<{ active: boolean }>(
        `update public.community_players set status = 'inactive'
         where community_id = $1 and player_id = $2 returning active`,
        [world.communityA, world.playerA],
      );
      assert.equal(updated[0].active, false);
    } finally {
      await client.query('rollback');
    }
  });

  test('the SECURITY DEFINER view community_profile_summary is gone', async () => {
    const { rows } = await client.query<{ found: string | null }>(
      `select to_regclass('public.community_profile_summary')::text as found`,
    );
    assert.equal(rows[0].found, null);
  });

  test('community_profile_summaries returns id and name of a member sharing a community', async () => {
    const rows = await asIdentity(client, world.memberA, async () => {
      const result = await client.query('select * from public.community_profile_summaries($1)', [
        [world.ownerA, world.ownerB],
      ]);
      return result;
    });

    assert.deepEqual(
      rows.fields.map((field) => field.name),
      ['id', 'name'],
    );
    assert.deepEqual(rows.rows, [{ id: world.ownerA, name: 'Dono A' }]);
  });

  test('community_profile_summaries returns nothing to a user sharing no community', async () => {
    const rows = await asIdentity(client, world.outsider, async () => {
      const result = await client.query('select * from public.community_profile_summaries($1)', [
        [world.ownerA, world.memberA],
      ]);
      return result.rows;
    });

    assert.deepEqual(rows, []);
  });

  test('community_profile_summaries is refused to anon', async () => {
    const attempt = await asIdentity(client, null, () =>
      client.query('select * from public.community_profile_summaries($1)', [[world.ownerA]]),
    ).catch((error: Error) => error);

    assert.ok(attempt instanceof Error, 'anon must not reach community_profile_summaries');
    assert.match((attempt as Error).message, /permission denied/i);
  });
}
