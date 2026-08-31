import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { Client, Pool, PoolClient, QueryResultRow } from 'pg';
import {
  asIdentityCommitting,
  connect,
  createPool,
  isTestDatabaseConfigured,
  rebuildFromMigrations,
  TEST_DATABASE_URL_VAR,
} from './harness';

/**
 * RED contract for `public.join_registration` and `public.add_registration_entry`
 * (XS-W4-03 task 1). Neither command exists yet -- both land in a later task. Every test in
 * this file is expected to fail now with `42883` (undefined function), except the two access
 * probes noted in Step 8, which are metadata-only queries unrelated to either command.
 *
 * See docs/superpowers/specs/2026-08-31-xs-w4-03-join-registration-design.md for the target
 * shape this suite pins.
 */

if (!isTestDatabaseConfigured()) {
  test(`registration join requires ${TEST_DATABASE_URL_VAR}`, () => {
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

  // ── Verbatim fixture helpers (from registrationLifecycle.dbtest.ts, XS-W4-02 task 2) ─────

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
  // registrationLifecycle.dbtest.ts's windowAt, XS-W4-02 task 2).
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

  async function beginAsIdentity(db: PoolClient, userId: string): Promise<void> {
    await db.query('select set_config($1, $2, true)', ['request.jwt.claim.sub', userId]);
    await db.query('select set_config($1, $2, true)', ['request.jwt.claim.role', 'authenticated']);
    await db.query('select set_config($1, $2, true)', [
      'request.jwt.claims',
      JSON.stringify({ sub: userId, role: 'authenticated' }),
    ]);
    await db.query('set local role authenticated');
  }

  // ── Step 1: registrationJoin-specific fixture helpers (brief-supplied shape) ──────────────

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
  //
  // DEVIATION FROM THE BRIEF (verified against the live database, see task-1-report.md): the
  // brief's snippet inserts `player_account_links (player_id, user_id, status)` without
  // `provenance` (NOT NULL, no default) or `activated_at` (required whenever status =
  // 'ACTIVE' by `player_account_links_check`). Both raise 23502/23514 as a fixture crash, not
  // a product failure, so this uses the same idiom as playerAccountLink.dbtest.ts:91.
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

  async function entryRow(entryId: string) {
    const { rows } = await client.query<{
      player_id: string;
      status: string;
      queue_sequence: string | null;
      source: string;
      created_by_user_id: string | null;
    }>(
      `select player_id, status, queue_sequence, source, created_by_user_id
         from public.registration_entries where id = $1`,
      [entryId],
    );
    return rows;
  }

  async function windowRevision(windowId: string): Promise<number> {
    const { rows } = await client.query<{ revision: number }>(
      'select revision from public.registration_windows where id = $1',
      [windowId],
    );
    return rows[0].revision;
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

  // Privileged direct insert, used ONLY to pre-fill a Window's capacity with CONFIRMED
  // entries before a Step 2 happy-path assertion. This isolates the "Window already full"
  // scenario from add_registration_entry's own correctness -- Step 2 pins join_registration's
  // behavior against an already-full Window, not how it got full. Step 7's exit gate, by
  // contrast, deliberately fills capacity via the real add_registration_entry command (per the
  // brief) because THAT test is pinning behavior under real contention.
  async function fillCapacityDirect(
    windowId: string,
    ownerId: string,
    count: number,
  ): Promise<void> {
    for (let index = 0; index < count; index += 1) {
      const playerId = await createPlayer(ownerId, { name: `Filler ${index}` });
      await client.query(
        `insert into public.registration_entries
           (id, registration_window_id, player_id, status, source)
         values ($1, $2, $3, 'CONFIRMED', 'ORGANIZER_ADDED')`,
        [randomUUID(), windowId, playerId],
      );
    }
  }

  // ── Step 2: happy-path RED tests ───────────────────────────────────────────────────────

  test('an eligible member self-joining an OPEN Window with room returns CONFIRMED, bumps window_revision by one, and records source = SELF_JOIN, the caller as player_id and created_by_user_id, status CONFIRMED and a null queue_sequence', async () => {
    const organizer = await newUser('join-happy-confirmed-organizer@test.local');
    const community = await targetCommunity(organizer, 'Happy path confirmed');
    const windowId = await openWindow(organizer, community, 12);
    const member = await eligibleMember(
      community,
      organizer,
      'join-happy-confirmed-member@test.local',
    );
    const before = await windowRevision(windowId);
    const entryId = randomUUID();

    const result = await joinRegistration(member.userId, { windowId, entryId });
    assert.equal(result.rows[0].entry_status, 'CONFIRMED');
    assert.equal(result.rows[0].window_revision, before + 1);

    const rows = await entryRow(entryId);
    assert.deepEqual(rows, [
      {
        player_id: member.playerId,
        status: 'CONFIRMED',
        queue_sequence: null,
        source: 'SELF_JOIN',
        created_by_user_id: member.userId,
      },
    ]);
  });

  test('a self-join against a Window whose capacity is already filled resolves to WAITLISTED (not a thrown error) with queue_sequence = 1', async () => {
    const organizer = await newUser('join-happy-waitlisted-organizer@test.local');
    const community = await targetCommunity(organizer, 'Happy path waitlisted');
    const windowId = await openWindow(organizer, community, 1);
    await fillCapacityDirect(windowId, organizer, 1);
    const member = await eligibleMember(
      community,
      organizer,
      'join-happy-waitlisted-member@test.local',
    );
    const entryId = randomUUID();

    const result = await joinRegistration(member.userId, { windowId, entryId });
    assert.equal(result.rows[0].entry_status, 'WAITLISTED');

    const rows = await entryRow(entryId);
    assert.equal(rows[0].status, 'WAITLISTED');
    assert.equal(rows[0].queue_sequence, '1');
  });

  test('OPEN-REG-003: the returned row has exactly the keys entry_status and window_revision, so adding queue_sequence to the return later fails loudly', async () => {
    const organizer = await newUser('join-happy-keyshape-organizer@test.local');
    const community = await targetCommunity(organizer, 'Happy path key shape');
    const windowId = await openWindow(organizer, community, 12);
    const member = await eligibleMember(
      community,
      organizer,
      'join-happy-keyshape-member@test.local',
    );

    const result = await joinRegistration(member.userId, { windowId });
    assert.deepEqual(Object.keys(result.rows[0]).sort(), ['entry_status', 'window_revision']);
  });

  // ── Step 3: self-join eligibility RED tests ────────────────────────────────────────────

  type BrokenLinkCase =
    | 'no_membership'
    | 'no_link'
    | 'link_not_active'
    | 'no_roster_row'
    | 'roster_deleted'
    | 'roster_inactive';

  const BROKEN_LINK_CASES: Array<{ kind: BrokenLinkCase; label: string }> = [
    { kind: 'no_membership', label: 'a user with no community_memberships row at all' },
    { kind: 'no_link', label: 'an active member with no player_account_links row' },
    {
      kind: 'link_not_active',
      label: "an active member whose player_account_links row has status <> 'ACTIVE'",
    },
    {
      kind: 'no_roster_row',
      label: 'an active member with an ACTIVE link but no community_players row for that Player',
    },
    {
      kind: 'roster_deleted',
      label: 'an active member with an ACTIVE link whose community_players row has deleted_at set',
    },
    {
      kind: 'roster_inactive',
      label: 'an active member with an ACTIVE link whose community_players row has active = false',
    },
  ];

  // Builds a Community member whose eligibility chain breaks at the given link, so the caller
  // is a real user (real memberships/links/roster rows up to the break) rather than a
  // nonexistent identity.
  async function ineligibleMember(
    communityId: string,
    ownerId: string,
    kind: BrokenLinkCase,
    suffix: string,
  ): Promise<string> {
    const userId = await newUser(`join-ineligible-${kind}-${suffix}@test.local`);
    if (kind === 'no_membership') return userId;

    await activeMembership(communityId, userId);
    if (kind === 'no_link') return userId;

    const playerId = await createPlayer(ownerId, { name: `Ineligible ${kind} ${suffix}` });
    if (kind === 'link_not_active') {
      // PROPOSED needs no activated_at/reviewed_at, unlike REJECTED/REVOKED -- keeps this a
      // pure "not ACTIVE" fixture rather than exercising an unrelated check constraint.
      await client.query(
        `insert into public.player_account_links (player_id, user_id, status, provenance)
         values ($1, $2, 'PROPOSED', 'SELF_CLAIM')`,
        [playerId, userId],
      );
      return userId;
    }

    await client.query(
      `insert into public.player_account_links (player_id, user_id, status, provenance, activated_at)
       values ($1, $2, 'ACTIVE', 'SELF_CLAIM', now())`,
      [playerId, userId],
    );
    if (kind === 'no_roster_row') return userId;

    if (kind === 'roster_deleted') {
      await client.query(
        `insert into public.community_players
           (community_id, player_id, owner_id, active, status, deleted_at)
         values ($1, $2, $3, true, 'active', now())`,
        [communityId, playerId, ownerId],
      );
      return userId;
    }

    // roster_inactive
    //
    // DEVIATION FROM THE BRIEF (verified against the live database): inserting
    // `active = false, status = 'active'` does NOT stick -- the pre-existing
    // `trigger_sync_community_player_active_status` (20260617180615_community_players_optimization.sql)
    // fires BEFORE INSERT and derives `active` FROM `status` whenever `status` is provided and
    // changing, overwriting the explicit `active = false` back to `true`. Passing only
    // `status = 'inactive'` lets that same trigger derive `active = false` correctly, which is
    // what this fixture actually needs.
    await client.query(
      `insert into public.community_players (community_id, player_id, owner_id, status)
       values ($1, $2, $3, 'inactive')`,
      [communityId, playerId, ownerId],
    );
    return userId;
  }

  for (const { kind, label } of BROKEN_LINK_CASES) {
    test(`join_registration: ${label} raises 42501`, async () => {
      const suffix = randomUUID();
      const organizer = await newUser(`join-eligibility-${kind}-${suffix}@test.local`);
      const community = await targetCommunity(organizer, `Eligibility ${kind}`);
      const windowId = await openWindow(organizer, community, 12);
      const userId = await ineligibleMember(community, organizer, kind, suffix);

      const result = await joinRegistration(userId, { windowId }).catch((error: Error) => error);
      assertSqlState(result, '42501');
    });
  }

  test('join_registration: an anonymous caller (null actor) raises 42501', async () => {
    const organizer = await newUser('join-eligibility-anonymous@test.local');
    const community = await targetCommunity(organizer, 'Eligibility anonymous');
    const windowId = await openWindow(organizer, community, 12);

    const result = await joinRegistration(null, { windowId }).catch((error: Error) => error);
    assertSqlState(result, '42501');
  });

  test('BOLA: a member of one Community cannot self-join a real Window belonging to a second Community (QA-INV-006)', async () => {
    const firstOrganizer = await newUser('join-bola-first-organizer@test.local');
    const firstCommunity = await targetCommunity(firstOrganizer, 'BOLA join first');
    const firstWindowId = await openWindow(firstOrganizer, firstCommunity, 12);

    const secondOrganizer = await newUser('join-bola-second-organizer@test.local');
    const secondCommunity = await targetCommunity(secondOrganizer, 'BOLA join second');
    // A real Window in the second Community, never touched below -- only its existence is
    // needed to build a genuinely eligible member elsewhere.
    await openWindow(secondOrganizer, secondCommunity, 12);
    const secondMember = await eligibleMember(
      secondCommunity,
      secondOrganizer,
      'join-bola-second-member@test.local',
    );

    // Use the FIRST Community's real window id: a nonexistent window raises P0002 regardless
    // of eligibility, which would make this test a tautology.
    const result = await joinRegistration(secondMember.userId, { windowId: firstWindowId }).catch(
      (error: Error) => error,
    );
    assertSqlState(result, '42501');
  });

  // ── Step 4: organizer-add RED tests ────────────────────────────────────────────────────

  test("the asymmetry case: add_registration_entry by the assigned organizer succeeds for a roster-only Player (no link, no membership), returning CONFIRMED with source = ORGANIZER_ADDED and created_by_user_id = the organizer, not the Player's owner", async () => {
    const playerOwner = await newUser('add-asymmetry-player-owner@test.local');
    const organizer = await newUser('add-asymmetry-organizer@test.local');
    const community = await targetCommunity(organizer, 'Asymmetry');
    const windowId = await openWindow(organizer, community, 12);
    const playerId = await rosterOnlyPlayer(community, playerOwner, 'Asymmetry player');
    const entryId = randomUUID();

    const result = await addEntry(organizer, { windowId, playerId, entryId });
    assert.equal(result.rows[0].entry_status, 'CONFIRMED');

    const rows = await entryRow(entryId);
    assert.deepEqual(rows, [
      {
        player_id: playerId,
        status: 'CONFIRMED',
        queue_sequence: null,
        source: 'ORGANIZER_ADDED',
        created_by_user_id: organizer,
      },
    ]);
  });

  test('add_registration_entry raises 42501 for a Player with no community_players row in this Community', async () => {
    const organizer = await newUser('add-no-roster-organizer@test.local');
    const community = await targetCommunity(organizer, 'No roster row');
    const windowId = await openWindow(organizer, community, 12);
    const playerId = await createPlayer(organizer, { name: 'Rosterless' });

    const result = await addEntry(organizer, { windowId, playerId }).catch((error: Error) => error);
    assertSqlState(result, '42501');
  });

  test('add_registration_entry raises 42501 when called by an active member who is NOT the assigned organizer', async () => {
    const organizer = await newUser('add-not-organizer-owner@test.local');
    const notOrganizer = await newUser('add-not-organizer-member@test.local');
    const community = await targetCommunity(organizer, 'Not the organizer');
    await activeMembership(community, notOrganizer);
    const windowId = await openWindow(organizer, community, 12);
    const playerId = await rosterOnlyPlayer(community, organizer, 'Not organizer target');

    const result = await addEntry(notOrganizer, { windowId, playerId }).catch(
      (error: Error) => error,
    );
    assertSqlState(result, '42501');
  });

  test('add_registration_entry raises 42501 for an anonymous caller', async () => {
    const organizer = await newUser('add-anonymous-organizer@test.local');
    const community = await targetCommunity(organizer, 'Anonymous add');
    const windowId = await openWindow(organizer, community, 12);
    const playerId = await rosterOnlyPlayer(community, organizer, 'Anonymous add target');

    const result = await addEntry(null, { windowId, playerId }).catch((error: Error) => error);
    assertSqlState(result, '42501');
  });

  test("join_registration has no parameter to register someone else: the entry created by a self-join always carries the caller's own Player, even when another eligible member exists in the same Community", async () => {
    const organizer = await newUser('join-own-player-organizer@test.local');
    const community = await targetCommunity(organizer, 'Own player only');
    const windowId = await openWindow(organizer, community, 12);
    const caller = await eligibleMember(community, organizer, 'join-own-player-caller@test.local');
    const other = await eligibleMember(community, organizer, 'join-own-player-other@test.local');
    const entryId = randomUUID();

    await joinRegistration(caller.userId, { windowId, entryId });

    const rows = await entryRow(entryId);
    assert.equal(rows[0].player_id, caller.playerId);
    assert.notEqual(rows[0].player_id, other.playerId);
  });

  // ── Step 5: state-gate RED tests ───────────────────────────────────────────────────────

  const WINDOW_GATE_STATES: WindowStatus[] = ['DRAFT', 'CLOSED', 'LOCKED'];

  for (const state of WINDOW_GATE_STATES) {
    test(`join_registration raises 23514 when the Window is ${state}`, async () => {
      const organizer = await newUser(`join-window-gate-${state}@test.local`);
      const community = await targetCommunity(organizer, `Join window gate ${state}`);
      const sessionId = await communitySession(organizer, community);
      const windowId = await windowAt(organizer, sessionId, state);
      const member = await eligibleMember(
        community,
        organizer,
        `join-window-gate-${state}-member@test.local`,
      );

      const result = await joinRegistration(member.userId, { windowId }).catch(
        (error: Error) => error,
      );
      assertSqlState(result, '23514');
    });

    test(`add_registration_entry raises 23514 when the Window is ${state}`, async () => {
      const organizer = await newUser(`add-window-gate-${state}@test.local`);
      const community = await targetCommunity(organizer, `Add window gate ${state}`);
      const sessionId = await communitySession(organizer, community);
      const windowId = await windowAt(organizer, sessionId, state);
      const playerId = await rosterOnlyPlayer(community, organizer, `Add window gate ${state}`);

      const result = await addEntry(organizer, { windowId, playerId }).catch(
        (error: Error) => error,
      );
      assertSqlState(result, '23514');
    });
  }

  const TERMINAL_SESSION_STATES: Array<'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED'> = [
    'IN_PROGRESS',
    'COMPLETED',
    'CANCELLED',
  ];

  for (const sessionState of TERMINAL_SESSION_STATES) {
    test(`join_registration raises 23514 when the Session is ${sessionState}`, async () => {
      const organizer = await newUser(`join-session-gate-${sessionState}@test.local`);
      const community = await targetCommunity(organizer, `Join session gate ${sessionState}`);
      const windowId = await openWindow(organizer, community, 12);
      const member = await eligibleMember(
        community,
        organizer,
        `join-session-gate-${sessionState}-member@test.local`,
      );
      const sessionRow = await client.query<{ session_id: string }>(
        'select session_id from public.registration_windows where id = $1',
        [windowId],
      );
      const sessionId = sessionRow.rows[0].session_id;

      if (sessionState === 'CANCELLED') {
        // cancel_target_session is a supported command that works from DRAFT and
        // SCHEDULED -- prefer it over a forced UPDATE, per the brief. create_registration_window
        // never bumps sessions.revision, so it is still 1 at cancel time.
        await call(organizer, 'select * from public.cancel_target_session($1, $2, $3, $4)', [
          randomUUID(),
          sessionId,
          1,
          null,
        ]);
      } else {
        await forceSessionState(sessionId, sessionState);
      }

      const result = await joinRegistration(member.userId, { windowId }).catch(
        (error: Error) => error,
      );
      assertSqlState(result, '23514');
    });

    test(`add_registration_entry raises 23514 when the Session is ${sessionState}`, async () => {
      const organizer = await newUser(`add-session-gate-${sessionState}@test.local`);
      const community = await targetCommunity(organizer, `Add session gate ${sessionState}`);
      const windowId = await openWindow(organizer, community, 12);
      const playerId = await rosterOnlyPlayer(
        community,
        organizer,
        `Add session gate ${sessionState}`,
      );
      const sessionRow = await client.query<{ session_id: string }>(
        'select session_id from public.registration_windows where id = $1',
        [windowId],
      );
      const sessionId = sessionRow.rows[0].session_id;

      if (sessionState === 'CANCELLED') {
        await call(organizer, 'select * from public.cancel_target_session($1, $2, $3, $4)', [
          randomUUID(),
          sessionId,
          1,
          null,
        ]);
      } else {
        await forceSessionState(sessionId, sessionState);
      }

      const result = await addEntry(organizer, { windowId, playerId }).catch(
        (error: Error) => error,
      );
      assertSqlState(result, '23514');
    });
  }

  test('the deadline gate is asymmetric: join_registration rejects a Window whose closes_at is in the past while add_registration_entry on the SAME Window succeeds', async () => {
    const organizer = await newUser('join-deadline-past-organizer@test.local');
    const community = await targetCommunity(organizer, 'Deadline past');
    const pastClosesAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const windowId = await openWindow(organizer, community, 12, pastClosesAt);

    const member = await eligibleMember(
      community,
      organizer,
      'join-deadline-past-member@test.local',
    );
    const rejectedJoin = await joinRegistration(member.userId, { windowId }).catch(
      (error: Error) => error,
    );
    assertSqlState(rejectedJoin, '23514');

    const playerId = await rosterOnlyPlayer(community, organizer, 'Deadline past add target');
    const organizerAdd = await addEntry(organizer, { windowId, playerId });
    assert.equal(organizerAdd.rows[0].entry_status, 'CONFIRMED');
  });

  test('join_registration succeeds when closes_at is in the future', async () => {
    const organizer = await newUser('join-deadline-future-organizer@test.local');
    const community = await targetCommunity(organizer, 'Deadline future');
    const futureClosesAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const windowId = await openWindow(organizer, community, 12, futureClosesAt);
    const member = await eligibleMember(
      community,
      organizer,
      'join-deadline-future-member@test.local',
    );

    const result = await joinRegistration(member.userId, { windowId });
    assert.equal(result.rows[0].entry_status, 'CONFIRMED');
  });

  test('join_registration succeeds when closes_at is null', async () => {
    const organizer = await newUser('join-deadline-null-organizer@test.local');
    const community = await targetCommunity(organizer, 'Deadline null');
    const windowId = await openWindow(organizer, community, 12, null);
    const member = await eligibleMember(
      community,
      organizer,
      'join-deadline-null-member@test.local',
    );

    const result = await joinRegistration(member.userId, { windowId });
    assert.equal(result.rows[0].entry_status, 'CONFIRMED');
  });

  // ── Step 6: idempotency RED tests ──────────────────────────────────────────────────────

  test('replaying join_registration with the same command_id but a DIFFERENT entry_id returns the identical row, proving the receipt short-circuited before any insert', async () => {
    const organizer = await newUser('join-idempotent-replay-organizer@test.local');
    const community = await targetCommunity(organizer, 'Idempotent replay');
    const windowId = await openWindow(organizer, community, 12);
    const member = await eligibleMember(
      community,
      organizer,
      'join-idempotent-replay-member@test.local',
    );
    const commandId = randomUUID();

    const first = await joinRegistration(member.userId, { commandId, windowId });
    const replay = await joinRegistration(member.userId, {
      commandId,
      windowId,
      entryId: randomUUID(),
    });

    assert.deepEqual(replay.rows, first.rows);

    const count = await client.query<{ n: string }>(
      `select count(*)::text as n from public.registration_entries where player_id = $1`,
      [member.playerId],
    );
    assert.equal(count.rows[0].n, '1');
  });

  test('a second join by the same Player under a DIFFERENT command_id raises 23514 (allocator duplicate-effective-entry pre-check), not 23505 and not a silent no-op', async () => {
    const organizer = await newUser('join-duplicate-player-organizer@test.local');
    const community = await targetCommunity(organizer, 'Duplicate player');
    const windowId = await openWindow(organizer, community, 12);
    const member = await eligibleMember(
      community,
      organizer,
      'join-duplicate-player-member@test.local',
    );

    await joinRegistration(member.userId, { windowId });
    const second = await joinRegistration(member.userId, { windowId }).catch(
      (error: Error) => error,
    );
    assertSqlState(second, '23514');
  });

  test('reusing a join_registration command_id against a DIFFERENT Window raises 23505', async () => {
    const organizer = await newUser('join-cross-aggregate-organizer@test.local');
    const community = await targetCommunity(organizer, 'Cross aggregate');
    const firstWindowId = await openWindow(organizer, community, 12);
    const secondWindowId = await openWindow(organizer, community, 12);
    const firstMember = await eligibleMember(
      community,
      organizer,
      'join-cross-aggregate-first@test.local',
    );
    const secondMember = await eligibleMember(
      community,
      organizer,
      'join-cross-aggregate-second@test.local',
    );

    const commandId = randomUUID();
    await joinRegistration(firstMember.userId, { commandId, windowId: firstWindowId });

    const collision = await joinRegistration(secondMember.userId, {
      commandId,
      windowId: secondWindowId,
    }).catch((error: Error) => error);
    assertSqlState(collision, '23505');
  });

  test('reusing a join_registration command_id on add_registration_entry for the SAME Window raises 23505', async () => {
    const organizer = await newUser('join-cross-command-organizer@test.local');
    const community = await targetCommunity(organizer, 'Cross command');
    const windowId = await openWindow(organizer, community, 12);
    const member = await eligibleMember(
      community,
      organizer,
      'join-cross-command-member@test.local',
    );
    const rosterPlayer = await rosterOnlyPlayer(community, organizer, 'Cross command target');

    const commandId = randomUUID();
    await joinRegistration(member.userId, { commandId, windowId });

    const collision = await addEntry(organizer, {
      commandId,
      windowId,
      playerId: rosterPlayer,
    }).catch((error: Error) => error);
    assertSqlState(collision, '23505');
  });

  test('replaying a command_id as a now-revoked (suspended) caller raises 42501, not the recorded result -- the single receipt lookup must sit AFTER authorization', async () => {
    const organizer = await newUser('join-revoked-replay-organizer@test.local');
    const community = await targetCommunity(organizer, 'Revoked replay');
    const windowId = await openWindow(organizer, community, 12);
    const member = await eligibleMember(
      community,
      organizer,
      'join-revoked-replay-member@test.local',
    );

    const commandId = randomUUID();
    await joinRegistration(member.userId, { commandId, windowId });

    // The eligibility predicate keys on status = 'active', so suspending is sufficient and
    // reversible, unlike a delete.
    await client.query(
      `update public.community_memberships set status = 'suspended'
        where community_id = $1 and user_id = $2`,
      [community, member.userId],
    );

    const replay = await joinRegistration(member.userId, { commandId, windowId }).catch(
      (error: Error) => error,
    );
    assertSqlState(replay, '42501');
  });

  // ── Step 7: concurrency and burst RED tests ────────────────────────────────────────────

  // Copies the last-slot racer structure from registrationSchema.dbtest.ts, including its
  // barrier connection. Three things there are load-bearing and were hard-won:
  //   * the barrier's `for update` is awaited BEFORE both racers are dispatched;
  //   * the barrier is COMMITTED before Promise.all is awaited;
  //   * each racer COMMITS INSIDE its own promise chain -- a commit placed after Promise.all
  //     would deadlock, because the winner cannot commit while the loser holds the await open.
  //     An earlier slice shipped exactly that bug and hung the whole suite.
  test('EXIT GATE: two different eligible members self-joining the last open slot simultaneously serialize to exactly one CONFIRMED and one WAITLISTED, and the Window ends with exactly capacity CONFIRMED entries', async () => {
    const organizer = await newUser('join-exit-gate-organizer@test.local');
    const community = await targetCommunity(organizer, 'Exit gate');
    const windowId = await openWindow(organizer, community, 12);

    // Eleven confirmed via rosterOnlyPlayer + addEntry -- cheaper than eleven full members
    // with account links and memberships, which Step 3 already proves.
    for (let index = 0; index < 11; index += 1) {
      const fillerId = await rosterOnlyPlayer(community, organizer, `Exit gate filler ${index}`);
      await addEntry(organizer, { windowId, playerId: fillerId });
    }

    const racerA = await eligibleMember(community, organizer, 'join-exit-gate-racer-a@test.local');
    const racerB = await eligibleMember(community, organizer, 'join-exit-gate-racer-b@test.local');

    const a = await pool.connect();
    const b = await pool.connect();
    const barrier = await pool.connect();
    try {
      await a.query('begin');
      await beginAsIdentity(a, racerA.userId);
      await b.query('begin');
      await beginAsIdentity(b, racerB.userId);

      await barrier.query('begin');
      await barrier.query('select 1 from public.registration_windows where id = $1 for update', [
        windowId,
      ]);

      const race = (db: PoolClient) =>
        db
          .query<JoinResultRow>('select * from public.join_registration($1, $2, $3)', [
            randomUUID(),
            randomUUID(),
            windowId,
          ])
          .then(async (result) => {
            await db.query('commit');
            return result.rows[0];
          })
          .catch(async (error: Error) => {
            await db.query('rollback').catch(() => undefined);
            return error;
          });

      const racingA = race(a);
      const racingB = race(b);
      await barrier.query('commit');

      const outcomes = await Promise.all([racingA, racingB]);
      const succeeded = outcomes.filter(
        (outcome): outcome is JoinResultRow => !(outcome instanceof Error),
      );
      assert.equal(succeeded.length, 2, 'both concurrent self-joins must resolve, not throw');

      const confirmed = succeeded.filter((outcome) => outcome.entry_status === 'CONFIRMED');
      const waitlisted = succeeded.filter((outcome) => outcome.entry_status === 'WAITLISTED');
      assert.equal(confirmed.length, 1);
      assert.equal(waitlisted.length, 1);

      const finalConfirmed = await client.query<{ n: string }>(
        `select count(*)::text as n from public.registration_entries
          where registration_window_id = $1 and status = 'CONFIRMED'`,
        [windowId],
      );
      assert.equal(finalConfirmed.rows[0].n, '12');

      const waitlistedEntry = await client.query<{ queue_sequence: string }>(
        `select queue_sequence from public.registration_entries
          where registration_window_id = $1 and status = 'WAITLISTED'`,
        [windowId],
      );
      assert.equal(waitlistedEntry.rows[0]?.queue_sequence, '1');
    } finally {
      await a.query('rollback').catch(() => undefined);
      await b.query('rollback').catch(() => undefined);
      await barrier.query('rollback').catch(() => undefined);
      a.release();
      b.release();
      barrier.release();
    }
  });

  // Uses add_registration_entry rather than join_registration on purpose. Both reach the same
  // allocator, but a hundred self-joins would need a hundred auth users, links and
  // memberships -- minutes of setup proving nothing Step 3 does not already prove. Do not
  // "upgrade" this to join_registration.
  test('a burst of 100 add_registration_entry calls against a capacity-30 Window, driven in concurrent batches of 8, confirms exactly 30 and waitlists exactly 70 with gapless sequences 1..70', async () => {
    const organizer = await newUser('add-burst-organizer@test.local');
    const community = await targetCommunity(organizer, 'Burst');
    const windowId = await openWindow(organizer, community, 30);

    const players: string[] = [];
    for (let index = 0; index < 100; index += 1) {
      players.push(await rosterOnlyPlayer(community, organizer, `Burst player ${index}`));
    }

    const BATCH_SIZE = 8;
    for (let start = 0; start < players.length; start += BATCH_SIZE) {
      const batch = players.slice(start, start + BATCH_SIZE);
      await Promise.all(batch.map((playerId) => addEntry(organizer, { windowId, playerId })));
    }

    const confirmed = await client.query<{ n: string }>(
      `select count(*)::text as n from public.registration_entries
        where registration_window_id = $1 and status = 'CONFIRMED'`,
      [windowId],
    );
    assert.equal(confirmed.rows[0].n, '30');

    const waitlisted = await client.query<{ queue_sequence: string }>(
      `select queue_sequence from public.registration_entries
        where registration_window_id = $1 and status = 'WAITLISTED'
        order by queue_sequence`,
      [windowId],
    );
    assert.equal(waitlisted.rows.length, 70);
    const sequences = waitlisted.rows.map((row) => Number(row.queue_sequence));
    assert.deepEqual(
      sequences,
      Array.from({ length: 70 }, (_, index) => index + 1),
    );
  });

  // ── Step 8: access and rollback RED tests ──────────────────────────────────────────────

  // Metadata-only probe: unrelated to either missing command, so this is expected to PASS
  // even now -- the previous slice (W4-01) granted nothing on registration_entries, and this
  // slice has not been implemented yet to change that.
  test('anon and authenticated hold none of SELECT, INSERT, UPDATE, DELETE on registration_entries', async () => {
    const { rows } = await client.query<{
      anon_select: boolean;
      authenticated_select: boolean;
      anon_insert: boolean;
      authenticated_insert: boolean;
      anon_update: boolean;
      authenticated_update: boolean;
      anon_delete: boolean;
      authenticated_delete: boolean;
    }>(
      `select has_table_privilege('anon', c.oid, 'SELECT') as anon_select,
              has_table_privilege('authenticated', c.oid, 'SELECT') as authenticated_select,
              has_table_privilege('anon', c.oid, 'INSERT') as anon_insert,
              has_table_privilege('authenticated', c.oid, 'INSERT') as authenticated_insert,
              has_table_privilege('anon', c.oid, 'UPDATE') as anon_update,
              has_table_privilege('authenticated', c.oid, 'UPDATE') as authenticated_update,
              has_table_privilege('anon', c.oid, 'DELETE') as anon_delete,
              has_table_privilege('authenticated', c.oid, 'DELETE') as authenticated_delete
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relname = 'registration_entries'`,
    );
    assert.deepEqual(rows, [
      {
        anon_select: false,
        authenticated_select: false,
        anon_insert: false,
        authenticated_insert: false,
        anon_update: false,
        authenticated_update: false,
        anon_delete: false,
        authenticated_delete: false,
      },
    ]);
  });

  // The text-signature form of has_function_privilege must RESOLVE the signature before it
  // can answer, so this throws 42883 while the function does not exist yet -- unlike the
  // table-privilege probe above, this one is expected to FAIL in the current RED state.
  test('neither anon nor authenticated can execute app_private.current_user_can_join_registration', async () => {
    const { rows } = await client.query<{ anon_execute: boolean; authenticated_execute: boolean }>(
      `select
         has_function_privilege(
           'anon',
           'app_private.current_user_can_join_registration(uuid)',
           'EXECUTE'
         ) as anon_execute,
         has_function_privilege(
           'authenticated',
           'app_private.current_user_can_join_registration(uuid)',
           'EXECUTE'
         ) as authenticated_execute`,
    );
    assert.deepEqual(rows, [{ anon_execute: false, authenticated_execute: false }]);
  });

  test('a rejected self-join leaves nothing behind: no registration_entries row, no command_receipts row, and the Window revision unchanged (QA-INV-012)', async () => {
    const organizer = await newUser('join-rollback-organizer@test.local');
    const community = await targetCommunity(organizer, 'Rollback');
    const sessionId = await communitySession(organizer, community);
    const windowId = await windowAt(organizer, sessionId, 'DRAFT');
    const member = await eligibleMember(community, organizer, 'join-rollback-member@test.local');
    const before = await windowRevision(windowId);

    const commandId = randomUUID();
    const failed = await joinRegistration(member.userId, { commandId, windowId }).catch(
      (error: Error) => error,
    );
    assertSqlState(failed, '23514');

    const entries = await client.query<{ n: string }>(
      `select count(*)::text as n from public.registration_entries where player_id = $1`,
      [member.playerId],
    );
    assert.equal(entries.rows[0].n, '0');

    const receipt = await client.query(
      'select 1 from app_private.command_receipts where command_id = $1',
      [commandId],
    );
    assert.equal(receipt.rows.length, 0);

    const after = await windowRevision(windowId);
    assert.equal(after, before);
  });

  test('each command writes an app_private.command_receipts row with its own command_type, aggregate_id = the window id, actor_id = the caller and retention_class = REGISTRATION_ENTRY', async () => {
    const organizer = await newUser('join-receipt-shape-organizer@test.local');
    const community = await targetCommunity(organizer, 'Receipt shape');

    const joinWindowId = await openWindow(organizer, community, 12);
    const joinMember = await eligibleMember(
      community,
      organizer,
      'join-receipt-shape-member@test.local',
    );
    const joinCommandId = randomUUID();
    await joinRegistration(joinMember.userId, { commandId: joinCommandId, windowId: joinWindowId });

    const joinReceipt = await client.query<{
      command_type: string;
      aggregate_id: string;
      actor_id: string;
      retention_class: string;
    }>(
      `select command_type, aggregate_id, actor_id, retention_class
         from app_private.command_receipts where command_id = $1`,
      [joinCommandId],
    );
    assert.deepEqual(joinReceipt.rows, [
      {
        command_type: 'join_registration',
        aggregate_id: joinWindowId,
        actor_id: joinMember.userId,
        retention_class: 'REGISTRATION_ENTRY',
      },
    ]);

    const addWindowId = await openWindow(organizer, community, 12);
    const rosterPlayer = await rosterOnlyPlayer(community, organizer, 'Receipt shape add target');
    const addCommandId = randomUUID();
    await addEntry(organizer, {
      commandId: addCommandId,
      windowId: addWindowId,
      playerId: rosterPlayer,
    });

    const addReceipt = await client.query<{
      command_type: string;
      aggregate_id: string;
      actor_id: string;
      retention_class: string;
    }>(
      `select command_type, aggregate_id, actor_id, retention_class
         from app_private.command_receipts where command_id = $1`,
      [addCommandId],
    );
    assert.deepEqual(addReceipt.rows, [
      {
        command_type: 'add_registration_entry',
        aggregate_id: addWindowId,
        actor_id: organizer,
        retention_class: 'REGISTRATION_ENTRY',
      },
    ]);
  });
}
