# XS-W4-06 Legacy Registration Introduction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an Organizer move one upcoming Session that was cut over from the legacy model into
target Registration, deriving the confirmed set from the cutover roster revision and recording the
introduction immutably.

**Architecture:** One additive SQL migration. It adds a private provenance ledger, a private player
standing predicate that the W4-04 eligibility function is refactored to delegate to, a source
fingerprint helper, a read-only inspection command and one write command. The write command locks
the Session, authorizes through the existing target Session organizer assignment helper, validates,
then inserts the Window, its `CONFIRMED` entries and the ledger row in a single transaction with a
single Window revision.

**Tech Stack:** PostgreSQL 15 (Supabase), plpgsql `SECURITY DEFINER` commands, `node:test` +
`pg` database suites run by `npm run test:db`.

**Spec:** `docs/superpowers/specs/2026-09-04-xs-w4-06-legacy-registration-introduction-design.md`

## Global Constraints

- Node >= 20 (22 recommended, `.nvmrc`). Run `nvm use` if anything errors.
- Every new function is `language plpgsql` or `language sql`, `security definer`,
  `set search_path = ''`, with every reference schema-qualified (`public.`, `app_private.`,
  `pg_catalog.`).
- Public commands: `revoke all ... from public, anon, authenticated;` then
  `grant execute ... to authenticated;`. Private functions: `revoke all ... from public, anon,
  authenticated;` and no grant.
- `registration_entries` and `app_private.registration_introductions` receive **no** table grant of
  any kind.
- Error codes: `23514` validation and blockers, `23505` command id collision only, `P0002` row
  absent, `42501` authorization, `55000` immutability violation. This command never raises `40001`.
- Lock order is Session before Window, always.
- One Window revision per command. The introduction creates the Window at `revision = 1` and never
  bumps it again.
- `npm run test:db` requires a real PostgreSQL and never mocks one (QA-INV-003/004):
  `VOLLEY_TEST_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:55500/postgres'`, served by
  the existing container `volley_test_pg2`. Preserve the container between sessions; do not tear it
  down.
- Migration file names are `supabase/migrations/<UTC timestamp>_<snake_name>.sql` and are applied in
  filename order. The new file must sort **after** `20260902141626_finalize_session_roster.sql`.
- No comments in TypeScript source unless the code would be misread without them. SQL comments are
  used in this codebase to record load-bearing reasoning, and this plan reproduces them verbatim
  where they exist.
- Global `npm run lint:eslint` and `npm run format:check` fail repository-wide because of untracked
  directories and the sibling worktree. That noise is not this branch's. Prove the branch is clean
  by running `npx eslint` and `npx prettier --check` on the changed files only, and never run
  `prettier --write` across the repository.

## File Structure

- Create `supabase/migrations/<timestamp>_legacy_registration_introduction.sql` — the whole slice:
  ledger table, immutability trigger, `registration_player_standing_alive`, the redefinition of
  `registration_entry_still_eligible`, `legacy_registration_source_fingerprint`,
  `inspect_registration_introduction`, `introduce_registration_from_legacy_roster`, grants and
  revokes. One file, because every object here is born together and a partially applied slice would
  leave a command without its ledger.
- Create `src/test/db/registrationIntroduction.dbtest.ts` — the database suite for this slice. It
  owns its own fixtures, including the legacy-session-plus-cutover fixture no other suite needs.
- Modify `README.md` — the migration list.
- Modify `HANDOFF.md` — slice table, what W4-06 delivered, verification evidence.

Nothing in `src/application/`, `src/infra/`, `src/hooks/` or `src/components/` changes. This slice
has no client surface.

---

### Task 1: Pin the introduction contract with failing database tests

**Files:**

- Test: `src/test/db/registrationIntroduction.dbtest.ts` (create)

**Interfaces:**

- Consumes: existing harness `connect`, `createPool`, `rebuildFromMigrations`,
  `asIdentityCommitting`, `isTestDatabaseConfigured`, `TEST_DATABASE_URL_VAR` from
  `src/test/db/harness`; existing commands `public.create_community_with_owner(text)`,
  `public.inspect_legacy_session_cutover(uuid)`,
  `public.transition_legacy_session_to_target(uuid, uuid, text, text, text)`,
  `public.create_registration_window(uuid, uuid, uuid, integer, timestamptz)`,
  `public.open_registration(uuid, uuid, integer)`,
  `public.join_registration(uuid, uuid)`,
  `public.leave_registration(uuid, uuid)`.
- Produces: the fixture helpers `legacyCommunitySession`, `cutOverSession` and `introduce`, reused
  by Task 3.

- [ ] **Step 1: Create the suite skeleton and fixtures**

Create `src/test/db/registrationIntroduction.dbtest.ts`:

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

interface IntroductionRow extends QueryResultRow {
  window_id: string;
  window_revision: number;
  confirmed_count: number;
}

interface InspectionRow extends QueryResultRow {
  introducible: boolean;
  source_fingerprint: string | null;
  confirmed_count: number;
  blockers: string[];
  entries: Array<{
    entry_order: number;
    player_id: string;
    display_name_at_time: string;
    eligible: boolean;
  }>;
}

interface LedgerRow extends QueryResultRow {
  registration_window_id: string;
  session_id: string;
  source_kind: string;
  source_roster_revision_id: string;
  source_fingerprint: string;
  confirmed_count: number;
  capacity_at_introduction: number;
  initial_window_status: string;
  initial_window_revision: number;
  queue_chronology: string;
  command_id: string;
  introduced_by_user_id: string | null;
}

interface EntryRow extends QueryResultRow {
  player_id: string;
  status: string;
  queue_sequence: string | null;
  source: string;
}

if (!isTestDatabaseConfigured()) {
  test(`registration introduction requires ${TEST_DATABASE_URL_VAR}`, () => {
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

  async function newUser(email: string): Promise<string> {
    const { rows } = await client.query<{ id: string }>(
      'insert into auth.users (email) values ($1) returning id',
      [email],
    );
    await client.query(
      'insert into public.profiles (id, email) values ($1, $2) on conflict do nothing',
      [rows[0].id, email],
    );
    return rows[0].id;
  }

  async function targetCommunity(ownerId: string, name: string): Promise<string> {
    const { rows } = await call<{ id: string }>(
      ownerId,
      'select public.create_community_with_owner($1) as id',
      [name],
    );
    return rows[0].id;
  }

  async function activeMembership(communityId: string, userId: string): Promise<void> {
    await client.query(
      `insert into public.community_memberships (community_id, user_id, role, status)
       values ($1, $2, 'member', 'active')
       on conflict (community_id, user_id) do update set status = 'active'`,
      [communityId, userId],
    );
  }

  async function grantOrganizer(communityId: string, userId: string): Promise<void> {
    await client.query(
      `insert into public.community_responsibilities (community_id, user_id, responsibility)
       values ($1, $2, 'ORGANIZER')
       on conflict (community_id, user_id, responsibility) do update set revoked_at = null`,
      [communityId, userId],
    );
  }

  async function createPlayer(
    ownerId: string,
    input: { name?: string; active?: boolean; deletedAt?: string | null } = {},
  ): Promise<string> {
    const id = randomUUID();
    await client.query(
      `insert into public.players (
         id, owner_id, name, nickname, active, deleted_at, has_account_identity_history
       ) values ($1, $2, $3, null, $4, $5::timestamptz, false)`,
      [id, ownerId, input.name ?? 'Jogadora', input.active ?? true, input.deletedAt ?? null],
    );
    return id;
  }

  async function addCommunityPlayer(
    communityId: string,
    playerId: string,
    ownerId: string,
  ): Promise<void> {
    await client.query(
      `insert into public.community_players (community_id, player_id, owner_id, active, status)
       values ($1, $2, $3, true, 'active')`,
      [communityId, playerId, ownerId],
    );
  }

  async function linkedMember(
    communityId: string,
    ownerId: string,
    email: string,
  ): Promise<{ userId: string; playerId: string }> {
    const userId = await newUser(email);
    await activeMembership(communityId, userId);
    const playerId = await createPlayer(ownerId, { name: email });
    await client.query(
      `insert into public.player_account_links (player_id, user_id, status, provenance, activated_at)
       values ($1, $2, 'ACTIVE', 'SELF_CLAIM', now())`,
      [playerId, userId],
    );
    await addCommunityPlayer(communityId, playerId, ownerId);
    return { userId, playerId };
  }

  async function rosterOnlyPlayer(
    communityId: string,
    ownerId: string,
    name: string,
  ): Promise<string> {
    const playerId = await createPlayer(ownerId, { name });
    await addCommunityPlayer(communityId, playerId, ownerId);
    return playerId;
  }

  async function legacyCommunitySession(
    ownerId: string,
    communityId: string,
    selectedPlayerIds: string[],
    name = 'Pelada legada',
  ): Promise<string> {
    const { rows } = await client.query<{ id: string }>(
      `insert into public.sessions (
         owner_id, community_id, name, date, status, type,
         selected_player_ids, team_ids, config
       ) values ($1, $2, $3, '2030-01-01', 'draft', 'free_play', $4::text[], '{}'::text[], '{}'::jsonb)
       returning id`,
      [ownerId, communityId, name, selectedPlayerIds],
    );
    return rows[0].id;
  }

  async function cutOverSession(
    actorId: string,
    communityId: string,
    selectedPlayerIds: string[],
    name?: string,
  ): Promise<string> {
    await grantOrganizer(communityId, actorId);
    const sessionId = await legacyCommunitySession(actorId, communityId, selectedPlayerIds, name);
    const inspection = await call<{ eligible: boolean; source_fingerprint: string }>(
      actorId,
      'select * from public.inspect_legacy_session_cutover($1)',
      [sessionId],
    );
    assert.equal(inspection.rows[0].eligible, true);
    await call(
      actorId,
      `select * from public.transition_legacy_session_to_target($1, $2, $3, 'COMMUNITY', 'FREE_PLAY')`,
      [randomUUID(), sessionId, inspection.rows[0].source_fingerprint],
    );
    return sessionId;
  }

  async function inspectIntroduction(actorId: string | null, sessionId: string) {
    return call<InspectionRow>(
      actorId,
      'select * from public.inspect_registration_introduction($1)',
      [sessionId],
    );
  }

  async function introduce(
    actorId: string | null,
    input: {
      commandId?: string;
      windowId?: string;
      sessionId: string;
      capacity: number;
      closesAt?: string | null;
    },
  ) {
    return call<IntroductionRow>(
      actorId,
      `select * from public.introduce_registration_from_legacy_roster($1, $2, $3, $4, $5::timestamptz)`,
      [
        input.commandId ?? randomUUID(),
        input.windowId ?? randomUUID(),
        input.sessionId,
        input.capacity,
        input.closesAt ?? null,
      ],
    );
  }

  async function entriesOf(windowId: string): Promise<EntryRow[]> {
    const { rows } = await client.query<EntryRow>(
      `select player_id, status, queue_sequence::text as queue_sequence, source
         from public.registration_entries
        where registration_window_id = $1
        order by player_id`,
      [windowId],
    );
    return rows;
  }

  async function ledgerOf(sessionId: string): Promise<LedgerRow[]> {
    const { rows } = await client.query<LedgerRow>(
      'select * from app_private.registration_introductions where session_id = $1',
      [sessionId],
    );
    return rows;
  }
}
```

- [ ] **Step 2: Write the happy-path and ledger test**

Insert inside the `else` block, after the helpers:

```ts
  test('introduction materializes confirmed entries, one revision and an exact ledger row', async () => {
    const organizerId = await newUser('w406-happy-organizer@example.com');
    const communityId = await targetCommunity(organizerId, 'W406 Happy');
    const first = await rosterOnlyPlayer(communityId, organizerId, 'Ana');
    const second = await rosterOnlyPlayer(communityId, organizerId, 'Bia');
    const sessionId = await cutOverSession(organizerId, communityId, [first, second]);

    const windowId = randomUUID();
    const commandId = randomUUID();
    const result = await introduce(organizerId, {
      commandId,
      windowId,
      sessionId,
      capacity: 12,
    });

    assert.deepEqual(result.rows, [
      { window_id: windowId, window_revision: 1, confirmed_count: 2 },
    ]);

    const { rows: windows } = await client.query<{
      status: string;
      capacity: number;
      revision: number;
      next_queue_sequence: string;
    }>(
      `select status, capacity, revision, next_queue_sequence::text as next_queue_sequence
         from public.registration_windows where id = $1`,
      [windowId],
    );
    assert.deepEqual(windows, [
      { status: 'DRAFT', capacity: 12, revision: 1, next_queue_sequence: '1' },
    ]);

    const entries = await entriesOf(windowId);
    assert.equal(entries.length, 2);
    for (const entry of entries) {
      assert.equal(entry.status, 'CONFIRMED');
      assert.equal(entry.source, 'MIGRATION');
      assert.equal(entry.queue_sequence, null);
    }
    assert.deepEqual(
      entries.map((entry) => entry.player_id).sort(),
      [first, second].sort(),
    );

    const ledger = await ledgerOf(sessionId);
    assert.equal(ledger.length, 1);
    assert.equal(ledger[0].registration_window_id, windowId);
    assert.equal(ledger[0].source_kind, 'LEGACY_SELECTED_ROSTER');
    assert.equal(ledger[0].confirmed_count, 2);
    assert.equal(ledger[0].capacity_at_introduction, 12);
    assert.equal(ledger[0].initial_window_status, 'DRAFT');
    assert.equal(ledger[0].initial_window_revision, 1);
    assert.equal(ledger[0].queue_chronology, 'UNKNOWN');
    assert.equal(ledger[0].command_id, commandId);
    assert.equal(ledger[0].introduced_by_user_id, organizerId);

    const { rows: revisions } = await client.query<{ id: string }>(
      `select id from public.roster_revisions
        where session_id = $1 and source_kind = 'LEGACY_SELECTED_ROSTER'`,
      [sessionId],
    );
    assert.equal(ledger[0].source_roster_revision_id, revisions[0].id);
  });
```

- [ ] **Step 3: Write the "one revision regardless of size" test**

```ts
  test('five migrated members still leave one revision and an untouched queue counter', async () => {
    const organizerId = await newUser('w406-revision-organizer@example.com');
    const communityId = await targetCommunity(organizerId, 'W406 Revision');
    const players: string[] = [];
    for (let index = 0; index < 5; index += 1) {
      players.push(await rosterOnlyPlayer(communityId, organizerId, `Atleta ${index}`));
    }
    const sessionId = await cutOverSession(organizerId, communityId, players);

    const windowId = randomUUID();
    await introduce(organizerId, { windowId, sessionId, capacity: 10 });

    const { rows } = await client.query<{ revision: number; next_queue_sequence: string }>(
      `select revision, next_queue_sequence::text as next_queue_sequence
         from public.registration_windows where id = $1`,
      [windowId],
    );
    assert.deepEqual(rows, [{ revision: 1, next_queue_sequence: '1' }]);
    assert.equal((await entriesOf(windowId)).length, 5);
  });
```

- [ ] **Step 4: Write the queue exit-gate test**

This is the slice's exit gate: the first genuine target join takes sequence 1, proving migrated
entries consumed no position.

```ts
  test('the first genuine join after an introduction takes queue sequence 1', async () => {
    const organizerId = await newUser('w406-queue-organizer@example.com');
    const communityId = await targetCommunity(organizerId, 'W406 Queue');
    const migrated = await rosterOnlyPlayer(communityId, organizerId, 'Migrada');
    const sessionId = await cutOverSession(organizerId, communityId, [migrated]);

    const windowId = randomUUID();
    await introduce(organizerId, { windowId, sessionId, capacity: 1 });
    await call(organizerId, 'select * from public.open_registration($1, $2, $3)', [
      randomUUID(),
      windowId,
      1,
    ]);

    const joiner = await linkedMember(communityId, organizerId, 'w406-queue-joiner@example.com');
    await call(joiner.userId, 'select * from public.join_registration($1, $2)', [
      randomUUID(),
      windowId,
    ]);

    const { rows } = await client.query<{ status: string; queue_sequence: string }>(
      `select status, queue_sequence::text as queue_sequence
         from public.registration_entries
        where registration_window_id = $1 and player_id = $2`,
      [windowId, joiner.playerId],
    );
    assert.deepEqual(rows, [{ status: 'WAITLISTED', queue_sequence: '1' }]);
  });
```

- [ ] **Step 5: Write the promotion-across-the-boundary test**

```ts
  test('a migrated member leaving promotes the waitlisted joiner', async () => {
    const organizerId = await newUser('w406-promote-organizer@example.com');
    const communityId = await targetCommunity(organizerId, 'W406 Promote');
    const migrated = await linkedMember(communityId, organizerId, 'w406-promote-migrated@example.com');
    const sessionId = await cutOverSession(organizerId, communityId, [migrated.playerId]);

    const windowId = randomUUID();
    await introduce(organizerId, { windowId, sessionId, capacity: 1 });
    await call(organizerId, 'select * from public.open_registration($1, $2, $3)', [
      randomUUID(),
      windowId,
      1,
    ]);
    const joiner = await linkedMember(communityId, organizerId, 'w406-promote-joiner@example.com');
    await call(joiner.userId, 'select * from public.join_registration($1, $2)', [
      randomUUID(),
      windowId,
    ]);

    await call(migrated.userId, 'select * from public.leave_registration($1, $2)', [
      randomUUID(),
      windowId,
    ]);

    const { rows } = await client.query<{ status: string }>(
      `select status from public.registration_entries
        where registration_window_id = $1 and player_id = $2`,
      [windowId, joiner.playerId],
    );
    assert.deepEqual(rows, [{ status: 'CONFIRMED' }]);
  });
```

- [ ] **Step 6: Write the capacity and all-or-nothing tests**

```ts
  test('capacity below the migrated confirmed count is refused', async () => {
    const organizerId = await newUser('w406-capacity-organizer@example.com');
    const communityId = await targetCommunity(organizerId, 'W406 Capacity');
    const first = await rosterOnlyPlayer(communityId, organizerId, 'Ana');
    const second = await rosterOnlyPlayer(communityId, organizerId, 'Bia');
    const sessionId = await cutOverSession(organizerId, communityId, [first, second]);

    await assert.rejects(
      introduce(organizerId, { sessionId, capacity: 1 }),
      (error: unknown) => {
        assertSqlState(error, '23514');
        return true;
      },
    );
  });

  test('one ineligible member refuses the introduction and writes nothing', async () => {
    const organizerId = await newUser('w406-atomic-organizer@example.com');
    const communityId = await targetCommunity(organizerId, 'W406 Atomic');
    const healthy = await rosterOnlyPlayer(communityId, organizerId, 'Saudavel');
    const doomed = await rosterOnlyPlayer(communityId, organizerId, 'Removida');
    const sessionId = await cutOverSession(organizerId, communityId, [healthy, doomed]);

    await client.query('update public.players set deleted_at = now() where id = $1', [doomed]);

    await assert.rejects(introduce(organizerId, { sessionId, capacity: 12 }), (error: unknown) => {
      assertSqlState(error, '23514');
      return true;
    });

    const { rows: windows } = await client.query(
      'select 1 from public.registration_windows where session_id = $1',
      [sessionId],
    );
    assert.equal(windows.length, 0);
    assert.equal((await ledgerOf(sessionId)).length, 0);
    const { rows: receipts } = await client.query(
      `select 1 from app_private.command_receipts
        where command_type = 'introduce_registration_from_legacy_roster'`,
    );
    assert.equal(receipts.length, 0);
  });
```

- [ ] **Step 7: Run the suite to verify every test fails for the right reason**

Run:

```bash
VOLLEY_TEST_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:55500/postgres' npx tsx --test src/test/db/registrationIntroduction.dbtest.ts
```

Expected: every test fails with SQL state `42883`
(`function public.introduce_registration_from_legacy_roster(...) does not exist`) or
`42P01` for `app_private.registration_introductions`. A failure with any other code means a fixture
is wrong — fix the fixture before writing any implementation.

- [ ] **Step 8: Commit**

```bash
git add src/test/db/registrationIntroduction.dbtest.ts
git commit -m "test: pin the legacy Registration introduction contract"
```

---

### Task 2: Implement the introduction migration

**Files:**

- Create: `supabase/migrations/<timestamp>_legacy_registration_introduction.sql`
- Test: `src/test/db/registrationIntroduction.dbtest.ts` (unchanged, must now pass)

**Interfaces:**

- Consumes: `app_private.find_command_receipt(uuid, text, uuid)`,
  `app_private.record_command_receipt(uuid, uuid, text, uuid, jsonb, text)`,
  `public.assert_target_session_write_authorized(public.sessions)`,
  `app_private.registration_entry_still_eligible(uuid)` (redefined here).
- Produces: `app_private.registration_introductions`,
  `app_private.registration_player_standing_alive(uuid, uuid) returns boolean`,
  `app_private.legacy_registration_source_fingerprint(uuid) returns text`,
  `public.inspect_registration_introduction(uuid)` returning
  `(introducible boolean, source_fingerprint text, confirmed_count integer, blockers text[],
  entries jsonb)`, and
  `public.introduce_registration_from_legacy_roster(uuid, uuid, uuid, integer, timestamptz)`
  returning `(window_id uuid, window_revision integer, confirmed_count integer)`.

- [ ] **Step 1: Choose the migration filename**

Run:

```bash
date -u +%Y%m%d%H%M%S
```

Use the printed value as `<timestamp>`. Verify it sorts after the newest existing migration:

```bash
ls supabase/migrations | tail -3
```

Expected: your new name would sort last, after `20260902141626_finalize_session_roster.sql`.

- [ ] **Step 2: Write the ledger table and its immutability trigger**

Create the migration file with this content first:

```sql
create table app_private.registration_introductions (
  registration_window_id uuid primary key
    references public.registration_windows(id) on delete restrict,
  session_id uuid not null unique references public.sessions(id) on delete restrict,
  source_kind text not null check (source_kind = 'LEGACY_SELECTED_ROSTER'),
  source_roster_revision_id uuid not null
    references public.roster_revisions(id) on delete restrict,
  source_fingerprint text not null check (pg_catalog.btrim(source_fingerprint) <> ''),
  confirmed_count integer not null check (confirmed_count > 0),
  capacity_at_introduction integer not null check (capacity_at_introduction > 0),
  initial_window_status text not null check (initial_window_status = 'DRAFT'),
  initial_window_revision integer not null check (initial_window_revision = 1),
  queue_chronology text not null check (queue_chronology = 'UNKNOWN'),
  command_id uuid not null unique,
  introduced_by_user_id uuid references auth.users(id) on delete set null,
  introduced_at timestamptz not null default pg_catalog.now(),
  constraint registration_introductions_capacity_fits_check
    check (capacity_at_introduction >= confirmed_count)
);

create index registration_introductions_actor_idx
  on app_private.registration_introductions (introduced_by_user_id);
create index registration_introductions_source_idx
  on app_private.registration_introductions (source_roster_revision_id);

-- The single-value checks above are deliberate. They record what XS-W4-06 decided, not merely the
-- value it happens to write: a later slice that wants a Window introduced already OPEN, or a queue
-- chronology that was actually proven, has to widen the constraint on purpose.
create function app_private.reject_registration_introduction_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- The narrow exception is the auth.users cascade: `on delete set null` arrives as an UPDATE at
  -- trigger depth greater than one and may only null the actor. Without it, deleting a user fails.
  if tg_op = 'UPDATE'
     and pg_catalog.pg_trigger_depth() > 1
     and new.introduced_by_user_id is null
     and old.introduced_by_user_id is not null
     and new.registration_window_id = old.registration_window_id
     and new.session_id = old.session_id
     and new.source_kind = old.source_kind
     and new.source_roster_revision_id = old.source_roster_revision_id
     and new.source_fingerprint = old.source_fingerprint
     and new.confirmed_count = old.confirmed_count
     and new.capacity_at_introduction = old.capacity_at_introduction
     and new.initial_window_status = old.initial_window_status
     and new.initial_window_revision = old.initial_window_revision
     and new.queue_chronology = old.queue_chronology
     and new.command_id = old.command_id
     and new.introduced_at = old.introduced_at then
    return new;
  end if;

  raise exception 'Registration introductions are immutable' using errcode = '55000';
end;
$$;

revoke all on function app_private.reject_registration_introduction_mutation()
  from public, anon, authenticated;

create trigger reject_registration_introduction_mutation_trigger
before update or delete on app_private.registration_introductions
for each row execute function app_private.reject_registration_introduction_mutation();
```

- [ ] **Step 3: Append the shared standing predicate and the W4-04 delegation**

```sql
create function app_private.registration_player_standing_alive(
  p_community_id uuid,
  p_player_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.community_players cp
      join public.players p
        on p.id = cp.player_id
       and p.deleted_at is null
       and p.active
     where cp.community_id = p_community_id
       and cp.player_id = p_player_id
       and cp.deleted_at is null
       and cp.active
  );
$$;

revoke all on function app_private.registration_player_standing_alive(uuid, uuid)
  from public, anon, authenticated;

-- Delegates the "standing alive" half to the predicate above so W4-06's pre-insert check and
-- W4-04's per-entry check cannot drift apart. The source-aware account-link branch is unchanged.
create or replace function app_private.registration_entry_still_eligible(p_entry_id uuid)
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
     where e.id = p_entry_id
       and app_private.registration_player_standing_alive(s.community_id, e.player_id)
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
```

- [ ] **Step 4: Append the fingerprint helper**

```sql
create function app_private.legacy_registration_source_fingerprint(p_roster_revision_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.md5(
    pg_catalog.jsonb_build_object(
      'roster_revision_id', r.id::text,
      'revision_number', r.revision_number,
      'entries', coalesce(
        (
          select pg_catalog.jsonb_agg(
                   pg_catalog.jsonb_build_object(
                     'entry_order', e.entry_order,
                     'player_id', e.player_id::text
                   )
                   order by e.entry_order
                 )
            from public.roster_revision_entries e
           where e.roster_revision_id = r.id
        ),
        '[]'::jsonb
      )
    )::text
  )
    from public.roster_revisions r
   where r.id = p_roster_revision_id;
$$;

revoke all on function app_private.legacy_registration_source_fingerprint(uuid)
  from public, anon, authenticated;
```

- [ ] **Step 5: Append the inspection command**

```sql
create function public.inspect_registration_introduction(p_session_id uuid)
returns table (
  introducible boolean,
  source_fingerprint text,
  confirmed_count integer,
  blockers text[],
  entries jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.sessions;
  v_revision public.roster_revisions;
  v_max_revision integer;
  v_blockers text[] := '{}'::text[];
  v_entries jsonb := '[]'::jsonb;
  v_fingerprint text;
  v_count integer := 0;
begin
  if p_session_id is null then
    raise exception 'Session id is required' using errcode = '23514';
  end if;

  select * into v_session from public.sessions s where s.id = p_session_id;
  if not found then
    raise exception 'Session not found' using errcode = 'P0002';
  end if;

  -- Authorization first, and identical to the write path: a caller who cannot introduce cannot use
  -- this command to read a roster either. A still-legacy Session has no organizer assignment, so it
  -- answers 42501 here rather than reaching any blocker.
  perform public.assert_target_session_write_authorized(v_session);

  if v_session.session_context is distinct from 'COMMUNITY' then
    v_blockers := pg_catalog.array_append(v_blockers, 'SESSION_NOT_COMMUNITY');
  end if;

  if v_session.lifecycle_status not in ('DRAFT', 'SCHEDULED') then
    v_blockers := pg_catalog.array_append(v_blockers, 'SESSION_NOT_UPCOMING');
  end if;

  if exists (
    select 1 from public.registration_windows w where w.session_id = p_session_id
  ) then
    v_blockers := pg_catalog.array_append(v_blockers, 'REGISTRATION_WINDOW_EXISTS');
  end if;

  select * into v_revision
    from public.roster_revisions r
   where r.session_id = p_session_id
     and r.source_kind = 'LEGACY_SELECTED_ROSTER';

  if not found then
    v_blockers := pg_catalog.array_append(v_blockers, 'LEGACY_ROSTER_MISSING');
  else
    select pg_catalog.max(r.revision_number) into v_max_revision
      from public.roster_revisions r
     where r.session_id = p_session_id;

    if v_max_revision > v_revision.revision_number then
      v_blockers := pg_catalog.array_append(v_blockers, 'LEGACY_ROSTER_SUPERSEDED');
    end if;

    select pg_catalog.count(*) into v_count
      from public.roster_revision_entries e
     where e.roster_revision_id = v_revision.id;

    if v_count = 0 then
      v_blockers := pg_catalog.array_append(v_blockers, 'LEGACY_ROSTER_EMPTY');
    end if;

    if exists (
      select 1
        from public.roster_revision_entries e
       where e.roster_revision_id = v_revision.id
         and (e.identity_kind <> 'PLAYER' or e.player_id is null)
    ) then
      v_blockers := pg_catalog.array_append(v_blockers, 'ROSTER_ENTRY_NOT_PLAYER');
    end if;

    v_fingerprint := app_private.legacy_registration_source_fingerprint(v_revision.id);

    select coalesce(
             pg_catalog.jsonb_agg(
               pg_catalog.jsonb_build_object(
                 'entry_order', e.entry_order,
                 'player_id', e.player_id,
                 'display_name_at_time', e.display_name_at_time,
                 'eligible', e.player_id is not null
                   and app_private.registration_player_standing_alive(
                     v_session.community_id,
                     e.player_id
                   )
               )
               order by e.entry_order
             ),
             '[]'::jsonb
           )
      into v_entries
      from public.roster_revision_entries e
     where e.roster_revision_id = v_revision.id;

    if exists (
      select 1
        from pg_catalog.jsonb_array_elements(v_entries) candidate
       where (candidate->>'eligible')::boolean is not true
    ) then
      v_blockers := pg_catalog.array_append(v_blockers, 'PLAYER_NOT_ELIGIBLE');
    end if;
  end if;

  return query
    select
      pg_catalog.cardinality(v_blockers) = 0,
      v_fingerprint,
      v_count,
      v_blockers,
      v_entries;
end;
$$;

revoke all on function public.inspect_registration_introduction(uuid)
  from public, anon, authenticated;
grant execute on function public.inspect_registration_introduction(uuid) to authenticated;
```

- [ ] **Step 6: Append the write command**

```sql
create function public.introduce_registration_from_legacy_roster(
  p_command_id uuid,
  p_window_id uuid,
  p_session_id uuid,
  p_capacity integer,
  p_closes_at timestamptz
)
returns table (
  window_id uuid,
  window_revision integer,
  confirmed_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.sessions;
  v_revision public.roster_revisions;
  v_max_revision integer;
  v_count integer;
  v_uid uuid;
  v_receipt jsonb;
  v_result jsonb;
  v_fingerprint text;
begin
  if p_command_id is null
     or p_window_id is null
     or p_session_id is null
     or p_capacity is null then
    raise exception 'command_id, window_id, session_id and capacity are required'
      using errcode = '23514';
  end if;

  -- Load-bearing despite the discarded result: find_command_receipt raises 23505 when this command
  -- id already belongs to another aggregate or command type, and that collision must surface before
  -- the row lock. The replay itself happens after authorization below, so a caller whose capability
  -- was revoked cannot read back an earlier result.
  v_receipt := app_private.find_command_receipt(
    p_command_id,
    'introduce_registration_from_legacy_roster',
    p_window_id
  );

  -- Session before Window, the global lock order. The Window does not exist yet; taking the Session
  -- first is what keeps this command consistent with every other command that locks both.
  select * into v_session
    from public.sessions s
   where s.id = p_session_id
   for update;

  if not found then
    raise exception 'Session not found' using errcode = 'P0002';
  end if;

  perform public.assert_target_session_write_authorized(v_session);
  v_uid := (select auth.uid());

  v_receipt := app_private.find_command_receipt(
    p_command_id,
    'introduce_registration_from_legacy_roster',
    p_window_id
  );
  if v_receipt is not null then
    return query
      select
        (v_receipt->>'window_id')::uuid,
        (v_receipt->>'window_revision')::integer,
        (v_receipt->>'confirmed_count')::integer;
    return;
  end if;

  -- Defense in depth: assert_target_session_write_authorized already excluded every legacy Session,
  -- because organizer assignments exist only for target Sessions and a target Session cannot return
  -- to legacy.
  if v_session.authority_model <> 'target' then
    raise exception 'Registration introduction blocked (SESSION_NOT_TARGET)' using errcode = '23514';
  end if;

  if v_session.session_context is distinct from 'COMMUNITY' then
    raise exception 'Registration introduction blocked (SESSION_NOT_COMMUNITY)'
      using errcode = '23514';
  end if;

  if v_session.lifecycle_status not in ('DRAFT', 'SCHEDULED') then
    raise exception 'Registration introduction blocked (SESSION_NOT_UPCOMING)'
      using errcode = '23514';
  end if;

  if exists (
    select 1 from public.registration_windows w where w.session_id = p_session_id
  ) then
    raise exception 'Registration introduction blocked (REGISTRATION_WINDOW_EXISTS)'
      using errcode = '23514';
  end if;

  if exists (select 1 from public.registration_windows w where w.id = p_window_id) then
    raise exception 'Registration Window id already exists' using errcode = '23514';
  end if;

  select * into v_revision
    from public.roster_revisions r
   where r.session_id = p_session_id
     and r.source_kind = 'LEGACY_SELECTED_ROSTER';

  if not found then
    raise exception 'Registration introduction blocked (LEGACY_ROSTER_MISSING)'
      using errcode = '23514';
  end if;

  select pg_catalog.max(r.revision_number) into v_max_revision
    from public.roster_revisions r
   where r.session_id = p_session_id;

  if v_max_revision > v_revision.revision_number then
    raise exception 'Registration introduction blocked (LEGACY_ROSTER_SUPERSEDED)'
      using errcode = '23514';
  end if;

  select pg_catalog.count(*) into v_count
    from public.roster_revision_entries e
   where e.roster_revision_id = v_revision.id;

  if v_count = 0 then
    raise exception 'Registration introduction blocked (LEGACY_ROSTER_EMPTY)'
      using errcode = '23514';
  end if;

  if exists (
    select 1
      from public.roster_revision_entries e
     where e.roster_revision_id = v_revision.id
       and (e.identity_kind <> 'PLAYER' or e.player_id is null)
  ) then
    raise exception 'Registration introduction blocked (ROSTER_ENTRY_NOT_PLAYER)'
      using errcode = '23514';
  end if;

  -- The message never enumerates people; inspect_registration_introduction is where the Organizer
  -- sees who.
  if exists (
    select 1
      from public.roster_revision_entries e
     where e.roster_revision_id = v_revision.id
       and not app_private.registration_player_standing_alive(v_session.community_id, e.player_id)
  ) then
    raise exception 'Registration introduction blocked (PLAYER_NOT_ELIGIBLE)'
      using errcode = '23514';
  end if;

  if p_capacity < v_count then
    raise exception 'Capacity is below the migrated confirmed roster' using errcode = '23514';
  end if;

  v_fingerprint := app_private.legacy_registration_source_fingerprint(v_revision.id);

  insert into public.registration_windows (
    id, session_id, status, capacity, closes_at, revision, next_queue_sequence, created_by_user_id
  ) values (
    p_window_id, p_session_id, 'DRAFT', p_capacity, p_closes_at, 1, 1, v_uid
  );

  -- One INSERT, one Window revision. allocate_registration_slot is deliberately not reused: it locks
  -- the Window and bumps `revision` per row, which would turn one logical command into N revisions.
  insert into public.registration_entries (
    id, registration_window_id, player_id, status, queue_sequence, source, created_by_user_id
  )
  select
    pg_catalog.gen_random_uuid(),
    p_window_id,
    e.player_id,
    'CONFIRMED',
    null,
    'MIGRATION',
    v_uid
  from public.roster_revision_entries e
  where e.roster_revision_id = v_revision.id
  order by e.entry_order;

  insert into app_private.registration_introductions (
    registration_window_id,
    session_id,
    source_kind,
    source_roster_revision_id,
    source_fingerprint,
    confirmed_count,
    capacity_at_introduction,
    initial_window_status,
    initial_window_revision,
    queue_chronology,
    command_id,
    introduced_by_user_id
  ) values (
    p_window_id,
    p_session_id,
    'LEGACY_SELECTED_ROSTER',
    v_revision.id,
    v_fingerprint,
    v_count,
    p_capacity,
    'DRAFT',
    1,
    'UNKNOWN',
    p_command_id,
    v_uid
  );

  v_result := pg_catalog.jsonb_build_object(
    'window_id', p_window_id,
    'window_revision', 1,
    'confirmed_count', v_count
  );
  perform app_private.record_command_receipt(
    p_command_id,
    v_uid,
    'introduce_registration_from_legacy_roster',
    p_window_id,
    v_result,
    'REGISTRATION_INTRODUCTION'
  );

  return query select p_window_id, 1, v_count;
end;
$$;

revoke all on function public.introduce_registration_from_legacy_roster(
  uuid, uuid, uuid, integer, timestamptz
) from public, anon, authenticated;
grant execute on function public.introduce_registration_from_legacy_roster(
  uuid, uuid, uuid, integer, timestamptz
) to authenticated;
```

- [ ] **Step 7: Run the suite and make it pass**

Run:

```bash
VOLLEY_TEST_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:55500/postgres' npx tsx --test src/test/db/registrationIntroduction.dbtest.ts
```

Expected: all seven tests from Task 1 pass. If the queue exit-gate test fails with the joiner
`CONFIRMED` instead of `WAITLISTED`, the introduced capacity is larger than the confirmed count in
that test — read the test, do not change the command.

- [ ] **Step 8: Prove the W4-04 refactor broke nothing**

Run:

```bash
VOLLEY_TEST_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:55500/postgres' npx tsx --test src/test/db/registrationLeave.dbtest.ts src/test/db/registrationFinalize.dbtest.ts
```

Expected: PASS, with no edits to either file. These two suites are the regression net for
`registration_entry_still_eligible`; if one fails, the delegation changed semantics and the fix
belongs in the new predicate, not in the tests.

- [ ] **Step 9: Commit**

```bash
git add supabase/migrations
git commit -m "feat: introduce target Registration from a legacy roster"
```

---

### Task 3: Pin security, idempotency, concurrency and the blocker vocabulary

**Files:**

- Modify: `src/test/db/registrationIntroduction.dbtest.ts`

**Interfaces:**

- Consumes: everything Task 1 and Task 2 produced.
- Produces: no new interface; this task only adds coverage.

- [ ] **Step 1: Write the authorization tests**

```ts
  test('a caller without a Session organizer assignment is refused by both commands', async () => {
    const organizerId = await newUser('w406-auth-organizer@example.com');
    const communityId = await targetCommunity(organizerId, 'W406 Auth');
    const player = await rosterOnlyPlayer(communityId, organizerId, 'Ana');
    const sessionId = await cutOverSession(organizerId, communityId, [player]);

    const outsider = await newUser('w406-auth-outsider@example.com');
    await activeMembership(communityId, outsider);

    await assert.rejects(inspectIntroduction(outsider, sessionId), (error: unknown) => {
      assertSqlState(error, '42501');
      return true;
    });
    await assert.rejects(
      introduce(outsider, { sessionId, capacity: 12 }),
      (error: unknown) => {
        assertSqlState(error, '42501');
        return true;
      },
    );
  });

  test('a still-legacy Session answers 42501, never a blocker list', async () => {
    const organizerId = await newUser('w406-legacy-organizer@example.com');
    const communityId = await targetCommunity(organizerId, 'W406 Legacy');
    await grantOrganizer(communityId, organizerId);
    const player = await rosterOnlyPlayer(communityId, organizerId, 'Ana');
    const sessionId = await legacyCommunitySession(organizerId, communityId, [player]);

    await assert.rejects(inspectIntroduction(organizerId, sessionId), (error: unknown) => {
      assertSqlState(error, '42501');
      return true;
    });
    await assert.rejects(
      introduce(organizerId, { sessionId, capacity: 12 }),
      (error: unknown) => {
        assertSqlState(error, '42501');
        return true;
      },
    );
  });
```

- [ ] **Step 2: Write the inspection blocker tests**

```ts
  test('inspection reports a window that already exists and names ineligible people', async () => {
    const organizerId = await newUser('w406-inspect-organizer@example.com');
    const communityId = await targetCommunity(organizerId, 'W406 Inspect');
    const healthy = await rosterOnlyPlayer(communityId, organizerId, 'Saudavel');
    const doomed = await rosterOnlyPlayer(communityId, organizerId, 'Inativa');
    const sessionId = await cutOverSession(organizerId, communityId, [healthy, doomed]);

    const clean = await inspectIntroduction(organizerId, sessionId);
    assert.equal(clean.rows[0].introducible, true);
    assert.deepEqual(clean.rows[0].blockers, []);
    assert.equal(clean.rows[0].confirmed_count, 2);
    assert.equal(clean.rows[0].entries.length, 2);
    assert.ok(clean.rows[0].entries.every((entry) => entry.eligible));

    await client.query('update public.community_players set active = false where player_id = $1', [
      doomed,
    ]);

    const blocked = await inspectIntroduction(organizerId, sessionId);
    assert.equal(blocked.rows[0].introducible, false);
    assert.deepEqual(blocked.rows[0].blockers, ['PLAYER_NOT_ELIGIBLE']);
    const ineligible = blocked.rows[0].entries.filter((entry) => !entry.eligible);
    assert.deepEqual(
      ineligible.map((entry) => entry.player_id),
      [doomed],
    );
  });

  test('inspection reports a missing legacy roster and an existing Window', async () => {
    const organizerId = await newUser('w406-blockers-organizer@example.com');
    const communityId = await targetCommunity(organizerId, 'W406 Blockers');
    await grantOrganizer(communityId, organizerId);

    const nativeSessionId = randomUUID();
    await call(
      organizerId,
      `select public.create_target_session($1, $2, 'COMMUNITY', 'FREE_PLAY', $3, null, null)`,
      [nativeSessionId, communityId, 'Nativa'],
    );

    const missing = await inspectIntroduction(organizerId, nativeSessionId);
    assert.equal(missing.rows[0].introducible, false);
    assert.deepEqual(missing.rows[0].blockers, ['LEGACY_ROSTER_MISSING']);
    assert.equal(missing.rows[0].source_fingerprint, null);

    const player = await rosterOnlyPlayer(communityId, organizerId, 'Ana');
    const cutOverId = await cutOverSession(organizerId, communityId, [player], 'Com janela');
    await introduce(organizerId, { sessionId: cutOverId, capacity: 12 });

    const taken = await inspectIntroduction(organizerId, cutOverId);
    assert.equal(taken.rows[0].introducible, false);
    assert.deepEqual(taken.rows[0].blockers, ['REGISTRATION_WINDOW_EXISTS']);
  });

  test('a QUICK Session and a Session past its window are blocked', async () => {
    const organizerId = await newUser('w406-context-organizer@example.com');
    const communityId = await targetCommunity(organizerId, 'W406 Context');
    await grantOrganizer(communityId, organizerId);

    const quickSessionId = randomUUID();
    await call(
      organizerId,
      `select public.create_target_session($1, null, 'QUICK', 'FREE_PLAY', $2, null, null)`,
      [quickSessionId, 'Avulsa'],
    );
    const quick = await inspectIntroduction(organizerId, quickSessionId);
    assert.ok(quick.rows[0].blockers.includes('SESSION_NOT_COMMUNITY'));
    await assert.rejects(
      introduce(organizerId, { sessionId: quickSessionId, capacity: 8 }),
      (error: unknown) => {
        assertSqlState(error, '23514');
        return true;
      },
    );

    const player = await rosterOnlyPlayer(communityId, organizerId, 'Ana');
    const pastSessionId = await cutOverSession(organizerId, communityId, [player], 'Encerrada');
    await client.query(`update public.sessions set lifecycle_status = 'FINISHED' where id = $1`, [
      pastSessionId,
    ]);

    const past = await inspectIntroduction(organizerId, pastSessionId);
    assert.ok(past.rows[0].blockers.includes('SESSION_NOT_UPCOMING'));
    await assert.rejects(
      introduce(organizerId, { sessionId: pastSessionId, capacity: 8 }),
      (error: unknown) => {
        assertSqlState(error, '23514');
        return true;
      },
    );
  });

  // The two blockers below cannot be produced by any supported command today: the cutover writes a
  // revision only when it resolved at least one PLAYER entry. They are defense in depth, so these
  // fixtures build the state directly and would go live the day the cutover learns to carry guests.
  test('an empty or non-player legacy revision is blocked', async () => {
    const organizerId = await newUser('w406-defense-organizer@example.com');
    const communityId = await targetCommunity(organizerId, 'W406 Defense');
    await grantOrganizer(communityId, organizerId);

    const emptySessionId = randomUUID();
    await call(
      organizerId,
      `select public.create_target_session($1, $2, 'COMMUNITY', 'FREE_PLAY', $3, null, null)`,
      [emptySessionId, communityId, 'Revisao vazia'],
    );
    await client.query(
      `insert into public.roster_revisions (
         id, session_id, revision_number, source_kind, source_session_revision,
         source_registration_revision, source_payload_hash, created_by_user_id
       ) values ($1, $2, 1, 'LEGACY_SELECTED_ROSTER', 1, null, null, null)`,
      [randomUUID(), emptySessionId],
    );

    const empty = await inspectIntroduction(organizerId, emptySessionId);
    assert.ok(empty.rows[0].blockers.includes('LEGACY_ROSTER_EMPTY'));
    await assert.rejects(
      introduce(organizerId, { sessionId: emptySessionId, capacity: 8 }),
      (error: unknown) => {
        assertSqlState(error, '23514');
        return true;
      },
    );

    const player = await rosterOnlyPlayer(communityId, organizerId, 'Ana');
    const guestSessionId = await cutOverSession(organizerId, communityId, [player], 'Com convidada');
    const { rows: revisions } = await client.query<{ id: string }>(
      `select id from public.roster_revisions
        where session_id = $1 and source_kind = 'LEGACY_SELECTED_ROSTER'`,
      [guestSessionId],
    );
    const participantId = randomUUID();
    await client.query(
      `insert into public.session_participants (
         id, session_id, identity_kind, player_id, source_kind, display_name, participation_status
       ) values ($1, $2, 'GUEST', null, 'LEGACY_SELECTED_ROSTER', 'Convidada', 'INCLUDED')`,
      [participantId, guestSessionId],
    );
    await client.query(
      `insert into public.roster_revision_entries (
         roster_revision_id, session_id, participant_id, entry_order,
         identity_kind, player_id, display_name_at_time
       ) values ($1, $2, $3, 99, 'GUEST', null, 'Convidada')`,
      [revisions[0].id, guestSessionId, participantId],
    );

    const guest = await inspectIntroduction(organizerId, guestSessionId);
    assert.ok(guest.rows[0].blockers.includes('ROSTER_ENTRY_NOT_PLAYER'));
    await assert.rejects(
      introduce(organizerId, { sessionId: guestSessionId, capacity: 8 }),
      (error: unknown) => {
        assertSqlState(error, '23514');
        return true;
      },
    );
  });

  test('a superseded legacy revision blocks both commands', async () => {
    const organizerId = await newUser('w406-superseded-organizer@example.com');
    const communityId = await targetCommunity(organizerId, 'W406 Superseded');
    const player = await rosterOnlyPlayer(communityId, organizerId, 'Ana');
    const sessionId = await cutOverSession(organizerId, communityId, [player]);

    await client.query(
      `insert into public.roster_revisions (
         id, session_id, revision_number, source_kind, source_session_revision,
         source_registration_revision, source_payload_hash, created_by_user_id
       ) values ($1, $2, 2, 'QUICK_DIRECT', 1, null, null, null)`,
      [randomUUID(), sessionId],
    );

    const inspection = await inspectIntroduction(organizerId, sessionId);
    assert.deepEqual(inspection.rows[0].blockers, ['LEGACY_ROSTER_SUPERSEDED']);
    await assert.rejects(
      introduce(organizerId, { sessionId, capacity: 12 }),
      (error: unknown) => {
        assertSqlState(error, '23514');
        return true;
      },
    );
  });
```

- [ ] **Step 3: Write the idempotency and duplicate-command tests**

```ts
  test('the same command id replays the stored receipt', async () => {
    const organizerId = await newUser('w406-replay-organizer@example.com');
    const communityId = await targetCommunity(organizerId, 'W406 Replay');
    const player = await rosterOnlyPlayer(communityId, organizerId, 'Ana');
    const sessionId = await cutOverSession(organizerId, communityId, [player]);

    const commandId = randomUUID();
    const windowId = randomUUID();
    const first = await introduce(organizerId, { commandId, windowId, sessionId, capacity: 8 });
    const second = await introduce(organizerId, { commandId, windowId, sessionId, capacity: 8 });

    assert.deepEqual(second.rows, first.rows);
    assert.equal((await ledgerOf(sessionId)).length, 1);
    assert.equal((await entriesOf(windowId)).length, 1);
  });

  test('a distinct command id on the same Session is refused', async () => {
    const organizerId = await newUser('w406-duplicate-organizer@example.com');
    const communityId = await targetCommunity(organizerId, 'W406 Duplicate');
    const player = await rosterOnlyPlayer(communityId, organizerId, 'Ana');
    const sessionId = await cutOverSession(organizerId, communityId, [player]);

    await introduce(organizerId, { sessionId, capacity: 8 });
    await assert.rejects(
      introduce(organizerId, { sessionId, capacity: 8 }),
      (error: unknown) => {
        assertSqlState(error, '23514');
        return true;
      },
    );
    assert.equal((await ledgerOf(sessionId)).length, 1);
  });
```

- [ ] **Step 4: Write the concurrency test**

```ts
  test('two concurrent introductions leave one winner and no partial state', async () => {
    const organizerId = await newUser('w406-race-organizer@example.com');
    const communityId = await targetCommunity(organizerId, 'W406 Race');
    const player = await rosterOnlyPlayer(communityId, organizerId, 'Ana');
    const sessionId = await cutOverSession(organizerId, communityId, [player]);

    const attempts = await Promise.allSettled([
      introduce(organizerId, { sessionId, capacity: 8 }),
      introduce(organizerId, { sessionId, capacity: 8 }),
    ]);

    const fulfilled = attempts.filter((attempt) => attempt.status === 'fulfilled');
    assert.equal(fulfilled.length, 1);
    assert.equal((await ledgerOf(sessionId)).length, 1);

    const { rows } = await client.query<{ count: string }>(
      'select count(*)::text as count from public.registration_windows where session_id = $1',
      [sessionId],
    );
    assert.deepEqual(rows, [{ count: '1' }]);
  });
```

- [ ] **Step 5: Write the ledger immutability tests**

```ts
  test('the ledger is immutable but tolerates the auth.users cascade', async () => {
    const organizerId = await newUser('w406-ledger-organizer@example.com');
    const communityId = await targetCommunity(organizerId, 'W406 Ledger');
    const player = await rosterOnlyPlayer(communityId, organizerId, 'Ana');
    const sessionId = await cutOverSession(organizerId, communityId, [player]);
    await introduce(organizerId, { sessionId, capacity: 8 });

    await assert.rejects(
      client.query(
        'update app_private.registration_introductions set capacity_at_introduction = 99 where session_id = $1',
        [sessionId],
      ),
      (error: unknown) => {
        assertSqlState(error, '55000');
        return true;
      },
    );
    await assert.rejects(
      client.query('delete from app_private.registration_introductions where session_id = $1', [
        sessionId,
      ]),
      (error: unknown) => {
        assertSqlState(error, '55000');
        return true;
      },
    );

    await client.query('delete from auth.users where id = $1', [organizerId]);
    const ledger = await ledgerOf(sessionId);
    assert.equal(ledger.length, 1);
    assert.equal(ledger[0].introduced_by_user_id, null);
    assert.equal(ledger[0].capacity_at_introduction, 8);
  });
```

- [ ] **Step 6: Write the migrated-source asymmetry test**

```ts
  test('a migrated player with no account link stays eligible and promotable', async () => {
    const organizerId = await newUser('w406-asymmetry-organizer@example.com');
    const communityId = await targetCommunity(organizerId, 'W406 Asymmetry');
    const accountless = await rosterOnlyPlayer(communityId, organizerId, 'Sem conta');
    const sessionId = await cutOverSession(organizerId, communityId, [accountless]);

    const windowId = randomUUID();
    await introduce(organizerId, { windowId, sessionId, capacity: 1 });
    await call(organizerId, 'select * from public.open_registration($1, $2, $3)', [
      randomUUID(),
      windowId,
      1,
    ]);

    const { rows: entryRows } = await client.query<{ id: string }>(
      `select id from public.registration_entries
        where registration_window_id = $1 and player_id = $2`,
      [windowId, accountless],
    );
    const { rows: eligibility } = await client.query<{ eligible: boolean }>(
      'select app_private.registration_entry_still_eligible($1) as eligible',
      [entryRows[0].id],
    );
    assert.deepEqual(eligibility, [{ eligible: true }]);
  });
```

- [ ] **Step 7: Write the inherited exit-gate test**

```ts
  test('no browser path mutates the migrated roster or reads the private surfaces', async () => {
    const organizerId = await newUser('w406-gate-organizer@example.com');
    const communityId = await targetCommunity(organizerId, 'W406 Gate');
    const player = await rosterOnlyPlayer(communityId, organizerId, 'Ana');
    const sessionId = await cutOverSession(organizerId, communityId, [player]);
    const windowId = randomUUID();
    await introduce(organizerId, { windowId, sessionId, capacity: 8 });

    const update = await call(
      organizerId,
      `update public.sessions set selected_player_ids = '{}'::text[] where id = $1`,
      [sessionId],
    );
    assert.equal(update.rowCount, 0);

    await assert.rejects(
      call(organizerId, 'select count(*) from public.registration_entries'),
      (error: unknown) => {
        assertSqlState(error, '42501');
        return true;
      },
    );
    await assert.rejects(
      call(organizerId, 'select count(*) from app_private.registration_introductions'),
      (error: unknown) => {
        assertSqlState(error, '42501');
        return true;
      },
    );

    const { rows: privileges } = await client.query<{ count: string }>(
      `select count(*)::text as count
         from information_schema.role_table_grants
        where table_schema = 'app_private'
          and table_name = 'registration_introductions'`,
    );
    assert.deepEqual(privileges, [{ count: '0' }]);
  });
```

- [ ] **Step 8: Run the suite**

Run:

```bash
VOLLEY_TEST_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:55500/postgres' npx tsx --test src/test/db/registrationIntroduction.dbtest.ts
```

Expected: some of the new tests fail. Record which ones and why — Task 4 fixes exactly those.
Tests from Task 1 must still pass; if one of them broke, a new test is mutating shared fixture state
and the new test is wrong.

- [ ] **Step 9: Commit the tests, failing**

```bash
git add src/test/db/registrationIntroduction.dbtest.ts
git commit -m "test: pin introduction security, idempotency and concurrency"
```

---

### Task 4: Harden the command against the pinned failures

**Files:**

- Modify: `supabase/migrations/<timestamp>_legacy_registration_introduction.sql`
- Test: `src/test/db/registrationIntroduction.dbtest.ts` (unchanged)

**Interfaces:**

- Consumes and produces exactly what Task 2 defined. This task changes behavior, not signatures.

- [ ] **Step 1: Fix each failure recorded in Task 3, Step 8**

Work one failure at a time, in this order, re-running the suite after each. Likely findings and
their correct fixes:

- **The concurrency test sees two winners or a deadlock.** The `for update` on `sessions` is what
  serializes the pair. Verify the lock is taken before any read of `registration_windows`; do not add
  an advisory lock, and do not move the existence check above the lock.
- **The exit-gate test finds a grant on `registration_introductions`.** Some environments grant on
  schema creation; add explicit `revoke all on table app_private.registration_introductions from
  public, anon, authenticated;` right after the `create table`.
- **The `auth.users` cascade test raises `55000`.** The carve-out list in the trigger must name every
  column the table has. Compare it against the `create table` column by column.
- **The superseded test passes the inspection but not the command, or vice versa.** The two must read
  the same `max(revision_number)`; a mismatch means one of them filtered by `source_kind` while
  computing the maximum.

Do not weaken a test to make it pass. If a test looks wrong, stop and say so in the task report.

- [ ] **Step 2: Re-run the full slice suite**

Run:

```bash
VOLLEY_TEST_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:55500/postgres' npx tsx --test src/test/db/registrationIntroduction.dbtest.ts
```

Expected: PASS, every test.

- [ ] **Step 3: Re-run the neighboring Registration suites**

Run:

```bash
VOLLEY_TEST_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:55500/postgres' npx tsx --test src/test/db/registrationSchema.dbtest.ts src/test/db/registrationLifecycle.dbtest.ts src/test/db/registrationJoin.dbtest.ts src/test/db/registrationLeave.dbtest.ts src/test/db/registrationFinalize.dbtest.ts src/test/db/sessionCohortCutover.dbtest.ts
```

Expected: PASS, with no edits to any of those files.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations
git commit -m "fix: harden legacy Registration introduction"
```

---

### Task 5: Verify the whole slice and record it

**Files:**

- Modify: `README.md`
- Modify: `HANDOFF.md`

**Interfaces:**

- Consumes: the finished migration and suite.
- Produces: the branch's verification evidence and the next slice's starting point.

- [ ] **Step 1: Run the full verification order**

Run each and record the exact numbers:

```bash
npm run typecheck
```

```bash
npm test
```

```bash
VOLLEY_TEST_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:55500/postgres' npm run test:db
```

```bash
npm run build
```

Expected: all pass. `npm run test:db` rebuilds the schema from the full migration chain, so it is
also the proof that the new migration applies in order on a clean database.

- [ ] **Step 2: Run the focused lint and format checks**

Run:

```bash
npx eslint src/test/db/registrationIntroduction.dbtest.ts
```

```bash
npx prettier --check src/test/db/registrationIntroduction.dbtest.ts README.md HANDOFF.md
```

Expected: zero errors. Repository-wide `lint:eslint` and `format:check` still fail on preexisting
paths; prove this branch is clean instead:

```bash
git diff main...HEAD --name-only
```

Expected: only the migration, the new suite, the spec, this plan, `README.md` and `HANDOFF.md`.

- [ ] **Step 3: Check for whitespace damage**

Run:

```bash
git diff --check
```

Expected: no output.

- [ ] **Step 4: Add the migration to the README list**

Find the migration list in `README.md` and append one line for the new file, matching the existing
format and keeping chronological order. The entry reads:

```text
`<timestamp>_legacy_registration_introduction.sql` — introduces target Registration into a Session
cut over from the legacy model: private provenance ledger, shared standing predicate, inspection and
the introduction command.
```

- [ ] **Step 5: Update HANDOFF.md**

Make these edits:

1. The header date becomes the day you finish, and the sentence says the slice closed is `XS-W4-06`.
2. In the slice table, `XS-W4-06` becomes `concluída`, and add a row for the next frontier,
   `XS-W5-01 | Versioned PlayerEvaluation source model | próxima`.
3. The branch section names `exec/c6-w4-06-legacy-registration-introduction` as the current HEAD,
   chained onto `exec/c6-w4-05-finalize-session-roster`.
4. Add a section "O que a W4-06 entregou" covering: the cutover roster revision as the only source;
   the Window born `DRAFT` with one revision; migrated entries holding no queue position so the first
   genuine join takes sequence 1; explicit capacity that refuses to shrink the roster; one ineligible
   member refusing the whole introduction; the immutable ledger; and the deliberate absence of a
   fingerprint token, with the proof that the source cannot change between inspection and transition.
5. Add "Evidência de verificação da W4-06" with the exact counts from Step 1 and the focused lint and
   format results from Step 2.
6. Add the warnings the next slice needs: that `registration_entry_still_eligible` now delegates to
   `registration_player_standing_alive`, so a change to standing rules has exactly one home; and that
   `LEGACY_ROSTER_EMPTY` and `ROSTER_ENTRY_NOT_PLAYER` are unreachable through the cutover today and
   exist as defense in depth, so a future slice that teaches the cutover to carry guests will make
   them live.

- [ ] **Step 6: Commit**

```bash
git add README.md HANDOFF.md
git commit -m "docs: record XS-W4-06 completion"
```

- [ ] **Step 7: Report the branch state**

State the branch name, the commit list, and the verification numbers. Do not merge into `main`: every
C6 slice so far waited for an explicit decision, and the consolidation that already happened was the
user's call, not the executor's.
