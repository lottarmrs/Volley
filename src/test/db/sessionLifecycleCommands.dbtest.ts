import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
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
 * RED contract for Session lifecycle readiness (XS-W3-06 task 3).
 *
 * Nothing under test here exists yet: `app_private.session_readiness_blockers`,
 * `app_private.target_session_readiness`, `public.read_target_session_readiness`, and the
 * cancellation columns on `public.sessions` are all created by a later task (task 4). Every
 * assertion in this file is expected to fail against the missing table (`42P01`), the missing
 * functions (`42883`), the missing columns (`42703`), or a catalog query that currently returns
 * nothing where a populated shape is expected, until that task lands.
 *
 * The four ingredients a target Session needs to become "ready" -- an organizer assignment, a
 * roster, a rules snapshot, and a court -- already exist from earlier slices (W3-01 through
 * W3-05) and work today; `createReadySession` below assembles them for real.
 */

interface RosterCommandRow extends QueryResultRow {
  roster_revision_id: string;
  roster_revision_number: number;
  session_revision: number;
}

interface RulesSnapshotCommandRow extends QueryResultRow {
  snapshot_id: string;
  session_revision: number;
}

interface CourtCommandRow extends QueryResultRow {
  court_id: string;
  session_revision: number;
}

interface ReadinessBlocker {
  code: string;
  evaluation_status: string;
  owning_wave: string | null;
}

interface ReadinessRevisions {
  session_revision: number;
  roster_revision_id: string | null;
  roster_revision_number: number | null;
  rules_snapshot_id: string | null;
}

interface ReadinessRow extends QueryResultRow {
  ready: boolean;
  blockers: ReadinessBlocker[];
  revisions: ReadinessRevisions;
}

interface LifecycleCommandRow extends QueryResultRow {
  session_revision: number;
}

interface OrganizerAssignmentCommandRow extends QueryResultRow {
  assignment_id: string;
  session_revision: number;
}

interface CourtConfigureCommandRow extends QueryResultRow {
  court_id: string;
  session_revision: number;
}

interface SessionLifecycleState {
  lifecycle_status: string;
  status: string;
  publication_state: string;
  revision: number;
  planned_start_at: string | null;
  actual_started_at: string | null;
  actual_finished_at: string | null;
  cancelled_at: string | null;
  cancelled_by_user_id: string | null;
  cancel_reason: string | null;
}

const EVALUATED_BLOCKER_CODES = [
  'REQUIRED_ORGANIZER_MISSING',
  'NO_EFFECTIVE_ROSTER',
  'RULES_INVALID',
  'COURT_CONFIGURATION_INVALID',
] as const;

const DEFERRED_BLOCKER_CODES = [
  'ROSTER_STALE',
  'NO_CONFIRMED_TEAM_DRAW',
  'TEAM_DRAW_STALE',
  'VOTING_STILL_OPEN',
  'COMPETITION_FIXTURE_NOT_READY',
] as const;

if (!isTestDatabaseConfigured()) {
  test(`session lifecycle commands require ${TEST_DATABASE_URL_VAR}`, () => {
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

  function assertSqlState(error: unknown, expectedCode: string): asserts error is Error {
    assert.ok(error instanceof Error);
    assert.equal((error as { code?: string }).code, expectedCode);
  }

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
    status: 'active' | 'suspended' = 'active',
  ): Promise<void> {
    await client.query(
      `insert into public.community_memberships (community_id, user_id, role, status)
       values ($1, $2, 'member', $3)
       on conflict (community_id, user_id)
       do update set status = excluded.status`,
      [communityId, userId, status],
    );
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
    const sessionId = input.id ?? randomUUID();
    const { rows } = await call<{ id: string }>(
      actorId,
      `select public.create_target_session(
         $1, $2, $3, 'FREE_PLAY', $4, null, null
       ) as id`,
      [
        sessionId,
        input.communityId ?? null,
        input.context ?? 'QUICK',
        input.name ?? 'Target lifecycle Session',
      ],
    );
    assert.deepEqual(rows, [{ id: sessionId }]);
    return sessionId;
  }

  async function createLegacySession(
    ownerId: string,
    name = 'Legacy lifecycle Session',
  ): Promise<string> {
    const { rows } = await client.query<{ id: string }>(
      `insert into public.sessions (owner_id, name, date, status, type)
       values ($1, $2, '2030-01-01', 'draft', 'free_play')
       returning id`,
      [ownerId, name],
    );
    return rows[0].id;
  }

  async function replaceQuickRoster(
    actorId: string | null,
    input: {
      revisionId?: string | null;
      sessionId?: string | null;
      expectedRevision?: number | null;
      participants?: unknown;
    },
  ) {
    const participants = input.participants === undefined ? [] : input.participants;
    return call<RosterCommandRow>(
      actorId,
      `select * from public.replace_target_quick_session_roster(
         $1, $2, $3, $4::jsonb
       )`,
      [
        input.revisionId === undefined ? randomUUID() : input.revisionId,
        input.sessionId === undefined ? randomUUID() : input.sessionId,
        input.expectedRevision === undefined ? 1 : input.expectedRevision,
        participants === null ? null : JSON.stringify(participants),
      ],
    );
  }

  async function createReadySession(
    actorId: string,
    overrides: { skipRules?: boolean; skipCourt?: boolean } = {},
  ): Promise<{
    sessionId: string;
    revision: number;
    rosterRevisionId: string;
    rosterRevisionNumber: number;
    rulesSnapshotId: string | null;
  }> {
    const sessionId = await createTargetSession(actorId, { name: 'Ready target Session' });
    let revision = 1;

    const rosterResult = await replaceQuickRoster(actorId, {
      sessionId,
      expectedRevision: revision,
      participants: [{ participant_id: randomUUID(), identity_kind: 'GUEST', display_name: 'Ana' }],
    });
    const rosterRevisionId = rosterResult.rows[0].roster_revision_id;
    const rosterRevisionNumber = rosterResult.rows[0].roster_revision_number;
    revision = rosterResult.rows[0].session_revision;

    let rulesSnapshotId: string | null = null;
    if (!overrides.skipRules) {
      const rulesResult = await call<RulesSnapshotCommandRow>(
        actorId,
        `select * from public.freeze_target_session_rules_snapshot(
           $1, $2, $3, 1, 'SESSION_EXPLICIT', $4::jsonb
         )`,
        [randomUUID(), sessionId, revision, JSON.stringify({})],
      );
      rulesSnapshotId = rulesResult.rows[0].snapshot_id;
      revision = rulesResult.rows[0].session_revision;
    }

    if (overrides.skipCourt) {
      await client.query('delete from public.session_courts where session_id = $1', [sessionId]);
    } else {
      const courtResult = await call<CourtCommandRow>(
        actorId,
        `select * from public.add_target_session_court($1, $2, $3, $4, $5)`,
        [randomUUID(), sessionId, revision, 'Quadra extra', 2],
      );
      revision = courtResult.rows[0].session_revision;
    }

    return { sessionId, revision, rosterRevisionId, rosterRevisionNumber, rulesSnapshotId };
  }

  async function createReadyCommunitySession(
    actorId: string,
    communityId: string,
  ): Promise<{ sessionId: string; revision: number }> {
    const sessionId = await createTargetSession(actorId, {
      communityId,
      context: 'COMMUNITY',
      name: 'Ready Community target Session',
    });
    const participantId = randomUUID();
    const rosterRevisionId = randomUUID();
    await client.query(
      `insert into public.session_participants (
         id, session_id, identity_kind, source_kind, display_name,
         participation_status, created_by_user_id
       ) values ($1, $2, 'GUEST', 'REGISTRATION', 'Ana', 'INCLUDED', $3)`,
      [participantId, sessionId, actorId],
    );
    await client.query(
      `insert into public.roster_revisions (
         id, session_id, revision_number, source_kind, source_registration_revision,
         created_by_user_id
       ) values ($1, $2, 1, 'REGISTRATION', 1, $3)`,
      [rosterRevisionId, sessionId, actorId],
    );
    await client.query(
      `insert into public.roster_revision_entries (
         roster_revision_id, session_id, participant_id, entry_order,
         identity_kind, display_name_at_time
       ) values ($1, $2, $3, 0, 'GUEST', 'Ana')`,
      [rosterRevisionId, sessionId, participantId],
    );
    const rules = await call<RulesSnapshotCommandRow>(
      actorId,
      `select * from public.freeze_target_session_rules_snapshot(
         $1, $2, $3, 1, 'SESSION_EXPLICIT', $4::jsonb
       )`,
      [randomUUID(), sessionId, 1, JSON.stringify({})],
    );
    return { sessionId, revision: rules.rows[0].session_revision };
  }

  async function readReadiness(actorId: string | null, sessionId: string) {
    return call<ReadinessRow>(actorId, 'select * from public.read_target_session_readiness($1)', [
      sessionId,
    ]);
  }

  function blockerCodes(readiness: { blockers: ReadinessBlocker[] }): string[] {
    return readiness.blockers.map((blocker) => blocker.code).sort();
  }

  async function observedReadinessRevisions(sessionId: string): Promise<ReadinessRevisions> {
    const { rows } = await client.query<ReadinessRevisions>(
      `select s.revision as session_revision,
              roster.id as roster_revision_id,
              roster.revision_number as roster_revision_number,
              rules.id as rules_snapshot_id
         from public.sessions s
         left join lateral (
           select r.id, r.revision_number
             from public.roster_revisions r
            where r.session_id = s.id
            order by r.revision_number desc, r.id desc
            limit 1
         ) roster on true
         left join public.session_rules_snapshots rules on rules.session_id = s.id
        where s.id = $1`,
      [sessionId],
    );
    assert.equal(rows.length, 1, 'the target Session must exist for readiness provenance');
    return rows[0];
  }

  // --- Task 5 fixtures: the nine semantic lifecycle commands ---------------------------

  async function sessionRevision(sessionId: string): Promise<number> {
    const { rows } = await client.query<{ revision: number }>(
      'select revision from public.sessions where id = $1',
      [sessionId],
    );
    return rows[0].revision;
  }

  async function sessionState(sessionId: string): Promise<SessionLifecycleState> {
    const { rows } = await client.query<SessionLifecycleState>(
      `select lifecycle_status, status, publication_state, revision, planned_start_at,
              actual_started_at, actual_finished_at, cancelled_at, cancelled_by_user_id,
              cancel_reason
         from public.sessions where id = $1`,
      [sessionId],
    );
    return rows[0];
  }

  async function compatibilityStatus(lifecycleStatus: string): Promise<string> {
    const { rows } = await client.query<{ status: string }>(
      'select public.target_session_compatibility_status($1) as status',
      [lifecycleStatus],
    );
    return rows[0].status;
  }

  /**
   * Privileged, direct manipulation of lifecycle state for test setup only -- no target
   * command exercises this path. Bypasses RLS the same way `createLegacySession` does.
   */
  async function forceLifecycleStatus(
    sessionId: string,
    status: 'DRAFT' | 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED',
    actorId: string,
  ): Promise<void> {
    await client.query(
      `update public.sessions
          set lifecycle_status = $2,
              status = public.target_session_compatibility_status($2),
              actual_started_at = case
                when $2 in ('IN_PROGRESS', 'COMPLETED') then coalesce(actual_started_at, now())
                else actual_started_at
              end,
              actual_finished_at = case
                when $2 = 'COMPLETED' then coalesce(actual_finished_at, now())
                else actual_finished_at
              end,
              cancelled_at = case
                when $2 = 'CANCELLED' then coalesce(cancelled_at, now())
                else cancelled_at
              end,
              cancelled_by_user_id = case
                when $2 = 'CANCELLED' then coalesce(cancelled_by_user_id, $3)
                else cancelled_by_user_id
              end,
              cancel_reason = case
                when $2 = 'CANCELLED' then coalesce(cancel_reason, 'Test forced cancellation')
                else cancel_reason
              end
        where id = $1`,
      [sessionId, status, actorId],
    );
  }

  async function aggregateCounts(sessionId: string) {
    const { rows } = await client.query<{
      session_participants: string;
      roster_revisions: string;
      roster_revision_entries: string;
      session_rules_snapshots: string;
      session_courts: string;
      session_organizer_assignments: string;
    }>(
      `select
         (select count(*) from public.session_participants
           where session_id = $1)::text as session_participants,
         (select count(*) from public.roster_revisions
           where session_id = $1)::text as roster_revisions,
         (select count(*) from public.roster_revision_entries
           where session_id = $1)::text as roster_revision_entries,
         (select count(*) from public.session_rules_snapshots
           where session_id = $1)::text as session_rules_snapshots,
         (select count(*) from public.session_courts
           where session_id = $1)::text as session_courts,
         (select count(*) from public.session_organizer_assignments
           where session_id = $1)::text as session_organizer_assignments`,
      [sessionId],
    );
    return rows[0];
  }

  async function commandReceipt(commandId: string) {
    const { rows } = await client.query<{
      command_type: string;
      aggregate_id: string;
      actor_id: string | null;
      retention_class: string;
    }>(
      `select command_type, aggregate_id, actor_id, retention_class
         from app_private.command_receipts where command_id = $1`,
      [commandId],
    );
    return rows;
  }

  async function membershipId(communityId: string, userId: string): Promise<string> {
    const { rows } = await client.query<{ id: string }>(
      'select id from public.community_memberships where community_id = $1 and user_id = $2',
      [communityId, userId],
    );
    assert.equal(rows.length, 1, 'expected an existing active Community membership');
    return rows[0].id;
  }

  /**
   * Privileged, direct insert of an already-assigned Session organizer for test setup --
   * no target command exercises this path. Needed because `revoke_target_session_organizer`
   * (once it exists) cannot be exercised by an actor who just revoked their own only
   * assignment, so tests need a second, already-assigned organizer to observe post-revoke
   * state.
   */
  async function directOrganizerAssignment(
    sessionId: string,
    organizerUserId: string,
    communityMembershipId: string | null = null,
  ): Promise<string> {
    const { rows } = await client.query<{ id: string }>(
      `insert into public.session_organizer_assignments (
         session_id, community_membership_id, organizer_user_id, assigned_by_user_id
       ) values ($1, $2, $3, $3)
       returning id`,
      [sessionId, communityMembershipId, organizerUserId],
    );
    return rows[0].id;
  }

  async function legacyGame(sessionId: string, status: string): Promise<string> {
    const { rows: sessionRows } = await client.query<{ owner_id: string }>(
      'select owner_id from public.sessions where id = $1',
      [sessionId],
    );
    const ownerId = sessionRows[0].owner_id;
    const teamAId = randomUUID();
    const teamBId = randomUUID();
    await client.query(
      `insert into public.teams (id, owner_id, session_id, name) values
         ($1, $2, $3, 'Team A'), ($4, $2, $3, 'Team B')`,
      [teamAId, ownerId, sessionId, teamBId],
    );
    const gameId = randomUUID();
    await client.query(
      `insert into public.games (
         id, owner_id, session_id, type, sequence_number, team_a_id, team_b_id, status
       ) values ($1, $2, $3, 'free_play', 1, $4, $5, $6)`,
      [gameId, ownerId, sessionId, teamAId, teamBId, status],
    );
    return gameId;
  }

  async function scheduleSession(
    actorId: string | null,
    input: { commandId?: string; sessionId: string; expectedRevision: number | null },
  ) {
    return call<LifecycleCommandRow>(
      actorId,
      'select * from public.schedule_target_session($1, $2, $3)',
      [input.commandId ?? randomUUID(), input.sessionId, input.expectedRevision],
    );
  }

  async function publishSession(
    actorId: string | null,
    input: { commandId?: string; sessionId: string; expectedRevision: number | null },
  ) {
    return call<LifecycleCommandRow>(
      actorId,
      'select * from public.publish_target_session($1, $2, $3)',
      [input.commandId ?? randomUUID(), input.sessionId, input.expectedRevision],
    );
  }

  async function startSession(
    actorId: string | null,
    input: { commandId?: string; sessionId: string; expectedRevision: number | null },
  ) {
    return call<LifecycleCommandRow>(
      actorId,
      'select * from public.start_target_session($1, $2, $3)',
      [input.commandId ?? randomUUID(), input.sessionId, input.expectedRevision],
    );
  }

  async function finishSession(
    actorId: string | null,
    input: { commandId?: string; sessionId: string; expectedRevision: number | null },
  ) {
    return call<LifecycleCommandRow>(
      actorId,
      'select * from public.finish_target_session($1, $2, $3)',
      [input.commandId ?? randomUUID(), input.sessionId, input.expectedRevision],
    );
  }

  async function cancelSession(
    actorId: string | null,
    input: {
      commandId?: string;
      sessionId: string;
      expectedRevision: number | null;
      reason: string | null;
    },
  ) {
    return call<LifecycleCommandRow>(
      actorId,
      'select * from public.cancel_target_session($1, $2, $3, $4)',
      [input.commandId ?? randomUUID(), input.sessionId, input.expectedRevision, input.reason],
    );
  }

  async function assignOrganizer(
    actorId: string | null,
    input: {
      commandId?: string;
      assignmentId?: string;
      sessionId: string;
      expectedRevision: number | null;
      organizerUserId: string;
    },
  ) {
    return call<OrganizerAssignmentCommandRow>(
      actorId,
      'select * from public.assign_target_session_organizer($1, $2, $3, $4, $5)',
      [
        input.commandId ?? randomUUID(),
        input.assignmentId ?? randomUUID(),
        input.sessionId,
        input.expectedRevision,
        input.organizerUserId,
      ],
    );
  }

  async function revokeOrganizer(
    actorId: string | null,
    input: {
      commandId?: string;
      sessionId: string;
      expectedRevision: number | null;
      organizerUserId: string;
    },
  ) {
    return call<LifecycleCommandRow>(
      actorId,
      'select * from public.revoke_target_session_organizer($1, $2, $3, $4)',
      [
        input.commandId ?? randomUUID(),
        input.sessionId,
        input.expectedRevision,
        input.organizerUserId,
      ],
    );
  }

  async function configureCourt(
    actorId: string | null,
    input: {
      commandId?: string;
      courtId: string;
      sessionId: string;
      expectedRevision: number | null;
      label: string;
      courtOrder: number;
    },
  ) {
    return call<CourtConfigureCommandRow>(
      actorId,
      'select * from public.configure_target_session_court($1, $2, $3, $4, $5, $6)',
      [
        input.commandId ?? randomUUID(),
        input.courtId,
        input.sessionId,
        input.expectedRevision,
        input.label,
        input.courtOrder,
      ],
    );
  }

  // --- Step 2: the blocker catalog -----------------------------------------------------

  test('app_private.session_readiness_blockers holds exactly the nine approved codes with the correct evaluation status and owning wave', async () => {
    const { rows } = await client.query<{
      code: string;
      evaluation_status: string;
      owning_wave: string | null;
    }>(
      `select code, evaluation_status, owning_wave
         from app_private.session_readiness_blockers
        order by code`,
    );
    assert.deepEqual(rows, [
      { code: 'COMPETITION_FIXTURE_NOT_READY', evaluation_status: 'DEFERRED', owning_wave: 'W8' },
      { code: 'COURT_CONFIGURATION_INVALID', evaluation_status: 'EVALUATED', owning_wave: 'W3' },
      { code: 'NO_CONFIRMED_TEAM_DRAW', evaluation_status: 'DEFERRED', owning_wave: 'W6' },
      { code: 'NO_EFFECTIVE_ROSTER', evaluation_status: 'EVALUATED', owning_wave: 'W3' },
      { code: 'REQUIRED_ORGANIZER_MISSING', evaluation_status: 'EVALUATED', owning_wave: 'W3' },
      { code: 'ROSTER_STALE', evaluation_status: 'DEFERRED', owning_wave: 'W6' },
      { code: 'RULES_INVALID', evaluation_status: 'EVALUATED', owning_wave: 'W3' },
      { code: 'TEAM_DRAW_STALE', evaluation_status: 'DEFERRED', owning_wave: 'W6' },
      { code: 'VOTING_STILL_OPEN', evaluation_status: 'DEFERRED', owning_wave: 'W5' },
    ]);
  });

  test('evaluation_status rejects any value outside EVALUATED and DEFERRED with 23514', async () => {
    await client.query('begin');
    try {
      const rejected = await client
        .query(
          `update app_private.session_readiness_blockers
              set evaluation_status = 'PENDING'
            where code = 'REQUIRED_ORGANIZER_MISSING'`,
        )
        .catch((error: Error) => error);
      assertSqlState(rejected, '23514');
    } finally {
      await client.query('rollback');
    }
  });

  test('row level security is enabled and anon/authenticated hold no privilege on the blocker catalog', async () => {
    const { rows: rlsRows } = await client.query<{ rls_enabled: boolean }>(
      `select c.relrowsecurity as rls_enabled
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'app_private' and c.relname = 'session_readiness_blockers'`,
    );
    assert.deepEqual(rlsRows, [{ rls_enabled: true }]);

    const { rows: grantedPrivileges } = await client.query<{
      role_name: string;
      privilege_type: string;
    }>(
      `with browser_roles(role_name) as (
         values ('anon'), ('authenticated')
       ), table_privileges(privilege_type) as (
         values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'),
                ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')
       )
       select browser_roles.role_name, table_privileges.privilege_type
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
         cross join browser_roles
         cross join table_privileges
        where n.nspname = 'app_private'
          and c.relname = 'session_readiness_blockers'
          and has_table_privilege(
            browser_roles.role_name, c.oid, table_privileges.privilege_type
          )
        order by browser_roles.role_name, table_privileges.privilege_type`,
    );
    assert.deepEqual(grantedPrivileges, []);
  });

  test('readiness functions are SECURITY DEFINER, pin an empty search_path, and expose only the public reader to authenticated', async () => {
    const { rows } = await client.query<{
      schema_name: string;
      function_name: string;
      security_definer: boolean;
      config: string[] | null;
      has_explicit_acl: boolean;
      public_exec: boolean;
      anon_exec: boolean;
      authenticated_exec: boolean;
    }>(
      `select n.nspname as schema_name,
              p.proname as function_name,
              p.prosecdef as security_definer,
              p.proconfig as config,
              p.proacl is not null as has_explicit_acl,
              has_function_privilege('public', p.oid, 'EXECUTE') as public_exec,
              has_function_privilege('anon', p.oid, 'EXECUTE') as anon_exec,
              has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_exec
         from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
        where p.oid in (
          pg_catalog.to_regprocedure('app_private.target_session_readiness(uuid)'),
          pg_catalog.to_regprocedure('public.read_target_session_readiness(uuid)')
        )
        order by n.nspname, p.proname`,
    );
    assert.deepEqual(rows, [
      {
        schema_name: 'app_private',
        function_name: 'target_session_readiness',
        security_definer: true,
        config: ['search_path=""'],
        has_explicit_acl: true,
        public_exec: false,
        anon_exec: false,
        authenticated_exec: false,
      },
      {
        schema_name: 'public',
        function_name: 'read_target_session_readiness',
        security_definer: true,
        config: ['search_path=""'],
        has_explicit_acl: true,
        public_exec: false,
        anon_exec: false,
        authenticated_exec: true,
      },
    ]);
  });

  // --- Step 3: readiness evaluation -----------------------------------------------------

  test('a fully prepared target Session is ready with an empty blocker array', async () => {
    const organizer = await newUser('readiness-ready@test.local');
    const { sessionId } = await createReadySession(organizer);
    const { rows } = await readReadiness(organizer, sessionId);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].ready, true);
    assert.deepEqual(rows[0].blockers, []);
  });

  test('revoking the organizer assignment yields exactly REQUIRED_ORGANIZER_MISSING', async () => {
    const organizer = await newUser('readiness-no-organizer@test.local');
    const { sessionId } = await createReadySession(organizer);
    await client.query(
      'update public.session_organizer_assignments set revoked_at = now() where session_id = $1',
      [sessionId],
    );
    const { rows } = await client.query<{ readiness: ReadinessRow }>(
      'select app_private.target_session_readiness($1) as readiness',
      [sessionId],
    );
    assert.equal(rows[0].readiness.ready, false);
    assert.deepEqual(blockerCodes(rows[0].readiness), ['REQUIRED_ORGANIZER_MISSING']);
  });

  test('readiness requires an effective Community organizer and preserves invalidated assignment history', async () => {
    const owner = await newUser('readiness-effective-owner@test.local');
    const organizer = await newUser('readiness-effective-organizer@test.local');
    const replacement = await newUser('readiness-effective-replacement@test.local');
    const community = await targetCommunity(owner, 'Effective readiness Community');
    await activeMembership(community, organizer);
    await grantOrganizer(community, organizer);
    const ready = await createReadyCommunitySession(organizer, community);
    const assignmentsBefore = await client.query<{ id: string }>(
      'select id from public.session_organizer_assignments where session_id = $1',
      [ready.sessionId],
    );

    await activeMembership(community, organizer, 'suspended');
    let evaluated = await client.query<{ readiness: ReadinessRow }>(
      'select app_private.target_session_readiness($1) as readiness',
      [ready.sessionId],
    );
    assert.deepEqual(blockerCodes(evaluated.rows[0].readiness), ['REQUIRED_ORGANIZER_MISSING']);
    assert.equal(
      (
        await client.query(
          'select 1 from public.session_organizer_assignments where session_id = $1',
          [ready.sessionId],
        )
      ).rowCount,
      assignmentsBefore.rowCount,
    );

    await activeMembership(community, organizer);
    await client.query(
      `update public.community_responsibilities
          set revoked_at = now()
        where community_id = $1 and user_id = $2 and responsibility = 'ORGANIZER'`,
      [community, organizer],
    );
    evaluated = await client.query<{ readiness: ReadinessRow }>(
      'select app_private.target_session_readiness($1) as readiness',
      [ready.sessionId],
    );
    assert.deepEqual(blockerCodes(evaluated.rows[0].readiness), ['REQUIRED_ORGANIZER_MISSING']);

    await activeMembership(community, replacement);
    await grantOrganizer(community, replacement);
    await directOrganizerAssignment(
      ready.sessionId,
      replacement,
      await membershipId(community, replacement),
    );
    evaluated = await client.query<{ readiness: ReadinessRow }>(
      'select app_private.target_session_readiness($1) as readiness',
      [ready.sessionId],
    );
    assert.equal(evaluated.rows[0].readiness.ready, true);
    assert.deepEqual(blockerCodes(evaluated.rows[0].readiness), []);
  });

  test('readiness keeps a Quick assignment effective without Community membership or responsibility', async () => {
    const organizer = await newUser('readiness-effective-quick@test.local');
    const ready = await createReadySession(organizer);
    const assignment = await client.query<{
      organizer_user_id: string;
      community_membership_id: string | null;
    }>(
      `select organizer_user_id, community_membership_id
         from public.session_organizer_assignments
        where session_id = $1 and revoked_at is null`,
      [ready.sessionId],
    );
    assert.deepEqual(assignment.rows, [
      { organizer_user_id: organizer, community_membership_id: null },
    ]);
    const readiness = await readReadiness(organizer, ready.sessionId);
    assert.equal(readiness.rows[0].ready, true);
  });

  test('replacing the roster with an empty revision yields exactly NO_EFFECTIVE_ROSTER', async () => {
    const organizer = await newUser('readiness-empty-roster@test.local');
    const ready = await createReadySession(organizer);
    await replaceQuickRoster(organizer, {
      sessionId: ready.sessionId,
      expectedRevision: ready.revision,
      participants: [],
    });
    const { rows } = await readReadiness(organizer, ready.sessionId);
    assert.deepEqual(blockerCodes(rows[0]), ['NO_EFFECTIVE_ROSTER']);
  });

  test('a Session with no rules snapshot yields exactly RULES_INVALID', async () => {
    const organizer = await newUser('readiness-no-rules@test.local');
    const { sessionId } = await createReadySession(organizer, { skipRules: true });
    const { rows } = await readReadiness(organizer, sessionId);
    assert.deepEqual(blockerCodes(rows[0]), ['RULES_INVALID']);
  });

  test('a Session with no court yields exactly COURT_CONFIGURATION_INVALID', async () => {
    const organizer = await newUser('readiness-no-court@test.local');
    const { sessionId } = await createReadySession(organizer, { skipCourt: true });
    const { rows } = await readReadiness(organizer, sessionId);
    assert.deepEqual(blockerCodes(rows[0]), ['COURT_CONFIGURATION_INVALID']);
  });

  test('two missing conditions yield both codes, proving blockers accumulate rather than short-circuit', async () => {
    const organizer = await newUser('readiness-accumulate@test.local');
    const { sessionId } = await createReadySession(organizer, {
      skipRules: true,
      skipCourt: true,
    });
    const { rows } = await readReadiness(organizer, sessionId);
    assert.deepEqual(blockerCodes(rows[0]), ['COURT_CONFIGURATION_INVALID', 'RULES_INVALID']);
  });

  test('every returned blocker carries its evaluation_status and owning_wave from the catalog', async () => {
    const organizer = await newUser('readiness-blocker-shape@test.local');
    const { sessionId } = await createReadySession(organizer, {
      skipRules: true,
      skipCourt: true,
    });
    const { rows } = await readReadiness(organizer, sessionId);
    assert.ok(rows[0].blockers.length > 0);
    for (const blocker of rows[0].blockers) {
      assert.ok((EVALUATED_BLOCKER_CODES as readonly string[]).includes(blocker.code));
      assert.equal(blocker.evaluation_status, 'EVALUATED');
      assert.equal(blocker.owning_wave, 'W3');
    }
  });

  test('the five DEFERRED codes never appear in any readiness result in this wave', async () => {
    const organizer = await newUser('readiness-no-deferred@test.local');
    const ready = await createReadySession(organizer);
    const bareSessionId = await createTargetSession(organizer, { name: 'Bare lifecycle Session' });
    const [readyResult, bareResult] = await Promise.all([
      readReadiness(organizer, ready.sessionId),
      readReadiness(organizer, bareSessionId),
    ]);
    for (const result of [readyResult, bareResult]) {
      for (const code of blockerCodes(result.rows[0])) {
        assert.ok(!(DEFERRED_BLOCKER_CODES as readonly string[]).includes(code));
      }
    }
  });

  test('revisions reports the current Session revision, latest roster provenance, and the rules snapshot id, with nulls where absent', async () => {
    const organizer = await newUser('readiness-revisions@test.local');
    const ready = await createReadySession(organizer);
    await replaceQuickRoster(organizer, {
      sessionId: ready.sessionId,
      expectedRevision: ready.revision,
      participants: [{ participant_id: randomUUID(), identity_kind: 'GUEST', display_name: 'Bia' }],
    });
    const expectedReadyRevisions = await observedReadinessRevisions(ready.sessionId);
    assert.equal(expectedReadyRevisions.roster_revision_number, 2);
    assert.notEqual(expectedReadyRevisions.roster_revision_id, ready.rosterRevisionId);
    const { rows } = await readReadiness(organizer, ready.sessionId);
    assert.deepEqual(rows[0].revisions, expectedReadyRevisions);

    const bareSessionId = await createTargetSession(organizer, {
      name: 'Bare revisions Session',
    });
    const bareResult = await readReadiness(organizer, bareSessionId);
    assert.deepEqual(bareResult.rows[0].revisions, await observedReadinessRevisions(bareSessionId));
  });

  test('no table anywhere stores a materialized readiness or is_ready value', async () => {
    const { rows } = await client.query<{
      table_schema: string;
      table_name: string;
      column_name: string;
    }>(
      `select table_schema, table_name, column_name
         from information_schema.columns
        where table_schema <> 'information_schema'
          and table_schema not like 'pg\\_%' escape '\\'
          and (column_name ilike '%is_ready%' or column_name ilike '%readiness%')
        order by table_schema, table_name, column_name`,
    );
    assert.deepEqual(rows, []);
  });

  // --- Step 4: readiness authorization ---------------------------------------------------

  test('the assigned organizer reads Session readiness', async () => {
    const organizer = await newUser('readiness-auth-assigned@test.local');
    const { sessionId } = await createReadySession(organizer);
    const { rows } = await readReadiness(organizer, sessionId);
    assert.equal(rows.length, 1);
  });

  test('read_target_session_readiness requires the assigned Organizer per C5.02', async () => {
    const owner = await newUser('readiness-auth-owner@test.local');
    const assigned = await newUser('readiness-auth-member@test.local');
    const outsider = await newUser('readiness-auth-outsider@test.local');
    const eligibleUnassigned = await newUser('readiness-auth-unassigned@test.local');

    const community = await targetCommunity(owner, 'Readiness authority');
    await activeMembership(community, assigned);
    await activeMembership(community, eligibleUnassigned);
    await grantOrganizer(community, assigned);
    await grantOrganizer(community, eligibleUnassigned);
    const communitySession = await createTargetSession(assigned, {
      communityId: community,
      context: 'COMMUNITY',
      name: 'Readiness authority Community Session',
    });

    const otherOwner = await newUser('readiness-auth-other-owner@test.local');
    const otherOrganizer = await newUser('readiness-auth-other-organizer@test.local');
    const otherCommunity = await targetCommunity(otherOwner, 'Readiness authority other');
    await activeMembership(otherCommunity, otherOrganizer);
    await grantOrganizer(otherCommunity, otherOrganizer);
    const otherCommunitySession = await createTargetSession(otherOrganizer, {
      communityId: otherCommunity,
      context: 'COMMUNITY',
      name: 'Readiness authority other Community Session',
    });

    const legacy = await createLegacySession(assigned, 'Legacy readiness Session');

    const cases: Array<[string | null, string, string]> = [
      [null, communitySession, '42501'],
      [outsider, communitySession, '42501'],
      [eligibleUnassigned, communitySession, '42501'],
      [assigned, otherCommunitySession, '42501'],
      [assigned, legacy, 'P0002'],
    ];
    for (const [actor, sessionId, sqlState] of cases) {
      const rejected = await readReadiness(actor, sessionId).catch((error: Error) => error);
      assertSqlState(rejected, sqlState);
    }
  });

  // --- Step 5: cancellation schema -------------------------------------------------------

  test('public.sessions exposes nullable cancellation columns', async () => {
    const { rows } = await client.query<{
      column_name: string;
      udt_name: string;
      is_nullable: string;
    }>(
      `select column_name, udt_name, is_nullable
         from information_schema.columns
        where table_schema = 'public' and table_name = 'sessions'
          and column_name in ('cancelled_at', 'cancelled_by_user_id', 'cancel_reason')
        order by column_name`,
    );
    assert.deepEqual(rows, [
      { column_name: 'cancel_reason', udt_name: 'text', is_nullable: 'YES' },
      { column_name: 'cancelled_at', udt_name: 'timestamptz', is_nullable: 'YES' },
      { column_name: 'cancelled_by_user_id', udt_name: 'uuid', is_nullable: 'YES' },
    ]);
  });

  test('cancelled_by_user_id references auth.users with ON DELETE SET NULL and a complete leading-column btree index', async () => {
    const { rows: fkRows } = await client.query<{ delete_action: string }>(
      `select case con.confdeltype
                when 'r' then 'RESTRICT' when 'n' then 'SET NULL'
                when 'a' then 'NO ACTION' when 'c' then 'CASCADE'
                else con.confdeltype::text
              end as delete_action
         from pg_constraint con
        where con.contype = 'f'
          and con.conrelid = 'public.sessions'::regclass
          and con.confrelid = 'auth.users'::regclass
          and exists (
            select 1
              from pg_attribute att
             where att.attrelid = con.conrelid
               and att.attname = 'cancelled_by_user_id'
               and att.attnum = any(con.conkey)
               and array_length(con.conkey, 1) = 1
          )`,
    );
    assert.deepEqual(fkRows, [{ delete_action: 'SET NULL' }]);

    const { rows: missingIndexRows } = await client.query<{ constraint_name: string }>(
      `select con.conname as constraint_name
         from pg_constraint con
        where con.contype = 'f'
          and con.conrelid = 'public.sessions'::regclass
          and exists (
            select 1
              from pg_attribute att
             where att.attrelid = con.conrelid
               and att.attname = 'cancelled_by_user_id'
               and att.attnum = any(con.conkey)
               and array_length(con.conkey, 1) = 1
          )
          and not exists (
            select 1
              from pg_index idx
              join pg_class index_class on index_class.oid = idx.indexrelid
              join pg_am access_method on access_method.oid = index_class.relam
             where idx.indrelid = con.conrelid
               and idx.indisvalid
               and idx.indisready
               and idx.indpred is null
               and access_method.amname = 'btree'
               and idx.indnkeyatts >= cardinality(con.conkey)
               and not exists (
                 select 1
                   from generate_subscripts(con.conkey, 1) position
                  where idx.indkey[position - 1] <> con.conkey[position]
               )
          )`,
    );
    assert.deepEqual(missingIndexRows, []);
  });

  test('a target Session cancelled without cancelled_at is rejected with 23514', async () => {
    const organizer = await newUser('cancel-missing-audit@test.local');
    const sessionId = await createTargetSession(organizer);
    const rejected = await client
      .query(
        `update public.sessions
            set lifecycle_status = 'CANCELLED',
                cancelled_by_user_id = $2,
                cancel_reason = 'Chuva'
          where id = $1`,
        [sessionId, organizer],
      )
      .catch((error: Error) => error);
    assertSqlState(rejected, '23514');
  });

  test('a blank cancel_reason is rejected with 23514', async () => {
    const organizer = await newUser('cancel-reason-blank@test.local');
    const sessionId = await createTargetSession(organizer);
    const rejected = await client
      .query(
        `update public.sessions
            set lifecycle_status = 'CANCELLED',
                cancelled_at = now(),
                cancelled_by_user_id = $2,
                cancel_reason = '   '
          where id = $1`,
        [sessionId, organizer],
      )
      .catch((error: Error) => error);
    assertSqlState(rejected, '23514');
  });

  test('a legacy Session with null lifecycle_status is unaffected by the cancellation constraint', async () => {
    const owner = await newUser('cancel-legacy-unaffected@test.local');
    const legacySessionId = await createLegacySession(owner, 'Legacy cancellation Session');
    await client.query(
      `update public.sessions
          set cancelled_at = now(), cancelled_by_user_id = $2, cancel_reason = 'Chuva'
        where id = $1`,
      [legacySessionId, owner],
    );
    const { rows } = await client.query<{
      cancelled_at: string | null;
      cancel_reason: string | null;
      lifecycle_status: string | null;
    }>(
      `select cancelled_at, cancel_reason, lifecycle_status
         from public.sessions where id = $1`,
      [legacySessionId],
    );
    assert.equal(rows.length, 1);
    assert.ok(rows[0].cancelled_at);
    assert.equal(rows[0].cancel_reason, 'Chuva');
    assert.equal(rows[0].lifecycle_status, null);
  });

  // --- Task 5 Step 2: lifecycle transitions ----------------------------------------------

  test('schedule_target_session moves DRAFT to SCHEDULED and returns the incremented Session revision', async () => {
    const organizer = await newUser('lifecycle-schedule-happy@test.local');
    const sessionId = await createTargetSession(organizer, { name: 'Schedule happy Session' });
    await client.query(
      `update public.sessions set planned_start_at = '2030-06-01T10:00:00Z' where id = $1`,
      [sessionId],
    );
    const revision = await sessionRevision(sessionId);
    const result = await scheduleSession(organizer, { sessionId, expectedRevision: revision });
    assert.equal(result.rows[0].session_revision, revision + 1);
    const state = await sessionState(sessionId);
    assert.equal(state.lifecycle_status, 'SCHEDULED');
    assert.equal(state.revision, revision + 1);
    assert.equal(state.status, await compatibilityStatus('SCHEDULED'));
  });

  test('schedule_target_session rejects a Session with no planned_start_at with 23514', async () => {
    const organizer = await newUser('lifecycle-schedule-missing-start@test.local');
    const sessionId = await createTargetSession(organizer, { name: 'Schedule missing start' });
    const revision = await sessionRevision(sessionId);
    const rejected = await scheduleSession(organizer, {
      sessionId,
      expectedRevision: revision,
    }).catch((error: Error) => error);
    assertSqlState(rejected, '23514');
    const state = await sessionState(sessionId);
    assert.equal(state.lifecycle_status, 'DRAFT');
    assert.equal(state.revision, revision);
  });

  test('start_target_session moves SCHEDULED to IN_PROGRESS, sets actual_started_at, and leaves planned_start_at untouched (SES-INV-027)', async () => {
    const organizer = await newUser('lifecycle-start-scheduled@test.local');
    const { sessionId } = await createReadySession(organizer);
    await forceLifecycleStatus(sessionId, 'SCHEDULED', organizer);
    await client.query(
      `update public.sessions set planned_start_at = '2030-06-01T10:00:00Z' where id = $1`,
      [sessionId],
    );
    const before = await sessionState(sessionId);
    const revision = await sessionRevision(sessionId);
    const result = await startSession(organizer, { sessionId, expectedRevision: revision });
    assert.equal(result.rows[0].session_revision, revision + 1);
    const after = await sessionState(sessionId);
    assert.equal(after.lifecycle_status, 'IN_PROGRESS');
    assert.ok(after.actual_started_at);
    // assert.equal uses `==`, which is reference (not value) equality once pg parses
    // timestamptz into a Date object -- two separately-fetched Dates for the identical
    // instant would always compare unequal. assert.deepEqual compares Date values.
    assert.deepEqual(after.planned_start_at, before.planned_start_at);
    assert.equal(after.status, await compatibilityStatus('IN_PROGRESS'));
  });

  test('start_target_session accepts DRAFT to IN_PROGRESS directly, the reduced Quick path from N4.04.03.01', async () => {
    const organizer = await newUser('lifecycle-start-draft-direct@test.local');
    const sessionId = await createTargetSession(organizer, { name: 'Start direct from draft' });
    const revision = await sessionRevision(sessionId);
    const result = await startSession(organizer, { sessionId, expectedRevision: revision });
    assert.equal(result.rows[0].session_revision, revision + 1);
    const state = await sessionState(sessionId);
    assert.equal(state.lifecycle_status, 'IN_PROGRESS');
    assert.ok(state.actual_started_at);
  });

  test('start_target_session rejects a ready Community Session in DRAFT without effects or a receipt', async () => {
    const owner = await newUser('lifecycle-start-community-draft-owner@test.local');
    const organizer = await newUser('lifecycle-start-community-draft-organizer@test.local');
    const community = await targetCommunity(owner, 'Community DRAFT start guard');
    await activeMembership(community, organizer);
    await grantOrganizer(community, organizer);
    const { sessionId, revision } = await createReadyCommunitySession(organizer, community);
    const readiness = await readReadiness(organizer, sessionId);
    assert.equal(readiness.rows[0].ready, true);

    const commandId = randomUUID();
    const before = await sessionState(sessionId);
    const rejected = await startSession(organizer, {
      commandId,
      sessionId,
      expectedRevision: revision,
    }).catch((error: Error) => error);
    assertSqlState(rejected, '23514');
    assert.deepEqual(await sessionState(sessionId), before);
    assert.equal((await commandReceipt(commandId)).length, 0);
  });

  test('finish_target_session moves IN_PROGRESS to COMPLETED and sets actual_finished_at', async () => {
    const organizer = await newUser('lifecycle-finish-happy@test.local');
    const sessionId = await createTargetSession(organizer, { name: 'Finish happy Session' });
    await forceLifecycleStatus(sessionId, 'IN_PROGRESS', organizer);
    const revision = await sessionRevision(sessionId);
    const result = await finishSession(organizer, { sessionId, expectedRevision: revision });
    assert.equal(result.rows[0].session_revision, revision + 1);
    const state = await sessionState(sessionId);
    assert.equal(state.lifecycle_status, 'COMPLETED');
    assert.ok(state.actual_finished_at);
    assert.equal(state.status, await compatibilityStatus('COMPLETED'));
  });

  test('cancel_target_session moves DRAFT, SCHEDULED and IN_PROGRESS to CANCELLED, recording cancelled_at, cancelled_by_user_id and cancel_reason', async () => {
    const organizer = await newUser('lifecycle-cancel-happy@test.local');
    for (const status of ['DRAFT', 'SCHEDULED', 'IN_PROGRESS'] as const) {
      const sessionId = await createTargetSession(organizer, { name: `Cancel from ${status}` });
      if (status !== 'DRAFT') await forceLifecycleStatus(sessionId, status, organizer);
      const revision = await sessionRevision(sessionId);
      const result = await cancelSession(organizer, {
        sessionId,
        expectedRevision: revision,
        reason: `Cancelling from ${status}`,
      });
      assert.equal(result.rows[0].session_revision, revision + 1);
      const state = await sessionState(sessionId);
      assert.equal(state.lifecycle_status, 'CANCELLED');
      assert.ok(state.cancelled_at);
      assert.equal(state.cancelled_by_user_id, organizer);
      assert.equal(state.cancel_reason, `Cancelling from ${status}`);
      assert.equal(state.status, await compatibilityStatus('CANCELLED'));
    }
  });

  test('cancel_target_session accepts a null cancel_reason (I6)', async () => {
    const organizer = await newUser('lifecycle-cancel-null-reason@test.local');
    const sessionId = await createTargetSession(organizer, { name: 'Cancel null reason' });
    const revision = await sessionRevision(sessionId);
    const result = await cancelSession(organizer, {
      sessionId,
      expectedRevision: revision,
      reason: null,
    });
    assert.equal(result.rows[0].session_revision, revision + 1);
    const state = await sessionState(sessionId);
    assert.equal(state.lifecycle_status, 'CANCELLED');
    assert.ok(state.cancelled_at);
    assert.equal(state.cancelled_by_user_id, organizer);
    assert.equal(state.cancel_reason, null);
  });

  test('cancelling a Session preserves history: participant, revision, snapshot, court and organizer counts stay unchanged (SES-INV-026)', async () => {
    const organizer = await newUser('lifecycle-cancel-history@test.local');
    const ready = await createReadySession(organizer);
    const before = await aggregateCounts(ready.sessionId);
    const revision = await sessionRevision(ready.sessionId);
    await cancelSession(organizer, {
      sessionId: ready.sessionId,
      expectedRevision: revision,
      reason: 'Chuva',
    });
    const after = await aggregateCounts(ready.sessionId);
    assert.deepEqual(after, before);
    const rosterRead = await call<{
      roster_revision_id: string;
      entries: unknown[];
    }>(organizer, 'select * from public.read_target_roster_revision($1)', [ready.rosterRevisionId]);
    assert.equal(rosterRead.rows.length, 1);
    assert.equal(rosterRead.rows[0].roster_revision_id, ready.rosterRevisionId);
    assert.ok(rosterRead.rows[0].entries.length > 0);
  });

  test('anonymizing the cancellation actor preserves the cancellation audit and all Session history', async () => {
    const organizer = await newUser('lifecycle-cancel-anonymized-actor@test.local');
    const ready = await createReadySession(organizer);
    const revision = await sessionRevision(ready.sessionId);
    await cancelSession(organizer, {
      sessionId: ready.sessionId,
      expectedRevision: revision,
      reason: 'Chuva forte',
    });
    const beforeState = await sessionState(ready.sessionId);
    const beforeCounts = await aggregateCounts(ready.sessionId);
    assert.equal(beforeState.cancelled_by_user_id, organizer);

    await client.query('update public.sessions set cancelled_by_user_id = null where id = $1', [
      ready.sessionId,
    ]);

    const afterState = await sessionState(ready.sessionId);
    assert.equal(afterState.lifecycle_status, 'CANCELLED');
    assert.equal(afterState.cancelled_by_user_id, null);
    assert.deepEqual(afterState.cancelled_at, beforeState.cancelled_at);
    assert.equal(afterState.cancel_reason, 'Chuva forte');
    assert.equal(afterState.revision, beforeState.revision);
    assert.deepEqual(await aggregateCounts(ready.sessionId), beforeCounts);
  });

  test('every disallowed lifecycle transition is rejected with 23514', async () => {
    const organizer = await newUser('lifecycle-disallowed@test.local');
    const cases: Array<{
      name: string;
      from: 'DRAFT' | 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
      attempt: (sessionId: string, expectedRevision: number) => Promise<unknown>;
    }> = [
      {
        name: 'finish from DRAFT',
        from: 'DRAFT',
        attempt: (id, rev) => finishSession(organizer, { sessionId: id, expectedRevision: rev }),
      },
      {
        name: 'start from COMPLETED',
        from: 'COMPLETED',
        attempt: (id, rev) => startSession(organizer, { sessionId: id, expectedRevision: rev }),
      },
      {
        name: 'schedule from IN_PROGRESS',
        from: 'IN_PROGRESS',
        attempt: (id, rev) => scheduleSession(organizer, { sessionId: id, expectedRevision: rev }),
      },
      {
        name: 'schedule from COMPLETED',
        from: 'COMPLETED',
        attempt: (id, rev) => scheduleSession(organizer, { sessionId: id, expectedRevision: rev }),
      },
      {
        name: 'schedule from CANCELLED',
        from: 'CANCELLED',
        attempt: (id, rev) => scheduleSession(organizer, { sessionId: id, expectedRevision: rev }),
      },
      {
        name: 'start from CANCELLED',
        from: 'CANCELLED',
        attempt: (id, rev) => startSession(organizer, { sessionId: id, expectedRevision: rev }),
      },
      {
        name: 'finish from CANCELLED',
        from: 'CANCELLED',
        attempt: (id, rev) => finishSession(organizer, { sessionId: id, expectedRevision: rev }),
      },
      {
        name: 'finish from SCHEDULED',
        from: 'SCHEDULED',
        attempt: (id, rev) => finishSession(organizer, { sessionId: id, expectedRevision: rev }),
      },
      {
        name: 'cancel from COMPLETED',
        from: 'COMPLETED',
        attempt: (id, rev) =>
          cancelSession(organizer, { sessionId: id, expectedRevision: rev, reason: 'Chuva' }),
      },
    ];

    for (const testCase of cases) {
      const sessionId = await createTargetSession(organizer, {
        name: `Disallowed ${testCase.name}`,
      });
      if (testCase.from !== 'DRAFT')
        await forceLifecycleStatus(sessionId, testCase.from, organizer);
      const revision = await sessionRevision(sessionId);
      const rejected = await testCase.attempt(sessionId, revision).catch((error: Error) => error);
      assertSqlState(rejected, '23514');
      const state = await sessionState(sessionId);
      assert.equal(state.lifecycle_status, testCase.from);
      assert.equal(state.revision, revision);
    }
  });

  // --- Task 5 Step 3: readiness revalidation ----------------------------------------------

  test('SES-INV-024: start_target_session revalidates readiness and rejects a Session whose roster went empty after scheduling', async () => {
    const organizer = await newUser('lifecycle-readiness-revalidate@test.local');
    const ready = await createReadySession(organizer);
    await client.query(
      `update public.sessions set planned_start_at = '2030-06-01T10:00:00Z' where id = $1`,
      [ready.sessionId],
    );
    let revision = await sessionRevision(ready.sessionId);
    const scheduled = await scheduleSession(organizer, {
      sessionId: ready.sessionId,
      expectedRevision: revision,
    });
    revision = scheduled.rows[0].session_revision;

    const before = await readReadiness(organizer, ready.sessionId);
    assert.equal(before.rows[0].ready, true);

    const emptied = await replaceQuickRoster(organizer, {
      sessionId: ready.sessionId,
      expectedRevision: revision,
      participants: [],
    });
    revision = emptied.rows[0].session_revision;

    const failingCommandId = randomUUID();
    const rejected = await startSession(organizer, {
      commandId: failingCommandId,
      sessionId: ready.sessionId,
      expectedRevision: revision,
    }).catch((error: Error) => error);
    assertSqlState(rejected, '23514');

    const after = await sessionState(ready.sessionId);
    assert.equal(after.lifecycle_status, 'SCHEDULED');
    assert.equal(after.actual_started_at, null);
    const receipt = await client.query(
      'select 1 from app_private.command_receipts where command_id = $1',
      [failingCommandId],
    );
    assert.equal(receipt.rowCount, 0);
  });

  // --- Task 5 Step 4: idempotency ----------------------------------------------------------

  test('retrying start_target_session with the same command_id returns the identical result even though expected_revision is now stale (QA-INV-009)', async () => {
    const organizer = await newUser('lifecycle-idempotent-retry@test.local');
    const sessionId = await createTargetSession(organizer, { name: 'Idempotent retry Session' });
    const commandId = randomUUID();
    const revision = await sessionRevision(sessionId);
    const first = await startSession(organizer, {
      commandId,
      sessionId,
      expectedRevision: revision,
    });

    await client.query('update public.sessions set revision = revision + 5 where id = $1', [
      sessionId,
    ]);

    const retried = await startSession(organizer, {
      commandId,
      sessionId,
      expectedRevision: revision,
    });
    assert.deepEqual(retried.rows, first.rows);
  });

  test('exactly one actual_started_at value survives three retries of start_target_session with one command_id (QA-INV-010)', async () => {
    const organizer = await newUser('lifecycle-idempotent-triple@test.local');
    const sessionId = await createTargetSession(organizer, { name: 'Idempotent triple retry' });
    const commandId = randomUUID();
    const revision = await sessionRevision(sessionId);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await startSession(organizer, { commandId, sessionId, expectedRevision: revision });
    }
    const state = await sessionState(sessionId);
    assert.ok(state.actual_started_at);
  });

  test('distinct schedule command IDs with the same original revision produce one SCHEDULED effect and two receipts', async () => {
    const organizer = await newUser('lifecycle-idempotent-schedule@test.local');
    const sessionId = await createTargetSession(organizer, { name: 'Idempotent schedule' });
    await client.query(
      `update public.sessions set planned_start_at = '2030-06-01T10:00:00Z' where id = $1`,
      [sessionId],
    );
    const revision = await sessionRevision(sessionId);
    const commandIds = [randomUUID(), randomUUID()];
    const first = await scheduleSession(organizer, {
      commandId: commandIds[0],
      sessionId,
      expectedRevision: revision,
    });
    const second = await scheduleSession(organizer, {
      commandId: commandIds[1],
      sessionId,
      expectedRevision: revision,
    });
    assert.deepEqual(first.rows, [{ session_revision: revision + 1 }]);
    assert.deepEqual(second.rows, first.rows);
    assert.equal((await sessionState(sessionId)).lifecycle_status, 'SCHEDULED');
    assert.equal(await sessionRevision(sessionId), revision + 1);
    for (const commandId of commandIds) assert.equal((await commandReceipt(commandId)).length, 1);
  });

  test('distinct start command IDs with the same original revision produce one IN_PROGRESS effect and two receipts', async () => {
    const organizer = await newUser('lifecycle-idempotent-domain@test.local');
    const sessionId = await createTargetSession(organizer, { name: 'Idempotent domain retry' });
    const revision = await sessionRevision(sessionId);
    const commandIds = [randomUUID(), randomUUID()];
    const first = await startSession(organizer, {
      commandId: commandIds[0],
      sessionId,
      expectedRevision: revision,
    });
    const afterFirst = await sessionState(sessionId);
    const second = await startSession(organizer, {
      commandId: commandIds[1],
      sessionId,
      expectedRevision: revision,
    });
    const afterSecond = await sessionState(sessionId);
    assert.deepEqual(second.rows, first.rows);
    assert.equal(afterSecond.lifecycle_status, 'IN_PROGRESS');
    assert.deepEqual(afterSecond.actual_started_at, afterFirst.actual_started_at);
    assert.equal(afterSecond.revision, revision + 1);
    for (const commandId of commandIds) assert.equal((await commandReceipt(commandId)).length, 1);
  });

  test('distinct publish command IDs with the same original revision produce one PUBLISHED effect and two receipts', async () => {
    const organizer = await newUser('lifecycle-idempotent-publish@test.local');
    const sessionId = await createTargetSession(organizer, { name: 'Idempotent publish' });
    const revision = await sessionRevision(sessionId);
    const commandIds = [randomUUID(), randomUUID()];
    const first = await publishSession(organizer, {
      commandId: commandIds[0],
      sessionId,
      expectedRevision: revision,
    });
    const second = await publishSession(organizer, {
      commandId: commandIds[1],
      sessionId,
      expectedRevision: revision,
    });
    assert.deepEqual(second.rows, first.rows);
    const state = await sessionState(sessionId);
    assert.equal(state.publication_state, 'PUBLISHED');
    assert.equal(state.revision, revision + 1);
    for (const commandId of commandIds) assert.equal((await commandReceipt(commandId)).length, 1);
  });

  test('distinct assign command IDs with the same original revision produce one active assignment and two receipts', async () => {
    const owner = await newUser('lifecycle-idempotent-assign-owner@test.local');
    const organizer = await newUser('lifecycle-idempotent-assign-target@test.local');
    const sessionId = await createTargetSession(owner, { name: 'Idempotent assign' });
    const revision = await sessionRevision(sessionId);
    const commandIds = [randomUUID(), randomUUID()];
    const assignmentId = randomUUID();
    const first = await assignOrganizer(owner, {
      commandId: commandIds[0],
      assignmentId,
      sessionId,
      expectedRevision: revision,
      organizerUserId: organizer,
    });
    const second = await assignOrganizer(owner, {
      commandId: commandIds[1],
      assignmentId: randomUUID(),
      sessionId,
      expectedRevision: revision,
      organizerUserId: organizer,
    });
    assert.deepEqual(first.rows, [{ assignment_id: assignmentId, session_revision: revision + 1 }]);
    assert.deepEqual(second.rows, first.rows);
    const assignments = await client.query(
      `select 1 from public.session_organizer_assignments
        where session_id = $1 and organizer_user_id = $2 and revoked_at is null`,
      [sessionId, organizer],
    );
    assert.equal(assignments.rowCount, 1);
    assert.equal(await sessionRevision(sessionId), revision + 1);
    for (const commandId of commandIds) assert.equal((await commandReceipt(commandId)).length, 1);
  });

  test('distinct revoke command IDs with the same original revision preserve one revocation and write two receipts', async () => {
    const owner = await newUser('lifecycle-idempotent-revoke-owner@test.local');
    const organizer = await newUser('lifecycle-idempotent-revoke-target@test.local');
    const sessionId = await createTargetSession(owner, { name: 'Idempotent revoke' });
    const assignmentId = await directOrganizerAssignment(sessionId, organizer);
    const revision = await sessionRevision(sessionId);
    const commandIds = [randomUUID(), randomUUID()];
    const first = await revokeOrganizer(owner, {
      commandId: commandIds[0],
      sessionId,
      expectedRevision: revision,
      organizerUserId: organizer,
    });
    const afterFirst = await client.query<{ revoked_at: string }>(
      'select revoked_at from public.session_organizer_assignments where id = $1',
      [assignmentId],
    );
    const second = await revokeOrganizer(owner, {
      commandId: commandIds[1],
      sessionId,
      expectedRevision: revision,
      organizerUserId: organizer,
    });
    const afterSecond = await client.query<{ revoked_at: string }>(
      'select revoked_at from public.session_organizer_assignments where id = $1',
      [assignmentId],
    );
    assert.deepEqual(second.rows, first.rows);
    assert.deepEqual(afterSecond.rows, afterFirst.rows);
    assert.equal(await sessionRevision(sessionId), revision + 1);
    for (const commandId of commandIds) assert.equal((await commandReceipt(commandId)).length, 1);
  });

  test('distinct finish command IDs with the same original revision preserve one completion timestamp and write two receipts', async () => {
    const organizer = await newUser('lifecycle-idempotent-finish@test.local');
    const sessionId = await createTargetSession(organizer, { name: 'Idempotent finish' });
    await forceLifecycleStatus(sessionId, 'IN_PROGRESS', organizer);
    const revision = await sessionRevision(sessionId);
    const commandIds = [randomUUID(), randomUUID()];
    const first = await finishSession(organizer, {
      commandId: commandIds[0],
      sessionId,
      expectedRevision: revision,
    });
    const afterFirst = await sessionState(sessionId);
    const second = await finishSession(organizer, {
      commandId: commandIds[1],
      sessionId,
      expectedRevision: revision,
    });
    const afterSecond = await sessionState(sessionId);
    assert.deepEqual(second.rows, first.rows);
    assert.deepEqual(afterSecond.actual_finished_at, afterFirst.actual_finished_at);
    assert.equal(afterSecond.revision, revision + 1);
    for (const commandId of commandIds) assert.equal((await commandReceipt(commandId)).length, 1);
  });

  test('distinct cancel command IDs with the same original revision preserve the first audit and write two receipts', async () => {
    const organizer = await newUser('lifecycle-idempotent-cancel@test.local');
    const sessionId = await createTargetSession(organizer, { name: 'Idempotent cancel' });
    const revision = await sessionRevision(sessionId);
    const commandIds = [randomUUID(), randomUUID()];
    const first = await cancelSession(organizer, {
      commandId: commandIds[0],
      sessionId,
      expectedRevision: revision,
      reason: 'Chuva',
    });
    const afterFirst = await sessionState(sessionId);
    const second = await cancelSession(organizer, {
      commandId: commandIds[1],
      sessionId,
      expectedRevision: revision,
      reason: 'Outro motivo valido',
    });
    const afterSecond = await sessionState(sessionId);
    assert.deepEqual(second.rows, first.rows);
    assert.deepEqual(afterSecond.cancelled_at, afterFirst.cancelled_at);
    assert.equal(afterSecond.cancelled_by_user_id, afterFirst.cancelled_by_user_id);
    assert.equal(afterSecond.cancel_reason, 'Chuva');
    assert.equal(afterSecond.revision, revision + 1);
    for (const commandId of commandIds) assert.equal((await commandReceipt(commandId)).length, 1);
  });

  test('distinct identical configure commands with the same original revision produce one Court effect and two receipts', async () => {
    const organizer = await newUser('lifecycle-idempotent-configure@test.local');
    const sessionId = await createTargetSession(organizer, { name: 'Idempotent configure' });
    const court = await client.query<{ id: string }>(
      'select id from public.session_courts where session_id = $1',
      [sessionId],
    );
    const courtId = court.rows[0].id;
    const revision = await sessionRevision(sessionId);
    const commandIds = [randomUUID(), randomUUID()];
    const first = await configureCourt(organizer, {
      commandId: commandIds[0],
      courtId,
      sessionId,
      expectedRevision: revision,
      label: 'Quadra Central',
      courtOrder: 2,
    });
    const second = await configureCourt(organizer, {
      commandId: commandIds[1],
      courtId,
      sessionId,
      expectedRevision: revision,
      label: '  Quadra Central  ',
      courtOrder: 2,
    });
    assert.deepEqual(second.rows, first.rows);
    const configured = await client.query<{ label: string; court_order: number }>(
      'select label, court_order from public.session_courts where id = $1',
      [courtId],
    );
    assert.deepEqual(configured.rows, [{ label: 'Quadra Central', court_order: 2 }]);
    assert.equal(await sessionRevision(sessionId), revision + 1);
    for (const commandId of commandIds) assert.equal((await commandReceipt(commandId)).length, 1);

    const staleDifferentCommandId = randomUUID();
    const staleDifferent = await configureCourt(organizer, {
      commandId: staleDifferentCommandId,
      courtId,
      sessionId,
      expectedRevision: revision,
      label: 'Quadra Lateral',
      courtOrder: 3,
    }).catch((error: Error) => error);
    assertSqlState(staleDifferent, '40001');
    assert.equal((await commandReceipt(staleDifferentCommandId)).length, 0);
  });

  test('reusing a command_id from start_target_session on finish_target_session raises 23505 (QA-INV-011)', async () => {
    const organizer = await newUser('lifecycle-idempotent-cross-command@test.local');
    const sessionId = await createTargetSession(organizer, { name: 'Idempotent cross command' });
    const commandId = randomUUID();
    const revision = await sessionRevision(sessionId);
    const started = await startSession(organizer, {
      commandId,
      sessionId,
      expectedRevision: revision,
    });
    const rejected = await finishSession(organizer, {
      commandId,
      sessionId,
      expectedRevision: started.rows[0].session_revision,
    }).catch((error: Error) => error);
    assertSqlState(rejected, '23505');
  });

  test('reusing a command_id against a different Session raises 23505 (QA-INV-011)', async () => {
    const organizer = await newUser('lifecycle-idempotent-cross-session@test.local');
    const firstSessionId = await createTargetSession(organizer, {
      name: 'Idempotent cross session A',
    });
    const secondSessionId = await createTargetSession(organizer, {
      name: 'Idempotent cross session B',
    });
    const commandId = randomUUID();
    const revisionA = await sessionRevision(firstSessionId);
    await startSession(organizer, {
      commandId,
      sessionId: firstSessionId,
      expectedRevision: revisionA,
    });
    const revisionB = await sessionRevision(secondSessionId);
    const rejected = await startSession(organizer, {
      commandId,
      sessionId: secondSessionId,
      expectedRevision: revisionB,
    }).catch((error: Error) => error);
    assertSqlState(rejected, '23505');
  });

  test('a receipt row exists after each successful lifecycle command with the correct command_type, aggregate_id, actor_id and retention_class', async () => {
    const organizer = await newUser('lifecycle-receipt-shape@test.local');
    const guestOrganizer = await newUser('lifecycle-receipt-shape-guest@test.local');

    const cases: Array<{ commandType: string; commandId: string; sessionId: string }> = [];

    {
      const sessionId = await createTargetSession(organizer, { name: 'Receipt shape schedule' });
      await client.query(
        `update public.sessions set planned_start_at = '2030-06-01T10:00:00Z' where id = $1`,
        [sessionId],
      );
      const commandId = randomUUID();
      await scheduleSession(organizer, {
        commandId,
        sessionId,
        expectedRevision: await sessionRevision(sessionId),
      });
      cases.push({ commandType: 'schedule_target_session', commandId, sessionId });
    }

    {
      const sessionId = await createTargetSession(organizer, { name: 'Receipt shape publish' });
      const commandId = randomUUID();
      await publishSession(organizer, {
        commandId,
        sessionId,
        expectedRevision: await sessionRevision(sessionId),
      });
      cases.push({ commandType: 'publish_target_session', commandId, sessionId });
    }

    {
      const sessionId = await createTargetSession(organizer, { name: 'Receipt shape start' });
      const commandId = randomUUID();
      await startSession(organizer, {
        commandId,
        sessionId,
        expectedRevision: await sessionRevision(sessionId),
      });
      cases.push({ commandType: 'start_target_session', commandId, sessionId });
    }

    {
      const sessionId = await createTargetSession(organizer, { name: 'Receipt shape finish' });
      await forceLifecycleStatus(sessionId, 'IN_PROGRESS', organizer);
      const commandId = randomUUID();
      await finishSession(organizer, {
        commandId,
        sessionId,
        expectedRevision: await sessionRevision(sessionId),
      });
      cases.push({ commandType: 'finish_target_session', commandId, sessionId });
    }

    {
      const sessionId = await createTargetSession(organizer, { name: 'Receipt shape cancel' });
      const commandId = randomUUID();
      await cancelSession(organizer, {
        commandId,
        sessionId,
        expectedRevision: await sessionRevision(sessionId),
        reason: 'Chuva',
      });
      cases.push({ commandType: 'cancel_target_session', commandId, sessionId });
    }

    {
      const sessionId = await createTargetSession(organizer, { name: 'Receipt shape assign' });
      const commandId = randomUUID();
      await assignOrganizer(organizer, {
        commandId,
        sessionId,
        expectedRevision: await sessionRevision(sessionId),
        organizerUserId: guestOrganizer,
      });
      cases.push({ commandType: 'assign_target_session_organizer', commandId, sessionId });
    }

    {
      const sessionId = await createTargetSession(organizer, { name: 'Receipt shape revoke' });
      // `organizer` is auto-assigned by createTargetSession; add a second organizer directly
      // (bypassing the not-yet-existing assign command) so revoking one leaves the other with
      // write authority to observe the effect, per the CONTEXT warning about self-revocation.
      const secondOrganizer = await newUser('lifecycle-receipt-shape-revoke-second@test.local');
      await directOrganizerAssignment(sessionId, secondOrganizer);
      const commandId = randomUUID();
      await revokeOrganizer(organizer, {
        commandId,
        sessionId,
        expectedRevision: await sessionRevision(sessionId),
        organizerUserId: secondOrganizer,
      });
      cases.push({ commandType: 'revoke_target_session_organizer', commandId, sessionId });
    }

    {
      const sessionId = await createTargetSession(organizer, { name: 'Receipt shape court' });
      const addedCourt = await call<CourtCommandRow>(
        organizer,
        'select * from public.add_target_session_court($1, $2, $3, $4, $5)',
        [randomUUID(), sessionId, await sessionRevision(sessionId), 'Quadra receipt setup', 2],
      );
      assert.equal(
        addedCourt.rows.length,
        1,
        'expected add_target_session_court to create exactly one court',
      );
      const commandId = randomUUID();
      await configureCourt(organizer, {
        commandId,
        courtId: addedCourt.rows[0].court_id,
        sessionId,
        expectedRevision: addedCourt.rows[0].session_revision,
        label: 'Quadra receipt',
        courtOrder: 3,
      });
      cases.push({ commandType: 'configure_target_session_court', commandId, sessionId });
    }

    for (const { commandId, commandType, sessionId } of cases) {
      const receipts = await commandReceipt(commandId);
      assert.equal(receipts.length, 1);
      assert.equal(receipts[0].command_type, commandType);
      assert.equal(receipts[0].aggregate_id, sessionId);
      assert.equal(receipts[0].actor_id, organizer);
      assert.equal(receipts[0].retention_class, 'SESSION_LIFECYCLE');
    }
  });

  // --- Task 5 Step 5: concurrency and rollback ---------------------------------------------

  test('two concurrent start_target_session calls on distinct command IDs and the same expected_revision serialize on the Session lock (QA-INV-008)', async () => {
    const organizer = await newUser('lifecycle-concurrency@test.local');
    const sessionId = await createTargetSession(organizer, { name: 'Concurrency start Session' });
    const revision = await sessionRevision(sessionId);
    const a = await pool.connect();
    const b = await pool.connect();
    try {
      const attempt = (db: typeof a, commandId: string) =>
        asIdentityCommitting(db, organizer, () =>
          db.query<LifecycleCommandRow>('select * from public.start_target_session($1, $2, $3)', [
            commandId,
            sessionId,
            revision,
          ]),
        ).catch((error: Error) => error);
      const outcomes = await Promise.all([attempt(a, randomUUID()), attempt(b, randomUUID())]);
      const committed = outcomes.filter(
        (outcome): outcome is QueryResult<LifecycleCommandRow> => !(outcome instanceof Error),
      );
      assert.equal(committed.length, 2);
      assert.deepEqual(
        committed.map((outcome) => outcome.rows[0].session_revision),
        [revision + 1, revision + 1],
      );
      const state = await sessionState(sessionId);
      assert.equal(state.lifecycle_status, 'IN_PROGRESS');
      assert.ok(state.actual_started_at);
      assert.equal(state.revision, revision + 1);
    } finally {
      a.release();
      b.release();
    }
  });

  test('a rejected lifecycle command leaves no receipt row, no revision increment, no timestamp and no cancellation audit (QA-INV-012)', async () => {
    const organizer = await newUser('lifecycle-rollback@test.local');
    const sessionId = await createTargetSession(organizer, { name: 'Rollback Session' });
    await forceLifecycleStatus(sessionId, 'COMPLETED', organizer);
    const before = await sessionState(sessionId);
    const commandId = randomUUID();
    const rejected = await cancelSession(organizer, {
      commandId,
      sessionId,
      expectedRevision: before.revision,
      reason: 'Should not apply',
    }).catch((error: Error) => error);
    assertSqlState(rejected, '23514');
    const after = await sessionState(sessionId);
    assert.deepEqual(after, before);
    const receipt = await client.query(
      'select 1 from app_private.command_receipts where command_id = $1',
      [commandId],
    );
    assert.equal(receipt.rowCount, 0);
  });

  // --- Task 5 Step 6: the Match guard (SES-INV-025) ----------------------------------------

  test('finish_target_session fails 23514 while a non-terminal Match references the Session (SES-INV-025)', async () => {
    const organizer = await newUser('lifecycle-match-guard-finish@test.local');
    const sessionId = await createTargetSession(organizer, { name: 'Match guard finish' });
    await forceLifecycleStatus(sessionId, 'IN_PROGRESS', organizer);
    await legacyGame(sessionId, 'active');
    const revision = await sessionRevision(sessionId);
    const rejected = await finishSession(organizer, {
      sessionId,
      expectedRevision: revision,
    }).catch((error: Error) => error);
    assertSqlState(rejected, '23514');
    const state = await sessionState(sessionId);
    assert.equal(state.lifecycle_status, 'IN_PROGRESS');
  });

  test('cancel_target_session from IN_PROGRESS fails 23514 while a non-terminal Match references the Session (N5.04.16.02)', async () => {
    const organizer = await newUser('lifecycle-match-guard-cancel@test.local');
    const sessionId = await createTargetSession(organizer, { name: 'Match guard cancel' });
    await forceLifecycleStatus(sessionId, 'IN_PROGRESS', organizer);
    await legacyGame(sessionId, 'active');
    const revision = await sessionRevision(sessionId);
    const rejected = await cancelSession(organizer, {
      sessionId,
      expectedRevision: revision,
      reason: 'Chuva',
    }).catch((error: Error) => error);
    assertSqlState(rejected, '23514');
  });

  test('finish_target_session and cancel_target_session succeed once every Match on the Session reaches a terminal status', async () => {
    const organizer = await newUser('lifecycle-match-guard-terminal@test.local');

    const finishSessionId = await createTargetSession(organizer, {
      name: 'Match guard finish terminal',
    });
    await forceLifecycleStatus(finishSessionId, 'IN_PROGRESS', organizer);
    await legacyGame(finishSessionId, 'finished');
    const finishRevision = await sessionRevision(finishSessionId);
    const finishResult = await finishSession(organizer, {
      sessionId: finishSessionId,
      expectedRevision: finishRevision,
    });
    assert.equal(finishResult.rows[0].session_revision, finishRevision + 1);

    const cancelSessionId = await createTargetSession(organizer, {
      name: 'Match guard cancel terminal',
    });
    await forceLifecycleStatus(cancelSessionId, 'IN_PROGRESS', organizer);
    await legacyGame(cancelSessionId, 'cancelled');
    const cancelRevision = await sessionRevision(cancelSessionId);
    const cancelResult = await cancelSession(organizer, {
      sessionId: cancelSessionId,
      expectedRevision: cancelRevision,
      reason: 'Chuva',
    });
    assert.equal(cancelResult.rows[0].session_revision, cancelRevision + 1);
  });

  test('finish_target_session and cancel_target_session accept a walkover Match as terminal (SES-INV-025)', async () => {
    const organizer = await newUser('lifecycle-match-guard-walkover@test.local');

    const finishSessionId = await createTargetSession(organizer, {
      name: 'Match guard walkover finish',
    });
    await forceLifecycleStatus(finishSessionId, 'IN_PROGRESS', organizer);
    await legacyGame(finishSessionId, 'walkover');
    const finishRevision = await sessionRevision(finishSessionId);
    const finishResult = await finishSession(organizer, {
      sessionId: finishSessionId,
      expectedRevision: finishRevision,
    });
    assert.equal(finishResult.rows[0].session_revision, finishRevision + 1);
    assert.equal((await sessionState(finishSessionId)).lifecycle_status, 'COMPLETED');

    const cancelSessionId = await createTargetSession(organizer, {
      name: 'Match guard walkover cancel',
    });
    await forceLifecycleStatus(cancelSessionId, 'IN_PROGRESS', organizer);
    await legacyGame(cancelSessionId, 'walkover');
    const cancelRevision = await sessionRevision(cancelSessionId);
    const cancelResult = await cancelSession(organizer, {
      sessionId: cancelSessionId,
      expectedRevision: cancelRevision,
      reason: 'Chuva',
    });
    assert.equal(cancelResult.rows[0].session_revision, cancelRevision + 1);
    assert.equal((await sessionState(cancelSessionId)).lifecycle_status, 'CANCELLED');
  });

  test('a Match belonging to a different Session never blocks finish_target_session', async () => {
    const organizer = await newUser('lifecycle-match-guard-cross-session@test.local');
    const sessionId = await createTargetSession(organizer, {
      name: 'Match guard cross session target',
    });
    await forceLifecycleStatus(sessionId, 'IN_PROGRESS', organizer);
    const otherSessionId = await createTargetSession(organizer, {
      name: 'Match guard cross session other',
    });
    await legacyGame(otherSessionId, 'active');
    const revision = await sessionRevision(sessionId);
    const result = await finishSession(organizer, { sessionId, expectedRevision: revision });
    assert.equal(result.rows[0].session_revision, revision + 1);
  });

  // --- Task 5 Step 7: publish, organizer and court -----------------------------------------

  test('publish_target_session moves PRIVATE to PUBLISHED and leaves lifecycle_status unchanged (SES-INV-010)', async () => {
    const organizer = await newUser('lifecycle-publish-happy@test.local');
    const sessionId = await createTargetSession(organizer, { name: 'Publish happy Session' });
    const before = await sessionState(sessionId);
    const revision = await sessionRevision(sessionId);
    const result = await publishSession(organizer, { sessionId, expectedRevision: revision });
    assert.equal(result.rows[0].session_revision, revision + 1);
    const after = await sessionState(sessionId);
    assert.equal(after.publication_state, 'PUBLISHED');
    assert.equal(after.lifecycle_status, before.lifecycle_status);
  });

  test('publish_target_session is idempotent by command_id and a no-op revision bump when already published', async () => {
    const organizer = await newUser('lifecycle-publish-idempotent@test.local');
    const sessionId = await createTargetSession(organizer, { name: 'Publish idempotent Session' });
    const revision = await sessionRevision(sessionId);
    const commandId = randomUUID();
    const first = await publishSession(organizer, {
      commandId,
      sessionId,
      expectedRevision: revision,
    });
    const retried = await publishSession(organizer, {
      commandId,
      sessionId,
      expectedRevision: revision,
    });
    assert.deepEqual(retried.rows, first.rows);

    const newRevision = first.rows[0].session_revision;
    const secondPublish = await publishSession(organizer, {
      sessionId,
      expectedRevision: newRevision,
    });
    assert.equal(secondPublish.rows[0].session_revision, newRevision);
  });

  test('publish_target_session fails 23514 once the Session has left the PRIVATE-eligible lifecycle states', async () => {
    const organizer = await newUser('lifecycle-publish-terminal@test.local');
    for (const status of ['IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const) {
      const sessionId = await createTargetSession(organizer, { name: `Publish blocked ${status}` });
      await forceLifecycleStatus(sessionId, status, organizer);
      const revision = await sessionRevision(sessionId);
      const rejected = await publishSession(organizer, {
        sessionId,
        expectedRevision: revision,
      }).catch((error: Error) => error);
      assertSqlState(rejected, '23514');
    }
  });

  test('assign_target_session_organizer creates an assignment for an eligible Community organizer', async () => {
    const owner = await newUser('lifecycle-assign-community-owner@test.local');
    const assigned = await newUser('lifecycle-assign-community-assigned@test.local');
    const newOrganizer = await newUser('lifecycle-assign-community-new@test.local');
    const community = await targetCommunity(owner, 'Assign organizer Community');
    await activeMembership(community, assigned);
    await activeMembership(community, newOrganizer);
    await grantOrganizer(community, assigned);
    await grantOrganizer(community, newOrganizer);
    const sessionId = await createTargetSession(assigned, {
      communityId: community,
      context: 'COMMUNITY',
      name: 'Assign organizer Community Session',
    });
    const revision = await sessionRevision(sessionId);
    const result = await assignOrganizer(assigned, {
      sessionId,
      expectedRevision: revision,
      organizerUserId: newOrganizer,
    });
    assert.equal(result.rows[0].session_revision, revision + 1);
    const assignment = await client.query<{ revoked_at: string | null }>(
      `select revoked_at from public.session_organizer_assignments
        where session_id = $1 and organizer_user_id = $2`,
      [sessionId, newOrganizer],
    );
    assert.equal(assignment.rows.length, 1);
    assert.equal(assignment.rows[0].revoked_at, null);
  });

  test('assign_target_session_organizer rejects an active ordinary Community member without effects', async () => {
    const owner = await newUser('lifecycle-assign-ordinary-owner@test.local');
    const actor = await newUser('lifecycle-assign-ordinary-actor@test.local');
    const ordinaryMember = await newUser('lifecycle-assign-ordinary-target@test.local');
    const community = await targetCommunity(owner, 'Assign ordinary member Community');
    await activeMembership(community, actor);
    await grantOrganizer(community, actor);
    await activeMembership(community, ordinaryMember);
    const sessionId = await createTargetSession(actor, {
      communityId: community,
      context: 'COMMUNITY',
      name: 'Reject ordinary organizer assignment',
    });
    const revision = await sessionRevision(sessionId);
    const commandId = randomUUID();
    const rejected = await assignOrganizer(actor, {
      commandId,
      sessionId,
      expectedRevision: revision,
      organizerUserId: ordinaryMember,
    }).catch((error: Error) => error);
    assertSqlState(rejected, '23514');
    assert.equal(await sessionRevision(sessionId), revision);
    assert.equal((await commandReceipt(commandId)).length, 0);
    assert.equal(
      (
        await client.query(
          `select 1 from public.session_organizer_assignments
            where session_id = $1 and organizer_user_id = $2`,
          [sessionId, ordinaryMember],
        )
      ).rowCount,
      0,
    );
  });

  test('assign_target_session_organizer rejects a revoked ORGANIZER responsibility without effects', async () => {
    const owner = await newUser('lifecycle-assign-revoked-owner@test.local');
    const actor = await newUser('lifecycle-assign-revoked-actor@test.local');
    const revokedOrganizer = await newUser('lifecycle-assign-revoked-target@test.local');
    const community = await targetCommunity(owner, 'Assign revoked organizer Community');
    await activeMembership(community, actor);
    await grantOrganizer(community, actor);
    await activeMembership(community, revokedOrganizer);
    await grantOrganizer(community, revokedOrganizer);
    await client.query(
      `update public.community_responsibilities
          set revoked_at = now()
        where community_id = $1 and user_id = $2 and responsibility = 'ORGANIZER'`,
      [community, revokedOrganizer],
    );
    const sessionId = await createTargetSession(actor, {
      communityId: community,
      context: 'COMMUNITY',
      name: 'Reject revoked organizer assignment',
    });
    const revision = await sessionRevision(sessionId);
    const commandId = randomUUID();
    const rejected = await assignOrganizer(actor, {
      commandId,
      sessionId,
      expectedRevision: revision,
      organizerUserId: revokedOrganizer,
    }).catch((error: Error) => error);
    assertSqlState(rejected, '23514');
    assert.equal(await sessionRevision(sessionId), revision);
    assert.equal((await commandReceipt(commandId)).length, 0);
    assert.equal(
      (
        await client.query(
          `select 1 from public.session_organizer_assignments
            where session_id = $1 and organizer_user_id = $2`,
          [sessionId, revokedOrganizer],
        )
      ).rowCount,
      0,
    );
  });

  test('assign_target_session_organizer succeeds for a Quick Session owner', async () => {
    const owner = await newUser('lifecycle-assign-quick-owner@test.local');
    const guestOrganizer = await newUser('lifecycle-assign-quick-guest@test.local');
    const sessionId = await createTargetSession(owner, { name: 'Assign organizer Quick Session' });
    const revision = await sessionRevision(sessionId);
    const result = await assignOrganizer(owner, {
      sessionId,
      expectedRevision: revision,
      organizerUserId: guestOrganizer,
    });
    assert.equal(result.rows[0].session_revision, revision + 1);
    const assignment = await client.query<{
      community_membership_id: string | null;
      revoked_at: string | null;
    }>(
      `select community_membership_id, revoked_at from public.session_organizer_assignments
        where session_id = $1 and organizer_user_id = $2`,
      [sessionId, guestOrganizer],
    );
    assert.deepEqual(assignment.rows, [{ community_membership_id: null, revoked_at: null }]);
  });

  test('assign_target_session_organizer is callable by an eligible-but-unassigned Community session.manage holder, the bootstrap case', async () => {
    const owner = await newUser('lifecycle-assign-bootstrap-owner@test.local');
    const creator = await newUser('lifecycle-assign-bootstrap-creator@test.local');
    const eligibleUnassigned = await newUser('lifecycle-assign-bootstrap-eligible@test.local');
    const community = await targetCommunity(owner, 'Assign organizer bootstrap Community');
    await activeMembership(community, creator);
    await activeMembership(community, eligibleUnassigned);
    await grantOrganizer(community, creator);
    await grantOrganizer(community, eligibleUnassigned);
    const sessionId = await createTargetSession(creator, {
      communityId: community,
      context: 'COMMUNITY',
      name: 'Assign organizer bootstrap Session',
    });
    const preAssignment = await client.query(
      `select 1 from public.session_organizer_assignments
        where session_id = $1 and organizer_user_id = $2`,
      [sessionId, eligibleUnassigned],
    );
    assert.equal(preAssignment.rowCount, 0);
    const revision = await sessionRevision(sessionId);
    const result = await assignOrganizer(eligibleUnassigned, {
      sessionId,
      expectedRevision: revision,
      organizerUserId: eligibleUnassigned,
    });
    assert.equal(result.rows[0].session_revision, revision + 1);
  });

  test('assign_target_session_organizer fails 23514 when the assignment id is already in use (I5)', async () => {
    const owner = await newUser('lifecycle-assign-reused-id-owner@test.local');
    const firstOrganizer = await newUser('lifecycle-assign-reused-id-first@test.local');
    const secondOrganizer = await newUser('lifecycle-assign-reused-id-second@test.local');
    const firstSessionId = await createTargetSession(owner, { name: 'Assign reused id A' });
    const secondSessionId = await createTargetSession(owner, { name: 'Assign reused id B' });

    const reusedAssignmentId = randomUUID();
    const first = await assignOrganizer(owner, {
      assignmentId: reusedAssignmentId,
      sessionId: firstSessionId,
      expectedRevision: await sessionRevision(firstSessionId),
      organizerUserId: firstOrganizer,
    });
    assert.equal(first.rows[0].assignment_id, reusedAssignmentId);

    const rejected = await assignOrganizer(owner, {
      assignmentId: reusedAssignmentId,
      sessionId: secondSessionId,
      expectedRevision: await sessionRevision(secondSessionId),
      organizerUserId: secondOrganizer,
    }).catch((error: Error) => error);
    assertSqlState(rejected, '23514');

    const secondSessionAssignments = await client.query(
      'select 1 from public.session_organizer_assignments where session_id = $1 and organizer_user_id = $2',
      [secondSessionId, secondOrganizer],
    );
    assert.equal(secondSessionAssignments.rowCount, 0);
  });

  test('revoke_target_session_organizer sets revoked_at and the revoked user then fails 42501 on every other command', async () => {
    const owner = await newUser('lifecycle-revoke-owner@test.local');
    const organizerA = await newUser('lifecycle-revoke-a@test.local');
    const organizerB = await newUser('lifecycle-revoke-b@test.local');
    const community = await targetCommunity(owner, 'Revoke organizer Community');
    await activeMembership(community, organizerA);
    await activeMembership(community, organizerB);
    await grantOrganizer(community, organizerA);
    await grantOrganizer(community, organizerB);
    const sessionId = await createTargetSession(organizerA, {
      communityId: community,
      context: 'COMMUNITY',
      name: 'Revoke organizer Session',
    });
    const membershipB = await membershipId(community, organizerB);
    await directOrganizerAssignment(sessionId, organizerB, membershipB);

    const revision = await sessionRevision(sessionId);
    const result = await revokeOrganizer(organizerB, {
      sessionId,
      expectedRevision: revision,
      organizerUserId: organizerA,
    });
    assert.equal(result.rows[0].session_revision, revision + 1);

    const assignment = await client.query<{ revoked_at: string | null }>(
      `select revoked_at from public.session_organizer_assignments
        where session_id = $1 and organizer_user_id = $2 and revoked_at is not null`,
      [sessionId, organizerA],
    );
    assert.equal(assignment.rows.length, 1);

    const rejected = await readReadiness(organizerA, sessionId).catch((error: Error) => error);
    assertSqlState(rejected, '42501');
  });

  test('revoke_target_session_organizer fails P0002 when the organizer was never assigned to the Session (I7)', async () => {
    const owner = await newUser('lifecycle-revoke-never-assigned-owner@test.local');
    const neverAssigned = await newUser('lifecycle-revoke-never-assigned-target@test.local');
    const sessionId = await createTargetSession(owner, { name: 'Revoke never assigned' });
    const revision = await sessionRevision(sessionId);
    const rejected = await revokeOrganizer(owner, {
      sessionId,
      expectedRevision: revision,
      organizerUserId: neverAssigned,
    }).catch((error: Error) => error);
    assertSqlState(rejected, 'P0002');
    assert.equal(await sessionRevision(sessionId), revision);
  });

  test('configure_target_session_court updates an existing court label and order in DRAFT, SCHEDULED and IN_PROGRESS', async () => {
    const organizer = await newUser('lifecycle-configure-court-happy@test.local');
    for (const status of ['DRAFT', 'SCHEDULED', 'IN_PROGRESS'] as const) {
      const sessionId = await createTargetSession(organizer, { name: `Configure court ${status}` });
      if (status !== 'DRAFT') await forceLifecycleStatus(sessionId, status, organizer);
      const court = await client.query<{ id: string }>(
        'select id from public.session_courts where session_id = $1',
        [sessionId],
      );
      const courtId = court.rows[0].id;
      const revision = await sessionRevision(sessionId);
      const result = await configureCourt(organizer, {
        courtId,
        sessionId,
        expectedRevision: revision,
        label: 'Quadra renomeada',
        courtOrder: 3,
      });
      assert.deepEqual(result.rows, [{ court_id: courtId, session_revision: revision + 1 }]);
      const updated = await client.query<{ label: string; court_order: number }>(
        'select label, court_order from public.session_courts where id = $1',
        [courtId],
      );
      assert.deepEqual(updated.rows, [{ label: 'Quadra renomeada', court_order: 3 }]);
    }
  });

  test('configure_target_session_court fails 23514 in COMPLETED and CANCELLED', async () => {
    const organizer = await newUser('lifecycle-configure-court-terminal@test.local');
    for (const status of ['COMPLETED', 'CANCELLED'] as const) {
      const sessionId = await createTargetSession(organizer, {
        name: `Configure court blocked ${status}`,
      });
      await forceLifecycleStatus(sessionId, status, organizer);
      const court = await client.query<{ id: string }>(
        'select id from public.session_courts where session_id = $1',
        [sessionId],
      );
      const courtId = court.rows[0].id;
      const revision = await sessionRevision(sessionId);
      const rejected = await configureCourt(organizer, {
        courtId,
        sessionId,
        expectedRevision: revision,
        label: 'Quadra bloqueada',
        courtOrder: 2,
      }).catch((error: Error) => error);
      assertSqlState(rejected, '23514');
    }
  });

  test('configure_target_session_court fails P0002 for a court belonging to another Session', async () => {
    const organizer = await newUser('lifecycle-configure-court-cross-session@test.local');
    const sessionId = await createTargetSession(organizer, {
      name: 'Configure court cross session target',
    });
    const otherSessionId = await createTargetSession(organizer, {
      name: 'Configure court cross session other',
    });
    const otherCourt = await client.query<{ id: string }>(
      'select id from public.session_courts where session_id = $1',
      [otherSessionId],
    );
    const revision = await sessionRevision(sessionId);
    const rejected = await configureCourt(organizer, {
      courtId: otherCourt.rows[0].id,
      sessionId,
      expectedRevision: revision,
      label: 'Quadra estranha',
      courtOrder: 2,
    }).catch((error: Error) => error);
    assertSqlState(rejected, 'P0002');
  });

  test('configure_target_session_court fails 23514 when the target order collides with a different Court on the same Session (I4)', async () => {
    const organizer = await newUser('lifecycle-configure-court-order-collision@test.local');
    const sessionId = await createTargetSession(organizer, {
      name: 'Configure court order collision',
    });
    const defaultCourt = await client.query<{ id: string; court_order: number }>(
      'select id, court_order from public.session_courts where session_id = $1',
      [sessionId],
    );
    assert.equal(defaultCourt.rows.length, 1);
    const addedCourt = await call<CourtCommandRow>(
      organizer,
      'select * from public.add_target_session_court($1, $2, $3, $4, $5)',
      [randomUUID(), sessionId, await sessionRevision(sessionId), 'Quadra colidida', 2],
    );

    const revision = addedCourt.rows[0].session_revision;
    const rejected = await configureCourt(organizer, {
      courtId: addedCourt.rows[0].court_id,
      sessionId,
      expectedRevision: revision,
      label: 'Quadra 2 renomeada',
      courtOrder: defaultCourt.rows[0].court_order,
    }).catch((error: Error) => error);
    assertSqlState(rejected, '23514');

    const unchanged = await client.query<{ label: string; court_order: number }>(
      'select label, court_order from public.session_courts where id = $1',
      [addedCourt.rows[0].court_id],
    );
    assert.deepEqual(unchanged.rows, [{ label: 'Quadra colidida', court_order: 2 }]);
    assert.equal(await sessionRevision(sessionId), revision);
  });

  // --- Task 5 Step 8: authorization -------------------------------------------------------

  test('all eight missing write commands enforce authentication, membership, assignment and Session-scope boundaries (QA-INV-005, QA-INV-006)', async () => {
    const owner = await newUser('lifecycle-auth-owner@test.local');
    const assigned = await newUser('lifecycle-auth-assigned@test.local');
    const outsider = await newUser('lifecycle-auth-outsider@test.local');
    const eligibleUnassigned = await newUser('lifecycle-auth-eligible-unassigned@test.local');
    const dummyOrganizerUserId = await newUser('lifecycle-auth-dummy-organizer@test.local');

    const community = await targetCommunity(owner, 'Lifecycle command authority');
    await activeMembership(community, assigned);
    await activeMembership(community, eligibleUnassigned);
    await grantOrganizer(community, assigned);
    await grantOrganizer(community, eligibleUnassigned);
    const communitySessionId = await createTargetSession(assigned, {
      communityId: community,
      context: 'COMMUNITY',
      name: 'Lifecycle command authority Session',
    });

    const otherOwner = await newUser('lifecycle-auth-other-owner@test.local');
    const otherOrganizer = await newUser('lifecycle-auth-other-organizer@test.local');
    const otherCommunity = await targetCommunity(otherOwner, 'Lifecycle command authority other');
    await activeMembership(otherCommunity, otherOrganizer);
    await grantOrganizer(otherCommunity, otherOrganizer);
    const otherCommunitySessionId = await createTargetSession(otherOrganizer, {
      communityId: otherCommunity,
      context: 'COMMUNITY',
      name: 'Lifecycle command authority other Session',
    });

    const legacySessionId = await createLegacySession(
      assigned,
      'Legacy lifecycle authority Session',
    );

    const dummyCourtId = randomUUID();
    const entryPoints: Array<{
      name: string;
      isOrganizerCommand: boolean;
      call: (
        actorId: string | null,
        sessionId: string,
        expectedRevision: number,
      ) => Promise<unknown>;
    }> = [
      {
        name: 'schedule_target_session',
        isOrganizerCommand: false,
        call: (actorId, sessionId, expectedRevision) =>
          scheduleSession(actorId, { sessionId, expectedRevision }),
      },
      {
        name: 'publish_target_session',
        isOrganizerCommand: false,
        call: (actorId, sessionId, expectedRevision) =>
          publishSession(actorId, { sessionId, expectedRevision }),
      },
      {
        name: 'start_target_session',
        isOrganizerCommand: false,
        call: (actorId, sessionId, expectedRevision) =>
          startSession(actorId, { sessionId, expectedRevision }),
      },
      {
        name: 'finish_target_session',
        isOrganizerCommand: false,
        call: (actorId, sessionId, expectedRevision) =>
          finishSession(actorId, { sessionId, expectedRevision }),
      },
      {
        name: 'cancel_target_session',
        isOrganizerCommand: false,
        call: (actorId, sessionId, expectedRevision) =>
          cancelSession(actorId, { sessionId, expectedRevision, reason: 'Chuva' }),
      },
      {
        name: 'assign_target_session_organizer',
        isOrganizerCommand: true,
        call: (actorId, sessionId, expectedRevision) =>
          assignOrganizer(actorId, {
            sessionId,
            expectedRevision,
            organizerUserId: dummyOrganizerUserId,
          }),
      },
      {
        name: 'revoke_target_session_organizer',
        isOrganizerCommand: true,
        call: (actorId, sessionId, expectedRevision) =>
          revokeOrganizer(actorId, {
            sessionId,
            expectedRevision,
            organizerUserId: dummyOrganizerUserId,
          }),
      },
      {
        name: 'configure_target_session_court',
        isOrganizerCommand: false,
        call: (actorId, sessionId, expectedRevision) =>
          configureCourt(actorId, {
            courtId: dummyCourtId,
            sessionId,
            expectedRevision,
            label: 'Quadra autorizacao',
            courtOrder: 2,
          }),
      },
    ];

    for (const point of entryPoints) {
      const anonymous = await point
        .call(null, communitySessionId, 1)
        .catch((error: Error) => error);
      assertSqlState(anonymous, '42501');

      const byOutsider = await point
        .call(outsider, communitySessionId, 1)
        .catch((error: Error) => error);
      assertSqlState(byOutsider, '42501');

      const byLegacy = await point
        .call(assigned, legacySessionId, 1)
        .catch((error: Error) => error);
      assertSqlState(byLegacy, 'P0002');

      const byOtherCommunity = await point
        .call(assigned, otherCommunitySessionId, 1)
        .catch((error: Error) => error);
      assertSqlState(byOtherCommunity, '42501');

      if (!point.isOrganizerCommand) {
        const byEligibleUnassigned = await point
          .call(eligibleUnassigned, communitySessionId, 1)
          .catch((error: Error) => error);
        assertSqlState(byEligibleUnassigned, '42501');
      }
    }
  });
}
