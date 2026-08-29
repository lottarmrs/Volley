# XS-W3-06 Session Lifecycle and Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a target Session be scheduled, published, started, finished and cancelled only
through semantic commands, with derived readiness that `StartSession` revalidates and a durable
command receipt that makes every retry return its original result.

**Architecture:** Add `app_private.command_receipts` as a cross-cutting idempotency substrate, then
a Session lifecycle migration holding one readiness evaluator, one blocker catalog, one transition
guard and nine public commands built on top of them. `GetSessionReadiness` and `StartSession` call
the same evaluator so a UX answer and a command decision cannot drift.

**Tech Stack:** PostgreSQL/Supabase migrations, RLS, PL/pgSQL semantic commands, JSONB, Node test
runner, real PostgreSQL integration harness.

**Spec:** `docs/superpowers/specs/2026-08-28-xs-w3-06-session-lifecycle-readiness-design.md`

**Architecture sources:** `docs/architecture/contexts/N2.04-sessions.md` N3.04.03, N3.04.05–07 and
N3.04.13–16; `docs/architecture/platform/N2.15-api-application.md` N5.15.13;
`docs/architecture/execution/C6.02-W3-W6-SESSION-REGISTRATION-RATING-TEAM.md` XS-W3-06;
`docs/architecture/matrices/C5.01-ENTITY-DATA-STATE-MATRIX.md`,
`C5.02-COMMAND-QUERY-TRANSACTION-MATRIX.md` and `C5.03-CAPABILITY-SECURITY-PRIVACY-MATRIX.md`;
`docs/architecture/adr/ADR-CATALOG.md` ADR-API-003/006 and ADR-DATA-002/008;
`docs/architecture/quality/N2.20-testing-qa.md` QA-INV-004/005/006/008/009/010/011/012.

## Global Constraints

- Two migrations, not one. `command_receipts` is a cross-cutting substrate later waves consume and
  gets its own file; the Session lifecycle work stays in one cohesive second file.
- Readiness is `DERIVED_PROJECTION`. Never persist `isReady`; recompute from blockers every call.
- `GetSessionReadiness` and `StartSession` must call the same evaluator function. Duplicating the
  blocker logic in the command is a defect, not an optimization.
- Receipts and domain-state idempotency are both required. `ADR-API-006` and `N5.15.13.02` state
  that two double-clicks carry different command IDs, so the "already in target state" check must
  survive independently of the receipt.
- Receipt lookup precedes `expected_revision` validation, matching
  `replace_target_quick_session_roster`.
- No TTL, no prune job, no retention claim. Cite `OPEN-API-002` inline in the migration.
- No domain outbox. `C5.02` profiles these commands `T2+T4`; this slice implements `T2` only.
- Publication never changes `lifecycle_status` (`SES-INV-010`).
- Organizer assign and revoke must not authorize through
  `assert_target_session_write_authorized`; that helper requires an assignment, so it cannot gate
  the creation of the first one.
- Every other command authorizes through `assert_target_session_write_authorized` unchanged. Do not
  redefine it.
- Do not implement `UnpublishSession` (`OPEN-SES-002`), `AdministrativeTakeoverSessionResponsibility`
  (`OPEN-COM-005`) or `TransferSessionOperationalResponsibility`.
- Every new `app_private` table enables RLS and receives no browser grant.
- Every `SECURITY DEFINER` function uses `set search_path = ''`, fully qualified objects, and
  explicit execution revokes.
- Cover every foreign key with a complete leading-column btree index.
- SQLSTATE convention: `23514` invalid shape or lifecycle, `42501` authorization, `P0002` missing
  target Session, `23505` idempotency collision, `40001` stale concurrency, `55000` immutability.
- Apply migrations in chronological filename order through `npx supabase migration new`.
- Reuse and preserve the active `volley_test_pg` Docker PostgreSQL on `127.0.0.1:55432`.

---

### Task 1: Pin the command receipt substrate with failing database tests

**Files:**
- Create: `src/test/db/commandReceipts.dbtest.ts`
- Modify: none

**Interfaces:**
- Consumes: the existing harness (`rebuildFromMigrations`, `connect`, `createPool`,
  `asIdentityCommitting`, `isTestDatabaseConfigured`, `TEST_DATABASE_URL_VAR`).
- Produces: executable expectations for `app_private.command_receipts`,
  `app_private.record_command_receipt` and `app_private.find_command_receipt`.

- [ ] **Step 1: Build the fixture scaffold**

Copy the `before`/`after` shape from `src/test/db/sessionRosterRevisions.dbtest.ts`: rebuild every
migration in `before`, open a pool, create users through `auth.users` plus `public.profiles`, and
route role-scoped calls through `asIdentityCommitting`. Add `assertSqlState(error, code)` exactly
as that file defines it.

- [ ] **Step 2: Write the schema and access RED tests**

Pin these literal properties:

- `app_private.command_receipts` exposes exactly `command_id`, `actor_id`, `command_type`,
  `aggregate_id`, `result`, `committed_at`, `retention_class`, in that ordinal order, with
  `command_id` the primary key and `result` typed `jsonb`;
- `command_type`, `aggregate_id`, `result`, `committed_at` and `retention_class` are `NOT NULL`;
  `actor_id` is nullable and references `auth.users` with `ON DELETE SET NULL`;
- `command_type` and `retention_class` reject blank strings with `23514`;
- every foreign key has a complete leading-column btree index, reusing the `pg_constraint`/`pg_index`
  query from `sessionRosterRevisions.dbtest.ts`;
- RLS is enabled on the table;
- `anon` and `authenticated` hold no privilege on `app_private.command_receipts` and cannot execute
  `app_private.record_command_receipt` or `app_private.find_command_receipt`, each failing `42501`;
- privileged `UPDATE` and `DELETE` of a receipt both fail with `55000`.

- [ ] **Step 3: Write the receipt behavior RED tests**

Pin:

- `app_private.record_command_receipt(command_id, actor_id, command_type, aggregate_id, result, retention_class)`
  inserts one row and returns the stored `result` unchanged;
- `app_private.find_command_receipt(command_id, command_type, aggregate_id)` returns the recorded
  `result` for an exact match;
- the same helper returns `null` for an unknown `command_id`;
- a `command_id` recorded against one `command_type` and looked up under another raises `23505`;
- a `command_id` recorded against one `aggregate_id` and looked up under another raises `23505`;
- recording the same `command_id` twice raises `23505` rather than overwriting;
- deleting the actor from `auth.users` nulls `actor_id` while leaving `command_type`,
  `aggregate_id` and `result` intact, and does not trip the `55000` immutability guard.

The last case matters: the immutability trigger must exempt the foreign-key `SET NULL` exactly as
`reject_roster_revision_mutation` does, or auth anonymisation would fail.

- [ ] **Step 4: Verify focused RED**

```powershell
$env:VOLLEY_TEST_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:55432/volley_test'
node scripts/db-harness.mjs commandReceipts.dbtest.ts
```

Expected: product-boundary failures only — `42P01` for the missing table and `42883` for the
missing functions. TypeScript or fixture errors mean the harness is wrong, not the product.

- [ ] **Step 5: Run focused static checks and commit the RED contract**

```powershell
npx prettier --check src/test/db/commandReceipts.dbtest.ts
npx eslint src/test/db/commandReceipts.dbtest.ts
npm run typecheck
git diff --check
git add -- src/test/db/commandReceipts.dbtest.ts
git commit -m "test: specify command receipt substrate"
```

---

### Task 2: Implement the command receipt substrate

**Files:**
- Create: exact path returned by `npx supabase migration new command_receipt_substrate`
- Modify: `src/test/db/commandFoundation.dbtest.ts` (replace the pinned `KNOWN GAP` test)
- Modify: `src/test/db/commandReceipts.dbtest.ts` only when RED exposes a harness defect

**Interfaces:**
- Consumes: `auth.users`, the `app_private` schema created by the migration provenance substrate.
- Produces: `app_private.command_receipts`, `app_private.record_command_receipt(uuid, uuid, text, uuid, jsonb, text) → jsonb`,
  `app_private.find_command_receipt(uuid, text, uuid) → jsonb`.

- [ ] **Step 1: Create the migration through the installed CLI**

```powershell
npx supabase --version
npx supabase migration new command_receipt_substrate
```

Edit only the exact path the CLI returns.

- [ ] **Step 2: Create the table with the documented shape**

Use the field list from `N5.15.13` verbatim, in this column order: `command_id`, `actor_id`,
`command_type`, `aggregate_id`, `result`, `committed_at`, `retention_class`. `command_id` is the
primary key with no default — the caller always supplies it. `committed_at` defaults to `now()`.
Add non-blank checks on `command_type` and `retention_class`, an `ON DELETE SET NULL` foreign key
from `actor_id` to `auth.users`, and a btree index on `actor_id` to cover it.

Open the migration with a comment stating that retention is deliberately undefined and citing
`OPEN-API-002`, in the style the migration provenance substrate used for `OPEN-MIG-017`. Say
explicitly that no TTL, no prune job and no cleanup worker exist, and that receipts persist until a
retention decision exists.

- [ ] **Step 3: Add the immutability guard**

Add `app_private.reject_command_receipt_mutation()` as a `before update or delete` row trigger
raising `55000`, exempting exactly one shape: an `UPDATE` that only nulls a previously non-null
`actor_id` while every other column compares equal. Model it on
`app_private.reject_roster_revision_mutation` in
`supabase/migrations/20260828164947_target_session_roster_revisions.sql`. Revoke execution of the
trigger function from `public`, `anon` and `authenticated`.

- [ ] **Step 4: Add the record and find helpers**

Both are `SECURITY DEFINER` with `set search_path = ''`, fully qualified, revoked from `public`,
`anon` and `authenticated`.

`record_command_receipt` inserts the row and returns `p_result`. A duplicate `command_id` surfaces
the primary key violation as `23505`; do not swallow it.

`find_command_receipt` selects by `command_id`. When no row exists it returns `null`. When a row
exists whose `command_type` or `aggregate_id` differs from the arguments it raises `23505` with a
message naming the conflicting command type — this is the collision case, not a miss.

- [ ] **Step 5: Enable RLS and confirm the access boundary**

```sql
alter table app_private.command_receipts enable row level security;
revoke all on app_private.command_receipts from public, anon, authenticated;
```

No policy is created. `app_private` is not granted to browser roles, and RLS is defence in depth
per `ADR-DATA-002`.

- [ ] **Step 6: Replace the pinned gap test in the command foundation suite**

`src/test/db/commandFoundation.dbtest.ts` currently ends with a test asserting
`app_private.command_receipts` does **not** exist. Its own comment instructs the replacement.
Replace that test with one proving real receipt semantics: record a receipt, look it up with the
same `command_id`, `command_type` and `aggregate_id`, and assert the recorded `result` returns
unchanged. Keep the test name discoverable, for example
`'EXIT GATE: a recorded commandId returns its terminal result'`. Do not delete the test outright —
the suite must keep visible evidence at that boundary.

- [ ] **Step 7: Verify focused GREEN and the full database suite**

```powershell
$env:VOLLEY_TEST_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:55432/volley_test'
node scripts/db-harness.mjs commandReceipts.dbtest.ts
node scripts/db-harness.mjs commandFoundation.dbtest.ts
npm run test:db
npx prettier --check src/test/db/commandReceipts.dbtest.ts src/test/db/commandFoundation.dbtest.ts supabase/migrations/*_command_receipt_substrate.sql
npm run typecheck
git diff --check
```

- [ ] **Step 8: Commit the substrate**

```powershell
git add -- supabase/migrations/*_command_receipt_substrate.sql src/test/db/commandReceipts.dbtest.ts src/test/db/commandFoundation.dbtest.ts
git commit -m "feat: add durable command receipt substrate"
```

---

### Task 3: Pin readiness, the blocker catalog and cancellation schema with failing tests

**Files:**
- Create: `src/test/db/sessionLifecycleCommands.dbtest.ts`
- Modify: none

**Interfaces:**
- Consumes: target Session creation, organizer assignment, courts, rules snapshots and roster
  revisions from W3-01 through W3-05.
- Produces: executable expectations for `app_private.session_readiness_blockers`,
  `app_private.target_session_readiness`, `public.read_target_session_readiness` and the
  `sessions` cancellation columns.

- [ ] **Step 1: Build reusable lifecycle fixtures**

Reuse the harness pattern from `sessionRosterRevisions.dbtest.ts`. Add helpers:

```typescript
createReadySession(actorId, overrides?)   // target Quick Session with organizer, roster, rules, court
readReadiness(actorId, sessionId)          // select * from public.read_target_session_readiness($1)
blockerCodes(readiness)                    // sorted codes from the returned jsonb
assertSqlState(error, code)
```

`createReadySession` must produce a Session that satisfies all four evaluated blockers, so tests
can remove one condition at a time and assert exactly one blocker appears.

- [ ] **Step 2: Write the blocker catalog RED tests**

Pin:

- `app_private.session_readiness_blockers` holds exactly nine rows;
- the codes are `REQUIRED_ORGANIZER_MISSING`, `NO_EFFECTIVE_ROSTER`, `RULES_INVALID`,
  `COURT_CONFIGURATION_INVALID`, `ROSTER_STALE`, `NO_CONFIRMED_TEAM_DRAW`, `TEAM_DRAW_STALE`,
  `VOTING_STILL_OPEN`, `COMPETITION_FIXTURE_NOT_READY`;
- exactly the first four carry `evaluation_status = 'EVALUATED'`; the remaining five carry
  `'DEFERRED'` with `owning_wave` values `W6`, `W6`, `W6`, `W5`, `W8` respectively;
- `evaluation_status` rejects any value outside `EVALUATED` and `DEFERRED` with `23514`;
- RLS is enabled and browser roles hold no privilege on the table.

- [ ] **Step 3: Write the readiness evaluation RED tests**

Pin, using `createReadySession` and removing one condition per case:

- a fully prepared Session returns `ready = true` with an empty blocker array;
- revoking the organizer assignment yields exactly `REQUIRED_ORGANIZER_MISSING`;
- a Community assignment whose Membership becomes suspended, or whose `ORGANIZER` responsibility
  is revoked, yields the same blocker without deleting assignment history; another effective
  assignment clears it, while a Quick assignment remains effective without Community artifacts;
- replacing the roster with an empty revision yields exactly `NO_EFFECTIVE_ROSTER`;
- a Session with no rules snapshot yields exactly `RULES_INVALID`;
- a Session with no court yields exactly `COURT_CONFIGURATION_INVALID`;
- two missing conditions yield both codes, proving blockers accumulate rather than short-circuit;
- every returned blocker carries its `evaluation_status` and `owning_wave` from the catalog;
- the five `DEFERRED` codes never appear in any result in this wave;
- `revisions` reports the current Session revision, the latest `roster_revision_id` and
  `roster_revision_number`, and the `session_rules_snapshots` id observed, with nulls where the
  artifact is absent;
- no table anywhere stores a readiness or `is_ready` value — assert via
  `information_schema.columns` that no column named like `%is_ready%` or `%readiness%` exists in
  `public`.

- [ ] **Step 4: Write the readiness authorization RED tests**

Pin that `public.read_target_session_readiness` requires the assigned Organizer per `C5.02`:

- the assigned organizer reads it;
- an anonymous caller fails `42501`;
- an outsider fails `42501`;
- an eligible but unassigned Community organizer fails `42501`;
- a valid Session UUID belonging to another Community grants nothing, failing `42501`
  (`QA-INV-006`);
- a legacy Session id fails `P0002`.

- [ ] **Step 5: Write the cancellation schema RED tests**

Pin:

- `public.sessions` exposes `cancelled_at timestamptz`, `cancelled_by_user_id uuid` and
  `cancel_reason text`, all nullable;
- `cancelled_by_user_id` references `auth.users` with `ON DELETE SET NULL` and has a
  complete leading-column btree index;
- a target Session set to `lifecycle_status = 'CANCELLED'` without `cancelled_at` is rejected with
  `23514`; `cancelled_by_user_id` is initially command-derived but remains nullable for
  `ON DELETE SET NULL` anonymization;
- a blank `cancel_reason` is rejected with `23514`;
- a legacy Session with null `lifecycle_status` is unaffected by the constraint.

- [ ] **Step 6: Verify focused RED**

```powershell
$env:VOLLEY_TEST_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:55432/volley_test'
node scripts/db-harness.mjs sessionLifecycleCommands.dbtest.ts
```

Expected: `42P01` for `session_readiness_blockers`, `42883` for the readiness functions, and
assertion failures on the missing `sessions` columns.

- [ ] **Step 7: Run focused static checks and commit**

```powershell
npx prettier --check src/test/db/sessionLifecycleCommands.dbtest.ts
npx eslint src/test/db/sessionLifecycleCommands.dbtest.ts
npm run typecheck
git diff --check
git add -- src/test/db/sessionLifecycleCommands.dbtest.ts
git commit -m "test: specify Session readiness and cancellation schema"
```

---

### Task 4: Implement readiness, the blocker catalog and cancellation schema

**Files:**
- Create: exact path returned by `npx supabase migration new target_session_lifecycle_readiness`
- Modify: `src/test/db/sessionRosterRevisions.dbtest.ts` (cancellation fixture)
- Modify: `src/test/db/sessionLifecycleCommands.dbtest.ts` only for proven harness defects

**Interfaces:**
- Consumes: `public.sessions`, `public.session_organizer_assignments`, `public.session_courts`,
  `public.session_rules_snapshots`, `public.roster_revisions`, `public.roster_revision_entries`,
  `app_private.current_user_can_read_target_session`.
- Produces: `app_private.session_readiness_blockers`,
  `app_private.target_session_readiness(uuid) → jsonb`,
  `public.read_target_session_readiness(uuid)` returning `(ready boolean, blockers jsonb, revisions jsonb)`,
  and the three `sessions` cancellation columns.

This migration also holds Task 6's commands. Create it now and append to it there.

- [ ] **Step 1: Create the migration through the installed CLI**

```powershell
npx supabase migration new target_session_lifecycle_readiness
```

- [ ] **Step 2: Add the cancellation columns and constraint**

Add `cancelled_at`, `cancelled_by_user_id` and `cancel_reason` to `public.sessions`, with
`cancelled_by_user_id` referencing `auth.users` on delete set null plus a covering btree index.

Add a target-only check: either `authority_model = 'legacy'`, or `lifecycle_status` is distinct
from `'CANCELLED'`, or `cancelled_at` is non-null. The command derives and initially writes
`cancelled_by_user_id`, while the nullable FK remains compatible with its `ON DELETE SET NULL`
anonymization path. Add a separate check that `cancel_reason` is null or non-blank. Keeping the
checks separate produces a clearer constraint name in failures.

- [ ] **Step 3: Repair the roster suite fixture the constraint invalidates**

`src/test/db/sessionRosterRevisions.dbtest.ts` forces `lifecycle_status = 'CANCELLED'` by direct
UPDATE inside the test named
`'Quick replacement enforces authentication, assignment, target context, and pre-start lifecycle'`.
That UPDATE now violates the new constraint. Extend it to also set `cancelled_at = now()`; setting
`cancelled_by_user_id` to the acting organizer keeps the fixture faithful to the command's initial
write. Do not weaken the timestamp constraint to accommodate the fixture.

- [ ] **Step 4: Create and seed the blocker catalog**

```sql
create table app_private.session_readiness_blockers (
  code text primary key,
  evaluation_status text not null
    check (evaluation_status in ('EVALUATED', 'DEFERRED')),
  owning_wave text not null,
  description text not null
);
```

Seed all nine rows exactly as written here:

```sql
insert into app_private.session_readiness_blockers (code, evaluation_status, owning_wave, description)
values
  ('REQUIRED_ORGANIZER_MISSING', 'EVALUATED', 'W3',
   'No active Session organizer assignment is responsible for this Session.'),
  ('NO_EFFECTIVE_ROSTER', 'EVALUATED', 'W3',
   'The latest roster revision is absent or contains no participants.'),
  ('RULES_INVALID', 'EVALUATED', 'W3',
   'No Session rules snapshot has been frozen for this Session.'),
  ('COURT_CONFIGURATION_INVALID', 'EVALUATED', 'W3',
   'The Session has no configured court to play on.'),
  ('ROSTER_STALE', 'DEFERRED', 'W6',
   'A confirmed Team draw is bound to an older roster revision than the current one.'),
  ('NO_CONFIRMED_TEAM_DRAW', 'DEFERRED', 'W6',
   'Structured play requires a confirmed Team draw that does not exist yet.'),
  ('TEAM_DRAW_STALE', 'DEFERRED', 'W6',
   'The confirmed Team draw was invalidated by a later roster or configuration change.'),
  ('VOTING_STILL_OPEN', 'DEFERRED', 'W5',
   'A rating or evaluation ballot is still open and would change inputs mid-Session.'),
  ('COMPETITION_FIXTURE_NOT_READY', 'DEFERRED', 'W8',
   'A Competition fixture hosted by this Session is not ready to be played.');
```

The five `DEFERRED` descriptions state what the blocker *will* mean, not that it currently passes.
No W3 code path emits them.

Enable RLS and revoke all from `public`, `anon` and `authenticated`.

- [ ] **Step 5: Implement the readiness evaluator**

`app_private.target_session_readiness(p_session_id uuid) returns jsonb`, `STABLE`,
`SECURITY DEFINER`, `set search_path = ''`, revoked from browser roles.

It returns:

```text
{ "ready": boolean, "blockers": [ {code, evaluation_status, owning_wave}, ... ], "revisions": {...} }
```

Evaluate exactly four conditions, joining each emitted code to
`app_private.session_readiness_blockers` so `evaluation_status` and `owning_wave` come from the
catalog rather than being written twice:

- `REQUIRED_ORGANIZER_MISSING` when no effective, non-revoked assignment exists. Quick requires a
  real `organizer_user_id` and null `community_membership_id`; Community requires that the
  assignment's Membership is active in the Session Community and the same user currently holds a
  non-revoked `ORGANIZER` responsibility;
- `NO_EFFECTIVE_ROSTER` when the Session has no `roster_revisions` row, or its greatest
  `revision_number` revision has zero `roster_revision_entries`;
- `RULES_INVALID` when no `session_rules_snapshots` row exists for the Session;
- `COURT_CONFIGURATION_INVALID` when no `session_courts` row exists for the Session.

Blockers accumulate; never short-circuit on the first one. `ready` is true exactly when the blocker
array is empty. Order blockers by `code` so results are deterministic. Return `[]`, never null, for
an empty blocker set.

`revisions` carries `session_revision`, `roster_revision_id`, `roster_revision_number` and
`rules_snapshot_id`, using nulls where the artifact is absent.

- [ ] **Step 6: Implement the public readiness query**

`public.read_target_session_readiness(p_session_id uuid)` returns
`(ready boolean, blockers jsonb, revisions jsonb)`. It is `SECURITY DEFINER`,
`set search_path = ''`, revoked from `public` and `anon`, granted to `authenticated`.

Order of checks: reject a null `auth.uid()` with `42501`; load the Session with
`authority_model = 'target'` and raise `P0002` when absent; call
`public.assert_target_session_write_authorized(v_session)` so the assigned-Organizer rule from
`C5.02` is enforced by the same helper every command uses; then return the evaluator's fields.

It takes no `command_id` and writes no receipt. It is a query.

- [ ] **Step 7: Verify focused GREEN and the full database suite**

```powershell
$env:VOLLEY_TEST_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:55432/volley_test'
node scripts/db-harness.mjs sessionLifecycleCommands.dbtest.ts
node scripts/db-harness.mjs sessionRosterRevisions.dbtest.ts
npm run test:db
npx prettier --check src/test/db/sessionLifecycleCommands.dbtest.ts src/test/db/sessionRosterRevisions.dbtest.ts supabase/migrations/*_target_session_lifecycle_readiness.sql
npm run typecheck
git diff --check
```

- [ ] **Step 8: Commit readiness**

```powershell
git add -- supabase/migrations/*_target_session_lifecycle_readiness.sql src/test/db/sessionLifecycleCommands.dbtest.ts src/test/db/sessionRosterRevisions.dbtest.ts
git commit -m "feat: derive target Session readiness"
```

---

### Task 5: Pin the nine semantic commands with failing tests

**Files:**
- Modify: `src/test/db/sessionLifecycleCommands.dbtest.ts`

**Interfaces:**
- Consumes: the readiness evaluator and receipt substrate from Tasks 2 and 4.
- Produces: executable expectations for all nine public commands.

- [ ] **Step 1: Add command fixtures**

```typescript
callCommand(actorId, sql, params)        // through asIdentityCommitting
startSession(actorId, { commandId, sessionId, expectedRevision })
finishSession(actorId, { commandId, sessionId, expectedRevision })
cancelSession(actorId, { commandId, sessionId, expectedRevision, reason })
legacyGame(sessionId, status)            // privileged insert into public.games
```

Each command helper defaults `commandId` to `randomUUID()` so a test opts in to retry semantics by
passing the same value twice.

- [ ] **Step 2: Write the lifecycle transition RED tests**

Pin:

- `schedule_target_session` moves `DRAFT → SCHEDULED` and returns the incremented Session revision;
- it rejects a Session with no `planned_start_at` with `23514`;
- `start_target_session` moves `SCHEDULED → IN_PROGRESS`, sets `actual_started_at`, and leaves
  `planned_start_at` untouched (`SES-INV-027`);
- `start_target_session` accepts `DRAFT → IN_PROGRESS` directly only for Quick, the reduced path
  from `N4.04.03.01`; an otherwise-ready Community Session in DRAFT fails `23514` without receipt,
  revision bump or timestamp;
- `finish_target_session` moves `IN_PROGRESS → COMPLETED` and sets `actual_finished_at`;
- `cancel_target_session` moves `DRAFT`, `SCHEDULED` and `IN_PROGRESS` to `CANCELLED`, recording
  `cancelled_at`, `cancelled_by_user_id` and `cancel_reason`;
- cancelling preserves history (`SES-INV-026`): count `session_participants`, `roster_revisions`,
  `roster_revision_entries`, `session_rules_snapshots`, `session_courts` and
  `session_organizer_assignments` for the Session before and after the command and assert every
  count is unchanged, and that the latest roster revision still returns its original entries
  through `public.read_target_roster_revision`;
- after semantic cancellation, setting only `cancelled_by_user_id = NULL` faithfully simulates the
  future FK anonymization action and preserves lifecycle, timestamp, reason, revision and all child
  counts;
- every disallowed transition fails `23514`, explicitly including finish from `DRAFT`, start from
  `COMPLETED`, schedule from `IN_PROGRESS`, and cross-state transitions out of `COMPLETED` or
  `CANCELLED`; finish on `COMPLETED` and cancel on `CANCELLED` are desired-state no-ops;
- each command increments `sessions.revision` exactly once and keeps the legacy `status` mirror in
  agreement with `public.target_session_compatibility_status(lifecycle_status)`.

- [ ] **Step 3: Write the readiness revalidation RED test**

This is the `SES-INV-024` case and must be written as two steps, not one:

```typescript
const before = await readReadiness(organizer, sessionId);
assert.equal(before.rows[0].ready, true);
await replaceQuickRoster(organizer, { sessionId, participants: [] }); // roster emptied
const rejected = await startSession(organizer, { sessionId, expectedRevision: 3 })
  .catch((error: Error) => error);
assertSqlState(rejected, '23514');
```

Assert the Session stayed `SCHEDULED`, `actual_started_at` is still null, and no receipt row was
written for that `command_id`.

- [ ] **Step 4: Write the idempotency RED tests**

Pin, per `QA-INV-009`, `QA-INV-010` and `QA-INV-011`:

- retrying `start_target_session` with the same `command_id` returns the identical result even
  though the Session revision has advanced and the supplied `expected_revision` is now stale —
  this proves receipt lookup precedes stale validation;
- exactly one `actual_started_at` value survives three retries with one `command_id`;
- for schedule, start, publish, assign, revoke, finish, cancel and configure-court, two *different*
  command IDs carrying the same original pre-first `expected_revision` both write receipts and
  return the current result while causing exactly one logical effect; timestamps and cancellation
  audit remain those of the first effect;
- an identical normalized court configuration is a no-op before stale validation, while a genuinely
  different desired configuration with that stale revision still fails `40001`;
- reusing a `command_id` from `start_target_session` on `finish_target_session` raises `23505`;
- reusing a `command_id` against a different Session raises `23505`;
- a receipt row exists after each successful command with the correct `command_type`,
  `aggregate_id`, server-derived `actor_id` and `retention_class = 'SESSION_LIFECYCLE'`.

- [ ] **Step 5: Write the concurrency and rollback RED tests**

Pin, per `QA-INV-008` and `QA-INV-012`:

- two concurrent `start_target_session` transactions on distinct command IDs and the same
  `expected_revision` serialize on the Session lock; both return the one resulting revision and
  write receipts, with exactly one `actual_started_at` effect;
- a rejected command leaves no receipt row, no revision increment, no timestamp and no
  cancellation audit.

- [ ] **Step 6: Write the Match guard RED tests**

Pin `SES-INV-025` using the legacy `games` table, the only Match evidence that exists this wave:

- `finish_target_session` fails `23514` while a `games` row with a non-terminal status references
  the Session;
- `cancel_target_session` from `IN_PROGRESS` fails the same way (`N5.04.16.02`);
- both succeed once those rows reach a terminal status;
- a `games` row belonging to a *different* Session never blocks.

- [ ] **Step 7: Write the publish, organizer and court RED tests**

Pin:

- `publish_target_session` moves `PRIVATE → PUBLISHED` and leaves `lifecycle_status` unchanged
  (`SES-INV-010`);
- republishing with the same `command_id` returns the original result; republishing an already
  published Session returns current state without a second revision bump;
- publish fails `23514` from `IN_PROGRESS`, `COMPLETED` and `CANCELLED`;
- `assign_target_session_organizer` creates an assignment for an eligible Community organizer and
  for a Quick Session owner, and is callable by a Community `session.manage` holder who has **no**
  assignment yet — the bootstrap case;
- Community assignment rejects an ordinary active member and a member whose `ORGANIZER`
  responsibility is absent or revoked with `23514`, leaving revision, receipt and assignments
  untouched;
- `revoke_target_session_organizer` sets `revoked_at` and the revoked user then fails `42501` on
  every other command;
- `configure_target_session_court` updates an existing court's label and order in `DRAFT`,
  `SCHEDULED` **and** `IN_PROGRESS`, and fails `23514` in `COMPLETED` and `CANCELLED`;
- `configure_target_session_court` fails `P0002` for a court belonging to another Session.

- [ ] **Step 8: Write the authorization RED tests**

For all nine entry points, per `QA-INV-005` and `QA-INV-006`: anonymous fails `42501`, an outsider
fails `42501`, an eligible-but-unassigned Community organizer fails `42501` on everything except
the two organizer commands, a legacy Session id fails `P0002`, and a valid Session UUID from
another Community grants nothing. Also prove authenticated browser roles cannot select from
`app_private.command_receipts` or `app_private.session_readiness_blockers`.

- [ ] **Step 9: Verify focused RED and commit**

```powershell
$env:VOLLEY_TEST_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:55432/volley_test'
node scripts/db-harness.mjs sessionLifecycleCommands.dbtest.ts
npx prettier --check src/test/db/sessionLifecycleCommands.dbtest.ts
npx eslint src/test/db/sessionLifecycleCommands.dbtest.ts
npm run typecheck
git diff --check
git add -- src/test/db/sessionLifecycleCommands.dbtest.ts
git commit -m "test: specify target Session lifecycle commands"
```

Expected RED: `42883` for the nine missing functions, with every readiness and schema test from
Task 3 still green.

---

### Task 6: Implement the nine semantic commands

**Files:**
- Modify: the `*_target_session_lifecycle_readiness.sql` migration created in Task 4
- Modify: `src/test/db/sessionLifecycleCommands.dbtest.ts` only for proven harness defects

**Interfaces:**
- Consumes: `app_private.find_command_receipt`, `app_private.record_command_receipt`,
  `app_private.target_session_readiness`, `public.assert_target_session_write_authorized`,
  `public.current_user_has_community_capability`,
  `public.target_session_compatibility_status`.
- Produces: nine public functions, each returning at least `session_revision integer`.

- [ ] **Step 1: Add the private transition guard**

`app_private.assert_target_session_lifecycle_transition(p_from text, p_to text)` raises `23514`
unless the pair is one of `DRAFT→SCHEDULED`, `DRAFT→IN_PROGRESS`, `SCHEDULED→IN_PROGRESS`,
`IN_PROGRESS→COMPLETED`, `DRAFT→CANCELLED`, `SCHEDULED→CANCELLED`, `IN_PROGRESS→CANCELLED`. Nothing
leaves `COMPLETED` or `CANCELLED`. Keep the table of allowed pairs in this one function; no command
re-implements it.

- [ ] **Step 2: Implement the shared command prologue in each state-changing command**

Every one of the eight state-changing commands follows this exact order. Deviating breaks a pinned
test:

1. raise `23514` when `p_command_id` or `p_session_id` is null;
2. `select * into v_session from public.sessions where id = p_session_id and authority_model = 'target' for update`;
   raise `P0002` when not found;
3. authorize — `public.assert_target_session_write_authorized(v_session)` for all but the two
   organizer commands;
4. `v_receipt := app_private.find_command_receipt(p_command_id, '<COMMAND_TYPE>', p_session_id)`;
   when non-null, return it and stop. A mismatched receipt already raised `23505` inside the
   helper;
5. validate command-specific input needed to identify the desired state;
6. when the Session already holds that desired state, write this command's receipt and return the
   current state without consulting `p_expected_revision` or causing a second revision bump;
7. raise `40001` when a genuine mutation sees
   `v_session.revision is distinct from p_expected_revision`;
8. mutate, `update public.sessions set revision = revision + 1, updated_at = now()`, keeping
   `status = public.target_session_compatibility_status(<new lifecycle>)` in sync;
9. `perform app_private.record_command_receipt(p_command_id, (select auth.uid()), '<COMMAND_TYPE>', p_session_id, <result jsonb>, 'SESSION_LIFECYCLE')`;
10. return the result.

Step 4 before step 6 is the whole point: a client that lost the response retries with a stale
revision and must still receive its original result.

- [ ] **Step 3: Implement schedule, start, finish and cancel**

`schedule_target_session(p_command_id, p_session_id, p_expected_revision)` requires
`planned_start_at is not null`, else `23514`.

`start_target_session(p_command_id, p_session_id, p_expected_revision)` permits direct DRAFT Start
only when `session_context = 'QUICK'`. For `SCHEDULED → IN_PROGRESS`, it calls
`app_private.target_session_readiness(p_session_id)` after the transition guard and raises `23514`
when `ready` is false, naming the blocking codes in the message. It sets `actual_started_at = now()`
and never touches `planned_start_at`.

`finish_target_session(p_command_id, p_session_id, p_expected_revision)` sets
`actual_finished_at = now()`.

`cancel_target_session(p_command_id, p_session_id, p_expected_revision, p_cancel_reason)` initially
sets the three cancellation columns, rejecting a blank non-null reason with `23514`. Its actor FK
may later anonymize to null without clearing timestamp or reason. It destroys no roster, rules,
court or assignment row.

Finish and cancel-from-`IN_PROGRESS` both call the Match guard from Step 4 first.

- [ ] **Step 4: Implement the active Match guard**

`app_private.target_session_has_active_matches(p_session_id uuid) returns boolean`, `STABLE`,
`SECURITY DEFINER`, `set search_path = ''`, revoked from browser roles. It returns true when a
`public.games` row references the Session with `deleted_at is null` and a status outside the
terminal set (`finished`, `cancelled`). Finish and cancel raise `23514` when it returns true.

Comment in the migration that this reads legacy `games` deliberately: `SES-INV-025` forbids
silently finishing active Matches, target Matches arrive in `XS-W7-01`, and `XS-W3-07` will bring
legacy Sessions carrying `games` under target authority.

- [ ] **Step 5: Implement publish**

`publish_target_session(p_command_id, p_session_id, p_expected_revision)` requires
`lifecycle_status in ('DRAFT', 'SCHEDULED')`, sets `publication_state = 'PUBLISHED'`, and must not
write `lifecycle_status`. An already-published Session returns current state without a second
revision bump.

- [ ] **Step 6: Implement the organizer commands**

`assign_target_session_organizer(p_command_id, p_assignment_id, p_session_id, p_expected_revision, p_organizer_user_id)`
and `revoke_target_session_organizer(p_command_id, p_session_id, p_expected_revision, p_organizer_user_id)`.

These authorize differently, and this is deliberate: calling
`assert_target_session_write_authorized` here would require an assignment in order to create the
first assignment. Instead:

- when `v_session.community_id is not null`, require
  `public.current_user_has_community_capability(v_session.community_id, 'session.manage')`, else
  `42501`;
- when it is null, require `v_session.owner_id = (select auth.uid())`, else `42501`.

Resolve the Community from the loaded Session row, never from a client argument (`N8.04.06`).
Assign takes a caller-supplied `p_assignment_id` so the row identity is final, matching the pattern
`add_target_session_court` and `replace_target_quick_session_roster` already use. Both commands
reject a terminal Session with `23514`.

Before insertion, Assign validates the proposed row through the same private effective-assignment
predicate readiness uses: Quick requires a real user and no Community Membership; Community
requires the target user's active Membership in the Session Community plus a current non-revoked
`ORGANIZER` responsibility.

- [ ] **Step 7: Implement court configuration**

`configure_target_session_court(p_command_id, p_court_id, p_session_id, p_expected_revision, p_label, p_court_order)`
updates an existing court, raising `P0002` when the court does not belong to the Session. It is
allowed in `DRAFT`, `SCHEDULED` and `IN_PROGRESS` and rejects `COMPLETED` and `CANCELLED` with
`23514`, per `C5.01`'s "created/configured before/during Session under policy".

- [ ] **Step 8: Add grants for all nine functions**

Each is `SECURITY DEFINER` with `set search_path = ''`, then:

```sql
revoke all on function public.<name>(<signature>) from public, anon;
grant execute on function public.<name>(<signature>) to authenticated;
```

Confirm no new function appears in the `schemaSecurity.dbtest.ts` anon/PUBLIC exposure list.

- [ ] **Step 9: Verify focused GREEN and the full database suite**

```powershell
$env:VOLLEY_TEST_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:55432/volley_test'
node scripts/db-harness.mjs sessionLifecycleCommands.dbtest.ts
npm run test:db
npx prettier --check src/test/db/sessionLifecycleCommands.dbtest.ts supabase/migrations/*_target_session_lifecycle_readiness.sql
npm run typecheck
git diff --check
```

- [ ] **Step 10: Commit the commands**

```powershell
git add -- supabase/migrations/*_target_session_lifecycle_readiness.sql src/test/db/sessionLifecycleCommands.dbtest.ts
git commit -m "feat: add target Session lifecycle commands"
```

---

### Task 7: Verify the XS-W3-06 exit gate and preserve branch evidence

**Files:**
- Modify only if verification exposes an XS-W3-06 defect, with a new failing test before any
  production fix

**Interfaces:**
- Consumes: the complete XS-W3-06 branch.
- Produces: fresh evidence for lifecycle authority, derived readiness, receipt idempotency,
  security, and preservation of the active Docker service.

- [ ] **Step 1: Run focused changed-file quality gates**

```powershell
npx eslint src/test/db/commandReceipts.dbtest.ts src/test/db/sessionLifecycleCommands.dbtest.ts src/test/db/commandFoundation.dbtest.ts src/test/db/sessionRosterRevisions.dbtest.ts
npx prettier --check docs/superpowers/specs/2026-08-28-xs-w3-06-session-lifecycle-readiness-design.md docs/superpowers/plans/2026-08-28-xs-w3-06-session-lifecycle-readiness.md src/test/db/commandReceipts.dbtest.ts src/test/db/sessionLifecycleCommands.dbtest.ts supabase/migrations/*_command_receipt_substrate.sql supabase/migrations/*_target_session_lifecycle_readiness.sql
git diff exec/c6-w3-05-session-participant-roster-revision...HEAD --check
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
`git diff exec/c6-w3-05-session-participant-roster-revision...HEAD --name-only` contains none of
the reported paths. Do not reformat unrelated files.

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
git log --oneline --decorate exec/c6-w3-05-session-participant-roster-revision..HEAD
docker ps --filter name=volley_test_pg --format "{{.Names}}|{{.Status}}|{{.Ports}}"
```

Expected: only XS-W3-06 commits, clean worktree, no whitespace errors, and `volley_test_pg` still
active on port `55432`.

- [ ] **Step 5: Review the exit gate**

Confirm from executable evidence that:

- every target Session lifecycle change goes through a semantic command and no generic row update
  reaches `lifecycle_status`;
- readiness is derived, stored nowhere, and revalidated inside `StartSession`;
- all nine blocker codes are declared, four evaluated and five labelled `DEFERRED` with their
  owning wave;
- a retried `command_id` returns its recorded result after a lost response, and different command
  IDs still produce one logical effect;
- finish and cancel refuse to run while active Matches reference the Session;
- cancellation preserves roster, rules, court and assignment rows and records who cancelled and
  why;
- publication never changes `lifecycle_status`;
- `command_receipts` and `session_readiness_blockers` are unreachable by browser roles, and receipt
  mutation raises `55000`;
- `OPEN-API-002`, `OPEN-SES-002` and `OPEN-COM-005` remain open and uncited as resolved.

Authority change: target Session lifecycle authority moves to server semantic commands, and command
idempotency gains a durable receipt substrate. Legacy Session authority is unchanged. Schema phase:
EXPAND.
