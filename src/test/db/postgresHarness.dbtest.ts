import test from 'node:test';
import assert from 'node:assert/strict';
import type { Client, Pool } from 'pg';
import {
  asIdentity,
  connect,
  createPool,
  isTestDatabaseConfigured,
  loadMigrations,
  rebuildFromMigrations,
  TEST_DATABASE_URL_VAR,
} from './harness';
import { seedWorld, type SeededWorld } from './seed';

/**
 * XS-W0-03 — initial suites, run against a REAL PostgreSQL.
 *
 * These do not run under `npm run test:unit`; they need a database and are wired to
 * `npm run test:db`. If no database is configured the run FAILS rather than skipping
 * quietly: a harness that silently goes green without a database would satisfy the exit
 * gate falsely, which is the specific failure QA-INV-003 and OPEN-QA-002 warn about.
 */

if (!isTestDatabaseConfigured()) {
  test(`PostgreSQL harness requires ${TEST_DATABASE_URL_VAR}`, () => {
    assert.fail(
      `${TEST_DATABASE_URL_VAR} is not set, so no invariant below was proven. ` +
        'Start a database with `npm run db:start` and re-run `npm run test:db`. ' +
        'The harness refuses to pass without a real PostgreSQL (QA-INV-003, QA-INV-004).',
    );
  });
} else {
  let client: Client;
  let pool: Pool;
  let world: SeededWorld;

  test.before(async () => {
    client = await connect();
    await rebuildFromMigrations(client);
    world = await seedWorld(client);
    pool = createPool();
  });

  test.after(async () => {
    await pool?.end();
    await client?.end();
  });

  // ── Suite 1 — migration chain fresh build ────────────────────────────────
  test('suite 1: the migration chain applies from zero', async () => {
    const migrations = loadMigrations();
    const { rows } = await client.query<{ table_name: string }>(
      `select table_name from information_schema.tables
       where table_schema = 'public' and table_type = 'BASE TABLE'`,
    );
    const tables = rows.map((row) => row.table_name);

    assert.ok(migrations.length >= 60, `expected the full chain, saw ${migrations.length}`);
    for (const expected of ['communities', 'community_members', 'players', 'sessions', 'games']) {
      assert.ok(tables.includes(expected), `migration chain did not create ${expected}`);
    }
  });

  test('suite 1: RLS is enabled on the shared domain tables', async () => {
    const { rows } = await client.query<{ relname: string; relrowsecurity: boolean }>(
      `select c.relname, c.relrowsecurity
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r'
         and c.relname in ('communities','community_members','players','community_players','sessions')`,
    );

    assert.ok(rows.length > 0, 'expected shared domain tables to exist');
    for (const row of rows) {
      // GINV-SEC-002: RLS is mandatory defence in depth, not an optional layer.
      assert.equal(row.relrowsecurity, true, `RLS is disabled on ${row.relname}`);
    }
  });

  // ── Suite 2 — RLS denies cross-Community read/write ──────────────────────
  test('suite 2: a member of one Community cannot read another Community', async () => {
    const db = await pool.connect();
    try {
      // Allow identity: reads its own Community (QA-INV-005 requires both directions).
      const allowed = await asIdentity(db, world.memberA, async () =>
        db.query('select id from public.communities where id = $1', [world.communityA]),
      );
      assert.equal(allowed.rowCount, 1, 'member must read its own Community');

      // Deny identity: a VALID id belonging to the other tenant (QA-INV-006 BOLA shape).
      const denied = await asIdentity(db, world.memberA, async () =>
        db.query('select id from public.communities where id = $1', [world.communityB]),
      );
      assert.equal(denied.rowCount, 0, 'RLS must hide a foreign Community by valid id');
    } finally {
      db.release();
    }
  });

  test('suite 2: an anonymous caller reads no Community at all', async () => {
    const db = await pool.connect();
    try {
      const result = await asIdentity(db, null, async () =>
        db.query('select id from public.communities'),
      );
      assert.equal(result.rowCount, 0, 'anonymous must not read shared domain rows');
    } finally {
      db.release();
    }
  });

  test('suite 2: a non-member cannot write into a foreign Community', async () => {
    const db = await pool.connect();
    try {
      await db.query('begin');
      const attempt = asIdentity(db, world.outsider, async () =>
        db.query('update public.communities set name = $1 where id = $2', [
          'hijacked',
          world.communityA,
        ]),
      );
      const result = await attempt.catch((error: Error) => error);

      if (result instanceof Error) {
        assert.match(result.message, /policy|permission|denied/i);
      } else {
        assert.equal(result.rowCount, 0, 'RLS must reject the foreign write');
      }

      await db.query('rollback');
      const { rows } = await client.query<{ name: string }>(
        'select name from public.communities where id = $1',
        [world.communityA],
      );
      assert.equal(rows[0].name, 'Community A', 'foreign write must not have landed');
    } finally {
      db.release();
    }
  });

  // ── Suite 3 — SECURITY DEFINER caller/auth context ───────────────────────
  test('suite 3: SECURITY DEFINER functions pin a non-mutable search_path', async () => {
    const { rows } = await client.query<{ proname: string; config: string[] | null }>(
      `select p.proname, p.proconfig as config
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.prosecdef`,
    );

    assert.ok(rows.length > 0, 'expected SECURITY DEFINER functions to exist');
    const unpinned = rows.filter(
      (row) => !(row.config ?? []).some((entry) => entry.startsWith('search_path=')),
    );
    // GINV-SEC-004 / ADR-SEC-003: a privileged endpoint with a mutable search_path is
    // hijackable by a caller-controlled schema.
    assert.deepEqual(
      unpinned.map((row) => row.proname),
      [],
      'SECURITY DEFINER without pinned search_path',
    );
  });

  test('suite 3: a SECURITY DEFINER RPC resolves the caller, not the definer', async () => {
    const db = await pool.connect();
    try {
      const asOwner = await asIdentity(db, world.ownerA, async () =>
        db.query<{ uid: string | null }>('select auth.uid() as uid'),
      );
      const asOutsider = await asIdentity(db, world.outsider, async () =>
        db.query<{ uid: string | null }>('select auth.uid() as uid'),
      );

      // GINV-AUTH-003: actor comes from the authenticated context, never from a payload.
      assert.equal(asOwner.rows[0].uid, world.ownerA);
      assert.equal(asOutsider.rows[0].uid, world.outsider);
      assert.notEqual(asOwner.rows[0].uid, asOutsider.rows[0].uid);
    } finally {
      db.release();
    }
  });

  // ── Suite 4 — owner/membership uniqueness foundations ────────────────────
  test('suite 4: a user cannot hold two memberships in one Community', async () => {
    // GINV-COM-001 foundation: exactly one active Owner per Community depends on the
    // membership row being unique per (community, user) at the DB level, not in the UI.
    const duplicate = client
      .query(
        `insert into public.community_members (community_id, user_id, role, status)
         values ($1, $2, 'member', 'active')`,
        [world.communityA, world.memberA],
      )
      .catch((error: Error) => error);

    const result = await duplicate;
    assert.ok(result instanceof Error, 'duplicate membership must be rejected by a constraint');
    assert.match((result as Error).message, /duplicate key|unique/i);
  });

  // ── Suite 5 — transaction rollback injected mid-command ──────────────────
  test('suite 5: a failure mid-command leaves no partial state', async () => {
    const db = await pool.connect();
    const name = 'Rollback Probe Community';
    try {
      await db.query('begin');
      await db.query('insert into public.communities (name, owner_id) values ($1, $2)', [
        name,
        world.ownerA,
      ]);
      // Inject a failure after a successful write within the same transaction.
      const failed = await db
        .query('insert into public.communities (name, owner_id) values ($1, $2)', [name, null])
        .catch((error: Error) => error);
      assert.ok(failed instanceof Error, 'expected the injected failure to raise');
      await db.query('rollback');
    } finally {
      db.release();
    }

    // QA-INV-012: prove no partial state remains, from a separate connection.
    const { rowCount } = await client.query('select 1 from public.communities where name = $1', [
      name,
    ]);
    assert.equal(rowCount, 0, 'the first insert must not survive the rolled back command');
  });

  // ── Suite 6 — concurrent update pattern ──────────────────────────────────
  test('suite 6: concurrent writers to one row serialise instead of interleaving', async () => {
    // QA-INV-008: real concurrent transactions, not sequential calls pretending to race.
    const a = await pool.connect();
    const b = await pool.connect();
    const probe = 'Concurrency Probe';
    let probeId: string;

    try {
      const created = await client.query<{ id: string }>(
        'insert into public.communities (name, owner_id) values ($1, $2) returning id',
        [probe, world.ownerA],
      );
      probeId = created.rows[0].id;

      await a.query('begin');
      await b.query('begin');

      await a.query('select id from public.communities where id = $1 for update', [probeId]);

      // B must block on A's row lock. If it does not, the lock is not doing its job.
      let bAcquired = false;
      const bLock = b
        .query('select id from public.communities where id = $1 for update', [probeId])
        .then(() => {
          bAcquired = true;
        });

      await new Promise((resolve) => setTimeout(resolve, 300));
      assert.equal(bAcquired, false, 'second writer must block while the first holds the row lock');

      await a.query('update public.communities set name = $1 where id = $2', ['A wins', probeId]);
      await a.query('commit');
      await bLock;
      assert.equal(bAcquired, true, 'second writer must proceed once the lock is released');

      const seenByB = await b.query<{ name: string }>(
        'select name from public.communities where id = $1',
        [probeId],
      );
      assert.equal(
        seenByB.rows[0].name,
        'A wins',
        'second writer must observe the committed value',
      );
      await b.query('rollback');
    } finally {
      await a.query('rollback').catch(() => undefined);
      await b.query('rollback').catch(() => undefined);
      a.release();
      b.release();
      await client.query('delete from public.communities where name in ($1, $2)', [
        probe,
        'A wins',
      ]);
    }
  });

  // ── Suite 7 — account deletion behaviour ─────────────────────────────────
  test('suite 7: deleting an account currently cascades sports history', async () => {
    // Records CURRENT behaviour, which contradicts GINV-ID-005 and ADR-SEC-011: account
    // deletion must not be a destructive sports-history cascade. The safe FK migration is
    // not in the chain yet, so this asserts the real state rather than the desired one.
    // When that migration lands this test must be inverted, and the inversion is the
    // evidence the invariant was actually fixed.
    const doomed = await client.query<{ id: string }>(
      "insert into auth.users (email) values ('doomed@test.local') returning id",
    );
    const userId = doomed.rows[0].id;
    await client.query(
      'insert into public.profiles (id, email) values ($1, $2) on conflict do nothing',
      [userId, 'doomed@test.local'],
    );
    const community = await client.query<{ id: string }>(
      'insert into public.communities (name, owner_id) values ($1, $2) returning id',
      ['Doomed Community', userId],
    );
    const communityId = community.rows[0].id;

    await client.query('delete from auth.users where id = $1', [userId]);

    const survivors = await client.query('select 1 from public.communities where id = $1', [
      communityId,
    ]);

    assert.equal(
      survivors.rowCount,
      0,
      'CURRENT behaviour: the Community is cascaded away with the account. ' +
        'If this now fails, the safe FK migration has landed and the assertion should be ' +
        'inverted to prove sports history survives (GINV-ID-005, ADR-SEC-011).',
    );
  });
}
