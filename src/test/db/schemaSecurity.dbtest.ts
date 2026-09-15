import test from 'node:test';
import assert from 'node:assert/strict';
import type { Client } from 'pg';
import {
  connect,
  isTestDatabaseConfigured,
  rebuildFromMigrations,
  TEST_DATABASE_URL_VAR,
} from './harness';
import {
  ACCEPTED_NON_PUBLIC_SEARCH_PATHS,
  LEGACY_SEARCH_PATH_PUBLIC,
  TARGET_EMPTY_SEARCH_PATH_COUNT,
  W2_HARDENING_PRIORITY,
} from './schemaSecurityBaseline';

/**
 * XS-W0-04 — Schema security hardening baseline, asserted against a real PostgreSQL.
 *
 * Two kinds of assertion, deliberately separated:
 *
 *   TARGET   properties that hold today and must never regress.
 *   BASELINE legacy that C6 will harden wave by wave, frozen so it can only shrink.
 *
 * C6.01 forbids rewriting unrelated functions in one migration, so nothing is rewritten
 * here. The suite makes the safe baseline enforceable for NEW privileged surface.
 */

if (!isTestDatabaseConfigured()) {
  test(`schema security baseline requires ${TEST_DATABASE_URL_VAR}`, () => {
    assert.fail(
      `${TEST_DATABASE_URL_VAR} is not set, so no security property was proven. ` +
        'Run `npm run test:db` against a real PostgreSQL.',
    );
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

  interface DefinerRow {
    proname: string;
    config: string;
    result_type: string;
    anon_exec: boolean;
    public_exec: boolean;
  }

  const definers = async (): Promise<DefinerRow[]> => {
    const { rows } = await client.query<DefinerRow>(`
      select p.proname,
             coalesce(array_to_string(p.proconfig, ','), 'UNPINNED') as config,
             pg_get_function_result(p.oid) as result_type,
             has_function_privilege('anon', p.oid, 'EXECUTE') as anon_exec,
             has_function_privilege('public', p.oid, 'EXECUTE') as public_exec
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prosecdef
      order by p.proname
    `);
    return rows;
  };

  // ── TARGET: must never regress ───────────────────────────────────────────
  test('TARGET: no callable SECURITY DEFINER function is exposed to anon or PUBLIC', async () => {
    // GINV-SEC-004: a definer function is a privileged endpoint. Reachable-by-anonymous is
    // the highest-severity shape, because PostgREST publishes public-schema functions.
    //
    // Trigger and event-trigger functions are excluded: PostgreSQL refuses to invoke them
    // directly ("trigger functions can only be called as triggers"), which this suite
    // verifies below rather than assuming.
    const exposed = (await definers()).filter(
      (row) =>
        (row.anon_exec || row.public_exec) &&
        row.result_type !== 'trigger' &&
        row.result_type !== 'event_trigger',
    );

    assert.deepEqual(
      exposed.map((row) => row.proname),
      [],
      'a callable SECURITY DEFINER function became reachable by anon/PUBLIC',
    );
  });

  test('TARGET: the event trigger definer is neither granted to anon nor invokable', async () => {
    // Proves the exemption above instead of trusting it: no API role holds EXECUTE, and even
    // the owner cannot call it outside an event trigger.
    const { rows } = await client.query<{ allowed: boolean }>(
      "select has_function_privilege('anon', 'public.rls_auto_enable()', 'EXECUTE') as allowed",
    );
    assert.equal(rows[0].allowed, false, 'rls_auto_enable must not be executable by anon');

    const attempt = await client
      .query('select public.rls_auto_enable();')
      .catch((error: Error) => error);

    assert.ok(attempt instanceof Error, 'an event trigger function must not be directly callable');
    assert.match((attempt as Error).message, /can only be called as triggers/i);
  });

  test('TARGET: anon holds no table privilege anywhere in public', async () => {
    const { rows } = await client.query<{ relname: string }>(`
      select c.relname
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
        and (has_table_privilege('anon', c.oid, 'SELECT')
          or has_table_privilege('anon', c.oid, 'INSERT')
          or has_table_privilege('anon', c.oid, 'UPDATE')
          or has_table_privilege('anon', c.oid, 'DELETE'))
      order by c.relname
    `);

    // ADR-SEC-002 / GINV-SEC-001: anonymous reaches shared domain state through nothing.
    assert.deepEqual(
      rows.map((row) => row.relname),
      [],
      'anon gained a table privilege; anonymous must reach shared domain state through nothing',
    );
  });

  test('TARGET: every SECURITY DEFINER function pins a search_path', async () => {
    const unpinned = (await definers()).filter((row) => row.config === 'UNPINNED');

    assert.deepEqual(
      unpinned.map((row) => row.proname),
      [],
      'an unpinned SECURITY DEFINER function is hijackable via a caller-controlled schema',
    );
  });

  // ── BASELINE: frozen legacy, may only shrink ─────────────────────────────
  test('BASELINE: no NEW function joins the legacy search_path=public set', async () => {
    const observed = (await definers())
      .filter((row) => row.config === 'search_path=public')
      .map((row) => row.proname);

    const added = observed.filter((name) => !LEGACY_SEARCH_PATH_PUBLIC.includes(name));
    const removed = LEGACY_SEARCH_PATH_PUBLIC.filter((name) => !observed.includes(name));

    assert.deepEqual(
      added,
      [],
      'a new SECURITY DEFINER function used search_path=public. ADR-SEC-003 requires ' +
        "SET search_path = '' with fully qualified objects. Fix the function rather than " +
        'extending this baseline.',
    );
    assert.deepEqual(
      removed,
      [],
      'these functions were hardened; remove them from LEGACY_SEARCH_PATH_PUBLIC so the ' +
        'backlog reflects reality: ' +
        removed.join(', '),
    );
  });

  test('BASELINE: functions already meeting the target are not lost', async () => {
    const empty = (await definers()).filter((row) => row.config === 'search_path=""');

    assert.ok(
      empty.length >= TARGET_EMPTY_SEARCH_PATH_COUNT,
      `expected at least ${TARGET_EMPTY_SEARCH_PATH_COUNT} function(s) with the target ` +
        `search_path='', found ${empty.length}`,
    );
  });

  test('BASELINE: accepted non-public search paths stay as classified', async () => {
    const rows = await definers();
    for (const [name, expected] of Object.entries(ACCEPTED_NON_PUBLIC_SEARCH_PATHS)) {
      const found = rows.find((row) => row.proname === name);
      assert.ok(found, `${name} is missing from the schema`);
      assert.equal(found.config, expected, `${name} changed its search_path classification`);
    }
  });

  test('BASELINE: the W2 hardening priority list is a real subset of the backlog', () => {
    // Keeps the backlog honest: a priority entry that is not actually pending is noise.
    const stale = W2_HARDENING_PRIORITY.filter((name) => !LEGACY_SEARCH_PATH_PUBLIC.includes(name));

    assert.deepEqual(
      stale,
      [],
      'W2 priority names no longer pending hardening: ' + stale.join(', '),
    );
  });

  // ── Adversarial ──────────────────────────────────────────────────────────
  test('ADVERSARIAL: anon cannot escalate through a privileged membership RPC', async () => {
    // BOLA/escalation shape: call a real privileged RPC with valid-looking arguments as an
    // unauthenticated caller. Must be refused by grants, not merely return nothing.
    await client.query('begin');
    try {
      await client.query("select set_config('request.jwt.claim.role', 'anon', true)");
      await client.query('set local role anon');

      const attempt = await client
        .query('select public.set_community_member_role($1, $2)', [
          '00000000-0000-0000-0000-000000000001',
          'owner',
        ])
        .catch((error: Error) => error);

      assert.ok(attempt instanceof Error, 'anon must not reach a privileged membership RPC');
      assert.match((attempt as Error).message, /permission denied|does not exist/i);
    } finally {
      await client.query('rollback').catch(() => undefined);
    }
  });
}
