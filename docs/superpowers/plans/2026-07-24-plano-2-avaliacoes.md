# Plano 2 Atualizado: Avaliações Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Evolve the existing player-evaluation system (already live, already aggregates
multiple evaluators with outlier rejection) so that official evaluations are authorized
per-community (owner/admin only, not "any community member") and a genuine, isolated
self-evaluation exists — closing the last open piece of the Scalable Product Program's
Plan 2.

**Architecture:** This is a narrow evolution, not a rebuild. `aggregatePlayerEvaluations`,
`player.atributos`, `evaluationAggregate`, `balancing.ts`, and the sync payload shape are
all explicitly out of scope and must not change behavior. The only new surface is: one
new column (`community_id`, authorization-only) on the existing `player_evaluations`
table, one new table (`self_evaluations`, fully isolated), and the UI/application plumbing
needed to supply a community context at write time.

**Tech Stack:** Same Supabase/TypeScript/React stack as prior plans. No new dependencies.

## Global Constraints

- `aggregatePlayerEvaluations`, `applyEvaluationAggregate`, `simulateLocalConsensus`
  (`src/logic/playerEvaluations.ts`) must not change behavior or signature. Their
  existing tests must pass unmodified. `community_id` is never read by these functions —
  it exists on the table/type purely for RLS authorization and traceability.
- `src/logic/balancing.ts` is not touched by this plan.
- `Player.atributos`, `Player.evaluationAggregate`, `Player.hasOwnEvaluation` keep their
  current meaning and shape — this plan does not make them community-contextual.
- No migration of existing `player_evaluations` data — the production database has zero
  rows in this table (reset earlier this session). Schema changes are clean `alter
  table`/`create table`, not data-preserving migrations.
- No new UI screens or navigation. Adapt `PlayerEditView.tsx`'s existing evaluation
  surface; do not redesign it.
- No new `SECURITY DEFINER` functions. Reuse `current_user_has_community_role(uuid,
  text[])` (defined in `supabase/migrations/20260610161203_backend_operational_sync.sql`)
  exactly as it's already used elsewhere — e.g.
  `public.current_user_has_community_role(community_id, array['owner', 'admin'])`.
- Do not add TanStack Query, Dexie, XState, or Zod (carried over from every prior plan in
  this program — still applies).

---

### Task 1: Database — community_id authorization + self_evaluations table

**Files:**
- Create: `supabase/migrations/20260724150000_evaluation_community_authorization.sql`
- Modify: `supabase/migrations/schema.sql`
- Modify: `src/infra/supabase/schema.test.ts`

**Interfaces:**
- Consumes: nothing (fully DB-side).
- Produces: `public.player_evaluations` gains `community_id uuid not null references
  public.communities(id) on delete cascade`. `unique(owner_id, player_id)` is unchanged.
  Write policies require `current_user_has_community_role(community_id, array['owner',
  'admin'])` instead of the current "any member with player access." New table
  `public.self_evaluations(player_id uuid primary key references public.players(id) on
  delete cascade, attributes jsonb not null default '{}'::jsonb, updated_at timestamptz
  not null default now())` with RLS scoped to the player's own account.

- [ ] **Step 1: Read the current state before editing**

Read the existing RLS policies for `player_evaluations` in `schema.sql` (search for
`"Organizers can insert own player evaluations"`, `"Organizers can update own player
evaluations"`, `"Organizers can delete own player evaluations"`, `"Community members can
read player evaluations"` — around line 465-483 as of this plan's writing, but confirm
current line numbers before editing). Read
`supabase/migrations/20260610161203_backend_operational_sync.sql` around line 270-380 to
see `current_user_has_community_role`'s exact definition and an existing multi-line
policy example combining `owner_id = (select auth.uid())` with a role check, to match
the established style exactly.

- [ ] **Step 2: Write the new migration**

Create `supabase/migrations/20260724150000_evaluation_community_authorization.sql`:

```sql
-- Ties player_evaluations writes to a specific community's owner/admin instead of any
-- community member with access to the player. Adds a genuine, isolated self-evaluation
-- table. Does not touch aggregation behavior (aggregatePlayerEvaluations is unaffected —
-- community_id exists for authorization only).

alter table public.player_evaluations
  add column community_id uuid references public.communities(id) on delete cascade;

-- Table has zero rows in production (reset earlier); safe to enforce not null directly.
alter table public.player_evaluations
  alter column community_id set not null;

drop policy if exists "Organizers can insert own player evaluations" on public.player_evaluations;
create policy "Community owner or admin can insert player evaluations"
  on public.player_evaluations
  for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and public.current_user_has_community_role(community_id, array['owner', 'admin'])
  );

drop policy if exists "Organizers can update own player evaluations" on public.player_evaluations;
create policy "Community owner or admin can update player evaluations"
  on public.player_evaluations
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and public.current_user_has_community_role(community_id, array['owner', 'admin'])
  );

drop policy if exists "Organizers can delete own player evaluations" on public.player_evaluations;
create policy "Community owner or admin can delete player evaluations"
  on public.player_evaluations
  for delete to authenticated
  using (owner_id = (select auth.uid()));

-- Read policy is unchanged — leave "Community members can read player evaluations" as-is.

create table public.self_evaluations (
  player_id uuid primary key references public.players(id) on delete cascade,
  attributes jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.self_evaluations enable row level security;

create policy "Players can read their own self-evaluation"
  on public.self_evaluations
  for select to authenticated
  using (
    exists (
      select 1 from public.players p
      where p.id = self_evaluations.player_id
        and p.user_id = (select auth.uid())
    )
  );

create policy "Players can upsert their own self-evaluation"
  on public.self_evaluations
  for insert to authenticated
  with check (
    exists (
      select 1 from public.players p
      where p.id = self_evaluations.player_id
        and p.user_id = (select auth.uid())
    )
  );

create policy "Players can update their own self-evaluation"
  on public.self_evaluations
  for update to authenticated
  using (
    exists (
      select 1 from public.players p
      where p.id = self_evaluations.player_id
        and p.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.players p
      where p.id = self_evaluations.player_id
        and p.user_id = (select auth.uid())
    )
  );

revoke all on table public.self_evaluations from public, anon;
grant select, insert, update on public.self_evaluations to authenticated;
```

Match the exact grant statement already used for `player_evaluations` in `schema.sql`
(read it first — e.g. `grant select, insert, update, delete on public.player_evaluations
to authenticated;`) if `self_evaluations` needs a `delete` grant too; players deleting
their own self-evaluation is plausible but not required by the design — decide based on
whether any other single-owner-record table in this schema (e.g. how `player_evaluations`
itself handles delete) grants delete to the row's own owner, and match that pattern for
consistency rather than inventing a new one.

- [ ] **Step 3: Apply the migration to the real Supabase project**

Use the Supabase MCP `apply_migration` tool against project `csoslatxjjazrtrtylke` (active,
zero rows in `player_evaluations` — confirmed safe to apply `not null` directly). Verify
with `execute_sql`/`list_tables` that `player_evaluations.community_id` is `not null`,
`self_evaluations` exists with RLS enabled, and the three rewritten policies plus the
unchanged read policy are all present. Run `get_advisors` (security + performance) and
confirm no new advisories.

- [ ] **Step 4: Update the consolidated schema.sql**

Apply the same changes from Step 2 to `supabase/migrations/schema.sql` — find the
existing `player_evaluations` table definition and its three write policies, rewrite them
in place (don't append a separate "alter table" block at the end of the file — `schema.sql`
represents final state, so the base `create table` and policies should reflect the final
shape directly, matching how this file has been maintained by prior plans in this
program). Add the `self_evaluations` table/policies as a new block, following the
existing placement convention (near other player-adjacent tables).

- [ ] **Step 5: Update schema.test.ts**

Read the file's existing structure for `player_evaluations` first (search for
`player_evaluations` — there are contract tests at multiple points asserting table
existence, RLS enablement, and grants, plus tests reading the historical
`20260624133200_player_evaluations.sql` migration file directly). Add/update:
- A new test reading this task's new migration file, asserting it adds `community_id`,
  rewrites the three write policies to check
  `current_user_has_community_role(community_id, array['owner', 'admin'])`, and creates
  `self_evaluations` with RLS enabled and the three player-scoped policies.
- Update any test asserting the final/consolidated `schema.sql` state for
  `player_evaluations`'s write policies to reflect the new authorization check — leave
  tests reading the historical `20260624133200_player_evaluations.sql` file unchanged
  (that migration's original text is immutable, same rule as every prior plan's
  schema.test.ts work in this session).

- [ ] **Step 6: Run the tests**

```bash
npm test
```

Expected: all pass, including new/updated ones.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260724150000_evaluation_community_authorization.sql supabase/migrations/schema.sql src/infra/supabase/schema.test.ts
git commit -m "feat(db): scope player evaluation writes to community owner/admin, add self-evaluation table"
```

---

### Task 2: Types & cloud service mappers

**Files:**
- Modify: `src/shared/types/player.ts`
- Modify: `src/infra/supabase/playerEvaluationCloudService.ts`
- Modify: `src/infra/supabase/playerEvaluationCloudService.test.ts` (create if it doesn't
  already exist under this name — check first; the existing tests for this file may live
  in a differently-named test file, find it via `grep -rn playerEvaluationCloudService
  src/ --include=*.test.ts`)
- Create: `src/infra/supabase/selfEvaluationCloudService.ts`
- Create: `src/infra/supabase/selfEvaluationCloudService.test.ts`

**Interfaces:**
- Consumes: Task 1's `player_evaluations.community_id` (not null) and `self_evaluations`
  table.
- Produces: `PlayerEvaluation` type gains `communityId: string` (required — every
  evaluation now has one). `Player` type gains `evaluationCommunityId?: string` — the
  community context under which the current user's pending evaluation edit should be
  authorized at the next sync (set locally when the user edits their evaluation; read by
  `mapPlayerEvaluationToDb` in this task; consumed by Task 3's sync wiring) — and
  `selfEvaluation?: { attributes: Attributes; updatedAt: string }` — the current player's
  own self-evaluation, merged into the local `Player` object by Task 3's sync wiring and
  read by Task 4's UI. New exported
  `selfEvaluationCloudService` with `fetch(playerId: string): Promise<{ attributes:
  Attributes; updatedAt: string } | null>` and `upsert(playerId: string, attributes:
  Attributes): Promise<void>`, following the existing `*CloudService.ts` pattern in this
  directory (see `playerEvaluationCloudService.ts` for the house style: plain object
  export, `supabase.from(...)`, throw on `error`).

- [ ] **Step 1: Read the current files**

Read `src/shared/types/player.ts` in full (both `Player` and `PlayerEvaluation`
interfaces), `src/infra/supabase/playerEvaluationCloudService.ts` in full (already fairly
small — the whole file's mapper functions and the exported service object), and one
existing sibling cloud service in the same directory (e.g. `playerCloudService.ts` or
`communityCloudService.ts`) to confirm the established pattern for a simple single-row
per-owner service like `self_evaluations` will be.

- [ ] **Step 2: Add `communityId` to `PlayerEvaluation`**

In `src/shared/types/player.ts`, add `communityId: string;` to the `PlayerEvaluation`
interface (required, not optional — every evaluation has a community after Task 1). Add
`evaluationCommunityId?: string;` and `selfEvaluation?: { attributes: Attributes;
updatedAt: string };` to the `Player` interface, placed near the other evaluation-related
optional fields (`personalAttributes`, `hasOwnEvaluation`, `evaluationAggregate`).

- [ ] **Step 3: Update the mapper functions**

In `src/infra/supabase/playerEvaluationCloudService.ts`:
- `mapPlayerEvaluationToDb(player, ownerId, playerCloudId)`: add `community_id:
  player.evaluationCommunityId` to the returned object. If `player.evaluationCommunityId`
  is undefined at call time, that's a genuine bug upstream (Task 3/4's job to ensure it's
  always set before an evaluation is saved) — do not add a fallback or default here; let
  it surface as a real `not null` constraint violation from the database if the upstream
  wiring is wrong, per this project's "no error handling for impossible scenarios"
  convention (see `GEMINI.md`).
- `mapDbToPlayerEvaluation(db)`: add `communityId: db.community_id` to the returned
  `PlayerEvaluation`.
- Update `deduplicatePlayerEvaluationRecords` only if `community_id` needs to factor into
  its dedup key — it currently dedupes by `owner_id:player_id`, which still matches the
  unchanged `unique(owner_id, player_id)` constraint from Task 1, so this function likely
  needs no change; confirm by re-reading its logic against the unchanged constraint before
  deciding.

- [ ] **Step 4: Write `selfEvaluationCloudService.ts`**

Create `src/infra/supabase/selfEvaluationCloudService.ts` following the exact style of
`playerEvaluationCloudService.ts` (plain exported object, `supabase.from('self_evaluations')`,
throw on `error`, no retry/fallback logic beyond what sibling services already do):

```typescript
import { supabase } from '../../lib/supabaseClient';
import type { Attributes } from '../../types';

export interface SelfEvaluation {
  attributes: Attributes;
  updatedAt: string;
}

export const selfEvaluationCloudService = {
  async fetch(playerId: string): Promise<SelfEvaluation | null> {
    const { data, error } = await supabase
      .from('self_evaluations')
      .select('attributes, updated_at')
      .eq('player_id', playerId)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;
    return { attributes: data.attributes, updatedAt: data.updated_at };
  },

  async upsert(playerId: string, attributes: Attributes): Promise<void> {
    const { error } = await supabase
      .from('self_evaluations')
      .upsert(
        { player_id: playerId, attributes, updated_at: new Date().toISOString() },
        { onConflict: 'player_id' },
      );

    if (error) throw error;
  },
};
```

Adjust the exact shape only if reading the sibling service files in Step 1 reveals a
different established convention (e.g. a shared `DbRecord` type alias, a different error
class) — match this codebase's existing pattern over the snippet above if they conflict.

- [ ] **Step 5: Tests**

Write tests for `selfEvaluationCloudService` mirroring the test style of
`playerEvaluationCloudService.test.ts` (or whatever file already tests sibling cloud
services in this directory — check for a shared Supabase-client mocking pattern and reuse
it, don't invent a new one). Cover: `fetch` returns `null` when no row exists, `fetch`
maps `updated_at`/`attributes` correctly, `upsert` calls `supabase.from('self_evaluations').upsert`
with the right `onConflict` target. Update `playerEvaluationCloudService`'s existing
tests only for the new `community_id`/`communityId` mapping — do not touch or weaken any
other existing assertion in that test file.

- [ ] **Step 6: Run the full suite, typecheck, lint**

```bash
npm test
npx tsc --noEmit
npm run lint:eslint
```

- [ ] **Step 7: Commit**

```bash
git add src/shared/types/player.ts src/infra/supabase/playerEvaluationCloudService.ts src/infra/supabase/playerEvaluationCloudService.test.ts src/infra/supabase/selfEvaluationCloudService.ts src/infra/supabase/selfEvaluationCloudService.test.ts
git commit -m "feat(infra): add communityId to PlayerEvaluation, add self-evaluation cloud service"
```

---

### Task 3: Application layer & sync wiring

**Files:**
- Modify: `src/application/localPlayerUseCases.ts`
- Modify: `src/application/localPlayerUseCases.test.ts`
- Modify: `src/infra/supabase/syncService.ts`
- Modify: `src/infra/supabase/syncService.test.ts`
- Create: `src/application/selfEvaluationUseCases.ts`
- Create: `src/application/selfEvaluationUseCases.test.ts`

**Interfaces:**
- Consumes: Task 2's `selfEvaluationCloudService`, `PlayerEvaluation.communityId`,
  `Player.evaluationCommunityId`.
- Produces: `applyLocalPlayerSave` (in `localPlayerUseCases.ts`) gains a required
  `communityId: string` field on its `input` parameter, and sets
  `evaluationCommunityId: communityId` on the returned `savedPlayer`. New exported
  `submitSelfEvaluation(playerId: string, attributes: Attributes):
  Promise<AppResult<void>>` (or match whatever result-wrapping convention
  `src/application/appResult.ts` already establishes — read it before writing this
  function's signature) in `selfEvaluationUseCases.ts`. Task 4 (UI) depends on both of
  these exact signatures.

- [ ] **Step 1: Read the current files**

Read `src/application/localPlayerUseCases.ts` in full (the `applyLocalPlayerSave`
function and its callers/tests), `src/application/appResult.ts` (the `AppResult`
convention used across this application layer — every use case in this codebase should
follow the same success/error wrapping pattern), and the `syncService.ts` sections
already touched by prior evaluation work: the `bulkUpsertForPlayers` call site (currently
around line 1021) and the `downloadCloudDataToLocal` evaluation-fetch/aggregate block
(currently around lines 1343-1379) — confirm current line numbers before editing, this
file has changed since those line numbers were last recorded in this plan.

- [ ] **Step 2: Thread `communityId` through `applyLocalPlayerSave`**

Add `communityId: string` to `applyLocalPlayerSave`'s `input` parameter type. In the
function body, add `evaluationCommunityId: communityId` to both `savedPlayerTemp` and
(if not already inherited via spread) `savedPlayer`. Update every existing call site of
`applyLocalPlayerSave` found via `grep -rn applyLocalPlayerSave src/` to pass a
`communityId` — Task 4 is responsible for the UI call site specifically, but any other
call site (e.g. existing tests) must be updated in this task to keep the suite compiling.

- [ ] **Step 3: Wire `syncService.ts` to upload/download `community_id` and self-evaluations**

- The `bulkUpsertForPlayers` call site (uploads pending evaluations): no signature change
  needed — `mapPlayerEvaluationToDb` (Task 2) already reads `player.evaluationCommunityId`
  internally. Confirm players without a pending evaluation change (no
  `evaluationCommunityId` set) don't get incorrectly included in the bulk upsert — read
  `bulkUpsertForPlayers`'s filtering logic (it already filters by `playerCloudId`
  presence; confirm it also implicitly only includes players with an actual evaluation to
  upload, or whether this task needs to add that filter).
- The `downloadCloudDataToLocal` evaluation block: `cloudEvaluations` (from
  `playerEvaluationCloudService.fetchAll()`) now carry `communityId` — no change needed
  to the aggregation call itself (Global Constraints: `applyEvaluationAggregate` doesn't
  read `communityId`), but add a parallel fetch of self-evaluations via
  `selfEvaluationCloudService` for the current user's own players and merge each into the
  corresponding player's `Player.selfEvaluation` field (already added in Task 2).

- [ ] **Step 4: Write `selfEvaluationUseCases.ts`**

Create the application-layer wrapper around `selfEvaluationCloudService`, following the
`AppResult` convention from Step 1. Keep this thin — the cloud service already has the
real logic; this layer exists only for the same reason every other `*UseCases.ts` file in
`src/application/` exists (consistent error wrapping, a single call site for the UI to
depend on instead of the infra layer directly).

- [ ] **Step 5: Tests**

Update `localPlayerUseCases.test.ts` for the new required `communityId` input (every
existing test calling `applyLocalPlayerSave` needs a `communityId` in its input fixture).
Update `syncService.test.ts` for the new self-evaluation fetch/merge behavior in
`downloadCloudDataToLocal` — add a test proving self-evaluations are fetched and merged,
and (regression guard, ties to this plan's core constraint) a test proving
`aggregatePlayerEvaluations`'s output is unchanged by the presence of `communityId` on
input evaluations. Write `selfEvaluationUseCases.test.ts` mirroring the test style of a
sibling `*UseCases.test.ts` file.

- [ ] **Step 6: Run the full suite, typecheck, lint**

```bash
npm test
npx tsc --noEmit
npm run lint:eslint
```

- [ ] **Step 7: Commit**

```bash
git add src/application/localPlayerUseCases.ts src/application/localPlayerUseCases.test.ts src/infra/supabase/syncService.ts src/infra/supabase/syncService.test.ts src/application/selfEvaluationUseCases.ts src/application/selfEvaluationUseCases.test.ts src/shared/types/player.ts
git commit -m "feat(app): thread evaluation community context through save/sync, add self-evaluation use case"
```

---

### Task 4: UI — community context + minimal self-evaluation surface

**Files:**
- Modify: `src/components/player/PlayerEditView.tsx`
- Modify: `src/components/player/PlayerEditView.spec.tsx` (or whatever the existing test
  file for this component is named — check first)

**Interfaces:**
- Consumes: `applyLocalPlayerSave`'s new required `communityId` input (Task 3),
  `selfEvaluationUseCases.submitSelfEvaluation` (Task 3), `Player.selfEvaluation` (if
  added in Task 3).
- Produces: nothing further downstream — this is the last task.

- [ ] **Step 1: Read the current component and its save handler chain**

Read `PlayerEditView.tsx` in full, tracing from the save button's `onClick`/`onSave` prop
through to wherever `applyLocalPlayerSave` is actually invoked (it may not be called
directly inside this component — trace the prop chain up through whatever parent wires
`onSave`, likely `App.tsx`, to find the real call site). The component already derives
`editingPlayerCommunity` (a `useMemo` picking the first community from
`editingPlayer.communityIds` that matches the full `communities` list, currently used to
fetch community members via `useCommunityMembers`) — this is the existing pattern to
reuse for the evaluation's community context, not a new concept to invent.

- [ ] **Step 2: Pass `communityId` at save time**

Wire `editingPlayerCommunity?.id` (or its `cloudId`, whichever `applyLocalPlayerSave`'s
`communityId` field is meant to hold per Task 3 — confirm against Task 3's actual
implementation, not this plan's guess) through to the `applyLocalPlayerSave` call. If
`editingPlayerCommunity` is `null` (player belongs to no community), decide with the
existing `permissions.canEvaluatePlayer` gate: an evaluation should not be submittable
without a community context, since Task 1's schema makes `community_id` required — hide
or disable the evaluation-editing controls in that case rather than allowing a save that
would later fail sync with a constraint violation. Check whether this codebase's existing
validation pattern (`localPlayerUseCases.ts`'s `errors` object, seen in Task 3's Step 1
reading) already has a place for this kind of validation error and reuse it rather than
inventing new UI-only validation logic.

- [ ] **Step 3: Minimal self-evaluation surface**

Add a small, separate UI element (not integrated into the existing evaluation
attribute-editing form — this is a genuinely different concept per this plan's design)
allowing the player to view/edit their own `self_evaluations` row when
`editingPlayer.userId === currentUserId` (i.e., only when a user is editing their own
player record). Call `selfEvaluationUseCases.submitSelfEvaluation` on save. Follow this
file's existing form-field patterns (the attribute sliders/inputs already used for
`editingPlayer.atributos`) rather than introducing a new input style.

- [ ] **Step 4: Tests**

Update the component's existing test file for the new `communityId` threading (mock
`editingPlayerCommunity` derivation as needed) and add a test for the new self-evaluation
surface (renders only for the player's own record, calls
`selfEvaluationUseCases.submitSelfEvaluation` on save).

- [ ] **Step 5: Run the full suite, typecheck, lint**

```bash
npm test
npx tsc --noEmit
npm run lint:eslint
```

- [ ] **Step 6: Commit**

```bash
git add src/components/player/PlayerEditView.tsx src/components/player/PlayerEditView.spec.tsx
git commit -m "feat(ui): wire evaluation community context and self-evaluation surface"
```

---

## Completion Gate

- [ ] `player_evaluations.community_id` is `not null` in production and in `schema.sql`;
      write RLS requires `current_user_has_community_role(community_id, array['owner',
      'admin'])`.
- [ ] `self_evaluations` exists in production and in `schema.sql`, RLS scoped to the
      player's own account, never read by `aggregatePlayerEvaluations`.
- [ ] `aggregatePlayerEvaluations`, `applyEvaluationAggregate`, `simulateLocalConsensus`,
      and `balancing.ts` are unchanged in behavior — their existing tests pass unmodified.
- [ ] A player's own self-evaluation never appears in their `evaluationAggregate`.
- [ ] Full suite green (`npm test`), typecheck clean (`npx tsc --noEmit`), lint clean
      (`npm run lint:eslint`).
- [ ] The new migration has been applied to and verified against the real Supabase
      project (`csoslatxjjazrtrtylke`).
