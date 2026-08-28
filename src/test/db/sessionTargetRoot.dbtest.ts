import test from 'node:test';
import assert from 'node:assert/strict';
import type { Client, Pool, QueryResult, QueryResultRow } from 'pg';
import {
  asIdentityCommitting,
  connect,
  createPool,
  isTestDatabaseConfigured,
  rebuildFromMigrations,
  TEST_DATABASE_URL_VAR,
} from './harness';

/**
 * XS-W3-01 — target Session root and provisional semantic dimensions.
 *
 * A production change that removes the target cohort guard, derives target semantics from
 * legacy type/status, lets a caller choose the actor, or treats planned time as occurrence
 * truth must make at least one assertion below fail.
 */

if (!isTestDatabaseConfigured()) {
  test(`target Session root requires ${TEST_DATABASE_URL_VAR}`, () => {
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

  async function forgeSessionSemanticWriteAndUpdate(
    userId: string,
    sessionId: string,
  ): Promise<QueryResult | Error> {
    const db = await pool.connect();
    try {
      return await asIdentityCommitting(db, userId, async () => {
        await db.query("select set_config('app.session_semantic_write', 'on', true)");
        return db.query("update public.sessions set name = 'Forged generic update' where id = $1", [
          sessionId,
        ]);
      });
    } catch (error) {
      return error as Error;
    } finally {
      db.release();
    }
  }

  async function targetCommunity(ownerId: string, name: string): Promise<string> {
    const { rows } = await call<{ id: string }>(
      ownerId,
      'select public.create_community_with_owner($1) as id',
      [name],
    );
    return rows[0].id;
  }

  async function grantSessionManagement(communityId: string, userId: string): Promise<void> {
    await client.query(
      `insert into public.community_memberships (community_id, user_id, role, status)
       values ($1, $2, 'member', 'active')
       on conflict (community_id, user_id) do nothing`,
      [communityId, userId],
    );
    await client.query(
      `insert into public.community_responsibilities (community_id, user_id, responsibility)
       values ($1, $2, 'ORGANIZER')`,
      [communityId, userId],
    );
  }

  async function createTargetSession(
    actorId: string,
    input: {
      id?: string;
      communityId?: string | null;
      context?: 'QUICK' | 'COMMUNITY';
      playMode?: 'FREE_PLAY' | 'STRUCTURED_MATCHES';
      name?: string;
      plannedStartAt?: string | null;
      plannedEndAt?: string | null;
    } = {},
  ): Promise<string> {
    const { rows } = await call<{ id: string }>(
      actorId,
      `select public.create_target_session(
         coalesce($1::uuid, gen_random_uuid()), $2, $3, $4, $5, $6, $7
       ) as id`,
      [
        input.id ?? null,
        input.communityId ?? null,
        input.context ?? 'QUICK',
        input.playMode ?? 'FREE_PLAY',
        input.name ?? 'Target Session',
        input.plannedStartAt ?? '2030-01-02T18:00:00Z',
        input.plannedEndAt ?? '2030-01-02T20:00:00Z',
      ],
    );
    return rows[0].id;
  }

  async function overwriteCompatibilityFieldsForReadProbe(sessionId: string): Promise<void> {
    // The guard rejects browser-style generic writes. This privileged migration-style probe
    // deliberately changes only compatibility fields, proving the read mapper does not use
    // them as target authority.
    await client.query('begin');
    try {
      await client.query(
        "update public.sessions set type = 'free_play', status = 'finished' where id = $1",
        [sessionId],
      );
      await client.query('commit');
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw error;
    }
  }

  test('a legacy Session remains legacy and keeps its legacy type/status untouched', async () => {
    const owner = await newUser('session-legacy-owner@test.local');
    const { rows } = await client.query<{ id: string }>(
      `insert into public.sessions (owner_id, name, date, status, type)
       values ($1, 'Legacy session', '2030-01-01', 'active', 'tournament')
       returning id`,
      [owner],
    );

    const stored = await client.query<{
      authority_model: string;
      session_context: string | null;
      play_mode: string | null;
      lifecycle_status: string | null;
      type: string;
      status: string;
    }>(
      `select authority_model, session_context, play_mode, lifecycle_status, type, status
       from public.sessions where id = $1`,
      [rows[0].id],
    );
    assert.deepEqual(stored.rows[0], {
      authority_model: 'legacy',
      session_context: null,
      play_mode: null,
      lifecycle_status: null,
      type: 'tournament',
      status: 'active',
    });
  });

  test('COMMUNITY target creation requires a Community and the session.manage capability', async () => {
    const owner = await newUser('session-community-owner@test.local');
    const organizer = await newUser('session-community-organizer@test.local');
    const community = await targetCommunity(owner, 'Session Community');

    const missingCommunity = await callFailing(
      owner,
      `select public.create_target_session(
         gen_random_uuid(), null, 'COMMUNITY', 'FREE_PLAY', 'No Community', null, null
       )`,
    );
    assert.ok(missingCommunity instanceof Error);
    assert.match((missingCommunity as Error).message, /COMMUNITY.*community/i);

    const denied = await callFailing(
      organizer,
      `select public.create_target_session(
         gen_random_uuid(), $1, 'COMMUNITY', 'FREE_PLAY', 'Not organizer', null, null
       )`,
      [community],
    );
    assert.ok(denied instanceof Error);
    assert.match((denied as Error).message, /Active Community Membership/i);

    await grantSessionManagement(community, organizer);
    const sessionId = await createTargetSession(organizer, {
      communityId: community,
      context: 'COMMUNITY',
    });
    const { rows } = await client.query<{
      owner_id: string;
      community_id: string;
      session_context: string;
    }>('select owner_id, community_id, session_context from public.sessions where id = $1', [
      sessionId,
    ]);
    assert.deepEqual(rows[0], {
      owner_id: organizer,
      community_id: community,
      session_context: 'COMMUNITY',
    });
  });

  test('QUICK target creation derives the owner from auth.uid and preserves nullable Community', async () => {
    const actor = await newUser('session-quick-owner@test.local');
    const requestedId = '11111111-1111-4111-8111-111111111111';
    const sessionId = await createTargetSession(actor, { id: requestedId, context: 'QUICK' });

    const { rows } = await client.query<{
      id: string;
      owner_id: string;
      community_id: string | null;
      authority_model: string;
    }>('select id, owner_id, community_id, authority_model from public.sessions where id = $1', [
      sessionId,
    ]);
    assert.deepEqual(rows[0], {
      id: requestedId,
      owner_id: actor,
      community_id: null,
      authority_model: 'target',
    });
  });

  test('target creation rejects null semantic command dimensions', async () => {
    const actor = await newUser('session-null-command-owner@test.local');

    const nullContext = await callFailing(
      actor,
      `select public.create_target_session(
         gen_random_uuid(), null, null, 'FREE_PLAY', 'No context', null, null
       )`,
    );
    assert.ok(nullContext instanceof Error);
    assert.match((nullContext as Error).message, /invalid Session context/i);

    const nullPlayMode = await callFailing(
      actor,
      `select public.create_target_session(
         gen_random_uuid(), null, 'QUICK', null, 'No play mode', null, null
       )`,
    );
    assert.ok(nullPlayMode instanceof Error);
    assert.match((nullPlayMode as Error).message, /invalid Session play mode/i);
  });

  test('target schema rejects a row missing a semantic dimension even when a writer forges the old guard', async () => {
    const owner = await newUser('session-null-schema-owner@test.local');
    await client.query('begin');
    try {
      await client.query("select set_config('app.session_semantic_write', 'on', true)");
      const attempt = await client
        .query(
          `insert into public.sessions (
             owner_id, name, date, status, type, authority_model, target_model_version,
             session_context, play_mode, lifecycle_status, publication_state, revision
           ) values (
             $1, 'Malformed target', '2030-01-01', 'draft', 'free_play', 'target', 1,
             null, 'FREE_PLAY', 'DRAFT', 'PRIVATE', 1
           )`,
          [owner],
        )
        .catch((error: Error) => error);
      assert.ok(attempt instanceof Error, 'the target model check must reject NULL context');
    } finally {
      await client.query('rollback');
    }
  });

  test('target semantic fields are authoritative and compatibility type derives from play mode', async () => {
    const actor = await newUser('session-semantic-owner@test.local');
    const sessionId = await createTargetSession(actor, { playMode: 'STRUCTURED_MATCHES' });

    const genericWrite = await call(
      actor,
      "update public.sessions set type = 'free_play' where id = $1",
      [sessionId],
    );
    assert.equal(genericWrite.rowCount, 0, 'RLS must hide target rows from generic updates');

    await overwriteCompatibilityFieldsForReadProbe(sessionId);

    const read = await call<{
      play_mode: string;
      lifecycle_status: string;
      compatibility_type: string;
    }>(
      actor,
      'select play_mode, lifecycle_status, compatibility_type from public.read_target_session($1)',
      [sessionId],
    );
    assert.deepEqual(read.rows[0], {
      play_mode: 'STRUCTURED_MATCHES',
      lifecycle_status: 'DRAFT',
      compatibility_type: 'tournament',
    });
  });

  test('lifecycle and publication dimensions are structural but lifecycle commands stay out of XS-W3-01', async () => {
    const actor = await newUser('session-time-owner@test.local');
    const sessionId = await createTargetSession(actor, {
      plannedStartAt: '2030-02-03T18:00:00Z',
      plannedEndAt: '2030-02-03T20:00:00Z',
    });

    const { rows } = await client.query<{
      lifecycle_status: string;
      publication_state: string;
      planned_start_at: string;
      planned_end_at: string;
      actual_finished_at: string | null;
    }>(
      `select lifecycle_status, publication_state,
              to_char(planned_start_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
                as planned_start_at,
              to_char(planned_end_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
                as planned_end_at,
              to_char(actual_finished_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
                as actual_finished_at
       from public.sessions where id = $1`,
      [sessionId],
    );
    assert.deepEqual(rows[0], {
      lifecycle_status: 'DRAFT',
      publication_state: 'PRIVATE',
      planned_start_at: '2030-02-03T18:00:00Z',
      planned_end_at: '2030-02-03T20:00:00Z',
      actual_finished_at: null,
    });

    const lifecycleCommand = await client.query<{ lifecycle_command_is_absent: boolean }>(
      `select to_regprocedure(
         'public.transition_target_session_lifecycle(uuid,integer,text,timestamp with time zone)'
       ) is null as lifecycle_command_is_absent`,
    );
    assert.equal(lifecycleCommand.rows[0].lifecycle_command_is_absent, true);
  });

  test('a draft update rejects a null expected revision', async () => {
    const actor = await newUser('session-null-draft-revision-owner@test.local');
    const sessionId = await createTargetSession(actor, { name: 'Revision protected' });

    const attempt = await callFailing(
      actor,
      `select public.update_target_session_draft(
         $1, null, 'Bypass revision', null, null
       )`,
      [sessionId],
    );
    assert.ok(attempt instanceof Error);
    assert.match((attempt as Error).message, /stale Session revision/i);
  });

  test('an authenticated caller cannot forge the old guard GUC to generic-update a target Session', async () => {
    const actor = await newUser('session-forged-guc-owner@test.local');
    const sessionId = await createTargetSession(actor, { name: 'Guarded target' });

    const attempt = await forgeSessionSemanticWriteAndUpdate(actor, sessionId);
    assert.ok(!(attempt instanceof Error), 'the forged write must be processed by RLS');
    assert.equal(attempt.rowCount, 0, 'caller-set GUC must not authorize a target write');

    const { rows } = await client.query<{ name: string; revision: number }>(
      'select name, revision from public.sessions where id = $1',
      [sessionId],
    );
    assert.deepEqual(rows[0], { name: 'Guarded target', revision: 1 });
  });

  test('legacy ownership RPCs reject target Sessions for the owner and a legacy-eligible Community admin', async () => {
    const owner = await newUser('session-target-ownership-owner@test.local');
    const legacyAdmin = await newUser('session-target-ownership-admin@test.local');
    const community = await targetCommunity(owner, 'Target ownership fence');
    await grantSessionManagement(community, owner);
    await client.query(
      `insert into public.community_members (community_id, user_id, role, status)
       values ($1, $2, 'admin', 'active')`,
      [community, legacyAdmin],
    );
    const sessionId = await createTargetSession(owner, {
      context: 'COMMUNITY',
      communityId: community,
    });

    const attempts = await Promise.all([
      callFailing(owner, 'select public.claim_session_ownership($1, $2)', [
        sessionId,
        'owner-claim',
      ]),
      callFailing(owner, 'select public.transfer_session_ownership($1, $2)', [
        sessionId,
        'owner-transfer',
      ]),
      callFailing(legacyAdmin, 'select public.claim_session_ownership($1, $2)', [
        sessionId,
        'admin-claim',
      ]),
      callFailing(legacyAdmin, 'select public.transfer_session_ownership($1, $2)', [
        sessionId,
        'admin-transfer',
      ]),
    ]);
    for (const attempt of attempts) {
      assert.ok(attempt instanceof Error);
      assert.match((attempt as Error).message, /target Session.*legacy ownership/i);
    }

    const { rows } = await client.query<{
      controlled_by_user_id: string | null;
      control_claimed_at: string | null;
      control_device_id: string | null;
      revision: number;
    }>(
      `select controlled_by_user_id, control_claimed_at, control_device_id, revision
       from public.sessions where id = $1`,
      [sessionId],
    );
    assert.deepEqual(rows[0], {
      controlled_by_user_id: null,
      control_claimed_at: null,
      control_device_id: null,
      revision: 1,
    });
  });

  test('a target draft update advances updated_at independently of its revision token', async () => {
    const actor = await newUser('session-updated-at-owner@test.local');
    const sessionId = await createTargetSession(actor, { name: 'Before timestamp update' });
    const priorUpdatedAt = '2000-01-01T00:00:00Z';
    await client.query('update public.sessions set updated_at = $2 where id = $1', [
      sessionId,
      priorUpdatedAt,
    ]);

    const before = await client.query<{ updated_at: string }>(
      `select to_char(updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as updated_at
       from public.sessions where id = $1`,
      [sessionId],
    );
    assert.equal(before.rows[0].updated_at, priorUpdatedAt);

    await call(
      actor,
      `select public.update_target_session_draft(
         $1, 1, 'After timestamp update', null, null
       )`,
      [sessionId],
    );

    const { rows } = await client.query<{ name: string; revision: number; advanced: boolean }>(
      `select name, revision, updated_at > $2::timestamptz as advanced
       from public.sessions where id = $1`,
      [sessionId, priorUpdatedAt],
    );
    assert.deepEqual(rows[0], {
      name: 'After timestamp update',
      revision: 2,
      advanced: true,
    });
  });

  test('a target draft update uses revision and rejects stale, anonymous, and cross-Community callers', async () => {
    const owner = await newUser('session-update-owner@test.local');
    const outsider = await newUser('session-update-outsider@test.local');
    const communityA = await targetCommunity(owner, 'Session Update A');
    const communityB = await targetCommunity(outsider, 'Session Update B');
    await grantSessionManagement(communityA, owner);
    await grantSessionManagement(communityB, outsider);
    const sessionId = await createTargetSession(owner, {
      name: 'Before',
      context: 'COMMUNITY',
      communityId: communityA,
    });

    await call(
      owner,
      `select public.update_target_session_draft(
         $1, 1, 'After', '2030-03-03T18:00:00Z', '2030-03-03T20:00:00Z'
       )`,
      [sessionId],
    );

    const stale = await callFailing(
      owner,
      `select public.update_target_session_draft(
         $1, 1, 'Stale', null, null
       )`,
      [sessionId],
    );
    assert.ok(stale instanceof Error);
    assert.match((stale as Error).message, /stale.*revision/i);

    const anonymousRead = await callFailing(null, 'select * from public.read_target_session($1)', [
      sessionId,
    ]);
    assert.ok(anonymousRead instanceof Error);
    assert.match((anonymousRead as Error).message, /permission denied|not authenticated/i);

    const denied = await callFailing(
      outsider,
      `select public.update_target_session_draft(
         $1, 2, 'Hijacked', null, null
       )`,
      [sessionId],
    );
    assert.ok(denied instanceof Error);
    assert.match((denied as Error).message, /valid Session organizer assignment/i);

    const { rows } = await client.query<{ name: string; revision: number }>(
      'select name, revision from public.sessions where id = $1',
      [sessionId],
    );
    assert.deepEqual(rows[0], { name: 'After', revision: 2 });
  });
}
