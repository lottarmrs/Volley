import test from 'node:test';
import assert from 'node:assert/strict';
import type { Client, Pool, QueryResultRow } from 'pg';
import {
  asIdentityCommitting,
  connect,
  createPool,
  isTestDatabaseConfigured,
  rebuildFromMigrations,
  TEST_DATABASE_URL_VAR,
} from './harness';

/**
 * XS-W3-02 — explicit operational authority for a target Session.
 *
 * A production change that falls back to sessions.owner_id, community governance rank, or
 * unassigned ORGANIZER eligibility must make at least one assertion below fail.
 */

if (!isTestDatabaseConfigured()) {
  test(`session organizer assignments require ${TEST_DATABASE_URL_VAR}`, () => {
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

  async function newAuthUser(email: string): Promise<string> {
    const { rows } = await client.query<{ id: string }>(
      'insert into auth.users (email) values ($1) returning id',
      [email],
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

  async function activeMembership(
    communityId: string,
    userId: string,
    role = 'member',
  ): Promise<string> {
    const { rows } = await client.query<{ id: string }>(
      `insert into public.community_memberships (community_id, user_id, role, status)
       values ($1, $2, $3, 'active')
       on conflict (community_id, user_id)
       do update set role = excluded.role, status = 'active'
       returning id`,
      [communityId, userId, role],
    );
    return rows[0].id;
  }

  async function grantOrganizer(communityId: string, userId: string): Promise<void> {
    await client.query(
      `insert into public.community_responsibilities (community_id, user_id, responsibility)
       values ($1, $2, 'ORGANIZER')
       on conflict (community_id, user_id, responsibility)
       do update set revoked_at = null`,
      [communityId, userId],
    );
  }

  async function createTargetSession(
    actorId: string,
    input: {
      id?: string;
      communityId?: string | null;
      context?: 'QUICK' | 'COMMUNITY';
      name?: string;
    } = {},
  ): Promise<string> {
    const { rows } = await call<{ id: string }>(
      actorId,
      `select public.create_target_session(
         coalesce($1::uuid, gen_random_uuid()), $2, $3, 'FREE_PLAY', $4, null, null
       ) as id`,
      [
        input.id ?? null,
        input.communityId ?? null,
        input.context ?? 'QUICK',
        input.name ?? 'Target Session',
      ],
    );
    return rows[0].id;
  }

  async function updateDraft(actorId: string, sessionId: string, revision: number, name: string) {
    return call(actorId, 'select public.update_target_session_draft($1, $2, $3, null, null)', [
      sessionId,
      revision,
      name,
    ]);
  }

  test('create_target_session atomically records the Quick creator assignment with no Membership', async () => {
    const organizer = await newUser('assignment-quick@test.local');
    const sessionId = await createTargetSession(organizer, { context: 'QUICK' });

    const { rows } = await client.query<{
      organizer_user_id: string;
      community_membership_id: string | null;
      revoked_at: string | null;
    }>(
      `select organizer_user_id, community_membership_id, revoked_at
       from public.session_organizer_assignments where session_id = $1`,
      [sessionId],
    );
    assert.deepEqual(rows, [
      { organizer_user_id: organizer, community_membership_id: null, revoked_at: null },
    ]);
  });

  test('create_target_session records the Community creator exact active Membership and User', async () => {
    const owner = await newUser('assignment-community-owner@test.local');
    const organizer = await newUser('assignment-community-organizer@test.local');
    const community = await targetCommunity(owner, 'Assignment Community');
    const membershipId = await activeMembership(community, organizer);
    await grantOrganizer(community, organizer);

    const sessionId = await createTargetSession(organizer, {
      communityId: community,
      context: 'COMMUNITY',
    });
    const { rows } = await client.query<{
      organizer_user_id: string;
      community_membership_id: string;
    }>(
      `select organizer_user_id, community_membership_id
       from public.session_organizer_assignments where session_id = $1`,
      [sessionId],
    );
    assert.deepEqual(rows, [
      { organizer_user_id: organizer, community_membership_id: membershipId },
    ]);
  });

  test('create_target_session rejects an ORGANIZER responsibility without an active Membership', async () => {
    const owner = await newUser('assignment-inactive-owner@test.local');
    const organizer = await newUser('assignment-inactive-organizer@test.local');
    const community = await targetCommunity(owner, 'Inactive organizer');
    await grantOrganizer(community, organizer);

    const denied = await callFailing(
      organizer,
      `select public.create_target_session(
         gen_random_uuid(), $1, 'COMMUNITY', 'FREE_PLAY', 'Denied', null, null
       )`,
      [community],
    );
    assert.ok(denied instanceof Error);
    assert.match((denied as Error).message, /session\.manage|membership/i);
  });

  test('update_target_session_draft rejects another eligible Organizer without this Session assignment', async () => {
    const owner = await newUser('assignment-isolation-owner@test.local');
    const organizerA = await newUser('assignment-isolation-a@test.local');
    const organizerB = await newUser('assignment-isolation-b@test.local');
    const community = await targetCommunity(owner, 'Organizer isolation');
    await activeMembership(community, organizerA);
    await activeMembership(community, organizerB);
    await grantOrganizer(community, organizerA);
    await grantOrganizer(community, organizerB);
    const sessionId = await createTargetSession(organizerA, {
      communityId: community,
      context: 'COMMUNITY',
    });

    const denied = await callFailing(
      organizerB,
      'select public.update_target_session_draft($1, 1, $2, null, null)',
      [sessionId, 'Organizer B takeover'],
    );
    assert.ok(denied instanceof Error);
    assert.match((denied as Error).message, /assignment|authorized/i);
  });

  test('update_target_session_draft rejects an unassigned Owner or Admin despite governance rank', async () => {
    const owner = await newUser('assignment-governance-owner@test.local');
    const organizer = await newUser('assignment-governance-organizer@test.local');
    const admin = await newUser('assignment-governance-admin@test.local');
    const community = await targetCommunity(owner, 'Governance boundary');
    await activeMembership(community, organizer);
    await activeMembership(community, admin, 'admin');
    await grantOrganizer(community, organizer);
    const sessionId = await createTargetSession(organizer, {
      communityId: community,
      context: 'COMMUNITY',
    });

    for (const actor of [owner, admin]) {
      const denied = await callFailing(
        actor,
        'select public.update_target_session_draft($1, 1, $2, null, null)',
        [sessionId, 'Governance takeover'],
      );
      assert.ok(denied instanceof Error);
      assert.match((denied as Error).message, /assignment|authorized/i);
    }
  });

  test('update_target_session_draft invalidates suspended Membership and revoked responsibility without erasing history', async () => {
    const owner = await newUser('assignment-revocation-owner@test.local');
    const organizer = await newUser('assignment-revocation-organizer@test.local');
    const community = await targetCommunity(owner, 'Revocation boundary');
    const membershipId = await activeMembership(community, organizer);
    await grantOrganizer(community, organizer);
    const sessionId = await createTargetSession(organizer, {
      communityId: community,
      context: 'COMMUNITY',
    });

    await client.query(
      "update public.community_memberships set status = 'suspended' where id = $1",
      [membershipId],
    );
    const suspended = await callFailing(
      organizer,
      'select public.update_target_session_draft($1, 1, $2, null, null)',
      [sessionId, 'Suspended organizer'],
    );
    assert.ok(suspended instanceof Error);

    await client.query("update public.community_memberships set status = 'active' where id = $1", [
      membershipId,
    ]);
    await client.query(
      'update public.community_responsibilities set revoked_at = now() where community_id = $1 and user_id = $2',
      [community, organizer],
    );
    const revoked = await callFailing(
      organizer,
      'select public.update_target_session_draft($1, 1, $2, null, null)',
      [sessionId, 'Revoked organizer'],
    );
    assert.ok(revoked instanceof Error);

    const history = await client.query<{
      community_membership_id: string;
      revoked_at: string | null;
    }>(
      `select community_membership_id, revoked_at
       from public.session_organizer_assignments where session_id = $1`,
      [sessionId],
    );
    assert.deepEqual(history.rows, [{ community_membership_id: membershipId, revoked_at: null }]);
  });

  test('update_target_session_draft keeps the explicit assignment authoritative when sessions.owner_id changes', async () => {
    const organizer = await newUser('assignment-owner-field-organizer@test.local');
    const replacement = await newUser('assignment-owner-field-replacement@test.local');
    const sessionId = await createTargetSession(organizer);
    await client.query('update public.sessions set owner_id = $2 where id = $1', [
      sessionId,
      replacement,
    ]);

    await updateDraft(organizer, sessionId, 1, 'Still assigned organizer');
    const denied = await callFailing(
      replacement,
      'select public.update_target_session_draft($1, 2, $2, null, null)',
      [sessionId, 'Owner field takeover'],
    );
    assert.ok(denied instanceof Error);
    assert.match((denied as Error).message, /assignment|authorized/i);
  });

  test('update_target_session_draft does not widen authority with a Session UUID from another Community', async () => {
    const ownerA = await newUser('assignment-cross-owner-a@test.local');
    const ownerB = await newUser('assignment-cross-owner-b@test.local');
    const organizerA = await newUser('assignment-cross-organizer-a@test.local');
    const organizerB = await newUser('assignment-cross-organizer-b@test.local');
    const communityA = await targetCommunity(ownerA, 'Cross A');
    const communityB = await targetCommunity(ownerB, 'Cross B');
    await activeMembership(communityA, organizerA);
    await activeMembership(communityB, organizerB);
    await grantOrganizer(communityA, organizerA);
    await grantOrganizer(communityB, organizerB);
    const sessionA = await createTargetSession(organizerA, {
      communityId: communityA,
      context: 'COMMUNITY',
    });

    const denied = await callFailing(
      organizerB,
      'select public.update_target_session_draft($1, 1, $2, null, null)',
      [sessionA, 'Cross community takeover'],
    );
    assert.ok(denied instanceof Error);
    assert.match((denied as Error).message, /assignment|authorized/i);
  });

  test('session_organizer_assignments rejects direct browser mutation and anonymous access', async () => {
    const organizer = await newUser('assignment-rls-organizer@test.local');
    const sessionId = await createTargetSession(organizer);
    const direct = await callFailing(
      organizer,
      `insert into public.session_organizer_assignments (session_id, organizer_user_id)
       values ($1, $2)`,
      [sessionId, organizer],
    );
    assert.ok(direct instanceof Error);
    assert.match((direct as Error).message, /permission denied|row-level security/i);

    const anonymous = await callFailing(
      null,
      'select * from public.session_organizer_assignments where session_id = $1',
      [sessionId],
    );
    assert.ok(anonymous instanceof Error);
    assert.match((anonymous as Error).message, /permission denied/i);
  });

  test('create_target_session rolls back its Session and assignment together when the command fails', async () => {
    const organizer = await newUser('assignment-atomic-organizer@test.local');
    const sessionId = '11111111-1111-4111-8111-111111111111';
    const failed = await callFailing(
      organizer,
      `select public.create_target_session(
         $1, null, 'COMMUNITY', 'FREE_PLAY', 'No community', null, null
       )`,
      [sessionId],
    );
    assert.ok(failed instanceof Error);

    const roots = await client.query<{ count: string }>(
      'select count(*) from public.sessions where id = $1',
      [sessionId],
    );
    const assignments = await client.query<{ count: string }>(
      'select count(*) from public.session_organizer_assignments where session_id = $1',
      [sessionId],
    );
    assert.equal(roots.rows[0].count, '0');
    assert.equal(assignments.rows[0].count, '0');
  });

  test('legacy Session mutation behavior stays outside the target assignment boundary', async () => {
    const owner = await newUser('assignment-legacy-owner@test.local');
    const { rows } = await client.query<{ id: string }>(
      `insert into public.sessions (owner_id, name, date, status, type)
       values ($1, 'Legacy', '2030-01-01', 'draft', 'free_play') returning id`,
      [owner],
    );
    const mutation = await call<{ controlled_by_user_id: string }>(
      owner,
      'select controlled_by_user_id from public.claim_session_ownership($1, $2)',
      [rows[0].id, 'legacy-device'],
    );
    assert.equal(mutation.rows[0].controlled_by_user_id, owner);
  });

  test('assignment history survives Membership and User FK cleanup with references nulled', async () => {
    const owner = await newUser('assignment-fk-owner@test.local');
    const organizer = await newUser('assignment-fk-organizer@test.local');
    const community = await targetCommunity(owner, 'FK history');
    const membershipId = await activeMembership(community, organizer);
    await grantOrganizer(community, organizer);
    const sessionId = await createTargetSession(organizer, {
      communityId: community,
      context: 'COMMUNITY',
    });

    await client.query('delete from public.community_memberships where id = $1', [membershipId]);
    const membershipHistory = await client.query<{
      community_membership_id: string | null;
      organizer_user_id: string | null;
    }>(
      'select community_membership_id, organizer_user_id from public.session_organizer_assignments where session_id = $1',
      [sessionId],
    );
    assert.deepEqual(membershipHistory.rows, [
      { community_membership_id: null, organizer_user_id: organizer },
    ]);

    const directUser = await newAuthUser('assignment-fk-direct@test.local');
    const quickSessionId = await createTargetSession(owner);
    await client.query(
      `insert into public.session_organizer_assignments (session_id, organizer_user_id)
       values ($1, $2)`,
      [quickSessionId, directUser],
    );
    await client.query(
      'alter table public.players disable trigger trg_guard_player_account_identity_history',
    );
    await client.query('alter table public.players disable trigger trg_guard_player_user_id');
    await client.query('alter table public.players disable trigger audit_players');
    try {
      await client.query('delete from auth.users where id = $1', [directUser]);
    } finally {
      await client.query('alter table public.players enable trigger audit_players');
      await client.query('alter table public.players enable trigger trg_guard_player_user_id');
      await client.query(
        'alter table public.players enable trigger trg_guard_player_account_identity_history',
      );
    }
    const userHistory = await client.query<{ organizer_user_id: string | null }>(
      `select organizer_user_id from public.session_organizer_assignments
       where session_id = $1 and organizer_user_id is null`,
      [quickSessionId],
    );
    assert.equal(userHistory.rows.length, 1);
  });
}
