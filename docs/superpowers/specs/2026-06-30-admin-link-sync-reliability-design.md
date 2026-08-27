# Admin Link Approval and Offline Sync Reliability

## Context

This slice continues the Reliability track of the framework work. The previous application-layer slice introduced player link use cases, but two important seams remain incomplete:

- `GestaoView` still calls `playerLinkProposalCloudService` directly for pending link approvals.
- `syncService` retries local player link proposals, but it mostly treats them as "create proposal" operations and does not preserve the whole link lifecycle when approve, reject, cancel, or unlink happens offline or during a cloud failure.

The goal is to make the player link lifecycle reliable without adding a full explicit outbox table yet.

## Decision

Use the current `PlayerLinkProposal` and `Player` fields as an implicit outbox now, while shaping the code so it can later move to an explicit `syncOutbox` model.

This means:

- `syncStatus: 'pending'` represents an unconfirmed local intent.
- `status` on `PlayerLinkProposal` tells sync which player-link operation must be reconciled.
- a linked player whose `userId` was removed locally and still has `syncStatus: 'pending'` represents an unlink intent when it has a `cloudId`.
- cloud writes for player-link changes continue to go through Supabase RPCs, not direct table writes.

## Scope

Included:

- Route `GestaoView` approval/rejection through the application layer.
- Keep the admin screen backed by local `linkProposals` state plus explicit cloud refresh.
- Fix `reviewPlayerLinkCommand` so failed cloud review leaves a retryable local state.
- Extend `syncService` to reconcile pending player-link lifecycle intents:
  - propose
  - approve
  - reject or cancel
  - supersede as a consequence of approval
  - unlink
- Add focused tests for the above behaviors.

Excluded for this slice:

- No new Supabase migration unless implementation proves a policy or RPC gap.
- No explicit `syncOutbox` entity yet.
- No broad redesign of all sync domains.
- No visual redesign of the admin screen beyond small state and error handling adjustments needed for reliability.

## Architecture

### Admin UI Boundary

`GestaoView` should not import `playerLinkProposalCloudService`.

Instead, `App` passes:

- `linkProposals`
- `onReviewLink`
- optionally a refresh callback if the screen needs to pull the latest cloud proposals

`GestaoView` filters and renders pending proposals from application state. When the admin approves or rejects, it calls `onReviewLink(proposalId, action)`. The hook `usePlayerLinkProposals` remains responsible for calling `reviewPlayerLinkCommand`, updating local state, and persisting to local storage.

Cloud refresh can still be supported, but it should hydrate local state instead of bypassing the application layer.

### Application Layer Boundary

`reviewPlayerLinkCommand` keeps doing the local domain mutation first:

- approve links the player locally and supersedes competing pending proposals.
- reject marks the proposal rejected locally.

Then it attempts the matching Supabase RPC if the proposal is cloud-backed.

If the RPC succeeds, the reviewed proposal becomes `syncStatus: 'synced'`.

If the RPC fails, the reviewed proposal must remain `syncStatus: 'pending'` and the command returns a recoverable issue. This is the retry signal for sync. It must not return as `synced`.

For a local-only proposal, review stays local and pending until sync can create the cloud proposal and replay the review operation.

### Sync Boundary

`syncService` treats player-link records as an implicit outbox:

#### Pending proposal

For a proposal with `status: 'pending'` and no cloud-backed id, call `propose_player_link`. On success, replace the local temporary id with the returned cloud id and mark it synced.

#### Approved proposal

If the approved proposal is not cloud-backed, first call `propose_player_link` for the player. Then call `approve_player_link` for the cloud proposal id. On success, mark the proposal synced and ensure the local player remains linked to the proposal user.

If the proposal is already cloud-backed and `syncStatus: 'pending'`, call `approve_player_link` directly.

#### Rejected proposal

If the rejected proposal is cloud-backed and `syncStatus: 'pending'`, call the review RPC that matches the local action:

- admin review should call `reject_player_link`.
- user cancellation should call `cancel_my_link_proposal`.

The current model only stores `status: 'rejected'`, so implementation should infer cancellation when `reviewedBy === userId`; otherwise it should use admin rejection. This keeps the model stable for now while leaving room for a future explicit operation type.

If the rejected proposal was never created in the cloud, sync may create then reject/cancel it only when doing so preserves server invariants. If the server rejects this because the original pending proposal no longer exists or permissions changed, sync keeps the local record and reports a recoverable issue instead of dropping local history.

#### Superseded proposal

Superseding is normally a server-side consequence of `approve_player_link`. Sync should not directly write `superseded` into `player_link_proposals`.

For cloud-backed superseded proposals, sync can mark them synced after download confirms the cloud state or after the approval operation that caused superseding succeeds.

For local-only superseded proposals, sync keeps them as local history unless they are part of an approval reconciliation that can be represented through the server RPC.

#### Unlink

Player upsert must not be expected to clear `players.user_id`, because the player mapper intentionally does not write `user_id`.

If a player has:

- `cloudId`
- no local `userId`
- `syncStatus: 'pending'`

then sync should call `unlink_player_user(player.cloudId)` before marking that player synced. This keeps unlink on the same RPC-safe path as approve.

## Error Handling

Failures should be recoverable and retryable:

- keep `syncStatus: 'pending'` on failed link lifecycle operations.
- call `options.onIssue` with enough context to identify the failed operation.
- never silently downgrade a failed cloud write to `synced`.
- avoid direct table writes that bypass RLS or Supabase RPC invariants.

Conflicts should prefer server authority after a successful download, but local pending intentions should not be erased until sync either successfully applies them or records a recoverable failure.

## Tests

Add or update tests in:

- `src/application/playerLinkUseCases.test.ts`
- `src/services/supabase/syncService.test.ts`
- optionally a light admin component/hook test if the existing test setup supports it cleanly

Required cases:

- `reviewPlayerLinkCommand` leaves an approved/rejected proposal as `pending` when cloud review fails.
- `GestaoView` no longer imports or calls `playerLinkProposalCloudService`.
- pending local proposal still calls `propose`.
- local approved proposal calls `propose` then `approve`.
- cloud-backed approved pending proposal calls `approve`.
- cloud-backed rejected pending proposal calls `reject` or `cancel` based on reviewer.
- failed sync keeps the proposal pending and reports an issue.
- pending unlink calls `unlink_player_user` instead of relying on player upsert to clear `user_id`.

## Migration Path To Explicit Outbox

This design intentionally makes each implicit intent resemble a future explicit outbox command:

- `PlayerLinkProposal(status: 'pending', syncStatus: 'pending')` maps to `player_link.propose`.
- `PlayerLinkProposal(status: 'approved', syncStatus: 'pending')` maps to `player_link.approve`.
- `PlayerLinkProposal(status: 'rejected', syncStatus: 'pending')` maps to `player_link.reject` or `player_link.cancel`.
- `Player(syncStatus: 'pending', userId: undefined, cloudId)` maps to `player_link.unlink`.

Later, these can become records like:

- `id`
- `operation`
- `entityType`
- `entityId`
- `payload`
- `status`
- `attemptCount`
- `lastError`
- `createdAt`
- `updatedAt`

The current slice should avoid locking business logic inside `syncService` in a way that makes this migration painful. Helper functions should be named around lifecycle operations, not around incidental field checks.

## Acceptance Criteria

- Admin approval/rejection uses the same application-layer command path as the rest of the app.
- Offline or failed admin review remains visible to sync as a pending local intent.
- Sync can replay propose, approve, reject/cancel, and unlink through Supabase RPCs.
- No direct writes to `player_link_proposals` are introduced.
- Existing player/community sync behavior remains unchanged outside the link lifecycle.
- Unit tests cover successful replay and recoverable failure paths.
