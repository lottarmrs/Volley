# XS-W4-05 FinalizeSessionRoster Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert one exact, locked Registration revision into one immutable, non-empty
Registration-sourced Session roster revision through an authorized and idempotent database command.

**Architecture:** A dedicated `SECURITY DEFINER` RPC owns the Session-to-Registration transaction.
It locks Session before Window, validates the Organizer and exact frozen source, builds a private
confirmed-only snapshot, delegates storage to the existing roster materializer, advances Session
revision once and records an immutable receipt. A partial unique index makes one Registration source
revision converge on one logical roster revision.

**Tech Stack:** PostgreSQL/PLpgSQL, Supabase imperative migrations, Node.js test runner, `pg`, the
project's real-Postgres migration harness.

**Spec:** `docs/superpowers/specs/2026-09-02-xs-w4-05-finalize-session-roster-design.md`

## Global Constraints

- Only target-owned `COMMUNITY` Sessions can own Registration Windows or use this command.
- `public.finalize_session_roster` accepts only a Window already in `LOCKED` and a Session in
  `DRAFT` or `SCHEDULED`.
- Every command that touches both rows locks `sessions FOR UPDATE` before
  `registration_windows FOR UPDATE`.
- The first materialization rejects a stale expected Registration revision, an empty confirmed set
  or any confirmed entry that fails `app_private.registration_entry_still_eligible`.
- Only `CONFIRMED` entries enter the snapshot; `WAITLISTED`, `WITHDRAWN` and `REMOVED` never do.
- Snapshot ordering is `registration_entries.joined_at, registration_entries.id`; `entry_order` is
  zero-based.
- The same `command_id` returns its receipt. Distinct commands for the same
  `(session_id, source_registration_revision)` return the same roster revision without another
  Session bump.
- The first successful materialization advances `sessions.revision` exactly once.
- `source_kind = 'REGISTRATION'`, `source_registration_revision` is exact, and
  `source_session_revision`/`source_payload_hash` remain null.
- Participant and roster-revision UUIDs are generated server-side. Existing SessionParticipant
  identity for the same Player is reused.
- The function returns only roster revision id/number, exact source Registration revision and
  resulting Session revision. It never exposes entry identity, queue sequence, participant names,
  counts or capacity.
- `registration_entries` keeps zero browser grants. Roster tables keep zero direct browser mutation
  grants.
- Every `SECURITY DEFINER` function uses `set search_path = ''` and schema-qualifies every object.
- The public RPC revokes `EXECUTE` from `PUBLIC` and `anon`, then grants only `authenticated`.
- No UI, TypeScript gateway, Realtime, reopen, post-start adjustment, legacy introduction, Team
  Formation consumer or system actor is part of this slice.
- Do not edit an existing migration. Modify only the CLI-created empty migration
  `supabase/migrations/20260902141626_finalize_session_roster.sql`.
- Follow TDD: observe each new contract fail before implementing the behavior that makes it pass.

---

## File Structure

| File | Responsibility | Tasks |
| --- | --- | --- |
| `src/test/db/registrationFinalize.dbtest.ts` | Real-Postgres behavioral, security, concurrency and rollback contract | 1 create, 3 extend |
| `supabase/migrations/20260902141626_finalize_session_roster.sql` | Partial unique index, public finalization command, grants | 2 core, 4 harden |
| `README.md` | Chronological migration list | 5 |
| `HANDOFF.md` | Completed W4-05 evidence, decisions, next slice | 5 |

The migration scaffold was created with `npx supabase migration new finalize_session_roster` while
writing this plan. It is intentionally empty before Task 2.

---

### Task 1: Pin the core finalization contract with failing database tests

**Files:**

- Create: `src/test/db/registrationFinalize.dbtest.ts`
- Read: `src/test/db/registrationLeave.dbtest.ts`
- Read: `src/test/db/sessionRosterRevisions.dbtest.ts`
- Read: `src/test/db/sessionLifecycleCommands.dbtest.ts`

**Interfaces:**

- Consumes: `connect`, `createPool`, `rebuildFromMigrations`, `asIdentityCommitting` and
  `TEST_DATABASE_URL_VAR` from `src/test/db/harness.ts`; W3 Session/roster commands; W4
  create/open/close/lock/join/add commands.
- Produces: `finalizeRoster`, `lockedWindow`, `rosterRevision`, `sessionRevision`, `entriesForWindow`
  and the fixture vocabulary reused by Task 3.

- [ ] **Step 1: Create the focused fixture scaffold**

Start the file with the real-database guard and lifecycle used by every DB suite:

```typescript
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

if (!isTestDatabaseConfigured()) {
  test(`registration finalization requires ${TEST_DATABASE_URL_VAR}`, () => {
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

  // helpers and tests below
}
```

Implement focused fixtures with these exact signatures. Use the SQL bodies already proven in
`registrationLeave.dbtest.ts`, but keep only columns and setup needed by W4-05:

```typescript
interface FinalizeRow extends QueryResultRow {
  roster_revision_id: string;
  roster_revision_number: number;
  source_registration_revision: string;
  session_revision: number;
}

interface WindowFixture {
  communityId: string;
  organizerId: string;
  sessionId: string;
  windowId: string;
  revision: number;
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

function assertSqlState(error: unknown, expectedCode: string): asserts error is Error {
  assert.ok(error instanceof Error);
  assert.equal((error as { code?: string }).code, expectedCode);
}

async function finalizeRoster(
  actorId: string | null,
  input: { commandId?: string; windowId: string; expectedRevision: number },
) {
  return call<FinalizeRow>(
    actorId,
    'select * from public.finalize_session_roster($1, $2, $3)',
    [input.commandId ?? randomUUID(), input.windowId, input.expectedRevision],
  );
}
```

The remaining fixture functions are:

```typescript
async function newUser(email: string): Promise<string>;
async function targetCommunity(ownerId: string, name: string): Promise<string>;
async function activeMembership(communityId: string, userId: string): Promise<void>;
async function grantOrganizer(communityId: string, userId: string): Promise<void>;
async function communitySession(
  actorId: string,
  communityId: string,
  name?: string,
): Promise<string>;
async function createPlayer(
  ownerId: string,
  input?: {
    name?: string;
    nickname?: string | null;
    active?: boolean;
    deletedAt?: string | null;
  },
): Promise<string>;
async function addCommunityPlayer(
  communityId: string,
  playerId: string,
  ownerId: string,
): Promise<void>;
async function eligibleMember(
  communityId: string,
  ownerId: string,
  email: string,
): Promise<{ userId: string; playerId: string }>;
async function rosterOnlyPlayer(
  communityId: string,
  ownerId: string,
  name: string,
): Promise<string>;
async function createWindow(
  actorId: string,
  sessionId: string,
  capacity: number,
): Promise<{ windowId: string; revision: number }>;
async function transitionWindow(
  actorId: string,
  command: 'open_registration' | 'close_registration' | 'lock_registration',
  windowId: string,
  expectedRevision: number,
): Promise<number>;
async function joinRegistration(
  actorId: string,
  windowId: string,
): Promise<{ entry_status: string; window_revision: number }>;
async function addRegistrationEntry(
  actorId: string,
  windowId: string,
  playerId: string,
): Promise<{ entry_status: string; window_revision: number }>;
async function lockedWindow(
  organizerId: string,
  communityId: string,
  capacity: number,
  confirmedSelfJoins: number,
  organizerAddedNames?: string[],
  waitlistedSelfJoins?: number,
): Promise<WindowFixture & { confirmedPlayerIds: string[]; waitlistedPlayerIds: string[] }>;
```

`lockedWindow` must drive the real command path: create target Community Session, create Window,
open, join/add entries, close, lock, and return the final Window revision from `lock_registration`.
Never update Window status directly. Use unique emails/names containing `randomUUID()`.

Add these inspection helpers:

```typescript
async function rosterRevision(id: string) {
  return client.query<{
    id: string;
    session_id: string;
    revision_number: number;
    source_kind: string;
    source_session_revision: number | null;
    source_registration_revision: string | null;
    source_payload_hash: string | null;
    created_by_user_id: string | null;
  }>(
    `select id, session_id, revision_number, source_kind, source_session_revision,
            source_registration_revision, source_payload_hash, created_by_user_id
       from public.roster_revisions where id = $1`,
    [id],
  );
}

async function rosterEntries(id: string) {
  return client.query<{
    entry_order: number;
    participant_id: string;
    identity_kind: string;
    player_id: string | null;
    display_name_at_time: string;
  }>(
    `select entry_order, participant_id, identity_kind, player_id, display_name_at_time
       from public.roster_revision_entries
      where roster_revision_id = $1
      order by entry_order`,
    [id],
  );
}

async function sessionRevision(sessionId: string): Promise<number> {
  const { rows } = await client.query<{ revision: number }>(
    'select revision from public.sessions where id = $1',
    [sessionId],
  );
  return rows[0].revision;
}
```

- [ ] **Step 2: Write the happy-path and snapshot RED tests**

Add tests with these exact assertions:

```typescript
test('finalize_session_roster materializes only confirmed Players with exact provenance and one Session bump', async () => {
  const organizer = await newUser(`finalize-happy-${randomUUID()}@test.local`);
  const communityId = await targetCommunity(organizer, 'Finalize happy');
  const fixture = await lockedWindow(organizer, communityId, 2, 2, [], 1);
  const beforeSessionRevision = await sessionRevision(fixture.sessionId);

  const result = await finalizeRoster(organizer, {
    windowId: fixture.windowId,
    expectedRevision: fixture.revision,
  });
  const row = result.rows[0];

  assert.equal(row.source_registration_revision, String(fixture.revision));
  assert.equal(row.session_revision, beforeSessionRevision + 1);
  const revision = await rosterRevision(row.roster_revision_id);
  assert.deepEqual(revision.rows[0], {
    id: row.roster_revision_id,
    session_id: fixture.sessionId,
    revision_number: row.roster_revision_number,
    source_kind: 'REGISTRATION',
    source_session_revision: null,
    source_registration_revision: String(fixture.revision),
    source_payload_hash: null,
    created_by_user_id: organizer,
  });
  const entries = await rosterEntries(row.roster_revision_id);
  assert.deepEqual(
    entries.rows.map(({ entry_order, identity_kind, player_id }) => ({
      entry_order,
      identity_kind,
      player_id,
    })),
    fixture.confirmedPlayerIds.map((playerId, entry_order) => ({
      entry_order,
      identity_kind: 'PLAYER',
      player_id: playerId,
    })),
  );
  assert.equal(entries.rows.some((entry) => fixture.waitlistedPlayerIds.includes(entry.player_id!)), false);
});
```

Add a second test that creates two confirmed Players with the same `joined_at` by privileged fixture
update before Lock, assigns nicknames with surrounding whitespace, and asserts ordering by entry UUID
plus display-name resolution `trim(nickname)` then `trim(name)`. Rename both Players after finalize
and assert the stored `display_name_at_time` does not change.

Add a third test that pre-creates one `session_participants` row for a confirmed Player, finalizes,
and asserts the exact participant UUID is reused while another confirmed Player receives a new UUID
that differs from its client-supplied Registration entry UUID.

- [ ] **Step 3: Write lifecycle, staleness, empty and eligibility RED tests**

Use a table-driven loop for Window status:

```typescript
for (const status of ['DRAFT', 'OPEN', 'CLOSED'] as const) {
  test(`finalize_session_roster rejects a ${status} Window with 23514`, async () => {
    // Build the Window through create/open/close commands only up to `status`, add one confirmed
    // entry while OPEN when needed, invoke finalize, and assert 23514 plus zero roster revisions.
  });
}
```

Replace the comments in the actual test with fixture calls and these assertions:

```typescript
const error = await finalizeRoster(organizer, input).catch((cause: Error) => cause);
assertSqlState(error, '23514');
const revisions = await client.query(
  'select id from public.roster_revisions where session_id = $1',
  [sessionId],
);
assert.equal(revisions.rowCount, 0);
```

Add individual tests for:

- stale expected Window revision → `40001` and no effect;
- locked Window with zero confirmed entries → `23514` and no effect;
- Session forced to `IN_PROGRESS` and `COMPLETED` → `23514` and no effect;
- confirmed Player soft-deleted after Lock → `23514`;
- confirmed Player inactive after Lock → `23514`;
- confirmed Community roster relation inactive after Lock → `23514`;
- confirmed `SELF_JOIN` account link revoked after Lock → `23514`;
- confirmed `SELF_JOIN` membership suspended after Lock → `23514`;
- live accountless `ORGANIZER_ADDED` Player → success.

For every rejection, assert all five atomicity surfaces remain unchanged:

```typescript
assert.equal((await client.query(
  'select count(*)::integer as count from public.roster_revisions where session_id = $1',
  [sessionId],
)).rows[0].count, 0);
assert.equal((await client.query(
  'select count(*)::integer as count from public.roster_revision_entries where session_id = $1',
  [sessionId],
)).rows[0].count, 0);
assert.equal((await client.query(
  'select count(*)::integer as count from public.session_participants where session_id = $1',
  [sessionId],
)).rows[0].count, 0);
assert.equal(await sessionRevision(sessionId), beforeSessionRevision);
assert.equal((await client.query(
  `select count(*)::integer as count from app_private.command_receipts
    where command_type = 'finalize_session_roster' and aggregate_id = $1`,
  [windowId],
)).rows[0].count, 0);
```

- [ ] **Step 4: Run the focused suite and verify RED**

Run:

```powershell
$env:VOLLEY_TEST_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:55500/postgres'
npm run test:db -- registrationFinalize.dbtest.ts
```

Expected: exit non-zero. Behavioral calls fail with SQLSTATE `42883` because
`public.finalize_session_roster(uuid, uuid, integer)` does not exist. If setup fails before reaching
that error, repair the fixture rather than weakening an assertion.

- [ ] **Step 5: Commit the RED contract**

```powershell
git add -- src/test/db/registrationFinalize.dbtest.ts
git commit -m "test: pin Registration roster finalization"
```

---

### Task 2: Implement the transactional finalization core

**Files:**

- Modify: `supabase/migrations/20260902141626_finalize_session_roster.sql`
- Test: `src/test/db/registrationFinalize.dbtest.ts`

**Interfaces:**

- Consumes: `public.assert_target_session_write_authorized(public.sessions)`,
  `app_private.registration_entry_still_eligible(uuid)`,
  `app_private.materialize_target_session_roster(uuid, uuid, text, integer, bigint, text, uuid,
  jsonb, integer)`.
- Produces: the public RPC signature in the spec. Task 4 will add receipts and same-source
  convergence without changing the signature or successful result shape.

- [ ] **Step 1: Implement the core function**

Write the migration with this structure. Keep every relation, function and built-in
schema-qualified; do not add source comments.

```sql
create function public.finalize_session_roster(
  p_command_id uuid,
  p_window_id uuid,
  p_expected_registration_revision integer
)
returns table (
  roster_revision_id uuid,
  roster_revision_number integer,
  source_registration_revision bigint,
  session_revision integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session_id uuid;
  v_session public.sessions;
  v_window public.registration_windows;
  v_entries jsonb;
  v_ineligible_entry_id uuid;
  v_roster_revision_id uuid;
  v_roster_revision_number integer;
  v_new_session_revision integer;
begin
  if p_command_id is null or p_window_id is null or p_expected_registration_revision is null then
    raise exception 'command_id, window_id and expected Registration revision are required'
      using errcode = '23514';
  end if;

  select w.session_id into v_session_id
    from public.registration_windows w
   where w.id = p_window_id;
  if not found then
    raise exception 'Registration Window not found' using errcode = 'P0002';
  end if;

  select * into v_session
    from public.sessions s
   where s.id = v_session_id
     and s.authority_model = 'target'
     and s.session_context = 'COMMUNITY'
   for update;
  if not found then
    raise exception 'Target Community Session not found' using errcode = 'P0002';
  end if;

  select * into v_window
    from public.registration_windows w
   where w.id = p_window_id
     and w.session_id = v_session.id
   for update;
  if not found then
    raise exception 'Registration Window not found for Session' using errcode = 'P0002';
  end if;

  perform public.assert_target_session_write_authorized(v_session);

  if v_session.lifecycle_status not in ('DRAFT', 'SCHEDULED') then
    raise exception 'Session must be DRAFT or SCHEDULED to finalize Registration roster'
      using errcode = '23514';
  end if;
  if v_window.status <> 'LOCKED' then
    raise exception 'Registration Window must be LOCKED to finalize roster'
      using errcode = '23514';
  end if;
  if v_window.revision is distinct from p_expected_registration_revision then
    raise exception 'Stale Registration revision' using errcode = '40001';
  end if;

  select e.id into v_ineligible_entry_id
    from public.registration_entries e
   where e.registration_window_id = v_window.id
     and e.status = 'CONFIRMED'
     and not app_private.registration_entry_still_eligible(e.id)
   order by e.joined_at, e.id
   limit 1;
  if found then
    raise exception 'Confirmed Registration entry % is no longer eligible', v_ineligible_entry_id
      using errcode = '23514';
  end if;

  select pg_catalog.jsonb_agg(
           pg_catalog.jsonb_build_object(
             'entry_order', ordered.entry_order,
             'participant_id', coalesce(sp.id, pg_catalog.gen_random_uuid())::text,
             'identity_kind', 'PLAYER',
             'player_id', ordered.player_id::text,
             'display_name', coalesce(
               pg_catalog.nullif(pg_catalog.btrim(pg_catalog.coalesce(p.nickname, '')), ''),
               pg_catalog.btrim(p.name)
             )
           )
           order by ordered.entry_order
         )
    into v_entries
    from (
      select e.player_id, pg_catalog.row_number() over (order by e.joined_at, e.id) - 1 as entry_order
        from public.registration_entries e
       where e.registration_window_id = v_window.id
         and e.status = 'CONFIRMED'
    ) ordered
    join public.players p on p.id = ordered.player_id
    left join public.session_participants sp
      on sp.session_id = v_session.id and sp.player_id = ordered.player_id;

  if v_entries is null or pg_catalog.jsonb_array_length(v_entries) = 0 then
    raise exception 'Registration roster requires at least one confirmed entry'
      using errcode = '23514';
  end if;

  v_roster_revision_id := pg_catalog.gen_random_uuid();
  v_roster_revision_number := app_private.materialize_target_session_roster(
    v_roster_revision_id,
    v_session.id,
    'REGISTRATION',
    null,
    v_window.revision::bigint,
    null,
    (select auth.uid()),
    v_entries
  );

  update public.sessions
     set revision = revision + 1,
         updated_at = pg_catalog.now()
   where id = v_session.id;
  v_new_session_revision := v_session.revision + 1;

  return query
    select v_roster_revision_id,
           v_roster_revision_number,
           v_window.revision::bigint,
           v_new_session_revision;
end;
$$;

revoke all on function public.finalize_session_roster(uuid, uuid, integer)
  from public, anon;
grant execute on function public.finalize_session_roster(uuid, uuid, integer)
  to authenticated;
```

If the local PostgreSQL version does not expose `pg_catalog.gen_random_uuid()`, confirm the actual
function schema with:

```sql
select n.nspname
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
 where p.proname = 'gen_random_uuid';
```

Then use that discovered schema explicitly. Do not unqualify the call or add an extension version.

- [ ] **Step 2: Run the core suite and verify GREEN**

```powershell
$env:VOLLEY_TEST_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:55500/postgres'
npm run test:db -- registrationFinalize.dbtest.ts
```

Expected: every Task 1 test passes. Inspect any `42883`, `42703`, `23505` or unexpected row shape;
do not weaken the test contract.

- [ ] **Step 3: Run the adjacent roster and Registration suites**

```powershell
$env:VOLLEY_TEST_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:55500/postgres'
npm run test:db -- sessionRosterRevisions.dbtest.ts
npm run test:db -- registrationLeave.dbtest.ts
npm run test:db -- registrationLifecycle.dbtest.ts
```

Expected: all pass.

- [ ] **Step 4: Commit the core**

```powershell
git add -- supabase/migrations/20260902141626_finalize_session_roster.sql
git commit -m "feat: finalize locked Registration rosters"
```

---

### Task 3: Pin idempotency, security, concurrency, rollback and readiness

**Files:**

- Modify: `src/test/db/registrationFinalize.dbtest.ts`
- Test: `src/test/db/registrationFinalize.dbtest.ts`

**Interfaces:**

- Consumes: the Task 2 RPC and all Task 1 fixtures.
- Produces: the advanced exit-gate contract Task 4 must satisfy without changing the public
  signature.

- [ ] **Step 1: Add receipt and convergence tests**

Append tests that prove:

```typescript
test('same command_id retry returns the identical result with one effect and one receipt', async () => {
  const commandId = randomUUID();
  const first = await finalizeRoster(organizer, { commandId, windowId, expectedRevision });
  const second = await finalizeRoster(organizer, { commandId, windowId, expectedRevision });
  assert.deepEqual(second.rows, first.rows);
  assert.equal(await rosterRevisionCount(sessionId), 1);
  assert.equal(await finalizeReceiptCount(windowId), 1);
});

test('distinct command IDs for one Registration source converge without a second Session bump', async () => {
  const first = await finalizeRoster(organizer, { windowId, expectedRevision });
  const afterFirst = await sessionRevision(sessionId);
  const second = await finalizeRoster(organizer, { windowId, expectedRevision });
  assert.equal(second.rows[0].roster_revision_id, first.rows[0].roster_revision_id);
  assert.equal(second.rows[0].roster_revision_number, first.rows[0].roster_revision_number);
  assert.equal(second.rows[0].session_revision, afterFirst);
  assert.equal(await sessionRevision(sessionId), afterFirst);
  assert.equal(await rosterRevisionCount(sessionId), 1);
  assert.equal(await finalizeReceiptCount(windowId), 2);
});
```

Add collision tests using one `command_id` first with `finalize_session_roster`, then against another
Window and against `lock_registration`; both collisions must raise `23505` without a new effect.

- [ ] **Step 2: Add security and metadata tests**

Add one table-driven authorization test for anonymous, active but unassigned Community member,
revoked Session Organizer assignment, Organizer from another Community and assigned Organizer for a
different Session. Each must raise `42501` and leave every atomicity surface unchanged.

Assert metadata with catalog queries:

```typescript
const fn = await client.query<{
  prosecdef: boolean;
  proconfig: string[] | null;
}>(
  `select p.prosecdef, p.proconfig
     from pg_catalog.pg_proc p
     join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'finalize_session_roster'
      and pg_catalog.pg_get_function_identity_arguments(p.oid) = 'p_command_id uuid, p_window_id uuid, p_expected_registration_revision integer'`,
);
assert.deepEqual(fn.rows, [{ prosecdef: true, proconfig: ['search_path='] }]);
```

Assert `anon` and `PUBLIC` cannot execute, `authenticated` can execute, `registration_entries` has no
browser privilege, and roster tables have no browser mutation privilege. Query
`information_schema.role_routine_grants`, `information_schema.role_table_grants` and
`has_function_privilege` rather than relying only on an RPC call.

Assert the final partial index is unique, ordered by `(session_id, source_registration_revision)` and
has predicate `source_kind = 'REGISTRATION'` using `pg_catalog.pg_index` plus
`pg_catalog.pg_get_expr`.

- [ ] **Step 3: Add controlled concurrency and rollback tests**

Use two dedicated `PoolClient` connections and the barrier pattern from
`registrationJoin.dbtest.ts`: begin both transactions as the same Organizer, launch both finalizes
with distinct command IDs, wait until one backend is blocked on a lock, commit the winner, then
await/commit the loser. Assert both results name the same roster revision, two receipts exist, one
revision exists and Session revision advanced once.

For rollback, create a transaction-local trigger function that raises on the Session revision update
for only the target Session:

```sql
create or replace function pg_temp.fail_finalize_session_bump()
returns trigger language plpgsql as $$
begin
  raise exception 'injected finalize failure' using errcode = 'P0001';
end;
$$;
```

Install the trigger on `public.sessions` in the same dedicated connection, invoke finalization there,
assert `P0001`, roll back, and verify through the control client that no participant/revision/entry,
Session bump or receipt survived. Drop/rollback the trigger before the next test.

- [ ] **Step 4: Add readiness and snapshot-stability tests**

Before finalization, call `public.read_target_session_readiness(session_id)` and assert
`NO_EFFECTIVE_ROSTER`. Finalize, call it again, and assert that code is absent while
`RULES_INVALID`/`COURT_CONFIGURATION_INVALID` remain.

Then mutate the confirmed Player's nickname, roster relation and account link after successful
finalization. A distinct finalize command for the same frozen revision must still return the same
immutable revision without changing its names, participants or Session revision.

- [ ] **Step 5: Run the suite and verify RED**

```powershell
$env:VOLLEY_TEST_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:55500/postgres'
npm run test:db -- registrationFinalize.dbtest.ts
```

Expected: exit non-zero. At minimum, same-command retry and distinct-command convergence fail because
Task 2 has no receipt lookup, no unique source index and no convergence branch. Confirm the failure
is behavioral rather than fixture setup.

- [ ] **Step 6: Commit the advanced RED contract**

```powershell
git add -- src/test/db/registrationFinalize.dbtest.ts
git commit -m "test: pin roster finalization hardening"
```

---

### Task 4: Harden finalization for idempotency and concurrency

**Files:**

- Modify: `supabase/migrations/20260902141626_finalize_session_roster.sql`
- Test: `src/test/db/registrationFinalize.dbtest.ts`

**Interfaces:**

- Consumes: `app_private.find_command_receipt` and `app_private.record_command_receipt`.
- Produces: final `finalize_session_roster` semantics and
  `roster_revisions_registration_source_key`.

- [ ] **Step 1: Add the database convergence constraint**

Place this before the function:

```sql
create unique index roster_revisions_registration_source_key
  on public.roster_revisions (session_id, source_registration_revision)
  where source_kind = 'REGISTRATION';
```

- [ ] **Step 2: Add receipt lookup after authorization**

Declare:

```sql
v_receipt jsonb;
v_existing public.roster_revisions;
v_result jsonb;
```

Immediately after `assert_target_session_write_authorized`, add:

```sql
v_receipt := app_private.find_command_receipt(
  p_command_id, 'finalize_session_roster', p_window_id
);
if v_receipt is not null then
  return query
    select (v_receipt ->> 'roster_revision_id')::uuid,
           (v_receipt ->> 'roster_revision_number')::integer,
           (v_receipt ->> 'source_registration_revision')::bigint,
           (v_receipt ->> 'session_revision')::integer;
  return;
end if;
```

Keep lifecycle/status/staleness validation after this block. Authorization must remain before it.

- [ ] **Step 3: Add distinct-command convergence**

After the stale revision check and before mutable eligibility checks, add:

```sql
select * into v_existing
  from public.roster_revisions r
 where r.session_id = v_session.id
   and r.source_kind = 'REGISTRATION'
   and r.source_registration_revision = v_window.revision::bigint;

if found then
  v_result := pg_catalog.jsonb_build_object(
    'roster_revision_id', v_existing.id,
    'roster_revision_number', v_existing.revision_number,
    'source_registration_revision', v_existing.source_registration_revision,
    'session_revision', v_session.revision
  );
  perform app_private.record_command_receipt(
    p_command_id,
    (select auth.uid()),
    'finalize_session_roster',
    p_window_id,
    v_result,
    'SESSION_ROSTER'
  );
  return query
    select v_existing.id,
           v_existing.revision_number,
           v_existing.source_registration_revision,
           v_session.revision;
  return;
end if;
```

This branch intentionally precedes revalidation of mutable Player/membership state. It returns the
already immutable snapshot rather than retrospectively invalidating it.

- [ ] **Step 4: Record the first successful result**

After materialization and Session update, build and record the result before returning:

```sql
v_result := pg_catalog.jsonb_build_object(
  'roster_revision_id', v_roster_revision_id,
  'roster_revision_number', v_roster_revision_number,
  'source_registration_revision', v_window.revision,
  'session_revision', v_new_session_revision
);
perform app_private.record_command_receipt(
  p_command_id,
  (select auth.uid()),
  'finalize_session_roster',
  p_window_id,
  v_result,
  'SESSION_ROSTER'
);
```

Return values from `v_result` so receipt and response cannot drift.

- [ ] **Step 5: Run focused and adjacent suites**

```powershell
$env:VOLLEY_TEST_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:55500/postgres'
npm run test:db -- registrationFinalize.dbtest.ts
npm run test:db -- sessionRosterRevisions.dbtest.ts
npm run test:db -- sessionLifecycleCommands.dbtest.ts
npm run test:db -- registrationLeave.dbtest.ts
npm run test:db -- registrationLifecycle.dbtest.ts
npm run test:db -- registrationJoin.dbtest.ts
npm run test:db -- registrationSchema.dbtest.ts
```

Expected: all pass with zero failures.

- [ ] **Step 6: Run database static checks**

```powershell
npx supabase db lint --db-url 'postgresql://postgres:postgres@127.0.0.1:55500/postgres' --schema public,app_private --level error --fail-on error
npx supabase db advisors --db-url 'postgresql://postgres:postgres@127.0.0.1:55500/postgres' --type security --level error --fail-on error
npx supabase migration list --db-url 'postgresql://postgres:postgres@127.0.0.1:55500/postgres'
```

Expected: no new error-level lint/advisor finding caused by this migration, and the chronological
migration list includes `20260902141626`. If the plain test container does not expose Supabase
advisor helpers, record that exact tool limitation and rely on the catalog security tests; do not
hide a real finding.

- [ ] **Step 7: Commit the hardening**

```powershell
git add -- supabase/migrations/20260902141626_finalize_session_roster.sql
git commit -m "fix: harden roster finalization concurrency"
```

---

### Task 5: Verify the exit gate and preserve branch evidence

**Files:**

- Modify: `README.md`
- Modify: `HANDOFF.md`

**Interfaces:**

- Consumes: every W4-05 commit and verification result.
- Produces: canonical resumption point `XS-W4-06 — Legacy Session Registration introduction`.

- [ ] **Step 1: Update chronological migration documentation**

Add `20260902141626_finalize_session_roster.sql` immediately after the W4-04 migration in the
README migration list. Describe it as the locked Registration-to-roster materialization command,
not as UI availability.

- [ ] **Step 2: Update HANDOFF**

Make these exact status changes:

```text
XS-W4-05 | FinalizeSessionRoster | concluída
XS-W4-06 | Legacy Session Registration introduction | próxima
```

Replace stale branch-chain text that says nothing is merged into `main`: the prior branches were
consolidated locally before W4-05. Add a W4-05 delivery section recording:

- Window must already be `LOCKED`;
- first materialization revalidates every confirmed entry and rejects the whole command on one
  ineligible entry;
- empty finalization is rejected;
- exact Registration revision provenance and confirmed-only deterministic ordering;
- same-command receipt idempotency and distinct-command convergence;
- Session-before-Window lock order;
- no browser grant on `registration_entries`;
- remaining W4-06 boundary and `OPEN-REG-006` reopen deferral.

Do not claim production deployment, UI wiring, Realtime or W4-06 completion.

- [ ] **Step 3: Run touched-file static checks**

```powershell
npm run typecheck
npx eslint -- src/test/db/registrationFinalize.dbtest.ts
npx prettier --check README.md HANDOFF.md docs/superpowers/specs/2026-09-02-xs-w4-05-finalize-session-roster-design.md docs/superpowers/plans/2026-09-02-xs-w4-05-finalize-session-roster.md src/test/db/registrationFinalize.dbtest.ts supabase/migrations/20260902141626_finalize_session_roster.sql
git diff --check
```

Expected: typecheck and formatting pass; ESLint has zero errors. Existing project warnings may remain
but no new warning may be introduced by the W4-05 test file.

- [ ] **Step 4: Run the complete test and build gate**

```powershell
npm test
$env:VOLLEY_TEST_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:55500/postgres'
npm run test:db
npm run build
```

Expected: unit, UI and all database tests pass with zero failures; production build exits zero.

- [ ] **Step 5: Commit documentation**

```powershell
git add -- README.md HANDOFF.md
git commit -m "docs: record XS-W4-05 completion"
```

- [ ] **Step 6: Verify final branch state**

```powershell
git status --short --branch
git log --oneline --decorate -8
git diff main...HEAD --check
```

Expected: clean `exec/c6-w4-05-finalize-session-roster` worktree and a reviewable diff containing
only the approved W4-05 spec, plan, migration, DB tests and documentation.

After all tasks pass, use `superpowers:requesting-code-review`, then
`superpowers:verification-before-completion`, then `superpowers:finishing-a-development-branch`.
