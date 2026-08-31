# XS-W4-03 JoinRegistration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an eligible member register themselves without naming a Player, and let an assigned
organizer register a Player who may have no account, both delegating the capacity and FIFO decision
to the allocator that already owns it.

**Architecture:** One migration adds a private member-eligibility predicate and two public
`SECURITY DEFINER` commands. Each locks the Session then the Window, authorizes, looks up its
receipt once, gates on Session lifecycle and Window state, resolves and validates the Player, and
then hands the entire capacity and FIFO decision to `app_private.allocate_registration_slot`. No new
tables and no new concurrency machinery.

**Tech Stack:** PostgreSQL/Supabase migrations, RLS, PL/pgSQL, JSONB, Node test runner, real
PostgreSQL integration harness.

**Spec:** `docs/superpowers/specs/2026-08-31-xs-w4-03-join-registration-design.md`

**Architecture sources:** `docs/architecture/execution/C6.02-W3-W6-SESSION-REGISTRATION-RATING-TEAM.md`
XS-W4-03; `docs/architecture/contexts/N2.05-registration.md` N3.05.03–07 and N3.05.16, with
REG-INV-004/005/006/007/010/018/019/027/030/031/032;
`docs/architecture/matrices/C5.02-COMMAND-QUERY-TRANSACTION-MATRIX.md` `JoinRegistration`;
`docs/architecture/matrices/C5.03-CAPABILITY-SECURITY-PRIVACY-MATRIX.md` line 171;
`docs/architecture/adr/ADR-CATALOG.md` ADR-API-003/006;
`docs/architecture/quality/N2.20-testing-qa.md` QA-INV-004/005/006/008/009/010/012.

## Global Constraints

- One migration only, created through `npx supabase migration new join_registration`. Edit only the
  exact path the CLI prints. No new tables.
- `join_registration` accepts NO player id, NO source and NO queue position. `REG-INV-005` forbids a
  client naming a Player for a self-join; `ADR-API-003` requires a server-derived actor.
- Neither command takes an `expected_revision`, and neither raises `40001`. The Window's revision
  moves on every join, so holding one would make a member conflict over other people's joins.
- The return exposes exactly `entry_status` and `window_revision`. No `queue_sequence`, no counts, no
  player id — that is what keeps `OPEN-REG-003` open.
- Lock ordering is Session first, then Window, matching W4-02 and keeping the order XS-W4-05 needs.
- Exactly ONE receipt lookup per command, placed AFTER authorization, so a revoked caller cannot
  replay a receipt and an unauthorized caller gets `42501` rather than a `23505`.
- Both commands require Window `status = 'OPEN'` and the Session in `DRAFT` or `SCHEDULED`.
- `closes_at` binds `join_registration` only. `add_registration_entry` ignores it deliberately.
- Self-join requires an active membership, an ACTIVE account link, AND a live `community_players`
  relation. Organizer-add requires only the live relation — the added Player may have no account.
  "Live" means `deleted_at is null` and `active`.
- Eligibility failures raise `42501` in both commands, and the message must name the Player rather
  than the caller, because an authorized organizer can receive it.
- A second join by the same Player under a different `command_id` raises `23514` from the
  allocator's duplicate pre-check. It is NOT a no-op — this differs from W4-02 on purpose.
- `WAITLISTED` is a successful committed result, never an error.
- Do not implement Leave, promotion, Remove, Restore, ChangeRegistrationCapacity or
  FinalizeSessionRoster. Do not add any read surface for `registration_entries`.
- Receipts carry `retention_class = 'REGISTRATION_ENTRY'` and `aggregate_id = window_id`.
- Every `SECURITY DEFINER` function uses `set search_path = ''`, fully qualified objects, and
  explicit execution revokes. Public commands revoked from `public`/`anon`, granted to
  `authenticated`; the private predicate revoked from all three.
- SQLSTATE convention: `23514` invalid shape, Window state, Session lifecycle, expired deadline or
  duplicate entry; `42501` authorization or eligibility; `P0002` missing Window or Session; `23505`
  idempotency collision.
- Reuse and preserve the active `volley_test_pg` Docker PostgreSQL on `127.0.0.1:55432`.

---

### Task 1: Pin both commands with failing database tests

**Files:**
- Create: `src/test/db/registrationJoin.dbtest.ts`
- Modify: none

**Interfaces:**
- Consumes: the harness (`connect`, `createPool`, `rebuildFromMigrations`, `asIdentityCommitting`,
  `isTestDatabaseConfigured`, `TEST_DATABASE_URL_VAR`), `public.create_registration_window`,
  `public.open_registration`, `public.create_target_session`, `public.create_community_with_owner`.
- Produces: executable expectations for `public.join_registration` and
  `public.add_registration_entry`.

- [ ] **Step 1: Build the fixture scaffold**

Copy the `before`/`after` shape and helpers from `src/test/db/registrationLifecycle.dbtest.ts`,
which already targets these tables and commands: reuse `newUser`, `call`, `callFailing`,
`assertSqlState`, `targetCommunity`, `activeMembership`, `grantOrganizer`, `createTargetSession`,
`communitySession`, `createPlayer`, `createWindow` and `transition`.

Add these helpers:

```typescript
interface JoinResultRow extends QueryResultRow {
  entry_status: string;
  window_revision: number;
}

async function joinRegistration(
  actorId: string | null,
  input: { commandId?: string; entryId?: string; windowId: string },
) {
  return call<JoinResultRow>(
    actorId,
    'select * from public.join_registration($1, $2, $3)',
    [input.commandId ?? randomUUID(), input.entryId ?? randomUUID(), input.windowId],
  );
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

// A Player linked to a real auth user, on the Community roster, whose user is an active member.
// Returns both ids because self-join tests need the user and organizer-add tests need the player.
async function eligibleMember(
  communityId: string,
  ownerId: string,
  email: string,
): Promise<{ userId: string; playerId: string }> {
  const userId = await newUser(email);
  await activeMembership(communityId, userId);
  const playerId = await createPlayer(ownerId, { name: email });
  await client.query(
    `insert into public.player_account_links (player_id, user_id, status)
     values ($1, $2, 'ACTIVE')`,
    [playerId, userId],
  );
  await client.query(
    `insert into public.community_players (community_id, player_id, owner_id, active, status)
     values ($1, $2, $3, true, 'active')`,
    [communityId, playerId, ownerId],
  );
  return { userId, playerId };
}

// A Player on the roster with NO account link and no membership — the organizer-add case.
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
```

Before writing `eligibleMember`, READ the `player_account_links` and `community_players` tables to
confirm the exact column names and any NOT NULL columns the inserts above omit. The shapes shown are
from the migrations but the tables have evolved; a wrong column name is a fixture crash, not a
product failure.

- [ ] **Step 2: Write the happy-path RED tests**

Pin:

- an eligible member's `join_registration` returns `entry_status = 'CONFIRMED'` and a
  `window_revision` one higher than the Window held before the call;
- the resulting entry row records `source = 'SELF_JOIN'`, `player_id` equal to the caller's linked
  Player, `created_by_user_id` equal to the caller, `status = 'CONFIRMED'` and a null
  `queue_sequence`;
- a self-join against a Window whose capacity is already filled returns
  `entry_status = 'WAITLISTED'` — assert this is a RESOLVED result, not a thrown error — and the
  entry row carries `queue_sequence = '1'` (bigint comes back as a string);
- the returned row has exactly the keys `entry_status` and `window_revision`. Assert this with
  `assert.deepEqual(Object.keys(result.rows[0]).sort(), ['entry_status', 'window_revision'])`, so
  that adding `queue_sequence` to the return later fails loudly. This is the assertion that keeps
  `OPEN-REG-003` open.

- [ ] **Step 3: Write the self-join eligibility RED tests**

Each case needs its own Window and its own would-be joiner. Pin `42501` for every broken link:

| Fixture | Expect |
|---|---|
| user with no `community_memberships` row at all | `42501` |
| active member, no `player_account_links` row | `42501` |
| active member, link with `status <> 'ACTIVE'` | `42501` |
| active member, ACTIVE link, no `community_players` row for that Player | `42501` |
| active member, ACTIVE link, `community_players` row with `deleted_at` set | `42501` |
| active member, ACTIVE link, `community_players` row with `active = false` | `42501` |
| anonymous caller (`null` actor) | `42501` |

Also pin that a member of a DIFFERENT Community cannot join this Window — build a second Community
with its own member and have them call against the first Community's real window id, asserting
`42501`. Use a real window id, not a random UUID: a nonexistent window raises `P0002` regardless of
eligibility, which would make the test a tautology.

- [ ] **Step 4: Write the organizer-add RED tests**

Pin:

- **the asymmetry case:** `add_registration_entry` by the assigned organizer succeeds for a Player
  built by `rosterOnlyPlayer` — no account link, no membership — returning `CONFIRMED`, with the
  entry recording `source = 'ORGANIZER_ADDED'` and `created_by_user_id` equal to the organizer, not
  the Player's owner. This is the case the command exists for;
- `add_registration_entry` raises `42501` for a Player with no `community_players` row in this
  Community;
- `add_registration_entry` raises `42501` when called by an active member who is NOT the assigned
  organizer;
- `add_registration_entry` raises `42501` for an anonymous caller;
- `join_registration` is NOT usable to register someone else — there is no parameter for it, so
  assert instead that the entry created by a self-join always carries the caller's own Player even
  when another eligible member exists in the same Community.

- [ ] **Step 5: Write the state-gate RED tests**

Pin `23514` for both commands in each case:

- Window in `DRAFT` (created but never opened);
- Window in `CLOSED`;
- Window in `LOCKED`;
- Session `IN_PROGRESS`, `COMPLETED` and `CANCELLED`.

Reach the Session states the same way `registrationLifecycle.dbtest.ts` does: `CANCELLED` through
`public.cancel_target_session`, and `IN_PROGRESS`/`COMPLETED` through a privileged direct UPDATE
supplying the required timestamps (`IN_PROGRESS` needs `actual_started_at`; `COMPLETED` needs both).
A COMMUNITY Session cannot reach `IN_PROGRESS` through supported commands until XS-W4-05 exists;
copy the explanatory comment from that file rather than restating the reasoning.

Then pin the deadline asymmetry, which is the whole point of `closes_at` in this slice:

- with `closes_at` one hour in the past, `join_registration` raises `23514`;
- with the same Window and the same past `closes_at`, `add_registration_entry` **succeeds**;
- with `closes_at` one hour in the future, `join_registration` succeeds;
- with `closes_at` null, `join_registration` succeeds.

- [ ] **Step 6: Write the idempotency RED tests**

Pin:

- **same command id retried** returns the identical row. Call `join_registration`, then call it
  again with the SAME `command_id` and a DIFFERENT `entry_id`, and assert the returned row deep-
  equals the first and that only ONE entry row exists for that Player. The differing entry id proves
  the receipt short-circuited before any insert;
- **a second join by the same Player under a different command id** raises `23514`, from the
  allocator's duplicate-effective-entry pre-check — NOT `23505`, and NOT a silent no-op. Assert the
  code explicitly;
- **cross-aggregate collision:** reuse a `join_registration` command id against a different Window,
  expecting `23505`;
- **cross-command collision:** reuse a `join_registration` command id on `add_registration_entry`
  for the same Window, expecting `23505`;
- **revoked-caller replay:** perform a real self-join, capture its `command_id`, then revoke that
  member's eligibility by setting their membership status to `suspended`:

  ```sql
  update public.community_memberships set status = 'suspended'
   where community_id = $1 and user_id = $2
  ```

  The eligibility predicate keys on `status = 'active'`, so suspending is sufficient and is
  reversible, unlike a delete. Then replay the SAME `command_id` as that same caller and assert
  `42501`, and specifically not the recorded result. This is the test that justifies placing the
  single receipt lookup after authorization; with the lookup first, the replay would return the
  recorded row and this test would fail.

- [ ] **Step 7: Write the concurrency and burst RED tests**

**The exit gate.** Build a Window with `capacity = 12` and eleven confirmed entries (use
`rosterOnlyPlayer` plus `addEntry` for the eleven — cheaper than eleven full members). Then have two
DIFFERENT eligible members self-join simultaneously.

Copy the racer structure from `registrationSchema.dbtest.ts`'s last-slot test, including its barrier
connection. Three things there are load-bearing: the barrier takes
`select 1 from public.registration_windows where id = $1 for update` and is AWAITED before either
racer is dispatched; the barrier is COMMITTED before `Promise.all` is awaited; and each racer
COMMITS INSIDE its own promise chain. Commits placed after `Promise.all` deadlock, because the
winner cannot commit while the loser holds the await open — an earlier slice shipped exactly that
bug and hung the whole suite.

Assert exactly one racer returns `CONFIRMED` and exactly one returns `WAITLISTED`, that the Window
ends with exactly 12 confirmed entries, and that the single waitlisted entry carries
`queue_sequence = '1'`.

**The burst.** Build a Window with `capacity = 30` and 100 roster-only Players. Drive 100
`add_registration_entry` calls in concurrent batches of 8 (the pool's limit), then assert:

- exactly 30 entries are `CONFIRMED`;
- exactly 70 are `WAITLISTED`;
- the 70 `queue_sequence` values, sorted numerically, are exactly `1..70` — no duplicate, no gap.

Use `add_registration_entry` rather than `join_registration` here on purpose. Both reach the same
allocator, but a hundred self-joins would need a hundred auth users, links and memberships —
minutes of setup proving nothing Step 3 does not already prove. Say so in a comment so a later
reader does not "upgrade" it.

- [ ] **Step 8: Write the access and rollback RED tests**

Pin:

- `anon` and `authenticated` hold none of SELECT, INSERT, UPDATE, DELETE on
  `public.registration_entries` — use the `has_table_privilege` idiom from
  `commandReceipts.dbtest.ts`. This proves the slice added no read surface;
- neither role can execute `app_private.current_user_can_join_registration`, via
  `has_function_privilege`;
- a rejected join leaves nothing behind: attempt a self-join that fails the Window-state gate, then
  assert no `registration_entries` row exists for that Player, no `app_private.command_receipts` row
  exists for that `command_id`, and the Window's `revision` is unchanged;
- each command writes a receipt carrying its own `command_type`, `aggregate_id` equal to the window
  id, `actor_id` equal to the caller and `retention_class = 'REGISTRATION_ENTRY'`.

- [ ] **Step 9: Verify focused RED**

```powershell
$env:VOLLEY_TEST_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:55432/volley_test'
node scripts/db-harness.mjs registrationJoin.dbtest.ts
```

Expected: every test fails with `42883` for the two missing functions, EXCEPT the two access tests
in Step 8 that probe table and function privileges — the table probe may already pass, since W4-01
granted nothing, and the function probe should fail because the function does not exist yet. Report
which tests passed and why. A TypeScript error or a fixture crash is a harness bug — fix it. Any
OTHER test that passes is not pinning what it claims; rework it and report the case.

- [ ] **Step 10: Run focused static checks and commit the RED contract**

```powershell
npx prettier --check src/test/db/registrationJoin.dbtest.ts
npx eslint src/test/db/registrationJoin.dbtest.ts
npm run typecheck
git diff --check
git add -- src/test/db/registrationJoin.dbtest.ts
git commit -m "test: specify JoinRegistration and organizer-added entries"
```

---

### Task 2: Implement both commands

**Files:**
- Create: exact path returned by `npx supabase migration new join_registration`
- Modify: `src/test/db/registrationJoin.dbtest.ts` only for a proven harness defect

**Interfaces:**
- Consumes: `public.registration_windows`, `public.registration_entries`, `public.sessions`,
  `public.community_memberships`, `public.community_players`, `public.player_account_links`,
  `public.current_user_active_player_id()`,
  `public.assert_target_session_write_authorized(public.sessions)`,
  `app_private.allocate_registration_slot(uuid, uuid, uuid, text, uuid)`,
  `app_private.find_command_receipt(uuid, text, uuid)`,
  `app_private.record_command_receipt(uuid, uuid, text, uuid, jsonb, text)`.
- Produces: `app_private.current_user_can_join_registration(uuid)`,
  `public.join_registration(uuid, uuid, uuid)`,
  `public.add_registration_entry(uuid, uuid, uuid, uuid)`.

- [ ] **Step 1: Create the migration through the installed CLI**

```powershell
npx supabase --version
npx supabase migration new join_registration
```

- [ ] **Step 2: Add the member-eligibility predicate**

```sql
create function app_private.current_user_can_join_registration(p_window_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.registration_windows w
      join public.sessions s on s.id = w.session_id
      join public.community_memberships m
        on m.community_id = s.community_id
       and m.user_id = (select auth.uid())
       and m.status = 'active'
     where w.id = p_window_id
  );
$$;

revoke all on function app_private.current_user_can_join_registration(uuid)
  from public, anon, authenticated;
```

This answers only "is the caller an active member of this Window's Community". Player resolution and
the roster relation are checked separately in step 9 of each command, because they produce a
different message and because organizer-add needs the roster check without the membership check.

- [ ] **Step 3: Implement `join_registration`**

`SECURITY DEFINER`, `set search_path = ''`, fully qualified. Returns
`table (entry_status text, window_revision integer)`. Order:

1. raise `23514` when `p_command_id`, `p_entry_id` or `p_window_id` is null;
2. resolve and lock the Session first:
   ```sql
   select s.* into v_session
     from public.sessions s
     join public.registration_windows w on w.session_id = s.id
    where w.id = p_window_id
    for update of s;
   ```
   raise `P0002` when not found;
3. `select * into v_window from public.registration_windows where id = p_window_id for update;`
   raise `P0002` when not found;
4. raise `42501` unless `app_private.current_user_can_join_registration(p_window_id)`;
5. `v_receipt := app_private.find_command_receipt(p_command_id, 'join_registration', p_window_id);`
   when non-null, return its `entry_status` and `window_revision` and stop;
6. raise `23514` when `v_session.lifecycle_status` is not in `('DRAFT', 'SCHEDULED')`;
7. raise `23514` when `v_window.status <> 'OPEN'`;
8. raise `23514` when `v_window.closes_at is not null and pg_catalog.now() >= v_window.closes_at`;
9. `v_player_id := public.current_user_active_player_id();` raise `42501` when null — the caller has
   no ACTIVE account link and therefore no Player to register. Then raise `42501` unless a live
   `community_players` row exists for `(v_session.community_id, v_player_id)`, meaning
   `deleted_at is null and active`. Name the Player in the message, not the caller;
10. `v_allocation := app_private.allocate_registration_slot(p_entry_id, p_window_id, v_player_id,
    'SELF_JOIN', (select auth.uid()));`
11. read `entry_status` from `v_allocation ->> 'status'` and the new revision from
    `(v_allocation ->> 'window_revision')::integer`;
12. `perform app_private.record_command_receipt(p_command_id, (select auth.uid()),
    'join_registration', p_window_id, <result jsonb>, 'REGISTRATION_ENTRY');`
13. return the two values.

Do NOT add an `expected_revision` parameter and do NOT raise `40001`. The Window's revision moves on
every join, so a member holding one would conflict over other people's joins.

- [ ] **Step 4: Implement `add_registration_entry`**

Identical to Step 3 except:

- the signature takes `p_player_id uuid` as a fourth argument, and step 1 null-checks it too;
- step 4 authorizes with `perform public.assert_target_session_write_authorized(v_session);`
  instead of the membership predicate;
- step 5 uses `'add_registration_entry'` as the command type;
- step 8 is OMITTED — this command deliberately ignores `closes_at`, because W4-02 left it inert
  with nothing auto-closing a Window, and the organizer is precisely who should still be able to add
  a late arrival before closing;
- step 9 does NOT call `current_user_active_player_id` and does NOT require an account link. It uses
  `p_player_id` directly and checks only the live `community_players` relation, because the added
  Player may have no account at all — that is the case this command exists for;
- step 10 passes `'ORGANIZER_ADDED'` as the source;
- step 12 uses `'add_registration_entry'` as the command type.

- [ ] **Step 5: Add grants**

```sql
revoke all on function public.join_registration(uuid, uuid, uuid) from public, anon;
grant execute on function public.join_registration(uuid, uuid, uuid) to authenticated;
revoke all on function public.add_registration_entry(uuid, uuid, uuid, uuid) from public, anon;
grant execute on function public.add_registration_entry(uuid, uuid, uuid, uuid) to authenticated;
```

Add no grant of any kind on `public.registration_entries`. The table stays unreadable by browser
roles, which is what keeps `OPEN-REG-003` open.

- [ ] **Step 6: Verify focused GREEN and the full database suite**

```powershell
$env:VOLLEY_TEST_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:55432/volley_test'
node scripts/db-harness.mjs registrationJoin.dbtest.ts
npm run test:db
npx prettier --check src/test/db/registrationJoin.dbtest.ts supabase/migrations/*_join_registration.sql
npm run typecheck
git diff --check
```

- [ ] **Step 7: Commit the commands**

```powershell
git add -- supabase/migrations/*_join_registration.sql src/test/db/registrationJoin.dbtest.ts
git commit -m "feat: add JoinRegistration and organizer-added entries"
```

---

### Task 3: Verify the XS-W4-03 exit gate and preserve branch evidence

**Files:**
- Modify only if verification exposes an XS-W4-03 defect, with a new failing test before any
  production fix

**Interfaces:**
- Consumes: the complete XS-W4-03 branch.
- Produces: fresh evidence for the last-slot race, the burst, the eligibility asymmetry and the
  preserved read boundary.

- [ ] **Step 1: Run focused changed-file quality gates**

```powershell
npx eslint src/test/db/registrationJoin.dbtest.ts
npx prettier --check docs/superpowers/specs/2026-08-31-xs-w4-03-join-registration-design.md docs/superpowers/plans/2026-08-31-xs-w4-03-join-registration.md src/test/db/registrationJoin.dbtest.ts supabase/migrations/*_join_registration.sql
git diff exec/c6-w4-02-registration-lifecycle...HEAD --check
```

- [ ] **Step 2: Run repository gates in CI order**

```powershell
npm run typecheck
npm run lint:eslint
npm run format:check
npm test
npm run build
npm run check:architecture
```

`lint:eslint` and `format:check` fail repository-wide from untracked vendored directories
(`.agent/`, `.claude/`, `.gemini/`, `.github/skills/`) and the sibling `.worktrees/` checkout. Prove
this branch adds nothing by showing that
`git diff exec/c6-w4-02-registration-lifecycle...HEAD --name-only` contains none of the reported
paths. Do not reformat unrelated files.

`src/hooks/useConnectivity.spec.tsx` → "onlineAt muda quando a rede volta" is a known real-clock
flake unrelated to this branch, with a fix already on `fix/flaky-useconnectivity-onlineat`. If it
fails, re-run `npm run test:ui` to confirm it passes, and report it as pre-existing.

- [ ] **Step 3: Run the complete database suite twice**

```powershell
$env:VOLLEY_TEST_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:55432/volley_test'
npm run test:db
npm run test:db
```

Expected: identical green totals from two independent from-zero migration rebuilds. The burst test
adds real wall-clock time; note the suite duration in the report so a later slowdown is visible.

- [ ] **Step 4: Inspect branch and Docker state**

```powershell
git status --short --branch
git log --oneline --decorate exec/c6-w4-02-registration-lifecycle..HEAD
docker ps --filter name=volley_test_pg --format "{{.Names}}|{{.Status}}|{{.Ports}}"
```

Expected: only XS-W4-03 commits, clean worktree, no whitespace errors, and `volley_test_pg` still
active on port `55432`.

- [ ] **Step 5: Review the exit gate**

Confirm from executable evidence that:

- a member registers themselves without naming a Player, and the entry carries their resolved
  Player and `SELF_JOIN`;
- an organizer registers a Player with NO account link, and the entry carries `ORGANIZER_ADDED` and
  the organizer as actor;
- two simultaneous joins for one remaining slot produce exactly one `CONFIRMED` and one
  `WAITLISTED`, proven under a barrier rather than by timing;
- a hundred entries preserve capacity exactly and produce a gapless `1..N` FIFO sequence;
- `WAITLISTED` is returned as a committed success, never raised as an error;
- the returned row carries only `entry_status` and `window_revision`;
- `registration_entries` remains unreadable by every browser role;
- a revoked caller replaying a real `command_id` receives `42501`, not the recorded result;
- `closes_at` blocks a self-join and does not block an organizer-add;
- `OPEN-REG-001` through `OPEN-REG-006` all remain open and none is cited as resolved.

Authority change: Registration entry creation moves to server semantic commands. Session and
Registration lifecycle authority are unchanged. Schema phase: EXPAND, with no new tables.
