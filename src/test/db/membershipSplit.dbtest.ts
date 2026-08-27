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
 * XS-W2-02 exit gate, against a REAL PostgreSQL.
 *
 * C6.01 names the four cases the tests must cover, and each one is a shape the legacy
 * schema could not express cleanly:
 *
 *   Admin not Player                  governance without a sports relation
 *   accountless CommunityPlayer       sports relation without an account
 *   User+Player with both relations   the two coexisting, independently
 *   JoinRequest without Membership    intent that grants no access
 *
 * GINV-ID-003: the two relations are independent. Neither implies the other.
 */

if (!isTestDatabaseConfigured()) {
  test(`membership split requires ${TEST_DATABASE_URL_VAR}`, () => {
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

  async function newCommunity(name: string, ownerId: string): Promise<string> {
    const { rows } = await client.query<{ id: string }>(
      'insert into public.communities (name, owner_id) values ($1, $2) returning id',
      [name, ownerId],
    );
    return rows[0].id;
  }

  /** A Player with no account at all: the accountless case. */
  async function newAccountlessPlayer(name: string, ownerId: string): Promise<string> {
    const { rows } = await client.query<{ id: string }>(
      'insert into public.players (name, owner_id) values ($1, $2) returning id',
      [name, ownerId],
    );
    return rows[0].id;
  }

  async function membership(communityId: string, userId: string, role: string): Promise<void> {
    await client.query(
      `insert into public.community_memberships (community_id, user_id, role, status)
       values ($1, $2, $3, 'active')
       on conflict (community_id, user_id) do update set role = excluded.role`,
      [communityId, userId, role],
    );
  }

  async function communityPlayer(communityId: string, playerId: string, ownerId: string) {
    await client.query(
      `insert into public.community_players (community_id, player_id, owner_id)
       values ($1, $2, $3) on conflict do nothing`,
      [communityId, playerId, ownerId],
    );
  }

  // ── Shape ────────────────────────────────────────────────────────────────
  test('both target relations exist alongside the legacy table', async () => {
    const { rows } = await client.query<{ table_name: string }>(
      `select table_name from information_schema.tables
       where table_schema = 'public'
         and table_name in ('community_memberships', 'community_join_requests', 'community_members')
       order by table_name`,
    );
    assert.deepEqual(
      rows.map((r) => r.table_name),
      ['community_join_requests', 'community_members', 'community_memberships'],
    );
  });

  test('a membership cannot be pending: intent has no seat in the governance table', async () => {
    // The legacy defect encoded as a constraint. community_members.status allows 'pending',
    // which is what let a request occupy a membership slot.
    const owner = await newUser('shape-owner@test.local');
    const community = await newCommunity('Shape', owner);

    const pending = await client
      .query(
        `insert into public.community_memberships (community_id, user_id, role, status)
         values ($1, $2, 'member', 'pending')`,
        [community, owner],
      )
      .catch((error: Error) => error);

    assert.ok(pending instanceof Error, 'a membership must never be pending');
    assert.match((pending as Error).message, /check constraint/i);
  });

  // ── EXIT GATE 1 ──────────────────────────────────────────────────────────
  test('EXIT GATE: an Admin is not a Player', async () => {
    // Governance without any sports relation. C6.01 forbids inferring "admin account must
    // be Player".
    const owner = await newUser('admin-owner@test.local');
    const admin = await newUser('admin@test.local');
    const community = await newCommunity('AdminOnly', owner);
    await membership(community, admin, 'admin');

    const governance = await client.query<{ role: string }>(
      'select role from public.community_memberships where community_id = $1 and user_id = $2',
      [community, admin],
    );
    assert.equal(governance.rowCount, 1);
    assert.equal(governance.rows[0].role, 'admin');

    // No Player, and therefore no sports relation, was created for that admin.
    const sports = await client.query(
      `select 1 from public.community_players cp
        join public.players p on p.id = cp.player_id
       where cp.community_id = $1 and p.user_id = $2`,
      [community, admin],
    );
    assert.equal(sports.rowCount, 0, 'governance must not imply a sports relation');
  });

  // ── EXIT GATE 2 ──────────────────────────────────────────────────────────
  test('EXIT GATE: a CommunityPlayer can exist with no account at all', async () => {
    // C6.01 forbids inferring "Player must have account". A guest athlete recorded by an
    // organizer has a sports relation and no User whatsoever.
    const owner = await newUser('acctless-owner@test.local');
    const community = await newCommunity('Accountless', owner);
    const player = await newAccountlessPlayer('Convidado', owner);
    await communityPlayer(community, player, owner);

    const { rows } = await client.query<{ user_id: string | null }>(
      `select p.user_id from public.community_players cp
        join public.players p on p.id = cp.player_id
       where cp.community_id = $1 and cp.player_id = $2`,
      [community, player],
    );
    assert.equal(rows.length, 1, 'the sports relation must exist');
    assert.equal(rows[0].user_id, null, 'and it must not require an account');

    // And that Player has no governance access anywhere.
    const governance = await client.query(
      'select 1 from public.community_memberships where community_id = $1',
      [community],
    );
    assert.equal(governance.rowCount, 0, 'a sports relation must not create governance');
  });

  // ── EXIT GATE 3 ──────────────────────────────────────────────────────────
  test('EXIT GATE: a User+Player may hold both relations independently', async () => {
    const owner = await newUser('both-owner@test.local');
    const person = await newUser('both@test.local');
    const community = await newCommunity('Both', owner);

    // The account's auto-created Player is the sports identity.
    const { rows: auto } = await client.query<{ id: string }>(
      'select id from public.players where user_id = $1',
      [person],
    );
    const player = auto[0].id;

    await membership(community, person, 'moderator');
    await communityPlayer(community, player, owner);

    const governance = await client.query<{ role: string }>(
      'select role from public.community_memberships where community_id = $1 and user_id = $2',
      [community, person],
    );
    const sports = await client.query(
      'select 1 from public.community_players where community_id = $1 and player_id = $2',
      [community, player],
    );

    assert.equal(governance.rows[0].role, 'moderator');
    assert.equal(sports.rowCount, 1);

    // The point is INDEPENDENCE: removing one must not remove the other.
    await client.query(
      'delete from public.community_memberships where community_id = $1 and user_id = $2',
      [community, person],
    );
    const sportsAfter = await client.query(
      'select 1 from public.community_players where community_id = $1 and player_id = $2',
      [community, player],
    );
    assert.equal(
      sportsAfter.rowCount,
      1,
      'losing governance access must not erase the sports relationship',
    );
  });

  // ── EXIT GATE 4 ──────────────────────────────────────────────────────────
  test('EXIT GATE: a JoinRequest grants no Membership', async () => {
    const owner = await newUser('jr-owner@test.local');
    const applicant = await newUser('jr-applicant@test.local');
    const community = await newCommunity('JoinReq', owner);

    await client.query(
      `insert into public.community_join_requests (community_id, user_id, status)
       values ($1, $2, 'pending')`,
      [community, applicant],
    );

    const governance = await client.query(
      'select 1 from public.community_memberships where community_id = $1 and user_id = $2',
      [community, applicant],
    );
    assert.equal(governance.rowCount, 0, 'a pending request must create NO membership');

    const request = await client.query<{ status: string }>(
      'select status from public.community_join_requests where community_id = $1 and user_id = $2',
      [community, applicant],
    );
    assert.equal(request.rows[0].status, 'pending');
  });

  // ── Constraints ──────────────────────────────────────────────────────────
  test('only one pending request per Community/User, but history accumulates', async () => {
    const owner = await newUser('hist-owner@test.local');
    const applicant = await newUser('hist-applicant@test.local');
    const community = await newCommunity('History', owner);

    await client.query(
      `insert into public.community_join_requests (community_id, user_id, status)
       values ($1, $2, 'pending')`,
      [community, applicant],
    );

    const duplicate = await client
      .query(
        `insert into public.community_join_requests (community_id, user_id, status)
         values ($1, $2, 'pending')`,
        [community, applicant],
      )
      .catch((error: Error) => error);
    assert.ok(duplicate instanceof Error, 'a second pending request must be refused');

    // Decide it, then apply again. The legacy single-row shape could not do this without
    // destroying the record of the first decision.
    await client.query(
      `update public.community_join_requests
          set status = 'rejected', decided_at = now(), decision_reason = 'not this season'
        where community_id = $1 and user_id = $2 and status = 'pending'`,
      [community, applicant],
    );
    await client.query(
      `insert into public.community_join_requests (community_id, user_id, status)
       values ($1, $2, 'pending')`,
      [community, applicant],
    );

    const { rows } = await client.query<{ status: string }>(
      `select status from public.community_join_requests
        where community_id = $1 and user_id = $2 order by requested_at`,
      [community, applicant],
    );
    assert.equal(rows.length, 2, 'the earlier decision must survive a re-application');
    assert.deepEqual(rows.map((r) => r.status).sort(), ['pending', 'rejected']);
  });

  test('a decided request must record when it was decided', async () => {
    const owner = await newUser('decided-owner@test.local');
    const applicant = await newUser('decided-applicant@test.local');
    const community = await newCommunity('Decided', owner);

    const undated = await client
      .query(
        `insert into public.community_join_requests (community_id, user_id, status)
         values ($1, $2, 'rejected')`,
        [community, applicant],
      )
      .catch((error: Error) => error);

    assert.ok(undated instanceof Error, 'a decision with no timestamp is not evidence');
    assert.match((undated as Error).message, /check constraint/i);
  });

  test('effective membership is unique per Community/User', async () => {
    const owner = await newUser('uniq-owner@test.local');
    const member = await newUser('uniq-member@test.local');
    const community = await newCommunity('Unique', owner);
    await membership(community, member, 'member');

    const duplicate = await client
      .query(
        `insert into public.community_memberships (community_id, user_id, role, status)
         values ($1, $2, 'admin', 'active')`,
        [community, member],
      )
      .catch((error: Error) => error);
    assert.ok(duplicate instanceof Error, 'one effective membership per user per community');
  });

  // ── Classification ───────────────────────────────────────────────────────
  test('BACKFILL: legacy status is classified by what it proves, never inferred', async () => {
    const owner = await newUser('cls-owner@test.local');
    const activeUser = await newUser('cls-active@test.local');
    const pendingUser = await newUser('cls-pending@test.local');
    const rejectedUser = await newUser('cls-rejected@test.local');
    const community = await newCommunity('Classify', owner);

    for (const [user, status] of [
      [activeUser, 'active'],
      [pendingUser, 'pending'],
      [rejectedUser, 'rejected'],
    ] as const) {
      await client.query(
        `insert into public.community_members (community_id, user_id, role, status)
         values ($1, $2, 'member', $3)
         on conflict (community_id, user_id) do update set status = excluded.status`,
        [community, user, status],
      );
    }

    // Re-run the classification shape for this community only.
    await client.query(
      `insert into public.community_memberships (community_id, user_id, role, status, created_at)
       select m.community_id, m.user_id, m.role, 'active', m.created_at
       from public.community_members m
       where m.community_id = $1 and m.status = 'active'
       on conflict (community_id, user_id) do nothing`,
      [community],
    );
    await client.query(
      `insert into public.community_join_requests (community_id, user_id, status, requested_at)
       select m.community_id, m.user_id, 'pending', m.created_at
       from public.community_members m
       where m.community_id = $1 and m.status in ('pending', 'invited')
       on conflict do nothing`,
      [community],
    );

    const memberships = await client.query<{ user_id: string }>(
      'select user_id from public.community_memberships where community_id = $1',
      [community],
    );
    const requests = await client.query<{ user_id: string }>(
      'select user_id from public.community_join_requests where community_id = $1',
      [community],
    );

    // The community owner is auto-added as an active member by a trigger, so governance
    // legitimately contains the owner plus the active row -- and nothing else.
    assert.deepEqual(
      memberships.rows.map((r) => r.user_id).sort(),
      [owner, activeUser].sort(),
      'only rows that PROVE access may become governance',
    );
    // The pending row became intent, and produced no governance.
    assert.deepEqual(
      requests.rows.map((r) => r.user_id),
      [pendingUser],
    );
    assert.equal(
      memberships.rows.some((r) => r.user_id === pendingUser),
      false,
      'a pending join must never become an effective membership',
    );
  });

  test('the deprecated community_players.role is NOT read as governance', async () => {
    // community_players.role still accepts 'owner' and 'admin'. C6.01 forbids treating a
    // legacy player/guest role as governance, so a sports row claiming 'admin' must grant
    // nothing in the membership table.
    const owner = await newUser('roleleak-owner@test.local');
    const community = await newCommunity('RoleLeak', owner);
    const player = await newAccountlessPlayer('FakeAdmin', owner);

    await client.query(
      `insert into public.community_players (community_id, player_id, owner_id, role)
       values ($1, $2, $3, 'admin')`,
      [community, player, owner],
    );

    const governance = await client.query(
      'select 1 from public.community_memberships where community_id = $1',
      [community],
    );
    assert.equal(
      governance.rowCount,
      0,
      'a sports row claiming an admin role must confer no governance whatsoever',
    );
  });

  // ── Security ─────────────────────────────────────────────────────────────
  test('SECURITY: anon reads neither relation', async () => {
    const db = await pool.connect();
    try {
      for (const table of ['community_memberships', 'community_join_requests']) {
        const denied = await asIdentity(db, null, () =>
          db.query(`select 1 from public.${table}`),
        ).catch((error: Error) => error);
        assert.ok(denied instanceof Error, `anon must not read ${table}`);
        assert.match((denied as Error).message, /permission denied/i);
      }
    } finally {
      db.release();
    }
  });

  test('SECURITY: an applicant sees their own request but not a foreign queue', async () => {
    const owner = await newUser('sec-owner@test.local');
    const applicant = await newUser('sec-applicant@test.local');
    const stranger = await newUser('sec-stranger@test.local');
    const community = await newCommunity('SecQueue', owner);

    await client.query(
      `insert into public.community_join_requests (community_id, user_id, status)
       values ($1, $2, 'pending')`,
      [community, applicant],
    );

    const db = await pool.connect();
    try {
      const own = await asIdentity(db, applicant, () =>
        db.query('select 1 from public.community_join_requests'),
      );
      assert.equal(own.rowCount, 1, 'an applicant must see their own request');

      const foreign = await asIdentity(db, stranger, () =>
        db.query('select 1 from public.community_join_requests'),
      );
      assert.equal(foreign.rowCount, 0, 'an unrelated account must see no queue');
    } finally {
      db.release();
    }
  });

  test('SECURITY: no write path is granted; governance mutations stay on the RPCs', async () => {
    // GINV-AUTH-001: adding write policies here would create a second authority for the
    // same aggregate while community_members is still authoritative.
    const owner = await newUser('nowrite-owner@test.local');
    const community = await newCommunity('NoWrite', owner);

    const db = await pool.connect();
    try {
      const inserted = await asIdentity(db, owner, () =>
        db.query(
          `insert into public.community_memberships (community_id, user_id, role, status)
           values ($1, $2, 'owner', 'active')`,
          [community, owner],
        ),
      ).catch((error: Error) => error);

      assert.ok(inserted instanceof Error, 'self-granted governance must be impossible');
      assert.match((inserted as Error).message, /permission denied|policy/i);
    } finally {
      db.release();
    }
  });
}
