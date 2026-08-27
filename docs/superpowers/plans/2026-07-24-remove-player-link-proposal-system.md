# Remove Player Link Proposal System (Plan B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the old propose/approve player-link system (DB objects, sync
plumbing, application layer, UI) now that Plan A's claim-code flow (merged in
`main` at `6c14dd6`) covers the only remaining use case.

**Architecture:** Every task in this plan is a deletion or a narrowing of
existing code — no new capability is introduced. Tasks are ordered
outside-in by compile dependency (UI → infra/sync → application/domain →
types/plumbing), with the DB migration first since it has no code
dependency. This ordering means the app keeps building and all tests keep
passing at the end of every task, even though the whole removal spans 5
tasks.

**Tech Stack:** No new dependencies. Same TypeScript/React/Supabase stack as
Plan A.

## Global Constraints

- `consolidateDuplicateRecords` in `src/infra/supabase/syncService.ts` is a
  **general-purpose** dedup engine used on every sync (not just by the old
  link-proposal system) to merge duplicate communities/players created from
  offline conflicts. Its general (non-alias) path must be preserved exactly
  as-is — do not remove or alter the `communityGroups`/`playerGroups`
  semantic-key deduplication logic, the `ownerId`/`deletedAt` options, or any
  non-alias-related field remapping (`rules`, `templates`, `sessions`,
  `teams`, `pointEvents`, `gameReports`, `sessionReports`,
  `presenceRecords`, `drafts`, `communities`, `players`). Only remove the
  `aliasOnly` mode, the `aliases` option, and the `linkProposals` remapping
  block.
- No new TanStack Query, Dexie, XState, or Zod dependency (carried over from
  prior plans).
- Every task ends with the full suite green (`npm test`, which runs both the
  Node test runner unit suite and the Vitest UI suite), typecheck clean, and
  lint clean. Since these are removal tasks, "the test still passes" mostly
  means "the test I deleted alongside its source no longer runs, and
  everything that's left still passes" — that is the correct signal here,
  not a red flag.
- Windows/CRLF: this repo has `core.autocrlf=true`, which can make freshly
  checked-out `.sql` files and `schema.test.ts` appear as CRLF and make git
  report them as modified with an empty diff. If you see this, it is not a
  real change — do not "fix" it by editing content. It only matters (and
  only needs correcting) if it breaks a test that does raw-text regex
  matching against file contents.

---

### Task 1: Database — drop the old link/claim/alias system

**Files:**
- Create: `supabase/migrations/20260724000000_remove_player_link_proposal_system.sql`
- Modify: `supabase/migrations/schema.sql` (consolidated schema — apply the
  same removals/edits as the new migration, since this file represents the
  DB's final state after all migrations)
- Modify: `src/infra/supabase/schema.test.ts`

**Interfaces:**
- Consumes: nothing from other tasks (fully DB-side, no code dependency).
- Produces: a DB state with no `player_link_proposals`,
  `player_identity_claims`, `player_identity_aliases` tables and no
  `propose_player_link`, `approve_player_link`, `reject_player_link`,
  `cancel_my_link_proposal`, `merge_player_identity_claim`,
  `guard_aliased_player_reactivation` functions. Later tasks (2-4) delete
  the application/infra code that called these — this task does not need to
  wait for them, since dropping unused DB objects doesn't break code that
  hasn't been touched yet (the code calls Supabase RPCs by string name; it
  doesn't fail to compile just because the RPC no longer exists server-side
  — it would only fail at runtime, and by the time this whole plan merges,
  nothing calls it anymore).

**Important — one function must be MODIFIED, not dropped:**
`guard_active_player_reference()` is installed as a trigger on **four**
tables: `community_players`, `player_evaluations`, `player_avatar_proposals`
(all staying), and `player_link_proposals` (being dropped). Its job is to
reject any insert/update that references a soft-deleted or aliased player.
The alias-check half of its body only makes sense while
`player_identity_aliases` exists; the soft-delete check is still needed by
the three surviving tables. So:
- **Keep** the function and its triggers on `community_players`,
  `player_evaluations`, `player_avatar_proposals`.
- **Drop** its trigger from `player_link_proposals` (moot in practice, since
  that whole table is being dropped — no explicit `drop trigger` is needed,
  `drop table ... cascade` handles it).
- **Rewrite** the function body to remove the alias check and the
  `player_link_proposals`-specific status-transition exemption branch (that
  branch only existed to let `player_link_proposals.status` transition from
  `pending` to `approved`/`rejected`/`superseded` without re-validating the
  player reference — irrelevant once that table is gone).

- [ ] **Step 1: Write the new migration**

Create `supabase/migrations/20260724000000_remove_player_link_proposal_system.sql`:

```sql
-- Remove the old propose/approve player-link system. Plan A's claim-code
-- flow (player_claim_codes, migration 20260723230000) replaced its only
-- remaining production use case.

drop function if exists public.cancel_my_link_proposal(uuid);
drop function if exists public.reject_player_link(uuid, text);
drop function if exists public.approve_player_link(uuid);
drop function if exists public.propose_player_link(uuid);
drop function if exists public.merge_player_identity_claim(uuid, uuid);

drop trigger if exists trg_guard_aliased_player_reactivation on public.players;
drop function if exists public.guard_aliased_player_reactivation();

drop table if exists public.player_link_proposals cascade;
drop table if exists public.player_identity_aliases cascade;
drop table if exists public.player_identity_claims cascade;

-- guard_active_player_reference() stays: it still guards community_players,
-- player_evaluations, and player_avatar_proposals against referencing a
-- soft-deleted player. Only the alias-check and the (now-moot)
-- player_link_proposals status-transition exemption are removed from its
-- body.
create or replace function public.guard_active_player_reference()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted_at timestamptz;
begin
  select deleted_at
    into v_deleted_at
    from public.players
   where id = new.player_id
   for update;

  if v_deleted_at is not null then
    raise exception 'Player reference must target an active canonical player'
      using errcode = '23503';
  end if;

  return new;
end;
$$;

revoke execute on function public.guard_active_player_reference()
  from public, anon, authenticated;
grant execute on function public.guard_active_player_reference() to public;
```

(Match the exact `grant execute` target already used for this function in
`schema.sql` today — read the existing `create or replace function
public.guard_active_player_reference` block there before writing this step,
in case the grant target differs from `public`.)

- [ ] **Step 2: Apply the migration to the real Supabase project**

Use the Supabase MCP `apply_migration` tool (or `execute_sql` for a dry
check first) against project `csoslatxjjazrtrtylke`. The project is active
and currently has no real user data (reset before Plan A), so this is safe
to apply directly and verify — same approach used for Plan A's and Plan 1's
migrations.

Verify afterward with `list_tables` / `execute_sql` that:
- `player_link_proposals`, `player_identity_claims`,
  `player_identity_aliases` no longer exist
- `propose_player_link`, `approve_player_link`, `reject_player_link`,
  `cancel_my_link_proposal`, `merge_player_identity_claim`,
  `guard_aliased_player_reactivation` no longer exist
- `guard_active_player_reference` still exists and is still attached as a
  trigger to `community_players`, `player_evaluations`,
  `player_avatar_proposals`
- Run `get_advisors` (security + performance) and confirm no new advisories
  were introduced by this migration.

- [ ] **Step 3: Update the consolidated schema.sql**

`supabase/migrations/schema.sql` is a hand-maintained consolidated snapshot
of the DB's final state (see how Plan A's Task 1 added to it, and how Plan
1 originally built it). Apply the same removals here: delete the
`player_link_proposals` table definition (and its indexes/policies), the
`player_identity_claims`/`player_identity_aliases` table definitions (and
their indexes/policies/grants), the `merge_player_identity_claim`,
`propose_player_link`, `approve_player_link`, `reject_player_link`,
`cancel_my_link_proposal`, `guard_aliased_player_reactivation` function
definitions and any triggers exclusively tied to them, and replace the
`guard_active_player_reference` function body with the rewritten version
from Step 1 (keep its three surviving triggers on `community_players`,
`player_evaluations`, `player_avatar_proposals`; remove its fourth trigger
on `player_link_proposals`).

Use `grep -n` for each object name below to find every place it appears in
`schema.sql` before editing — some objects have multiple touch points
(table definition, indexes, RLS policies, grants/revokes, and any other
function that references them, e.g. `approve_player_link` calls
`merge_player_identity_claim`):

```
player_link_proposals
player_identity_claims
player_identity_aliases
propose_player_link
approve_player_link
reject_player_link
cancel_my_link_proposal
merge_player_identity_claim
guard_aliased_player_reactivation
guard_active_player_reference
```

- [ ] **Step 4: Update schema.test.ts contract tests**

`src/infra/supabase/schema.test.ts` has two kinds of assertions mixed
together — read the file's structure before editing:

1. **Assertions about individual historical migration files** (e.g. reading
   `20260722162234_account_identity_foundation.sql` into a variable like
   `accountIdentityMigration` and asserting its raw text). **Leave these
   unchanged** — migration files are historical and immutable; the fact
   that `20260722162234_account_identity_foundation.sql` once created
   `propose_player_link` remains true forever, even after a later migration
   drops it.
2. **Assertions about the final/consolidated schema state** (reading
   `schema.sql`, or a merged/combined artifact representing "the DB after
   all migrations" — look for the variable/helper used for this, likely
   named something like `baseSchema` or `artifact` in the existing tests
   near `guard_active_player_reference`). **These must be updated**: add
   assertions that the new migration's dropped objects are absent from this
   final state, and that `guard_active_player_reference`'s final body no
   longer contains the alias check or the `player_link_proposals` exemption
   branch, following the same test style/helpers (e.g. `extractSqlFunction`)
   already used elsewhere in this file for asserting a function's final
   body.

Add a new test (mirroring the existing per-migration test pattern in this
file) that reads the new migration file
(`20260724000000_remove_player_link_proposal_system.sql`) and asserts it
contains the six `drop function`/`drop table` statements and the rewritten
`guard_active_player_reference` body.

- [ ] **Step 5: Run the schema tests**

```bash
npm test
```

Docker/local Supabase remains unavailable in this environment (consistent
with every prior task) — these are static contract tests against SQL text,
not a live database. Expected: all tests pass, including the new/updated
ones from Step 4.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260724000000_remove_player_link_proposal_system.sql supabase/migrations/schema.sql src/infra/supabase/schema.test.ts
git commit -m "feat(db): drop player link proposal system"
```

---

### Task 2: UI & hook — remove the proposal feature from the app surface

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/account/AccountSyncView.tsx`
- Modify: `src/components/player/PlayerEditView.tsx`
- Modify: `src/components/admin/GestaoView.tsx`
- Delete: `src/hooks/usePlayerLinkProposals.ts`
- Delete: `src/hooks/usePlayerLinkProposals.spec.tsx`

**Interfaces:**
- Consumes: nothing from Task 1 (independent layer). Still calls
  `fetchAccountPlayerLinkQuery` (from `playerLinkUseCases.ts`) and
  `buildAccountPlayerLinkViewModel` (from `playerLinkViewModel.ts`) at the
  *start* of this task — those files are not deleted until Task 4. This
  task's job is to stop calling them and remove the props/state that only
  existed to support the proposal flow.
- Produces: `AccountSyncView`, `PlayerEditView`, `GestaoView` no longer
  accept `linkProposals`, `onProposeLink`, `onCancelLink`, `onReviewLink`,
  `onRefreshLinkProposals` props (Task 3 needs this — `useCloudSync`'s
  `CloudSyncDeps` interface loses `linkProposals`/`setLinkProposals`,
  consumed only by `App.tsx`, which after this task no longer produces
  them).

- [ ] **Step 1: Remove the hook and its wiring in App.tsx**

In `src/App.tsx`:
- Delete the import `import { usePlayerLinkProposals } from
  './hooks/usePlayerLinkProposals';`
- Delete the line `const proposals = usePlayerLinkProposals(play.rawPlayers,
  play.setPlayers, auth.user?.id ?? null);`
- Remove every reference to `proposals.*` (`proposals.linkProposals`,
  `proposals.setLinkProposals`,
  `proposals.handleRefreshPlayerLinkProposals`, and any propose/cancel/
  review handler it exposes) — search the file for `proposals\.` to find
  every call site, including the `useCloudSync` deps object and the props
  passed into `AccountSyncView`, `PlayerEditView`, `GestaoView`.

Delete `src/hooks/usePlayerLinkProposals.ts` and
`src/hooks/usePlayerLinkProposals.spec.tsx` entirely.

- [ ] **Step 2: Strip the proposal section from AccountSyncView**

In `src/components/account/AccountSyncView.tsx`:
- Remove the imports `fetchAccountPlayerLinkQuery` (from
  `../../application/playerLinkUseCases`) and
  `buildAccountPlayerLinkViewModel` (from
  `../../application/playerLinkViewModel`).
- Remove `PlayerLinkProposal` from the `../../types` import if nothing else
  in the file needs it after this edit.
- Remove these props from `AccountSyncViewProps` and the destructured
  parameter list: `linkProposals`, `onProposeLink`, `onCancelLink`.
- Remove this state: `selectedPlayerId`, `claiming`, `cancelling`,
  `cloudLinkedPlayer`, `cloudPendingProposal`, `checkingLinkedPlayer`,
  `linkedPlayerCheckFailed`.
- Remove the `useEffect` that calls `fetchAccountPlayerLinkQuery` (the block
  that sets `cloudLinkedPlayer`/`cloudPendingProposal`/
  `checkingLinkedPlayer`/`linkedPlayerCheckFailed`).
- Remove the `playerLinkVm` computation (`buildAccountPlayerLinkViewModel`
  call) and the `linkedPlayer`, `pendingProposal`, `pendingPlayer`,
  `availablePlayers` derived variables.
- Remove the JSX block starting at the `{/* Vínculo com Perfil de Atleta */}`
  comment through its closing — this whole section renders the
  linked/pending/available-players UI and the "Solicitar Vínculo"/"Cancelar"
  buttons. Everything above it (account header, sync stats, cloud health,
  sync controls) and below it (whatever comes after this section — check
  the file to confirm what follows) stays.

The rest of the component (backup/sync operations, error/success alerts,
recoverable-sync-issue banner) is unrelated to this removal and must be
left untouched.

- [ ] **Step 3: Strip the pending-proposal list from PlayerEditView**

In `src/components/player/PlayerEditView.tsx`:
- Remove `PlayerLinkProposal` from the `../../types` import if unused
  afterward.
- Remove the `linkProposals`, `onProposeLink`, `onReviewLink`,
  `onCancelLink` props from `PlayerEditViewProps` and the destructured
  parameter list. (Check whether `onUnlinkPlayer` is proposal-specific or a
  general "unlink an already-linked player" action unrelated to the
  propose/approve flow — read its usage before deciding; if it operates on
  an already-linked player via `unlink_player_user`/similar and doesn't
  touch `player_link_proposals`, it is NOT part of this removal and must
  stay.)
- Remove the `activeProposals` `useMemo` and any JSX that renders it
  (pending-proposal list/actions for the player being edited).

- [ ] **Step 4: Strip the moderation panel from GestaoView**

In `src/components/admin/GestaoView.tsx`:
- Remove `PlayerLinkProposal` from the `../../types` import if unused
  afterward.
- Remove `linkProposals`, `onReviewLink`, `onRefreshLinkProposals` from
  `GestaoViewProps` and the destructured parameter list.
- Remove the `pending` `useMemo`, `loadingPending`/`pendingError`/
  `actingReview` state, the `loadPending` callback and its `useEffect`, the
  `handleReview` callback, and the JSX section that renders the
  pending-approvals list with approve/reject buttons.
- Everything else in this file (role management via `useProfilesAdmin`) is
  unrelated and must be left untouched.

- [ ] **Step 5: Run the full suite, typecheck, lint**

```bash
npm test
npx tsc --noEmit
npm run lint:eslint
```

Expected: all pass. If any existing test for these three components or
`App.tsx` still references the removed props, update or delete that test
case (do not leave a test asserting behavior that no longer exists).

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx src/components/account/AccountSyncView.tsx src/components/player/PlayerEditView.tsx src/components/admin/GestaoView.tsx
git rm src/hooks/usePlayerLinkProposals.ts src/hooks/usePlayerLinkProposals.spec.tsx
git commit -m "feat(ui): remove player link proposal UI and hook"
```

---

### Task 3: Infra/sync — strip proposal/alias logic out of syncService.ts

**Files:**
- Modify: `src/infra/supabase/syncService.ts`
- Modify: `src/infra/supabase/syncService.test.ts`
- Modify: `src/infra/supabase/mappers.test.ts`
- Modify: `src/infra/supabase/upsertConflict.test.ts`
- Delete: `src/infra/supabase/playerLinkProposalCloudService.ts`
- Delete: `src/infra/supabase/playerIdentityAliasCloudService.ts`
- Delete: `src/infra/supabase/playerIdentityAliasCloudService.test.ts`

**Interfaces:**
- Consumes: nothing code-level from Task 2 (Task 2 stopped calling
  `playerLinkUseCases.ts`/`playerLinkViewModel.ts`, not `syncService.ts`
  directly — but doing UI first means no consumer breaks mid-plan).
- Produces: `LocalSyncPayload` (exported from this file, consumed by
  `useCloudSync.ts` and `cloudSyncUseCases.ts`) no longer has a
  `linkProposals` field. `consolidateDuplicateRecords`'s signature drops the
  `aliases`/`aliasOnly` options — its remaining options are `ownerId` and
  `deletedAt`. `syncService.ts` no longer imports from
  `../../application/playerClaim` (needed before Task 4 can delete that
  file) or from the two deleted cloud service files.

- [ ] **Step 1: Read the current file end-to-end**

`syncService.ts` is 1884 lines and the alias/proposal logic is interleaved
with the general sync flow (upload/download/two-way sync all call
`replayPlayerLinkProposalIntents` and `consolidateDuplicateRecords`
side-by-side with unrelated entity handling). Read the whole file before
editing — do not edit function-by-function from a list without seeing how
each call site fits into its surrounding flow, since some functions (e.g.
`consolidateDuplicateRecords`) are only *partially* removed.

- [ ] **Step 2: Remove alias/proposal-only functions and fields**

Remove entirely (verify each is not called from anywhere outside this file
first — `grep -rn <name> src/` — Task 2 already removed the only outside
callers of the application-layer functions, but these `syncService.ts`
internals are only called from within this file):
- `applyPlayerIdentityAliases` (exported function) and every call site
- `getPlayerLinkProposalSyncTimestamp`
- `isCloudBackedPlayerLinkProposal` (exported function) and every call site
- `isPendingPlayerLinkIntent`
- `hasPendingTerminalCloudReplay`
- `playerLinkProposalContentionKeys`
- `markLinkProposalSynced`
- `markLinkProposalPending`
- `shouldCancelRejectedProposal`
- `PlayerLinkProposalReplayError` (class)
- `PlayerLinkProposalReplayResult` (interface)
- `syncPlayerLinkProposalIntent`
- `replayPlayerLinkProposalIntents` and every call site (there are two call
  sites in the sync flow — search for `replayPlayerLinkProposalIntents(`)

Remove the `linkProposals?: PlayerLinkProposal[];` field from the
`LocalSyncPayload` interface, and every place that reads or writes
`local.linkProposals` / `payload.linkProposals` / `.linkProposals` on a
sync payload object outside of what's already covered above (search for
`\.linkProposals` after removing the functions above — a few remain in the
upload/download/merge flows, e.g. around
`mergeEntityLists(repairedLocal.linkProposals || [], cloud.linkProposals ||
[], ...)`).

Remove the imports:
```ts
import { playerLinkProposalCloudService } from './playerLinkProposalCloudService';
import { playerIdentityAliasCloudService } from './playerIdentityAliasCloudService';
```
and
```ts
import type { PlayerClaimResult, PlayerIdentityAlias } from '../../application/playerClaim';
```
and the `PlayerLinkProposal` import from `../../types` (if this file
imports it directly — check).

Remove every call site of `playerLinkProposalCloudService.*` and
`playerIdentityAliasCloudService.*` (propose/approve/reject/cancel/unlink/
fetchAll/fetchPendingForUser — these live inside the functions already
being removed above, plus a couple of standalone `fetchAll()` calls in the
download/sync flows that fetch aliases to pass into
`consolidateDuplicateRecords`/`applyPlayerIdentityAliases` — remove those
call sites too, since there's nothing left to pass them to).

- [ ] **Step 3: Narrow `consolidateDuplicateRecords` to general dedup only**

This is the one function that is **partially** kept — re-read the Global
Constraints section above before touching it. Remove:
- The `aliases?: PlayerIdentityAlias[]` and `aliasOnly?: boolean` fields
  from its `options` parameter type
- The `for (const alias of options.aliases || []) { ... }` block that
  builds `playerIdMap`/`duplicatePlayerIdMap`/`playerCloudIdMap` from
  aliases
- Every `options.aliasOnly ? ... : ...` ternary — collapse each one to just
  the non-`aliasOnly` branch (the `aliasOnly` branch exists purely to skip
  the general dedup steps when only applying aliases, which no longer
  happens)
- The `linkProposals` remapping block (the
  `local.linkProposals || []).map(...)` block building the returned
  `linkProposals` field) and its inclusion in the function's return value

Keep everything else: `communityIdMap`/`duplicateCommunityIdMap`/
`playerIdMap`/`duplicatePlayerIdMap`/`playerCloudIdMap`/
`canonicalPlayerCommunityIds` construction from `local.communities`/
`local.players` (the non-alias branch), `communityGroups`/`playerGroups`
computation via `groupActiveDuplicates`, and every entity remapping
(`communities`, `players`, `rules`, `templates`, `sessions`, `teams`,
`pointEvents`, `gameReports`, `sessionReports`, `presenceRecords`,
`drafts`) — none of that is alias-specific.

- [ ] **Step 4: Delete the two cloud service files**

```bash
git rm src/infra/supabase/playerLinkProposalCloudService.ts
git rm src/infra/supabase/playerIdentityAliasCloudService.ts
git rm src/infra/supabase/playerIdentityAliasCloudService.test.ts
```

- [ ] **Step 5: Update syncService.test.ts**

This file has ~90 references to the removed surface (proposal replay
scenarios, alias application scenarios, mocked `playerLinkProposalCloudService`/
`playerIdentityAliasCloudService` calls). Delete every `test(...)`/`it(...)`
block whose purpose is testing proposal-replay or alias-application
behavior (look for blocks that mock `playerLinkProposalCloudService.propose`/
`.approve`/`.reject`/`.cancel`/`.unlink`/`.fetchAll` or
`playerIdentityAliasCloudService.fetchAll`). Remove the top-level imports of
both cloud services and the `playerIdentityAliasCloudService.fetchAll =
async () => []` default-mock line near the top of the file. Keep every test
that exercises `consolidateDuplicateRecords`'s general (non-alias) dedup
behavior unchanged — these are the regression guard named in the Global
Constraints.

- [ ] **Step 6: Update mappers.test.ts and upsertConflict.test.ts**

`mappers.test.ts` imports something from `./playerLinkProposalCloudService`
(check what — likely a shared row-mapping helper or type used generically
for cloud row mapping tests; if it's proposal-specific, delete that test
case; if the imported symbol is actually general-purpose and just happened
to live in that file, this is a signal the symbol needs a new home — flag
this to the plan owner rather than silently relocating it, since that's a
design decision outside this plan's scope).

`upsertConflict.test.ts` references `./playerLinkProposalCloudService.ts`
via a `new URL(...)` — likely a dynamic-import-based test asserting
something about the file's module structure or upsert conflict target
config. Read the specific test before deciding whether to delete it
outright or adjust it to a still-existing file that has the same
conflict-target pattern (e.g. `playerIdentityAliasCloudService.ts` is also
being deleted, so this test's whole premise may be about to disappear
entirely — read `src/infra/supabase/upsertConflict.test.ts` around this
reference to judge).

- [ ] **Step 7: Run the full suite, typecheck, lint**

```bash
npm test
npx tsc --noEmit
npm run lint:eslint
```

- [ ] **Step 8: Commit**

```bash
git add src/infra/supabase/syncService.ts src/infra/supabase/syncService.test.ts src/infra/supabase/mappers.test.ts src/infra/supabase/upsertConflict.test.ts
git rm src/infra/supabase/playerLinkProposalCloudService.ts src/infra/supabase/playerIdentityAliasCloudService.ts src/infra/supabase/playerIdentityAliasCloudService.test.ts
git commit -m "feat(sync): remove player link proposal replay and alias application"
```

---

### Task 4: Application/domain layer — delete the use-case and view-model files

**Files:**
- Delete: `src/application/playerLinkUseCases.ts`, `src/application/playerLinkUseCases.test.ts`
- Delete: `src/application/playerClaim.ts`, `src/application/playerClaim.test.ts`
- Delete: `src/application/playerLinkViewModel.ts`, `src/application/playerLinkViewModel.test.ts`
- Delete: `src/domain/playerLink.ts`, `src/domain/playerLink.test.ts`
- Modify: `src/application/index.ts`
- Modify: `src/domain/index.ts`

**Interfaces:**
- Consumes: nothing — by the end of Task 2, `AccountSyncView.tsx` no longer
  imports `fetchAccountPlayerLinkQuery`/`buildAccountPlayerLinkViewModel`;
  by the end of Task 3, `syncService.ts` no longer imports
  `PlayerClaimResult`/`PlayerIdentityAlias` from `playerClaim.ts`. Confirm
  both with `grep -rn` before deleting — if anything still imports from
  these four files, stop and re-check Tasks 2/3 rather than deleting
  anyway.
- Produces: nothing (terminal deletion for this layer).

- [ ] **Step 1: Verify no remaining consumers**

```bash
grep -rn "playerLinkUseCases\|playerClaim\|playerLinkViewModel\|domain/playerLink" src/ --include=*.ts --include=*.tsx | grep -v "src/application/playerLinkUseCases\|src/application/playerClaim\|src/application/playerLinkViewModel\|src/domain/playerLink\|src/application/index.ts\|src/domain/index.ts"
```

Expected: no output. If there is output, that file still needs to stop
importing from one of these four before this task can proceed — do not
delete out from under a live import.

- [ ] **Step 2: Delete the four source files and their tests**

```bash
git rm src/application/playerLinkUseCases.ts src/application/playerLinkUseCases.test.ts
git rm src/application/playerClaim.ts src/application/playerClaim.test.ts
git rm src/application/playerLinkViewModel.ts src/application/playerLinkViewModel.test.ts
git rm src/domain/playerLink.ts src/domain/playerLink.test.ts
```

- [ ] **Step 3: Remove their exports**

In `src/application/index.ts`, remove:
```ts
export * from './playerClaim';
export * from './playerLinkUseCases';
export * from './playerLinkViewModel';
```

In `src/domain/index.ts`, remove the `export * from './playerLink';` line
(read the file first to confirm the exact export statement).

- [ ] **Step 4: Run the full suite, typecheck, lint**

```bash
npm test
npx tsc --noEmit
npm run lint:eslint
```

- [ ] **Step 5: Commit**

```bash
git add src/application/index.ts src/domain/index.ts
git commit -m "feat(app): delete player link application and domain layer"
```

---

### Task 5: Types & remaining sync plumbing

**Files:**
- Modify: `src/types.ts`
- Modify: `src/shared/types/player.ts`
- Modify: `src/application/cloudSyncPayload.ts`
- Modify: `src/hooks/useCloudSync.ts`
- Modify: `src/logic/migrations.ts`
- Modify: `src/storage/localStorageRepository.ts`

**Interfaces:**
- Consumes: nothing — by the end of Task 3, `LocalSyncPayload` (defined in
  `syncService.ts`) no longer has a `linkProposals` field, so everything
  destructuring/passing it here is already dead weight, safe to remove.
- Produces: `PlayerLinkProposal` type no longer exists anywhere in `src/`.
  This is the final task — after it, the Completion Gate's "no references
  anywhere" check should pass.

- [ ] **Step 1: Remove the type definition and re-export**

In `src/shared/types/player.ts`, delete the `export interface
PlayerLinkProposal { ... }` block (around line 99 — confirm exact
boundaries by reading the file, since interfaces in this file may be
adjacent to others).

In `src/types.ts`, remove `PlayerLinkProposal,` from the re-export list at
line 30 (inside the `export type { ... } from './shared/types/player';`
block) — leave every other type in that block untouched.

- [ ] **Step 2: Strip linkProposals from cloudSyncPayload.ts**

Read `src/application/cloudSyncPayload.ts` — it has a `linkProposals:
PlayerLinkProposal[]` field (around line 32) in whatever interface/type it
defines for the payload-building input, and a `linkProposals:
collections.linkProposals,` line (around line 49) that forwards it into the
built payload. Remove both, and the `PlayerLinkProposal` import.

- [ ] **Step 3: Strip linkProposals from useCloudSync.ts**

In `src/hooks/useCloudSync.ts`:
- Remove `PlayerLinkProposal` from the `../types` import (line 34).
- Remove `linkProposals: PlayerLinkProposal[];` and `setLinkProposals:
  (value: PlayerLinkProposal[]) => void;` from the `CloudSyncDeps`
  interface (lines 75-76).
- Remove the block:
  ```ts
  if (normalized.linkProposals) {
    deps.setLinkProposals(normalized.linkProposals);
  }
  ```
  (lines 117-119) from `applyResult`.

- [ ] **Step 4: Remove the local-storage migration step in migrations.ts**

In `src/logic/migrations.ts`, remove the `playerLinkProposals` local
variable (`const playerLinkProposals = loadFromStorage<any[]>(
STORAGE_KEYS.playerLinkProposals, []);`, around line 703), the
`playerLinkProposals.forEach((p) => register(p.id, undefined));` call
(around line 722), the `migratedPlayerLinkProposals` derivation (around
line 969), and the `saveToStorage(STORAGE_KEYS.playerLinkProposals,
migratedPlayerLinkProposals);` call (around line 1002). Read the
surrounding migration-step function first — this is one step inside a
larger versioned migration chain; remove exactly this step's lines without
disturbing the steps before or after it (per the explicit decision that
this legacy migration step is being removed, not the whole chain).

- [ ] **Step 5: Remove the storage key**

In `src/storage/localStorageRepository.ts`, remove the `playerLinkProposals:
'vpg_player_link_proposals',` entry from `STORAGE_KEYS` (line 20).

- [ ] **Step 6: Verify nothing remains**

```bash
grep -rn "PlayerLinkProposal\|PlayerIdentityAlias\|PlayerIdentityClaim\|linkProposals\|playerLinkProposals" src/
grep -rn "player_link_proposals\|player_identity_claims\|player_identity_aliases\|propose_player_link\|approve_player_link\|reject_player_link\|cancel_my_link_proposal\|merge_player_identity_claim\|guard_aliased_player_reactivation" supabase/migrations/schema.sql
```

Expected: no output from either command (the `schema.test.ts` file itself
will still contain these strings inside its historical-migration
assertions from Task 1 Step 4 — that's correct and expected, not a leak;
the second grep targets `schema.sql`, the final-state file, specifically to
exclude that noise).

- [ ] **Step 7: Run the full suite, typecheck, lint**

```bash
npm test
npx tsc --noEmit
npm run lint:eslint
```

- [ ] **Step 8: Commit**

```bash
git add src/types.ts src/shared/types/player.ts src/application/cloudSyncPayload.ts src/hooks/useCloudSync.ts src/logic/migrations.ts src/storage/localStorageRepository.ts
git commit -m "feat(types): remove PlayerLinkProposal type and remaining sync plumbing"
```

---

## Completion Gate

- [ ] `grep -rn "PlayerLinkProposal\|PlayerIdentityAlias\|PlayerIdentityClaim\|linkProposals" src/` returns nothing outside of `schema.test.ts`'s historical-migration assertions.
- [ ] `grep -rn "player_link_proposals\|player_identity_claims\|player_identity_aliases\|propose_player_link\|approve_player_link\|reject_player_link\|cancel_my_link_proposal\|merge_player_identity_claim\|guard_aliased_player_reactivation" supabase/migrations/schema.sql` returns nothing.
- [ ] `guard_active_player_reference` still exists in `schema.sql`, still guards `community_players`, `player_evaluations`, `player_avatar_proposals`, and no longer references aliases or `player_link_proposals`.
- [ ] `consolidateDuplicateRecords`'s general (non-alias) dedup path is unchanged in behavior; its existing non-alias tests pass without modification (diff review: confirm no non-alias-related lines were touched).
- [ ] Full suite green (`npm test`), typecheck clean (`npx tsc --noEmit`), lint clean (`npm run lint:eslint`).
- [ ] The new DB migration has been applied to and verified against the real Supabase project (`csoslatxjjazrtrtylke`).
