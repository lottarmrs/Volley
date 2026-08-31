# XS-W4-02 Registration Lifecycle Commands Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Registration schema usable by adding the four semantic commands that create a
Window and move it through `DRAFT → OPEN → CLOSED → LOCKED`, with no row-update path that bypasses
them.

**Architecture:** One migration adds a private transition guard holding the entire allowed-pairs
table, plus four public `SECURITY DEFINER` commands built on the prologue W3-06 proved: lock the
Session, lock the Window, authorize, look up the receipt, gate on Session lifecycle, no-op if
already in the target state, check `expected_revision`, mutate, record the receipt. No new tables.

**Tech Stack:** PostgreSQL/Supabase migrations, RLS, PL/pgSQL, JSONB, Node test runner, real
PostgreSQL integration harness.

**Spec:** `docs/superpowers/specs/2026-08-31-xs-w4-02-registration-lifecycle-design.md`

**Architecture sources:** `docs/architecture/execution/C6.02-W3-W6-SESSION-REGISTRATION-RATING-TEAM.md`
XS-W4-02; `docs/architecture/contexts/N2.05-registration.md` N3.05.01–02, N3.05.10–11, N3.05.16,
with REG-INV-003/018/019/030/031/032;
`docs/architecture/matrices/C5.02-COMMAND-QUERY-TRANSACTION-MATRIX.md` Registration command matrix;
`docs/architecture/adr/ADR-CATALOG.md` ADR-API-003/006;
`docs/architecture/quality/N2.20-testing-qa.md` QA-INV-004/005/006/008/009/010/012.

## Global Constraints

- One migration only, created through `npx supabase migration new registration_lifecycle_commands`.
  Edit only the exact path the CLI prints. No new tables.
- The allowed transitions are exactly `DRAFT→OPEN`, `OPEN→CLOSED`, `CLOSED→LOCKED`. Nothing leaves
  `LOCKED`. The table lives in one function and no command re-implements it.
- **Lock ordering is Session first, then Window.** W3-06 locks `public.sessions FOR UPDATE` and
  XS-W4-05 will need both in one transaction; the opposite order would deadlock on its first
  concurrent pair.
- The already-in-target-state no-op is checked BEFORE the transition guard. `LOCKED → LOCKED` is an
  idempotent no-op while `LOCKED → OPEN` is a rejected transition; a guard consulted first rejects
  both.
- Exactly ONE receipt lookup, placed AFTER authorization. This is deliberate: it prevents a caller
  whose capability was revoked from replaying a receipt, and it means an unauthorized caller gets
  `42501` rather than a `23505` that would confirm their `command_id` exists.
- Both idempotency mechanisms are required. The receipt covers a retry of the same `command_id`
  (REG-INV-031); the no-op independently covers two DIFFERENT command IDs double-clicking
  (REG-INV-032).
- All four commands require the Session in `DRAFT` or `SCHEDULED` with `authority_model = 'target'`.
- Registration commands NEVER touch `sessions.revision`. The Window is its own aggregate root with
  its own `revision` (REG-INV-019).
- A second Window for one Session raises `23514`, never `23505`. This codebase reserves `23505` for
  idempotency collisions raised by `app_private.find_command_receipt`.
- Do not implement `ReopenRegistration` (gated on `OPEN-REG-006`) or `ChangeRegistrationCapacity`
  (deferred to XS-W4-04 with promotion). No command edits `capacity` or `closes_at`.
- Every `SECURITY DEFINER` function uses `set search_path = ''`, fully qualified objects, and
  explicit execution revokes. Public commands are revoked from `public`/`anon` and granted to
  `authenticated`; the private guard is revoked from all three.
- Receipts carry `retention_class = 'REGISTRATION_LIFECYCLE'` and `aggregate_id = window_id`.
- SQLSTATE convention: `23514` invalid transition, shape, or Session lifecycle; `42501`
  authorization; `P0002` missing Window or Session; `23505` idempotency collision; `40001` stale
  revision.
- Reuse and preserve the active `volley_test_pg` Docker PostgreSQL on `127.0.0.1:55432`.

---

### Task 1: Pin the four commands with failing database tests

**Files:**
- Create: `src/test/db/registrationLifecycle.dbtest.ts`
- Modify: none

**Interfaces:**
- Consumes: the harness (`connect`, `createPool`, `rebuildFromMigrations`, `asIdentityCommitting`,
  `isTestDatabaseConfigured`, `TEST_DATABASE_URL_VAR`), `public.create_target_session`,
  `public.create_community_with_owner`, and the W4-01 tables.
- Produces: executable expectations for `public.create_registration_window`,
  `public.open_registration`, `public.close_registration` and `public.lock_registration`.

- [ ] **Step 1: Build the fixture scaffold**

Copy the `before`/`after` shape and helpers from `src/test/db/registrationSchema.dbtest.ts`, which
already targets these tables: reuse `newUser`, `call`, `callFailing`, `assertSqlState`,
`targetCommunity`, `activeMembership`, `grantOrganizer`, `createTargetSession`, `communitySession`
and `createPlayer` verbatim.

Add command helpers. Every command is a `public.*` RPC, so these run through `asIdentityCommitting`
with a real actor — unlike W4-01's allocator, which was `app_private` and could only be called on a
privileged connection:

```typescript
interface WindowCommandRow extends QueryResultRow {
  window_revision: number;
}
interface CreateWindowRow extends WindowCommandRow {
  window_id: string;
}

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
  command: 'open_registration' | 'close_registration' | 'lock_registration',
  input: { commandId?: string; windowId: string; expectedRevision: number },
) {
  return call<WindowCommandRow>(
    actorId,
    `select * from public.${command}($1, $2, $3)`,
    [input.commandId ?? randomUUID(), input.windowId, input.expectedRevision],
  );
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
```

`next_queue_sequence` is typed `string` because node-postgres returns `bigint` as a string.

Add a helper that drives a Window to a chosen state, since most tests need one:

```typescript
async function windowAt(
  actorId: string,
  sessionId: string,
  target: 'DRAFT' | 'OPEN' | 'CLOSED' | 'LOCKED',
  capacity = 12,
): Promise<string> {
  const created = await createWindow(actorId, { sessionId, capacity });
  const windowId = created.rows[0].window_id;
  let revision = created.rows[0].window_revision;
  const path: Array<['open_registration' | 'close_registration' | 'lock_registration', string]> = [
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
```

- [ ] **Step 2: Write the creation RED tests**

Pin:

- `create_registration_window` returns the supplied `window_id` and `window_revision = 1`, and the
  row reads `status = 'DRAFT'`, `revision = 1`, `next_queue_sequence = '1'`, the supplied
  `capacity`, and `created_by_user_id` equal to the calling user — NOT to any value the caller
  passed, since there is no such parameter (ADR-API-003);
- a supplied `closes_at` round-trips, and a null `closes_at` stays null;
- `opened_at`, `closed_at` and `locked_at` are all null on a fresh Window;
- creating a second Window for a Session that already has one raises `23514`, **not** `23505` —
  assert the code explicitly, because W4-01's unique `session_id` would otherwise surface `23505`;
- `sessions.revision` is UNCHANGED by creation. Read it before and after and assert equality; the
  Window is its own aggregate root.

- [ ] **Step 3: Write the transition RED tests**

Pin the happy path as one test: create, open, close, lock. After each command assert that
`window_revision` increased by exactly one, that `status` matches, and that ONLY that command's
timestamp became non-null — after `open_registration`, `opened_at` is set while `closed_at` and
`locked_at` are still null, and so on.

Then pin every disallowed pair with `23514`, each driven from a Window at the right starting state
via `windowAt`:

| From | Command | Expect |
|---|---|---|
| `DRAFT` | `close_registration` | `23514` |
| `DRAFT` | `lock_registration` | `23514` |
| `OPEN` | `lock_registration` | `23514` |
| `CLOSED` | `open_registration` | `23514` |
| `LOCKED` | `open_registration` | `23514` |
| `LOCKED` | `close_registration` | `23514` |

Do NOT add a case asserting `23514` for locking an already-`LOCKED` Window. That is the idempotent
no-op Step 4 covers, and a test asserting `23514` there would contradict the prologue's ordering.

- [ ] **Step 4: Write the idempotency RED tests**

Pin all four properties separately — they fail in different ways:

- **Same command id, stale revision (REG-INV-031):** open a Window, then call `open_registration`
  again with the SAME `command_id` and the now-stale original `expected_revision`. It must return
  the identical row rather than `40001`, proving the receipt is consulted before the revision check.
- **Different command id, already in target state (REG-INV-032):** call `open_registration` a second
  time with a FRESH `command_id` and the current revision. Capture the result and assert
  `window_revision` equals the pre-call revision — no second bump. Do not merely assert the status
  is still `OPEN`; that stays true even if the implementation bumps the revision again, which is the
  exact false-pass this test exists to prevent.
- **Cross-aggregate collision:** reuse a `command_id` from `open_registration` on a DIFFERENT Window
  and assert `23505`.
- **Cross-command collision:** reuse an `open_registration` command id on `close_registration` for
  the same Window and assert `23505`.

- [ ] **Step 5: Write the authorization RED tests**

Pin, for all four commands:

- an anonymous caller receives `42501`;
- an outsider with no Community relationship receives `42501`;
- a Community member who holds ORGANIZER responsibility but has NO Session organizer assignment
  receives `42501`. Build this by granting the responsibility and creating the Session as a
  different organizer;
- the assigned organizer succeeds.

Then pin the property that justifies the single-lookup placement, as its own test:

- perform a real `open_registration` as the assigned organizer, capturing its `command_id`;
- revoke that organizer's assignment
  (`update public.session_organizer_assignments set revoked_at = now() where session_id = $1`);
- replay the SAME `command_id` as that same, now-unauthorized caller;
- assert `42501`, and specifically NOT `23505`. An implementation that looked the receipt up before
  authorizing would return the recorded result instead.

Finally, BOLA (QA-INV-006): build a SECOND Community with its own Session and Window, and have the
FIRST Community's organizer call `open_registration` against that real, existing foreign window id.
Assert `42501`. Do not use a random UUID — a nonexistent window returns `P0002` regardless of the
policy, which would make the test a tautology.

- [ ] **Step 6: Write the Session-gate and concurrency RED tests**

Pin the Session gate for all four commands: each must raise `23514` when the Session is
`IN_PROGRESS`, `COMPLETED` or `CANCELLED`.

Getting a Session into those states needs care, because a COMMUNITY Session — the only kind that can
own a Window — **cannot reach `IN_PROGRESS` through supported commands in this wave**. Verify this
yourself before working around it, then use the routes below:

- `20260828190617_target_session_lifecycle_readiness.sql:434` restricts the direct
  `DRAFT → IN_PROGRESS` path to `session_context = 'QUICK'`, so a Community Session must pass
  through `SCHEDULED`;
- `SCHEDULED → IN_PROGRESS` runs the readiness gate, which requires `NO_EFFECTIVE_ROSTER` cleared;
- the only roster command that exists is `replace_target_quick_session_roster`, which rejects
  anything but QUICK at `20260828164947_target_session_roster_revisions.sql:360`. Community rosters
  arrive with `FinalizeSessionRoster` in XS-W4-05.

So:

- **`CANCELLED`** — use the supported command `public.cancel_target_session`, which works from
  `DRAFT` and `SCHEDULED`. Prefer it over a forced UPDATE.
- **`IN_PROGRESS` and `COMPLETED`** — force with a privileged `client.query` UPDATE, satisfying the
  Session check constraints: `IN_PROGRESS` requires `actual_started_at`, and `COMPLETED` requires
  both `actual_started_at` and `actual_finished_at`. Add a comment naming the reason — the supported
  path does not exist for a Community Session until XS-W4-05 — so a later reader does not "fix" the
  fixture into a command call that cannot work.

Keep the forced UPDATEs confined to these gate tests. Everywhere else, drive state through commands.

Pin the stale-revision case: call `open_registration` with `expected_revision` one lower than
current and assert `40001`.

Pin concurrency (QA-INV-008): two pooled connections, both `begin`, both calling
`open_registration` on the same `DRAFT` Window with the same `expected_revision` and DIFFERENT
command ids, committing inside each promise chain. Exactly one performs the transition; the other
either returns the already-`OPEN` state or raises `40001`. Assert the Window ends at `revision = 2`,
not 3.

Copy the racer structure from `src/test/db/registrationSchema.dbtest.ts`'s last-slot test, including
its barrier connection: take a third connection, `begin`, `select 1 from
public.registration_windows where id = $1 for update`, dispatch both racers, then commit the barrier
to release them together, and release all three in `finally`. Without the barrier the test passes by
timing rather than by construction. Each racer MUST commit inside its own promise chain — commits
placed after `Promise.all` deadlock, because the winner cannot commit while the loser holds the
await open.

- [ ] **Step 7: Write the exit-gate and receipt-shape RED tests**

Pin the exit gate explicitly: as an authenticated assigned organizer, attempt
`update public.registration_windows set status = 'OPEN' where id = $1` and assert `42501`. This is
the slice's headline claim — that no row update bypasses lifecycle policy — and it must be a test,
not an assumption.

Pin the receipt shape for all four commands with a table-driven loop: after each succeeds, its
`app_private.command_receipts` row carries `command_type` equal to the SQL function name,
`aggregate_id` equal to the window id, `actor_id` equal to the calling user, and
`retention_class = 'REGISTRATION_LIFECYCLE'`.

Pin rollback (QA-INV-012): issue a command that fails its Session gate, then assert no receipt row
exists for that `command_id`, the Window's `revision` is unchanged, and its timestamp column is
still null.

- [ ] **Step 8: Verify focused RED**

```powershell
$env:VOLLEY_TEST_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:55432/volley_test'
node scripts/db-harness.mjs registrationLifecycle.dbtest.ts
```

Expected: every test fails with `42883` for the four missing functions. A TypeScript error or a
fixture crash is a harness bug — fix it. If a test PASSES, it is not pinning what it claims; rework
it and report the case. The exit-gate test in Step 7 is the one exception to watch: it may already
pass, because W4-01 granted no UPDATE. That is correct and expected — note it in the report rather
than reworking it.

- [ ] **Step 9: Run focused static checks and commit the RED contract**

```powershell
npx prettier --check src/test/db/registrationLifecycle.dbtest.ts
npx eslint src/test/db/registrationLifecycle.dbtest.ts
npm run typecheck
git diff --check
git add -- src/test/db/registrationLifecycle.dbtest.ts
git commit -m "test: specify Registration lifecycle commands"
```

---

### Task 2: Implement the four lifecycle commands

**Files:**
- Create: exact path returned by `npx supabase migration new registration_lifecycle_commands`
- Modify: `src/test/db/registrationLifecycle.dbtest.ts` only for a proven harness defect

**Interfaces:**
- Consumes: `public.registration_windows`, `public.sessions`,
  `public.assert_target_session_write_authorized(public.sessions)`,
  `app_private.find_command_receipt(uuid, text, uuid)`,
  `app_private.record_command_receipt(uuid, uuid, text, uuid, jsonb, text)`.
- Produces: `app_private.assert_registration_lifecycle_transition(text, text)`,
  `public.create_registration_window(uuid, uuid, uuid, integer, timestamptz)`,
  `public.open_registration(uuid, uuid, integer)`,
  `public.close_registration(uuid, uuid, integer)`,
  `public.lock_registration(uuid, uuid, integer)`.

- [ ] **Step 1: Create the migration through the installed CLI**

```powershell
npx supabase --version
npx supabase migration new registration_lifecycle_commands
```

- [ ] **Step 2: Add the transition guard**

```sql
create function app_private.assert_registration_lifecycle_transition(
  p_from text,
  p_to text
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if (p_from, p_to) not in (
    ('DRAFT', 'OPEN'),
    ('OPEN', 'CLOSED'),
    ('CLOSED', 'LOCKED')
  ) then
    raise exception 'Registration lifecycle transition % -> % is not allowed', p_from, p_to
      using errcode = '23514';
  end if;
end;
$$;

revoke all on function app_private.assert_registration_lifecycle_transition(text, text)
  from public, anon, authenticated;
```

Keep the allowed-pairs list in this function only. No command re-implements it.

- [ ] **Step 3: Implement `create_registration_window`**

`SECURITY DEFINER`, `set search_path = ''`, fully qualified. Order:

1. raise `23514` when `p_command_id`, `p_window_id`, `p_session_id` or `p_capacity` is null;
2. `select * into v_session from public.sessions where id = p_session_id and authority_model =
   'target' for update`; raise `P0002` when not found;
3. `perform public.assert_target_session_write_authorized(v_session);`
4. `v_receipt := app_private.find_command_receipt(p_command_id, 'create_registration_window',
   p_window_id);` when non-null, return its `window_id` and `window_revision` and stop;
5. raise `23514` when `v_session.lifecycle_status` is not in `('DRAFT', 'SCHEDULED')`;
6. raise `23514` when a Window already exists for `p_session_id`. Pre-check with `exists`; do NOT
   let W4-01's unique `session_id` raise a raw `23505`;
7. insert with `status = 'DRAFT'`, `revision = 1`, `next_queue_sequence = 1`,
   `created_by_user_id = (select auth.uid())`, plus `p_capacity` and `p_closes_at`;
8. `perform app_private.record_command_receipt(p_command_id, (select auth.uid()),
   'create_registration_window', p_window_id, <result jsonb>, 'REGISTRATION_LIFECYCLE');`
9. return `p_window_id` and `1`.

Do not write `sessions.revision`. The Session row is locked to gate its lifecycle and to serialize
concurrent creates, nothing more.

- [ ] **Step 4: Implement the three transition commands**

`open_registration`, `close_registration` and `lock_registration` share this order exactly. The
only differences are the target status, the timestamp column, and the `command_type` string.

1. raise `23514` when `p_command_id` or `p_window_id` is null;
2. resolve the Session and lock it first:
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
4. `perform public.assert_target_session_write_authorized(v_session);`
5. `v_receipt := app_private.find_command_receipt(p_command_id, '<command_type>', p_window_id);`
   when non-null, return its `window_revision` and stop;
6. raise `23514` when `v_session.lifecycle_status` is not in `('DRAFT', 'SCHEDULED')`;
7. when `v_window.status = '<target>'`, return `v_window.revision` without any mutation — this is
   BEFORE the guard, because `LOCKED → LOCKED` is a no-op while `LOCKED → OPEN` is rejected;
8. `perform app_private.assert_registration_lifecycle_transition(v_window.status, '<target>');`
9. raise `40001` when `v_window.revision is distinct from p_expected_revision`;
10. update status, the matching timestamp, `revision = revision + 1`, `updated_at = pg_catalog.now()`;
11. record the receipt with `aggregate_id = p_window_id` and
    `retention_class = 'REGISTRATION_LIFECYCLE'`;
12. return the new revision.

Step 2's `for update of s` locks only the Session in that join. Step 3 then locks the Window. That
Session-then-Window order is mandatory — reversing it deadlocks against XS-W4-05.

Step 5 before step 9 is what makes a lost-response retry return its original result rather than
`40001`. Step 7 before step 8 is what makes a second, different command id a no-op rather than a
rejected transition.

- [ ] **Step 5: Add grants**

For each of the four public commands:

```sql
revoke all on function public.<name>(<signature>) from public, anon;
grant execute on function public.<name>(<signature>) to authenticated;
```

Confirm no new function appears in `schemaSecurity.dbtest.ts`'s anon/PUBLIC exposure list.

- [ ] **Step 6: Verify focused GREEN and the full database suite**

```powershell
$env:VOLLEY_TEST_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:55432/volley_test'
node scripts/db-harness.mjs registrationLifecycle.dbtest.ts
npm run test:db
npx prettier --check src/test/db/registrationLifecycle.dbtest.ts supabase/migrations/*_registration_lifecycle_commands.sql
npm run typecheck
git diff --check
```

- [ ] **Step 7: Commit the commands**

```powershell
git add -- supabase/migrations/*_registration_lifecycle_commands.sql src/test/db/registrationLifecycle.dbtest.ts
git commit -m "feat: add Registration lifecycle commands"
```

---

### Task 3: Verify the XS-W4-02 exit gate and preserve branch evidence

**Files:**
- Modify only if verification exposes an XS-W4-02 defect, with a new failing test before any
  production fix

**Interfaces:**
- Consumes: the complete XS-W4-02 branch.
- Produces: fresh evidence for the lifecycle machine, idempotency, the bypass-proof access boundary,
  and preservation of the active Docker service.

- [ ] **Step 1: Run focused changed-file quality gates**

```powershell
npx eslint src/test/db/registrationLifecycle.dbtest.ts
npx prettier --check docs/superpowers/specs/2026-08-31-xs-w4-02-registration-lifecycle-design.md docs/superpowers/plans/2026-08-31-xs-w4-02-registration-lifecycle.md src/test/db/registrationLifecycle.dbtest.ts supabase/migrations/*_registration_lifecycle_commands.sql
git diff exec/c6-w4-01-registration-schema...HEAD --check
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
`git diff exec/c6-w4-01-registration-schema...HEAD --name-only` contains none of the reported paths.
Do not reformat unrelated files.

`src/hooks/useConnectivity.spec.tsx` → "onlineAt muda quando a rede volta" is a known real-clock
flake unrelated to this branch, with a fix already on `fix/flaky-useconnectivity-onlineat`. If it
fails, re-run `npm run test:ui` to confirm it passes, and report it as pre-existing rather than
treating it as a branch failure.

- [ ] **Step 3: Run the complete database suite twice**

```powershell
$env:VOLLEY_TEST_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:55432/volley_test'
npm run test:db
npm run test:db
```

Expected: identical green totals from two independent from-zero migration rebuilds.

- [ ] **Step 4: Inspect branch and Docker state**

```powershell
git status --short --branch
git log --oneline --decorate exec/c6-w4-01-registration-schema..HEAD
docker ps --filter name=volley_test_pg --format "{{.Names}}|{{.Status}}|{{.Ports}}"
```

Expected: only XS-W4-02 commits, clean worktree, no whitespace errors, and `volley_test_pg` still
active on port `55432`.

- [ ] **Step 5: Review the exit gate**

Confirm from executable evidence that:

- a Window reaches every state only through a semantic command, and no authenticated `UPDATE` on
  `registration_windows.status` succeeds;
- the allowed transitions are exactly the three, with nothing leaving `LOCKED`;
- a retried `command_id` returns its recorded result even when the supplied revision is stale, and a
  second distinct command id produces no second revision bump;
- an unauthorized caller replaying a real `command_id` gets `42501` and never `23505`;
- all four commands are rejected on `IN_PROGRESS`, `COMPLETED` and `CANCELLED` Sessions;
- `sessions.revision` is never written by a Registration command;
- `OPEN-REG-001` through `OPEN-REG-006` all remain open and none is cited as resolved;
- `ReopenRegistration` and `ChangeRegistrationCapacity` do not exist.

Authority change: Registration lifecycle authority moves to server semantic commands. Session
authority is unchanged. Schema phase: EXPAND, with no new tables.
