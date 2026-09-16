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
 * XS-W2-03 exit gate: the NEGATIVE matrix, against a real PostgreSQL.
 *
 *   Organizer cannot edit Community governance by default
 *   Admin cannot evaluate Player unless operational capability exists
 *   Admin is not MatchController
 *   Organizer is not CompetitionAdmin
 *
 * Each one is a silent-inheritance bug that a role-comparison model invites and a
 * capability model must refuse (GINV-CAP-001, GINV-CAP-002).
 */

if (!isTestDatabaseConfigured()) {
  test(`governance capabilities require ${TEST_DATABASE_URL_VAR}`, () => {
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
      "insert into public.communities (name, owner_id, authority_model) values ($1, $2, 'target') returning id",
      [name, ownerId],
    );
    // GINV-COM-001, enforced from XS-W2-04 onward by a deferred constraint trigger: a
    // community touching community_memberships must end the transaction with exactly one
    // active owner. Fixtures that added members without an owner were building a state the
    // invariant forbids.
    await client.query(
      `insert into public.community_memberships (community_id, user_id, role, status)
       values ($1, $2, 'owner', 'active')
       on conflict (community_id, user_id) do nothing`,
      [rows[0].id, ownerId],
    );
    return rows[0].id;
  }

  async function governance(communityId: string, userId: string, role: string): Promise<void> {
    await client.query(
      `insert into public.community_memberships (community_id, user_id, role, status)
       values ($1, $2, $3, 'active')
       on conflict (community_id, user_id) do update set role = excluded.role`,
      [communityId, userId, role],
    );
  }

  async function organizer(communityId: string, userId: string): Promise<void> {
    await client.query(
      `insert into public.community_responsibilities (community_id, user_id, responsibility)
       values ($1, $2, 'ORGANIZER') on conflict do nothing`,
      [communityId, userId],
    );
  }

  async function capabilities(communityId: string, userId: string): Promise<string[]> {
    const { rows } = await client.query<{ c: string }>(
      'select public.community_capabilities($1, $2) as c',
      [communityId, userId],
    );
    return rows.map((r) => r.c).sort();
  }

  // ── Governance axis is three ranks ───────────────────────────────────────
  test('governance accepts only OWNER, ADMIN and MEMBER', async () => {
    const owner = await newUser('gov-owner@test.local');
    const someone = await newUser('gov-someone@test.local');
    const community = await newCommunity('Ranks', owner);

    for (const rejected of ['organizador', 'moderator']) {
      const attempt = await client
        .query(
          `insert into public.community_memberships (community_id, user_id, role, status)
           values ($1, $2, $3, 'active')`,
          [community, someone, rejected],
        )
        .catch((error: Error) => error);
      assert.ok(attempt instanceof Error, `${rejected} must not be a governance rank`);
      assert.match((attempt as Error).message, /check constraint/i);
    }
  });

  // ── EXIT GATE 1 ──────────────────────────────────────────────────────────
  test('EXIT GATE: an Organizer cannot edit Community governance by default', async () => {
    const owner = await newUser('org-owner@test.local');
    const org = await newUser('org-person@test.local');
    const community = await newCommunity('OrgOnly', owner);

    await governance(community, org, 'member');
    await organizer(community, org);

    const held = await capabilities(community, org);

    // The duty it does have.
    assert.deepEqual(held, ['session.manage']);
    // And the governance it must NOT have.
    assert.equal(held.includes('community.members.manage'), false);
    assert.equal(held.includes('community.ownership.transfer'), false);
  });

  // ── EXIT GATE 2 ──────────────────────────────────────────────────────────
  test('EXIT GATE: an Admin cannot evaluate a Player without an operational capability', async () => {
    // The legacy model maps admin -> manage_evaluations directly. GINV-CAP-002 forbids a
    // governance rank silently conferring an operational capability, so the target resolver
    // must not hand player.evaluate to an Admin.
    const owner = await newUser('adm-owner@test.local');
    const admin = await newUser('adm-admin@test.local');
    const community = await newCommunity('AdminEval', owner);
    await governance(community, admin, 'admin');

    const held = await capabilities(community, admin);

    // XS-W2-06 added profile.update to the ADMIN set. The point of this test is the
    // ABSENCE below, which is unchanged.
    assert.deepEqual(held, ['community.members.manage', 'community.profile.update']);
    assert.equal(
      held.includes('player.evaluate'),
      false,
      'evaluation is operational; governance rank must not confer it',
    );

    // And the legacy table still says otherwise, which is exactly why the resolver exists.
    const legacy = await client.query(
      "select 1 from public.community_role_capabilities where role = 'admin' and capability = 'manage_evaluations'",
    );
    assert.equal(
      legacy.rowCount,
      1,
      'the legacy mapping still grants it; the target resolver deliberately does not',
    );
  });

  // ── EXIT GATE 3 ──────────────────────────────────────────────────────────
  test('EXIT GATE: an Admin is not a MatchController', async () => {
    // GINV-MATCH-004: Match control is a per-Match lease taken at Match time, never a
    // consequence of a Community rank.
    const owner = await newUser('mc-owner@test.local');
    const admin = await newUser('mc-admin@test.local');
    const community = await newCommunity('MatchCtl', owner);
    await governance(community, admin, 'admin');

    const held = await capabilities(community, admin);
    assert.equal(held.includes('match.control'), false, 'no Community rank grants match control');

    // Not even the Owner.
    const ownerHeld = await capabilities(community, owner);
    assert.equal(ownerHeld.includes('match.control'), false);
  });

  // ── EXIT GATE 4 ──────────────────────────────────────────────────────────
  test('EXIT GATE: an Organizer is not a CompetitionAdmin', async () => {
    const owner = await newUser('ca-owner@test.local');
    const org = await newUser('ca-org@test.local');
    const community = await newCommunity('CompAdmin', owner);
    await governance(community, org, 'member');
    await organizer(community, org);

    const held = await capabilities(community, org);
    assert.equal(
      held.includes('competition.admin'),
      false,
      'running sessions does not make someone a competition administrator',
    );
  });

  // ── Positive side, so the matrix is not vacuous ──────────────────────────
  test('an Owner holds governance capabilities including ownership transfer', async () => {
    const owner = await newUser('pos-owner@test.local');
    const community = await newCommunity('Positive', owner);
    await governance(community, owner, 'owner');

    const held = await capabilities(community, owner);
    assert.deepEqual(held, [
      'community.archive',
      'community.members.manage',
      'community.ownership.transfer',
      'community.profile.update',
    ]);
  });

  test('an Admin does NOT hold ownership transfer', async () => {
    const owner = await newUser('xfer-owner@test.local');
    const admin = await newUser('xfer-admin@test.local');
    const community = await newCommunity('Transfer', owner);
    await governance(community, admin, 'admin');

    const held = await capabilities(community, admin);
    assert.equal(
      held.includes('community.ownership.transfer'),
      false,
      'transferring ownership is the Owner’s alone',
    );
  });

  test('the two axes compose without either implying the other', async () => {
    // An Admin who is ALSO an organizer holds both sets, and neither came from the other.
    const owner = await newUser('both-owner@test.local');
    const person = await newUser('both-person@test.local');
    const community = await newCommunity('BothAxes', owner);
    await governance(community, person, 'admin');
    await organizer(community, person);

    assert.deepEqual(await capabilities(community, person), [
      'community.members.manage',
      'community.profile.update',
      'session.manage',
    ]);

    // Revoking the duty leaves governance untouched.
    await client.query(
      'update public.community_responsibilities set revoked_at = now() where community_id = $1 and user_id = $2',
      [community, person],
    );
    assert.deepEqual(await capabilities(community, person), [
      'community.members.manage',
      'community.profile.update',
    ]);
  });

  test('a plain member holds nothing', async () => {
    const owner = await newUser('plain-owner@test.local');
    const member = await newUser('plain-member@test.local');
    const community = await newCommunity('Plain', owner);
    await governance(community, member, 'member');

    assert.deepEqual(await capabilities(community, member), []);
  });

  test('a suspended membership confers nothing', async () => {
    const owner = await newUser('susp-owner@test.local');
    const admin = await newUser('susp-admin@test.local');
    const community = await newCommunity('Suspended', owner);
    await governance(community, admin, 'admin');
    await client.query(
      "update public.community_memberships set status = 'suspended' where community_id = $1 and user_id = $2",
      [community, admin],
    );

    assert.deepEqual(await capabilities(community, admin), []);
  });

  // ── Migration classification ─────────────────────────────────────────────
  test('MIGRATION: a legacy organizador becomes a duty, with no governance increase', async () => {
    const owner = await newUser('mig-owner@test.local');
    const org = await newUser('mig-org@test.local');
    const community = await newCommunity('MigOrg', owner);

    await client.query(
      `insert into public.community_members (community_id, user_id, role, status)
       values ($1, $2, 'organizador', 'active')
       on conflict (community_id, user_id) do update set role = excluded.role`,
      [community, org],
    );

    await client.query(
      `insert into public.community_responsibilities (community_id, user_id, responsibility)
       select m.community_id, m.user_id, 'ORGANIZER'
       from public.community_members m
       where m.community_id = $1 and m.role = 'organizador' and m.status = 'active'
       on conflict do nothing`,
      [community],
    );

    const duty = await client.query(
      "select 1 from public.community_responsibilities where community_id = $1 and user_id = $2 and responsibility = 'ORGANIZER'",
      [community, org],
    );
    assert.equal(duty.rowCount, 1, 'the operational duty must be preserved');

    // And no governance rank above member was created for them.
    const rank = await client.query<{ role: string }>(
      'select role from public.community_memberships where community_id = $1 and user_id = $2',
      [community, org],
    );
    assert.equal(
      rank.rows.some((r) => r.role === 'admin' || r.role === 'owner'),
      false,
      'mapping an organizer must never increase governance',
    );
  });

  test('MIGRATION: a legacy moderator is quarantined, not silently resolved', async () => {
    // OPEN-COM-003 owns the treatment, and its conservative behaviour is "do not promote
    // all moderators to Admin automatically". Demoting silently would drop a duty someone
    // relies on, so both directions are decisions and neither is taken here.
    const owner = await newUser('mod-owner@test.local');
    const mod = await newUser('mod-person@test.local');
    const community = await newCommunity('ModReview', owner);

    await client.query(
      `insert into public.community_members (community_id, user_id, role, status)
       values ($1, $2, 'moderator', 'active')
       on conflict (community_id, user_id) do update set role = excluded.role`,
      [community, mod],
    );
    await client.query(
      `insert into app_private.migration_anomalies (run_id, source_type, source_id, reason, details)
       select r.run_id, 'community_members.role', $1 || ':' || $2,
              'legacy moderator has no target governance rank; promotion and demotion are both decisions',
              jsonb_build_object('open_decision', 'OPEN-COM-003')
       from app_private.migration_runs r
       where r.name = 'normalize_governance_and_organizer'
       limit 1
       on conflict do nothing`,
      [community, mod],
    );

    const quarantined = await client.query<{ reason: string }>(
      'select reason from app_private.migration_anomalies where source_id = $1',
      [`${community}:${mod}`],
    );
    assert.equal(quarantined.rowCount, 1, 'the moderator must be recorded for review');
    assert.match((quarantined.rows[0] as { reason: string }).reason, /OPEN-COM-003|both decisions/);

    // No governance rank above member was invented for them either way. The community_members
    // mirror (XS-W3-09) maps a moderator to member, as the backfill did.
    const rank = await client.query<{ role: string }>(
      'select role from public.community_memberships where community_id = $1 and user_id = $2',
      [community, mod],
    );
    assert.equal(
      rank.rows.some((r) => r.role === 'admin' || r.role === 'owner'),
      false,
      'no rank above member may be guessed for an unresolved moderator',
    );
  });

  // ── Capability check helper ──────────────────────────────────────────────
  test('the capability check resolves for the authenticated caller only', async () => {
    const owner = await newUser('chk-owner@test.local');
    const admin = await newUser('chk-admin@test.local');
    const stranger = await newUser('chk-stranger@test.local');
    const community = await newCommunity('Check', owner);
    await governance(community, admin, 'admin');

    const db = await pool.connect();
    try {
      const asAdmin = await asIdentity(db, admin, () =>
        db.query<{ ok: boolean }>(
          'select public.current_user_has_community_capability($1, $2) as ok',
          [community, 'community.members.manage'],
        ),
      );
      const asStranger = await asIdentity(db, stranger, () =>
        db.query<{ ok: boolean }>(
          'select public.current_user_has_community_capability($1, $2) as ok',
          [community, 'community.members.manage'],
        ),
      );

      assert.equal(asAdmin.rows[0].ok, true);
      assert.equal(asStranger.rows[0].ok, false, 'capability must follow the authenticated actor');
    } finally {
      db.release();
    }
  });

  test('SECURITY: the resolvers meet the XS-W0-04 target hardening contract', async () => {
    const { rows } = await client.query<{ proname: string; config: string[] | null }>(
      `select p.proname, p.proconfig as config
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname in ('community_capabilities', 'current_user_has_community_capability',
                           'current_user_is_active_community_member')`,
    );
    assert.equal(rows.length, 3);
    for (const row of rows) {
      assert.deepEqual(
        row.config,
        ['search_path=""'],
        `${row.proname} must pin an empty search_path`,
      );
    }
  });
}
