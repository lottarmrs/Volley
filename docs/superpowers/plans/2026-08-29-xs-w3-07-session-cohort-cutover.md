# XS-W3-07 Session Cohort Cutover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make target Session authority persistent, one-way and explicitly transferable for a
strict eligible legacy draft while excluding target Session roots from generic timestamp sync.

**Architecture:** Keep `sessions.authority_model` as the effective selector and add an immutable
internal cutover-provenance row required for every target Session. A fingerprinted semantic command
locks and transitions one strict legacy draft atomically, while the operational sync adapter becomes
legacy-cohort-only for Session roots without retiring downstream Team/Game compatibility.

**Tech Stack:** PostgreSQL/Supabase migrations, PL/pgSQL, RLS, deferred constraint triggers,
command receipts, JSONB, TypeScript application ports, Supabase RPC adapter, Node test runner, real
PostgreSQL integration harness.

**Spec:** `docs/superpowers/specs/2026-08-29-xs-w3-07-session-cohort-cutover-design.md`

## Global Constraints

- Work only on `exec/c6-w3-07-session-cohort-cutover`, based on W3-06 commit `b4963ed`.
- Use one additive migration at
  `supabase/migrations/20260829120000_target_session_cohort_cutover.sql`; never rewrite an applied
  migration.
- `public.sessions.authority_model` remains the effective selector. The new ledger records
  provenance and must never become a competing authority.
- Only legacy `status = 'draft'` is eligible. Do not widen to `players_selected`, `configured`,
  `teams_generated`, `active`, `paused`, `finished` or `cancelled`.
- Eligibility requires no Game row, no Team row, empty `team_ids`, no deletion and no unexpected
  target artifact. Soft-deleted Game/Team rows still count as evidence and block cutover.
- Never derive `session_context` or `play_mode` from legacy `type`/`config`. They are explicit,
  validated command choices.
- Preserve legacy arrays, config, local ID, sync metadata and timestamps as non-authoritative
  evidence. No destructive contract belongs to W3-07.
- Reuse `app_private.command_receipts`; receipt lookup precedes fingerprint and cohort validation.
- The public SQL positional signature is
  `(p_command_id uuid, p_session_id uuid, p_expected_source_fingerprint text, p_session_context text, p_play_mode text)`,
  matching the W3-06 command convention. The design document's conceptual signature lists intent
  fields rather than fixing their positional order.
- Reuse `app_private.materialize_target_session_roster`; do not introduce a second roster writer.
- Roster conversion is whole-Session exact-or-blocked and creates no Registration/FIFO history.
- `target → legacy` is structurally impossible. A feature flag, client rollback or sync retry cannot
  reverse authority.
- Generic sync loses only target Session roots. Teams, Games, PointEvents and reports remain on
  their current paths until their owning waves.
- Every `SECURITY DEFINER` function uses `set search_path = ''`, fully qualified names and explicit
  revokes from `public`/`anon`; internal helpers are not executable by browser roles.
- Every new `app_private` table enables RLS and grants nothing to `public`, `anon` or
  `authenticated`.
- SQLSTATE convention: `23514` invalid shape/cohort, `42501` authorization, `P0002` missing Session,
  `23505` command collision, `40001` stale source fingerprint, `55000` immutable authority/ledger.
- Reuse and preserve the active `volley_test_pg` PostgreSQL at `127.0.0.1:55432`; never stop or
  recreate the container.
- Do not merge, push or open a Pull Request. Keep the completed branch local for the user.

---

### Task 1: Pin the authority ledger and irreversible selector with failing DB tests

**Files:**
- Create: `src/test/db/sessionCohortCutover.dbtest.ts`
- Modify: none

**Interfaces:**
- Consumes: `src/test/db/harness.ts`, `public.sessions`, `public.create_target_session`.
- Produces: RED expectations for `app_private.session_authority_cutovers`, the target-ledger
  constraint and the one-way authority trigger.

- [ ] **Step 1: Create the real-PostgreSQL fixture scaffold**

Use these imports and harness setup:

```ts
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
```

When configured, rebuild migrations in `test.before`, create a pool, and close both in
`test.after`. Define `newUser`, `call`, `callFailing` and `assertSqlState` with the same concrete
transaction boundaries already used by `sessionRosterRevisions.dbtest.ts`.

- [ ] **Step 2: Write ledger schema and access RED cases**

Assert the exact columns and rules:

```text
session_id uuid primary key
source_authority text not null: NONE | LEGACY
target_model_version integer not null = 1
cutover_kind text not null: NEW_TARGET | LEGACY_EXPLICIT
command_id uuid nullable, unique when present
source_fingerprint text nullable only for NEW_TARGET
cutover_by_user_id uuid nullable FK auth.users ON DELETE SET NULL
cutover_at timestamptz not null
```

Also prove:

- `session_id` references `public.sessions(id) ON DELETE RESTRICT`;
- `command_id` references no mutable command table and is unique when non-null;
- both FKs have complete leading-column btree indexes;
- RLS is enabled and browser roles hold no table/function privilege;
- privileged update/delete fails `55000`, except Auth FK anonymization may set only
  `cutover_by_user_id` to null;
- every existing target Session created before the migration has one `NEW_TARGET` ledger row;
- existing legacy Sessions have no ledger row.

- [ ] **Step 3: Write selector/ledger consistency RED cases**

Prove in separate transactions:

```sql
update public.sessions set authority_model = 'legacy' where id = $1;
```

fails `55000` for a target Session, and:

```sql
update public.sessions
set authority_model = 'target', target_model_version = 1,
    session_context = 'QUICK', play_mode = 'FREE_PLAY',
    lifecycle_status = 'DRAFT', publication_state = 'PRIVATE', revision = 1
where id = $1;
```

fails `55000` for a legacy Session when not issued by the cutover command.

Insert a target-shaped Session directly without a ledger and assert commit fails because the
deferred invariant sees no provenance. Assert `create_target_session` still commits and produces
exactly one ledger row.

- [ ] **Step 4: Run focused RED**

```powershell
$env:VOLLEY_TEST_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:55432/volley_test'
node scripts/db-harness.mjs sessionCohortCutover.dbtest.ts
```

Expected: `42P01`/`42703`/missing-trigger assertions only. Harness, fixture and TypeScript failures
must be corrected before production SQL is written.

- [ ] **Step 5: Commit the RED contract**

```powershell
npx prettier --check src/test/db/sessionCohortCutover.dbtest.ts
npx eslint src/test/db/sessionCohortCutover.dbtest.ts
npm run typecheck
git diff --check
git add -- src/test/db/sessionCohortCutover.dbtest.ts
git commit -m "test: specify Session authority ledger"
```

---

### Task 2: Implement the target Session provenance ledger and one-way authority guard

**Files:**
- Create: `supabase/migrations/20260829120000_target_session_cohort_cutover.sql`
- Modify: `src/test/db/sessionCohortCutover.dbtest.ts` only for demonstrated test-harness defects

**Interfaces:**
- Consumes: `public.sessions`, `public.create_target_session`, Auth users and existing target
  organizer/court bootstrap.
- Produces: `app_private.session_authority_cutovers`,
  `app_private.guard_session_authority_transition()`,
  `app_private.assert_target_session_authority_ledger()`, and ledger-integrated
  `public.create_target_session(...) → uuid`.

- [ ] **Step 1: Create the ledger table and immutability guard**

Implement the table with literal constraints:

```sql
create table app_private.session_authority_cutovers (
  session_id uuid primary key references public.sessions(id) on delete restrict,
  source_authority text not null check (source_authority in ('NONE', 'LEGACY')),
  target_model_version integer not null check (target_model_version = 1),
  cutover_kind text not null check (cutover_kind in ('NEW_TARGET', 'LEGACY_EXPLICIT')),
  command_id uuid,
  source_fingerprint text,
  cutover_by_user_id uuid references auth.users(id) on delete set null,
  cutover_at timestamptz not null default pg_catalog.now(),
  check (
    (cutover_kind = 'NEW_TARGET' and source_authority = 'NONE' and source_fingerprint is null)
    or
    (cutover_kind = 'LEGACY_EXPLICIT' and source_authority = 'LEGACY'
      and nullif(pg_catalog.btrim(source_fingerprint), '') is not null
      and command_id is not null)
  )
);

create unique index session_authority_cutovers_command_idx
  on app_private.session_authority_cutovers (command_id) where command_id is not null;
create index session_authority_cutovers_actor_idx
  on app_private.session_authority_cutovers (cutover_by_user_id);
```

Add the same narrowly scoped Auth `SET NULL` exemption used by command receipts; reject every other
update/delete with `55000`.

- [ ] **Step 2: Backfill existing target creation provenance**

Insert one `NEW_TARGET` row for every existing `sessions.authority_model = 'target'`, using null
command/fingerprint/actor and `coalesce(created_at, now())` as `cutover_at`. Use `ON CONFLICT
(session_id) DO NOTHING` so replay remains idempotent.

- [ ] **Step 3: Add the one-way selector trigger**

`app_private.guard_session_authority_transition()` must execute before update:

```plpgsql
if old.authority_model = 'target' and new.authority_model <> 'target' then
  raise exception 'Target Session authority cannot return to legacy' using errcode = '55000';
end if;

if old.authority_model = 'legacy' and new.authority_model = 'target'
   and coalesce(current_setting('app.session_authority_cutover', true), '') <> 'on' then
  raise exception 'Use the Session cohort cutover command' using errcode = '55000';
end if;
```

Do not intercept updates that keep the same authority selector.

- [ ] **Step 4: Add the deferred target-ledger invariant**

After the target-row backfill in Step 2, create a deferred constraint trigger on Session insert and
authority/version update. At transaction end, it must raise `55000` unless a target Session has
exactly one ledger row whose
`target_model_version` equals `sessions.target_model_version`. Legacy Sessions must not be forced to
have a ledger row.

- [ ] **Step 5: Replace `create_target_session` without changing its public signature**

Copy the final W3-03 definition, preserving all validation, Membership/Organizer checks, default
organizer assignment and `Quadra 1`. After the Session insert, add:

```sql
insert into app_private.session_authority_cutovers (
  session_id, source_authority, target_model_version, cutover_kind,
  command_id, source_fingerprint, cutover_by_user_id
)
values (p_session_id, 'NONE', 1, 'NEW_TARGET', null, null, v_uid);
```

Keep its existing revoke/grant signature unchanged.

- [ ] **Step 6: Apply internal security**

Enable RLS on the ledger; revoke table access and execution of all new private trigger helpers from
`public`, `anon` and `authenticated`. Keep `app_private` outside the Data API browser surface.

- [ ] **Step 7: Run focused GREEN and commit**

```powershell
$env:VOLLEY_TEST_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:55432/volley_test'
node scripts/db-harness.mjs sessionCohortCutover.dbtest.ts
npx prettier --check src/test/db/sessionCohortCutover.dbtest.ts supabase/migrations/20260829120000_target_session_cohort_cutover.sql
npx eslint src/test/db/sessionCohortCutover.dbtest.ts
npm run typecheck
git diff --check
git add -- supabase/migrations/20260829120000_target_session_cohort_cutover.sql src/test/db/sessionCohortCutover.dbtest.ts
git commit -m "feat: persist target Session authority provenance"
```

---

### Task 3: Specify the exact legacy cutover inspection and roster resolution

**Files:**
- Modify: `src/test/db/sessionCohortCutover.dbtest.ts`
- Modify: `supabase/migrations/20260829120000_target_session_cohort_cutover.sql` only in Task 4

**Interfaces:**
- Consumes: legacy Session rows, Players and target artifact tables.
- Produces: RED expectations for
  `app_private.legacy_session_cutover_fingerprint(public.sessions) → text`,
  `app_private.resolve_legacy_session_roster(public.sessions) → jsonb`, and
  `public.inspect_legacy_session_cutover(uuid)`.

- [ ] **Step 1: Pin the authorized inspection result**

Use this result shape:

```ts
interface CutoverInspectionRow extends QueryResultRow {
  eligible: boolean;
  blockers: string[];
  source_fingerprint: string;
  selected_player_count: number;
}
```

For an owned Community-less legacy draft with empty arrays and no execution evidence, assert:

```ts
assert.deepEqual(rows[0].blockers, []);
assert.equal(rows[0].eligible, true);
assert.match(rows[0].source_fingerprint, /^[0-9a-f]{32}$/);
assert.equal(rows[0].selected_player_count, 0);
```

An unknown Session returns `P0002`; another user's Quick Session and a cross-Community UUID return
`42501`, not an `UNAUTHORIZED` blocker.

- [ ] **Step 2: Pin every bounded eligibility blocker**

Create independent fixtures and assert deterministic sorted blockers for:

```text
NOT_LEGACY
NOT_DRAFT
SOFT_DELETED
HAS_GAME_EVIDENCE
HAS_TEAM_EVIDENCE
HAS_TARGET_ARTIFACTS
ROSTER_TOKEN_REPEATED
ROSTER_TOKEN_UNRESOLVED
ROSTER_TOKEN_AMBIGUOUS
ROSTER_PLAYERS_COLLIDE
```

Use non-terminal, terminal and soft-deleted Game rows to prove every Game row blocks. Use both a
non-empty `team_ids` array and a `teams` table row to prove either Team representation blocks.

- [ ] **Step 3: Pin exact roster resolution**

Create one Player referenced by UUID and one referenced by owner-scoped `local_id`. Assert the
private resolver returns ordered entries containing:

```json
{
  "entry_order": 0,
  "identity_kind": "PLAYER",
  "player_id": "<resolved UUID>",
  "display_name": "<nickname-or-name>",
  "source_ordinal": 1,
  "source_token": "<legacy token>"
}
```

Assert the source hash equals the existing terminal importer hash definition
`md5(to_jsonb(selected_player_ids)::text)`.

- [ ] **Step 4: Pin fingerprint coverage**

Inspect, mutate each authority-relevant legacy field in separate rolled-back probes, and assert the
fingerprint changes for: status, type, selected/team arrays, config, Community, name, date,
location, notes, deletion/control fields, local ID, sync version and `updated_at`. Changes to target
ledger rows must not enter this source fingerprint.

- [ ] **Step 5: Run focused RED and commit**

```powershell
$env:VOLLEY_TEST_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:55432/volley_test'
node scripts/db-harness.mjs sessionCohortCutover.dbtest.ts
git add -- src/test/db/sessionCohortCutover.dbtest.ts
git commit -m "test: specify legacy Session cutover inspection"
```

Expected: `42883` for the missing inspector/helpers, with the ledger cases remaining green.

---

### Task 4: Implement shared exact resolution and the inspection RPC

**Files:**
- Modify: `supabase/migrations/20260829120000_target_session_cohort_cutover.sql`
- Modify: `src/test/db/sessionCohortCutover.dbtest.ts` only for demonstrated fixture defects

**Interfaces:**
- Consumes: locked or read-only `public.sessions` composite values and current Player mappings.
- Produces: fingerprint/resolver helpers and
  `public.inspect_legacy_session_cutover(uuid) → table(eligible boolean, blockers text[], source_fingerprint text, selected_player_count integer)`.

- [ ] **Step 1: Implement the full source fingerprint**

Build a `jsonb_build_object` with the exact legacy fields named in Task 3, normalize timestamps to
UTC text, then return `md5(payload::text)`. Do not include `authority_model`, target semantic fields,
target revision or ledger data.

- [ ] **Step 2: Extract the roster resolver**

Move the existing token-candidate algorithm from the applied migration's
`app_private.import_legacy_session_rosters(text)` behind:

```sql
app_private.resolve_legacy_session_roster(p_session public.sessions)
returns jsonb
```

Return exactly:

```json
{
  "source_hash": "...",
  "blockers": [],
  "entries": []
}
```

Use the existing reason vocabulary from the importer and map it to the bounded cutover blockers.
In the new additive migration, use `CREATE OR REPLACE FUNCTION` with the full current importer body
and replace only its local resolution block with this helper's `source_hash`, `blockers` and
`entries`; never edit its earlier migration. Terminal import must still quarantine and create the
same provenance rows.

- [ ] **Step 3: Implement one private eligibility evaluator**

Create:

```sql
app_private.inspect_legacy_session_cutover_state(p_session public.sessions)
returns jsonb
```

Append blockers in fixed lexical order. Check Games/Teams without filtering `deleted_at`. Count any
unexpected row in organizer assignments, courts, rules snapshots, roster revisions or participants
as `HAS_TARGET_ARTIFACTS`.

- [ ] **Step 4: Implement the public inspector**

Resolve the Session first, fail `P0002` when absent, then authorize:

- Community-less: `owner_id = auth.uid()`;
- Community: active Membership plus active `ORGANIZER` responsibility, matching
  `create_target_session`.

Only after authorization call the private evaluator. Return no actor/Community identity and grant
execution only to `authenticated`.

- [ ] **Step 5: Run focused and regression GREEN**

```powershell
$env:VOLLEY_TEST_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:55432/volley_test'
node scripts/db-harness.mjs sessionCohortCutover.dbtest.ts
node scripts/db-harness.mjs sessionRosterRevisions.dbtest.ts
```

The second suite proves the shared resolver did not alter terminal historical import semantics.

- [ ] **Step 6: Commit the inspection slice**

```powershell
git add -- supabase/migrations/20260829120000_target_session_cohort_cutover.sql src/test/db/sessionCohortCutover.dbtest.ts
git commit -m "feat: inspect legacy Session cutover eligibility"
```

---

### Task 5: Specify the explicit cutover command, atomicity and concurrency

**Files:**
- Modify: `src/test/db/sessionCohortCutover.dbtest.ts`

**Interfaces:**
- Consumes: inspector fingerprint, command receipts, roster materializer, organizer assignments and
  authority ledger.
- Produces: RED expectations for
  `public.transition_legacy_session_to_target(uuid, uuid, text, text, text)`.

- [ ] **Step 1: Pin a successful empty-roster Quick transition**

Call:

```sql
select * from public.transition_legacy_session_to_target(
  p_command_id := $1,
  p_session_id := $2,
  p_expected_source_fingerprint := $3,
  p_session_context := 'QUICK',
  p_play_mode := 'FREE_PLAY'
);
```

Expect `{session_id, session_revision, authority_model, target_model_version}` with revision `1`,
authority `target` and version `1`. Assert one Quick organizer assignment, zero courts, zero rules,
zero roster revision, one ledger row and one command receipt. Readiness must contain
`NO_EFFECTIVE_ROSTER`, `RULES_INVALID` and `COURT_CONFIGURATION_INVALID`.

- [ ] **Step 2: Pin exact roster materialization during transition**

Transition a draft containing UUID and owner-local Player tokens. Assert one immutable revision
with `source_kind = LEGACY_SELECTED_ROSTER`, exact order/snapshots/hash, nullable Registration
revision, no Registration table writes and no FIFO timestamp/sequence fabrication. Legacy
`selected_player_ids`, config and local metadata remain byte-for-byte unchanged.

- [ ] **Step 3: Pin explicit dimensions and contextual authorization**

Assert:

- legacy `type = tournament` can transition to explicit `play_mode = FREE_PLAY` without inference;
- invalid context/play-mode values fail `23514`;
- `QUICK` with a Community and `COMMUNITY` without one fail `23514`;
- Community transition requires active Membership and active `ORGANIZER` responsibility;
- the authenticated caller, not legacy `owner_id`, becomes the exact target assignment;
- another Community organizer cannot use a UUID outside their Community.

- [ ] **Step 4: Pin idempotency and all-or-nothing behavior**

Prove:

- same `command_id` retry returns identical rows after cutover even with a stale fingerprint;
- reusing the command ID for another Session or command type fails `23505`;
- two distinct command IDs for the same completed cutover return the same target state, create one
  ledger/roster/assignment, and each receive a receipt;
- an injected invalid roster, ledger conflict or assignment failure rolls back the Session selector
  and every target artifact.

- [ ] **Step 5: Pin source and cutover races**

Use two pooled clients and explicit transactions:

1. inspector returns fingerprint F1;
2. legacy writer commits a field change;
3. cutover with F1 fails `40001` and leaves legacy authority;
4. reinspection returns F2 and cutover succeeds.

Then run two concurrent transitions with F2 and different command IDs. Both must settle on one
target authority, one ledger and one materialized roster. Finally attempt an authenticated legacy
update after commit and prove it changes zero rows or raises authorization without changing target
state.

- [ ] **Step 6: Run focused RED and commit**

```powershell
$env:VOLLEY_TEST_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:55432/volley_test'
node scripts/db-harness.mjs sessionCohortCutover.dbtest.ts
git add -- src/test/db/sessionCohortCutover.dbtest.ts
git commit -m "test: specify explicit Session cohort transition"
```

Expected: `42883` for the missing transition RPC; all inspection/ledger cases remain green.

---

### Task 6: Implement the atomic idempotent cutover command

**Files:**
- Modify: `supabase/migrations/20260829120000_target_session_cohort_cutover.sql`
- Modify: `src/test/db/sessionCohortCutover.dbtest.ts` only for demonstrated fixture defects

**Interfaces:**
- Consumes: `app_private.find_command_receipt`, `record_command_receipt`, fingerprint/evaluator,
  roster materializer and ledger.
- Produces:
  `public.transition_legacy_session_to_target(uuid, uuid, text, text, text) → table(session_id uuid, session_revision integer, authority_model text, target_model_version integer)`.

- [ ] **Step 1: Implement receipt-first lookup and row locking**

Validate non-null IDs/fingerprint, call:

```sql
app_private.find_command_receipt(
  p_command_id,
  'transition_legacy_session_to_target',
  p_session_id
)
```

before reading authority/fingerprint. Return a found receipt immediately. Then load the Session
`FOR UPDATE`, fail `P0002` when absent, and derive `v_uid := auth.uid()`.

- [ ] **Step 2: Implement authorization and explicit dimension checks**

Use the same Quick/Community rules as the inspector. Validate only `QUICK | COMMUNITY` and
`FREE_PLAY | STRUCTURED_MATCHES`, with Community presence matching context. Resolve the exact
active Membership ID for a Community assignment.

- [ ] **Step 3: Implement domain-level idempotency for a completed cutover**

When the locked row is already target, read its ledger. If it records `LEGACY_EXPLICIT` with the
same source fingerprint and the locked Session root has the same requested `session_context` and
`play_mode`, create a receipt for the new command ID and return the current revision. Any other
target row fails `23514`; never treat a new-target Session as a migrated legacy draft.

- [ ] **Step 4: Validate fingerprint and eligibility under the lock**

Recompute the fingerprint and raise `40001` on mismatch. Call the single private evaluator and
raise `23514` listing its bounded blockers when non-empty. Do not partially resolve/materialize a
blocked roster.

- [ ] **Step 5: Materialize the target graph atomically**

When roster entries are non-empty, call `materialize_target_session_roster` once using a generated
roster revision UUID, source `LEGACY_SELECTED_ROSTER`, source Session revision `1`, null
Registration revision, exact source hash and current actor. Create no Court or RulesSnapshot.

Insert one organizer assignment. Set transaction-local
`app.session_authority_cutover = 'on'`, then update the root to:

```text
authority_model = target
target_model_version = 1
session_context = explicit input
play_mode = explicit input
lifecycle_status = DRAFT
publication_state = PRIVATE
revision = 1
status/type = target compatibility mapping
actual/cancellation fields = null
```

Leave legacy evidence fields untouched. Insert the `LEGACY_EXPLICIT` ledger row with command,
fingerprint, actor and server time.

- [ ] **Step 6: Record and return the command result**

Store this JSON under retention class `SESSION_AUTHORITY_CUTOVER`:

```json
{
  "session_id": "...",
  "session_revision": 1,
  "authority_model": "target",
  "target_model_version": 1
}
```

Grant the public RPC only to `authenticated`; keep all private helpers revoked.

- [ ] **Step 7: Run focused GREEN, all W3 DB suites and commit**

```powershell
$env:VOLLEY_TEST_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:55432/volley_test'
node scripts/db-harness.mjs sessionCohortCutover.dbtest.ts
node scripts/db-harness.mjs sessionTargetRoot.dbtest.ts
node scripts/db-harness.mjs sessionOrganizerAssignments.dbtest.ts
node scripts/db-harness.mjs sessionCourts.dbtest.ts
node scripts/db-harness.mjs sessionRulesSnapshots.dbtest.ts
node scripts/db-harness.mjs sessionRosterRevisions.dbtest.ts
node scripts/db-harness.mjs sessionLifecycleCommands.dbtest.ts
npx prettier --check src/test/db/sessionCohortCutover.dbtest.ts supabase/migrations/20260829120000_target_session_cohort_cutover.sql
npx eslint src/test/db/sessionCohortCutover.dbtest.ts
npm run typecheck
git diff --check
git add -- supabase/migrations/20260829120000_target_session_cohort_cutover.sql src/test/db/sessionCohortCutover.dbtest.ts
git commit -m "feat: cut over eligible legacy Sessions"
```

---

### Task 7: Add the application cutover contract and Supabase inspection adapter

**Files:**
- Create: `src/application/sessionCohortCutover.ts`
- Create: `src/application/sessionCohortCutover.test.ts`
- Create: `src/infra/supabase/sessionCohortCloudService.ts`
- Create: `src/infra/supabase/sessionCohortCloudService.test.ts`

**Interfaces:**
- Consumes: existing `CommandPort`, `CommandEnvelope`, Supabase RPC client and the two DB RPCs.
- Produces: `SessionCohortInspectionGateway`, `inspectLegacySessionCutover`,
  `transitionLegacySessionCommand`, and `createSessionCohortCloudService`.

- [ ] **Step 1: Write application RED tests**

Pin these exact types/operations:

```ts
export type TargetSessionContext = 'QUICK' | 'COMMUNITY';
export type TargetSessionPlayMode = 'FREE_PLAY' | 'STRUCTURED_MATCHES';

export interface SessionCutoverInspection {
  readonly eligible: boolean;
  readonly blockers: readonly string[];
  readonly sourceFingerprint: string;
  readonly selectedPlayerCount: number;
}

export interface SessionCohortInspectionGateway {
  inspect(sessionId: string): Promise<SessionCutoverInspection>;
}
```

Assert the command builder creates one UUID and uses it both as `envelope.commandId` and payload
`p_command_id`, while payload includes only Session ID, expected fingerprint, context and play mode.
It must contain no actor, role, capability, Community or authority field.

- [ ] **Step 2: Implement the application module and pass its tests**

Export:

```ts
export const SESSION_COHORT_OPERATIONS = {
  transition: 'transition_legacy_session_to_target',
} as const;
```

`inspectLegacySessionCutover(gateway, sessionId)` delegates without adding context.
`transitionLegacySessionCommand(...)` returns the exact envelope tested above.
`executeSessionCohortTransition(port, command, clientRelease?)` calls the existing CommandPort with
`withAttempt`.

- [ ] **Step 3: Write infrastructure adapter RED tests**

Use an injected fake `RpcClient`. Assert it calls `inspect_legacy_session_cutover` with only
`p_session_id`, maps snake_case to the application type, accepts Supabase's one-row array or object
shape, and throws on RPC error or malformed response.

- [ ] **Step 4: Implement the injected adapter and singleton**

Follow this factory boundary:

```ts
export function createSessionCohortCloudService(
  client: RpcClient,
): SessionCohortInspectionGateway
```

Export a configured singleton using the existing `supabase` client and an unavailable stub when
Supabase is not configured. Do not place direct Supabase access in the application module.

- [ ] **Step 5: Verify and commit**

```powershell
node --import tsx --test src/application/sessionCohortCutover.test.ts src/infra/supabase/sessionCohortCloudService.test.ts
npx eslint src/application/sessionCohortCutover.ts src/application/sessionCohortCutover.test.ts src/infra/supabase/sessionCohortCloudService.ts src/infra/supabase/sessionCohortCloudService.test.ts
npx prettier --check src/application/sessionCohortCutover.ts src/application/sessionCohortCutover.test.ts src/infra/supabase/sessionCohortCloudService.ts src/infra/supabase/sessionCohortCloudService.test.ts
npm run typecheck
git add -- src/application/sessionCohortCutover.ts src/application/sessionCohortCutover.test.ts src/infra/supabase/sessionCohortCloudService.ts src/infra/supabase/sessionCohortCloudService.test.ts
git commit -m "feat: add Session cohort application port"
```

---

### Task 8: Subtract target Session roots from generic operational sync

**Files:**
- Modify: `src/infra/supabase/operationalCloudService.ts`
- Create: `src/infra/supabase/operationalCloudService.test.ts`
- Modify: `src/architecture/fitnessManifest.ts`
- Modify: `src/architecture/legacyContracts.transitional.test.ts`

**Interfaces:**
- Consumes: legacy `Session`, Supabase query builder and the persisted authority selector.
- Produces: legacy-only Session fetch/upsert mapping and architecture fitness
  `AF-TARGET-005`.

- [ ] **Step 1: Write pure adapter RED tests**

Export and test:

```ts
mapSessionToDb(session, ownerId).authority_model === 'legacy'
scopeOperationalFetch('sessions', query)
scopeOperationalFetch('games', query)
```

Use a fake query object whose `eq(column, value)` records calls. Sessions must record exactly
`['authority_model', 'legacy']`; other operational tables must record no cohort filter.

Add an error-classification test for:

```ts
new TargetSessionRequiresSemanticCommandError(sessionId)
```

with stable `code = 'TARGET_SESSION_REQUIRES_SEMANTIC_COMMAND'` and no user/Community payload.

- [ ] **Step 2: Write the architecture RED assertion**

Register `AF-TARGET-005` in `fitnessManifest.ts`:

```text
owner: Session W3 / Migration W13
lifecycle: TARGET
protects: target Session roots never enter generic operational sync authority or timestamp merge
replacement trigger: replace only with an equal or stronger target Session boundary
slice: XS-W3-07
```

In `legacyContracts.transitional.test.ts`, prove generic sync still exists for legacy entities while
`mapSessionToDb` explicitly emits `legacy` and `scopeOperationalFetch` excludes target Session
roots. This is a subtraction, not deletion of `OperationalSyncPayload.sessions`.

- [ ] **Step 3: Apply the cohort filter to every paginated Session fetch**

Change `fetchRows` so it builds the select query, passes it through
`scopeOperationalFetch(table, query)`, then applies `.range(from, to)`. The filter must be applied on
every page, not only the first page.

- [ ] **Step 4: Make every generic Session write explicitly legacy**

Add `authority_model: 'legacy'` to `mapSessionToDb`. Keep target fields absent. On a Session upsert
error with SQLSTATE `42501`, perform a read-only authority lookup by `(owner_id, local_id)` and by
primary ID. If the visible matching row is target, throw
`TargetSessionRequiresSemanticCommandError`; otherwise rethrow the original authorization error.

This lookup classifies the error but never authorizes the write. RLS and the one-way DB trigger
remain the race fence.

- [ ] **Step 5: Pin sync-service behavior without retiring child entities**

Extend `syncService.test.ts` to prove:

- a target-cohort rejection leaves the local Session pending and reports one sync issue;
- Team/Game child uploads remain callable for legacy-supported cohorts;
- downloaded target Sessions are absent from `mergeEntityLists` because operational fetch never
  returns them.

Do not add authority fields to `Session`, `LocalSyncPayload` or `OperationalSyncPayload`.

- [ ] **Step 6: Verify focused tests and architecture gates**

```powershell
node --import tsx --test src/infra/supabase/operationalCloudService.test.ts src/infra/supabase/syncService.test.ts src/architecture/legacyContracts.transitional.test.ts
npx eslint src/infra/supabase/operationalCloudService.ts src/infra/supabase/operationalCloudService.test.ts src/infra/supabase/syncService.test.ts src/architecture/fitnessManifest.ts src/architecture/legacyContracts.transitional.test.ts
npx prettier --check src/infra/supabase/operationalCloudService.ts src/infra/supabase/operationalCloudService.test.ts src/infra/supabase/syncService.test.ts src/architecture/fitnessManifest.ts src/architecture/legacyContracts.transitional.test.ts
npm run typecheck
npm run check:architecture
git diff --check
```

- [ ] **Step 7: Commit the sync subtraction**

```powershell
git add -- src/infra/supabase/operationalCloudService.ts src/infra/supabase/operationalCloudService.test.ts src/infra/supabase/syncService.test.ts src/architecture/fitnessManifest.ts src/architecture/legacyContracts.transitional.test.ts
git commit -m "fix: fence target Sessions from generic sync"
```

---

### Task 9: Verify the W3 exit gate and preserve local branch evidence

**Files:**
- Modify only when a new failing test demonstrates an XS-W3-07 defect

**Interfaces:**
- Consumes: the complete W3-07 branch.
- Produces: fresh structural, semantic, application, sync and operational evidence.

- [ ] **Step 1: Review the migration security surface**

Query `pg_proc`, `information_schema.routine_privileges`, `pg_class`, `pg_policies`,
`pg_constraint` and `pg_index` to confirm:

- all public cutover RPCs are authenticated-only;
- all private helpers and ledger tables are unreachable to browser roles;
- every target Session has one ledger row;
- every FK has a leading-column index;
- the one-way and deferred constraint triggers are enabled;
- no function uses an unsafe mutable search path.

- [ ] **Step 2: Run changed-path static gates**

```powershell
npx eslint src/test/db/sessionCohortCutover.dbtest.ts src/application/sessionCohortCutover.ts src/application/sessionCohortCutover.test.ts src/infra/supabase/sessionCohortCloudService.ts src/infra/supabase/sessionCohortCloudService.test.ts src/infra/supabase/operationalCloudService.ts src/infra/supabase/operationalCloudService.test.ts src/infra/supabase/syncService.test.ts src/architecture/fitnessManifest.ts src/architecture/legacyContracts.transitional.test.ts
npx prettier --check docs/superpowers/specs/2026-08-29-xs-w3-07-session-cohort-cutover-design.md docs/superpowers/plans/2026-08-29-xs-w3-07-session-cohort-cutover.md src/test/db/sessionCohortCutover.dbtest.ts supabase/migrations/20260829120000_target_session_cohort_cutover.sql src/application/sessionCohortCutover.ts src/application/sessionCohortCutover.test.ts src/infra/supabase/sessionCohortCloudService.ts src/infra/supabase/sessionCohortCloudService.test.ts src/infra/supabase/operationalCloudService.ts src/infra/supabase/operationalCloudService.test.ts src/infra/supabase/syncService.test.ts src/architecture/fitnessManifest.ts src/architecture/legacyContracts.transitional.test.ts
git diff exec/c6-w3-06-session-lifecycle-readiness...HEAD --check
```

- [ ] **Step 3: Run repository gates in CI order**

```powershell
npm run typecheck
npm run lint:eslint
npm run format:check
npm test
npm run build
npm run check:architecture
```

If global lint/format reports known unrelated paths, demonstrate that none occur in
`git diff exec/c6-w3-06-session-lifecycle-readiness...HEAD --name-only`; never reformat unrelated
user files.

- [ ] **Step 4: Run the complete database suite twice**

```powershell
$env:VOLLEY_TEST_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:55432/volley_test'
npm run test:db
npm run test:db
```

Both runs must rebuild from zero and finish with identical green totals.

- [ ] **Step 5: Inspect authority/cohort evidence directly**

Run read-only SQL proving:

```text
target Sessions without ledger = 0
target Sessions with target_model_version != ledger version = 0
legacy Sessions with authority ledger = 0
active/paused legacy Sessions relabeled target by migration = 0
terminal historical Sessions relabeled target by migration = 0
```

Also run a static search proving target Session commands contain no generic `.upsert()` and the
generic operational Session query contains the explicit legacy cohort filter.

- [ ] **Step 6: Inspect branch and Docker state**

```powershell
git status --short --branch
git log --oneline --decorate exec/c6-w3-06-session-lifecycle-readiness..HEAD
docker ps --filter name=volley_test_pg --format "{{.Names}}|{{.Status}}|{{.Ports}}"
```

Expected: only XS-W3-07 commits, clean tracked worktree, no push/merge, and `volley_test_pg` still
active on port `55432`.

- [ ] **Step 7: Perform final two-stage review before completion**

Request a spec-compliance review against the approved design, fix every verified Critical or
Important finding with a failing test first, then request a code-quality/security review of the
final diff. Re-run the proportionate focused and full gates after every fix commit.

Do not claim W3 complete until reviewers and executable evidence agree that:

- one effective Session authority exists per row;
- strict legacy draft transition is explicit, exact, idempotent and race-fenced;
- active and terminal legacy cohorts were not silently relabeled;
- target authority cannot reverse;
- generic sync cannot fetch/merge/write target Session roots;
- W4 can select target Sessions by persisted `authority_model` plus model version.
