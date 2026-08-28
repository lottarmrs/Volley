import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
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

  async function readReadiness(actorId: string | null, sessionId: string) {
    return call<ReadinessRow>(actorId, 'select * from public.read_target_session_readiness($1)', [
      sessionId,
    ]);
  }

  function blockerCodes(readiness: { blockers: ReadinessBlocker[] }): string[] {
    return readiness.blockers.map((blocker) => blocker.code).sort();
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
      { code: 'COURT_CONFIGURATION_INVALID', evaluation_status: 'EVALUATED', owning_wave: null },
      { code: 'NO_CONFIRMED_TEAM_DRAW', evaluation_status: 'DEFERRED', owning_wave: 'W6' },
      { code: 'NO_EFFECTIVE_ROSTER', evaluation_status: 'EVALUATED', owning_wave: null },
      { code: 'REQUIRED_ORGANIZER_MISSING', evaluation_status: 'EVALUATED', owning_wave: null },
      { code: 'ROSTER_STALE', evaluation_status: 'DEFERRED', owning_wave: 'W6' },
      { code: 'RULES_INVALID', evaluation_status: 'EVALUATED', owning_wave: null },
      { code: 'TEAM_DRAW_STALE', evaluation_status: 'DEFERRED', owning_wave: 'W6' },
      { code: 'VOTING_STILL_OPEN', evaluation_status: 'DEFERRED', owning_wave: 'W5' },
    ]);
  });

  test('evaluation_status rejects any value outside EVALUATED and DEFERRED with 23514', async () => {
    const rejected = await client
      .query(
        `insert into app_private.session_readiness_blockers (code, evaluation_status, owning_wave)
         values ('BOGUS_CODE', 'PENDING', null)`,
      )
      .catch((error: Error) => error);
    assertSqlState(rejected, '23514');
  });

  test('row level security is enabled and anon/authenticated hold no privilege on the blocker catalog', async () => {
    const { rows } = await client.query<{
      rls_enabled: boolean;
      anon_select: boolean;
      authenticated_select: boolean;
      anon_insert: boolean;
      authenticated_insert: boolean;
    }>(
      `select c.relrowsecurity as rls_enabled,
              has_table_privilege('anon', c.oid, 'SELECT') as anon_select,
              has_table_privilege('authenticated', c.oid, 'SELECT') as authenticated_select,
              has_table_privilege('anon', c.oid, 'INSERT') as anon_insert,
              has_table_privilege('authenticated', c.oid, 'INSERT') as authenticated_insert
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'app_private' and c.relname = 'session_readiness_blockers'`,
    );
    assert.deepEqual(rows, [
      {
        rls_enabled: true,
        anon_select: false,
        authenticated_select: false,
        anon_insert: false,
        authenticated_insert: false,
      },
    ]);
  });

  test('anon and authenticated cannot execute the private readiness evaluator directly', async () => {
    const { rows } = await client.query<{
      anon_exec: boolean | null;
      authenticated_exec: boolean | null;
    }>(
      `select bool_or(has_function_privilege('anon', p.oid, 'EXECUTE')) as anon_exec,
              bool_or(has_function_privilege('authenticated', p.oid, 'EXECUTE')) as authenticated_exec
         from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'app_private' and p.proname = 'target_session_readiness'`,
    );
    assert.deepEqual(rows, [{ anon_exec: false, authenticated_exec: false }]);
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
    const { rows } = await readReadiness(organizer, sessionId);
    assert.equal(rows[0].ready, false);
    assert.deepEqual(blockerCodes(rows[0]), ['REQUIRED_ORGANIZER_MISSING']);
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
      assert.equal(blocker.owning_wave, null);
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
    const { rows } = await readReadiness(organizer, ready.sessionId);
    assert.deepEqual(rows[0].revisions, {
      session_revision: ready.revision,
      roster_revision_id: ready.rosterRevisionId,
      roster_revision_number: ready.rosterRevisionNumber,
      rules_snapshot_id: ready.rulesSnapshotId,
    });

    const bareSessionId = await createTargetSession(organizer, {
      name: 'Bare revisions Session',
    });
    const bareResult = await readReadiness(organizer, bareSessionId);
    assert.deepEqual(bareResult.rows[0].revisions, {
      session_revision: 1,
      roster_revision_id: null,
      roster_revision_number: null,
      rules_snapshot_id: null,
    });
  });

  test('no table anywhere stores a materialized readiness or is_ready value', async () => {
    const { rows } = await client.query<{ table_name: string; column_name: string }>(
      `select table_name, column_name
         from information_schema.columns
        where table_schema = 'public'
          and (column_name ilike '%is_ready%' or column_name ilike '%readiness%')
        order by table_name, column_name`,
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

  test('a target Session cancelled without cancelled_at or cancelled_by_user_id is rejected with 23514', async () => {
    const organizer = await newUser('cancel-missing-audit@test.local');
    for (const [sessionId, sql] of [
      [
        await createTargetSession(organizer),
        `update public.sessions
            set lifecycle_status = 'CANCELLED',
                cancelled_by_user_id = $2,
                cancel_reason = 'Chuva'
          where id = $1`,
      ],
      [
        await createTargetSession(organizer),
        `update public.sessions
            set lifecycle_status = 'CANCELLED',
                cancelled_at = now(),
                cancel_reason = 'Chuva'
          where id = $1`,
      ],
    ] as const) {
      const rejected = await client
        .query(sql, [sessionId, organizer])
        .catch((error: Error) => error);
      assertSqlState(rejected, '23514');
    }
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
}
