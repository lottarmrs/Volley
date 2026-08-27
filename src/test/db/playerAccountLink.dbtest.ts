import test from 'node:test';
import assert from 'node:assert/strict';
import type { Client, Pool } from 'pg';
import {
  asIdentity,
  connect,
  createPool,
  isTestDatabaseConfigured,
  rebuildFromMigrations,
  TEST_DATABASE_URL_VAR,
} from './harness';

/**
 * XS-W2-01 exit gate, against a REAL PostgreSQL:
 *
 *   "Target authorization/identity lookup for migrated cohort does not require
 *    players.user_id as authority."
 *
 * The slice is EXPAND ONLY. Nothing below asserts that the legacy column is gone or that
 * policies moved: both are W2 cutover, not this slice. What is asserted is that the target
 * relation can answer identity for a migrated player WITHOUT the column, that ambiguity is
 * quarantined rather than guessed, and that the V1 uniqueness assumption is actually
 * enforced by the database.
 */

if (!isTestDatabaseConfigured()) {
  test(`player account links require ${TEST_DATABASE_URL_VAR}`, () => {
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

  /**
   * Every new auth user automatically receives a linked Player, and
   * players_user_id_unique_idx forbids a second one. So a test that needs "the account's
   * player" must READ it rather than create another.
   */
  async function accountPlayer(userId: string): Promise<string> {
    const { rows } = await client.query<{ id: string }>(
      'select id from public.players where user_id = $1',
      [userId],
    );
    assert.equal(rows.length, 1, 'each account must have exactly one auto-created Player');
    return rows[0].id;
  }

  async function unlinkAccountPlayer(userId: string): Promise<string> {
    const playerId = await accountPlayer(userId);
    await client.query('update public.players set user_id = null where id = $1', [playerId]);
    return playerId;
  }

  async function newPlayer(name: string, ownerId: string, userId: string | null): Promise<string> {
    // players_account_identity_history_check: a Player carrying a user_id must also record
    // that it has account identity history. Honour the real domain constraint rather than
    // working around it, since that flag is part of what W2 has to preserve.
    const { rows } = await client.query<{ id: string }>(
      `insert into public.players (name, owner_id, user_id, has_account_identity_history)
       values ($1, $2, $3, $4) returning id`,
      [name, ownerId, userId, userId !== null],
    );
    return rows[0].id;
  }

  async function activeLink(playerId: string, userId: string): Promise<void> {
    await client.query(
      `insert into public.player_account_links (player_id, user_id, status, provenance, activated_at)
       values ($1, $2, 'ACTIVE', 'MIGRATION_REVIEW', now())`,
      [playerId, userId],
    );
  }

  // ── Schema shape ─────────────────────────────────────────────────────────
  test('the relation exists and is expand-only alongside the legacy column', async () => {
    const { rows } = await client.query<{ column_name: string }>(
      `select column_name from information_schema.columns
       where table_schema = 'public' and table_name = 'player_account_links' order by column_name`,
    );
    assert.ok(rows.length > 0, 'player_account_links must exist');

    // EXPAND ONLY: the legacy column is deliberately still present and untouched.
    const legacy = await client.query(
      `select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'players' and column_name = 'user_id'`,
    );
    assert.equal(legacy.rowCount, 1, 'players.user_id must survive this slice');
  });

  test('HYP-ID-001: at most one ACTIVE link per account', async () => {
    // Documented as a V1 assumption, but a real constraint: the database refuses, so a bug
    // cannot quietly give one account two sports identities.
    const owner = await newUser('hyp-owner@test.local');
    const a = await newPlayer('A', owner, null);
    const b = await newPlayer('B', owner, null);
    await activeLink(a, owner);

    const second = await client
      .query(
        `insert into public.player_account_links (player_id, user_id, status, provenance, activated_at)
         values ($1, $2, 'ACTIVE', 'MIGRATION_REVIEW', now())`,
        [b, owner],
      )
      .catch((error: Error) => error);

    assert.ok(second instanceof Error, 'a second ACTIVE link for one account must be refused');
    assert.match((second as Error).message, /player_account_links_one_active_per_user/);
  });

  test('HYP-ID-001: at most one ACTIVE link per Player', async () => {
    const one = await newUser('hyp-one@test.local');
    const two = await newUser('hyp-two@test.local');
    const player = await newPlayer('Shared', one, null);
    await activeLink(player, one);

    const second = await client
      .query(
        `insert into public.player_account_links (player_id, user_id, status, provenance, activated_at)
         values ($1, $2, 'ACTIVE', 'MIGRATION_REVIEW', now())`,
        [player, two],
      )
      .catch((error: Error) => error);

    assert.ok(second instanceof Error, 'two accounts must not both own one Player');
    assert.match((second as Error).message, /player_account_links_one_active_per_player/);
  });

  test('competing non-active claims are allowed, because review needs them', async () => {
    // The uniqueness is PARTIAL on purpose. Several people may claim the same Player; the
    // review workflow exists precisely to hold those competing claims side by side.
    const owner = await newUser('claims-owner@test.local');
    const first = await newUser('claims-a@test.local');
    const second = await newUser('claims-b@test.local');
    const player = await newPlayer('Contested', owner, null);

    for (const claimant of [first, second]) {
      await client.query(
        `insert into public.player_account_links (player_id, user_id, status, provenance)
         values ($1, $2, 'PROPOSED', 'SELF_CLAIM')`,
        [player, claimant],
      );
    }

    const { rows } = await client.query<{ n: string }>(
      "select count(*)::text as n from public.player_account_links where player_id = $1 and status = 'PROPOSED'",
      [player],
    );
    assert.equal(rows[0].n, '2', 'competing claims must be recordable');
  });

  test('a status change must carry its evidence', async () => {
    const owner = await newUser('evidence@test.local');
    const player = await newPlayer('Evidence', owner, null);

    // ACTIVE with no activated_at, and REJECTED with no reviewed_at, are both refused: a
    // link that cannot say when it was decided is not evidence of anything.
    const noActivatedAt = await client
      .query(
        `insert into public.player_account_links (player_id, user_id, status, provenance)
         values ($1, $2, 'ACTIVE', 'SELF_CLAIM')`,
        [player, owner],
      )
      .catch((error: Error) => error);
    assert.ok(noActivatedAt instanceof Error);
    assert.match((noActivatedAt as Error).message, /check constraint/i);

    const noReviewedAt = await client
      .query(
        `insert into public.player_account_links (player_id, user_id, status, provenance)
         values ($1, $2, 'REJECTED', 'SELF_CLAIM')`,
        [player, owner],
      )
      .catch((error: Error) => error);
    assert.ok(noReviewedAt instanceof Error);
  });

  // ── EXIT GATE ────────────────────────────────────────────────────────────
  test('EXIT GATE: identity for a migrated player resolves without players.user_id', async () => {
    const account = await newUser('migrated@test.local');
    // user_id deliberately NULL: nothing but the relation can answer this.
    const player = await newPlayer('Migrated', account, null);
    await activeLink(player, account);

    const db = await pool.connect();
    try {
      const resolved = await asIdentity(db, account, () =>
        db.query<{ id: string | null }>('select public.current_user_active_player_id() as id'),
      );
      assert.equal(resolved.rows[0].id, player, 'the relation alone must resolve the identity');

      const linked = await asIdentity(db, account, () =>
        db.query<{ ok: boolean }>('select public.player_is_linked_to_current_user($1) as ok', [
          player,
        ]),
      );
      assert.equal(linked.rows[0].ok, true);

      // And the column really is empty, so the answer cannot have come from it.
      const { rows } = await client.query<{ user_id: string | null }>(
        'select user_id from public.players where id = $1',
        [player],
      );
      assert.equal(rows[0].user_id, null, 'the migrated row carries no legacy link');
    } finally {
      db.release();
    }
  });

  test('EXIT GATE: another account is not linked to that player', async () => {
    const account = await newUser('mine@test.local');
    const stranger = await newUser('stranger@test.local');
    const player = await newPlayer('Mine', account, null);
    await activeLink(player, account);

    const db = await pool.connect();
    try {
      const linked = await asIdentity(db, stranger, () =>
        db.query<{ ok: boolean }>('select public.player_is_linked_to_current_user($1) as ok', [
          player,
        ]),
      );
      assert.equal(linked.rows[0].ok, false, 'the relation must not leak identity across accounts');
    } finally {
      db.release();
    }
  });

  test('COMPATIBILITY: an unmigrated player still resolves through the legacy column', async () => {
    // "Read adapter may prefer target active link and fall back to direct field for
    // not-yet-migrated legacy rows." This account keeps its auto-created link and gets no
    // row in the relation, so only the fallback can answer.
    const account = await newUser('legacy@test.local');
    const player = await accountPlayer(account);

    const db = await pool.connect();
    try {
      const linked = await asIdentity(db, account, () =>
        db.query<{ ok: boolean }>('select public.player_is_linked_to_current_user($1) as ok', [
          player,
        ]),
      );
      assert.equal(linked.rows[0].ok, true, 'a not-yet-migrated row must keep working');
    } finally {
      db.release();
    }
  });

  test('COMPATIBILITY: once migrated, the legacy column stops being consulted', async () => {
    // The property that makes cutover safe: for a migrated Player the relation is the
    // answer even when the legacy column disagrees.
    //
    // The divergence is built from the account's OWN auto-created Player, because a trigger
    // makes players.user_id immutable once set -- it cannot be repointed or cleared.
    const rightful = await newUser('rightful@test.local');
    const stale = await newUser('stale@test.local');
    const player = await accountPlayer(stale); // column permanently says `stale`

    await activeLink(player, rightful); // relation says `rightful`

    const db = await pool.connect();
    try {
      const byRelation = await asIdentity(db, rightful, () =>
        db.query<{ ok: boolean }>('select public.player_is_linked_to_current_user($1) as ok', [
          player,
        ]),
      );
      const byStaleColumn = await asIdentity(db, stale, () =>
        db.query<{ ok: boolean }>('select public.player_is_linked_to_current_user($1) as ok', [
          player,
        ]),
      );

      assert.equal(byRelation.rows[0].ok, true, 'the ACTIVE link decides');
      assert.equal(
        byStaleColumn.rows[0].ok,
        false,
        'the legacy column must NOT grant access once the player is migrated',
      );
    } finally {
      db.release();
    }
  });

  // ── Backfill classification ──────────────────────────────────────────────
  test('BACKFILL: a live legacy link becomes ACTIVE with recorded provenance', async () => {
    const account = await newUser('backfill-ok@test.local');
    const player = await accountPlayer(account);

    await client.query(
      `insert into public.player_account_links (player_id, user_id, status, provenance, activated_at)
       select p.id, p.user_id, 'ACTIVE', 'LEGACY_DIRECT_FIELD', now()
       from public.players p
       where p.id = $1 and p.user_id is not null and p.deleted_at is null
       on conflict do nothing`,
      [player],
    );

    const { rows } = await client.query<{ status: string; provenance: string }>(
      'select status, provenance from public.player_account_links where player_id = $1',
      [player],
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].status, 'ACTIVE');
    assert.equal(
      rows[0].provenance,
      'LEGACY_DIRECT_FIELD',
      'provenance must be recorded, not blank',
    );
  });

  test('FINDING: the current schema admits no ambiguous legacy link at all', async () => {
    // The slice asks for ambiguous links to be quarantined rather than guessed. Measuring
    // the real schema shows the backfill has NO reachable ambiguous case, because three
    // constraints combine to make every legacy link exactly one, live and permanent:
    //
    //   1. a Player is auto-created for every account, so the link always exists;
    //   2. players_user_id_unique_idx is UNIQUE on user_id and does NOT exclude deleted
    //      rows, so an account can never hold a second Player, live or deleted;
    //   3. an UPDATE trigger makes user_id immutable AND refuses to soft-delete a Player
    //      that carries account identity history.
    //
    // So the ambiguity branch in the migration is unreachable here. It is retained
    // deliberately: production may hold rows created BEFORE (2) and (3) existed, and this
    // test records that the branch is defensive rather than dead by accident. If any
    // assertion below starts failing, an ambiguous shape became constructible and the
    // branch must be exercised for real.
    const account = await newUser('nofuzz@test.local');

    const players = await client.query<{ n: string }>(
      'select count(*)::text as n from public.players where user_id = $1',
      [account],
    );
    assert.equal(players.rows[0].n, '1', 'exactly one Player per account');

    const index = await client.query<{ indexdef: string }>(
      "select indexdef from pg_indexes where indexname = 'players_user_id_unique_idx'",
    );
    assert.equal(index.rowCount, 1, 'the one-player-per-account index must exist');
    assert.equal(
      /deleted_at/.test(index.rows[0].indexdef),
      false,
      'the index must NOT exclude deleted rows, or a deleted Player could shadow a live one',
    );

    const immutable = await client.query<{ n: string }>(
      `select count(*)::text as n from pg_proc
       where prosrc like '%Canonical account identity is immutable%'`,
    );
    // Two functions carry this guard: the update trigger and the delete guard.
    assert.ok(Number(immutable.rows[0].n) >= 1, 'the immutability guard must exist');

    // And therefore the backfill quarantined nothing.
    const anomalies = await client.query<{ n: string }>(
      `select count(*)::text as n from app_private.migration_anomalies
       where source_type = 'players.user_id'`,
    );
    assert.equal(
      anomalies.rows[0].n,
      '0',
      'no legacy link was ambiguous, so the backfill is total for this schema',
    );
  });

  // ── Security ─────────────────────────────────────────────────────────────
  test('SECURITY: anon cannot read or write the relation', async () => {
    const db = await pool.connect();
    try {
      const read = await asIdentity(db, null, () =>
        db.query('select 1 from public.player_account_links'),
      ).catch((error: Error) => error);
      assert.ok(read instanceof Error, 'anon must not read account links');
      assert.match((read as Error).message, /permission denied/i);
    } finally {
      db.release();
    }
  });

  test('SECURITY: an authenticated user sees only their own links', async () => {
    const mine = await newUser('sees-mine@test.local');
    const other = await newUser('sees-other@test.local');
    const minePlayer = await newPlayer('SeeMine', mine, null);
    const otherPlayer = await newPlayer('SeeOther', other, null);
    await activeLink(minePlayer, mine);
    await activeLink(otherPlayer, other);

    const db = await pool.connect();
    try {
      const visible = await asIdentity(db, mine, () =>
        db.query<{ user_id: string }>('select user_id from public.player_account_links'),
      );
      assert.ok(visible.rowCount && visible.rowCount > 0, 'a user must see their own links');
      for (const row of visible.rows) {
        assert.equal(row.user_id, mine, 'no other account may be visible');
      }
    } finally {
      db.release();
    }
  });

  test('SECURITY: no write path exists yet, because OPEN-ID-001 is undecided', async () => {
    // C6.01: "Exact approval authority remains blocked by OPEN-ID-001 before broad claim
    // flow." So an authenticated user must NOT be able to create or promote a link. If this
    // starts failing, an approval path was added and OPEN-ID-001 must have been closed.
    const account = await newUser('nowrite@test.local');
    const player = await newPlayer('NoWrite', account, null);

    const db = await pool.connect();
    try {
      const inserted = await asIdentity(db, account, () =>
        db.query(
          `insert into public.player_account_links (player_id, user_id, status, provenance, activated_at)
           values ($1, $2, 'ACTIVE', 'SELF_CLAIM', now())`,
          [player, account],
        ),
      ).catch((error: Error) => error);

      assert.ok(inserted instanceof Error, 'self-promotion to ACTIVE must be impossible');
      assert.match((inserted as Error).message, /permission denied|policy/i);
    } finally {
      db.release();
    }
  });

  test('SECURITY: the new lookups meet the XS-W0-04 target hardening contract', async () => {
    const { rows } = await client.query<{ proname: string; config: string[] | null }>(
      `select p.proname, p.proconfig as config
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname in ('current_user_active_player_id', 'player_is_linked_to_current_user')`,
    );

    assert.equal(rows.length, 2, 'both lookups must exist');
    for (const row of rows) {
      // ADR-SEC-003 target: empty search_path, not the legacy `public`. PostgreSQL stores
      // `set search_path = ''` normalised as `search_path=""`.
      assert.deepEqual(
        row.config,
        ['search_path=""'],
        `${row.proname} must pin an EMPTY search_path`,
      );

      const grants = await client.query<{ ok: boolean }>(
        `select has_function_privilege('anon', p.oid, 'EXECUTE') as ok
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = $1`,
        [row.proname],
      );
      assert.equal(grants.rows[0].ok, false, `${row.proname} must not be executable by anon`);
    }
  });
}
