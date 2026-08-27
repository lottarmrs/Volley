# Remove Player Link Proposal System — Design (Plan B)

## Context

Plan A (Athlete Claim Code, merged into `main` at `6c14dd6`) replaced the only
production use case that needed the old propose/review player-link system:
accounts and players are now born together, and a guest player created by an
admin/moderator/organizer is claimed by short code at signup instead of by
proposal + review.

The old system — `player_link_proposals`, `player_identity_claims`,
`player_identity_aliases`, `merge_player_identity_claim`, and the
`propose_player_link`/`approve_player_link`/`reject_player_link`/
`cancel_my_link_proposal` RPCs, plus their application/UI consumers — solves a
more general "merge two players' histories together" problem that the product
no longer needs. This plan removes it.

The production Supabase project (`csoslatxjjazrtrtylke`) was fully reset
before Plan A began (see Plan A's design doc) and remains empty of real user
data, so there is no legacy-data migration concern for the DB removal in this
plan either.

## Global Constraints

- `consolidateDuplicateRecords` in `src/infra/supabase/syncService.ts` is a
  **general-purpose** dedup engine: it also merges duplicate
  communities/players that arise from ordinary offline conflicts (same
  semantic key created twice locally), on every sync — not just from the old
  link-proposal system. **This general path must be preserved exactly as-is.**
  Only its alias-specific parts are removed: the `aliasOnly` mode, the
  `aliases` option, `applyPlayerIdentityAliases`, and the `linkProposals`
  field remapping.
- `src/logic/migrations.ts` contains a versioned, historical local-storage
  migration step that reads old `playerLinkProposals` data forward. Per
  explicit decision, this plan removes it too, accepting that a device still
  carrying very old local data skips this step (the data is simply dropped
  rather than migrated — harmless, since the feature it fed no longer
  exists).
- Do not add TanStack Query, Dexie, XState, or Zod (carried over from Plan 1
  and Plan A — still applies).
- No new capability is introduced by this plan. Every task is a deletion or a
  narrowing of existing code. If a step in the implementation plan looks like
  it's adding something new, that's a signal the task is mis-scoped.

## Removal Scope

### 1. Database (new migration)

Drop, in dependency order:
- Tables: `player_link_proposals`, `player_identity_claims`,
  `player_identity_aliases`
- Functions: `propose_player_link`, `approve_player_link`,
  `reject_player_link`, `cancel_my_link_proposal`,
  `merge_player_identity_claim`, `guard_aliased_player_reactivation`
- Their triggers

**Correction found during implementation planning:** `guard_active_player_reference`
is **not** dropped, despite the removal list above's first draft saying so.
It is installed as a trigger on four tables: `community_players`,
`player_evaluations`, `player_avatar_proposals` (all staying), and
`player_link_proposals` (being dropped). Its job — reject a reference to a
soft-deleted or aliased player — is still needed by the three surviving
tables. It is **rewritten** instead: the alias-check half of its body and
the `player_link_proposals`-specific status-transition exemption branch are
removed (both only made sense while that table/the alias table existed);
the soft-delete check and its triggers on the three surviving tables stay
untouched.

`guard_player_user_id`, `guard_player_account_identity_history`,
`guard_player_account_identity_delete`,
`handle_player_soft_delete_user_unlink`, `unlink_player_user` are unaffected
— they guard `players.user_id` mutation in general (including the claim-code
path added in Plan A), not proposal review specifically, and remain in
place.

Update `supabase/migrations/schema.sql` (consolidated schema) and
`src/infra/supabase/schema.test.ts` (contract tests) to reflect removal —
tests should assert the dropped objects are genuinely absent, not just stop
asserting their presence.

### 2. Infra / sync (`src/infra/supabase/syncService.ts`, currently 1884 lines)

Remove:
- `applyPlayerIdentityAliases` function and all call sites
- The `aliasOnly`/`aliases` branches inside `consolidateDuplicateRecords`
  (function signature loses the `aliases`/`aliasOnly` options; its general
  duplicate-community/duplicate-player merge logic is otherwise untouched)
- Proposal-replay machinery: `syncPlayerLinkProposalIntent`,
  `replayPlayerLinkProposalIntents`, `PlayerLinkProposalReplayError`,
  `markLinkProposalSynced`, `markLinkProposalPending`,
  `shouldCancelRejectedProposal`, `isCloudBackedPlayerLinkProposal`,
  `isPendingPlayerLinkIntent`, `hasPendingTerminalCloudReplay`,
  `playerLinkProposalContentionKeys`, `getPlayerLinkProposalSyncTimestamp`,
  and the `linkProposals` remapping block inside
  `consolidateDuplicateRecords`
- The `linkProposals` field from the `LocalSyncPayload` type and every read/
  write of it in the upload/download/merge sync flows

Delete entirely: `src/infra/supabase/playerLinkProposalCloudService.ts`,
`src/infra/supabase/playerIdentityAliasCloudService.ts` (+
`playerIdentityAliasCloudService.test.ts`).

### 3. Application / domain layer

Delete entirely (+ their test files):
- `src/application/playerLinkUseCases.ts`
- `src/application/playerClaim.ts`
- `src/application/playerLinkViewModel.ts`
- `src/domain/playerLink.ts`

Remove their exports from `src/application/index.ts`.

### 4. Types & sync plumbing

- Remove `PlayerLinkProposal` (and any `PlayerIdentityAlias`/
  `PlayerIdentityClaim` types) from `src/types.ts` and
  `src/shared/types/player.ts`.
- Remove the `linkProposals` field and its accessor from
  `src/application/cloudSyncPayload.ts` and `src/hooks/useCloudSync.ts`
  (`linkProposals: PlayerLinkProposal[]`, `setLinkProposals`, and the
  `normalized.linkProposals` handling).
- Remove the `playerLinkProposals` local-storage migration step from
  `src/logic/migrations.ts` (see Global Constraints).
- Remove the `linkProposals`/related storage key from
  `src/storage/localStorageRepository.ts`.

### 5. UI

- `src/components/account/AccountSyncView.tsx`: remove the "Vínculo com
  Perfil de Atleta" section and the `linkProposals` prop.
- `src/components/player/PlayerEditView.tsx`: remove the pending-proposal
  list for the player being edited and the `linkProposals` prop.
- `src/components/admin/GestaoView.tsx`: remove the pending-proposal
  moderation panel (`linkProposals`, `onRefreshLinkProposals`) and its
  approve/reject actions.
- `src/App.tsx`: remove `linkProposals` prop-threading to the above three
  components.

## Testing

- Schema contract tests (`schema.test.ts`): assert the six dropped DB
  objects and three dropped tables are genuinely absent from the
  consolidated `schema.sql`.
- `syncService.test.ts`, `mappers.test.ts`, `upsertConflict.test.ts`: remove
  link-proposal-specific test cases; general (non-alias) dedup test cases
  for `consolidateDuplicateRecords` must continue to pass unchanged —
  these are the regression guard for the Global Constraint above.
- Delete wholesale: `playerLinkUseCases.test.ts`, `playerClaim.test.ts`,
  `playerIdentityAliasCloudService.test.ts`, `playerLinkViewModel.test.ts`,
  `domain/playerLink.test.ts`, `usePlayerLinkProposals.spec.tsx` (and delete
  `src/hooks/usePlayerLinkProposals.ts` itself, + its RPC-driven UI
  consumers already listed above).
- Manual/real-Postgres verification against the (currently empty, active)
  `Panelinha` Supabase project once implemented, same as Plan A.

## Completion Gate

- No references to `PlayerLinkProposal`, `PlayerIdentityAlias`,
  `PlayerIdentityClaim`, `linkProposals`, `playerLinkProposals`, or any of
  the six removed RPC/function names remain anywhere in `src/` or in the DB
  schema (`schema.sql`).
- `consolidateDuplicateRecords`'s general (non-alias) dedup path is
  unchanged in behavior; its existing non-alias tests pass without
  modification.
- Full test suite green; typecheck and lint clean.
