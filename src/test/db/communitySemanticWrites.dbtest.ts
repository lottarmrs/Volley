import test from 'node:test';
import assert from 'node:assert/strict';
import type { Client, Pool, QueryResultRow } from 'pg';
import {
  asIdentity,
  asIdentityCommitting,
  connect,
  createPool,
  isTestDatabaseConfigured,
  rebuildFromMigrations,
  TEST_DATABASE_URL_VAR,
} from './harness';

/**
 * XS-W2-06 exit gate, against a real PostgreSQL:
 *
 *   For target Communities:
 *     communityCloudService generic mutation path = disabled
 *     semantic command path = only writer
 *
 * The gate has two halves and both must be proven. A test that only shows the generic path
 * failing would also pass if the semantic path were broken too, leaving the community
 * unwritable rather than correctly governed.
 *
 * Cohort scoping is the other half of the story: legacy rows must keep working untouched,
 * or this would be a big-bang cutover rather than a strangler step.
 */

if (!isTestDatabaseConfigured()) {
  test(`community semantic writes require ${TEST_DATABASE_URL_VAR}`, () => {
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

  async function targetCommunity(ownerId: string, name: string): Promise<string> {
    const { rows } = await call<{ id: string }>(
      ownerId,
      'select public.create_community_with_owner($1) as id',
      [name],
    );
    return rows[0].id;
  }

  /** A row written the legacy way: no membership relation, legacy authority model. */
  async function legacyCommunity(ownerId: string, name: string): Promise<string> {
    const { rows } = await client.query<{ id: string }>(
      'insert into public.communities (name, owner_id) values ($1, $2) returning id',
      [name, ownerId],
    );
    return rows[0].id;
  }

  async function nameOf(communityId: string): Promise<string> {
    const { rows } = await client.query<{ name: string }>(
      'select name from public.communities where id = $1',
      [communityId],
    );
    return rows[0].name;
  }

  // ── Cohort ───────────────────────────────────────────────────────────────
  test('a community created through the command is born into the target cohort', async () => {
    const owner = await newUser('sw-owner@test.local');
    const community = await targetCommunity(owner, 'Born Target');

    const { rows } = await client.query<{ authority_model: string }>(
      'select authority_model from public.communities where id = $1',
      [community],
    );
    assert.equal(rows[0].authority_model, 'target');
  });

  test('an existing row stays legacy, so nothing changes behaviour on deploy', async () => {
    const owner = await newUser('sw-legacy-owner@test.local');
    const community = await legacyCommunity(owner, 'Stays Legacy');

    const { rows } = await client.query<{ authority_model: string }>(
      'select authority_model from public.communities where id = $1',
      [community],
    );
    assert.equal(rows[0].authority_model, 'legacy');
  });

  // ── EXIT GATE, half one: generic path disabled ───────────────────────────
  test('EXIT GATE: a generic UPDATE on a target community is refused', async () => {
    const owner = await newUser('sw-generic-owner@test.local');
    const community = await targetCommunity(owner, 'Generic');

    // This is the shape communityCloudService uses: map the domain object onto the row and
    // write it. Even as the table owner, it must be refused.
    const attempt = await client
      .query("update public.communities set name = 'hijacked' where id = $1", [community])
      .catch((error: Error) => error);

    assert.ok(attempt instanceof Error, 'the generic mutation path must be disabled');
    assert.match((attempt as Error).message, /use the semantic commands/i);
    assert.equal(await nameOf(community), 'Generic', 'and the row is unchanged');
  });

  test('EXIT GATE: a generic DELETE on a target community is refused', async () => {
    const owner = await newUser('sw-del-owner@test.local');
    const community = await targetCommunity(owner, 'NoDelete');

    const attempt = await client
      .query('delete from public.communities where id = $1', [community])
      .catch((error: Error) => error);

    assert.ok(attempt instanceof Error);
    const { rowCount } = await client.query('select 1 from public.communities where id = $1', [
      community,
    ]);
    assert.equal(rowCount, 1, 'the community survives');
  });

  test('EXIT GATE: a generic write cannot reach owner_id or authority_model', async () => {
    // The two fields that make a generic patch dangerous: one changes who owns the
    // community, the other would opt the row back out of the target cohort entirely.
    const owner = await newUser('sw-esc-owner@test.local');
    const attacker = await newUser('sw-esc-attacker@test.local');
    const community = await targetCommunity(owner, 'Escape');

    for (const sql of [
      'update public.communities set owner_id = $2 where id = $1',
      "update public.communities set authority_model = 'legacy' where id = $1",
    ]) {
      const attempt = await client.query(sql, [community, attacker]).catch((error: Error) => error);
      assert.ok(attempt instanceof Error, `must refuse: ${sql}`);
    }

    const { rows } = await client.query<{ owner_id: string; authority_model: string }>(
      'select owner_id, authority_model from public.communities where id = $1',
      [community],
    );
    assert.equal(rows[0].owner_id, owner, 'ownership is unmoved');
    assert.equal(rows[0].authority_model, 'target', 'and the row cannot escape the cohort');
  });

  // ── EXIT GATE, half two: semantic path IS the writer ─────────────────────
  test('EXIT GATE: the semantic command does write', async () => {
    const owner = await newUser('sw-sem-owner@test.local');
    const community = await targetCommunity(owner, 'Before');

    await call(owner, 'select public.update_community_profile($1, $2, null, null)', [
      community,
      'After',
    ]);

    assert.equal(await nameOf(community), 'After', 'the sanctioned path must work');
  });

  test('the semantic command changes only the fields it was given', async () => {
    // Named columns, not a patch: omitting a field must leave it alone rather than
    // overwrite it with null.
    const owner = await newUser('sw-partial-owner@test.local');
    const community = await targetCommunity(owner, 'Partial');
    await call(owner, 'select public.update_community_profile($1, null, $2, $3)', [
      community,
      'a description',
      'a location',
    ]);

    await call(owner, 'select public.update_community_profile($1, $2, null, null)', [
      community,
      'Renamed',
    ]);

    const { rows } = await client.query<{
      name: string;
      description: string;
      default_location: string;
    }>('select name, description, default_location from public.communities where id = $1', [
      community,
    ]);
    assert.equal(rows[0].name, 'Renamed');
    assert.equal(rows[0].description, 'a description', 'an omitted field is not cleared');
    assert.equal(rows[0].default_location, 'a location');
  });

  test('the guard closes again after a semantic command commits', async () => {
    // The flag is transaction-local, so it must not leave a window in which generic writes
    // are accepted afterwards.
    const owner = await newUser('sw-flag-owner@test.local');
    const community = await targetCommunity(owner, 'FlagWindow');
    await call(owner, 'select public.update_community_profile($1, $2, null, null)', [
      community,
      'Legit',
    ]);

    const attempt = await client
      .query("update public.communities set name = 'sneaky' where id = $1", [community])
      .catch((error: Error) => error);
    assert.ok(attempt instanceof Error, 'the guard must be closed again');
    assert.equal(await nameOf(community), 'Legit');
  });

  // ── Compatibility: legacy cohort keeps working ───────────────────────────
  test('COMPATIBILITY: the legacy cohort still accepts generic writes', async () => {
    // Without this, the slice would be a big-bang cutover rather than a strangler step.
    const owner = await newUser('sw-compat-owner@test.local');
    const community = await legacyCommunity(owner, 'Legacy Writable');

    await client.query("update public.communities set name = 'Legacy Renamed' where id = $1", [
      community,
    ]);
    assert.equal(await nameOf(community), 'Legacy Renamed');
  });

  // ── Authorization ────────────────────────────────────────────────────────
  test('profile update requires the capability, not a rank comparison', async () => {
    const owner = await newUser('sw-cap-owner@test.local');
    const plain = await newUser('sw-cap-plain@test.local');
    const community = await targetCommunity(owner, 'CapCheck');
    await client.query(
      `insert into public.community_memberships (community_id, user_id, role, status)
       values ($1, $2, 'member', 'active')`,
      [community, plain],
    );

    const attempt = await callFailing(
      plain,
      'select public.update_community_profile($1, $2, null, null)',
      [community, 'nope'],
    );
    assert.ok(attempt instanceof Error);
    assert.match((attempt as Error).message, /community\.profile\.update/);
    assert.equal(await nameOf(community), 'CapCheck');
  });

  test('an Admin may edit the profile but may NOT archive', async () => {
    // OPEN-COM-004 is open, and its conservative behaviour forbids assuming permission by
    // hierarchy. So archive is the Owner's alone until that decision lands.
    const owner = await newUser('sw-adm-owner@test.local');
    const admin = await newUser('sw-adm-admin@test.local');
    const community = await targetCommunity(owner, 'AdminScope');
    await client.query(
      `insert into public.community_memberships (community_id, user_id, role, status)
       values ($1, $2, 'admin', 'active')`,
      [community, admin],
    );

    await call(admin, 'select public.update_community_profile($1, $2, null, null)', [
      community,
      'Admin Renamed',
    ]);
    assert.equal(await nameOf(community), 'Admin Renamed', 'an admin may edit the profile');

    const archive = await callFailing(admin, 'select public.archive_community($1)', [community]);
    assert.ok(archive instanceof Error, 'an admin must not archive by rank');
    assert.match((archive as Error).message, /community\.archive/);

    const { rows } = await client.query<{ archived: boolean }>(
      'select archived from public.communities where id = $1',
      [community],
    );
    assert.equal(rows[0].archived, false);
  });

  test('the Owner may archive', async () => {
    const owner = await newUser('sw-arch-owner@test.local');
    const community = await targetCommunity(owner, 'Archivable');

    await call(owner, 'select public.archive_community($1)', [community]);

    const { rows } = await client.query<{ archived: boolean }>(
      'select archived from public.communities where id = $1',
      [community],
    );
    assert.equal(rows[0].archived, true);
  });

  test('no restore command exists, because the policy is not accepted', async () => {
    // C6.01 describes RestoreCommunity as "if/when policy accepted". Shipping one would
    // decide by implementation who may bring an archived community back.
    const { rows } = await client.query<{ n: string }>(
      `select count(*)::text as n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname like '%restore_community%'`,
    );
    assert.equal(
      rows[0].n,
      '0',
      'a restore command appearing means the policy was accepted; assert the policy instead',
    );
  });

  test('anonymous reaches none of the write commands', async () => {
    const owner = await newUser('sw-anon-owner@test.local');
    const community = await targetCommunity(owner, 'AnonWrite');

    for (const [sql, params] of [
      ['select public.update_community_profile($1, $2, null, null)', [community, 'x']],
      ['select public.archive_community($1)', [community]],
    ] as const) {
      const attempt = await callFailing(null, sql, [...params]);
      assert.ok(attempt instanceof Error, `anon must not call ${sql}`);
    }
    assert.equal(await nameOf(community), 'AnonWrite');
  });

  // ── Integration with the earlier slices ──────────────────────────────────
  test('TransferOwnership still works now that the guard exists', async () => {
    // It writes communities.owner_id, so it had to announce itself to the new guard. This
    // is the integration point the cutover forces, and it would break silently if missed.
    const owner = await newUser('sw-xfer-owner@test.local');
    const heir = await newUser('sw-xfer-heir@test.local');
    const community = await targetCommunity(owner, 'XferGuard');
    await client.query(
      `insert into public.community_memberships (community_id, user_id, role, status)
       values ($1, $2, 'member', 'active')`,
      [community, heir],
    );

    await call(owner, 'select public.transfer_community_ownership_v2($1, $2)', [community, heir]);

    const { rows } = await client.query<{ owner_id: string }>(
      'select owner_id from public.communities where id = $1',
      [community],
    );
    assert.equal(rows[0].owner_id, heir, 'ownership transfer must survive the new guard');
  });

  test('SECURITY: the write commands meet the XS-W0-04 target contract', async () => {
    const { rows } = await client.query<{
      proname: string;
      config: string[] | null;
      anon: boolean;
    }>(
      `select p.proname, p.proconfig as config,
              has_function_privilege('anon', p.oid, 'EXECUTE') as anon
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname in ('update_community_profile', 'archive_community',
                           'guard_target_community_writes')`,
    );
    assert.equal(rows.length, 3);
    for (const row of rows) {
      assert.deepEqual(
        row.config,
        ['search_path=""'],
        `${row.proname} must pin an empty search_path`,
      );
      assert.equal(row.anon, false, `${row.proname} must not be reachable by anon`);
    }
  });

  test('reads remain available to members through RLS', async () => {
    // "Simple safe reads may still use RLS-backed select." The cutover disables generic
    // WRITES, not reading.
    const owner = await newUser('sw-read-owner@test.local');
    const community = await targetCommunity(owner, 'Readable');

    const db = await pool.connect();
    try {
      const visible = await asIdentity(db, owner, () =>
        db.query('select id from public.communities where id = $1', [community]),
      );
      assert.equal(visible.rowCount, 1, 'a member must still be able to read');
    } finally {
      db.release();
    }
  });
}
