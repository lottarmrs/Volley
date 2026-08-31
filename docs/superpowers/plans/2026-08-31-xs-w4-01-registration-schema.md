# XS-W4-01 Registration Schema and Invariants Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the Registration aggregate — a capacity-bearing `RegistrationWindow` per Community
Session and its queued `RegistrationEntry` rows — with a private allocator that decides the
last-slot race server-side under a Window row lock.

**Architecture:** One migration adds two `CURRENT_STATE` tables, the constraints that carry the
Registration invariants, a COMMUNITY-only guard trigger, and
`app_private.allocate_registration_slot`. The allocator serializes on the Window with
`SELECT ... FOR UPDATE`, counts confirmed entries after taking the lock, and allocates FIFO
positions from a monotonic counter on the Window. Public commands arrive in XS-W4-02 and XS-W4-03.

**Tech Stack:** PostgreSQL/Supabase migrations, RLS, PL/pgSQL, JSONB, Node test runner, real
PostgreSQL integration harness.

**Spec:** `docs/superpowers/specs/2026-08-31-xs-w4-01-registration-schema-design.md`

**Architecture sources:** `docs/architecture/execution/C6.02-W3-W6-SESSION-REGISTRATION-RATING-TEAM.md`
XS-W4-01; `docs/architecture/contexts/N2.05-registration.md` N3.05.01–03, N3.05.05–06, N3.05.16 and
§28, with REG-INV-001/002/006/007/008/009/010/011/012/015/018/019/020;
`docs/architecture/catalogs/OPEN-DECISIONS.md` OPEN-REG-001..006;
`docs/architecture/quality/N2.20-testing-qa.md` QA-INV-004/005/006/008/012.

## Global Constraints

- One migration only, created through `npx supabase migration new registration_schema`. Edit only
  the exact path the CLI prints.
- Capacity is enforced by the serialized transaction, never by a CHECK. A row-level CHECK cannot
  observe sibling rows.
- FIFO position comes from `registration_windows.next_queue_sequence`, never from any timestamp and
  never from `updated_at` (REG-INV-007/008/009).
- The allocator serializes on `select * from public.registration_windows where id = ? for update`.
  That lock is the only serialization point (N4.05.16.01).
- The allocator decides capacity and queue mechanics ONLY. It must not check caller authorization,
  Community eligibility, Window lifecycle, or the `closes_at` deadline — XS-W4-06 imports legacy
  registrations into a Window that is not `OPEN`, and a lifecycle check here would block it.
- A duplicate effective entry raises `23514`, never `23505`. This codebase reserves `23505` for
  idempotency collisions raised by `app_private.find_command_receipt`.
- Four entry statuses only: `CONFIRMED`, `WAITLISTED`, `WITHDRAWN`, `REMOVED`. No `PROMOTED` status
  (N5.05.03), and no ineligible-at-promotion status (OPEN-REG-002 stays open).
- `capacity` is `NOT NULL CHECK (capacity > 0)`. Do not assign "unlimited" semantics to any value;
  OPEN-REG-001 stays open.
- A Window may only reference a Session with `authority_model = 'target'` and
  `session_context = 'COMMUNITY'`.
- `registration_entries` receives NO browser grant of any kind. OPEN-REG-003 stays open.
- `registration_windows` grants only `SELECT` to `authenticated`, under a policy delegating to
  `app_private.current_user_can_read_target_session(session_id)`.
- Neither table receives a browser `INSERT`, `UPDATE` or `DELETE` grant or policy.
- Every `SECURITY DEFINER` function uses `set search_path = ''`, fully qualified objects, and
  explicit execution revokes.
- Cover every foreign key with a complete leading-column btree index.
- SQLSTATE convention: `23514` invalid shape or duplicate effective entry, `42501` authorization,
  `P0002` missing Window, `23505` idempotency collision, `40001` stale revision.
- Reuse and preserve the active `volley_test_pg` Docker PostgreSQL on `127.0.0.1:55432`.

---

### Task 1: Pin the Registration schema with failing database tests

**Files:**
- Create: `src/test/db/registrationSchema.dbtest.ts`
- Modify: none

**Interfaces:**
- Consumes: the harness (`connect`, `createPool`, `rebuildFromMigrations`, `asIdentityCommitting`,
  `isTestDatabaseConfigured`, `TEST_DATABASE_URL_VAR`), plus `public.create_target_session` and
  `public.create_community_with_owner` for fixtures.
- Produces: executable expectations for `public.registration_windows`,
  `public.registration_entries` and their constraints.

- [ ] **Step 1: Build the fixture scaffold**

Copy the `before`/`after` shape and helpers from `src/test/db/sessionRosterRevisions.dbtest.ts`:
rebuild every migration in `before`, open a pool, and reuse `newUser`, `call`, `callFailing`,
`assertSqlState`, `targetCommunity`, `activeMembership`, `grantOrganizer`, `createTargetSession`
and `createPlayer` verbatim.

Add two helpers:

```typescript
// A COMMUNITY target Session, which is the only context allowed to own a Window.
async function communitySession(actorId: string, communityId: string, name = 'Registration Session') {
  return createTargetSession(actorId, { communityId, context: 'COMMUNITY', name });
}

// Privileged direct insert. Windows have no command until XS-W4-02.
async function insertWindow(input: {
  id?: string;
  sessionId: string;
  capacity?: number;
  status?: string;
  closesAt?: string | null;
}): Promise<string> {
  const id = input.id ?? randomUUID();
  await client.query(
    `insert into public.registration_windows (id, session_id, status, capacity, closes_at)
     values ($1, $2, $3, $4, $5::timestamptz)`,
    [id, input.sessionId, input.status ?? 'DRAFT', input.capacity ?? 12, input.closesAt ?? null],
  );
  return id;
}
```

- [ ] **Step 2: Write the literal column RED tests**

Pin, via `information_schema.columns` ordered by `ordinal_position`, exactly these columns, types
and nullability — reuse the query shape from `sessionRosterRevisions.dbtest.ts`:

`registration_windows`: `id uuid NO`, `session_id uuid NO`, `status text NO`, `capacity int4 NO`,
`closes_at timestamptz YES`, `revision int4 NO`, `next_queue_sequence int8 NO`,
`opened_at timestamptz YES`, `closed_at timestamptz YES`, `locked_at timestamptz YES`,
`created_by_user_id uuid YES`, `created_at timestamptz NO`, `updated_at timestamptz NO`.

`registration_entries`: `id uuid NO`, `registration_window_id uuid NO`, `player_id uuid NO`,
`status text NO`, `queue_sequence int8 YES`, `source text NO`, `joined_at timestamptz NO`,
`status_changed_at timestamptz NO`, `withdrawn_at timestamptz YES`, `removed_at timestamptz YES`,
`removal_reason text YES`, `created_by_user_id uuid YES`.

- [ ] **Step 3: Write the value-set and capacity RED tests**

Pin with `23514`:

- `status` outside `DRAFT | OPEN | CLOSED | LOCKED` on a Window;
- `capacity` of `0` and of `-1`;
- entry `status` outside `CONFIRMED | WAITLISTED | WITHDRAWN | REMOVED`;
- entry `source` outside `SELF_JOIN | ORGANIZER_ADDED | MIGRATION | ADMIN_RESTORE`;
- a `WAITLISTED` entry with a null `queue_sequence`;
- a blank `removal_reason` (null is legal, blank is not).

Also pin that a `CONFIRMED` entry is accepted BOTH with a null `queue_sequence` (walked straight in)
and with a non-null one (promoted from the queue). That asymmetry is deliberate and a later
implementer may otherwise "tidy" it into a stricter CHECK.

- [ ] **Step 4: Write the Session-context RED tests**

Pin that `insertWindow` is rejected for:

- a QUICK target Session (created by `createTargetSession` with no Community);
- a legacy Session, inserted directly with
  `insert into public.sessions (owner_id, name, date, status, type) values (...)`;
- a second Window on a Session that already has one, which must fail `23505` on the unique
  `session_id`;
- a `session_id` that matches no Session at all, which must fail `23503` on the foreign key rather
  than reaching the guard trigger.

Accept it for a COMMUNITY target Session. Use SQLSTATE `23514` for the QUICK and legacy cases.

- [ ] **Step 5: Write the constraint RED tests**

Pin:

- inserting two `CONFIRMED` entries for one Player in one Window fails `23505`;
- one `CONFIRMED` plus one `WAITLISTED` for the same Player also fails `23505`;
- after updating the first entry to `WITHDRAWN`, a new effective entry for the same Player is
  accepted (REG-INV-010 plus REG-INV-011);
- two entries sharing a `queue_sequence` in one Window fail `23505`, while the same
  `queue_sequence` in a different Window is accepted;
- foreign key delete actions: `registration_windows.session_id`,
  `registration_entries.registration_window_id` and `registration_entries.player_id` are
  `RESTRICT`; both `created_by_user_id` columns are `SET NULL`. Reuse the `pg_constraint` query
  from `sessionRosterRevisions.dbtest.ts`, remembering that `attname` must be cast with `::text`
  or node-pg returns an unparsed `name[]`;
- every foreign key has a complete leading-column btree index, reusing that file's
  `pg_constraint`/`pg_index` query verbatim;
- a partial index on `(registration_window_id, queue_sequence) where status = 'WAITLISTED'` exists,
  asserted through `pg_indexes.indexdef`.

- [ ] **Step 6: Write the access-boundary RED tests**

Pin, using the `has_table_privilege` idiom from `src/test/db/commandReceipts.dbtest.ts`:

- `anon` and `authenticated` hold none of SELECT, INSERT, UPDATE, DELETE on
  `public.registration_entries`;
- `anon` holds none of the four on `public.registration_windows`, and `authenticated` holds
  `SELECT` only;
- RLS is enabled on both tables;
- an authenticated member of the Community can select the Window, and an outsider selects zero rows
  (QA-INV-005, both identities);
- an authenticated caller's `insert`, `update` and `delete` against either table each fail `42501`;
- BOLA (QA-INV-006): build a SECOND Community with its own Session and Window, then have a member
  of the FIRST Community select `where id = <second window id>` — a valid, existing foreign
  resource id — and assert zero rows. Knowing a Window UUID must grant nothing. A test that queries
  a random UUID does not prove this, because a nonexistent row returns zero rows regardless of the
  policy.

- [ ] **Step 7: Verify focused RED**

```powershell
$env:VOLLEY_TEST_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:55432/volley_test'
node scripts/db-harness.mjs registrationSchema.dbtest.ts
```

Expected: `42P01` for the two missing tables plus assertion failures on empty catalog queries.
A TypeScript error or a fixture crash is a harness bug — fix it. If any test PASSES, it is not
pinning what it claims; rework it and say so in the report.

- [ ] **Step 8: Run focused static checks and commit the RED contract**

```powershell
npx prettier --check src/test/db/registrationSchema.dbtest.ts
npx eslint src/test/db/registrationSchema.dbtest.ts
npm run typecheck
git diff --check
git add -- src/test/db/registrationSchema.dbtest.ts
git commit -m "test: specify Registration schema and invariants"
```

---

### Task 2: Implement the Registration schema

**Files:**
- Create: exact path returned by `npx supabase migration new registration_schema`
- Modify: `src/test/db/registrationSchema.dbtest.ts` only for a proven harness defect

**Interfaces:**
- Consumes: `public.sessions`, `public.players`, `auth.users`,
  `app_private.current_user_can_read_target_session(uuid)`.
- Produces: `public.registration_windows`, `public.registration_entries`, and
  `app_private.assert_registration_window_session()` as a trigger function.

- [ ] **Step 1: Create the migration through the installed CLI**

```powershell
npx supabase --version
npx supabase migration new registration_schema
```

- [ ] **Step 2: Create `registration_windows`**

Columns in the exact ordinal order Task 1 pins. `id uuid primary key` with no default — the caller
always supplies a final UUID. `session_id uuid not null unique references public.sessions(id) on
delete restrict`. `capacity integer not null check (capacity > 0)`. `revision integer not null
default 1`. `next_queue_sequence bigint not null default 1`. `created_by_user_id uuid references
auth.users(id) on delete set null`, plus a btree index covering it. `created_at`/`updated_at`
default `now()`.

Add `check (status in ('DRAFT', 'OPEN', 'CLOSED', 'LOCKED'))`.

Do NOT add an `opens_at` column. A Window opens through XS-W4-02's `OpenRegistration` command, so a
scheduled-open column would have no consumer.

- [ ] **Step 3: Add the COMMUNITY-only guard**

```sql
create function app_private.assert_registration_window_session()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.sessions;
begin
  select * into v_session from public.sessions where id = new.session_id;
  if not found
     or v_session.authority_model <> 'target'
     or v_session.session_context is distinct from 'COMMUNITY' then
    raise exception 'Registration windows require a COMMUNITY target Session'
      using errcode = '23514';
  end if;
  return new;
end;
$$;
```

Attach it `before insert or update of session_id on public.registration_windows for each row`, and
revoke execution from `public`, `anon` and `authenticated`.

It is a trigger rather than a CHECK because the condition reads another table.

- [ ] **Step 4: Create `registration_entries`**

Columns in the exact ordinal order Task 1 pins. `registration_window_id` references
`public.registration_windows(id) on delete restrict`; `player_id` references `public.players(id) on
delete restrict`; `created_by_user_id` references `auth.users(id) on delete set null`.
`joined_at` and `status_changed_at` default `now()`.

Add these checks:

```sql
check (status in ('CONFIRMED', 'WAITLISTED', 'WITHDRAWN', 'REMOVED')),
check (source in ('SELF_JOIN', 'ORGANIZER_ADDED', 'MIGRATION', 'ADMIN_RESTORE')),
check (status <> 'WAITLISTED' or queue_sequence is not null),
check (removal_reason is null or btrim(removal_reason) <> '')
```

The third check is one-directional on purpose: a `CONFIRMED` row may carry a `queue_sequence` (it
was promoted) or not (it walked straight in). Do not strengthen it into an equivalence.

- [ ] **Step 5: Add the three partial indexes**

```sql
create unique index registration_entries_effective_key
  on public.registration_entries (registration_window_id, player_id)
  where status in ('CONFIRMED', 'WAITLISTED');

create unique index registration_entries_queue_key
  on public.registration_entries (registration_window_id, queue_sequence)
  where queue_sequence is not null;

create index registration_entries_waitlist_idx
  on public.registration_entries (registration_window_id, queue_sequence)
  where status = 'WAITLISTED';
```

Add plain btree indexes covering `registration_window_id`, `player_id` and `created_by_user_id`, so
every foreign key has a complete leading-column index. The partial indexes above do not count —
Task 1's query requires `indpred is null`.

- [ ] **Step 6: Enable RLS and set the exact grants**

```sql
alter table public.registration_windows enable row level security;
revoke all on public.registration_windows from public, anon, authenticated;
grant select on public.registration_windows to authenticated;

create policy "Target Session readers can read Registration Windows"
  on public.registration_windows
  for select to authenticated
  using (app_private.current_user_can_read_target_session(session_id));

alter table public.registration_entries enable row level security;
revoke all on public.registration_entries from public, anon, authenticated;
```

`registration_entries` gets no grant and no policy. OPEN-REG-003 leaves open how much of the queue
a member may see, and a blanket SELECT would close it in its least reversible direction. Reads
arrive in XS-W4-02 and XS-W4-03 as purpose-specific query commands.

- [ ] **Step 7: Verify focused GREEN and the full database suite**

```powershell
$env:VOLLEY_TEST_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:55432/volley_test'
node scripts/db-harness.mjs registrationSchema.dbtest.ts
npm run test:db
npx prettier --check src/test/db/registrationSchema.dbtest.ts supabase/migrations/*_registration_schema.sql
npm run typecheck
git diff --check
```

The full suite matters here: two new tables join `app_private`-adjacent catalog queries in other
suites. If `migrationProvenance.dbtest.ts` or `schemaSecurity.dbtest.ts` fails, read what it
asserts before changing anything — a blanket schema assertion that legitimately needs narrowing is
different from a real grant leak.

- [ ] **Step 8: Commit the schema**

```powershell
git add -- supabase/migrations/*_registration_schema.sql src/test/db/registrationSchema.dbtest.ts
git commit -m "feat: add Registration schema and invariants"
```

---

### Task 3: Pin the slot allocator with failing database tests

**Files:**
- Modify: `src/test/db/registrationSchema.dbtest.ts`

**Interfaces:**
- Consumes: the tables from Task 2.
- Produces: executable expectations for
  `app_private.allocate_registration_slot(uuid, uuid, uuid, text, uuid)`.

- [ ] **Step 1: Add the allocator fixture**

```typescript
interface AllocationResult {
  entry_id: string;
  status: string;
  queue_sequence: string | null;
  window_revision: number;
}

async function allocate(input: {
  entryId?: string;
  windowId: string;
  playerId: string;
  source?: string;
  actorId?: string | null;
}) {
  const { rows } = await client.query<{ result: AllocationResult }>(
    `select app_private.allocate_registration_slot($1, $2, $3, $4, $5) as result`,
    [
      input.entryId ?? randomUUID(),
      input.windowId,
      input.playerId,
      input.source ?? 'SELF_JOIN',
      input.actorId ?? null,
    ],
  );
  return rows[0].result;
}
```

`queue_sequence` is typed `string | null` because node-pg returns `bigint` as a string.

- [ ] **Step 2: Write the capacity RED tests**

Pin, on a Window with `capacity = 2`:

- the first two allocations return `status = 'CONFIRMED'` with `queue_sequence` null;
- the third returns `status = 'WAITLISTED'` with `queue_sequence = '1'`;
- the fourth returns `'WAITLISTED'` with `queue_sequence = '2'`;
- `registration_windows.next_queue_sequence` is `3` after those four;
- `window_revision` increments by exactly one per allocation;
- the confirmed count never exceeds capacity (REG-INV-006).

- [ ] **Step 3: Write the FIFO and rejoin RED tests**

Pin:

- sequences are strictly increasing across allocations;
- after a waitlisted entry is set to `WITHDRAWN` by direct update, allocating again for that same
  Player succeeds and receives a **higher** sequence than the abandoned one (REG-INV-011), and the
  abandoned row keeps its original sequence;
- `next_queue_sequence` does not regress after that withdrawal — allocate once more and assert the
  sequence is higher again. This is the property that distinguishes a Window counter from
  `max(queue_sequence) + 1`, so state it as its own test.

- [ ] **Step 4: Write the rejection RED tests**

Pin:

- allocating for a Player who already holds a `CONFIRMED` entry fails `23514`, NOT `23505`;
- the same for a Player holding a `WAITLISTED` entry;
- allocating against a missing Window id fails `P0002`;
- an invalid `source` fails `23514`;
- `anon` and `authenticated` cannot execute the function, asserted with `has_function_privilege`.

The `23514`-not-`23505` case is the point of the pre-check. If it returns `23505`, the
implementation let the unique index speak instead of guarding first.

- [ ] **Step 5: Write the concurrency RED test — the exit gate**

Follow the two-connection pattern in `sessionRosterRevisions.dbtest.ts`
(`'two distinct roster UUIDs on one expected Session revision serialize to one 40001 loser'`).

Set up a Window with `capacity = 12` and 11 `CONFIRMED` entries. Then, on two separate pooled
connections, begin two transactions and call the allocator simultaneously with `Promise.all`, each
for a different Player.

Assert exactly one result is `CONFIRMED` and exactly one is `WAITLISTED`, that the waitlisted one
carries `queue_sequence = '1'`, and that the Window ends with exactly 12 `CONFIRMED` entries.

Both transactions must be open concurrently. If the second only starts after the first commits, the
test proves nothing — the assertion would pass against an implementation with no lock at all.

- [ ] **Step 6: Write the rollback RED test**

Inside one transaction, allocate successfully, then force a failure (allocate again for the same
Player, catching `23514`), then roll back. Assert afterwards that the Window's
`next_queue_sequence` and `revision` are unchanged from before the transaction, and that no entry
row survives (QA-INV-012). The sequence increment and the insert must live or die together.

- [ ] **Step 7: Verify focused RED and commit**

```powershell
$env:VOLLEY_TEST_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:55432/volley_test'
node scripts/db-harness.mjs registrationSchema.dbtest.ts
npx prettier --check src/test/db/registrationSchema.dbtest.ts
npx eslint src/test/db/registrationSchema.dbtest.ts
npm run typecheck
git diff --check
git add -- src/test/db/registrationSchema.dbtest.ts
git commit -m "test: specify Registration slot allocation"
```

Expected RED: `42883` for the missing function, with every Task 1 schema test still green.

---

### Task 4: Implement the slot allocator

**Files:**
- Modify: the `*_registration_schema.sql` migration created in Task 2
- Modify: `src/test/db/registrationSchema.dbtest.ts` only for a proven harness defect

**Interfaces:**
- Consumes: `public.registration_windows`, `public.registration_entries`.
- Produces:
  `app_private.allocate_registration_slot(p_entry_id uuid, p_window_id uuid, p_player_id uuid, p_source text, p_actor_user_id uuid) returns jsonb`
  with keys `entry_id`, `status`, `queue_sequence`, `window_revision`.

- [ ] **Step 1: Implement the allocator**

`SECURITY DEFINER`, `set search_path = ''`, fully qualified object names throughout
(`pg_catalog.now()`, `public.…`), then revoked from `public`, `anon` and `authenticated`.

Body, in this exact order:

1. raise `23514` when `p_entry_id`, `p_window_id`, `p_player_id` or `p_source` is null;
2. `select * into v_window from public.registration_windows where id = p_window_id for update`;
   raise `P0002` when not found. This lock is the serialization point;
3. raise `23514` when an entry already exists for `(p_window_id, p_player_id)` with
   `status in ('CONFIRMED', 'WAITLISTED')`;
4. `select pg_catalog.count(*) into v_confirmed from public.registration_entries where
   registration_window_id = p_window_id and status = 'CONFIRMED'`;
5. when `v_confirmed < v_window.capacity`, set `v_status := 'CONFIRMED'` and
   `v_queue_sequence := null`; otherwise set `v_status := 'WAITLISTED'`,
   `v_queue_sequence := v_window.next_queue_sequence`, and increment the Window's counter;
6. insert the entry with `p_entry_id`, `p_source`, `p_actor_user_id` and the computed status and
   sequence;
7. `update public.registration_windows set revision = revision + 1, next_queue_sequence = <counter>,
   updated_at = pg_catalog.now() where id = p_window_id`;
8. return `pg_catalog.jsonb_build_object('entry_id', p_entry_id, 'status', v_status,
   'queue_sequence', v_queue_sequence, 'window_revision', v_window.revision + 1)`.

Step 4 must run AFTER step 2. Under READ COMMITTED the count then observes a competing
transaction's committed insert rather than a stale snapshot — that ordering is what makes the
last-slot race decidable.

Step 3 must run BEFORE any insert, so a duplicate surfaces as `23514` rather than letting
`registration_entries_effective_key` raise a raw `23505`.

Do NOT check the Window's `status`, `closes_at`, the caller's identity or Community eligibility.
Those belong to XS-W4-02 and XS-W4-03, and XS-W4-06 needs to allocate into a non-`OPEN` Window.

- [ ] **Step 2: Verify focused GREEN and the full database suite**

```powershell
$env:VOLLEY_TEST_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:55432/volley_test'
node scripts/db-harness.mjs registrationSchema.dbtest.ts
npm run test:db
npx prettier --check src/test/db/registrationSchema.dbtest.ts supabase/migrations/*_registration_schema.sql
npm run typecheck
git diff --check
```

- [ ] **Step 3: Commit the allocator**

```powershell
git add -- supabase/migrations/*_registration_schema.sql src/test/db/registrationSchema.dbtest.ts
git commit -m "feat: allocate Registration slots under a Window lock"
```

---

### Task 5: Verify the XS-W4-01 exit gate and preserve branch evidence

**Files:**
- Modify only if verification exposes an XS-W4-01 defect, with a new failing test before any
  production fix

**Interfaces:**
- Consumes: the complete XS-W4-01 branch.
- Produces: fresh evidence for the last-slot race, FIFO monotonicity, the access boundary and
  preservation of the active Docker service.

- [ ] **Step 1: Run focused changed-file quality gates**

```powershell
npx eslint src/test/db/registrationSchema.dbtest.ts
npx prettier --check docs/superpowers/specs/2026-08-31-xs-w4-01-registration-schema-design.md docs/superpowers/plans/2026-08-31-xs-w4-01-registration-schema.md src/test/db/registrationSchema.dbtest.ts supabase/migrations/*_registration_schema.sql
git diff exec/c6-w3-07-session-cohort-cutover...HEAD --check
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
(`.agent/`, `.claude/`, `.gemini/`, `.github/skills/`) and the sibling `.worktrees/` checkout.
Prove this branch adds nothing by showing that
`git diff exec/c6-w3-07-session-cohort-cutover...HEAD --name-only` contains none of the reported
paths. Do not reformat unrelated files.

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
git log --oneline --decorate exec/c6-w3-07-session-cohort-cutover..HEAD
docker ps --filter name=volley_test_pg --format "{{.Names}}|{{.Status}}|{{.Ports}}"
```

Expected: only XS-W4-01 commits, clean worktree, no whitespace errors, and `volley_test_pg` still
active on port `55432`.

- [ ] **Step 5: Review the exit gate**

Confirm from executable evidence that:

- two concurrent transactions on the last slot produce exactly one `CONFIRMED` and one
  `WAITLISTED`, with no client-side counting anywhere;
- FIFO order comes from `next_queue_sequence` and never from a timestamp, and a position is never
  reissued after a withdrawal;
- one Player cannot hold two effective entries in one Window, and may hold a new one after
  withdrawing;
- a Window cannot exist on a QUICK Session, a legacy Session, or a second time on one Session;
- `registration_entries` is unreachable by browser roles, and `registration_windows` is readable
  only by callers who can read the Session;
- the allocator performs no authorization, eligibility, lifecycle or deadline check;
- `OPEN-REG-001` through `OPEN-REG-006` all remain open and none is cited as resolved.

Authority change: none. Registration write authority arrives with the commands in XS-W4-02 and
XS-W4-03. Schema phase: EXPAND.
