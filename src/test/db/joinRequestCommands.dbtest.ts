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
 * XS-W2-05 exit gate, against a real PostgreSQL:
 *
 *   "No target Join flow writes PENDING into effective Membership representation."
 *
 * The legacy shape put a pending join in community_members, so intent and access shared one
 * row and one slot. The target keeps them apart, and approval is the single transaction
 * that turns one into the other.
 */

if (!isTestDatabaseConfigured()) {
  test(`join request commands require ${TEST_DATABASE_URL_VAR}`, () => {
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

  async function newCommunity(userId: string, name: string): Promise<string> {
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

  async function callExpectingError(userId: string | null, sql: string, params: unknown[] = []) {
    return call(userId, sql, params).catch((error: Error) => error);
  }

  async function requestJoin(userId: string, communityId: string): Promise<string> {
    const { rows } = await call<{ id: string }>(
      userId,
      'select public.request_community_join($1) as id',
      [communityId],
    );
    return rows[0].id;
  }

  async function membershipOf(communityId: string, userId: string) {
    const { rows } = await client.query<{ role: string; status: string }>(
      'select role, status from public.community_memberships where community_id = $1 and user_id = $2',
      [communityId, userId],
    );
    return rows[0] ?? null;
  }

  // ── EXIT GATE ────────────────────────────────────────────────────────────
  test('EXIT GATE: requesting to join writes no membership at all', async () => {
    const owner = await newUser('jr2-owner@test.local');
    const applicant = await newUser('jr2-applicant@test.local');
    const community = await newCommunity(owner, 'NoPending');

    await requestJoin(applicant, community);

    assert.equal(
      await membershipOf(community, applicant),
      null,
      'a pending request must create NO row in the effective membership relation',
    );
  });

  test('EXIT GATE: PENDING is not even representable as a membership state', async () => {
    // Structural, not behavioural: even a direct write cannot express it, so no future
    // code path can reintroduce the legacy shape.
    const { rows } = await client.query<{ def: string }>(
      `select pg_get_constraintdef(oid) as def from pg_constraint
       where conrelid = 'public.community_memberships'::regclass
         and conname = 'community_memberships_role_check'`,
    );
    assert.equal(rows.length, 1);

    const status = await client.query<{ def: string }>(
      `select pg_get_constraintdef(oid) as def from pg_constraint
       where conrelid = 'public.community_memberships'::regclass
         and pg_get_constraintdef(oid) like '%status%'`,
    );
    assert.ok(status.rowCount && status.rowCount > 0);
    assert.equal(
      status.rows.some((r) => /pending/i.test(r.def)),
      false,
      'the effective membership relation must have no pending state',
    );
  });

  // ── Approve ──────────────────────────────────────────────────────────────
  test('approval creates the effective Membership in the same transaction', async () => {
    const owner = await newUser('jr2-a-owner@test.local');
    const applicant = await newUser('jr2-a-applicant@test.local');
    const community = await newCommunity(owner, 'Approve');
    const request = await requestJoin(applicant, community);

    await call(owner, 'select public.approve_community_join_request($1)', [request]);

    const membership = await membershipOf(community, applicant);
    assert.ok(membership, 'approval must produce access');
    assert.equal(membership.role, 'member');
    assert.equal(membership.status, 'active');

    const { rows } = await client.query<{ status: string; decided_by: string }>(
      'select status, decided_by from public.community_join_requests where id = $1',
      [request],
    );
    assert.equal(rows[0].status, 'approved');
    assert.equal(rows[0].decided_by, owner, 'the decision records who made it');
  });

  test('approval REACTIVATES a suspended membership rather than colliding', async () => {
    // Someone suspended who reapplies must regain access. Without the upsert this would hit
    // the (community_id, user_id) uniqueness and fail.
    const owner = await newUser('jr2-r-owner@test.local');
    const returning = await newUser('jr2-r-returning@test.local');
    const community = await newCommunity(owner, 'Reactivate');

    await client.query(
      `insert into public.community_memberships (community_id, user_id, role, status)
       values ($1, $2, 'member', 'suspended')`,
      [community, returning],
    );

    const request = await requestJoin(returning, community);
    await call(owner, 'select public.approve_community_join_request($1)', [request]);

    const membership = await membershipOf(community, returning);
    assert.equal(membership?.status, 'active', 'a returning member must be reactivated');
  });

  test('approval requires the community.members.manage capability', async () => {
    // Composes with XS-W2-03: authority comes from the capability resolver, not a role
    // comparison. A plain member holds nothing and must not be able to admit people.
    const owner = await newUser('jr2-cap-owner@test.local');
    const plain = await newUser('jr2-cap-plain@test.local');
    const applicant = await newUser('jr2-cap-applicant@test.local');
    const community = await newCommunity(owner, 'Capability');

    await client.query(
      `insert into public.community_memberships (community_id, user_id, role, status)
       values ($1, $2, 'member', 'active')`,
      [community, plain],
    );
    const request = await requestJoin(applicant, community);

    const attempt = await callExpectingError(
      plain,
      'select public.approve_community_join_request($1)',
      [request],
    );
    assert.ok(attempt instanceof Error, 'a plain member must not admit people');
    assert.match((attempt as Error).message, /community\.members\.manage/);
    assert.equal(await membershipOf(community, applicant), null, 'and nobody was admitted');
  });

  test('an Organizer cannot approve, because the duty is not governance', async () => {
    // The negative matrix from XS-W2-03, exercised through a real command.
    const owner = await newUser('jr2-org-owner@test.local');
    const org = await newUser('jr2-org@test.local');
    const applicant = await newUser('jr2-org-applicant@test.local');
    const community = await newCommunity(owner, 'OrgApprove');

    await client.query(
      `insert into public.community_memberships (community_id, user_id, role, status)
       values ($1, $2, 'member', 'active')`,
      [community, org],
    );
    await client.query(
      `insert into public.community_responsibilities (community_id, user_id, responsibility)
       values ($1, $2, 'ORGANIZER')`,
      [community, org],
    );
    const request = await requestJoin(applicant, community);

    const attempt = await callExpectingError(
      org,
      'select public.approve_community_join_request($1)',
      [request],
    );
    assert.ok(attempt instanceof Error, 'running sessions does not confer admitting people');
    assert.equal(await membershipOf(community, applicant), null);
  });

  test('a decided request cannot be approved again', async () => {
    const owner = await newUser('jr2-twice-owner@test.local');
    const applicant = await newUser('jr2-twice-applicant@test.local');
    const community = await newCommunity(owner, 'Twice');
    const request = await requestJoin(applicant, community);

    await call(owner, 'select public.approve_community_join_request($1)', [request]);
    const again = await callExpectingError(
      owner,
      'select public.approve_community_join_request($1)',
      [request],
    );

    assert.ok(again instanceof Error);
    assert.match((again as Error).message, /already approved/i);
  });

  // ── Reject ───────────────────────────────────────────────────────────────
  test('rejection grants nothing and records the reason', async () => {
    const owner = await newUser('jr2-rej-owner@test.local');
    const applicant = await newUser('jr2-rej-applicant@test.local');
    const community = await newCommunity(owner, 'Reject');
    const request = await requestJoin(applicant, community);

    await call(owner, 'select public.reject_community_join_request($1, $2)', [
      request,
      'not this season',
    ]);

    assert.equal(await membershipOf(community, applicant), null, 'rejection grants no access');

    const { rows } = await client.query<{ status: string; decision_reason: string }>(
      'select status, decision_reason from public.community_join_requests where id = $1',
      [request],
    );
    assert.equal(rows[0].status, 'rejected');
    assert.equal(rows[0].decision_reason, 'not this season');
  });

  test('rejecting a new request does not disturb an existing membership', async () => {
    // The dangerous shape the legacy single-row model invited: a rejection touching the
    // same slot as the person's access.
    const owner = await newUser('jr2-safe-owner@test.local');
    const member = await newUser('jr2-safe-member@test.local');
    const community = await newCommunity(owner, 'SafeReject');

    await client.query(
      `insert into public.community_memberships (community_id, user_id, role, status)
       values ($1, $2, 'member', 'active')`,
      [community, member],
    );
    // Requesting while already active is refused outright, so build the request directly to
    // exercise the rejection path against an existing membership.
    const { rows: made } = await client.query<{ id: string }>(
      `insert into public.community_join_requests (community_id, user_id, status)
       values ($1, $2, 'pending') returning id`,
      [community, member],
    );

    await call(owner, 'select public.reject_community_join_request($1, $2)', [
      made[0].id,
      'duplicate',
    ]);

    const membership = await membershipOf(community, member);
    assert.equal(membership?.status, 'active', 'an existing membership must survive a rejection');
  });

  // ── Withdraw ─────────────────────────────────────────────────────────────
  test('only the applicant may withdraw their request', async () => {
    const owner = await newUser('jr2-wd-owner@test.local');
    const applicant = await newUser('jr2-wd-applicant@test.local');
    const community = await newCommunity(owner, 'Withdraw');
    const request = await requestJoin(applicant, community);

    // Not even a reviewer: withdrawing is the applicant's act, and letting a reviewer use it
    // would be a way to dispose of a request without recording a decision.
    const byOwner = await callExpectingError(
      owner,
      'select public.withdraw_community_join_request($1)',
      [request],
    );
    assert.ok(byOwner instanceof Error);
    assert.match((byOwner as Error).message, /only the applicant/i);

    await call(applicant, 'select public.withdraw_community_join_request($1)', [request]);
    const { rows } = await client.query<{ status: string }>(
      'select status from public.community_join_requests where id = $1',
      [request],
    );
    assert.equal(rows[0].status, 'withdrawn');
    assert.equal(await membershipOf(community, applicant), null);
  });

  test('a withdrawn request frees the applicant to apply again', async () => {
    const owner = await newUser('jr2-again-owner@test.local');
    const applicant = await newUser('jr2-again-applicant@test.local');
    const community = await newCommunity(owner, 'Again');

    const first = await requestJoin(applicant, community);
    await call(applicant, 'select public.withdraw_community_join_request($1)', [first]);
    const second = await requestJoin(applicant, community);

    assert.notEqual(second, first, 'a new request, not a mutated old one');
    const { rows } = await client.query<{ status: string }>(
      'select status from public.community_join_requests where community_id = $1 and user_id = $2 order by requested_at',
      [community, applicant],
    );
    assert.deepEqual(rows.map((r) => r.status).sort(), ['pending', 'withdrawn']);
  });

  // ── Request guards ───────────────────────────────────────────────────────
  test('an active member cannot request to join again', async () => {
    const owner = await newUser('jr2-dup-owner@test.local');
    const community = await newCommunity(owner, 'Duplicate');

    const attempt = await callExpectingError(owner, 'select public.request_community_join($1)', [
      community,
    ]);
    assert.ok(attempt instanceof Error);
    assert.match((attempt as Error).message, /already an active member/i);
  });

  test('a second pending request is refused as a domain error', async () => {
    const owner = await newUser('jr2-2nd-owner@test.local');
    const applicant = await newUser('jr2-2nd-applicant@test.local');
    const community = await newCommunity(owner, 'SecondPending');
    await requestJoin(applicant, community);

    const attempt = await callExpectingError(
      applicant,
      'select public.request_community_join($1)',
      [community],
    );
    assert.ok(attempt instanceof Error);
    assert.match((attempt as Error).message, /pending request already exists/i);
  });

  test('anonymous cannot request, approve, reject or withdraw', async () => {
    const owner = await newUser('jr2-anon-owner@test.local');
    const applicant = await newUser('jr2-anon-applicant@test.local');
    const community = await newCommunity(owner, 'Anon');
    const request = await requestJoin(applicant, community);

    for (const [sql, params] of [
      ['select public.request_community_join($1)', [community]],
      ['select public.approve_community_join_request($1)', [request]],
      ['select public.reject_community_join_request($1, null)', [request]],
      ['select public.withdraw_community_join_request($1)', [request]],
    ] as const) {
      const attempt = await callExpectingError(null, sql, [...params]);
      assert.ok(attempt instanceof Error, `anon must not call ${sql}`);
    }

    const { rows } = await client.query<{ status: string }>(
      'select status from public.community_join_requests where id = $1',
      [request],
    );
    assert.equal(rows[0].status, 'pending', 'and nothing was decided');
  });

  // ── CONCURRENCY ──────────────────────────────────────────────────────────
  test('CONCURRENCY: two reviewers deciding one request cannot both succeed', async () => {
    // Both see 'pending' if nothing serialises them; the FOR UPDATE lock makes the second
    // re-read after the first commits and refuse.
    const owner = await newUser('jr2-race-owner@test.local');
    const admin = await newUser('jr2-race-admin@test.local');
    const applicant = await newUser('jr2-race-applicant@test.local');
    const community = await newCommunity(owner, 'RaceDecide');

    await client.query(
      `insert into public.community_memberships (community_id, user_id, role, status)
       values ($1, $2, 'admin', 'active')`,
      [community, admin],
    );
    const request = await requestJoin(applicant, community);

    const a = await pool.connect();
    const b = await pool.connect();
    try {
      const approve = () =>
        asIdentityCommitting(a, owner, () =>
          a.query('select public.approve_community_join_request($1)', [request]),
        )
          .then(() => 'ok' as const)
          .catch((error: Error) => error);
      const reject = () =>
        asIdentityCommitting(b, admin, () =>
          b.query('select public.reject_community_join_request($1, $2)', [request, 'no']),
        )
          .then(() => 'ok' as const)
          .catch((error: Error) => error);

      const outcomes = await Promise.all([approve(), reject()]);
      const succeeded = outcomes.filter((o) => o === 'ok').length;
      assert.equal(succeeded, 1, `exactly one decision must win, got ${succeeded}`);

      const { rows } = await client.query<{ status: string }>(
        'select status from public.community_join_requests where id = $1',
        [request],
      );
      assert.ok(
        ['approved', 'rejected'].includes(rows[0].status),
        'the request must hold exactly one decided state',
      );

      // And membership must agree with the decision that won.
      const membership = await membershipOf(community, applicant);
      if (rows[0].status === 'approved') {
        assert.equal(membership?.status, 'active', 'an approval must have granted access');
      } else {
        assert.equal(membership, null, 'a rejection must have granted none');
      }
    } finally {
      a.release();
      b.release();
    }
  });

  test('SECURITY: the four commands meet the XS-W0-04 target contract', async () => {
    const { rows } = await client.query<{
      proname: string;
      config: string[] | null;
      anon: boolean;
    }>(
      `select p.proname, p.proconfig as config,
              has_function_privilege('anon', p.oid, 'EXECUTE') as anon
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname in ('request_community_join', 'approve_community_join_request',
                           'reject_community_join_request', 'withdraw_community_join_request')`,
    );
    assert.equal(rows.length, 4);
    for (const row of rows) {
      assert.deepEqual(
        row.config,
        ['search_path=""'],
        `${row.proname} must pin an empty search_path`,
      );
      assert.equal(row.anon, false, `${row.proname} must not be reachable by anon`);
    }
  });
}
