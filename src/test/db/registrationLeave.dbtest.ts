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
 * RED contract for `public.leave_registration` and the waitlist promotion it triggers
 * (XS-W4-04 task 1). Neither the command nor the promoter (`app_private.promote_waitlist_to_capacity`
 * / `app_private.registration_entry_still_eligible`) exists yet -- both land in a later task.
 * Every Leave and promotion test in this file is expected to fail now with `42883` (undefined
 * function). The two access probes in Step 7 are the exception: the first is a metadata-only
 * query against a grant that must never exist and PASSES today; the second resolves a function
 * signature that does not exist yet and so fails on its own assertion, not on `42883`.
 *
 * See docs/superpowers/specs/2026-08-31-xs-w4-04-leave-promotion-capacity (design) for the
 * target shape this suite pins.
 */

if (!isTestDatabaseConfigured()) {
  test(`registration leave requires ${TEST_DATABASE_URL_VAR}`, () => {
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

  // ── Verbatim fixture helpers (from registrationJoin.dbtest.ts, XS-W4-03 task 1) ──────────

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
        input.name ?? 'Target roster Session',
      ],
    );
    assert.deepEqual(rows, [{ id: sessionId }]);
    return sessionId;
  }

  // A COMMUNITY target Session, which is the only context allowed to own a Window.
  // create_target_session requires session.manage (an active ORGANIZER responsibility) for
  // the COMMUNITY context, which the plain Community owner does not hold automatically. The
  // creating actor is auto-assigned as that Session's organizer (session_organizer_assignments).
  async function communitySession(
    actorId: string,
    communityId: string,
    name = 'Registration Session',
  ): Promise<string> {
    await grantOrganizer(communityId, actorId);
    return createTargetSession(actorId, { communityId, context: 'COMMUNITY', name });
  }

  // Copied from registrationSchema.dbtest.ts (XS-W4-01 task 1), which is the only file that
  // defines it -- registrationLifecycle.dbtest.ts deliberately does not reproduce it.
  async function createPlayer(
    ownerId: string,
    input: {
      id?: string;
      localId?: string | null;
      name?: string;
      nickname?: string | null;
      userId?: string | null;
      active?: boolean;
      deletedAt?: string | null;
    } = {},
  ): Promise<string> {
    const id = input.id ?? randomUUID();
    await client.query(
      `insert into public.players (
         id, owner_id, local_id, name, nickname, user_id,
         has_account_identity_history, active, deleted_at
       )
       values ($1, $2, $3, $4, $5, $6::uuid, $6::uuid is not null, $7, $8::timestamptz)`,
      [
        id,
        ownerId,
        input.localId ?? null,
        input.name ?? 'Jogadora',
        input.nickname ?? null,
        input.userId ?? null,
        input.active ?? true,
        input.deletedAt ?? null,
      ],
    );
    return id;
  }

  interface WindowCommandRow extends QueryResultRow {
    window_revision: number;
  }
  interface CreateWindowRow extends WindowCommandRow {
    window_id: string;
  }

  type WindowStatus = 'DRAFT' | 'OPEN' | 'CLOSED' | 'LOCKED';
  type TransitionCommand = 'open_registration' | 'close_registration' | 'lock_registration';

  async function createWindow(
    actorId: string | null,
    input: {
      commandId?: string;
      windowId?: string;
      sessionId: string;
      capacity?: number;
      closesAt?: string | null;
    },
  ) {
    return call<CreateWindowRow>(
      actorId,
      `select * from public.create_registration_window($1, $2, $3, $4, $5::timestamptz)`,
      [
        input.commandId ?? randomUUID(),
        input.windowId ?? randomUUID(),
        input.sessionId,
        input.capacity ?? 12,
        input.closesAt ?? null,
      ],
    );
  }

  async function transition(
    actorId: string | null,
    command: TransitionCommand,
    input: { commandId?: string; windowId: string; expectedRevision: number },
  ) {
    return call<WindowCommandRow>(actorId, `select * from public.${command}($1, $2, $3)`, [
      input.commandId ?? randomUUID(),
      input.windowId,
      input.expectedRevision,
    ]);
  }

  // Drives a Window to a chosen state via the real lifecycle commands (copied structure from
  // registrationLifecycle.dbtest.ts's windowAt, XS-W4-02 task 2). Used by the capacity gate
  // RED test Task 3 appends below.
  async function windowAt(
    actorId: string,
    sessionId: string,
    target: WindowStatus,
    capacity = 12,
  ): Promise<string> {
    const created = await createWindow(actorId, { sessionId, capacity });
    const windowId = created.rows[0].window_id;
    let revision = created.rows[0].window_revision;
    const path: Array<[TransitionCommand, WindowStatus]> = [
      ['open_registration', 'OPEN'],
      ['close_registration', 'CLOSED'],
      ['lock_registration', 'LOCKED'],
    ];
    for (const [command, reached] of path) {
      if (target === 'DRAFT') break;
      const result = await transition(actorId, command, { windowId, expectedRevision: revision });
      revision = result.rows[0].window_revision;
      if (reached === target) break;
    }
    return windowId;
  }

  // Community Sessions -- the only kind that can own a Window -- cannot reach IN_PROGRESS or
  // COMPLETED through any supported command in this wave:
  //   * `20260828190617_target_session_lifecycle_readiness.sql:434` restricts the direct
  //     DRAFT -> IN_PROGRESS path to session_context = 'QUICK';
  //   * SCHEDULED -> IN_PROGRESS runs the readiness gate, which requires NO_EFFECTIVE_ROSTER
  //     cleared;
  //   * the only roster command, replace_target_quick_session_roster, rejects anything but
  //     QUICK (`20260828164947_target_session_roster_revisions.sql:360`). A Community roster
  //     command arrives with FinalizeSessionRoster in XS-W4-05.
  // Forcing the row directly with a privileged UPDATE is therefore the only way to reach these
  // two gate states for a Community Session until that lands -- do not "fix" this into a
  // command call, none exists yet.
  async function forceSessionState(
    sessionId: string,
    status: 'IN_PROGRESS' | 'COMPLETED',
  ): Promise<void> {
    if (status === 'IN_PROGRESS') {
      await client.query(
        `update public.sessions
            set lifecycle_status = 'IN_PROGRESS', actual_started_at = now()
          where id = $1`,
        [sessionId],
      );
    } else {
      await client.query(
        `update public.sessions
            set lifecycle_status = 'COMPLETED', actual_started_at = now(), actual_finished_at = now()
          where id = $1`,
        [sessionId],
      );
    }
  }

  interface JoinResultRow extends QueryResultRow {
    entry_status: string;
    window_revision: number;
  }

  async function joinRegistration(
    actorId: string | null,
    input: { commandId?: string; entryId?: string; windowId: string },
  ) {
    return call<JoinResultRow>(actorId, 'select * from public.join_registration($1, $2, $3)', [
      input.commandId ?? randomUUID(),
      input.entryId ?? randomUUID(),
      input.windowId,
    ]);
  }

  async function addEntry(
    actorId: string | null,
    input: { commandId?: string; entryId?: string; windowId: string; playerId: string },
  ) {
    return call<JoinResultRow>(
      actorId,
      'select * from public.add_registration_entry($1, $2, $3, $4)',
      [
        input.commandId ?? randomUUID(),
        input.entryId ?? randomUUID(),
        input.windowId,
        input.playerId,
      ],
    );
  }

  // A Player linked to a real auth user, on the Community roster, whose user is an active
  // member. Returns both ids because self-join tests need the user and organizer-add tests
  // need the player.
  async function eligibleMember(
    communityId: string,
    ownerId: string,
    email: string,
  ): Promise<{ userId: string; playerId: string }> {
    const userId = await newUser(email);
    await activeMembership(communityId, userId);
    const playerId = await createPlayer(ownerId, { name: email });
    await client.query(
      `insert into public.player_account_links (player_id, user_id, status, provenance, activated_at)
       values ($1, $2, 'ACTIVE', 'SELF_CLAIM', now())`,
      [playerId, userId],
    );
    await client.query(
      `insert into public.community_players (community_id, player_id, owner_id, active, status)
       values ($1, $2, $3, true, 'active')`,
      [communityId, playerId, ownerId],
    );
    return { userId, playerId };
  }

  // A Player on the roster with NO account link and no membership -- the organizer-add case.
  async function rosterOnlyPlayer(
    communityId: string,
    ownerId: string,
    name: string,
  ): Promise<string> {
    const playerId = await createPlayer(ownerId, { name });
    await client.query(
      `insert into public.community_players (community_id, player_id, owner_id, active, status)
       values ($1, $2, $3, true, 'active')`,
      [communityId, playerId, ownerId],
    );
    return playerId;
  }

  // An OPEN Window on a fresh COMMUNITY Session, ready to receive joins.
  async function openWindow(
    organizerId: string,
    communityId: string,
    capacity: number,
    closesAt: string | null = null,
  ): Promise<string> {
    const sessionId = await communitySession(organizerId, communityId);
    const created = await createWindow(organizerId, { sessionId, capacity, closesAt });
    const windowId = created.rows[0].window_id;
    await transition(organizerId, 'open_registration', {
      windowId,
      expectedRevision: created.rows[0].window_revision,
    });
    return windowId;
  }

  // ── Step 1: registrationLeave-specific fixture helpers (brief-supplied shape) ─────────────
  //
  // Columns read from supabase/migrations/20260831035934_registration_schema.sql before
  // writing these: registration_windows has status, capacity, revision, next_queue_sequence
  // (bigint); registration_entries has player_id, status, queue_sequence (bigint), source,
  // removal_reason, removed_at, withdrawn_at. Every column referenced below exists exactly as
  // named. queue_sequence is bigint, so node-pg returns it as a string from a direct column
  // read -- assertions below compare against '1', never 1.

  interface EntryCommandRow extends QueryResultRow {
    entry_status: string;
    window_revision: number;
  }

  async function leaveRegistration(
    actorId: string | null,
    input: { commandId?: string; windowId: string },
  ) {
    return call<EntryCommandRow>(actorId, 'select * from public.leave_registration($1, $2)', [
      input.commandId ?? randomUUID(),
      input.windowId,
    ]);
  }

  async function windowRow(windowId: string) {
    const { rows } = await client.query<{
      status: string;
      capacity: number;
      revision: number;
      next_queue_sequence: string;
    }>(
      `select status, capacity, revision, next_queue_sequence
         from public.registration_windows where id = $1`,
      [windowId],
    );
    return rows[0];
  }

  // Every effective and historical entry in a Window, ordered so assertions can name positions.
  async function entriesOf(windowId: string) {
    const { rows } = await client.query<{
      player_id: string;
      status: string;
      queue_sequence: string | null;
      source: string;
      removal_reason: string | null;
      removed_at: string | null;
      withdrawn_at: string | null;
    }>(
      `select player_id, status, queue_sequence, source, removal_reason, removed_at, withdrawn_at
         from public.registration_entries
        where registration_window_id = $1
        order by queue_sequence nulls first, player_id`,
      [windowId],
    );
    return rows;
  }

  // Fills a Window to capacity with self-joining members and then queues `waiting` more.
  // Returns the members in join order, so the caller can name the head of the queue.
  async function fillWindow(
    windowId: string,
    communityId: string,
    ownerId: string,
    confirmed: number,
    waiting: number,
  ): Promise<Array<{ userId: string; playerId: string }>> {
    const members: Array<{ userId: string; playerId: string }> = [];
    for (let index = 0; index < confirmed + waiting; index += 1) {
      const member = await eligibleMember(
        communityId,
        ownerId,
        `fill-${index}-${randomUUID()}@test.local`,
      );
      await joinRegistration(member.userId, { windowId });
      members.push(member);
    }
    return members;
  }

  // ── Step 2: Leave happy-path RED tests ─────────────────────────────────────────────────

  test('leave_registration: a WAITLISTED member withdraws, promotes nobody, bumps the revision once', async () => {
    const organizer = await newUser(`leave-waitlisted-${randomUUID()}@test.local`);
    const community = await targetCommunity(organizer, 'Leave waitlisted');
    const windowId = await openWindow(organizer, community, 2);
    const members = await fillWindow(windowId, community, organizer, 2, 1);
    const waiter = members[2];
    const before = await windowRow(windowId);

    const result = await leaveRegistration(waiter.userId, { windowId });

    assert.equal(result.rows[0].entry_status, 'WITHDRAWN');
    assert.equal(result.rows[0].window_revision, before.revision + 1);

    const entries = await entriesOf(windowId);
    const withdrawn = entries.find((row) => row.player_id === waiter.playerId);
    assert.equal(withdrawn?.status, 'WITHDRAWN');
    assert.ok(withdrawn?.withdrawn_at);
    assert.equal(withdrawn?.queue_sequence, '1');
    assert.equal(entries.filter((row) => row.status === 'CONFIRMED').length, 2);
  });

  test('leave_registration: a CONFIRMED member withdraws and the head of the queue is promoted in the same transaction', async () => {
    const organizer = await newUser(`leave-confirmed-${randomUUID()}@test.local`);
    const community = await targetCommunity(organizer, 'Leave confirmed');
    const windowId = await openWindow(organizer, community, 2);
    const members = await fillWindow(windowId, community, organizer, 2, 2);
    const leaver = members[0];
    const firstWaiter = members[2];
    const secondWaiter = members[3];
    const before = await windowRow(windowId);

    const result = await leaveRegistration(leaver.userId, { windowId });

    assert.equal(result.rows[0].entry_status, 'WITHDRAWN');
    assert.equal(result.rows[0].window_revision, before.revision + 1);

    const entries = await entriesOf(windowId);
    assert.equal(entries.find((row) => row.player_id === leaver.playerId)?.status, 'WITHDRAWN');

    const promoted = entries.find((row) => row.player_id === firstWaiter.playerId);
    assert.equal(promoted?.status, 'CONFIRMED');
    assert.equal(promoted?.queue_sequence, '1', 'a promoted entry keeps its queue_sequence');

    assert.equal(
      entries.find((row) => row.player_id === secondWaiter.playerId)?.status,
      'WAITLISTED',
    );
    assert.equal(entries.filter((row) => row.status === 'CONFIRMED').length, 2);
  });

  // ── Step 3: Leave rejection RED tests ──────────────────────────────────────────────────

  test('leave_registration: a member with no effective entry raises P0002, and so does leaving twice', async () => {
    const organizer = await newUser(`leave-none-${randomUUID()}@test.local`);
    const community = await targetCommunity(organizer, 'Leave nothing');
    const windowId = await openWindow(organizer, community, 4);
    const member = await eligibleMember(
      community,
      organizer,
      `leave-none-member-${randomUUID()}@test.local`,
    );

    const never = await leaveRegistration(member.userId, { windowId }).catch(
      (error: Error) => error,
    );
    assertSqlState(never, 'P0002');

    await joinRegistration(member.userId, { windowId });
    await leaveRegistration(member.userId, { windowId });
    const again = await leaveRegistration(member.userId, { windowId }).catch(
      (error: Error) => error,
    );
    assertSqlState(again, 'P0002');
  });

  test('leave_registration: a caller with no ACTIVE account link raises 42501, and so does an anonymous caller', async () => {
    const organizer = await newUser(`leave-nolink-${randomUUID()}@test.local`);
    const community = await targetCommunity(organizer, 'Leave no link');
    const windowId = await openWindow(organizer, community, 4);
    const linkless = await newUser(`leave-linkless-${randomUUID()}@test.local`);
    await activeMembership(community, linkless);

    const unlinked = await leaveRegistration(linkless, { windowId }).catch((error: Error) => error);
    assertSqlState(unlinked, '42501');

    const anonymous = await leaveRegistration(null, { windowId }).catch((error: Error) => error);
    assertSqlState(anonymous, '42501');
  });

  test('leave_registration: a null window_id raises 23514 and an unknown window_id raises P0002', async () => {
    const organizer = await newUser(`leave-args-${randomUUID()}@test.local`);
    const community = await targetCommunity(organizer, 'Leave args');
    const windowId = await openWindow(organizer, community, 4);
    const member = await eligibleMember(
      community,
      organizer,
      `leave-args-member-${randomUUID()}@test.local`,
    );
    await joinRegistration(member.userId, { windowId });

    const nullArg = await call(member.userId, 'select * from public.leave_registration($1, $2)', [
      randomUUID(),
      null,
    ]).catch((error: Error) => error);
    assertSqlState(nullArg, '23514');

    const unknown = await leaveRegistration(member.userId, { windowId: randomUUID() }).catch(
      (error: Error) => error,
    );
    assertSqlState(unknown, 'P0002');
  });

  // ── Step 4: Leave gate RED tests ───────────────────────────────────────────────────────

  test('leave_registration: works while the Window is CLOSED and raises 23514 while it is LOCKED', async () => {
    const organizer = await newUser(`leave-gates-${randomUUID()}@test.local`);
    const community = await targetCommunity(organizer, 'Leave gates');
    const sessionId = await communitySession(organizer, community);
    const created = await createWindow(organizer, { sessionId, capacity: 4 });
    const windowId = created.rows[0].window_id;
    let revision = created.rows[0].window_revision;
    await transition(organizer, 'open_registration', {
      windowId,
      expectedRevision: revision,
    });

    const stayer = await eligibleMember(
      community,
      organizer,
      `leave-gates-a-${randomUUID()}@test.local`,
    );
    const goer = await eligibleMember(
      community,
      organizer,
      `leave-gates-b-${randomUUID()}@test.local`,
    );
    await joinRegistration(stayer.userId, { windowId });
    await joinRegistration(goer.userId, { windowId });
    revision = (await windowRow(windowId)).revision;

    await transition(organizer, 'close_registration', {
      windowId,
      expectedRevision: revision,
    });

    const whileClosed = await leaveRegistration(goer.userId, { windowId });
    assert.equal(whileClosed.rows[0].entry_status, 'WITHDRAWN');
    revision = (await windowRow(windowId)).revision;

    await transition(organizer, 'lock_registration', { windowId, expectedRevision: revision });

    const whileLocked = await leaveRegistration(stayer.userId, { windowId }).catch(
      (error: Error) => error,
    );
    assertSqlState(whileLocked, '23514');
  });

  // public.cancel_target_session's signature, read from
  // supabase/migrations/20260828190617_target_session_lifecycle_readiness.sql:559-564, is
  // (p_command_id uuid, p_session_id uuid, p_expected_revision integer, p_cancel_reason text)
  // -- exactly the four arguments used below, in that order. No deviation needed.
  test('leave_registration: raises 23514 when the Session is IN_PROGRESS, COMPLETED or CANCELLED', async () => {
    for (const state of ['IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const) {
      const organizer = await newUser(`leave-session-${state}-${randomUUID()}@test.local`);
      const community = await targetCommunity(organizer, `Leave session ${state}`);
      const sessionId = await communitySession(organizer, community);
      const created = await createWindow(organizer, { sessionId, capacity: 4 });
      const windowId = created.rows[0].window_id;
      await transition(organizer, 'open_registration', {
        windowId,
        expectedRevision: created.rows[0].window_revision,
      });
      const member = await eligibleMember(
        community,
        organizer,
        `leave-session-${state}-member-${randomUUID()}@test.local`,
      );
      await joinRegistration(member.userId, { windowId });

      if (state === 'CANCELLED') {
        await call(organizer, 'select * from public.cancel_target_session($1, $2, $3, $4)', [
          randomUUID(),
          sessionId,
          (await client.query('select revision from public.sessions where id = $1', [sessionId]))
            .rows[0].revision,
          'no longer happening',
        ]);
      } else {
        await forceSessionState(sessionId, state);
      }

      const result = await leaveRegistration(member.userId, { windowId }).catch(
        (error: Error) => error,
      );
      assertSqlState(result, '23514');
    }
  });

  // ── Step 5: Leave idempotency and membership-asymmetry RED tests ──────────────────────

  test('leave_registration: a retry with the same command_id returns the recorded result and mutates nothing further', async () => {
    const organizer = await newUser(`leave-retry-${randomUUID()}@test.local`);
    const community = await targetCommunity(organizer, 'Leave retry');
    const windowId = await openWindow(organizer, community, 2);
    const members = await fillWindow(windowId, community, organizer, 2, 2);
    const commandId = randomUUID();

    const first = await leaveRegistration(members[0].userId, { commandId, windowId });
    const afterFirst = await windowRow(windowId);
    const second = await leaveRegistration(members[0].userId, { commandId, windowId });
    const afterSecond = await windowRow(windowId);

    assert.deepEqual(second.rows[0], first.rows[0]);
    assert.equal(afterSecond.revision, afterFirst.revision, 'a retry must not bump the revision');

    const entries = await entriesOf(windowId);
    assert.equal(entries.filter((row) => row.status === 'CONFIRMED').length, 2);
    assert.equal(entries.filter((row) => row.status === 'WITHDRAWN').length, 1);
    assert.equal(
      entries.find((row) => row.player_id === members[3].playerId)?.status,
      'WAITLISTED',
      'the retry must not promote a second waiter',
    );
  });

  // DEVIATION FROM THE BRIEF: community_memberships.status is check-constrained to
  // ('active', 'suspended') only (20260827140000_split_membership_from_community_player.sql:33)
  // -- 'left' is not in the vocabulary, so this uses 'suspended' instead. The point of the test
  // is that a non-active membership does not block Leave, not the particular word.
  test('leave_registration: a member who left the Community can still withdraw their own entry', async () => {
    const organizer = await newUser(`leave-exmember-${randomUUID()}@test.local`);
    const community = await targetCommunity(organizer, 'Leave ex-member');
    const windowId = await openWindow(organizer, community, 4);
    const member = await eligibleMember(
      community,
      organizer,
      `leave-ex-${randomUUID()}@test.local`,
    );
    await joinRegistration(member.userId, { windowId });

    await client.query(
      `update public.community_memberships set status = 'suspended'
        where community_id = $1 and user_id = $2`,
      [community, member.userId],
    );

    const result = await leaveRegistration(member.userId, { windowId });
    assert.equal(result.rows[0].entry_status, 'WITHDRAWN');
  });

  // ── Step 6: promotion-eligibility RED tests ────────────────────────────────────────────
  //
  // sync_community_player_active_status (BEFORE INSERT/UPDATE on community_players,
  // 20260617180615_community_players_optimization.sql:13-25) derives active FROM status
  // whenever status is provided and changing (not only when the previous status was null).
  // The relation_inactive branch below sets BOTH columns for that reason -- either alone
  // would be re-derived to the same eligible-breaking values by the trigger, but setting both
  // makes the fixture's intent explicit rather than relying on the trigger to fix a gap.
  //
  // trg_guard_active_player_reference rejects INSERTING a community_players row that
  // references an already soft-deleted Player. The player_soft_deleted branch soft-deletes
  // AFTER the roster row exists (via fillWindow -> eligibleMember), which is also what
  // playerCloudService.softDelete does in production.

  test('promotion: an ineligible head of the queue is REMOVED with an audited reason and the next eligible waiter is promoted', async () => {
    const organizer = await newUser(`promote-skip-${randomUUID()}@test.local`);
    const community = await targetCommunity(organizer, 'Promote skip');
    const windowId = await openWindow(organizer, community, 1);
    const members = await fillWindow(windowId, community, organizer, 1, 2);
    const [holder, brokenWaiter, goodWaiter] = members;

    await client.query(
      `update public.community_memberships set status = 'suspended'
        where community_id = $1 and user_id = $2`,
      [community, brokenWaiter.userId],
    );

    await leaveRegistration(holder.userId, { windowId });

    const entries = await entriesOf(windowId);
    const skipped = entries.find((row) => row.player_id === brokenWaiter.playerId);
    assert.equal(skipped?.status, 'REMOVED');
    assert.equal(skipped?.removal_reason, 'INELIGIBLE_AT_PROMOTION');
    assert.ok(skipped?.removed_at);
    assert.equal(skipped?.queue_sequence, '1', 'a skipped entry keeps its queue_sequence');

    assert.equal(entries.find((row) => row.player_id === goodWaiter.playerId)?.status, 'CONFIRMED');
    assert.equal(entries.filter((row) => row.status === 'CONFIRMED').length, 1);
  });

  test('promotion: an ORGANIZER_ADDED waiter with no account link at all is promoted', async () => {
    const organizer = await newUser(`promote-organizer-added-${randomUUID()}@test.local`);
    const community = await targetCommunity(organizer, 'Promote organizer-added');
    const windowId = await openWindow(organizer, community, 1);
    const holder = await eligibleMember(
      community,
      organizer,
      `promote-holder-${randomUUID()}@test.local`,
    );
    await joinRegistration(holder.userId, { windowId });
    const accountless = await rosterOnlyPlayer(community, organizer, 'Accountless waiter');
    await addEntry(organizer, { windowId, playerId: accountless });

    await leaveRegistration(holder.userId, { windowId });

    const entries = await entriesOf(windowId);
    const promoted = entries.find((row) => row.player_id === accountless);
    assert.equal(promoted?.status, 'CONFIRMED');
    assert.equal(promoted?.source, 'ORGANIZER_ADDED');
  });

  test('promotion: a SELF_JOIN waiter whose account link was revoked is skipped and removed', async () => {
    const organizer = await newUser(`promote-revoked-${randomUUID()}@test.local`);
    const community = await targetCommunity(organizer, 'Promote revoked link');
    const windowId = await openWindow(organizer, community, 1);
    const members = await fillWindow(windowId, community, organizer, 1, 2);
    const [holder, brokenWaiter, goodWaiter] = members;

    await client.query(
      `update public.player_account_links
          set status = 'REVOKED', reviewed_at = now()
        where player_id = $1 and status = 'ACTIVE'`,
      [brokenWaiter.playerId],
    );

    await leaveRegistration(holder.userId, { windowId });

    const entries = await entriesOf(windowId);
    assert.equal(entries.find((row) => row.player_id === brokenWaiter.playerId)?.status, 'REMOVED');
    assert.equal(entries.find((row) => row.player_id === goodWaiter.playerId)?.status, 'CONFIRMED');
  });

  // registration_entry_still_eligible requires FOUR things of roster standing:
  // community_players.deleted_at is null, community_players.active, players.deleted_at is
  // null, players.active. Each of the four kinds below breaks exactly one of them, leaving
  // the other three intact, so each clause of the predicate is discriminated by its own
  // fixture rather than by a fixture that happens to break several at once.
  test('promotion: a waiter whose players row is soft-deleted, one whose roster relation went inactive, one whose roster relation is soft-deleted, and one whose players row went inactive, are all skipped', async () => {
    for (const kind of [
      'player_soft_deleted',
      'relation_inactive',
      'relation_soft_deleted',
      'player_inactive',
    ] as const) {
      const organizer = await newUser(`promote-${kind}-${randomUUID()}@test.local`);
      const community = await targetCommunity(organizer, `Promote ${kind}`);
      const windowId = await openWindow(organizer, community, 1);
      const members = await fillWindow(windowId, community, organizer, 1, 2);
      const [holder, brokenWaiter, goodWaiter] = members;

      if (kind === 'player_soft_deleted') {
        await client.query('update public.players set deleted_at = now() where id = $1', [
          brokenWaiter.playerId,
        ]);
        const { rows } = await client.query<{ deleted_at: string | null; active: boolean }>(
          'select deleted_at, active from public.players where id = $1',
          [brokenWaiter.playerId],
        );
        assert.ok(rows[0].deleted_at, 'players.deleted_at must be set');
        assert.equal(rows[0].active, true, 'players.active must be untouched');
      } else if (kind === 'relation_inactive') {
        await client.query(
          `update public.community_players set status = 'inactive', active = false
            where community_id = $1 and player_id = $2`,
          [community, brokenWaiter.playerId],
        );
        const { rows } = await client.query<{ active: boolean; deleted_at: string | null }>(
          'select active, deleted_at from public.community_players where community_id = $1 and player_id = $2',
          [community, brokenWaiter.playerId],
        );
        assert.equal(rows[0].active, false, 'community_players.active must be false');
        assert.equal(rows[0].deleted_at, null, 'community_players.deleted_at must be untouched');
      } else if (kind === 'relation_soft_deleted') {
        // sync_community_player_active_status only re-derives `active` when `status` is
        // provided and changing; this update touches only deleted_at, so `active` must
        // survive untouched. Verified below rather than assumed.
        await client.query(
          `update public.community_players set deleted_at = now()
            where community_id = $1 and player_id = $2`,
          [community, brokenWaiter.playerId],
        );
        const { rows } = await client.query<{ active: boolean; deleted_at: string | null }>(
          'select active, deleted_at from public.community_players where community_id = $1 and player_id = $2',
          [community, brokenWaiter.playerId],
        );
        assert.ok(rows[0].deleted_at, 'community_players.deleted_at must be set');
        assert.equal(rows[0].active, true, 'community_players.active must be untouched');
      } else {
        await client.query('update public.players set active = false where id = $1', [
          brokenWaiter.playerId,
        ]);
        const { rows } = await client.query<{ active: boolean; deleted_at: string | null }>(
          'select active, deleted_at from public.players where id = $1',
          [brokenWaiter.playerId],
        );
        assert.equal(rows[0].active, false, 'players.active must be false');
        assert.equal(rows[0].deleted_at, null, 'players.deleted_at must be untouched');
      }

      await leaveRegistration(holder.userId, { windowId });

      const entries = await entriesOf(windowId);
      assert.equal(
        entries.find((row) => row.player_id === brokenWaiter.playerId)?.status,
        'REMOVED',
        `${kind} waiter must be skipped`,
      );
      assert.equal(
        entries.find((row) => row.player_id === goodWaiter.playerId)?.status,
        'CONFIRMED',
      );
    }
  });

  test('promotion: when every waiter is ineligible all are removed, the seat stays free, and the command still succeeds', async () => {
    const organizer = await newUser(`promote-all-broken-${randomUUID()}@test.local`);
    const community = await targetCommunity(organizer, 'Promote all broken');
    const windowId = await openWindow(organizer, community, 1);
    const members = await fillWindow(windowId, community, organizer, 1, 2);
    const before = await windowRow(windowId);

    for (const waiter of members.slice(1)) {
      await client.query('update public.players set deleted_at = now() where id = $1', [
        waiter.playerId,
      ]);
    }

    const result = await leaveRegistration(members[0].userId, { windowId });
    assert.equal(result.rows[0].entry_status, 'WITHDRAWN');
    assert.equal(result.rows[0].window_revision, before.revision + 1);

    const entries = await entriesOf(windowId);
    assert.equal(entries.filter((row) => row.status === 'REMOVED').length, 2);
    assert.equal(entries.filter((row) => row.status === 'CONFIRMED').length, 0);
  });

  // ── Step 7: access RED tests ────────────────────────────────────────────────────────────

  // Metadata-only probe: unrelated to the missing command, so this is expected to PASS even
  // now -- W4-01/03 granted nothing directly on registration_entries, and this slice never
  // will either; every mutation goes through the SECURITY DEFINER commands.
  test('access: authenticated holds no direct privilege on registration_entries', async () => {
    const { rows } = await client.query<{ privilege_type: string }>(
      `select privilege_type
         from information_schema.role_table_grants
        where table_schema = 'public'
          and table_name = 'registration_entries'
          and grantee in ('authenticated', 'anon', 'public')`,
    );
    assert.deepEqual(rows, []);
  });

  // has_function_privilege via pg_proc.oid does not need the function to resolve a text
  // signature, so it does not throw 42883 -- it returns zero rows instead, which is what
  // `assert.ok(rows.length > 0)` below catches as correct RED: the function's absence is
  // exactly what this test reports, until Task 2 creates it.
  test('access: the promoter and the eligibility predicate are not executable by browser roles', async () => {
    for (const fn of ['promote_waitlist_to_capacity', 'registration_entry_still_eligible']) {
      for (const role of ['authenticated', 'anon', 'public']) {
        const { rows } = await client.query<{ allowed: boolean }>(
          `select has_function_privilege($1, p.oid, 'EXECUTE') as allowed
             from pg_proc p
             join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'app_private' and p.proname = $2`,
          [role, fn],
        );
        assert.ok(rows.length > 0, `app_private.${fn} must exist`);
        assert.equal(rows[0].allowed, false, `${role} must not execute app_private.${fn}`);
      }
    }
  });

  // ── Step 8: Remove/capacity fixture helpers (XS-W4-04 task 3, brief-supplied shape) ───────

  async function removeEntry(
    actorId: string | null,
    input: { commandId?: string; windowId: string; playerId: string; reason?: string | null },
  ) {
    return call<EntryCommandRow>(
      actorId,
      'select * from public.remove_registration_entry($1, $2, $3, $4)',
      [
        input.commandId ?? randomUUID(),
        input.windowId,
        input.playerId,
        input.reason === undefined ? 'organizer removed' : input.reason,
      ],
    );
  }

  interface CapacityCommandRow extends QueryResultRow {
    window_capacity: number;
    window_revision: number;
  }

  async function changeCapacity(
    actorId: string | null,
    input: { commandId?: string; windowId: string; capacity: number | null },
  ) {
    return call<CapacityCommandRow>(
      actorId,
      'select * from public.change_registration_capacity($1, $2, $3)',
      [input.commandId ?? randomUUID(), input.windowId, input.capacity],
    );
  }

  // ── Step 9: Remove RED tests ────────────────────────────────────────────────────────────

  test('remove_registration_entry: removing a CONFIRMED entry records the reason and promotes the head of the queue', async () => {
    const organizer = await newUser(`remove-confirmed-${randomUUID()}@test.local`);
    const community = await targetCommunity(organizer, 'Remove confirmed');
    const windowId = await openWindow(organizer, community, 1);
    const members = await fillWindow(windowId, community, organizer, 1, 1);
    const before = await windowRow(windowId);

    const result = await removeEntry(organizer, {
      windowId,
      playerId: members[0].playerId,
      reason: 'did not pay',
    });

    assert.equal(result.rows[0].entry_status, 'REMOVED');
    assert.equal(result.rows[0].window_revision, before.revision + 1);

    const entries = await entriesOf(windowId);
    const removed = entries.find((row) => row.player_id === members[0].playerId);
    assert.equal(removed?.status, 'REMOVED');
    assert.equal(removed?.removal_reason, 'did not pay');
    assert.ok(removed?.removed_at);
    assert.equal(entries.find((row) => row.player_id === members[1].playerId)?.status, 'CONFIRMED');
  });

  test('remove_registration_entry: removing a WAITLISTED entry promotes nobody', async () => {
    const organizer = await newUser(`remove-waitlisted-${randomUUID()}@test.local`);
    const community = await targetCommunity(organizer, 'Remove waitlisted');
    const windowId = await openWindow(organizer, community, 1);
    const members = await fillWindow(windowId, community, organizer, 1, 2);

    await removeEntry(organizer, { windowId, playerId: members[1].playerId });

    const entries = await entriesOf(windowId);
    assert.equal(entries.filter((row) => row.status === 'CONFIRMED').length, 1);
    assert.equal(
      entries.find((row) => row.player_id === members[2].playerId)?.status,
      'WAITLISTED',
    );
  });

  test('remove_registration_entry: a null reason is accepted and a blank reason is rejected', async () => {
    const organizer = await newUser(`remove-reason-${randomUUID()}@test.local`);
    const community = await targetCommunity(organizer, 'Remove reason');
    const windowId = await openWindow(organizer, community, 4);
    const a = await eligibleMember(
      community,
      organizer,
      `remove-reason-a-${randomUUID()}@test.local`,
    );
    const b = await eligibleMember(
      community,
      organizer,
      `remove-reason-b-${randomUUID()}@test.local`,
    );
    await joinRegistration(a.userId, { windowId });
    await joinRegistration(b.userId, { windowId });

    const accepted = await removeEntry(organizer, { windowId, playerId: a.playerId, reason: null });
    assert.equal(accepted.rows[0].entry_status, 'REMOVED');

    const blank = await removeEntry(organizer, {
      windowId,
      playerId: b.playerId,
      reason: '   ',
    }).catch((error: Error) => error);
    assertSqlState(blank, '23514');
  });

  test('remove_registration_entry: raises 42501 for a non-organizer member and for an organizer of another Community', async () => {
    const organizer = await newUser(`remove-authz-${randomUUID()}@test.local`);
    const community = await targetCommunity(organizer, 'Remove authz');
    const windowId = await openWindow(organizer, community, 4);
    const victim = await eligibleMember(
      community,
      organizer,
      `remove-victim-${randomUUID()}@test.local`,
    );
    await joinRegistration(victim.userId, { windowId });

    const plainMember = await newUser(`remove-plain-${randomUUID()}@test.local`);
    await activeMembership(community, plainMember);
    const byMember = await removeEntry(plainMember, {
      windowId,
      playerId: victim.playerId,
    }).catch((error: Error) => error);
    assertSqlState(byMember, '42501');

    const otherOrganizer = await newUser(`remove-other-${randomUUID()}@test.local`);
    await targetCommunity(otherOrganizer, 'Remove other community');
    const byOutsider = await removeEntry(otherOrganizer, {
      windowId,
      playerId: victim.playerId,
    }).catch((error: Error) => error);
    assertSqlState(byOutsider, '42501');
  });

  test('remove_registration_entry: a Player with no effective entry raises P0002, and so does removing twice', async () => {
    const organizer = await newUser(`remove-none-${randomUUID()}@test.local`);
    const community = await targetCommunity(organizer, 'Remove nothing');
    const windowId = await openWindow(organizer, community, 4);
    const stranger = await rosterOnlyPlayer(community, organizer, 'Never registered');
    const member = await eligibleMember(
      community,
      organizer,
      `remove-none-m-${randomUUID()}@test.local`,
    );
    await joinRegistration(member.userId, { windowId });

    const never = await removeEntry(organizer, { windowId, playerId: stranger }).catch(
      (error: Error) => error,
    );
    assertSqlState(never, 'P0002');

    await removeEntry(organizer, { windowId, playerId: member.playerId });
    const again = await removeEntry(organizer, { windowId, playerId: member.playerId }).catch(
      (error: Error) => error,
    );
    assertSqlState(again, 'P0002');
  });

  test('remove_registration_entry: raises 23514 while the Window is LOCKED', async () => {
    const organizer = await newUser(`remove-locked-${randomUUID()}@test.local`);
    const community = await targetCommunity(organizer, 'Remove locked');
    const sessionId = await communitySession(organizer, community);
    const created = await createWindow(organizer, { sessionId, capacity: 4 });
    const windowId = created.rows[0].window_id;
    let revision = created.rows[0].window_revision;
    await transition(organizer, 'open_registration', { windowId, expectedRevision: revision });

    const victim = await eligibleMember(
      community,
      organizer,
      `remove-locked-victim-${randomUUID()}@test.local`,
    );
    await joinRegistration(victim.userId, { windowId });
    revision = (await windowRow(windowId)).revision;

    await transition(organizer, 'close_registration', { windowId, expectedRevision: revision });
    revision = (await windowRow(windowId)).revision;
    await transition(organizer, 'lock_registration', { windowId, expectedRevision: revision });

    const result = await removeEntry(organizer, {
      windowId,
      playerId: victim.playerId,
    }).catch((error: Error) => error);
    assertSqlState(result, '23514');
  });

  test('remove_registration_entry: a retry with the same command_id returns the recorded result and mutates nothing further', async () => {
    const organizer = await newUser(`remove-retry-${randomUUID()}@test.local`);
    const community = await targetCommunity(organizer, 'Remove retry');
    const windowId = await openWindow(organizer, community, 2);
    const members = await fillWindow(windowId, community, organizer, 2, 2);
    const commandId = randomUUID();

    const first = await removeEntry(organizer, {
      commandId,
      windowId,
      playerId: members[0].playerId,
    });
    const afterFirst = await windowRow(windowId);
    const second = await removeEntry(organizer, {
      commandId,
      windowId,
      playerId: members[0].playerId,
    });
    const afterSecond = await windowRow(windowId);

    assert.deepEqual(second.rows[0], first.rows[0]);
    assert.equal(afterSecond.revision, afterFirst.revision, 'a retry must not bump the revision');

    const entries = await entriesOf(windowId);
    assert.equal(entries.filter((row) => row.status === 'CONFIRMED').length, 2);
    assert.equal(entries.filter((row) => row.status === 'REMOVED').length, 1);
    assert.equal(
      entries.find((row) => row.player_id === members[3].playerId)?.status,
      'WAITLISTED',
      'the retry must not promote a second waiter',
    );
  });

  // ── Step 10: Capacity RED tests ─────────────────────────────────────────────────────────

  test('change_registration_capacity: an increase promotes exactly the freed slots in FIFO order', async () => {
    const organizer = await newUser(`capacity-increase-${randomUUID()}@test.local`);
    const community = await targetCommunity(organizer, 'Capacity increase');
    const windowId = await openWindow(organizer, community, 2);
    const members = await fillWindow(windowId, community, organizer, 2, 5);
    const before = await windowRow(windowId);

    const result = await changeCapacity(organizer, { windowId, capacity: 5 });

    assert.equal(result.rows[0].window_capacity, 5);
    assert.equal(result.rows[0].window_revision, before.revision + 1);

    const entries = await entriesOf(windowId);
    assert.equal(entries.filter((row) => row.status === 'CONFIRMED').length, 5);
    for (const promoted of members.slice(2, 5)) {
      assert.equal(
        entries.find((row) => row.player_id === promoted.playerId)?.status,
        'CONFIRMED',
        'the first three waiters by queue_sequence must be the promoted ones',
      );
    }
    for (const waiting of members.slice(5)) {
      assert.equal(entries.find((row) => row.player_id === waiting.playerId)?.status, 'WAITLISTED');
    }
  });

  test('change_registration_capacity: a reduction below the confirmed count raises 23514 and changes nothing', async () => {
    const organizer = await newUser(`capacity-reduce-${randomUUID()}@test.local`);
    const community = await targetCommunity(organizer, 'Capacity reduce');
    const windowId = await openWindow(organizer, community, 3);
    await fillWindow(windowId, community, organizer, 3, 0);
    const before = await windowRow(windowId);

    const result = await changeCapacity(organizer, { windowId, capacity: 2 }).catch(
      (error: Error) => error,
    );
    assertSqlState(result, '23514');

    const after = await windowRow(windowId);
    assert.equal(after.capacity, before.capacity);
    assert.equal(after.revision, before.revision);
    const entries = await entriesOf(windowId);
    assert.equal(
      entries.filter((row) => row.status === 'CONFIRMED').length,
      3,
      'nobody is demoted',
    );
  });

  test('change_registration_capacity: a reduction to exactly the confirmed count succeeds', async () => {
    const organizer = await newUser(`capacity-exact-${randomUUID()}@test.local`);
    const community = await targetCommunity(organizer, 'Capacity exact');
    const windowId = await openWindow(organizer, community, 5);
    await fillWindow(windowId, community, organizer, 3, 0);

    const result = await changeCapacity(organizer, { windowId, capacity: 3 });
    assert.equal(result.rows[0].window_capacity, 3);
  });

  test('change_registration_capacity: setting the current capacity is a no-op that does not bump the revision or promote', async () => {
    const organizer = await newUser(`capacity-noop-${randomUUID()}@test.local`);
    const community = await targetCommunity(organizer, 'Capacity no-op');
    const windowId = await openWindow(organizer, community, 2);
    const members = await fillWindow(windowId, community, organizer, 2, 1);
    const before = await windowRow(windowId);

    const result = await changeCapacity(organizer, { windowId, capacity: 2 });

    assert.equal(result.rows[0].window_capacity, 2);
    assert.equal(result.rows[0].window_revision, before.revision);
    const after = await windowRow(windowId);
    assert.equal(after.revision, before.revision);
    const entries = await entriesOf(windowId);
    assert.equal(
      entries.find((row) => row.player_id === members[2].playerId)?.status,
      'WAITLISTED',
    );
  });

  test('change_registration_capacity: zero, negative and null capacities raise 23514', async () => {
    const organizer = await newUser(`capacity-invalid-${randomUUID()}@test.local`);
    const community = await targetCommunity(organizer, 'Capacity invalid');
    const windowId = await openWindow(organizer, community, 4);

    for (const capacity of [0, -1, null]) {
      const result = await changeCapacity(organizer, { windowId, capacity }).catch(
        (error: Error) => error,
      );
      assertSqlState(result, '23514');
    }
  });

  // FIX ROUND 1: the retry deliberately sends capacity 5, NOT the first call's capacity 2.
  // Resending the same value would let a broken implementation with no command-receipt
  // handling at all fall into the ordinary no-op branch (p_capacity = v_window.capacity) and
  // still return an identical row -- a coincidence, not idempotency. A different value on the
  // retry is the only thing that can tell a real receipt short-circuit (returns the recorded
  // result, capacity stays 2) apart from that no-op coincidence (capacity would become 5). Do
  // not "simplify" this back to 2.
  test('change_registration_capacity: a retry with the same command_id returns the recorded result, ignores the different capacity it was resent with, and does not promote again', async () => {
    const organizer = await newUser(`capacity-retry-${randomUUID()}@test.local`);
    const community = await targetCommunity(organizer, 'Capacity retry');
    const windowId = await openWindow(organizer, community, 1);
    await fillWindow(windowId, community, organizer, 1, 3);
    const commandId = randomUUID();

    const first = await changeCapacity(organizer, { commandId, windowId, capacity: 2 });
    const afterFirst = await windowRow(windowId);
    const second = await changeCapacity(organizer, { commandId, windowId, capacity: 5 });
    const afterSecond = await windowRow(windowId);

    assert.deepEqual(second.rows[0], first.rows[0]);
    assert.equal(afterSecond.capacity, 2, 'the resent capacity 5 must never be applied');
    assert.equal(afterSecond.revision, afterFirst.revision);
    const entries = await entriesOf(windowId);
    assert.equal(
      entries.filter((row) => row.status === 'CONFIRMED').length,
      2,
      'no second promotion occurred',
    );
  });

  test('change_registration_capacity: raises 23514 while the Window is LOCKED, and succeeds while it is DRAFT', async () => {
    const organizer = await newUser(`capacity-locked-${randomUUID()}@test.local`);
    const community = await targetCommunity(organizer, 'Capacity locked');
    const sessionId = await communitySession(organizer, community);
    const windowId = await windowAt(organizer, sessionId, 'LOCKED', 4);

    const result = await changeCapacity(organizer, { windowId, capacity: 6 }).catch(
      (error: Error) => error,
    );
    assertSqlState(result, '23514');

    const draftSession = await communitySession(organizer, community, 'Capacity draft');
    const draftWindow = await windowAt(organizer, draftSession, 'DRAFT', 4);
    const inDraft = await changeCapacity(organizer, { windowId: draftWindow, capacity: 6 });
    assert.equal(inDraft.rows[0].window_capacity, 6);
  });

  // ── Step 11: return-shape RED test ──────────────────────────────────────────────────────

  test('access: the three commands return exactly their documented columns', async () => {
    const organizer = await newUser(`shape-${randomUUID()}@test.local`);
    const community = await targetCommunity(organizer, 'Return shape');
    const windowId = await openWindow(organizer, community, 2);
    const members = await fillWindow(windowId, community, organizer, 2, 0);

    const left = await leaveRegistration(members[0].userId, { windowId });
    assert.deepEqual(Object.keys(left.rows[0]).sort(), ['entry_status', 'window_revision']);

    const removed = await removeEntry(organizer, { windowId, playerId: members[1].playerId });
    assert.deepEqual(Object.keys(removed.rows[0]).sort(), ['entry_status', 'window_revision']);

    const resized = await changeCapacity(organizer, { windowId, capacity: 6 });
    assert.deepEqual(Object.keys(resized.rows[0]).sort(), ['window_capacity', 'window_revision']);
  });

  // ── Step 12: exit-gate race RED tests ───────────────────────────────────────────────────
  //
  // Copies the barrier structure from registrationJoin.dbtest.ts's last-slot race (XS-W4-03
  // task 1). Three things there are load-bearing and must not be "simplified": the barrier
  // connection is AWAITED before either racer is dispatched, the barrier is COMMITTED before
  // Promise.all, and each racer COMMITS INSIDE its own promise chain -- asIdentityCommitting
  // already does that internally (begin, run work, commit, all before it resolves), so calling
  // it directly and awaiting both calls via Promise.all satisfies the requirement without a
  // second manual transaction wrapper. Commits placed after Promise.all would deadlock, because
  // the winner cannot commit while the loser holds the await open, and this suite has no
  // timeout anywhere -- it would hang forever. This exact mistake was made once already in
  // XS-W4-01.

  test('EXIT GATE: a Leave concurrent with a Join gives the freed seat to the waiter, never to the joiner', async () => {
    const organizer = await newUser(`gate-leave-${randomUUID()}@test.local`);
    const community = await targetCommunity(organizer, 'Exit gate leave');
    const windowId = await openWindow(organizer, community, 1);
    const holder = await eligibleMember(
      community,
      organizer,
      `gate-holder-${randomUUID()}@test.local`,
    );
    const waiter = await eligibleMember(
      community,
      organizer,
      `gate-waiter-${randomUUID()}@test.local`,
    );
    const latecomer = await eligibleMember(
      community,
      organizer,
      `gate-late-${randomUUID()}@test.local`,
    );
    await joinRegistration(holder.userId, { windowId });
    await joinRegistration(waiter.userId, { windowId });

    const barrier = await pool.connect();
    const leaver = await pool.connect();
    const joiner = await pool.connect();
    try {
      await barrier.query('begin');
      await barrier.query('select 1 from public.registration_windows where id = $1 for update', [
        windowId,
      ]);

      const leaving = asIdentityCommitting(leaver, holder.userId, () =>
        leaver.query('select * from public.leave_registration($1, $2)', [randomUUID(), windowId]),
      );
      const joining = asIdentityCommitting(joiner, latecomer.userId, () =>
        joiner.query('select * from public.join_registration($1, $2, $3)', [
          randomUUID(),
          randomUUID(),
          windowId,
        ]),
      );

      await barrier.query('commit');
      await Promise.all([leaving, joining]);
    } finally {
      barrier.release();
      leaver.release();
      joiner.release();
    }

    const entries = await entriesOf(windowId);
    assert.equal(entries.find((row) => row.player_id === holder.playerId)?.status, 'WITHDRAWN');
    assert.equal(
      entries.find((row) => row.player_id === waiter.playerId)?.status,
      'CONFIRMED',
      'the eligible waiter must take the freed seat (REG-INV-015)',
    );
    assert.equal(
      entries.find((row) => row.player_id === latecomer.playerId)?.status,
      'WAITLISTED',
      'a concurrent joiner must never bypass an existing eligible waiter',
    );
    assert.equal(entries.filter((row) => row.status === 'CONFIRMED').length, 1);
  });

  test('EXIT GATE: a capacity increase concurrent with a Join gives the new seat to the waiter', async () => {
    const organizer = await newUser(`gate-capacity-${randomUUID()}@test.local`);
    const community = await targetCommunity(organizer, 'Exit gate capacity');
    const windowId = await openWindow(organizer, community, 1);
    const holder = await eligibleMember(
      community,
      organizer,
      `gatec-holder-${randomUUID()}@test.local`,
    );
    const waiter = await eligibleMember(
      community,
      organizer,
      `gatec-waiter-${randomUUID()}@test.local`,
    );
    const latecomer = await eligibleMember(
      community,
      organizer,
      `gatec-late-${randomUUID()}@test.local`,
    );
    await joinRegistration(holder.userId, { windowId });
    await joinRegistration(waiter.userId, { windowId });

    const barrier = await pool.connect();
    const resizer = await pool.connect();
    const joiner = await pool.connect();
    try {
      await barrier.query('begin');
      await barrier.query('select 1 from public.registration_windows where id = $1 for update', [
        windowId,
      ]);

      const resizing = asIdentityCommitting(resizer, organizer, () =>
        resizer.query('select * from public.change_registration_capacity($1, $2, $3)', [
          randomUUID(),
          windowId,
          2,
        ]),
      );
      const joining = asIdentityCommitting(joiner, latecomer.userId, () =>
        joiner.query('select * from public.join_registration($1, $2, $3)', [
          randomUUID(),
          randomUUID(),
          windowId,
        ]),
      );

      await barrier.query('commit');
      await Promise.all([resizing, joining]);
    } finally {
      barrier.release();
      resizer.release();
      joiner.release();
    }

    const entries = await entriesOf(windowId);
    assert.equal(
      entries.find((row) => row.player_id === waiter.playerId)?.status,
      'CONFIRMED',
      'the waiter must take the new seat, not the concurrent joiner',
    );
    assert.equal(entries.find((row) => row.player_id === latecomer.playerId)?.status, 'WAITLISTED');
    assert.equal(entries.filter((row) => row.status === 'CONFIRMED').length, 2);
  });
}
