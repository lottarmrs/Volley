# XS-W5-01 Versioned PlayerEvaluation Source Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an explicitly authorized evaluator record a scoped, versioned evaluation of a Player
inside one Community, superseding their own previous one without destroying it.

**Architecture:** One additive SQL migration. It widens the Community responsibility vocabulary with
`EVALUATOR` and derives the `player.evaluate` capability from it, adds an append-only contribution
table whose effective row is enforced by a partial unique index, adds a normalized dimension-score
table, and adds one `SECURITY DEFINER` command that supersedes and inserts in a single transaction.

**Tech Stack:** PostgreSQL 15 (Supabase), plpgsql `SECURITY DEFINER` commands, `node:test` + `pg`
database suites run by `npm run test:db`.

**Spec:** `docs/superpowers/specs/2026-09-05-xs-w5-01-versioned-player-evaluation-design.md`

## Global Constraints

- Node >= 20 (22 recommended, `.nvmrc`). Run `nvm use` if anything errors.
- Every new function is `security definer`, `set search_path = ''`, with every reference
  schema-qualified (`public.`, `app_private.`, `pg_catalog.`, `auth.`).
- Public commands: `revoke all ... from public, anon, authenticated;` then
  `grant execute ... to authenticated;`.
- `player_evaluation_contributions` and `player_evaluation_dimension_scores` receive **no** table
  grant of any kind, have RLS enabled and carry no policy.
- Error codes: `23514` validation, `23505` command id collision only, `P0002` row absent, `42501`
  authorization. This command never raises `40001`.
- The evaluator is resolved from `auth.uid()`. There is no evaluator parameter, in any function.
- `public.player_evaluations`, `public.self_evaluations` and their policies are not touched.
- `npm run test:db` requires a real PostgreSQL and never mocks one (QA-INV-003/004):
  `VOLLEY_TEST_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:55500/postgres'`, served by the
  running container `volley_test_pg2`. Preserve the container; never stop or rebuild it.
- Any `npx tsx --test` invocation naming more than one file must pass `--test-concurrency=1`: each
  suite rebuilds the `public` schema, so parallel files race and fail with `42P06`
  (`scripts/db-harness.mjs:68-74`).
- Migration filenames sort chronologically; the new file must sort after
  `20260904204951_session_organizer_assignment_cascade.sql`.
- The last definition of a function in the migration chain is the effective one.
- Repository-wide `npm run lint:eslint` and `npm run format:check` fail on preexisting paths that are
  not this branch's. Prove the branch with focused `npx eslint` and `npx prettier --check` on changed
  files. Never run `prettier --write` across the repository. `supabase/migrations/` and `docs/` are
  Prettier-ignored.
- No comments in TypeScript source unless the code would be misread without them. SQL comments that
  record load-bearing reasoning are kept verbatim where this plan supplies them.

## File Structure

- Create `supabase/migrations/<timestamp>_versioned_player_evaluation_source.sql` — the whole slice:
  the responsibility vocabulary widening, the `community_capabilities` redefinition, both tables, and
  the command. One file, because a partially applied slice would leave a command whose capability
  nothing can grant.
- Create `src/test/db/playerEvaluationContributions.dbtest.ts` — the database suite, owning its own
  fixtures.
- Modify `README.md` — the migration list.
- Modify `HANDOFF.md` — slice table, what W5-01 delivered, verification evidence, warnings.

Nothing under `src/application/`, `src/infra/`, `src/hooks/` or `src/components/` changes. This slice
has no client surface.

---

### Task 1: Pin the capability grant and the schema invariants with failing tests

**Files:**

- Test: `src/test/db/playerEvaluationContributions.dbtest.ts` (create)

**Interfaces:**

- Consumes: harness `connect`, `createPool`, `rebuildFromMigrations`, `asIdentityCommitting`,
  `isTestDatabaseConfigured`, `TEST_DATABASE_URL_VAR` from `src/test/db/harness`; existing
  `public.create_community_with_owner(text)`,
  `public.current_user_has_community_capability(uuid, text)`.
- Produces: the fixture helpers `newUser`, `targetCommunity`, `activeMembership`,
  `grantResponsibility`, `createPlayer`, `addCommunityPlayer`, `call`, `assertSqlState`, reused by
  Task 3.

- [ ] **Step 1: Create the suite skeleton and fixtures**

Create `src/test/db/playerEvaluationContributions.dbtest.ts`:

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

interface EvaluationRow extends QueryResultRow {
  contribution_id: string;
  superseded_contribution_id: string | null;
  dimension_count: number;
}

interface ContributionRow extends QueryResultRow {
  id: string;
  community_id: string;
  player_id: string;
  evaluator_user_id: string;
  rubric_version: string;
  superseded_at: string | null;
  superseded_by_id: string | null;
}

interface ScoreRow extends QueryResultRow {
  dimension_key: string;
  value: string;
}

if (!isTestDatabaseConfigured()) {
  test(`player evaluation contributions require ${TEST_DATABASE_URL_VAR}`, () => {
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

  async function activeMembership(
    communityId: string,
    userId: string,
    role = 'member',
  ): Promise<void> {
    await client.query(
      `insert into public.community_memberships (community_id, user_id, role, status)
       values ($1, $2, $3, 'active')
       on conflict (community_id, user_id) do update set role = excluded.role, status = 'active'`,
      [communityId, userId, role],
    );
  }

  async function grantResponsibility(
    communityId: string,
    userId: string,
    responsibility: string,
  ): Promise<void> {
    await client.query(
      `insert into public.community_responsibilities (community_id, user_id, responsibility)
       values ($1, $2, $3)
       on conflict (community_id, user_id, responsibility) do update set revoked_at = null`,
      [communityId, userId, responsibility],
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

  async function hasCapability(
    actorId: string,
    communityId: string,
    capability: string,
  ): Promise<boolean> {
    const { rows } = await call<{ granted: boolean }>(
      actorId,
      'select public.current_user_has_community_capability($1, $2) as granted',
      [communityId, capability],
    );
    return rows[0].granted;
  }
}
```

- [ ] **Step 2: Write the capability test**

Insert inside the `else` block, after the helpers:

```ts
  test('an EVALUATOR responsibility grants player.evaluate and a governance rank does not', async () => {
    const ownerId = await newUser('w501-cap-owner@example.com');
    const communityId = await targetCommunity(ownerId, 'W501 Capability');

    const adminId = await newUser('w501-cap-admin@example.com');
    await activeMembership(communityId, adminId, 'admin');

    const evaluatorId = await newUser('w501-cap-evaluator@example.com');
    await activeMembership(communityId, evaluatorId);
    await grantResponsibility(communityId, evaluatorId, 'EVALUATOR');

    assert.equal(
      await hasCapability(evaluatorId, communityId, 'player.evaluate'),
      true,
      'an explicit EVALUATOR responsibility grants it',
    );
    assert.equal(
      await hasCapability(adminId, communityId, 'player.evaluate'),
      false,
      'GINV-CAP-002: an admin rank never confers it',
    );
    assert.equal(
      await hasCapability(ownerId, communityId, 'player.evaluate'),
      false,
      'GINV-CAP-002: an owner rank never confers it',
    );

    await client.query(
      'update public.community_responsibilities set revoked_at = now() where user_id = $1',
      [evaluatorId],
    );
    assert.equal(
      await hasCapability(evaluatorId, communityId, 'player.evaluate'),
      false,
      'a revoked responsibility grants nothing',
    );
  });

  test('adding player.evaluate leaves every other capability derivation alone', async () => {
    const ownerId = await newUser('w501-cap-intact-owner@example.com');
    const communityId = await targetCommunity(ownerId, 'W501 Capability Intact');
    const organizerId = await newUser('w501-cap-intact-organizer@example.com');
    await activeMembership(communityId, organizerId);
    await grantResponsibility(communityId, organizerId, 'ORGANIZER');

    assert.equal(await hasCapability(organizerId, communityId, 'session.manage'), true);
    assert.equal(await hasCapability(organizerId, communityId, 'player.evaluate'), false);
    assert.equal(await hasCapability(ownerId, communityId, 'community.members.manage'), true);
    assert.equal(await hasCapability(ownerId, communityId, 'session.manage'), false);
  });
```

- [ ] **Step 3: Write the schema invariant tests**

```ts
  test('only one effective contribution exists per Community, Player and evaluator', async () => {
    const ownerId = await newUser('w501-index-owner@example.com');
    const communityId = await targetCommunity(ownerId, 'W501 Index');
    const evaluatorId = await newUser('w501-index-evaluator@example.com');
    const playerId = await createPlayer(ownerId, { name: 'Alvo' });

    const first = randomUUID();
    await client.query(
      `insert into public.player_evaluation_contributions (
         id, community_id, player_id, evaluator_user_id, rubric_version, command_id
       ) values ($1, $2, $3, $4, 'v0', $5)`,
      [first, communityId, playerId, evaluatorId, randomUUID()],
    );

    const second = await client
      .query(
        `insert into public.player_evaluation_contributions (
           id, community_id, player_id, evaluator_user_id, rubric_version, command_id
         ) values ($1, $2, $3, $4, 'v0', $5)`,
        [randomUUID(), communityId, playerId, evaluatorId, randomUUID()],
      )
      .catch((error: Error) => error);
    assertSqlState(second, '23505');

    await client.query(
      `update public.player_evaluation_contributions
          set superseded_at = now(), superseded_by_id = $2
        where id = $1`,
      [first, first],
    );
    await client.query(
      `insert into public.player_evaluation_contributions (
         id, community_id, player_id, evaluator_user_id, rubric_version, command_id
       ) values ($1, $2, $3, $4, 'v0', $5)`,
      [randomUUID(), communityId, playerId, evaluatorId, randomUUID()],
    );
  });

  test('a dimension score is bounded and a contribution keys it once', async () => {
    const ownerId = await newUser('w501-score-owner@example.com');
    const communityId = await targetCommunity(ownerId, 'W501 Scores');
    const evaluatorId = await newUser('w501-score-evaluator@example.com');
    const playerId = await createPlayer(ownerId, { name: 'Alvo' });
    const contributionId = randomUUID();
    await client.query(
      `insert into public.player_evaluation_contributions (
         id, community_id, player_id, evaluator_user_id, rubric_version, command_id
       ) values ($1, $2, $3, $4, 'v0', $5)`,
      [contributionId, communityId, playerId, evaluatorId, randomUUID()],
    );

    await client.query(
      `insert into public.player_evaluation_dimension_scores (contribution_id, dimension_key, value)
       values ($1, 'saque', 7)`,
      [contributionId],
    );

    const duplicate = await client
      .query(
        `insert into public.player_evaluation_dimension_scores (contribution_id, dimension_key, value)
         values ($1, 'saque', 8)`,
        [contributionId],
      )
      .catch((error: Error) => error);
    assertSqlState(duplicate, '23505');

    const tooHigh = await client
      .query(
        `insert into public.player_evaluation_dimension_scores (contribution_id, dimension_key, value)
         values ($1, 'ataque', 11)`,
        [contributionId],
      )
      .catch((error: Error) => error);
    assertSqlState(tooHigh, '23514');
  });

  test('neither evaluation table is reachable by a browser role', async () => {
    const actorId = await newUser('w501-grants-actor@example.com');

    for (const table of [
      'public.player_evaluation_contributions',
      'public.player_evaluation_dimension_scores',
    ]) {
      const attempt = await call(actorId, `select count(*) from ${table}`).catch(
        (error: Error) => error,
      );
      assertSqlState(attempt, '42501');
    }

    const { rows } = await client.query<{ count: string }>(
      `select count(*)::text as count
         from information_schema.role_table_grants
        where table_schema = 'public'
          and table_name in (
            'player_evaluation_contributions', 'player_evaluation_dimension_scores'
          )
          and grantee in ('anon', 'authenticated', 'public')`,
    );
    assert.deepEqual(rows, [{ count: '0' }]);
  });
```

- [ ] **Step 4: Run the suite and verify every test fails for the right reason**

Run:

```bash
VOLLEY_TEST_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:55500/postgres' npx tsx --test src/test/db/playerEvaluationContributions.dbtest.ts
```

Expected: the two capability tests fail because inserting `'EVALUATOR'` violates
`community_responsibilities_responsibility_check` (SQL state `23514`), and the three schema tests
fail with `42P01` (`relation "public.player_evaluation_contributions" does not exist`). Any other
code means a fixture is wrong — fix the fixture, not the expectation.

- [ ] **Step 5: Commit**

```bash
git add src/test/db/playerEvaluationContributions.dbtest.ts
git commit -m "test: pin the player evaluation capability and schema invariants"
```

---

### Task 2: Add the capability source and the contribution schema

**Files:**

- Create: `supabase/migrations/<timestamp>_versioned_player_evaluation_source.sql`
- Test: `src/test/db/playerEvaluationContributions.dbtest.ts` (unchanged, must now pass)

**Interfaces:**

- Consumes: `public.community_responsibilities`, `public.community_capabilities(uuid, uuid)`.
- Produces: the `EVALUATOR` responsibility value, the `player.evaluate` capability,
  `public.player_evaluation_contributions`, `public.player_evaluation_dimension_scores`.

- [ ] **Step 1: Choose the migration filename**

Run:

```bash
date -u +%Y%m%d%H%M%S
```

Use the printed value as `<timestamp>`, then confirm it sorts last:

```bash
ls supabase/migrations | tail -3
```

Expected: your new name would sort after
`20260904204951_session_organizer_assignment_cascade.sql`.

- [ ] **Step 2: Widen the responsibility vocabulary**

Create the migration file with this content first:

```sql
-- XS-W5-01 — Versioned PlayerEvaluation source model.
--
-- GINV-CAP-002: a Community governance rank never confers the right to evaluate a Player. The
-- capability has to come from an explicit, per-person operational grant, which is why
-- public.community_capabilities has carried a comment saying player.evaluate is deliberately
-- absent. This slice supplies the source that comment anticipated.

alter table public.community_responsibilities
  drop constraint community_responsibilities_responsibility_check;

alter table public.community_responsibilities
  add constraint community_responsibilities_responsibility_check
    check (responsibility in ('ORGANIZER', 'EVALUATOR'));
```

- [ ] **Step 3: Append the capability derivation**

```sql
create or replace function public.community_capabilities(
  target_community_id uuid,
  target_user_id uuid
)
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  -- Governance rank grants governance capabilities only.
  select c.capability
    from public.community_memberships m
    cross join lateral (
      select unnest(
        case m.role
          when 'owner' then array['community.members.manage', 'community.ownership.transfer']
          when 'admin' then array['community.members.manage']
          else array[]::text[]
        end
      ) as capability
    ) c
   where m.community_id = target_community_id
     and m.user_id = target_user_id
     and m.status = 'active'

  union

  -- Operational responsibility grants operational capabilities only.
  select 'session.manage'
    from public.community_responsibilities r
   where r.community_id = target_community_id
     and r.user_id = target_user_id
     and r.responsibility = 'ORGANIZER'
     and r.revoked_at is null

  union

  -- player.evaluate is an operational duty on the same footing: granted per person by an
  -- EVALUATOR responsibility, never derived from owner or admin rank (GINV-CAP-002).
  select 'player.evaluate'
    from public.community_responsibilities r
   where r.community_id = target_community_id
     and r.user_id = target_user_id
     and r.responsibility = 'EVALUATOR'
     and r.revoked_at is null;

  -- Deliberately absent, and each absence is asserted by the negative matrix:
  --   match.control      per-Match control is leased at Match time (GINV-MATCH-004),
  --                      never derived from a Community rank -- W7 owns it
  --   competition.admin  W8 owns it; an ORGANIZER is not a CompetitionAdmin
$$;
```

- [ ] **Step 4: Append the two tables**

```sql
create table public.player_evaluation_contributions (
  id uuid primary key,
  community_id uuid not null references public.communities(id) on delete restrict,
  player_id uuid not null references public.players(id) on delete restrict,
  evaluator_user_id uuid not null references auth.users(id) on delete restrict,
  rubric_version text not null,
  recorded_at timestamptz not null default pg_catalog.now(),
  superseded_at timestamptz,
  superseded_by_id uuid references public.player_evaluation_contributions(id) on delete restrict,
  command_id uuid not null unique,
  constraint player_evaluation_contributions_rubric_version_check
    check (pg_catalog.btrim(rubric_version) <> ''),
  constraint player_evaluation_contributions_supersession_check
    check ((superseded_at is null) = (superseded_by_id is null))
);

-- The invariant the slice exists for: one effective contribution per evaluator, Player and
-- Community. A constraint, not a convention -- the command is not the only thing that must
-- fail if a second effective row is attempted.
create unique index player_evaluation_contributions_effective_key
  on public.player_evaluation_contributions (community_id, player_id, evaluator_user_id)
  where superseded_at is null;

create index player_evaluation_contributions_player_idx
  on public.player_evaluation_contributions (player_id);
create index player_evaluation_contributions_evaluator_idx
  on public.player_evaluation_contributions (evaluator_user_id);

create table public.player_evaluation_dimension_scores (
  contribution_id uuid not null
    references public.player_evaluation_contributions(id) on delete restrict,
  dimension_key text not null,
  value numeric not null,
  constraint player_evaluation_dimension_scores_pkey primary key (contribution_id, dimension_key),
  constraint player_evaluation_dimension_scores_key_check
    check (pg_catalog.btrim(dimension_key) <> ''),
  constraint player_evaluation_dimension_scores_value_range_check
    check (value >= 0 and value <= 10)
);

revoke all on table public.player_evaluation_contributions from public, anon, authenticated;
alter table public.player_evaluation_contributions enable row level security;

revoke all on table public.player_evaluation_dimension_scores from public, anon, authenticated;
alter table public.player_evaluation_dimension_scores enable row level security;
```

No policy is created for either table. The only writer is the `SECURITY DEFINER` command added in
Task 4, which runs as the owner and is not subject to RLS.

- [ ] **Step 5: Run the suite**

Run:

```bash
VOLLEY_TEST_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:55500/postgres' npx tsx --test src/test/db/playerEvaluationContributions.dbtest.ts
```

Expected: all five tests from Task 1 pass.

- [ ] **Step 6: Prove the governance change broke nothing**

Run:

```bash
VOLLEY_TEST_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:55500/postgres' npx tsx --test --test-concurrency=1 src/test/db/governanceCapabilities.dbtest.ts src/test/db/communityBolaMatrix.dbtest.ts src/test/db/sessionOrganizerAssignments.dbtest.ts
```

Expected: PASS, with no edits to any of those files. They are the regression net for
`community_capabilities`; if one fails, the new `union` branch changed an existing derivation and the
fix belongs in the migration, never in those suites.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations
git commit -m "feat: add the EVALUATOR responsibility and the evaluation source schema"
```

---

### Task 3: Pin the command contract with failing tests

**Files:**

- Modify: `src/test/db/playerEvaluationContributions.dbtest.ts`

**Interfaces:**

- Consumes: every helper from Task 1, and the tables from Task 2.
- Produces: the `recordEvaluation`, `contributionsOf` and `scoresOf` helpers.

- [ ] **Step 1: Add the command helpers**

Add inside the `else` block, after `hasCapability`:

```ts
  async function recordEvaluation(
    actorId: string | null,
    input: {
      commandId?: string;
      contributionId?: string;
      communityId: string;
      playerId: string;
      rubricVersion?: string;
      dimensions: Record<string, number | string | null>;
    },
  ) {
    return call<EvaluationRow>(
      actorId,
      `select * from public.record_player_evaluation($1, $2, $3, $4, $5, $6::jsonb)`,
      [
        input.commandId ?? randomUUID(),
        input.contributionId ?? randomUUID(),
        input.communityId,
        input.playerId,
        input.rubricVersion ?? 'v0-legacy-11',
        JSON.stringify(input.dimensions),
      ],
    );
  }

  async function contributionsOf(communityId: string, playerId: string) {
    const { rows } = await client.query<ContributionRow>(
      `select id, community_id, player_id, evaluator_user_id, rubric_version,
              superseded_at::text as superseded_at, superseded_by_id
         from public.player_evaluation_contributions
        where community_id = $1 and player_id = $2
        order by recorded_at, id`,
      [communityId, playerId],
    );
    return rows;
  }

  async function scoresOf(contributionId: string) {
    const { rows } = await client.query<ScoreRow>(
      `select dimension_key, value::text as value
         from public.player_evaluation_dimension_scores
        where contribution_id = $1
        order by dimension_key`,
      [contributionId],
    );
    return rows;
  }

  async function evaluatorIn(communityId: string, email: string): Promise<string> {
    const userId = await newUser(email);
    await activeMembership(communityId, userId);
    await grantResponsibility(communityId, userId, 'EVALUATOR');
    return userId;
  }

  async function evaluablePlayer(
    communityId: string,
    ownerId: string,
    name: string,
  ): Promise<string> {
    const playerId = await createPlayer(ownerId, { name });
    await addCommunityPlayer(communityId, playerId, ownerId);
    return playerId;
  }
```

- [ ] **Step 2: Write the happy path and supersession tests**

```ts
  test('recording an evaluation stores the contribution and its dimension rows', async () => {
    const ownerId = await newUser('w501-happy-owner@example.com');
    const communityId = await targetCommunity(ownerId, 'W501 Happy');
    const evaluatorId = await evaluatorIn(communityId, 'w501-happy-eval@example.com');
    const playerId = await evaluablePlayer(communityId, ownerId, 'Alvo');

    const contributionId = randomUUID();
    const result = await recordEvaluation(evaluatorId, {
      contributionId,
      communityId,
      playerId,
      dimensions: { saque: 7, ataque: 8.5 },
    });

    assert.deepEqual(result.rows, [
      { contribution_id: contributionId, superseded_contribution_id: null, dimension_count: 2 },
    ]);

    const contributions = await contributionsOf(communityId, playerId);
    assert.equal(contributions.length, 1);
    assert.equal(contributions[0].evaluator_user_id, evaluatorId);
    assert.equal(contributions[0].rubric_version, 'v0-legacy-11');
    assert.equal(contributions[0].superseded_at, null);
    assert.equal(contributions[0].superseded_by_id, null);

    assert.deepEqual(await scoresOf(contributionId), [
      { dimension_key: 'ataque', value: '8.5' },
      { dimension_key: 'saque', value: '7' },
    ]);
  });

  test('re-evaluating supersedes the previous contribution and keeps it readable', async () => {
    const ownerId = await newUser('w501-supersede-owner@example.com');
    const communityId = await targetCommunity(ownerId, 'W501 Supersede');
    const evaluatorId = await evaluatorIn(communityId, 'w501-supersede-eval@example.com');
    const playerId = await evaluablePlayer(communityId, ownerId, 'Alvo');

    const firstId = randomUUID();
    await recordEvaluation(evaluatorId, {
      contributionId: firstId,
      communityId,
      playerId,
      dimensions: { saque: 5 },
    });

    const secondId = randomUUID();
    const second = await recordEvaluation(evaluatorId, {
      contributionId: secondId,
      communityId,
      playerId,
      dimensions: { saque: 9, defesa: 6 },
    });

    assert.deepEqual(second.rows, [
      {
        contribution_id: secondId,
        superseded_contribution_id: firstId,
        dimension_count: 2,
      },
    ]);

    const contributions = await contributionsOf(communityId, playerId);
    assert.equal(contributions.length, 2, 'the superseded contribution is kept');
    const superseded = contributions.find((row) => row.id === firstId);
    const effective = contributions.find((row) => row.id === secondId);
    assert.ok(superseded && effective);
    assert.ok(superseded.superseded_at !== null);
    assert.equal(superseded.superseded_by_id, secondId);
    assert.equal(effective.superseded_at, null);

    assert.deepEqual(
      await scoresOf(firstId),
      [{ dimension_key: 'saque', value: '5' }],
      'the superseded scores survive',
    );
  });

  test('the same evaluator holds one effective contribution per Community', async () => {
    const ownerId = await newUser('w501-isolation-owner@example.com');
    const firstCommunity = await targetCommunity(ownerId, 'W501 Isolation A');
    const secondCommunity = await targetCommunity(ownerId, 'W501 Isolation B');
    const evaluatorId = await newUser('w501-isolation-eval@example.com');
    for (const communityId of [firstCommunity, secondCommunity]) {
      await activeMembership(communityId, evaluatorId);
      await grantResponsibility(communityId, evaluatorId, 'EVALUATOR');
    }
    const playerId = await createPlayer(ownerId, { name: 'Alvo' });
    await addCommunityPlayer(firstCommunity, playerId, ownerId);
    await addCommunityPlayer(secondCommunity, playerId, ownerId);

    await recordEvaluation(evaluatorId, {
      communityId: firstCommunity,
      playerId,
      dimensions: { saque: 4 },
    });
    await recordEvaluation(evaluatorId, {
      communityId: secondCommunity,
      playerId,
      dimensions: { saque: 9 },
    });

    assert.equal((await contributionsOf(firstCommunity, playerId)).length, 1);
    assert.equal((await contributionsOf(secondCommunity, playerId)).length, 1);
  });
```

- [ ] **Step 3: Write the authorization and identity tests**

```ts
  test('evaluating requires the capability, and rank alone never grants it', async () => {
    const ownerId = await newUser('w501-auth-owner@example.com');
    const communityId = await targetCommunity(ownerId, 'W501 Auth');
    const playerId = await evaluablePlayer(communityId, ownerId, 'Alvo');

    const adminId = await newUser('w501-auth-admin@example.com');
    await activeMembership(communityId, adminId, 'admin');

    for (const actorId of [ownerId, adminId]) {
      const attempt = await recordEvaluation(actorId, {
        communityId,
        playerId,
        dimensions: { saque: 5 },
      }).catch((error: Error) => error);
      assertSqlState(attempt, '42501');
    }

    const anonymous = await recordEvaluation(null, {
      communityId,
      playerId,
      dimensions: { saque: 5 },
    }).catch((error: Error) => error);
    assertSqlState(anonymous, '42501');

    assert.equal((await contributionsOf(communityId, playerId)).length, 0);
  });

  test('a capability granted in another Community authorizes nothing here', async () => {
    const ownerId = await newUser('w501-cross-owner@example.com');
    const homeCommunity = await targetCommunity(ownerId, 'W501 Cross Home');
    const otherCommunity = await targetCommunity(ownerId, 'W501 Cross Other');
    const evaluatorId = await evaluatorIn(otherCommunity, 'w501-cross-eval@example.com');
    await activeMembership(homeCommunity, evaluatorId);
    const playerId = await evaluablePlayer(homeCommunity, ownerId, 'Alvo');

    const attempt = await recordEvaluation(evaluatorId, {
      communityId: homeCommunity,
      playerId,
      dimensions: { saque: 5 },
    }).catch((error: Error) => error);
    assertSqlState(attempt, '42501');
  });

  test('the evaluator is the caller, and the command exposes no way to name another', async () => {
    const { rows } = await client.query<{ args: string }>(
      `select pg_catalog.pg_get_function_arguments(p.oid) as args
         from pg_catalog.pg_proc p
         join pg_catalog.pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'record_player_evaluation'`,
    );
    assert.equal(rows.length, 1);
    assert.ok(
      !/evaluator/i.test(rows[0].args),
      `the signature must not accept an evaluator: ${rows[0].args}`,
    );
  });
```

- [ ] **Step 4: Write the eligibility and validation tests**

```ts
  test('a Player with no living standing in the Community is refused', async () => {
    const ownerId = await newUser('w501-standing-owner@example.com');
    const communityId = await targetCommunity(ownerId, 'W501 Standing');
    const evaluatorId = await evaluatorIn(communityId, 'w501-standing-eval@example.com');

    const strangerId = await createPlayer(ownerId, { name: 'De fora' });
    const stranger = await recordEvaluation(evaluatorId, {
      communityId,
      playerId: strangerId,
      dimensions: { saque: 5 },
    }).catch((error: Error) => error);
    assertSqlState(stranger, '23514');

    const deletedId = await evaluablePlayer(communityId, ownerId, 'Apagada');
    await client.query('update public.players set deleted_at = now() where id = $1', [deletedId]);
    const deleted = await recordEvaluation(evaluatorId, {
      communityId,
      playerId: deletedId,
      dimensions: { saque: 5 },
    }).catch((error: Error) => error);
    assertSqlState(deleted, '23514');

    const missing = await recordEvaluation(evaluatorId, {
      communityId,
      playerId: randomUUID(),
      dimensions: { saque: 5 },
    }).catch((error: Error) => error);
    assertSqlState(missing, 'P0002');

    const knownPlayerId = await evaluablePlayer(communityId, ownerId, 'Conhecida');
    const missingCommunity = await recordEvaluation(evaluatorId, {
      communityId: randomUUID(),
      playerId: knownPlayerId,
      dimensions: { saque: 5 },
    }).catch((error: Error) => error);
    assertSqlState(missingCommunity, 'P0002');
  });

  test('a dimension omitted is absent, never a zero', async () => {
    const ownerId = await newUser('w501-missing-owner@example.com');
    const communityId = await targetCommunity(ownerId, 'W501 Missing');
    const evaluatorId = await evaluatorIn(communityId, 'w501-missing-eval@example.com');
    const playerId = await evaluablePlayer(communityId, ownerId, 'Alvo');

    const contributionId = randomUUID();
    await recordEvaluation(evaluatorId, {
      contributionId,
      communityId,
      playerId,
      dimensions: { saque: 6 },
    });

    assert.deepEqual(await scoresOf(contributionId), [{ dimension_key: 'saque', value: '6' }]);
  });

  test('malformed input is refused and writes nothing', async () => {
    const ownerId = await newUser('w501-validation-owner@example.com');
    const communityId = await targetCommunity(ownerId, 'W501 Validation');
    const evaluatorId = await evaluatorIn(communityId, 'w501-validation-eval@example.com');
    const playerId = await evaluablePlayer(communityId, ownerId, 'Alvo');

    const cases: Array<{ label: string; rubricVersion?: string; dimensions: object }> = [
      { label: 'blank rubric version', rubricVersion: '   ', dimensions: { saque: 5 } },
      { label: 'no dimensions', dimensions: {} },
      { label: 'non numeric score', dimensions: { saque: 'muito bom' } },
      { label: 'score above the scale', dimensions: { saque: 11 } },
      { label: 'score below the scale', dimensions: { saque: -1 } },
      { label: 'blank dimension key', dimensions: { '   ': 5 } },
    ];

    for (const testCase of cases) {
      const attempt = await recordEvaluation(evaluatorId, {
        communityId,
        playerId,
        rubricVersion: testCase.rubricVersion,
        dimensions: testCase.dimensions as Record<string, number>,
      }).catch((error: Error) => error);
      assertSqlState(attempt, '23514');
    }

    assert.equal((await contributionsOf(communityId, playerId)).length, 0);
  });
```

- [ ] **Step 5: Write the idempotency, concurrency and legacy tests**

```ts
  test('the same command id replays instead of writing a second contribution', async () => {
    const ownerId = await newUser('w501-replay-owner@example.com');
    const communityId = await targetCommunity(ownerId, 'W501 Replay');
    const evaluatorId = await evaluatorIn(communityId, 'w501-replay-eval@example.com');
    const playerId = await evaluablePlayer(communityId, ownerId, 'Alvo');

    const commandId = randomUUID();
    const contributionId = randomUUID();
    const first = await recordEvaluation(evaluatorId, {
      commandId,
      contributionId,
      communityId,
      playerId,
      dimensions: { saque: 5 },
    });
    const second = await recordEvaluation(evaluatorId, {
      commandId,
      contributionId,
      communityId,
      playerId,
      dimensions: { saque: 5 },
    });

    assert.deepEqual(second.rows, first.rows);
    assert.equal((await contributionsOf(communityId, playerId)).length, 1);
  });

  test('a command id already spent on another contribution is refused', async () => {
    const ownerId = await newUser('w501-collision-owner@example.com');
    const communityId = await targetCommunity(ownerId, 'W501 Collision');
    const evaluatorId = await evaluatorIn(communityId, 'w501-collision-eval@example.com');
    const playerId = await evaluablePlayer(communityId, ownerId, 'Alvo');

    const commandId = randomUUID();
    await recordEvaluation(evaluatorId, {
      commandId,
      communityId,
      playerId,
      dimensions: { saque: 5 },
    });

    const reused = await recordEvaluation(evaluatorId, {
      commandId,
      contributionId: randomUUID(),
      communityId,
      playerId,
      dimensions: { saque: 6 },
    }).catch((error: Error) => error);
    assertSqlState(reused, '23505');

    assert.equal((await contributionsOf(communityId, playerId)).length, 1);
  });

  test('two concurrent submissions by one evaluator chain instead of colliding', async () => {
    const ownerId = await newUser('w501-race-owner@example.com');
    const communityId = await targetCommunity(ownerId, 'W501 Race');
    const evaluatorId = await evaluatorIn(communityId, 'w501-race-eval@example.com');
    const playerId = await evaluablePlayer(communityId, ownerId, 'Alvo');

    const attempts = await Promise.allSettled([
      recordEvaluation(evaluatorId, { communityId, playerId, dimensions: { saque: 4 } }),
      recordEvaluation(evaluatorId, { communityId, playerId, dimensions: { saque: 9 } }),
    ]);
    assert.deepEqual(
      attempts.map((attempt) => attempt.status),
      ['fulfilled', 'fulfilled'],
      'the Player row lock serializes them; neither may fail',
    );

    const contributions = await contributionsOf(communityId, playerId);
    assert.equal(contributions.length, 2);
    assert.equal(
      contributions.filter((row) => row.superseded_at === null).length,
      1,
      'exactly one effective contribution survives the race',
    );
  });

  test('the legacy evaluation surface is untouched', async () => {
    const { rows: policies } = await client.query<{ count: string }>(
      `select count(*)::text as count from pg_catalog.pg_policies
        where schemaname = 'public' and tablename = 'player_evaluations'`,
    );
    assert.notEqual(policies[0].count, '0', 'the legacy policies still exist');

    const { rows: index } = await client.query<{ indexdef: string }>(
      `select indexdef from pg_catalog.pg_indexes
        where schemaname = 'public' and indexname = 'player_evaluations_owner_player_idx'`,
    );
    assert.equal(index.length, 1);
    assert.match(index[0].indexdef, /\(owner_id, player_id\)/);

    const { rows: self } = await client.query<{ count: string }>(
      `select count(*)::text as count from information_schema.tables
        where table_schema = 'public' and table_name = 'self_evaluations'`,
    );
    assert.deepEqual(self, [{ count: '1' }]);

    const { rows: scoped } = await client.query<{ is_nullable: string }>(
      `select is_nullable from information_schema.columns
        where table_schema = 'public'
          and table_name = 'player_evaluations'
          and column_name = 'community_id'`,
    );
    assert.deepEqual(
      scoped,
      [{ is_nullable: 'NO' }],
      'the proof that LEGACY_UNSCOPED_EVALUATION is empty by construction',
    );
  });
```

- [ ] **Step 6: Run the suite and record which tests fail**

Run:

```bash
VOLLEY_TEST_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:55500/postgres' npx tsx --test src/test/db/playerEvaluationContributions.dbtest.ts
```

Expected: the five Task 1 tests and `the legacy evaluation surface is untouched` pass; every test
that calls `recordEvaluation` fails with `42883`
(`function public.record_player_evaluation(...) does not exist`), including
`the evaluator is the caller...`, which finds no row in `pg_proc`. Any other code means a fixture is
wrong.

- [ ] **Step 7: Commit the tests, failing**

```bash
git add src/test/db/playerEvaluationContributions.dbtest.ts
git commit -m "test: pin the record_player_evaluation contract"
```

---

### Task 4: Implement the command

**Files:**

- Modify: `supabase/migrations/<timestamp>_versioned_player_evaluation_source.sql`
- Test: `src/test/db/playerEvaluationContributions.dbtest.ts` (unchanged)

**Interfaces:**

- Consumes: `app_private.find_command_receipt(uuid, text, uuid)`,
  `app_private.record_command_receipt(uuid, uuid, text, uuid, jsonb, text)`,
  `public.current_user_has_community_capability(uuid, text)`,
  `app_private.registration_player_standing_alive(uuid, uuid)`.
- Produces: `public.record_player_evaluation(uuid, uuid, uuid, uuid, text, jsonb)` returning
  `(contribution_id uuid, superseded_contribution_id uuid, dimension_count integer)`.

- [ ] **Step 1: Append the command to the migration**

```sql
create function public.record_player_evaluation(
  p_command_id uuid,
  p_contribution_id uuid,
  p_community_id uuid,
  p_player_id uuid,
  p_rubric_version text,
  p_dimensions jsonb
)
returns table (
  contribution_id uuid,
  superseded_contribution_id uuid,
  dimension_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_receipt jsonb;
  v_result jsonb;
  v_superseded uuid;
  v_count integer;
begin
  if p_command_id is null
     or p_contribution_id is null
     or p_community_id is null
     or p_player_id is null then
    raise exception 'command_id, contribution_id, community_id and player_id are required'
      using errcode = '23514';
  end if;

  -- Load-bearing despite the discarded result: find_command_receipt raises 23505 when this command
  -- id already belongs to another aggregate or command type, and that collision must surface before
  -- any row lock. The replay itself happens after authorization below, so a caller whose capability
  -- was revoked cannot read back an earlier result.
  v_receipt := app_private.find_command_receipt(
    p_command_id,
    'record_player_evaluation',
    p_contribution_id
  );

  v_uid := (select auth.uid());
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  -- The Player row is the narrowest row two concurrent submissions share. Without this lock a
  -- double click reads one effective contribution twice, both calls try to supersede it, and the
  -- second insert collides with the partial unique index as a raw 23505 -- a code reserved here for
  -- command id collisions. Locking the Community row instead would serialize every evaluation in
  -- the Community for no added safety.
  perform 1 from public.players p where p.id = p_player_id for update;
  if not found then
    raise exception 'Player not found' using errcode = 'P0002';
  end if;

  if not exists (select 1 from public.communities c where c.id = p_community_id) then
    raise exception 'Community not found' using errcode = 'P0002';
  end if;

  if not public.current_user_has_community_capability(p_community_id, 'player.evaluate') then
    raise exception 'Not authorized to evaluate Players in this Community'
      using errcode = '42501';
  end if;

  v_receipt := app_private.find_command_receipt(
    p_command_id,
    'record_player_evaluation',
    p_contribution_id
  );
  if v_receipt is not null then
    return query
      select
        (v_receipt->>'contribution_id')::uuid,
        (v_receipt->>'superseded_contribution_id')::uuid,
        (v_receipt->>'dimension_count')::integer;
    return;
  end if;

  if not app_private.registration_player_standing_alive(p_community_id, p_player_id) then
    raise exception 'Player has no living roster standing in this Community'
      using errcode = '23514';
  end if;

  if nullif(pg_catalog.btrim(coalesce(p_rubric_version, '')), '') is null then
    raise exception 'Rubric version is required' using errcode = '23514';
  end if;

  if p_dimensions is null
     or pg_catalog.jsonb_typeof(p_dimensions) <> 'object'
     or p_dimensions = '{}'::jsonb then
    raise exception 'At least one dimension score is required' using errcode = '23514';
  end if;

  -- Two passes on purpose: the range test casts each value to numeric, which would raise a raw
  -- 22P02 on a non-numeric value, so every value must be proven numeric first.
  if exists (
    select 1
      from pg_catalog.jsonb_each(p_dimensions) d
     where pg_catalog.btrim(d.key) = ''
        or pg_catalog.jsonb_typeof(d.value) <> 'number'
  ) then
    raise exception 'Dimension keys must be non-blank and scores must be numbers'
      using errcode = '23514';
  end if;

  if exists (
    select 1
      from pg_catalog.jsonb_each(p_dimensions) d
     where (d.value)::numeric < 0
        or (d.value)::numeric > 10
  ) then
    raise exception 'Dimension scores must be between 0 and 10' using errcode = '23514';
  end if;

  -- Supersede before inserting: the partial unique index permits exactly one effective row, so the
  -- reverse order would collide with the row being replaced.
  update public.player_evaluation_contributions
     set superseded_at = pg_catalog.now(),
         superseded_by_id = p_contribution_id
   where community_id = p_community_id
     and player_id = p_player_id
     and evaluator_user_id = v_uid
     and superseded_at is null
  returning id into v_superseded;

  insert into public.player_evaluation_contributions (
    id, community_id, player_id, evaluator_user_id, rubric_version, command_id
  ) values (
    p_contribution_id,
    p_community_id,
    p_player_id,
    v_uid,
    pg_catalog.btrim(p_rubric_version),
    p_command_id
  );

  insert into public.player_evaluation_dimension_scores (contribution_id, dimension_key, value)
  select p_contribution_id, d.key, (d.value)::numeric
    from pg_catalog.jsonb_each(p_dimensions) d;

  get diagnostics v_count = row_count;

  v_result := pg_catalog.jsonb_build_object(
    'contribution_id', p_contribution_id,
    'superseded_contribution_id', v_superseded,
    'dimension_count', v_count
  );
  perform app_private.record_command_receipt(
    p_command_id,
    v_uid,
    'record_player_evaluation',
    p_contribution_id,
    v_result,
    'PLAYER_EVALUATION'
  );

  return query select p_contribution_id, v_superseded, v_count;
end;
$$;

revoke all on function public.record_player_evaluation(uuid, uuid, uuid, uuid, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.record_player_evaluation(uuid, uuid, uuid, uuid, text, jsonb)
  to authenticated;
```

- [ ] **Step 2: Run the suite**

Run:

```bash
VOLLEY_TEST_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:55500/postgres' npx tsx --test src/test/db/playerEvaluationContributions.dbtest.ts
```

Expected: every test passes. Two failures are worth reading rather than patching around:

- if the concurrency test reports a rejection, the Player row lock is missing or placed after the
  first read of `player_evaluation_contributions`;
- if the replay test writes two contributions, the second `find_command_receipt` call was dropped or
  moved before the authorization check.

- [ ] **Step 3: Re-run the governance regression suites**

Run:

```bash
VOLLEY_TEST_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:55500/postgres' npx tsx --test --test-concurrency=1 src/test/db/governanceCapabilities.dbtest.ts src/test/db/communityBolaMatrix.dbtest.ts src/test/db/sessionOrganizerAssignments.dbtest.ts src/test/db/commandReceipts.dbtest.ts
```

Expected: PASS, with no edits to those files.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations
git commit -m "feat: record versioned Player evaluations"
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

```bash
npx eslint src/test/db/playerEvaluationContributions.dbtest.ts
```

```bash
npx prettier --check src/test/db/playerEvaluationContributions.dbtest.ts README.md HANDOFF.md
```

Expected: zero errors. Then prove the branch's own diff is clean:

```bash
git diff main...HEAD --name-only
```

Expected: only the migration, the new suite, the spec, this plan, `README.md` and `HANDOFF.md`.

- [ ] **Step 3: Check for whitespace damage**

```bash
git diff --check
```

Expected: no output.

- [ ] **Step 4: Add the migration to the README list**

Find the migration list in `README.md` and append one line for the new file, in Brazilian Portuguese,
matching the format and voice of the entries already there. The entry says: the migration introduces
the versioned evaluation source model — the `EVALUATOR` responsibility that grants `player.evaluate`,
the append-only contribution table with one effective row per evaluator, Player and Community, the
normalized dimension scores, and the `record_player_evaluation` command.

- [ ] **Step 5: Update HANDOFF.md**

Read the existing "O que a W4-06 entregou" and "Evidência de verificação da W4-06" sections first and
match their voice and structure. Then:

1. The header date becomes the day you finish, and the sentence says the slice closed is `XS-W5-01`.
2. In the slice table, `XS-W5-01` becomes `concluída`, and add
   `XS-W5-02 | Skill rubric/dimension contract | próxima`.
3. The branch section names `exec/c6-w5-01-versioned-player-evaluation` as the current branch,
   started from `main`.
4. Add "O que a W5-01 entregou", covering: the `EVALUATOR` responsibility and why the capability is
   per person and never by rank (`GINV-CAP-002`); the append-only contribution table with the partial
   unique index; dimension scores as rows so `missing ≠ 0` is structural; the evaluator resolved from
   `auth.uid()` with no parameter; supersede-then-insert in one transaction under the Player row
   lock; and that `rubric_version` is deliberately opaque text because `OPEN-BAL-001` is open and
   XS-W5-02 owns the rubric contract.
5. Add "Evidência de verificação da W5-01" with the exact counts from Step 1 and the focused results
   from Step 2.
6. Add the warnings the next slice needs:
   - the slice delivers **writes with no consumer** — aggregation is still the client-side median in
     `src/logic/playerEvaluations.ts` reading legacy rows, so nothing visible changes;
   - `player_evaluations` still carries `unique (owner_id, player_id)`, so an evaluator active in two
     Communities still collides there; retiring that authority belongs to the cohort migration;
   - `app_private.registration_player_standing_alive` now has a second caller outside Registration
     and its name no longer matches its use; the slice that needs a third caller renames it;
   - `player_evaluation_contributions` references Community and Player with `on delete restrict`, so
     deleting either now fails while contributions exist — deliberate, and the retention decision
     belongs to the slice that defines evaluation retention.

- [ ] **Step 6: Commit**

```bash
git add README.md HANDOFF.md
git commit -m "docs: record XS-W5-01 completion"
```

- [ ] **Step 7: Report the branch state**

State the branch name, the commit list, and the verification numbers. Do not merge into `main` and do
not push: every C6 slice so far waited for an explicit decision from the user.
