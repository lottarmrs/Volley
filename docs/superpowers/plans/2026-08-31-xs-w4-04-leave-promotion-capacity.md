# XS-W4-04 Leave, Promotion and Capacity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the Registration loop — let a member withdraw, let an organizer remove and resize,
and make every freed or added seat refill from the waitlist inside the same transaction.

**Architecture:** One migration adds a private eligibility predicate, a private promoter that fills
every free slot in FIFO order, and three public `SECURITY DEFINER` commands. Each command locks the
Session then the Window, authorizes, looks up its receipt once, gates on Session lifecycle and
Window state, mutates its target entry, calls the promoter when a seat became available, and bumps
the Window revision exactly once. No new tables, no new concurrency machinery, no read surface.

**Tech Stack:** PostgreSQL/Supabase migrations, RLS, PL/pgSQL, JSONB, Node test runner, real
PostgreSQL integration harness.

**Spec:** `docs/superpowers/specs/2026-08-31-xs-w4-04-leave-promotion-capacity-design.md`

**Architecture sources:** `docs/architecture/execution/C6.02-W3-W6-SESSION-REGISTRATION-RATING-TEAM.md`
XS-W4-04; `docs/architecture/contexts/N2.05-registration.md` N3.05.08 (Leave), N3.05.09
(Promotion), N3.05.10 (Capacity), §19 state machines, §20 commands catalog, §22 authorization
matrix, §25 transaction catalog TX-REG-003/004, §35 invariants — with
REG-INV-006/007/010/011/012/013/014/015/016/017/019/024/029/030/031/032;
`docs/architecture/catalogs/OPEN-DECISIONS.md` `OPEN-REG-002`, `OPEN-REG-003`, `OPEN-REG-006`;
`docs/architecture/adr/ADR-CATALOG.md` ADR-API-003/006;
`docs/architecture/quality/N2.20-testing-qa.md` QA-INV-003/004/006.

## Global Constraints

- ONE migration for the whole slice, created in Task 2 through
  `npx supabase migration new leave_promotion_capacity`. Task 4 **appends to that same file** — do
  not create a second migration. No new tables, no new columns.
- Lock ordering is **Session first, then Window**, in every command. Nothing enforces this and no
  isolated test can catch it; inverting it deadlocks against `close_registration`,
  `lock_registration`, `join_registration` and `add_registration_entry` on the first concurrent pair.
- Exactly ONE receipt lookup per command, placed AFTER authorization and BEFORE the target entry is
  resolved. After-authorization stops a revoked caller replaying a receipt. Before-resolution is
  required for idempotency: a successful Leave makes its own entry non-effective, so a retry that
  resolved first would raise `P0002` instead of returning the recorded result.
- No command takes an `expected_revision` and none raises `40001`. The Window's revision advances on
  every join, so a token captured at page load would be stale because of other people's
  registrations. Correctness rests on the Window row lock and the guards evaluated under it.
- **One revision bump per command, never one per promotion.** A Leave that promotes a waiter is one
  bump. A capacity increase that promotes three people is one bump. `promote_waitlist_to_capacity`
  never touches `revision`; its caller does.
- The promotion path does NOT reuse `app_private.allocate_registration_slot`. That function inserts
  a row and bumps `revision` itself. Promotion updates an existing row.
- A promoted entry KEEPS its `queue_sequence`. So do `WITHDRAWN` and `REMOVED` entries. A position
  is never reissued and history is never rewritten (`REG-INV-007`, `REG-INV-011`).
- Promotion revalidates each candidate against **that entry's own `source`**: `SELF_JOIN` needs an
  active membership plus an ACTIVE account link plus live roster standing; every other source needs
  live roster standing only. A uniform self-join rule would make the organizer-added Player that
  XS-W4-03 exists to serve permanently unpromotable.
- "Live roster standing" means a `community_players` row in the Session's Community with
  `deleted_at is null and active`, **and** the `players` row itself with `deleted_at is null and
  active`. Both halves — XS-W4-03 added the second.
- An ineligible candidate becomes `REMOVED` with `removed_at = now()` and
  `removal_reason = 'INELIGIBLE_AT_PROMOTION'`, and the walk continues. Never blocked, never silent
  (`OPEN-REG-002`, `REG-INV-014`).
- All three commands require the Session in `DRAFT` or `SCHEDULED` and the Window **not `LOCKED`**.
  Leave and Remove therefore work while the Window is `CLOSED` — that is `REG-INV-013`, not an
  oversight.
- `closes_at` is not consulted by any command in this slice. The deadline governs joining only.
- Returns are exactly `entry_status, window_revision` for Leave and Remove, and exactly
  `window_capacity, window_revision` for capacity. Nothing reveals whether a promotion happened or
  who was promoted (`REG-INV-029`).
- `registration_entries` keeps ZERO grants to `public`, `anon` and `authenticated`, RLS enabled, no
  policies. Adding any read surface would silently decide `OPEN-REG-003`.
- Receipts carry `retention_class = 'REGISTRATION_ENTRY'` and `aggregate_id = window_id`. A no-op
  records a receipt too, matching `close_registration`.
- Do NOT implement `RestoreRegistrationEntry`, `ReopenRegistration` or `FinalizeSessionRoster`. Do
  not demote a `CONFIRMED` entry under any circumstance.
- SQLSTATE convention: `23514` null argument, Session lifecycle, Window `LOCKED`, non-positive
  capacity, capacity below the live confirmed count; `42501` authorization and eligibility; `P0002`
  missing Window or no effective entry; `23505` reserved for command identity alone.
- Every `SECURITY DEFINER` function uses `set search_path = ''`, fully qualified object names, and
  explicit revokes. Public commands revoked from `public`/`anon` then granted to `authenticated`;
  private functions revoked from all three.
- Reuse and preserve the running `volley_test_pg` Docker PostgreSQL on `127.0.0.1:55432`. Never stop
  or remove it.
- No comments in application source (`CLAUDE.md`); SQL migrations and test files in this repository
  DO carry explanatory comments — follow the density of
  `supabase/migrations/20260831175307_join_registration.sql`.

## File Structure

| File | Responsibility | Tasks |
|---|---|---|
| `src/test/db/registrationLeave.dbtest.ts` | the whole slice's behavioural contract, against real PostgreSQL | 1 (create), 3 (append) |
| `supabase/migrations/<timestamp>_leave_promotion_capacity.sql` | eligibility predicate, promoter, three commands, grants | 2 (create), 4 (append) |

Nothing else changes. No TypeScript source, no application layer, no cloud service — this slice is
entirely database authority, and the client work arrives in a later wave.

---

### Task 1: Pin Leave and promotion with failing database tests

**Files:**

- Create: `src/test/db/registrationLeave.dbtest.ts`

**Interfaces:**

- Consumes: `public.create_registration_window`, `public.open_registration`,
  `public.close_registration`, `public.lock_registration` (XS-W4-02); `public.join_registration`,
  `public.add_registration_entry` (XS-W4-03); `public.create_target_session`,
  `public.cancel_target_session` (W3); the harness in `src/test/db/harness.ts`.
- Produces: the fixture vocabulary Task 3 appends to — `newUser`, `call`, `assertSqlState`,
  `targetCommunity`, `activeMembership`, `grantOrganizer`, `createTargetSession`,
  `communitySession`, `createPlayer`, `createWindow`, `transition`, `windowAt`, `forceSessionState`,
  `eligibleMember`, `rosterOnlyPlayer`, `openWindow`, `joinRegistration`, `addEntry` — all copied
  from XS-W4-03 — plus the four this task defines: `leaveRegistration`, `windowRow`, `entriesOf`,
  `fillWindow`.

- [ ] **Step 1: Build the fixture scaffold**

Copy the `before`/`after` shape and every helper listed under "Produces" from
`src/test/db/registrationJoin.dbtest.ts` (XS-W4-03), which already targets these tables and
commands. Copy them **verbatim** — including `forceSessionState` and its comment explaining why a
privileged `UPDATE` is the only way to reach `IN_PROGRESS` for a Community Session. Do **not** copy
`callFailing`; it is unused there and would reintroduce the ESLint warning that branch removed.

The file header comment must say that every test is expected to fail with `42883` (undefined
function) until Task 2 lands, except the access probes in Step 7 which are metadata-only.

Add these helpers after the copied ones:

```typescript
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
```

Read `public.registration_entries` and `public.registration_windows` in
`supabase/migrations/20260831035934_registration_schema.sql` before writing these, and confirm every
column name above exists. `queue_sequence` is `bigint`, so node-pg returns it as a **string** from a
direct column read — compare with `'1'`, not `1`.

- [ ] **Step 2: Write the Leave happy-path RED tests**

```typescript
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

  assert.equal(entries.find((row) => row.player_id === secondWaiter.playerId)?.status, 'WAITLISTED');
  assert.equal(entries.filter((row) => row.status === 'CONFIRMED').length, 2);
});
```

- [ ] **Step 3: Write the Leave rejection RED tests**

```typescript
test('leave_registration: a member with no effective entry raises P0002, and so does leaving twice', async () => {
  const organizer = await newUser(`leave-none-${randomUUID()}@test.local`);
  const community = await targetCommunity(organizer, 'Leave nothing');
  const windowId = await openWindow(organizer, community, 4);
  const member = await eligibleMember(community, organizer, `leave-none-member-${randomUUID()}@test.local`);

  const never = await leaveRegistration(member.userId, { windowId }).catch((error: Error) => error);
  assertSqlState(never, 'P0002');

  await joinRegistration(member.userId, { windowId });
  await leaveRegistration(member.userId, { windowId });
  const again = await leaveRegistration(member.userId, { windowId }).catch((error: Error) => error);
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
  const member = await eligibleMember(community, organizer, `leave-args-member-${randomUUID()}@test.local`);
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
```

- [ ] **Step 4: Write the Leave gate RED tests**

```typescript
test('leave_registration: works while the Window is CLOSED and raises 23514 while it is LOCKED', async () => {
  const organizer = await newUser(`leave-gates-${randomUUID()}@test.local`);
  const community = await targetCommunity(organizer, 'Leave gates');
  const sessionId = await communitySession(organizer, community);
  const created = await createWindow(organizer, { sessionId, capacity: 4 });
  const windowId = created.rows[0].window_id;
  let revision = created.rows[0].window_revision;
  const opened = await transition(organizer, 'open_registration', {
    windowId,
    expectedRevision: revision,
  });
  revision = opened.rows[0].window_revision;

  const stayer = await eligibleMember(community, organizer, `leave-gates-a-${randomUUID()}@test.local`);
  const goer = await eligibleMember(community, organizer, `leave-gates-b-${randomUUID()}@test.local`);
  await joinRegistration(stayer.userId, { windowId });
  await joinRegistration(goer.userId, { windowId });
  revision = (await windowRow(windowId)).revision;

  const closed = await transition(organizer, 'close_registration', {
    windowId,
    expectedRevision: revision,
  });
  revision = closed.rows[0].window_revision;

  const whileClosed = await leaveRegistration(goer.userId, { windowId });
  assert.equal(whileClosed.rows[0].entry_status, 'WITHDRAWN');
  revision = (await windowRow(windowId)).revision;

  await transition(organizer, 'lock_registration', { windowId, expectedRevision: revision });

  const whileLocked = await leaveRegistration(stayer.userId, { windowId }).catch(
    (error: Error) => error,
  );
  assertSqlState(whileLocked, '23514');
});

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
```

Read `public.cancel_target_session`'s signature in
`supabase/migrations/20260828190617_target_session_lifecycle_readiness.sql` before writing the
`CANCELLED` branch and match its parameter order exactly. If it differs from the four arguments used
above, use the real signature — the point of the branch is to reach `CANCELLED` through a real
command, not to preserve this call shape.

- [ ] **Step 5: Write the Leave idempotency and membership-asymmetry RED tests**

```typescript
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

test('leave_registration: a member who left the Community can still withdraw their own entry', async () => {
  const organizer = await newUser(`leave-exmember-${randomUUID()}@test.local`);
  const community = await targetCommunity(organizer, 'Leave ex-member');
  const windowId = await openWindow(organizer, community, 4);
  const member = await eligibleMember(community, organizer, `leave-ex-${randomUUID()}@test.local`);
  await joinRegistration(member.userId, { windowId });

  await client.query(
    `update public.community_memberships set status = 'left'
      where community_id = $1 and user_id = $2`,
    [community, member.userId],
  );

  const result = await leaveRegistration(member.userId, { windowId });
  assert.equal(result.rows[0].entry_status, 'WITHDRAWN');
});
```

Before writing the last test, read the `community_memberships` status check constraint and use a
value it actually permits. If `'left'` is not in the vocabulary, use whichever non-`'active'` value
is, and say which in a comment — the test's point is that a non-active membership does not block
Leave, not the particular word.

- [ ] **Step 6: Write the promotion-eligibility RED tests**

```typescript
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
  const holder = await eligibleMember(community, organizer, `promote-holder-${randomUUID()}@test.local`);
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

test('promotion: a waiter whose players row is soft-deleted, and one whose roster relation went inactive, are both skipped', async () => {
  for (const kind of ['player_soft_deleted', 'relation_inactive'] as const) {
    const organizer = await newUser(`promote-${kind}-${randomUUID()}@test.local`);
    const community = await targetCommunity(organizer, `Promote ${kind}`);
    const windowId = await openWindow(organizer, community, 1);
    const members = await fillWindow(windowId, community, organizer, 1, 2);
    const [holder, brokenWaiter, goodWaiter] = members;

    if (kind === 'player_soft_deleted') {
      await client.query('update public.players set deleted_at = now() where id = $1', [
        brokenWaiter.playerId,
      ]);
    } else {
      await client.query(
        `update public.community_players set status = 'inactive', active = false
          where community_id = $1 and player_id = $2`,
        [community, brokenWaiter.playerId],
      );
    }

    await leaveRegistration(holder.userId, { windowId });

    const entries = await entriesOf(windowId);
    assert.equal(
      entries.find((row) => row.player_id === brokenWaiter.playerId)?.status,
      'REMOVED',
      `${kind} waiter must be skipped`,
    );
    assert.equal(entries.find((row) => row.player_id === goodWaiter.playerId)?.status, 'CONFIRMED');
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
```

`sync_community_player_active_status` is a BEFORE INSERT/UPDATE trigger on `community_players` that
sets `active := (status = 'active')` when the previous status was null. The `relation_inactive`
branch above sets BOTH columns for that reason. After building any fixture that is supposed to be
broken, SELECT the row back and confirm it holds the values you intended — a fixture silently
repaired into an *eligible* state would make these tests pass for the wrong reason. This exact trap
cost XS-W4-03 a review round.

`trg_guard_active_player_reference` rejects INSERTING a `community_players` row that references an
already soft-deleted Player. The `player_soft_deleted` branch soft-deletes **after** the roster row
exists, which is also what `playerCloudService.softDelete` does in production.

- [ ] **Step 7: Write the access RED tests**

```typescript
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
```

The second test fails with an assertion (not `42883`) until Task 2 creates the functions — that is
correct RED, because the function's absence is exactly what it reports.

- [ ] **Step 8: Verify focused RED**

Run:

```bash
VOLLEY_TEST_DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:55432/postgres" node --import tsx --test src/test/db/registrationLeave.dbtest.ts
```

Expected: every test in the file fails. The Leave and promotion tests fail with `42883` (function
`public.leave_registration` does not exist); the second access test fails its
`assert.ok(rows.length > 0)`; the first access test PASSES already, because no grant exists yet and
none should ever exist.

Record the exact counts in the task report. If any Leave test passes, stop — it is asserting nothing.

- [ ] **Step 9: Run focused static checks and commit the RED contract**

```bash
npm run typecheck
npx eslint src/test/db/registrationLeave.dbtest.ts
npx prettier --check src/test/db/registrationLeave.dbtest.ts
```

All three must be clean — zero ESLint warnings as well as zero errors.

```bash
git add src/test/db/registrationLeave.dbtest.ts
git commit -m "test: specify Leave, promotion and the ineligible-waiter policy"
```

---

### Task 2: Implement the promoter and `leave_registration`

**Files:**

- Create: `supabase/migrations/<timestamp>_leave_promotion_capacity.sql` (exact path from the CLI)

**Interfaces:**

- Consumes: `public.current_user_active_player_id()` (XS-W2-01);
  `app_private.find_command_receipt(uuid, text, uuid)` and
  `app_private.record_command_receipt(uuid, uuid, text, uuid, jsonb, text)` (XS-W3-06);
  `public.registration_windows`, `public.registration_entries` (XS-W4-01).
- Produces: `app_private.registration_entry_still_eligible(p_entry_id uuid) returns boolean`;
  `app_private.promote_waitlist_to_capacity(p_window_id uuid) returns jsonb`;
  `public.leave_registration(p_command_id uuid, p_window_id uuid) returns table (entry_status text,
  window_revision integer)`. Task 4 calls the first two and follows the third's prologue.

- [ ] **Step 1: Create the migration through the installed CLI**

```bash
npx supabase migration new leave_promotion_capacity
```

Edit only the exact path the command prints. Do not hand-author a timestamp, and do not create a
second migration in Task 4 — that task appends to this same file.

- [ ] **Step 2: Add the per-entry eligibility predicate**

```sql
-- Revalidates one waitlisted entry at promotion time, against that entry's OWN source.
--
-- XS-W4-03 deliberately let an organizer register a Player holding no account at all -- the case
-- add_registration_entry exists for. Applying the self-join chain uniformly here would make every
-- such entry permanently unpromotable, so it would reach the waitlist and never leave it.
create function app_private.registration_entry_still_eligible(p_entry_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.registration_entries e
      join public.registration_windows w on w.id = e.registration_window_id
      join public.sessions s on s.id = w.session_id
      join public.community_players cp
        on cp.community_id = s.community_id
       and cp.player_id = e.player_id
       and cp.deleted_at is null
       and cp.active
      join public.players p
        on p.id = e.player_id
       and p.deleted_at is null
       and p.active
     where e.id = p_entry_id
       and (
         e.source <> 'SELF_JOIN'
         or exists (
           select 1
             from public.player_account_links l
             join public.community_memberships m
               on m.community_id = s.community_id
              and m.user_id = l.user_id
              and m.status = 'active'
            where l.player_id = e.player_id
              and l.status = 'ACTIVE'
         )
       )
  );
$$;

revoke all on function app_private.registration_entry_still_eligible(uuid)
  from public, anon, authenticated;
```

The `player_account_links` lookup is player-first rather than user-first, which is unambiguous
because `player_account_links_one_active_per_player` is a partial unique index on `player_id where
status = 'ACTIVE'`.

- [ ] **Step 3: Add the promoter**

```sql
-- Fills EVERY free slot, walking WAITLISTED entries in queue_sequence order.
--
-- After a Leave or a Remove of a CONFIRMED entry exactly one slot is free, so this promotes at
-- most one. After a capacity increase from 12 to 15 three are free, so it promotes the first three
-- eligible in FIFO order (REG-INV-016) -- one algorithm, not a second code path.
--
-- Assumes the caller already holds the Window row lock, and deliberately does NOT touch `revision`:
-- a leave-and-promotion is ONE logical mutation (REG-INV-013), so its caller bumps once.
--
-- It also does not reuse app_private.allocate_registration_slot, which INSERTS a row and bumps the
-- revision itself. Promotion UPDATES an existing row; the two only happen to end in CONFIRMED.
create function app_private.promote_waitlist_to_capacity(p_window_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window public.registration_windows;
  v_confirmed bigint;
  v_candidate public.registration_entries;
  v_promoted integer := 0;
  v_skipped integer := 0;
begin
  select * into v_window from public.registration_windows where id = p_window_id;
  if not found then
    raise exception 'Registration Window not found' using errcode = 'P0002';
  end if;

  select pg_catalog.count(*) into v_confirmed
    from public.registration_entries
   where registration_window_id = p_window_id
     and status = 'CONFIRMED';

  loop
    exit when v_confirmed >= v_window.capacity;

    select * into v_candidate
      from public.registration_entries
     where registration_window_id = p_window_id
       and status = 'WAITLISTED'
     order by queue_sequence
     limit 1;
    exit when not found;

    if app_private.registration_entry_still_eligible(v_candidate.id) then
      update public.registration_entries
         set status = 'CONFIRMED',
             status_changed_at = pg_catalog.now()
       where id = v_candidate.id;
      v_confirmed := v_confirmed + 1;
      v_promoted := v_promoted + 1;
    else
      -- OPEN-REG-002: skip, but never silently. The entry keeps its queue_sequence so the
      -- history stays readable, and stops being a candidate rather than being re-evaluated on
      -- every future promotion. RestoreRegistrationEntry is the audited way back.
      update public.registration_entries
         set status = 'REMOVED',
             status_changed_at = pg_catalog.now(),
             removed_at = pg_catalog.now(),
             removal_reason = 'INELIGIBLE_AT_PROMOTION'
       where id = v_candidate.id;
      v_skipped := v_skipped + 1;
    end if;
  end loop;

  return pg_catalog.jsonb_build_object('promoted', v_promoted, 'skipped', v_skipped);
end;
$$;

revoke all on function app_private.promote_waitlist_to_capacity(uuid)
  from public, anon, authenticated;
```

The loop terminates because every iteration either raises `v_confirmed` by one — bounded by
`capacity` — or takes a row out of the `WAITLISTED` set, bounded by the queue's length.

The returned `promoted`/`skipped` counts exist for the callers' own reasoning and for debugging.
They must NOT reach any command's return shape.

- [ ] **Step 4: Implement `leave_registration`**

```sql
create function public.leave_registration(
  p_command_id uuid,
  p_window_id uuid
)
returns table (entry_status text, window_revision integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.sessions;
  v_window public.registration_windows;
  v_player_id uuid;
  v_entry public.registration_entries;
  v_receipt jsonb;
  v_result jsonb;
begin
  if p_command_id is null or p_window_id is null then
    raise exception 'command_id and window_id are required' using errcode = '23514';
  end if;

  select s.* into v_session
    from public.sessions s
    join public.registration_windows w on w.session_id = s.id
   where w.id = p_window_id
   for update of s;
  if not found then
    raise exception 'Registration Window not found' using errcode = 'P0002';
  end if;

  select * into v_window from public.registration_windows where id = p_window_id for update;
  if not found then
    raise exception 'Registration Window not found' using errcode = 'P0002';
  end if;

  -- Leave deliberately does NOT require an active membership. Withdrawing is the only
  -- Registration action that is strictly de-escalating: it touches one entry, that entry belongs
  -- to the caller, and its effect is to give a seat back. Requiring membership would strand the
  -- entries of people who left the Community until the promoter turned their voluntary WITHDRAWN
  -- into an administrative REMOVED, losing the distinction REG-INV-012 exists to preserve.
  v_player_id := public.current_user_active_player_id();
  if v_player_id is null then
    raise exception 'Caller has no ACTIVE Player account link' using errcode = '42501';
  end if;

  -- Before the entry is resolved, on purpose: a successful Leave makes its own entry
  -- non-effective, so a retry that resolved first would raise P0002 instead of replaying.
  v_receipt := app_private.find_command_receipt(p_command_id, 'leave_registration', p_window_id);
  if v_receipt is not null then
    return query
      select (v_receipt ->> 'entry_status')::text, (v_receipt ->> 'window_revision')::integer;
    return;
  end if;

  if v_session.lifecycle_status not in ('DRAFT', 'SCHEDULED') then
    raise exception 'Session must be DRAFT or SCHEDULED to leave Registration'
      using errcode = '23514';
  end if;

  if v_window.status = 'LOCKED' then
    raise exception 'Registration Window is LOCKED' using errcode = '23514';
  end if;

  select * into v_entry
    from public.registration_entries
   where registration_window_id = p_window_id
     and player_id = v_player_id
     and status in ('CONFIRMED', 'WAITLISTED')
   for update;
  if not found then
    raise exception 'No effective Registration entry for the calling Player'
      using errcode = 'P0002';
  end if;

  update public.registration_entries
     set status = 'WITHDRAWN',
         status_changed_at = pg_catalog.now(),
         withdrawn_at = pg_catalog.now()
   where id = v_entry.id;

  if v_entry.status = 'CONFIRMED' then
    perform app_private.promote_waitlist_to_capacity(p_window_id);
  end if;

  update public.registration_windows
     set revision = revision + 1,
         updated_at = pg_catalog.now()
   where id = p_window_id;

  v_result := pg_catalog.jsonb_build_object(
    'entry_status', 'WITHDRAWN',
    'window_revision', v_window.revision + 1
  );
  perform app_private.record_command_receipt(
    p_command_id, (select auth.uid()), 'leave_registration', p_window_id,
    v_result, 'REGISTRATION_ENTRY'
  );

  return query
    select (v_result ->> 'entry_status')::text, (v_result ->> 'window_revision')::integer;
end;
$$;

revoke all on function public.leave_registration(uuid, uuid) from public, anon;
grant execute on function public.leave_registration(uuid, uuid) to authenticated;
```

The promoter runs only when the withdrawn entry was `CONFIRMED`. A `WAITLISTED` withdrawal frees no
seat, so calling it would be a no-op — but the explicit branch documents the semantics from §9.

- [ ] **Step 5: Verify focused GREEN and the full suite**

```bash
VOLLEY_TEST_DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:55432/postgres" node --import tsx --test src/test/db/registrationLeave.dbtest.ts
VOLLEY_TEST_DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:55432/postgres" npm run test:db
```

Expected: every test in `registrationLeave.dbtest.ts` passes, and the full suite reports 484 prior
tests plus the file's new ones, zero failures. Report the exact counts; do not round.

If a promotion test fails, read the entry rows the assertion names before changing any SQL — a
fixture that was silently repaired looks identical to a broken promoter from the assertion's side.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations
git commit -m "feat: add leave_registration and atomic waitlist promotion"
```

---

### Task 3: Pin Remove, capacity and the exit gate with failing tests

**Files:**

- Modify: `src/test/db/registrationLeave.dbtest.ts` (append; do not restructure what Task 1 wrote)

**Interfaces:**

- Consumes: every helper Task 1 produced, and `public.leave_registration` from Task 2.
- Produces: `removeEntry`, `changeCapacity` and the barrier-race cases Task 4 must satisfy.

- [ ] **Step 1: Add the two command helpers**

```typescript
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
```

- [ ] **Step 2: Write the Remove RED tests**

```typescript
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
  assert.equal(entries.find((row) => row.player_id === members[2].playerId)?.status, 'WAITLISTED');
});

test('remove_registration_entry: a null reason is accepted and a blank reason is rejected', async () => {
  const organizer = await newUser(`remove-reason-${randomUUID()}@test.local`);
  const community = await targetCommunity(organizer, 'Remove reason');
  const windowId = await openWindow(organizer, community, 4);
  const a = await eligibleMember(community, organizer, `remove-reason-a-${randomUUID()}@test.local`);
  const b = await eligibleMember(community, organizer, `remove-reason-b-${randomUUID()}@test.local`);
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
  const victim = await eligibleMember(community, organizer, `remove-victim-${randomUUID()}@test.local`);
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
  const member = await eligibleMember(community, organizer, `remove-none-m-${randomUUID()}@test.local`);
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
```

- [ ] **Step 3: Write the capacity RED tests**

```typescript
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
  assert.equal(entries.filter((row) => row.status === 'CONFIRMED').length, 3, 'nobody is demoted');
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
  assert.equal(entries.find((row) => row.player_id === members[2].playerId)?.status, 'WAITLISTED');
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

test('change_registration_capacity: a retry with the same command_id returns the recorded result and does not promote again', async () => {
  const organizer = await newUser(`capacity-retry-${randomUUID()}@test.local`);
  const community = await targetCommunity(organizer, 'Capacity retry');
  const windowId = await openWindow(organizer, community, 1);
  await fillWindow(windowId, community, organizer, 1, 3);
  const commandId = randomUUID();

  const first = await changeCapacity(organizer, { commandId, windowId, capacity: 2 });
  const afterFirst = await windowRow(windowId);
  const second = await changeCapacity(organizer, { commandId, windowId, capacity: 2 });
  const afterSecond = await windowRow(windowId);

  assert.deepEqual(second.rows[0], first.rows[0]);
  assert.equal(afterSecond.revision, afterFirst.revision);
  const entries = await entriesOf(windowId);
  assert.equal(entries.filter((row) => row.status === 'CONFIRMED').length, 2);
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
```

- [ ] **Step 4: Write the return-shape RED test**

```typescript
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
```

- [ ] **Step 5: Write the exit-gate race tests**

Copy the barrier structure from `src/test/db/registrationJoin.dbtest.ts`'s last-slot race. Three
details are load-bearing and must not be "simplified": the barrier connection is **awaited** before
either racer is dispatched, the barrier is **committed** before `Promise.all`, and each racer
commits **inside its own promise chain** — commits placed after `Promise.all` deadlock, because the
winner cannot commit while the loser holds the await open.

```typescript
test('EXIT GATE: a Leave concurrent with a Join gives the freed seat to the waiter, never to the joiner', async () => {
  const organizer = await newUser(`gate-leave-${randomUUID()}@test.local`);
  const community = await targetCommunity(organizer, 'Exit gate leave');
  const windowId = await openWindow(organizer, community, 1);
  const holder = await eligibleMember(community, organizer, `gate-holder-${randomUUID()}@test.local`);
  const waiter = await eligibleMember(community, organizer, `gate-waiter-${randomUUID()}@test.local`);
  const latecomer = await eligibleMember(community, organizer, `gate-late-${randomUUID()}@test.local`);
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
  const holder = await eligibleMember(community, organizer, `gatec-holder-${randomUUID()}@test.local`);
  const waiter = await eligibleMember(community, organizer, `gatec-waiter-${randomUUID()}@test.local`);
  const latecomer = await eligibleMember(community, organizer, `gatec-late-${randomUUID()}@test.local`);
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
```

Read `asIdentityCommitting` in `src/test/db/harness.ts` before using it here and confirm it commits
the transaction it opens. If the joiner in the capacity race can legally land BEFORE the resize —
taking the seat as `WAITLISTED` either way — the assertions above still hold, because the waiter
holds `queue_sequence` 1 and the promoter walks in that order. Do not weaken them to an either-or.

- [ ] **Step 6: Verify focused RED and commit**

```bash
VOLLEY_TEST_DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:55432/postgres" node --import tsx --test src/test/db/registrationLeave.dbtest.ts
```

Expected: every test added in this task fails with `42883` (`public.remove_registration_entry` and
`public.change_registration_capacity` do not exist), while every test from Task 1 still PASSES. A
Task 1 regression means this task broke shared fixtures — fix that before continuing.

```bash
npm run typecheck
npx eslint src/test/db/registrationLeave.dbtest.ts
npx prettier --check src/test/db/registrationLeave.dbtest.ts
git add src/test/db/registrationLeave.dbtest.ts
git commit -m "test: specify Remove, capacity change and the promotion exit gate"
```

---

### Task 4: Implement `remove_registration_entry` and `change_registration_capacity`

**Files:**

- Modify: the migration Task 2 created — **append**, do not create a second migration

**Interfaces:**

- Consumes: `app_private.promote_waitlist_to_capacity(uuid)` and the prologue shape from Task 2;
  `public.assert_target_session_write_authorized(public.sessions)` (XS-W3-02).
- Produces: `public.remove_registration_entry(p_command_id uuid, p_window_id uuid, p_player_id uuid,
  p_reason text) returns table (entry_status text, window_revision integer)`;
  `public.change_registration_capacity(p_command_id uuid, p_window_id uuid, p_capacity integer)
  returns table (window_capacity integer, window_revision integer)`.

- [ ] **Step 1: Implement `remove_registration_entry`**

```sql
create function public.remove_registration_entry(
  p_command_id uuid,
  p_window_id uuid,
  p_player_id uuid,
  p_reason text
)
returns table (entry_status text, window_revision integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.sessions;
  v_window public.registration_windows;
  v_entry public.registration_entries;
  v_receipt jsonb;
  v_result jsonb;
begin
  if p_command_id is null or p_window_id is null or p_player_id is null then
    raise exception 'command_id, window_id and player_id are required' using errcode = '23514';
  end if;

  select s.* into v_session
    from public.sessions s
    join public.registration_windows w on w.session_id = s.id
   where w.id = p_window_id
   for update of s;
  if not found then
    raise exception 'Registration Window not found' using errcode = 'P0002';
  end if;

  select * into v_window from public.registration_windows where id = p_window_id for update;
  if not found then
    raise exception 'Registration Window not found' using errcode = 'P0002';
  end if;

  perform public.assert_target_session_write_authorized(v_session);

  v_receipt := app_private.find_command_receipt(
    p_command_id, 'remove_registration_entry', p_window_id
  );
  if v_receipt is not null then
    return query
      select (v_receipt ->> 'entry_status')::text, (v_receipt ->> 'window_revision')::integer;
    return;
  end if;

  if v_session.lifecycle_status not in ('DRAFT', 'SCHEDULED') then
    raise exception 'Session must be DRAFT or SCHEDULED to remove a Registration entry'
      using errcode = '23514';
  end if;

  if v_window.status = 'LOCKED' then
    raise exception 'Registration Window is LOCKED' using errcode = '23514';
  end if;

  select * into v_entry
    from public.registration_entries
   where registration_window_id = p_window_id
     and player_id = p_player_id
     and status in ('CONFIRMED', 'WAITLISTED')
   for update;
  if not found then
    raise exception 'No effective Registration entry for Player %', p_player_id
      using errcode = 'P0002';
  end if;

  update public.registration_entries
     set status = 'REMOVED',
         status_changed_at = pg_catalog.now(),
         removed_at = pg_catalog.now(),
         removal_reason = p_reason
   where id = v_entry.id;

  if v_entry.status = 'CONFIRMED' then
    perform app_private.promote_waitlist_to_capacity(p_window_id);
  end if;

  update public.registration_windows
     set revision = revision + 1,
         updated_at = pg_catalog.now()
   where id = p_window_id;

  v_result := pg_catalog.jsonb_build_object(
    'entry_status', 'REMOVED',
    'window_revision', v_window.revision + 1
  );
  perform app_private.record_command_receipt(
    p_command_id, (select auth.uid()), 'remove_registration_entry', p_window_id,
    v_result, 'REGISTRATION_ENTRY'
  );

  return query
    select (v_result ->> 'entry_status')::text, (v_result ->> 'window_revision')::integer;
end;
$$;

revoke all on function public.remove_registration_entry(uuid, uuid, uuid, text) from public, anon;
grant execute on function public.remove_registration_entry(uuid, uuid, uuid, text) to authenticated;
```

A blank `p_reason` is rejected by the existing `registration_entries_removal_reason_check`, which
already raises `23514`. Do not add a second check for it — one rule, one place.

- [ ] **Step 2: Implement `change_registration_capacity`**

```sql
create function public.change_registration_capacity(
  p_command_id uuid,
  p_window_id uuid,
  p_capacity integer
)
returns table (window_capacity integer, window_revision integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.sessions;
  v_window public.registration_windows;
  v_confirmed bigint;
  v_receipt jsonb;
  v_result jsonb;
begin
  if p_command_id is null or p_window_id is null or p_capacity is null then
    raise exception 'command_id, window_id and capacity are required' using errcode = '23514';
  end if;

  select s.* into v_session
    from public.sessions s
    join public.registration_windows w on w.session_id = s.id
   where w.id = p_window_id
   for update of s;
  if not found then
    raise exception 'Registration Window not found' using errcode = 'P0002';
  end if;

  select * into v_window from public.registration_windows where id = p_window_id for update;
  if not found then
    raise exception 'Registration Window not found' using errcode = 'P0002';
  end if;

  perform public.assert_target_session_write_authorized(v_session);

  v_receipt := app_private.find_command_receipt(
    p_command_id, 'change_registration_capacity', p_window_id
  );
  if v_receipt is not null then
    return query
      select (v_receipt ->> 'window_capacity')::integer,
             (v_receipt ->> 'window_revision')::integer;
    return;
  end if;

  if v_session.lifecycle_status not in ('DRAFT', 'SCHEDULED') then
    raise exception 'Session must be DRAFT or SCHEDULED to change Registration capacity'
      using errcode = '23514';
  end if;

  if v_window.status = 'LOCKED' then
    raise exception 'Registration Window is LOCKED' using errcode = '23514';
  end if;

  if p_capacity <= 0 then
    raise exception 'Registration capacity must be greater than zero' using errcode = '23514';
  end if;

  if p_capacity = v_window.capacity then
    v_result := pg_catalog.jsonb_build_object(
      'window_capacity', v_window.capacity,
      'window_revision', v_window.revision
    );
    perform app_private.record_command_receipt(
      p_command_id, (select auth.uid()), 'change_registration_capacity', p_window_id,
      v_result, 'REGISTRATION_ENTRY'
    );
    return query select v_window.capacity, v_window.revision;
    return;
  end if;

  select pg_catalog.count(*) into v_confirmed
    from public.registration_entries
   where registration_window_id = p_window_id
     and status = 'CONFIRMED';

  -- REG-INV-017: refuse, and pick no victims. The documented path to a smaller Window is for the
  -- Organizer to remove entries explicitly first.
  if p_capacity < v_confirmed then
    raise exception 'Registration capacity cannot be reduced below the % confirmed entries',
      v_confirmed using errcode = '23514';
  end if;

  update public.registration_windows
     set capacity = p_capacity,
         revision = revision + 1,
         updated_at = pg_catalog.now()
   where id = p_window_id;

  -- Called unconditionally: the promoter's first exit condition makes it a no-op whenever no slot
  -- is free, so guarding on "increase" would add a branch that can never change the outcome. It
  -- must run AFTER the capacity update, because it reads capacity from the row.
  perform app_private.promote_waitlist_to_capacity(p_window_id);

  v_result := pg_catalog.jsonb_build_object(
    'window_capacity', p_capacity,
    'window_revision', v_window.revision + 1
  );
  perform app_private.record_command_receipt(
    p_command_id, (select auth.uid()), 'change_registration_capacity', p_window_id,
    v_result, 'REGISTRATION_ENTRY'
  );

  return query select p_capacity, v_window.revision + 1;
end;
$$;

revoke all on function public.change_registration_capacity(uuid, uuid, integer) from public, anon;
grant execute on function public.change_registration_capacity(uuid, uuid, integer) to authenticated;
```

- [ ] **Step 3: Verify focused GREEN and the full suite**

```bash
VOLLEY_TEST_DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:55432/postgres" node --import tsx --test src/test/db/registrationLeave.dbtest.ts
VOLLEY_TEST_DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:55432/postgres" npm run test:db
```

Expected: every test in the file passes, and the full suite reports zero failures with 484 tests
from prior slices plus this file's. Report the exact numbers.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations
git commit -m "feat: add remove_registration_entry and change_registration_capacity"
```

---

### Task 5: Verify the XS-W4-04 exit gate and preserve branch evidence

**Files:** none — this task changes no source. It produces evidence.

**Interfaces:**

- Consumes: everything Tasks 1-4 produced.
- Produces: the verification record the final whole-branch review reads.

- [ ] **Step 1: Run the changed-file quality gates**

```bash
npx eslint src/test/db/registrationLeave.dbtest.ts
npx prettier --check src/test/db/registrationLeave.dbtest.ts
```

Both must be silent — zero errors AND zero warnings. Do NOT run `npm run lint:eslint` or
`npm run format:check` across the repository and treat their output as this branch's: they fail
repo-wide on untracked vendored directories (`.agent/`, `.claude/`, `.gemini/`, `.github/skills/`)
and the sibling `.worktrees/` checkout. Prove the branch is clean by showing that
`git diff exec/c6-w4-03-join-registration...HEAD --name-only` contains no path either tool reports.

- [ ] **Step 2: Run the repository gates in CI order**

```bash
npm run typecheck
npm run test:unit
npm run test:ui
npm run build
```

Expected: typecheck clean, 920 unit tests passing, 245 UI tests passing, build succeeding.
`src/hooks/useConnectivity.spec.tsx` → "onlineAt muda quando a rede volta" is a known pre-existing
flake caused by two real `Date.now()` calls landing in the same millisecond; it is not this branch's
and a fix exists on `fix/flaky-useconnectivity-onlineat`. If it fails, re-run that file alone and
report both results rather than treating it as a branch regression.

- [ ] **Step 3: Run the complete database suite twice from independent rebuilds**

```bash
VOLLEY_TEST_DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:55432/postgres" npm run test:db
VOLLEY_TEST_DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:55432/postgres" npm run test:db
```

Both runs must report identical totals and zero failures. Two runs matter because every run rebuilds
the schema from zero: a migration that only applies onto an already-migrated database would pass
once and fail the second time.

Record both durations. The suite was ~80s at the end of XS-W4-03; the two barrier races here add
lock-waiting time, so a moderate increase is expected and a large one is worth reporting.

- [ ] **Step 4: Inspect branch and container state**

```bash
git status --short
git log --oneline exec/c6-w4-03-join-registration..HEAD
git diff --check exec/c6-w4-03-join-registration...HEAD
docker ps --filter name=volley_test_pg --format '{{.Names}} {{.Status}}'
```

Expected: a clean tree, four commits, no whitespace damage, and `volley_test_pg` still running. Do
not stop or remove the container.

- [ ] **Step 5: Review the exit gate against the spec**

Confirm, quoting the test output rather than asserting it:

1. a Leave concurrent with a Join gives the freed seat to the waiter and leaves the joiner
   `WAITLISTED` (`REG-INV-015`);
2. a capacity increase concurrent with a Join does the same;
3. an ineligible head of the queue becomes `REMOVED` with
   `removal_reason = 'INELIGIBLE_AT_PROMOTION'`, keeps its `queue_sequence`, and does not block the
   next eligible waiter (`OPEN-REG-002`, `REG-INV-014`);
4. an `ORGANIZER_ADDED` waiter with no account link is promoted (the asymmetry a uniform rule would
   break);
5. every command bumps `revision` exactly once, including one that promotes three people;
6. `registration_entries` still has zero grants, and neither `app_private` function is executable by
   `public`, `anon` or `authenticated`;
7. no command takes an `expected_revision` and none raises `40001`.

Report each as pass or fail with the evidence. A failure here is a spec violation, not a test bug.
