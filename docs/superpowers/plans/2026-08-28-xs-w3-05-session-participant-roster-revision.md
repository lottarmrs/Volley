# XS-W3-05 SessionParticipant and RosterRevision Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give target Quick Sessions an authorized, immutable, ordered roster revision containing
linked Players and Guests, and import only provably trustworthy terminal legacy rosters without
inventing Registration history.

**Architecture:** Add `SessionParticipant` as contextual current state and
`RosterRevision`/`RosterRevisionEntry` as immutable snapshots. A revision-checked Quick semantic
command owns all target roster mutation and returns an exact roster identity. A separate private
import migration materializes terminal legacy arrays with provenance or quarantines the complete
Session when identity resolution is not exact.

**Tech Stack:** PostgreSQL/Supabase migrations, RLS, PL/pgSQL semantic commands, JSONB, Node test
runner, real PostgreSQL integration harness.

**Design:**
`docs/superpowers/specs/2026-08-28-xs-w3-05-session-participant-roster-revision-design.md`

**Architecture sources:** `docs/architecture/execution/C6.02-W3-W6-SESSION-REGISTRATION-RATING-TEAM.md`
XS-W3-05 and XS-W3-07; `docs/architecture/contexts/N2.04-sessions.md` N3.04.11–12;
`docs/architecture/matrices/C5.02-COMMAND-QUERY-TRANSACTION-MATRIX.md` and
`docs/architecture/matrices/C5.06-MIGRATION-DEPRECATION-DEPENDENCY-MATRIX.md`.

## Global Constraints

- Preserve the additive strangler boundary. Legacy Sessions retain their authority model and
  `selected_player_ids[]`; target command/read paths never use that array.
- `SessionParticipant` is `CURRENT_STATE`; roster revisions and entries are
  `IMMUTABLE_SNAPSHOT`.
- Quick target roster writes are semantic-command-only. Community roster materialization remains
  reserved for W4 `FinalizeSessionRoster`.
- A Guest never creates or deduplicates a global Player. Equal Guest names are legal.
- Player and auth-user deletion must not cascade into roster history.
- Session hard deletion is restricted once target roster history exists; target lifecycle uses
  cancellation.
- Every new Data API table receives explicit grants in addition to RLS.
- Every `SECURITY DEFINER` function uses `set search_path = ''`, qualified objects, and explicit
  execution revokes.
- Cover every foreign key with a complete leading-column btree index, including nullable actor and
  Player references.
- Apply migrations in chronological filename order through `npx supabase migration new`.
- Reuse and preserve the active `volley_test_pg` Docker PostgreSQL on `127.0.0.1:55432`.

---

### Task 1: Pin the normalized roster and Quick command with failing database tests

**Files:**
- Create: `src/test/db/sessionRosterRevisions.dbtest.ts`
- Modify: none

**Interfaces:**
- Consumes: target Session creation, Session Organizer Assignment, target Session read visibility,
  Player identity, target Community memberships, and Session revision.
- Produces: executable expectations for the three roster tables,
  `replace_target_quick_session_roster`, and `read_target_roster_revision`.

- [ ] **Step 1: Build reusable real-database fixtures**

Use the existing DB harness pattern from `sessionRulesSnapshots.dbtest.ts`: rebuild every migration
in `before`, connect calls through `asIdentityCommitting`, create users through `auth.users` plus
`profiles`, and create target Sessions through `public.create_target_session`.

Add helpers for:

```typescript
createPlayer(ownerId, { id, localId, name, nickname, userId })
replaceQuickRoster(actorId, { revisionId, sessionId, expectedRevision, participants })
readRoster(actorId, revisionId)
assertSqlState(error, code)
```

Payload builders must preserve array order and caller-supplied final UUIDs.

- [ ] **Step 2: Write schema and truth-class RED tests**

Pin these literal properties:

- `session_participants`, `roster_revisions`, and `roster_revision_entries` exist with the columns
  and checks in the approved design;
- a Guest cannot carry a Player FK, entry order cannot be negative, revision numbers start above
  zero, and only supported source/status values are accepted;
- composite FKs reject a revision entry whose participant belongs to another Session;
- a linked Player is unique per Session but two Guests with the same display name are legal;
- Session, Player, and actor foreign keys use respectively `RESTRICT`, `SET NULL`, and `SET NULL`;
- every FK has a complete leading-column btree index;
- privileged `UPDATE` or `DELETE` of a roster revision or entry fails with SQLSTATE `55000`;
- deleting a Player nulls roster Player references while preserving identity kind and display
  snapshots.

- [ ] **Step 3: Write Quick command RED tests**

The happy path creates one Player participant and two same-name Guests, preserving payload order:

```typescript
const result = await replaceQuickRoster(organizer, {
  revisionId,
  sessionId,
  expectedRevision: 1,
  participants: [
    { participant_id: playerParticipantId, identity_kind: 'PLAYER', player_id: playerId },
    { participant_id: guestOneId, identity_kind: 'GUEST', display_name: 'Ana' },
    { participant_id: guestTwoId, identity_kind: 'GUEST', display_name: 'Ana' },
  ],
});
assert.deepEqual(result.rows, [{
  roster_revision_id: revisionId,
  roster_revision_number: 1,
  session_revision: 2,
}]);
```

Assert persisted source `QUICK_DIRECT`, source Session revision `1`, nickname-first Player display,
trimmed Guest display, `INCLUDED` participant state, and ordered immutable entry snapshots.

Also prove:

- an explicit empty array creates the next valid empty revision and marks omitted participants
  `REMOVED`;
- a later revision reactivates an existing participant without creating a duplicate contextual
  identity;
- a later Guest label changes current state and the new entry but not the prior entry;
- a later Player rename changes the new snapshot but not the prior entry;
- duplicate participant IDs, duplicate Player IDs, blank/oversized Guest names, invalid or extra
  identity shapes, null command values, and participant identity rebinding are rejected before any
  row is inserted;
- an owned Player, account-linked Player, and Player shared through an active target Community
  relation are selectable; an unrelated/inactive/deleted Player is not;
- anonymous callers, outsiders, eligible-but-unassigned organizers, Community Sessions, legacy
  Sessions, and `IN_PROGRESS`/terminal Sessions are rejected;
- authenticated browser roles cannot directly insert, update, or delete any of the three tables.

- [ ] **Step 4: Write read, retry, and concurrency RED tests**

Pin:

- `read_target_roster_revision(revision_id)` returns one header row with exact revision provenance
  and an ordered JSONB entry array, including an empty array for an empty roster;
- authorized active Community readers and the assigned Quick organizer can read through RLS/RPC,
  while outsiders, suspended members, revoked assignments, and anonymous callers cannot;
- retrying the same `roster_revision_id` and identical semantic input returns the original result
  even with the now-stale expected Session revision;
- changing order, participant identity, Player ID, or Guest label under the same revision UUID
  raises an idempotency collision and leaves the original unchanged;
- two distinct revision IDs using the same expected Session revision serialize on the Session
  lock; one commits and the other fails with `40001`;
- any validation failure rolls back participant status changes, revision creation, entries, and
  Session revision advancement;
- catalog inspection proves the public command and exact reader function bodies contain no
  `selected_player_ids` reference.

- [ ] **Step 5: Verify focused RED**

```powershell
$env:VOLLEY_TEST_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:55432/volley_test'
node scripts/db-harness.mjs sessionRosterRevisions.dbtest.ts
```

Expected: product-boundary failures such as `42P01`/`42883` for the missing tables/functions, not
TypeScript or fixture errors.

- [ ] **Step 6: Run focused static checks and commit the RED contract**

```powershell
npx prettier --check src/test/db/sessionRosterRevisions.dbtest.ts docs/superpowers/plans/2026-08-28-xs-w3-05-session-participant-roster-revision.md
npm run typecheck
git diff --check
git add -- src/test/db/sessionRosterRevisions.dbtest.ts docs/superpowers/plans/2026-08-28-xs-w3-05-session-participant-roster-revision.md
git commit -m "test: specify target Session roster revisions"
```

---

### Task 2: Implement the roster schema, access boundary, and Quick semantic command

**Files:**
- Create: exact path returned by `npx supabase migration new target_session_roster_revisions`
- Modify: `src/test/db/sessionRosterRevisions.dbtest.ts` only when RED exposes a test-harness defect
  rather than a product-contract failure

**Interfaces:**
- Consumes: `public.sessions`, `public.players`, `public.community_players`, target
  `public.community_memberships`, `public.assert_target_session_write_authorized`, and
  `app_private.current_user_can_read_target_session`.
- Produces: the three roster tables, private selection/materialization helpers, the public Quick
  command, and the exact-revision reader.

- [ ] **Step 1: Create the migration through the installed CLI**

```powershell
npx supabase --version
npx supabase migration new target_session_roster_revisions
```

Record and edit only the exact path returned by the CLI.

- [ ] **Step 2: Add `session_participants` with contextual identity constraints**

Implement the approved fields and checks. Use final caller-supplied UUIDs for command-created
participants. The Session FK is `ON DELETE RESTRICT`, Player and actor FKs are `ON DELETE SET
NULL`, and a Guest requires a null Player reference. Permit `PLAYER` plus null `player_id` only as
the durable result of later Player erasure; the command itself requires a live Player.

Create:

- unique `(id, session_id)`;
- partial unique `(session_id, player_id)` where Player is non-null;
- Session-, Player-, and actor-leading indexes needed by FKs and read policies.

- [ ] **Step 3: Add immutable revisions and ordered entries**

`roster_revisions` uses caller-supplied UUID, positive `revision_number`, unique
`(session_id, revision_number)`, unique `(id, session_id)`, explicit source shape checks, optional
source Session/Registration revisions, optional source payload hash, nullable actor, and
`ON DELETE RESTRICT` to Session.

`roster_revision_entries` includes `session_id`, zero-based `entry_order`, identity kind, nullable
Player FK, and non-blank display snapshot. Composite FKs to `(roster_revision_id, session_id)` and
`(participant_id, session_id)` enforce aggregate consistency. Add unique revision/order and
revision/participant keys plus every missing FK-leading index.

Add an `app_private` trigger function that raises `55000` for every revision/entry UPDATE or
DELETE. Revoke trigger-function execution from browser roles.

- [ ] **Step 4: Add explicit grants and target Session read policies**

For all three tables:

1. enable RLS;
2. revoke all from `public`, `anon`, and `authenticated`;
3. grant only SELECT to `authenticated`;
4. create SELECT policies using
   `app_private.current_user_can_read_target_session(session_id)`;
5. add no browser mutation policy.

- [ ] **Step 5: Implement narrow Player selection and private materialization helpers**

Create `app_private.current_user_can_select_target_quick_roster_player(uuid)` with exact allowed
paths:

- `players.user_id = auth.uid()`;
- `players.owner_id = auth.uid()`;
- or an active target Community membership joined to a non-deleted `community_players` relation
  for the Player.

Reject deleted Players and avoid delegating to broad legacy role-based write helpers. Make the
function `STABLE SECURITY DEFINER SET search_path = ''` and unavailable to `public`/`anon`.

Create an owner-only `app_private.materialize_target_session_roster(...)` insert helper. It owns
participant upsert/reactivation, omitted-participant removal, next revision allocation, and entry
insertion, but it does not decide caller authorization or Community Registration eligibility.

- [ ] **Step 6: Implement `replace_target_quick_session_roster`**

Use `SECURITY DEFINER SET search_path = ''`, fully qualify every object, revoke from
`public`/`anon`, and grant execute only to `authenticated`.

The function must:

1. require authentication and non-null final command values;
2. load and lock the exact target Session with `FOR UPDATE`;
3. invoke `public.assert_target_session_write_authorized(v_session)`;
4. require `QUICK` plus `DRAFT` or `SCHEDULED`;
5. normalize and validate the entire ordered JSON array in memory/temporary relational form;
6. handle an existing revision UUID before stale revision validation by comparing the stored
   ordered semantic identity payload; Player display-name changes do not alter retry identity;
7. reject a mismatched retry and return an exact matching retry;
8. require expected Session revision for a new UUID;
9. materialize `QUICK_DIRECT` revision and entries atomically;
10. increment Session revision and `updated_at` once and return revision ID/number plus resulting
    Session revision.

Use SQLSTATE `23514` for invalid semantic shape/lifecycle, `42501` for authorization, `P0002` for a
missing target Session, `23505` for idempotency collision, and `40001` for stale concurrency.

- [ ] **Step 7: Add the exact-revision reader**

`public.read_target_roster_revision(uuid)` returns one row containing revision metadata and
`entries jsonb`, ordered by `entry_order`. It returns `[]`, not null, for an empty roster. Resolve
the Session through the revision, require the existing target Session visibility predicate, and
raise `P0002`/`42501` for missing/unauthorized access. It must not read the legacy selected-player
array.

- [ ] **Step 8: Verify focused GREEN and the complete DB suite**

```powershell
$env:VOLLEY_TEST_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:55432/volley_test'
node scripts/db-harness.mjs sessionRosterRevisions.dbtest.ts
npm run test:db
npx prettier --check src/test/db/sessionRosterRevisions.dbtest.ts supabase/migrations/*_target_session_roster_revisions.sql
npm run typecheck
git diff --check
```

- [ ] **Step 9: Commit the core implementation**

```powershell
git add -- supabase/migrations/*_target_session_roster_revisions.sql src/test/db/sessionRosterRevisions.dbtest.ts
git commit -m "feat: materialize target Session roster revisions"
```

---

### Task 3: Pin terminal legacy import and quarantine behavior with failing tests

**Files:**
- Modify: `src/test/db/sessionRosterRevisions.dbtest.ts`

**Interfaces:**
- Consumes: core roster schema and migration provenance substrate.
- Produces: executable expectations for `app_private.import_legacy_session_rosters(text)`.

- [ ] **Step 1: Add exact terminal import RED cases**

Insert legacy Session fixtures directly as the privileged harness and invoke the missing private
import job. Prove:

- `finished` and `cancelled` Sessions with non-empty exact UUID references receive revision one,
  `LEGACY_SELECTED_ROSTER`, null actor/source Session/Registration revisions, exact ordering and
  snapshots;
- an owner-scoped `players.local_id` resolves exactly;
- the source array hash and exact Session→revision plus token→participant mappings are recorded;
- importing does not change `sessions.authority_model`, legacy status, array, revision, or any
  other legacy source field;
- no Registration table, mapping target, queue position, timestamp, or chronology is invented.

- [ ] **Step 2: Add quarantine and cohort RED cases**

Pin whole-Session quarantine for:

- missing token;
- one token matching a Player UUID and a different owner-scoped local ID;
- repeated source token;
- distinct source tokens resolving to the same Player;
- a local-only token when Session actor ownership is null.

Each case records a structured `migration_anomaly` with source Session, rejected tokens/candidates,
and reason. It creates zero participants, revisions, entries, and entity mappings for that Session.

Prove `active`, `paused`, `draft`, `players_selected`, `configured`, `teams_generated`, empty-array,
and already-target Sessions are ignored without fabricated target rows.

- [ ] **Step 3: Add rerun and source-drift RED cases**

Invoke the job twice with different `source_release` values:

- unchanged source reuses the existing revision and participants, creates no duplicate entries,
  and completes the new migration run;
- source changed after import leaves the immutable revision untouched and records a
  source-drift anomaly;
- a run reaches `COMPLETED` with `finished_at`, including when all candidates were skipped or
  quarantined.

- [ ] **Step 4: Verify import RED and commit it**

```powershell
$env:VOLLEY_TEST_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:55432/volley_test'
node scripts/db-harness.mjs sessionRosterRevisions.dbtest.ts
npx prettier --check src/test/db/sessionRosterRevisions.dbtest.ts
npm run typecheck
git diff --check
git add -- src/test/db/sessionRosterRevisions.dbtest.ts
git commit -m "test: specify terminal legacy roster import"
```

Expected RED: `42883` for the missing private import function after all core roster cases remain
green.

---

### Task 4: Implement provenance-bearing legacy roster import

**Files:**
- Create: exact path returned by `npx supabase migration new import_legacy_session_rosters`
- Modify: `src/test/db/sessionRosterRevisions.dbtest.ts` only for proven harness defects

**Interfaces:**
- Consumes: legacy Session arrays, Players, core roster tables, `migration_runs`,
  `migration_entity_map`, and `migration_anomalies`.
- Produces: `app_private.import_legacy_session_rosters(text)` plus one automatic migration-time run.

- [ ] **Step 1: Create the import migration through the CLI**

```powershell
npx supabase migration new import_legacy_session_rosters
```

- [ ] **Step 2: Implement the owner-only import job**

The function creates a `migration_runs` row, loops only over legacy `finished`/`cancelled` Sessions
with non-empty arrays, and resolves every token against the distinct union of exact Player UUID
and owner-scoped local ID candidates.

For each Session, compute all candidate counts and resolved Player duplicates before any target
insert. Invalid sources write one operator-readable, structured anomaly and continue to the next
Session without partial target rows.

Valid sources call the private roster materializer with:

```text
revision_number = 1
source_kind = LEGACY_SELECTED_ROSTER
source_payload_hash = pg_catalog.md5(to_jsonb(selected_player_ids)::text)
created_by_user_id = null
```

Record exact mappings using stable source identities that include Session ID, source ordinal, and
source token. Do not update the legacy Session.

- [ ] **Step 3: Make reruns and source drift explicit**

Before materialization, inspect the one allowed legacy revision for the Session:

- same hash: reuse it, emit no duplicate target rows, and record mappings for the current run;
- different hash: record `LEGACY_ROSTER_SOURCE_CHANGED_AFTER_IMPORT` and preserve the existing
  revision;
- no revision: import normally.

Complete the run with `status = COMPLETED` and `finished_at = now()`. On an unexpected exception,
marking `FAILED` in the same aborted transaction cannot be durable; allow the migration to fail
visibly rather than swallowing infrastructure errors.

- [ ] **Step 4: Lock down and execute the migration-time import**

Use `SECURITY DEFINER SET search_path = ''`, revoke execution from `public`, `anon`, and
`authenticated`, and invoke the job once from the migration with a release identifier derived from
the migration filename. Browser roles receive no access to provenance tables or import helpers.

- [ ] **Step 5: Verify import GREEN and all database tests**

```powershell
$env:VOLLEY_TEST_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:55432/volley_test'
node scripts/db-harness.mjs sessionRosterRevisions.dbtest.ts
npm run test:db
npx prettier --check src/test/db/sessionRosterRevisions.dbtest.ts supabase/migrations/*_import_legacy_session_rosters.sql
npm run typecheck
git diff --check
```

- [ ] **Step 6: Commit the import**

```powershell
git add -- supabase/migrations/*_import_legacy_session_rosters.sql src/test/db/sessionRosterRevisions.dbtest.ts
git commit -m "feat: import terminal legacy Session rosters"
```

---

### Task 5: Verify the XS-W3-05 exit gate and preserve branch evidence

**Files:**
- Modify only if verification exposes an XS-W3-05 defect, with a new failing test before any
  production fix

**Interfaces:**
- Consumes: the complete XS-W3-05 branch.
- Produces: fresh evidence for exact roster identity, immutability, security, migration provenance,
  and preservation of the active Docker service.

- [ ] **Step 1: Run focused changed-file quality gates**

```powershell
npx eslint src/test/db/sessionRosterRevisions.dbtest.ts
npx prettier --check docs/superpowers/specs/2026-08-28-xs-w3-05-session-participant-roster-revision-design.md docs/superpowers/plans/2026-08-28-xs-w3-05-session-participant-roster-revision.md src/test/db/sessionRosterRevisions.dbtest.ts supabase/migrations/*_target_session_roster_revisions.sql supabase/migrations/*_import_legacy_session_rosters.sql
git diff exec/c6-w3-04-session-rules-snapshot...HEAD --check
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

Record global pre-existing ESLint/Prettier findings precisely. Prove every reported tracked path is
unchanged from `exec/c6-w3-04-session-rules-snapshot`; do not silently format unrelated files.

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
git log --oneline --decorate exec/c6-w3-04-session-rules-snapshot..HEAD
docker ps --filter name=volley_test_pg --format "{{.Names}}|{{.Status}}|{{.Ports}}"
```

Expected: only XS-W3-05 commits, clean worktree, no whitespace errors, and
`volley_test_pg` still active on port `55432`.

- [ ] **Step 5: Review the exit gate**

Confirm from executable evidence that:

- target Quick roster mutation uses only the semantic command and exact revision identity;
- linked Players and Guests coexist without global Guest fabrication;
- prior revisions survive Player/Guest renames and actor/Player deletion;
- Community direct roster writes remain impossible until W4;
- exact target roster reads and future Team Formation inputs require no
  `Session.selectedPlayerIds[]`;
- terminal import is exact, provenance-bearing, all-or-nothing per Session, and never invents
  Registration chronology;
- active/upcoming legacy cohorts remain untouched for W3-07.

Authority change: target Quick roster authority moves to the server semantic command only. Legacy
and Community roster authority remain unchanged. Schema phase: EXPAND.
