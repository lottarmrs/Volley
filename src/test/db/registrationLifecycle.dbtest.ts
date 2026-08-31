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
 * Contract tests for the Registration lifecycle commands (XS-W4-02 task 2).
 *
 * `public.create_registration_window`, `public.open_registration`, `public.close_registration`
 * and `public.lock_registration` move a `registration_windows` row through
 * `DRAFT -> OPEN -> CLOSED -> LOCKED`, implemented in
 * `20260831132100_registration_lifecycle_commands.sql`. The suite below pins their creation
 * shape, transition rules, idempotency, authorization, Session gate, concurrency and receipt
 * behavior.
 */

if (!isTestDatabaseConfigured()) {
  test(`registration lifecycle requires ${TEST_DATABASE_URL_VAR}`, () => {
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

  // ── Verbatim fixture helpers (from registrationSchema.dbtest.ts, XS-W4-01 task 1) ────────

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

  // NOTE: createPlayer is deliberately NOT reproduced here. Nothing in this suite touches
  // registration_entries or players -- these four commands operate on the Window aggregate
  // only -- so copying it verbatim would only add dead code.

  // ── Registration lifecycle command helpers (brief-supplied shape) ────────────────────────

  interface WindowCommandRow extends QueryResultRow {
    window_revision: number;
  }
  interface CreateWindowRow extends WindowCommandRow {
    window_id: string;
  }

  type WindowStatus = 'DRAFT' | 'OPEN' | 'CLOSED' | 'LOCKED';
  type TransitionCommand = 'open_registration' | 'close_registration' | 'lock_registration';
  type LifecycleCommand = 'create_registration_window' | TransitionCommand;

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

  async function windowRow(windowId: string) {
    const { rows } = await client.query<{
      status: string;
      revision: number;
      capacity: number;
      next_queue_sequence: string;
      opened_at: string | null;
      closed_at: string | null;
      locked_at: string | null;
      created_by_user_id: string | null;
    }>(
      `select status, revision, capacity, next_queue_sequence, opened_at, closed_at, locked_at,
              created_by_user_id
         from public.registration_windows where id = $1`,
      [windowId],
    );
    return rows;
  }

  // Drives a Window to a chosen state via the real commands, since most tests need one there.
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

  // Uniform invoker over all four commands, used by the authorization and Session-gate suites,
  // which pin the same property across every command.
  async function invokeLifecycleCommand(
    name: LifecycleCommand,
    actorId: string | null,
    ctx: { sessionId: string; windowId: string; revision: number },
  ) {
    if (name === 'create_registration_window') {
      return createWindow(actorId, { sessionId: ctx.sessionId });
    }
    return transition(actorId, name, { windowId: ctx.windowId, expectedRevision: ctx.revision });
  }

  function precursorFor(name: LifecycleCommand): 'NONE' | WindowStatus {
    switch (name) {
      case 'create_registration_window':
        return 'NONE';
      case 'open_registration':
        return 'DRAFT';
      case 'close_registration':
        return 'OPEN';
      case 'lock_registration':
        return 'CLOSED';
    }
  }

  const ALL_COMMANDS: LifecycleCommand[] = [
    'create_registration_window',
    'open_registration',
    'close_registration',
    'lock_registration',
  ];

  // Privileged direct insert, used ONLY for the Step 7 exit-gate fixture. The exit-gate test is
  // stronger when it does not depend on create_registration_window: it is proving that a direct
  // browser UPDATE is rejected, and that guarantee comes from the PREVIOUS slice's (W4-01)
  // absent UPDATE grant on registration_windows, not from anything in this migration. Standing
  // up the fixture with a command under test here would muddy which slice the assertion pins.
  async function insertWindowPrivileged(input: { sessionId: string }): Promise<string> {
    const id = randomUUID();
    await client.query(
      `insert into public.registration_windows (id, session_id, status, capacity)
       values ($1, $2, 'DRAFT', 12)`,
      [id, input.sessionId],
    );
    return id;
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

  // ── Step 1 (prologue): null argument guard ─────────────────────────────────────────────

  for (const name of ALL_COMMANDS) {
    test(`${name}: a null command_id raises 23514, not the receipt substrate's 23502`, async () => {
      const organizer = await newUser(`lifecycle-null-command-id-${name}@test.local`);
      const community = await targetCommunity(organizer, `Null command id ${name}`);
      const sessionId = await communitySession(organizer, community);

      const result =
        name === 'create_registration_window'
          ? await call(
              organizer,
              `select * from public.create_registration_window($1, $2, $3, $4, $5::timestamptz)`,
              [null, randomUUID(), sessionId, 12, null],
            ).catch((error: Error) => error)
          : await call(organizer, `select * from public.${name}($1, $2, $3)`, [
              null,
              randomUUID(),
              0,
            ]).catch((error: Error) => error);
      assertSqlState(result, '23514');
    });

    test(`${name}: a null window_id raises 23514, not the receipt substrate's 23502`, async () => {
      const organizer = await newUser(`lifecycle-null-window-id-${name}@test.local`);
      const community = await targetCommunity(organizer, `Null window id ${name}`);
      const sessionId = await communitySession(organizer, community);

      const result =
        name === 'create_registration_window'
          ? await call(
              organizer,
              `select * from public.create_registration_window($1, $2, $3, $4, $5::timestamptz)`,
              [randomUUID(), null, sessionId, 12, null],
            ).catch((error: Error) => error)
          : await call(organizer, `select * from public.${name}($1, $2, $3)`, [
              randomUUID(),
              null,
              0,
            ]).catch((error: Error) => error);
      assertSqlState(result, '23514');
    });
  }

  // ── Step 2: creation ───────────────────────────────────────────────────────────────────

  test('create_registration_window returns the supplied window_id and window_revision = 1, and persists DRAFT/1/1/capacity/created_by_user_id = caller (ADR-API-003)', async () => {
    const organizer = await newUser('lifecycle-create-basic@test.local');
    const community = await targetCommunity(organizer, 'Create basic');
    const sessionId = await communitySession(organizer, community);
    const windowId = randomUUID();

    const created = await createWindow(organizer, { windowId, sessionId, capacity: 20 });
    assert.deepEqual(created.rows, [{ window_id: windowId, window_revision: 1 }]);

    const rows = await windowRow(windowId);
    assert.deepEqual(rows, [
      {
        status: 'DRAFT',
        revision: 1,
        capacity: 20,
        next_queue_sequence: '1',
        opened_at: null,
        closed_at: null,
        locked_at: null,
        created_by_user_id: organizer,
      },
    ]);
  });

  test('a supplied closes_at round-trips and a null closes_at stays null', async () => {
    const organizer = await newUser('lifecycle-closes-at@test.local');
    const community = await targetCommunity(organizer, 'Closes at');
    const withClosesSession = await communitySession(organizer, community, 'Closes at A');
    const withoutClosesSession = await communitySession(organizer, community, 'Closes at B');

    const closesAt = '2030-06-01T12:00:00.000Z';
    const withCloses = await createWindow(organizer, { sessionId: withClosesSession, closesAt });
    const withClosesRow = await client.query<{ closes_at: string | null }>(
      'select closes_at from public.registration_windows where id = $1',
      [withCloses.rows[0].window_id],
    );
    assert.equal(new Date(withClosesRow.rows[0].closes_at as string).toISOString(), closesAt);

    const withoutCloses = await createWindow(organizer, {
      sessionId: withoutClosesSession,
      closesAt: null,
    });
    const withoutClosesRow = await client.query<{ closes_at: string | null }>(
      'select closes_at from public.registration_windows where id = $1',
      [withoutCloses.rows[0].window_id],
    );
    assert.equal(withoutClosesRow.rows[0].closes_at, null);
  });

  test('creating a second Window for a Session that already has one raises 23514, not 23505 (W4-01 unique session_id)', async () => {
    const organizer = await newUser('lifecycle-create-second-window@test.local');
    const community = await targetCommunity(organizer, 'Second window');
    const sessionId = await communitySession(organizer, community);
    await createWindow(organizer, { sessionId });

    const second = await createWindow(organizer, { sessionId }).catch((error: Error) => error);
    assertSqlState(second, '23514');
  });

  test("reusing a window_id across two different Sessions raises 23514, not the primary key's raw 23505", async () => {
    const organizer = await newUser('lifecycle-create-reused-window-id@test.local');
    const community = await targetCommunity(organizer, 'Reused window id');
    const firstSessionId = await communitySession(organizer, community, 'Reused window id A');
    const secondSessionId = await communitySession(organizer, community, 'Reused window id B');
    const windowId = randomUUID();
    await createWindow(organizer, { windowId, sessionId: firstSessionId });

    const collision = await createWindow(organizer, { windowId, sessionId: secondSessionId }).catch(
      (error: Error) => error,
    );
    assertSqlState(collision, '23514');
  });

  test('create_registration_window does not change sessions.revision; the Window is its own aggregate root', async () => {
    const organizer = await newUser('lifecycle-create-session-revision@test.local');
    const community = await targetCommunity(organizer, 'Session revision');
    const sessionId = await communitySession(organizer, community);

    const before = await client.query<{ revision: number }>(
      'select revision from public.sessions where id = $1',
      [sessionId],
    );
    await createWindow(organizer, { sessionId });
    const after = await client.query<{ revision: number }>(
      'select revision from public.sessions where id = $1',
      [sessionId],
    );
    assert.equal(after.rows[0].revision, before.rows[0].revision);
  });

  // ── Step 3: transitions ────────────────────────────────────────────────────────────────

  test("the happy path create -> open -> close -> lock advances window_revision by exactly one each step and sets ONLY that step's timestamp", async () => {
    const organizer = await newUser('lifecycle-happy-path@test.local');
    const community = await targetCommunity(organizer, 'Happy path');
    const sessionId = await communitySession(organizer, community);

    const created = await createWindow(organizer, { sessionId });
    const windowId = created.rows[0].window_id;
    assert.equal(created.rows[0].window_revision, 1);
    let revision = created.rows[0].window_revision;

    const opened = await transition(organizer, 'open_registration', {
      windowId,
      expectedRevision: revision,
    });
    assert.equal(opened.rows[0].window_revision, revision + 1);
    revision = opened.rows[0].window_revision;
    let rows = await windowRow(windowId);
    assert.equal(rows[0].status, 'OPEN');
    assert.notEqual(rows[0].opened_at, null);
    assert.equal(rows[0].closed_at, null);
    assert.equal(rows[0].locked_at, null);

    const closed = await transition(organizer, 'close_registration', {
      windowId,
      expectedRevision: revision,
    });
    assert.equal(closed.rows[0].window_revision, revision + 1);
    revision = closed.rows[0].window_revision;
    rows = await windowRow(windowId);
    assert.equal(rows[0].status, 'CLOSED');
    assert.notEqual(rows[0].opened_at, null);
    assert.notEqual(rows[0].closed_at, null);
    assert.equal(rows[0].locked_at, null);

    const locked = await transition(organizer, 'lock_registration', {
      windowId,
      expectedRevision: revision,
    });
    assert.equal(locked.rows[0].window_revision, revision + 1);
    rows = await windowRow(windowId);
    assert.equal(rows[0].status, 'LOCKED');
    assert.notEqual(rows[0].opened_at, null);
    assert.notEqual(rows[0].closed_at, null);
    assert.notEqual(rows[0].locked_at, null);
  });

  test('every disallowed lifecycle transition raises 23514', async () => {
    const organizer = await newUser('lifecycle-disallowed-transitions@test.local');
    const community = await targetCommunity(organizer, 'Disallowed transitions');

    const cases: Array<{ from: WindowStatus; command: TransitionCommand }> = [
      { from: 'DRAFT', command: 'close_registration' },
      { from: 'DRAFT', command: 'lock_registration' },
      { from: 'OPEN', command: 'lock_registration' },
      { from: 'CLOSED', command: 'open_registration' },
      { from: 'LOCKED', command: 'open_registration' },
      { from: 'LOCKED', command: 'close_registration' },
    ];

    for (const [index, { from, command }] of cases.entries()) {
      const sessionId = await communitySession(organizer, community, `Disallowed ${index}`);
      const windowId = await windowAt(organizer, sessionId, from);
      const rows = await windowRow(windowId);
      const result = await transition(organizer, command, {
        windowId,
        expectedRevision: rows[0].revision,
      }).catch((error: Error) => error);
      assertSqlState(result, '23514');
    }
  });

  // ── Step 4: idempotency ────────────────────────────────────────────────────────────────

  test('replaying open_registration with the same command_id but a stale expected_revision returns the identical row instead of 40001 (REG-INV-031)', async () => {
    const organizer = await newUser('lifecycle-idempotent-stale@test.local');
    const community = await targetCommunity(organizer, 'Idempotent stale');
    const sessionId = await communitySession(organizer, community);
    const created = await createWindow(organizer, { sessionId });
    const windowId = created.rows[0].window_id;
    const originalRevision = created.rows[0].window_revision;
    const commandId = randomUUID();

    const first = await transition(organizer, 'open_registration', {
      commandId,
      windowId,
      expectedRevision: originalRevision,
    });

    const replay = await transition(organizer, 'open_registration', {
      commandId,
      windowId,
      expectedRevision: originalRevision,
    });

    assert.deepEqual(replay.rows, first.rows);
  });

  const TRANSITION_COMMANDS: TransitionCommand[] = [
    'open_registration',
    'close_registration',
    'lock_registration',
  ];

  for (const command of TRANSITION_COMMANDS) {
    test(`calling ${command} again with a FRESH command_id and the current revision does not bump revision a second time (REG-INV-032)`, async () => {
      const organizer = await newUser(`lifecycle-idempotent-fresh-${command}@test.local`);
      const community = await targetCommunity(organizer, `Idempotent fresh ${command}`);
      const sessionId = await communitySession(organizer, community);
      const precursor = precursorFor(command) as WindowStatus;
      const windowId = await windowAt(organizer, sessionId, precursor);
      const before = await windowRow(windowId);

      const first = await transition(organizer, command, {
        windowId,
        expectedRevision: before[0].revision,
      });
      const revisionAfterFirst = first.rows[0].window_revision;

      const secondCall = await transition(organizer, command, {
        windowId,
        expectedRevision: revisionAfterFirst,
      });

      assert.equal(secondCall.rows[0].window_revision, revisionAfterFirst);
    });
  }

  test('reusing an open_registration command_id on a DIFFERENT Window raises 23505', async () => {
    const organizer = await newUser('lifecycle-idempotent-cross-aggregate@test.local');
    const community = await targetCommunity(organizer, 'Cross aggregate');
    const firstSessionId = await communitySession(organizer, community, 'Cross aggregate A');
    const secondSessionId = await communitySession(organizer, community, 'Cross aggregate B');
    const firstWindow = await createWindow(organizer, { sessionId: firstSessionId });
    const secondWindow = await createWindow(organizer, { sessionId: secondSessionId });

    const commandId = randomUUID();
    await transition(organizer, 'open_registration', {
      commandId,
      windowId: firstWindow.rows[0].window_id,
      expectedRevision: firstWindow.rows[0].window_revision,
    });

    const collision = await transition(organizer, 'open_registration', {
      commandId,
      windowId: secondWindow.rows[0].window_id,
      expectedRevision: secondWindow.rows[0].window_revision,
    }).catch((error: Error) => error);
    assertSqlState(collision, '23505');
  });

  test('reusing an open_registration command_id on close_registration for the same Window raises 23505', async () => {
    const organizer = await newUser('lifecycle-idempotent-cross-command@test.local');
    const community = await targetCommunity(organizer, 'Cross command');
    const sessionId = await communitySession(organizer, community);
    const created = await createWindow(organizer, { sessionId });
    const windowId = created.rows[0].window_id;

    const commandId = randomUUID();
    const opened = await transition(organizer, 'open_registration', {
      commandId,
      windowId,
      expectedRevision: created.rows[0].window_revision,
    });

    const collision = await transition(organizer, 'close_registration', {
      commandId,
      windowId,
      expectedRevision: opened.rows[0].window_revision,
    }).catch((error: Error) => error);
    assertSqlState(collision, '23505');
  });

  // ── Step 5: authorization ──────────────────────────────────────────────────────────────

  async function authorizationFixture(precursor: 'NONE' | WindowStatus, label: string) {
    const suffix = randomUUID();
    const assignedOrganizer = await newUser(
      `lifecycle-auth-assigned-${label}-${suffix}@test.local`,
    );
    const otherOrganizer = await newUser(`lifecycle-auth-other-${label}-${suffix}@test.local`);
    const outsider = await newUser(`lifecycle-auth-outsider-${label}-${suffix}@test.local`);
    const community = await targetCommunity(assignedOrganizer, `Auth ${label}`);
    await activeMembership(community, otherOrganizer);
    await grantOrganizer(community, otherOrganizer);
    const sessionId = await communitySession(assignedOrganizer, community, `Auth session ${label}`);

    let windowId = '';
    let revision = 0;
    if (precursor !== 'NONE') {
      windowId = await windowAt(assignedOrganizer, sessionId, precursor);
      const rows = await windowRow(windowId);
      revision = rows[0].revision;
    }
    return { assignedOrganizer, otherOrganizer, outsider, sessionId, windowId, revision };
  }

  for (const name of ALL_COMMANDS) {
    const precursor = precursorFor(name);

    test(`${name}: an anonymous caller receives 42501`, async () => {
      const fixture = await authorizationFixture(precursor, `${name}-anon`);
      const result = await invokeLifecycleCommand(name, null, fixture).catch(
        (error: Error) => error,
      );
      assertSqlState(result, '42501');
    });

    test(`${name}: an outsider with no Community relationship receives 42501`, async () => {
      const fixture = await authorizationFixture(precursor, `${name}-outsider`);
      const result = await invokeLifecycleCommand(name, fixture.outsider, fixture).catch(
        (error: Error) => error,
      );
      assertSqlState(result, '42501');
    });

    test(`${name}: a Community member holding ORGANIZER responsibility but no Session organizer assignment receives 42501`, async () => {
      const fixture = await authorizationFixture(precursor, `${name}-no-assignment`);
      const result = await invokeLifecycleCommand(name, fixture.otherOrganizer, fixture).catch(
        (error: Error) => error,
      );
      assertSqlState(result, '42501');
    });

    test(`${name}: the assigned organizer succeeds`, async () => {
      const fixture = await authorizationFixture(precursor, `${name}-assigned`);
      const result = await invokeLifecycleCommand(name, fixture.assignedOrganizer, fixture);
      assert.equal(result.rows.length, 1);
    });
  }

  test('replaying a command_id as a now-revoked organizer raises 42501, not 23505 (single-lookup placement)', async () => {
    const organizer = await newUser('lifecycle-single-lookup@test.local');
    const community = await targetCommunity(organizer, 'Single lookup');
    const sessionId = await communitySession(organizer, community);
    const created = await createWindow(organizer, { sessionId });
    const windowId = created.rows[0].window_id;

    const commandId = randomUUID();
    await transition(organizer, 'open_registration', {
      commandId,
      windowId,
      expectedRevision: created.rows[0].window_revision,
    });

    await client.query(
      'update public.session_organizer_assignments set revoked_at = now() where session_id = $1',
      [sessionId],
    );

    const replay = await transition(organizer, 'open_registration', {
      commandId,
      windowId,
      expectedRevision: created.rows[0].window_revision,
    }).catch((error: Error) => error);
    assertSqlState(replay, '42501');
  });

  test('BOLA: an organizer of one Community cannot call open_registration against a real Window belonging to a second Community (QA-INV-006)', async () => {
    const firstOrganizer = await newUser('lifecycle-bola-first@test.local');
    const secondOrganizer = await newUser('lifecycle-bola-second@test.local');
    const firstCommunity = await targetCommunity(firstOrganizer, 'BOLA first');
    await communitySession(firstOrganizer, firstCommunity, 'BOLA first session');

    const secondCommunity = await targetCommunity(secondOrganizer, 'BOLA second');
    const secondSessionId = await communitySession(
      secondOrganizer,
      secondCommunity,
      'BOLA second session',
    );
    const secondWindowId = await windowAt(secondOrganizer, secondSessionId, 'DRAFT');
    const rows = await windowRow(secondWindowId);

    const crossCommunity = await transition(firstOrganizer, 'open_registration', {
      windowId: secondWindowId,
      expectedRevision: rows[0].revision,
    }).catch((error: Error) => error);
    assertSqlState(crossCommunity, '42501');
  });

  // ── Step 6: Session gate, stale revision and concurrency ──────────────────────────────

  const TERMINAL_STATES: Array<'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED'> = [
    'IN_PROGRESS',
    'COMPLETED',
    'CANCELLED',
  ];

  for (const name of ALL_COMMANDS) {
    const precursor = precursorFor(name);
    for (const sessionState of TERMINAL_STATES) {
      test(`${name} raises 23514 when the Session is ${sessionState}`, async () => {
        const suffix = randomUUID();
        const organizer = await newUser(
          `lifecycle-gate-${name}-${sessionState}-${suffix}@test.local`,
        );
        const community = await targetCommunity(organizer, `Gate ${name} ${sessionState}`);
        const sessionId = await communitySession(organizer, community);

        let windowId = '';
        let revision = 0;
        if (precursor !== 'NONE') {
          windowId = await windowAt(organizer, sessionId, precursor);
          const rows = await windowRow(windowId);
          revision = rows[0].revision;
        }

        if (sessionState === 'CANCELLED') {
          // cancel_target_session is a supported command that works from DRAFT and
          // SCHEDULED -- prefer it over a forced UPDATE, per the brief.
          await call(organizer, 'select * from public.cancel_target_session($1, $2, $3, $4)', [
            randomUUID(),
            sessionId,
            1,
            null,
          ]);
        } else {
          await forceSessionState(sessionId, sessionState);
        }

        const result = await invokeLifecycleCommand(name, organizer, {
          sessionId,
          windowId,
          revision,
        }).catch((error: Error) => error);
        assertSqlState(result, '23514');
      });
    }
  }

  test('open_registration with expected_revision one lower than current raises 40001', async () => {
    const organizer = await newUser('lifecycle-stale-revision@test.local');
    const community = await targetCommunity(organizer, 'Stale revision');
    const sessionId = await communitySession(organizer, community);
    const created = await createWindow(organizer, { sessionId });
    const windowId = created.rows[0].window_id;

    const stale = await transition(organizer, 'open_registration', {
      windowId,
      expectedRevision: created.rows[0].window_revision - 1,
    }).catch((error: Error) => error);
    assertSqlState(stale, '40001');
  });

  async function beginAsIdentity(db: PoolClient, userId: string): Promise<void> {
    await db.query('select set_config($1, $2, true)', ['request.jwt.claim.sub', userId]);
    await db.query('select set_config($1, $2, true)', ['request.jwt.claim.role', 'authenticated']);
    await db.query('select set_config($1, $2, true)', [
      'request.jwt.claims',
      JSON.stringify({ sub: userId, role: 'authenticated' }),
    ]);
    await db.query('set local role authenticated');
  }

  // Copies the last-slot racer structure from registrationSchema.dbtest.ts, including its
  // barrier connection. Two things here are load-bearing and hard-won:
  //   * each racer commits INSIDE its own promise chain -- a commit placed after Promise.all
  //     would deadlock, because the winner cannot commit while the loser holds the await open;
  //   * the barrier connection takes the Window row lock first and holds it, so both racers are
  //     dispatched together and genuinely queue behind the SAME lock before it releases. Without
  //     it this test would pass by timing rather than by construction.
  test('two concurrent open_registration calls on the same DRAFT Window, same expected_revision, different command ids, serialize to revision = 2 (QA-INV-008)', async () => {
    const organizer = await newUser('lifecycle-concurrency@test.local');
    const community = await targetCommunity(organizer, 'Concurrency');
    const sessionId = await communitySession(organizer, community);
    const created = await createWindow(organizer, { sessionId });
    const windowId = created.rows[0].window_id;
    const expectedRevision = created.rows[0].window_revision;

    const a = await pool.connect();
    const b = await pool.connect();
    const barrier = await pool.connect();
    try {
      await a.query('begin');
      await beginAsIdentity(a, organizer);
      await b.query('begin');
      await beginAsIdentity(b, organizer);

      await barrier.query('begin');
      await barrier.query('select 1 from public.registration_windows where id = $1 for update', [
        windowId,
      ]);

      const race = (db: PoolClient) =>
        db
          .query<WindowCommandRow>('select * from public.open_registration($1, $2, $3)', [
            randomUUID(),
            windowId,
            expectedRevision,
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

      for (const outcome of outcomes) {
        if (outcome instanceof Error) {
          assertSqlState(outcome, '40001');
        }
      }
      const successes = outcomes.filter(
        (outcome): outcome is WindowCommandRow => !(outcome instanceof Error),
      );
      assert.ok(successes.length >= 1, 'at least one racer must perform or observe the transition');
      for (const s of successes) assert.equal(s.window_revision, 2);

      const finalRow = await windowRow(windowId);
      assert.equal(finalRow[0].status, 'OPEN');
      assert.equal(finalRow[0].revision, 2);
    } finally {
      await a.query('rollback').catch(() => undefined);
      await b.query('rollback').catch(() => undefined);
      await barrier.query('rollback').catch(() => undefined);
      a.release();
      b.release();
      barrier.release();
    }
  });

  // ── Step 7: exit gate and receipt shape ────────────────────────────────────────────────

  test('EXIT GATE: an authenticated assigned organizer cannot UPDATE registration_windows.status directly (42501)', async () => {
    const organizer = await newUser('lifecycle-exit-gate@test.local');
    const community = await targetCommunity(organizer, 'Exit gate');
    const sessionId = await communitySession(organizer, community);
    const windowId = await insertWindowPrivileged({ sessionId });

    const result = await callFailing(
      organizer,
      `update public.registration_windows set status = 'OPEN' where id = $1`,
      [windowId],
    );
    assertSqlState(result, '42501');
  });

  test('every command records an app_private.command_receipts row with command_type, aggregate_id, actor_id and retention_class = REGISTRATION_LIFECYCLE', async () => {
    const organizer = await newUser('lifecycle-receipt-shape@test.local');
    const community = await targetCommunity(organizer, 'Receipt shape');

    for (const [index, name] of ALL_COMMANDS.entries()) {
      const precursor = precursorFor(name);
      const sessionId = await communitySession(organizer, community, `Receipt ${index}`);

      let windowId = '';
      let revision = 0;
      if (precursor !== 'NONE') {
        windowId = await windowAt(organizer, sessionId, precursor);
        const rows = await windowRow(windowId);
        revision = rows[0].revision;
      }

      const commandId = randomUUID();
      const result =
        name === 'create_registration_window'
          ? await createWindow(organizer, { commandId, sessionId })
          : await transition(organizer, name, { commandId, windowId, expectedRevision: revision });
      const finalWindowId =
        name === 'create_registration_window'
          ? (result.rows[0] as CreateWindowRow).window_id
          : windowId;

      const receipt = await client.query<{
        command_type: string;
        aggregate_id: string;
        actor_id: string;
        retention_class: string;
      }>(
        `select command_type, aggregate_id, actor_id, retention_class
           from app_private.command_receipts where command_id = $1`,
        [commandId],
      );
      assert.deepEqual(receipt.rows, [
        {
          command_type: name,
          aggregate_id: finalWindowId,
          actor_id: organizer,
          retention_class: 'REGISTRATION_LIFECYCLE',
        },
      ]);
    }
  });

  test('a command that fails its Session gate leaves no receipt row, and the Window revision and timestamp stay unchanged (QA-INV-012)', async () => {
    const organizer = await newUser('lifecycle-rollback@test.local');
    const community = await targetCommunity(organizer, 'Rollback');
    const sessionId = await communitySession(organizer, community);
    const windowId = await windowAt(organizer, sessionId, 'DRAFT');
    const before = await windowRow(windowId);

    await forceSessionState(sessionId, 'IN_PROGRESS');

    const commandId = randomUUID();
    const failed = await transition(organizer, 'open_registration', {
      commandId,
      windowId,
      expectedRevision: before[0].revision,
    }).catch((error: Error) => error);
    assertSqlState(failed, '23514');

    const receipt = await client.query(
      'select 1 from app_private.command_receipts where command_id = $1',
      [commandId],
    );
    assert.equal(receipt.rows.length, 0);

    const after = await windowRow(windowId);
    assert.deepEqual(after, before);
  });
}
