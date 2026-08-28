# XS-W3-03 Session Courts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every newly created target Session a stable Court identity and allow its assigned Organizer to add independently addressable courts.

**Architecture:** Add `public.session_courts` as a normalized child of the target Session aggregate. Target Session creation materializes a default court in the same transaction, while a semantic command adds later courts under the W3-02 assignment boundary and advances the Session revision. The slice deliberately excludes Match control, court rotation state, and removal policy.

**Tech Stack:** PostgreSQL/Supabase migrations, RLS, PL/pgSQL semantic commands, Node test runner, real PostgreSQL integration harness.

**Spec:** `docs/architecture/execution/C6.02-W3-W6-SESSION-REGISTRATION-RATING-TEAM.md` — XS-W3-03; supporting contracts in `docs/architecture/contexts/N2.04-sessions.md` and `docs/architecture/matrices/C5.02-COMMAND-QUERY-TRANSACTION-MATRIX.md`.

## Global Constraints

- Apply migrations in chronological filename order and preserve the additive strangler boundary.
- New target Session writes remain server-authoritative and use semantic commands; authenticated browser roles receive no direct mutation grant.
- Session authorization is the valid `SessionOrganizerAssignment` established by XS-W3-02, not `sessions.owner_id` or Community role rank alone.
- `SessionCourt` is a resource identity, not a Match, controller, lease, score, or rotation-runtime aggregate.
- Do not implement advanced rotation automation before `OPEN-SES-005`.
- Preserve the active `volley_test_pg` Docker container and run the database tests against `127.0.0.1:55432`.

---

### Task 1: Pin the SessionCourt contract with failing database tests

**Files:**
- Create: `src/test/db/sessionCourts.dbtest.ts`

**Interfaces:**
- Consumes: `create_target_session(uuid, uuid, text, text, text, timestamptz, timestamptz)` and the W3-02 assignment authority.
- Produces: executable expectations for `public.session_courts`, `public.add_target_session_court(uuid, uuid, integer, text, integer)`, and Session revision changes.

- [x] **Step 1: Write the failing test suite**

Create a real-database suite that rebuilds all migrations and asserts these literal outcomes:

```typescript
test('create_target_session atomically materializes one default Court identity', async () => {
  const organizer = await newUser('court-default@test.local');
  const sessionId = await createTargetSession(organizer);
  const { rows } = await client.query(
    `select session_id, label, court_order from public.session_courts where session_id = $1`,
    [sessionId],
  );
  assert.deepEqual(rows, [{ session_id: sessionId, label: 'Quadra 1', court_order: 1 }]);
});

test('assigned Organizer adds a caller-addressable Court and advances Session revision', async () => {
  const courtId = randomUUID();
  const result = await call(
    organizer,
    `select * from public.add_target_session_court($1, $2, 1, 'Quadra 2', 2)`,
    [courtId, sessionId],
  );
  assert.deepEqual(result.rows, [{ court_id: courtId, session_revision: 2 }]);
});
```

The suite must also prove:

- an eligible but unassigned Organizer cannot add a court;
- stale Session revision is rejected and creates no court;
- anonymous calls and direct authenticated INSERT/UPDATE/DELETE are rejected;
- null Court IDs, blank labels, order below 1, and duplicate `(session_id, court_order)` are rejected;
- the same order can be used in another Session;
- legacy Sessions do not receive default courts;
- active Community members and the Quick assigned Organizer can read their Session courts, while outsiders cannot;
- the `session_id` FK has a complete leading-column btree index;
- deleting a Session deletes its courts as aggregate composition.

- [x] **Step 2: Run the focused suite and verify RED**

Run:

```powershell
$env:VOLLEY_TEST_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:55432/volley_test'
node scripts/db-harness.mjs sessionCourts.dbtest.ts
```

Expected: failure because `public.session_courts` and `public.add_target_session_court` do not exist.

- [x] **Step 3: Commit the red test**

```powershell
git add -- src/test/db/sessionCourts.dbtest.ts docs/superpowers/plans/2026-08-28-xs-w3-03-session-courts.md
git commit -m "test: specify target Session courts"
```

---

### Task 2: Add the normalized Court boundary and semantic command

**Files:**
- Create: `supabase/migrations/<CLI-generated>_target_session_courts.sql`
- Modify: `src/test/db/sessionCourts.dbtest.ts` only if the RED run exposed a test-harness defect rather than a product-contract failure.

**Interfaces:**
- Consumes: `public.sessions`, `public.session_organizer_assignments`, and `public.assert_target_session_write_authorized(public.sessions)`.
- Produces: `public.session_courts` and `public.add_target_session_court(uuid, uuid, integer, text, integer)` returning `(court_id uuid, session_revision integer)`.

- [ ] **Step 1: Discover the installed CLI and create the migration through it**

```powershell
npx supabase --version
npx supabase migration new target_session_courts
```

- [ ] **Step 2: Implement the minimal normalized table**

The CLI-created migration defines:

```sql
create table public.session_courts (
  id uuid primary key,
  session_id uuid not null references public.sessions(id) on delete cascade,
  label text not null,
  court_order integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint session_courts_label_check check (btrim(label) <> ''),
  constraint session_courts_order_check check (court_order >= 1),
  constraint session_courts_session_order_key unique (session_id, court_order)
);

create index session_courts_session_id_idx on public.session_courts (session_id);
```

Enable RLS, revoke every direct privilege from `public`, `anon`, and `authenticated`, then grant only `SELECT` to `authenticated`. Its SELECT policy mirrors target Session visibility: active Community members may read Community courts, and only the active assigned Quick organizer may read Quick courts.

- [ ] **Step 3: Materialize the default court inside target Session creation**

Replace `public.create_target_session(...)` with the W3-02 body plus this statement after the organizer assignment:

```sql
insert into public.session_courts (id, session_id, label, court_order)
values (gen_random_uuid(), p_session_id, 'Quadra 1', 1);
```

This keeps Session, OrganizerAssignment, and default Court in one database transaction.

- [ ] **Step 4: Implement the revision-checked semantic add command**

Create `public.add_target_session_court` so it:

```sql
select * into v_session
  from public.sessions
 where id = p_session_id and authority_model = 'target'
 for update;

perform public.assert_target_session_write_authorized(v_session);
```

It rejects a missing target Session (`P0002`), null final Court ID (`23514`), stale revision (`40001`), blank label (`23514`), order below one (`23514`), and terminal Session lifecycle (`23514`). It inserts `btrim(p_label)`, increments `sessions.revision` and `updated_at`, returns the Court UUID plus new revision, revokes execute from `public`/`anon`, and grants execute only to `authenticated`.

- [ ] **Step 5: Run the focused suite and verify GREEN**

```powershell
$env:VOLLEY_TEST_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:55432/volley_test'
node scripts/db-harness.mjs sessionCourts.dbtest.ts
```

Expected: all SessionCourt tests pass against a from-zero migration rebuild.

- [ ] **Step 6: Run the complete database suite**

```powershell
$env:VOLLEY_TEST_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:55432/volley_test'
npm run test:db
```

Expected: all database suites pass with no new migration failures.

- [ ] **Step 7: Commit the implementation**

```powershell
git add -- supabase/migrations/*_target_session_courts.sql src/test/db/sessionCourts.dbtest.ts
git commit -m "feat: materialize target Session courts"
```

---

### Task 3: Verify the slice and preserve evidence

**Files:**
- Modify only if a verification exposes a W3-03 regression with a new failing test first.

**Interfaces:**
- Consumes: the complete XS-W3-03 branch.
- Produces: exit-gate evidence that a new target Session is addressable by Court identity.

- [ ] **Step 1: Run repository gates**

```powershell
npm run typecheck
npm run lint:eslint
npm run format:check
npm test
npm run check:architecture
npm run build
```

Record pre-existing unrelated lint/format findings separately; changed files must pass focused ESLint and Prettier checks.

- [ ] **Step 2: Run the complete database suite twice**

```powershell
$env:VOLLEY_TEST_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:55432/volley_test'
npm run test:db
npm run test:db
```

Expected: identical green totals from two fresh rebuilds.

- [ ] **Step 3: Inspect migration and branch state**

```powershell
git diff exec/c6-w3-02-session-organizer-assignment...HEAD --check
git status --short
git log --oneline --decorate exec/c6-w3-02-session-organizer-assignment..HEAD
```

Expected: no whitespace errors, only XS-W3-03 commits, and a clean worktree.

- [ ] **Step 4: Review the slice against the exit gate**

Confirm that a newly created target Session has a Court row with its own UUID; a second Court has a different UUID within the same Session; authorization derives from SessionOrganizerAssignment; and no rotation, Match control, lease, or scoring state was introduced.
