# XS-W3-04 Session Rules Snapshot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Freeze one immutable, provenance-bearing effective rules snapshot for each target Session before downstream Match-specific freezing.

**Architecture:** Add `public.session_rules_snapshots` as an immutable child artifact of target Session. A revision-checked semantic command either stores an explicit effective JSONB payload or copies the current Community defaults while deriving source identity/version/fingerprint on the server. A generic target-Session visibility resolver consolidates the read boundary shared by Session, Courts, and Rules Snapshot without changing write authority.

**Tech Stack:** PostgreSQL/Supabase migrations, RLS, PL/pgSQL semantic commands, JSONB, Node test runner, real PostgreSQL integration harness.

**Spec:** `docs/architecture/execution/C6.02-W3-W6-SESSION-REGISTRATION-RATING-TEAM.md` — XS-W3-04; supporting contracts in `docs/architecture/contexts/N2.04-sessions.md` N3.04.08 and `docs/architecture/matrices/C5.02-COMMAND-QUERY-TRANSACTION-MATRIX.md`.

## Global Constraints

- Apply migrations in chronological filename order and preserve the additive strangler boundary.
- A SessionRulesSnapshot is an `IMMUTABLE_SNAPSHOT`; changing Community defaults must never rewrite it.
- The snapshot contains only Session/Match execution rules. Competition remains external and no Competition source kind is accepted.
- JSONB is allowed only with explicit semantic ownership, `rules_schema_version`, source provenance, and captured timestamp.
- Target Session writes remain semantic-command-only and authorized by the valid `SessionOrganizerAssignment` boundary from XS-W3-02.
- The freeze command uses the Session revision as its optimistic concurrency token; `updated_at` is not a concurrency token.
- This slice creates no MatchRulesSnapshot, TeamFormationConfig, CourtRotationConfig, Match, score, lease, or controller state.
- Reuse the active `volley_test_pg` Docker PostgreSQL at `127.0.0.1:55432` and preserve it after verification.

---

### Task 1: Pin immutability, provenance, and visibility with failing database tests

**Files:**
- Create: `src/test/db/sessionRulesSnapshots.dbtest.ts`
- Modify: none

**Interfaces:**
- Consumes: target Session creation, `SessionOrganizerAssignment`, Session revision, `community_rules`, and W3-03 read visibility.
- Produces: executable expectations for `public.session_rules_snapshots` and `public.freeze_target_session_rules_snapshot(uuid, uuid, integer, integer, text, jsonb)`.

- [ ] **Step 1: Write the real-database RED suite**

The suite rebuilds every migration and creates target Sessions through the existing semantic command. Pin these observable behaviors:

```typescript
test('an assigned Organizer freezes an explicit immutable rules snapshot and advances Session revision', async () => {
  const snapshotId = randomUUID();
  const rules = { scoring: { point_target: 15, win_by_two: true } };
  const result = await call(
    organizer,
    `select * from public.freeze_target_session_rules_snapshot(
       $1, $2, 1, 1, 'SESSION_EXPLICIT', $3::jsonb
     )`,
    [snapshotId, sessionId, JSON.stringify(rules)],
  );
  assert.deepEqual(result.rows, [{ snapshot_id: snapshotId, session_revision: 2 }]);
});
```

The tests must read the persisted row and assert literal values for:

- `id`, `session_id`, server-derived `rules_scope = 'SESSION_MATCH_EXECUTION'`, `rules_schema_version = 1`, exact `rules_payload`, `source_kind`, nullable/default provenance fields, and non-null `captured_at`;
- one snapshot per Session and distinct snapshot IDs across Sessions;
- stale revision, null final UUID, unsupported schema version, non-object/null JSONB, invalid source kind, anonymous caller, eligible-but-unassigned Organizer, and terminal/legacy Session rejection with the documented SQLSTATE;
- no direct authenticated INSERT/UPDATE/DELETE and database-level UPDATE/DELETE immutability even for a privileged writer;
- `COMMUNITY_DEFAULTS` copies the current `free_play_rules` for a Community FREE_PLAY target Session, derives `community_rules.id`, `updated_at`, and `pg_catalog.md5(free_play_rules::text)` rather than trusting payload provenance;
- updating `community_rules` after freeze changes neither the rules payload nor source provenance stored in the snapshot;
- `COMMUNITY_DEFAULTS` rejects Quick Session, missing defaults, non-null caller payload, and `STRUCTURED_MATCHES` until a target-safe structured default mapping exists;
- an explicit snapshot rejects `source_kind = 'COMPETITION_RULES'`, proving Competition is not a source owner;
- active Community members and the assigned Quick Organizer read snapshots while outsiders, suspended members, revoked Quick assignments, and anonymous callers do not;
- Session, Courts, and Rules Snapshot read the same visibility result through the new generic resolver;
- the Session FK has a complete leading-column btree index.

- [ ] **Step 2: Verify RED against the real Docker database**

Run:

```powershell
$env:VOLLEY_TEST_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:55432/volley_test'
node scripts/db-harness.mjs sessionRulesSnapshots.dbtest.ts
```

Expected: database-level failures `42P01` for missing `session_rules_snapshots` and `42883` for missing `freeze_target_session_rules_snapshot`, not compilation or fixture errors.

- [ ] **Step 3: Run focused static checks**

```powershell
npx prettier --check src/test/db/sessionRulesSnapshots.dbtest.ts docs/superpowers/plans/2026-08-28-xs-w3-04-session-rules-snapshot.md
npm run typecheck
git diff --check
```

- [ ] **Step 4: Commit the RED contract**

```powershell
git add -- src/test/db/sessionRulesSnapshots.dbtest.ts docs/superpowers/plans/2026-08-28-xs-w3-04-session-rules-snapshot.md
git commit -m "test: specify target Session rules snapshots"
```

---

### Task 2: Implement the immutable snapshot and semantic freeze command

**Files:**
- Create: the exact migration path printed by `npx supabase migration new target_session_rules_snapshot`
- Modify: `src/test/db/sessionRulesSnapshots.dbtest.ts` only when RED exposes a test-harness defect rather than a product-contract failure

**Interfaces:**
- Consumes: `public.sessions`, `public.session_organizer_assignments`, `public.community_rules`, `public.session_courts`, and `public.assert_target_session_write_authorized(public.sessions)`.
- Produces: `public.session_rules_snapshots`, `app_private.current_user_can_read_target_session(uuid)`, and `public.freeze_target_session_rules_snapshot(uuid, uuid, integer, integer, text, jsonb)` returning `(snapshot_id uuid, session_revision integer)`.

- [ ] **Step 1: Create the migration through the discovered CLI**

```powershell
npx supabase migration new target_session_rules_snapshot
```

Record the returned exact path before editing it.

- [ ] **Step 2: Add the immutable snapshot table**

Define:

```sql
create table public.session_rules_snapshots (
  id uuid primary key,
  session_id uuid not null unique references public.sessions(id) on delete restrict,
  rules_scope text not null,
  rules_schema_version integer not null,
  rules_payload jsonb not null,
  source_kind text not null,
  source_community_rules_id uuid,
  source_default_updated_at timestamptz,
  source_default_fingerprint text,
  captured_at timestamptz not null default now(),
  constraint session_rules_snapshots_scope_check
    check (rules_scope = 'SESSION_MATCH_EXECUTION'),
  constraint session_rules_snapshots_schema_version_check
    check (rules_schema_version = 1),
  constraint session_rules_snapshots_payload_object_check
    check (jsonb_typeof(rules_payload) = 'object'),
  constraint session_rules_snapshots_source_kind_check
    check (source_kind in ('SESSION_EXPLICIT', 'COMMUNITY_DEFAULTS')),
  constraint session_rules_snapshots_source_shape_check check (
    (source_kind = 'SESSION_EXPLICIT'
      and source_community_rules_id is null
      and source_default_updated_at is null
      and source_default_fingerprint is null)
    or
    (source_kind = 'COMMUNITY_DEFAULTS'
      and source_community_rules_id is not null
      and source_default_updated_at is not null
      and source_default_fingerprint is not null)
  )
);
```

The `UNIQUE (session_id)` constraint already supplies the complete leading-column btree index for the Session FK; do not add a redundant second index. The provenance UUID is intentionally a durable value, not a FK to the mutable legacy defaults row: source deletion must not null or rewrite an immutable snapshot. The semantic command verifies the source row before persisting it.

- [ ] **Step 3: Enforce immutability below RLS**

Create an `app_private` trigger function that raises SQLSTATE `55000` for every UPDATE or DELETE of `session_rules_snapshots`. Revoke its execute privilege from `public`, `anon`, and `authenticated`, and attach a `before update or delete` row trigger. The `ON DELETE RESTRICT` Session FK preserves the snapshot if a privileged caller attempts to delete its Session.

- [ ] **Step 4: Consolidate target Session read visibility**

Create `app_private.current_user_can_read_target_session(uuid)` as `STABLE SECURITY DEFINER SET search_path = ''`. It returns true only for:

- an active member of the Session Community when `session_context = 'COMMUNITY'`; or
- the active, non-Community `SessionOrganizerAssignment` for `QUICK`.

Revoke from `public`/`anon`, grant only to `authenticated`, replace the Court policy predicate with this generic resolver, and redefine the old Court helper as a compatibility wrapper over it. Redefine `read_target_session` to use the same resolver, preserving its public signature and returned columns.

- [ ] **Step 5: Add RLS and grants for snapshots**

Enable RLS, revoke all table privileges from `public`, `anon`, and `authenticated`, grant only SELECT to `authenticated`, and create one SELECT policy using `app_private.current_user_can_read_target_session(session_id)`. Do not add INSERT/UPDATE/DELETE policies.

- [ ] **Step 6: Implement the freeze command**

`public.freeze_target_session_rules_snapshot` must:

1. lock the target Session with `SELECT ... FOR UPDATE`;
2. reject missing/legacy Session (`P0002`), unauthorized caller (`42501`), null snapshot UUID/expected revision (`23514`), stale revision (`40001`), terminal Session (`23514`), schema version other than 1 (`23514`), invalid/non-object payload (`23514`), invalid source kind (`23514`), and a second snapshot (`23505`);
3. call `public.assert_target_session_write_authorized(v_session)`;
4. set `rules_scope = 'SESSION_MATCH_EXECUTION'` internally; the caller cannot choose or forge the semantic owner;
5. for `SESSION_EXPLICIT`, require an object payload and store null source-default fields;
6. for `COMMUNITY_DEFAULTS`, require a COMMUNITY + FREE_PLAY Session, require caller payload null, select the current `community_rules` row for the Session Community, copy `free_play_rules`, and derive ID, `updated_at`, and `pg_catalog.md5(free_play_rules::text)` on the server;
7. insert the immutable snapshot, advance `sessions.revision` and `updated_at`, and return the snapshot UUID plus new revision in one transaction.

Use `SECURITY DEFINER SET search_path = ''`, schema-qualify every object, revoke from `public`/`anon`, and grant execute only to `authenticated`.

- [ ] **Step 7: Verify focused GREEN and the complete database suite**

```powershell
$env:VOLLEY_TEST_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:55432/volley_test'
node scripts/db-harness.mjs sessionRulesSnapshots.dbtest.ts
npm run test:db
```

Expected: every snapshot test passes and the complete migration chain remains green.

- [ ] **Step 8: Commit the implementation**

```powershell
git add -- supabase/migrations src/test/db/sessionRulesSnapshots.dbtest.ts
git commit -m "feat: freeze target Session rules snapshots"
```

---

### Task 3: Verify the exit gate and branch evidence

**Files:**
- Modify only if a verification exposes an XS-W3-04 regression, with a new RED test before any production fix

**Interfaces:**
- Consumes: the complete XS-W3-04 branch.
- Produces: evidence that defaults are copied immutably with server-derived provenance and shared read authorization.

- [ ] **Step 1: Run repository gates**

```powershell
npm run typecheck
npm run lint:eslint
npm run format:check
npm test
npm run check:architecture
npm run build
```

Record global pre-existing findings precisely. Prove every tracked path with a global lint/format finding is unchanged from `d914adf`; classify ignored artifacts separately rather than calling them commit baseline. Changed files must pass focused ESLint and Prettier.

- [ ] **Step 2: Run the complete database suite twice**

```powershell
$env:VOLLEY_TEST_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:55432/volley_test'
npm run test:db
npm run test:db
```

Expected: identical green totals from two independent from-zero rebuilds.

- [ ] **Step 3: Inspect branch and Docker state**

```powershell
git diff exec/c6-w3-03-session-courts...HEAD --check
git status --short
git log --oneline --decorate exec/c6-w3-03-session-courts..HEAD
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
```

Expected: only XS-W3-04 commits, clean worktree, no whitespace errors, and `volley_test_pg` still active on port `55432`.

- [ ] **Step 4: Review the exit gate**

Confirm from executable evidence that:

- a target Session has one immutable rules artifact with its own UUID and schema version;
- a Community default change after capture changes neither payload nor provenance;
- source identity/version/fingerprint are derived by the server;
- target Session/Court/Snapshot reads share one visibility result;
- write authority still comes from `SessionOrganizerAssignment`;
- no MatchRulesSnapshot, formation, rotation, scoring runtime, lease, or controller state entered the slice.
