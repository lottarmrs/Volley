import test from 'node:test';
import assert from 'node:assert/strict';
import type { Client, Pool } from 'pg';
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
 * XS-W2-04 — Community ownership invariant, against a real PostgreSQL.
 *
 * GINV-COM-001 is two obligations with different mechanisms:
 *   at most one   partial unique index
 *   at least one  trigger, because SQL cannot require that a row exists
 *
 * The concurrency requirement is the sharp edge: "two transfers racing must not yield
 * 0 owners or 2 owners". That is tested with genuinely concurrent transactions on separate
 * connections (QA-INV-008), not with sequential calls pretending to race.
 */

if (!isTestDatabaseConfigured()) {
  test(`community ownership requires ${TEST_DATABASE_URL_VAR}`, () => {
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

  async function member(communityId: string, userId: string, role = 'member'): Promise<void> {
    await client.query(
      `insert into public.community_memberships (community_id, user_id, role, status)
       values ($1, $2, $3, 'active')
       on conflict (community_id, user_id) do update set role = excluded.role`,
      [communityId, userId, role],
    );
  }

  /** Creates a community through the TARGET command, as an authenticated caller. */
  async function createCommunityAs(userId: string, name: string): Promise<string> {
    const db = await pool.connect();
    try {
      const { rows } = await asIdentityCommitting(db, userId, () =>
        db.query<{ id: string }>('select public.create_community_with_owner($1) as id', [name]),
      );
      return rows[0].id;
    } finally {
      db.release();
    }
  }

  async function activeOwners(communityId: string): Promise<string[]> {
    const { rows } = await client.query<{ user_id: string }>(
      `select user_id from public.community_memberships
        where community_id = $1 and role = 'owner' and status = 'active'`,
      [communityId],
    );
    return rows.map((r) => r.user_id);
  }

  // ── CreateCommunity ──────────────────────────────────────────────────────
  test('CreateCommunity commits root and OWNER membership atomically', async () => {
    const founder = await newUser('own-founder@test.local');
    const community = await createCommunityAs(founder, 'Atomic');

    const root = await client.query('select 1 from public.communities where id = $1', [community]);
    assert.equal(root.rowCount, 1, 'the community root must exist');
    assert.deepEqual(await activeOwners(community), [founder], 'with exactly one active owner');
  });

  test('CreateCommunity refuses an unauthenticated caller', async () => {
    const db = await pool.connect();
    try {
      const attempt = await asIdentity(db, null, () =>
        db.query('select public.create_community_with_owner($1)', ['Anon']),
      ).catch((error: Error) => error);
      assert.ok(attempt instanceof Error);
      assert.match((attempt as Error).message, /not authenticated|permission denied/i);
    } finally {
      db.release();
    }
  });

  test('a failed CreateCommunity leaves no orphan community', async () => {
    // Atomicity in the direction that matters: if the membership insert fails, the root
    // insert must not survive, or the community would exist with no owner at all.
    const founder = await newUser('own-atomic@test.local');
    const before = await client.query<{ n: string }>(
      'select count(*)::text as n from public.communities',
    );

    const db = await pool.connect();
    try {
      const attempt = await asIdentity(db, founder, () =>
        db.query('select public.create_community_with_owner($1)', ['   ']),
      ).catch((error: Error) => error);
      assert.ok(attempt instanceof Error, 'a blank name must be refused');
    } finally {
      db.release();
    }

    const after = await client.query<{ n: string }>(
      'select count(*)::text as n from public.communities',
    );
    assert.equal(after.rows[0].n, before.rows[0].n, 'no community may survive a failed create');
  });

  // ── At most one ──────────────────────────────────────────────────────────
  test('the database refuses a second active owner', async () => {
    const founder = await newUser('atmost-founder@test.local');
    const other = await newUser('atmost-other@test.local');
    const community = await createCommunityAs(founder, 'AtMostOne');

    const second = await client
      .query(
        `insert into public.community_memberships (community_id, user_id, role, status)
         values ($1, $2, 'owner', 'active')`,
        [community, other],
      )
      .catch((error: Error) => error);

    assert.ok(second instanceof Error, 'a second active owner must be refused');
    assert.match((second as Error).message, /community_memberships_one_active_owner/);
  });

  // ── At least one ─────────────────────────────────────────────────────────
  test('the last owner cannot be demoted, suspended or deleted', async () => {
    const founder = await newUser('atleast-founder@test.local');
    const community = await createCommunityAs(founder, 'AtLeastOne');

    for (const [label, sql] of [
      ['demote', "update public.community_memberships set role = 'admin' where community_id = $1"],
      [
        'suspend',
        "update public.community_memberships set status = 'suspended' where community_id = $1",
      ],
      ['delete', 'delete from public.community_memberships where community_id = $1'],
    ] as const) {
      const attempt = await client.query(sql, [community]).catch((error: Error) => error);
      assert.ok(attempt instanceof Error, `${label} of the last owner must be refused`);
      assert.match((attempt as Error).message, /exactly one active owner/i);
    }

    assert.deepEqual(await activeOwners(community), [founder], 'ownership survives every attempt');
  });

  test('a non-last owner change is allowed once another owner exists', async () => {
    // Proves the guard is not simply "never touch an owner row": it permits the change as
    // soon as the invariant would still hold.
    const founder = await newUser('nonlast-founder@test.local');
    const heir = await newUser('nonlast-heir@test.local');
    const community = await createCommunityAs(founder, 'NonLast');
    await member(community, heir, 'admin');

    const db = await pool.connect();
    try {
      await asIdentityCommitting(db, founder, () =>
        db.query('select public.transfer_community_ownership_v2($1, $2)', [community, heir]),
      );
    } finally {
      db.release();
    }

    assert.deepEqual(await activeOwners(community), [heir]);

    // The former owner is now an ordinary admin and may leave freely.
    const removed = await client.query(
      'delete from public.community_memberships where community_id = $1 and user_id = $2',
      [community, founder],
    );
    assert.equal(removed.rowCount, 1, 'a non-owner may be removed');
    assert.deepEqual(await activeOwners(community), [heir], 'ownership is untouched');
  });

  // ── Transfer ─────────────────────────────────────────────────────────────
  test('TransferCommunityOwnership leaves exactly one active owner', async () => {
    const founder = await newUser('xfer-founder@test.local');
    const heir = await newUser('xfer-heir@test.local');
    const community = await createCommunityAs(founder, 'Transfer');
    await member(community, heir);

    const db = await pool.connect();
    try {
      await asIdentityCommitting(db, founder, () =>
        db.query('select public.transfer_community_ownership_v2($1, $2)', [community, heir]),
      );
    } finally {
      db.release();
    }

    assert.deepEqual(await activeOwners(community), [heir]);

    // The denormalised column follows the relation.
    const { rows } = await client.query<{ owner_id: string }>(
      'select owner_id from public.communities where id = $1',
      [community],
    );
    assert.equal(rows[0].owner_id, heir);
  });

  test('only the current owner may transfer', async () => {
    const founder = await newUser('auth-founder@test.local');
    const impostor = await newUser('auth-impostor@test.local');
    const community = await createCommunityAs(founder, 'AuthXfer');
    await member(community, impostor, 'admin');

    const db = await pool.connect();
    try {
      const attempt = await asIdentityCommitting(db, impostor, () =>
        db.query('select public.transfer_community_ownership_v2($1, $2)', [community, impostor]),
      ).catch((error: Error) => error);
      assert.ok(attempt instanceof Error, 'an admin must not seize ownership');
    } finally {
      db.release();
    }

    assert.deepEqual(await activeOwners(community), [founder]);
  });

  test('ownership cannot be handed to a non-member', async () => {
    // Ownership is not a way to add someone to a community.
    const founder = await newUser('outsider-founder@test.local');
    const outsider = await newUser('outsider@test.local');
    const community = await createCommunityAs(founder, 'Outsider');

    const db = await pool.connect();
    try {
      const attempt = await asIdentityCommitting(db, founder, () =>
        db.query('select public.transfer_community_ownership_v2($1, $2)', [community, outsider]),
      ).catch((error: Error) => error);
      assert.ok(attempt instanceof Error);
      assert.match((attempt as Error).message, /already be an active member/i);
    } finally {
      db.release();
    }

    assert.deepEqual(await activeOwners(community), [founder]);
  });

  // ── CONCURRENCY ──────────────────────────────────────────────────────────
  test('CONCURRENCY: two racing transfers yield neither 0 nor 2 owners', async () => {
    // QA-INV-008: genuinely concurrent transactions on separate connections. The founder
    // attempts to hand ownership to two different heirs at the same instant.
    const founder = await newUser('race-founder@test.local');
    const heirA = await newUser('race-heir-a@test.local');
    const heirB = await newUser('race-heir-b@test.local');
    const community = await createCommunityAs(founder, 'Race');
    await member(community, heirA);
    await member(community, heirB);

    const a = await pool.connect();
    const b = await pool.connect();
    try {
      const transfer = (db: typeof a, heir: string) =>
        asIdentityCommitting(db, founder, () =>
          db.query('select public.transfer_community_ownership_v2($1, $2)', [community, heir]),
        )
          .then(() => 'committed' as const)
          .catch((error: Error) => error);

      // Fired together, deliberately without awaiting the first.
      const [first, second] = await Promise.all([transfer(a, heirA), transfer(b, heirB)]);

      const outcomes = [first, second];
      const committed = outcomes.filter((o) => o === 'committed').length;
      const rejected = outcomes.filter((o) => o instanceof Error).length;

      // Exactly one must win. Both winning would mean the lock did nothing.
      assert.equal(committed, 1, `expected exactly one transfer to commit, got ${committed}`);
      assert.equal(rejected, 1, 'the loser must be refused, not silently ignored');

      const owners = await activeOwners(community);
      assert.equal(owners.length, 1, `expected exactly 1 owner, found ${owners.length}`);
      assert.ok(
        owners[0] === heirA || owners[0] === heirB,
        'the winner must be one of the two heirs',
      );
    } finally {
      a.release();
      b.release();
    }
  });

  test('CONCURRENCY: the second transfer blocks rather than reading stale state', async () => {
    // Demonstrates the mechanism rather than only the outcome: while transaction A holds
    // the owner row, transaction B must WAIT. If it did not, both could read "founder is
    // owner" and both would proceed.
    const founder = await newUser('block-founder@test.local');
    const heirA = await newUser('block-heir-a@test.local');
    const heirB = await newUser('block-heir-b@test.local');
    const community = await createCommunityAs(founder, 'Blocking');
    await member(community, heirA);
    await member(community, heirB);

    const a = await pool.connect();
    const b = await pool.connect();
    try {
      // Held as the table owner, not as `authenticated`: SELECT ... FOR UPDATE needs UPDATE
      // privilege, which the browser role deliberately lacks. The point here is to hold the
      // row lock, not to re-test authorization.
      await a.query('begin');
      await a.query(
        `select id from public.community_memberships
          where community_id = $1 and role = 'owner' and status = 'active' for update`,
        [community],
      );

      let bFinished = false;
      const bAttempt = asIdentityCommitting(b, founder, () =>
        b.query('select public.transfer_community_ownership_v2($1, $2)', [community, heirB]),
      )
        .catch(() => undefined)
        .finally(() => {
          bFinished = true;
        });

      await new Promise((resolve) => setTimeout(resolve, 300));
      assert.equal(bFinished, false, 'the second transfer must block on the owner row lock');

      await a.query('rollback');
      await bAttempt;
      assert.equal(bFinished, true, 'and proceed once the lock is released');

      assert.deepEqual(await activeOwners(community), [heirB]);
    } finally {
      await a.query('rollback').catch(() => undefined);
      a.release();
      b.release();
    }
  });

  // ── Exit gate ────────────────────────────────────────────────────────────
  test('EXIT GATE: ownership authority is a semantic command, not a generic upsert', async () => {
    // "Community authority for migrated cohort uses target semantic commands and membership
    // state, not generic communityCloudService.upsert()." The browser cannot write the
    // membership relation at all, so the only way to move ownership is the command.
    const founder = await newUser('gate-founder@test.local');
    const heir = await newUser('gate-heir@test.local');
    const community = await createCommunityAs(founder, 'Gate');
    await member(community, heir);

    const db = await pool.connect();
    try {
      const direct = await asIdentity(db, founder, () =>
        db.query(
          "update public.community_memberships set role = 'owner' where community_id = $1 and user_id = $2",
          [community, heir],
        ),
      ).catch((error: Error) => error);

      if (direct instanceof Error) {
        assert.match((direct as Error).message, /permission denied|policy/i);
      } else {
        assert.equal(direct.rowCount, 0, 'a direct write must change nothing');
      }
      assert.deepEqual(await activeOwners(community), [founder], 'ownership is unmoved');

      // And the semantic command does work for the rightful owner.
      await asIdentityCommitting(db, founder, () =>
        db.query('select public.transfer_community_ownership_v2($1, $2)', [community, heir]),
      );
      assert.deepEqual(await activeOwners(community), [heir]);
    } finally {
      db.release();
    }
  });

  test('SECURITY: the ownership commands meet the XS-W0-04 target contract', async () => {
    const { rows } = await client.query<{ proname: string; config: string[] | null }>(
      `select p.proname, p.proconfig as config
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname in ('create_community_with_owner', 'transfer_community_ownership_v2',
                           'check_community_has_active_owner')`,
    );
    assert.equal(rows.length, 3);
    for (const row of rows) {
      assert.deepEqual(
        row.config,
        ['search_path=""'],
        `${row.proname} must pin an empty search_path`,
      );
    }

    const anonReach = await client.query<{ n: string }>(
      `select count(*)::text as n
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname in ('create_community_with_owner', 'transfer_community_ownership_v2',
                           'check_community_has_active_owner')
         and has_function_privilege('anon', p.oid, 'EXECUTE')`,
    );
    assert.equal(anonReach.rows[0].n, '0', 'anon must reach none of the ownership commands');
  });
}
