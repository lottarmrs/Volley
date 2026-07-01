# Admin Link Sync Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make admin player-link approval/rejection and the offline sync cycle reliable through the existing application layer and Supabase RPCs.

**Architecture:** Use `PlayerLinkProposal` as the implicit outbox for propose/approve/reject/cancel. Add one minimal player-level intent marker for unlink so sync does not confuse ordinary unlinked players with unlink operations. Keep Supabase writes routed through existing RPCs and keep `GestaoView` free of direct cloud service calls.

**Tech Stack:** React 19, TypeScript, Vite, node:test, Vitest, Supabase JS, existing local storage and sync services.

---

## File Structure

- Modify `src/types.ts`
  - Add a minimal optional `pendingUserLinkAction?: 'unlink'` marker to `Player`.
- Modify `src/application/playerLinkUseCases.ts`
  - Keep failed admin review retryable.
  - Mark and clear unlink intent from `unlinkPlayerCommand`.
  - Add an admin refresh query wrapper for fetching cloud proposals.
- Modify `src/application/playerLinkUseCases.test.ts`
  - Add regression tests for failed review sync status.
  - Add tests for unlink intent.
  - Add a refresh-query recoverable failure test.
- Modify `src/services/supabase/syncService.ts`
  - Extract player-link lifecycle sync helpers.
  - Replay pending proposal intents through `propose`, `approve`, `reject`, and `cancel`.
  - Replay player unlink intent through `unlink`.
- Modify `src/services/supabase/syncService.test.ts`
  - Add focused tests for proposal lifecycle replay and unlink replay.
- Modify `src/hooks/usePlayerLinkProposals.ts`
  - Add cloud refresh through the application-layer query.
  - Merge cloud proposals into local state without overwriting pending local intents.
- Modify `src/components/admin/GestaoView.tsx`
  - Replace direct Supabase proposal calls with props.
- Modify `src/App.tsx`
  - Pass `linkProposals`, `onReviewLink`, and refresh handler into `GestaoView`.

## Task 0: Prepare Implementation Workspace

**Files:**
- No source edits.

- [ ] **Step 1: Create an isolated worktree**

Run from `C:\Users\Matheus Silva\antigravity\Volley`:

```powershell
git worktree add .worktrees\admin-link-sync-reliability -b codex/admin-link-sync-reliability main
```

Expected: a new worktree at `.worktrees\admin-link-sync-reliability` on branch `codex/admin-link-sync-reliability`.

- [ ] **Step 2: Enter the worktree**

```powershell
Set-Location .worktrees\admin-link-sync-reliability
```

Expected: current directory is `C:\Users\Matheus Silva\antigravity\Volley\.worktrees\admin-link-sync-reliability`.

- [ ] **Step 3: Run focused baseline tests**

```powershell
node --import tsx --test src/application/playerLinkUseCases.test.ts src/services/supabase/syncService.test.ts
```

Expected: PASS. If this fails before changes, stop and inspect the failure first.

## Task 1: Keep Failed Review Retryable And Mark Unlink Intent

**Files:**
- Modify: `src/types.ts`
- Modify: `src/application/playerLinkUseCases.ts`
- Test: `src/application/playerLinkUseCases.test.ts`

- [ ] **Step 1: Add failing application-layer tests**

In `src/application/playerLinkUseCases.test.ts`, update the import to include the refresh query:

```ts
import {
  cancelPlayerLinkCommand,
  fetchAccountPlayerLinkQuery,
  fetchAllPlayerLinkProposalsQuery,
  proposePlayerLinkCommand,
  reviewPlayerLinkCommand,
  unlinkPlayerCommand,
} from './playerLinkUseCases';
```

Add these tests after the existing `reviewPlayerLinkCommand approves proposal and supersedes competing pending proposals` test:

```ts
test('reviewPlayerLinkCommand keeps approved cloud proposal pending when cloud approve fails', async () => {
  const players = [makePlayer('player-1', { cloudId: 'cloud-player-1', userId: undefined })];
  const result = await reviewPlayerLinkCommand(
    {
      players,
      linkProposals: [proposal({ syncStatus: 'synced' })],
      currentUserId: 'reviewer-1',
      proposalId: 'proposal-1',
      action: 'approve',
      nowIso: now,
    },
    {
      approve: async () => {
        throw new Error('offline');
      },
    },
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.players?.[0].userId, 'user-1');
  assert.equal(result.value.linkProposals[0].status, 'approved');
  assert.equal(result.value.linkProposals[0].syncStatus, 'pending');
  assert.equal(result.issues?.[0].code, 'cloud_unavailable');
});

test('reviewPlayerLinkCommand keeps rejected cloud proposal pending when cloud reject fails', async () => {
  const players = [makePlayer('player-1', { cloudId: 'cloud-player-1', userId: undefined })];
  const result = await reviewPlayerLinkCommand(
    {
      players,
      linkProposals: [proposal({ syncStatus: 'synced' })],
      currentUserId: 'reviewer-1',
      proposalId: 'proposal-1',
      action: 'reject',
      nowIso: now,
    },
    {
      reject: async () => {
        throw new Error('offline');
      },
    },
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.linkProposals[0].status, 'rejected');
  assert.equal(result.value.linkProposals[0].syncStatus, 'pending');
  assert.equal(result.issues?.[0].code, 'cloud_unavailable');
});
```

Extend the existing `unlinkPlayerCommand clears player user id and reports recoverable cloud issue` test with this assertion:

```ts
assert.equal(result.value.players?.[0].pendingUserLinkAction, 'unlink');
```

Add this success-path unlink test after it:

```ts
test('unlinkPlayerCommand clears unlink intent when cloud unlink succeeds', async () => {
  const result = await unlinkPlayerCommand(
    {
      players: [makePlayer('player-1', { userId: 'user-1', cloudId: 'cloud-player-1' })],
      linkProposals: [proposal()],
      currentUserId: 'reviewer-1',
      playerId: 'player-1',
      nowIso: now,
    },
    {
      unlink: async () => undefined,
    },
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.players?.[0].userId, undefined);
  assert.equal(result.value.players?.[0].pendingUserLinkAction, undefined);
  assert.equal(result.value.players?.[0].syncStatus, 'synced');
});
```

Add this refresh query test near the existing fetch query test:

```ts
test('fetchAllPlayerLinkProposalsQuery returns recoverable issue on cloud failure', async () => {
  const result = await fetchAllPlayerLinkProposalsQuery({
    fetchAll: async () => {
      throw new Error('network down');
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.value.linkProposals, []);
  assert.equal(result.issues?.[0].code, 'cloud_unavailable');
});
```

- [ ] **Step 2: Run the application tests and verify failure**

```powershell
node --import tsx --test src/application/playerLinkUseCases.test.ts
```

Expected: FAIL because `fetchAllPlayerLinkProposalsQuery` and `pendingUserLinkAction` do not exist, and failed review currently returns `syncStatus: 'synced'`.

- [ ] **Step 3: Add the unlink intent type**

In `src/types.ts`, update `Player` near `userId?: string;`:

```ts
  userId?: string;
  pendingUserLinkAction?: 'unlink';
}
```

- [ ] **Step 4: Implement retryable review and refresh query**

In `src/application/playerLinkUseCases.ts`, add this interface after `PlayerLinkQueryGateway`:

```ts
export interface PlayerLinkAdminQueryGateway {
  fetchAll: () => Promise<PlayerLinkProposal[]>;
}
```

Add this gateway after `supabasePlayerLinkQueryGateway`:

```ts
export const supabasePlayerLinkAdminQueryGateway: PlayerLinkAdminQueryGateway = {
  fetchAll: playerLinkProposalCloudService.fetchAll,
};
```

In the `catch` block inside `reviewPlayerLinkCommand`, replace the returned `linkProposals` with a pending-marked list:

```ts
      linkProposals = markProposalPending(linkProposals, input.proposalId);
      return appOk({ players, linkProposals }, [
        recoverableIssue(
          'cloud_unavailable',
          'Revisao salva localmente; a nuvem sera sincronizada depois.',
          error,
        ),
      ]);
```

In `unlinkPlayerCommand`, change `const players` to `let players`, and set the unlink marker in the local mutation:

```ts
  let players: Player[] = input.players.map(
    (item): Player =>
      item.id === input.playerId
        ? {
            ...item,
            userId: undefined,
            pendingUserLinkAction: item.cloudId ? 'unlink' : undefined,
            syncStatus: 'pending',
            updatedAt: input.nowIso,
          }
        : item,
  );
```

After a successful `gateway.unlink`, clear the marker:

```ts
      await gateway.unlink?.(player.cloudId);
      players = markPlayerUserLinkSynced(players, input.playerId, input.nowIso);
```

Add this query before `markProposalSynced`:

```ts
export async function fetchAllPlayerLinkProposalsQuery(
  gateway: PlayerLinkAdminQueryGateway = supabasePlayerLinkAdminQueryGateway,
): Promise<AppResult<PlayerLinkStateChange>> {
  try {
    const linkProposals = await gateway.fetchAll();
    return appOk({ linkProposals });
  } catch (error) {
    return appOk({ linkProposals: [] }, [
      recoverableIssue(
        'cloud_unavailable',
        'Nao foi possivel carregar solicitacoes de vinculo da nuvem agora.',
        error,
      ),
    ]);
  }
}
```

Add these helpers after `markProposalSynced`:

```ts
function markProposalPending(
  proposals: PlayerLinkProposal[],
  proposalId: string,
): PlayerLinkProposal[] {
  return proposals.map(
    (proposal): PlayerLinkProposal =>
      proposal.id === proposalId ? { ...proposal, syncStatus: 'pending' } : proposal,
  );
}

function markPlayerUserLinkSynced(players: Player[], playerId: string, syncedAt: string): Player[] {
  return players.map(
    (player): Player =>
      player.id === playerId
        ? {
            ...player,
            pendingUserLinkAction: undefined,
            syncStatus: 'synced',
            lastSyncedAt: syncedAt,
          }
        : player,
  );
}
```

- [ ] **Step 5: Run the application tests and verify pass**

```powershell
node --import tsx --test src/application/playerLinkUseCases.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit Task 1**

```powershell
git add src\types.ts src\application\playerLinkUseCases.ts src\application\playerLinkUseCases.test.ts
git commit -m "fix(app): keep player link review retryable"
```

Expected: commit contains only Task 1 files.

## Task 2: Replay Player-Link Lifecycle Intents In Sync

**Files:**
- Modify: `src/services/supabase/syncService.ts`
- Test: `src/services/supabase/syncService.test.ts`

- [ ] **Step 1: Add failing sync tests**

In `src/services/supabase/syncService.test.ts`, add these imports:

```ts
import { playerCloudService } from './playerCloudService';
import { playerEvaluationCloudService } from './playerEvaluationCloudService';
import { playerLinkProposalCloudService } from './playerLinkProposalCloudService';
```

Extend the type import from `../../types`:

```ts
  Player,
  PlayerLinkProposal,
```

Add these helpers after `makeSharedCommunity`:

```ts
function makeSyncPlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: 'player-local',
    cloudId: 'player-cloud',
    cloudOwnerId: 'owner-1',
    nome: 'Ana Souza',
    apelido: '',
    genero: 'F',
    ativo: true,
    posicaoPrincipal: 'ponteiro',
    posicoesSecundarias: [],
    alturaCm: 170,
    maoDominante: 'direita',
    atributos: {
      saque: 5,
      recepcao: 5,
      levantamento: 5,
      ataque: 5,
      bloqueio: 5,
      defesa: 5,
      velocidade: 5,
      resistencia: 5,
      leituraDeJogo: 5,
      regularidade: 5,
      controleEmocional: 5,
    },
    perfil: {
      nivel: 5,
      classe: 'B',
      arquetipo: 'Equilibrada',
      especialidade: 'Passe',
      fraqueza: 'Bloqueio',
    },
    formaAtual: {
      valor: 5,
      observacao: '',
      ultimasPartidas: [],
    },
    status: {
      lesionado: false,
      limitacaoFisica: null,
      presencaFrequente: true,
    },
    metadata: {
      criadoEm: '2026-06-01T00:00:00.000Z',
      atualizadoEm: '2026-06-01T00:00:00.000Z',
    },
    syncStatus: 'pending',
    ...overrides,
  };
}

function makeSyncProposal(overrides: Partial<PlayerLinkProposal> = {}): PlayerLinkProposal {
  return {
    id: 'proposal-local',
    playerId: 'player-local',
    playerCloudId: 'player-cloud',
    userId: 'owner-1',
    status: 'pending',
    createdAt: '2026-06-01T00:00:00.000Z',
    syncStatus: 'pending',
    ...overrides,
  };
}
```

Add these tests near the existing player-link proposal tests:

```ts
test('uploadLocalDataToCloud replays local approved proposal with propose then approve', async () => {
  const originalPropose = playerLinkProposalCloudService.propose;
  const originalApprove = playerLinkProposalCloudService.approve;
  const calls: string[] = [];

  try {
    playerLinkProposalCloudService.propose = async (playerId: string) => {
      calls.push(`propose:${playerId}`);
      return '00000000-0000-4000-8000-000000000001';
    };
    playerLinkProposalCloudService.approve = async (proposalId: string) => {
      calls.push(`approve:${proposalId}`);
    };

    const result = await syncService.uploadLocalDataToCloud(
      emptyPayload({
        linkProposals: [
          makeSyncProposal({
            status: 'approved',
            reviewedBy: 'owner-1',
            reviewedAt: '2026-06-01T01:00:00.000Z',
          }),
        ],
      }),
      'owner-1',
    );

    assert.deepEqual(calls, [
      'propose:player-cloud',
      'approve:00000000-0000-4000-8000-000000000001',
    ]);
    assert.equal(result.linkProposals?.[0].id, '00000000-0000-4000-8000-000000000001');
    assert.equal(result.linkProposals?.[0].status, 'approved');
    assert.equal(result.linkProposals?.[0].syncStatus, 'synced');
  } finally {
    playerLinkProposalCloudService.propose = originalPropose;
    playerLinkProposalCloudService.approve = originalApprove;
  }
});

test('uploadLocalDataToCloud replays cloud-backed approved pending proposal with approve only', async () => {
  const originalPropose = playerLinkProposalCloudService.propose;
  const originalApprove = playerLinkProposalCloudService.approve;
  const calls: string[] = [];
  const proposalId = '00000000-0000-4000-8000-000000000002';

  try {
    playerLinkProposalCloudService.propose = async () => {
      assert.fail('cloud-backed proposal should not be proposed again');
    };
    playerLinkProposalCloudService.approve = async (id: string) => {
      calls.push(`approve:${id}`);
    };

    const result = await syncService.uploadLocalDataToCloud(
      emptyPayload({
        linkProposals: [
          makeSyncProposal({
            id: proposalId,
            status: 'approved',
            reviewedBy: 'admin-1',
            reviewedAt: '2026-06-01T01:00:00.000Z',
          }),
        ],
      }),
      'admin-1',
    );

    assert.deepEqual(calls, [`approve:${proposalId}`]);
    assert.equal(result.linkProposals?.[0].syncStatus, 'synced');
  } finally {
    playerLinkProposalCloudService.propose = originalPropose;
    playerLinkProposalCloudService.approve = originalApprove;
  }
});

test('uploadLocalDataToCloud replays rejected admin review with reject rpc', async () => {
  const originalReject = playerLinkProposalCloudService.reject;
  const originalCancel = playerLinkProposalCloudService.cancel;
  const calls: string[] = [];
  const proposalId = '00000000-0000-4000-8000-000000000003';

  try {
    playerLinkProposalCloudService.reject = async (id: string) => {
      calls.push(`reject:${id}`);
    };
    playerLinkProposalCloudService.cancel = async () => {
      assert.fail('admin rejection should not call cancel');
    };

    const result = await syncService.uploadLocalDataToCloud(
      emptyPayload({
        linkProposals: [
          makeSyncProposal({
            id: proposalId,
            userId: 'user-1',
            status: 'rejected',
            reviewedBy: 'admin-1',
            reviewedAt: '2026-06-01T01:00:00.000Z',
          }),
        ],
      }),
      'admin-1',
    );

    assert.deepEqual(calls, [`reject:${proposalId}`]);
    assert.equal(result.linkProposals?.[0].syncStatus, 'synced');
  } finally {
    playerLinkProposalCloudService.reject = originalReject;
    playerLinkProposalCloudService.cancel = originalCancel;
  }
});

test('uploadLocalDataToCloud replays rejected self cancellation with cancel rpc', async () => {
  const originalReject = playerLinkProposalCloudService.reject;
  const originalCancel = playerLinkProposalCloudService.cancel;
  const calls: string[] = [];
  const proposalId = '00000000-0000-4000-8000-000000000004';

  try {
    playerLinkProposalCloudService.reject = async () => {
      assert.fail('self cancellation should not call admin reject');
    };
    playerLinkProposalCloudService.cancel = async (id: string) => {
      calls.push(`cancel:${id}`);
    };

    const result = await syncService.uploadLocalDataToCloud(
      emptyPayload({
        linkProposals: [
          makeSyncProposal({
            id: proposalId,
            status: 'rejected',
            reviewedBy: 'owner-1',
            reviewedAt: '2026-06-01T01:00:00.000Z',
          }),
        ],
      }),
      'owner-1',
    );

    assert.deepEqual(calls, [`cancel:${proposalId}`]);
    assert.equal(result.linkProposals?.[0].syncStatus, 'synced');
  } finally {
    playerLinkProposalCloudService.reject = originalReject;
    playerLinkProposalCloudService.cancel = originalCancel;
  }
});

test('uploadLocalDataToCloud keeps failed approved proposal pending and reports issue', async () => {
  const originalApprove = playerLinkProposalCloudService.approve;
  const issues: string[] = [];
  const proposalId = '00000000-0000-4000-8000-000000000005';

  try {
    playerLinkProposalCloudService.approve = async () => {
      throw new Error('approve failed');
    };

    const result = await syncService.uploadLocalDataToCloud(
      emptyPayload({
        linkProposals: [
          makeSyncProposal({
            id: proposalId,
            status: 'approved',
            reviewedBy: 'admin-1',
            reviewedAt: '2026-06-01T01:00:00.000Z',
          }),
        ],
      }),
      'admin-1',
      { onIssue: (context) => issues.push(context) },
    );

    assert.equal(result.linkProposals?.[0].id, proposalId);
    assert.equal(result.linkProposals?.[0].syncStatus, 'pending');
    assert.equal(issues.length, 1);
    assert.match(issues[0], /proposta de vinculo|proposta de v.nculo/i);
  } finally {
    playerLinkProposalCloudService.approve = originalApprove;
  }
});

test('uploadLocalDataToCloud refuses to create local proposal for a different user', async () => {
  const originalPropose = playerLinkProposalCloudService.propose;
  const issues: string[] = [];

  try {
    playerLinkProposalCloudService.propose = async () => {
      assert.fail('sync must not propose on behalf of a different user');
    };

    const result = await syncService.uploadLocalDataToCloud(
      emptyPayload({
        linkProposals: [
          makeSyncProposal({
            id: 'proposal-local-other-user',
            userId: 'other-user',
            status: 'approved',
            reviewedBy: 'owner-1',
            reviewedAt: '2026-06-01T01:00:00.000Z',
          }),
        ],
      }),
      'owner-1',
      { onIssue: (context) => issues.push(context) },
    );

    assert.equal(result.linkProposals?.[0].id, 'proposal-local-other-user');
    assert.equal(result.linkProposals?.[0].syncStatus, 'pending');
    assert.equal(issues.length, 1);
  } finally {
    playerLinkProposalCloudService.propose = originalPropose;
  }
});

test('uploadLocalDataToCloud replays pending player unlink intent through rpc', async () => {
  const originalUnlink = playerLinkProposalCloudService.unlink;
  const originalUpsert = playerCloudService.upsert;
  const originalBulkEvaluations = playerEvaluationCloudService.bulkUpsertForPlayers;
  const calls: string[] = [];

  try {
    playerLinkProposalCloudService.unlink = async (playerId: string) => {
      calls.push(`unlink:${playerId}`);
    };
    playerCloudService.upsert = async (player: Player) => ({ ...player, cloudId: player.cloudId });
    playerEvaluationCloudService.bulkUpsertForPlayers = async () => [];

    const result = await syncService.uploadLocalDataToCloud(
      emptyPayload({
        players: [
          makeSyncPlayer({
            cloudOwnerId: 'other-owner',
            userId: undefined,
            pendingUserLinkAction: 'unlink',
            syncStatus: 'pending',
          }),
        ],
      }),
      'owner-1',
    );

    assert.deepEqual(calls, ['unlink:player-cloud']);
    assert.equal(result.players[0].pendingUserLinkAction, undefined);
    assert.equal(result.players[0].syncStatus, 'synced');
  } finally {
    playerLinkProposalCloudService.unlink = originalUnlink;
    playerCloudService.upsert = originalUpsert;
    playerEvaluationCloudService.bulkUpsertForPlayers = originalBulkEvaluations;
  }
});
```

- [ ] **Step 2: Run the sync tests and verify failure**

```powershell
node --import tsx --test src/services/supabase/syncService.test.ts
```

Expected: FAIL because `syncService` currently proposes all non-cloud-backed proposals and does not replay approve/reject/cancel/unlink.

- [ ] **Step 3: Add sync helper functions**

In `src/services/supabase/syncService.ts`, add these helpers after `isCloudBackedPlayerLinkProposal`:

```ts
function isPendingPlayerLinkIntent(proposal: PlayerLinkProposal): boolean {
  return proposal.syncStatus === 'pending' || proposal.syncStatus === 'local';
}

function markLinkProposalSynced(
  proposal: PlayerLinkProposal,
  playerCloudId: string,
  syncedAt: string,
  id: string = proposal.id,
): PlayerLinkProposal {
  return {
    ...proposal,
    id,
    playerCloudId,
    syncStatus: 'synced',
    lastSyncedAt: syncedAt,
  };
}

function shouldCancelRejectedProposal(proposal: PlayerLinkProposal): boolean {
  return proposal.status === 'rejected' && proposal.reviewedBy === proposal.userId;
}

function shouldSyncPlayerUnlink(player: Player): boolean {
  return (
    player.pendingUserLinkAction === 'unlink' &&
    !!player.cloudId &&
    player.syncStatus === 'pending'
  );
}

function markPlayerUnlinkSynced(player: Player, syncedAt: string): Player {
  return {
    ...player,
    pendingUserLinkAction: undefined,
    syncStatus: 'synced',
    lastSyncedAt: syncedAt,
  };
}

async function syncPlayerLinkProposalIntent(
  proposal: PlayerLinkProposal,
  playerCloudIds: Map<string, string>,
  ownerId: string,
  syncedAt: string,
): Promise<PlayerLinkProposal> {
  const playerCloudId = proposal.playerCloudId || resolveCloudId(proposal.playerId, playerCloudIds);
  if (!playerCloudId) return proposal;

  if (proposal.deletedAt) {
    return markLinkProposalSynced(proposal, playerCloudId, syncedAt);
  }

  const cloudBacked = isCloudBackedPlayerLinkProposal(proposal);
  const pendingIntent = isPendingPlayerLinkIntent(proposal);

  if (proposal.status === 'superseded') {
    return markLinkProposalSynced(proposal, playerCloudId, syncedAt);
  }

  if (cloudBacked && !pendingIntent) {
    return markLinkProposalSynced(proposal, playerCloudId, syncedAt);
  }

  if (!cloudBacked && proposal.userId !== ownerId) {
    throw new Error(
      `Cannot replay local player link proposal "${proposal.id}" for another user without a cloud proposal id`,
    );
  }

  let proposalId = proposal.id;
  if (!cloudBacked) {
    proposalId = await playerLinkProposalCloudService.propose(playerCloudId);
  }

  if (proposal.status === 'approved') {
    await playerLinkProposalCloudService.approve(proposalId);
  } else if (proposal.status === 'rejected') {
    if (shouldCancelRejectedProposal(proposal)) {
      await playerLinkProposalCloudService.cancel(proposalId);
    } else {
      await playerLinkProposalCloudService.reject(proposalId);
    }
  }

  return markLinkProposalSynced(proposal, playerCloudId, syncedAt, proposalId);
}
```

- [ ] **Step 4: Use the unlink helper in the player upload loop**

In the `for (const player of local.players)` loop inside `uploadLocalDataToCloud`, add unlink handling after the `deletedAt` block and before `isSharedPlayer`:

```ts
        let playerForUpload = player;
        if (shouldSyncPlayerUnlink(player)) {
          await playerLinkProposalCloudService.unlink(player.cloudId!);
          playerForUpload = markPlayerUnlinkSynced(player, syncedAt);
        }

        const isSharedPlayer =
          !!playerForUpload.cloudId &&
          !!playerForUpload.cloudOwnerId &&
          playerForUpload.cloudOwnerId !== ownerId;

        if (isSharedPlayer) {
          updatedPlayers.push(markSynced(playerForUpload, playerForUpload.cloudId, syncedAt));
          continue;
        }

        const uploaded = await playerCloudService.upsert(playerForUpload, ownerId);
        updatedPlayers.push(
          markSynced({ ...playerForUpload, cloudOwnerId: ownerId }, uploaded.cloudId, syncedAt),
        );
```

Remove the old `const isSharedPlayer` / `playerCloudService.upsert(player, ownerId)` block that this replaces.

- [ ] **Step 5: Replace the proposal sync loop**

Replace the current `for (const proposal of local.linkProposals || [])` block with:

```ts
    const updatedProposals: PlayerLinkProposal[] = [];
    for (const proposal of local.linkProposals || []) {
      try {
        updatedProposals.push(
          await syncPlayerLinkProposalIntent(proposal, playerCloudIds, ownerId, syncedAt),
        );
      } catch (error) {
        onIssue('proposta de vinculo', error);
        updatedProposals.push(proposal);
      }
    }
```

- [ ] **Step 6: Run the sync tests and verify pass**

```powershell
node --import tsx --test src/services/supabase/syncService.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit Task 2**

```powershell
git add src\services\supabase\syncService.ts src\services\supabase\syncService.test.ts
git commit -m "fix(sync): replay player link lifecycle intents"
```

Expected: commit contains only sync service files.

## Task 3: Add Application-Layer Refresh To Player Link Hook

**Files:**
- Modify: `src/hooks/usePlayerLinkProposals.ts`
- Test indirectly with: `src/application/playerLinkUseCases.test.ts`

- [ ] **Step 1: Add refresh imports**

In `src/hooks/usePlayerLinkProposals.ts`, include `fetchAllPlayerLinkProposalsQuery`:

```ts
import {
  cancelPlayerLinkCommand,
  fetchAllPlayerLinkProposalsQuery,
  proposePlayerLinkCommand,
  reviewPlayerLinkCommand,
  unlinkPlayerCommand,
} from '../application/playerLinkUseCases';
```

- [ ] **Step 2: Add merge helper**

Add this helper above `usePlayerLinkProposals`:

```ts
function mergeLinkProposalRefresh(
  current: PlayerLinkProposal[],
  incoming: PlayerLinkProposal[],
): PlayerLinkProposal[] {
  const byId = new Map<string, PlayerLinkProposal>();
  for (const proposal of incoming) byId.set(proposal.id, proposal);
  for (const proposal of current) {
    const localPending = proposal.syncStatus === 'pending' || proposal.syncStatus === 'local';
    if (localPending || !byId.has(proposal.id)) byId.set(proposal.id, proposal);
  }
  return Array.from(byId.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
```

- [ ] **Step 3: Add the refresh handler**

Inside `usePlayerLinkProposals`, add this callback after the `useEffect` that saves storage:

```ts
  const handleRefreshPlayerLinkProposals = useCallback(async () => {
    const result = await fetchAllPlayerLinkProposalsQuery();

    if (result.ok === false) throw new Error(result.error.message);
    if (result.issues?.length) throw new Error(result.issues[0].message);

    setLinkProposals((current) =>
      mergeLinkProposalRefresh(current, result.value.linkProposals),
    );
  }, []);
```

Return it from the hook:

```ts
    handleRefreshPlayerLinkProposals,
```

- [ ] **Step 4: Run TypeScript**

```powershell
npm run lint
```

Expected: PASS. If it fails because of formatting, fix the exact reported file.

- [ ] **Step 5: Commit Task 3**

```powershell
git add src\hooks\usePlayerLinkProposals.ts
git commit -m "feat(app): refresh player link proposals through use case"
```

Expected: commit contains only the hook.

## Task 4: Route GestaoView Through Local Application State

**Files:**
- Modify: `src/components/admin/GestaoView.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Update `GestaoView` props and imports**

In `src/components/admin/GestaoView.tsx`, remove:

```ts
import { playerLinkProposalCloudService } from '../../services/supabase/playerLinkProposalCloudService';
```

Extend `GestaoViewProps`:

```ts
  linkProposals: PlayerLinkProposal[];
  onReviewLink: (proposalId: string, action: 'approve' | 'reject') => Promise<void>;
  onRefreshLinkProposals?: () => Promise<void>;
```

Update the component signature:

```ts
export const GestaoView = ({
  currentUserId,
  isMaster,
  players,
  linkProposals,
  onReviewLink,
  onRefreshLinkProposals,
  onToast,
}: GestaoViewProps) => {
```

- [ ] **Step 2: Replace direct cloud state with local pending proposals**

Remove `const [pending, setPending] = useState<PlayerLinkProposal[]>([]);`.

Add this memo:

```ts
  const pending = useMemo(
    () => linkProposals.filter((proposal) => proposal.status === 'pending'),
    [linkProposals],
  );
```

Replace `loadPending` with:

```ts
  const loadPending = useCallback(async () => {
    if (!onRefreshLinkProposals) return;
    setLoadingPending(true);
    setPendingError(null);
    try {
      await onRefreshLinkProposals();
    } catch (e) {
      setPendingError(messageOf(e, 'Nao foi possivel carregar as solicitacoes.'));
    } finally {
      setLoadingPending(false);
    }
  }, [onRefreshLinkProposals]);
```

Replace `handleReview` with:

```ts
  const handleReview = useCallback(
    async (proposalId: string, action: 'approve' | 'reject') => {
      setActingId(proposalId);
      try {
        await onReviewLink(proposalId, action);
        onToast?.(action === 'approve' ? 'Vinculo aprovado.' : 'Solicitacao rejeitada.', 'success');
      } catch (e) {
        onToast?.(messageOf(e, 'Falha ao processar a solicitacao.'), 'error');
      } finally {
        setActingId(null);
      }
    },
    [onReviewLink, onToast],
  );
```

- [ ] **Step 3: Wire props from `App`**

In `src/App.tsx`, update the `GestaoView` call:

```tsx
          <GestaoView
            currentUserId={auth.user?.id ?? null}
            isMaster={auth.isMaster}
            players={play.players}
            linkProposals={proposals.linkProposals}
            onReviewLink={proposals.handleReviewPlayerLink}
            onRefreshLinkProposals={proposals.handleRefreshPlayerLinkProposals}
            onToast={toasts.push}
          />
```

- [ ] **Step 4: Verify direct service import is gone**

```powershell
rg -n "playerLinkProposalCloudService" src\components\admin\GestaoView.tsx
```

Expected: no output and exit code 1 from `rg`.

- [ ] **Step 5: Run UI tests**

```powershell
npm run test:ui
```

Expected: PASS. In the Codex sandbox this can fail with access denied on `vitest.config.ts`; if so, rerun with approved escalation for `npm run test:ui`.

- [ ] **Step 6: Commit Task 4**

```powershell
git add src\components\admin\GestaoView.tsx src\App.tsx
git commit -m "fix(admin): route link approvals through app state"
```

Expected: commit contains only `GestaoView.tsx` and `App.tsx`.

## Task 5: Final Verification

**Files:**
- No source edits unless verification finds a defect.

- [ ] **Step 1: Run focused unit tests**

```powershell
node --import tsx --test src/application/playerLinkUseCases.test.ts src/services/supabase/syncService.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run all unit tests**

```powershell
npm run test:unit
```

Expected: PASS.

- [ ] **Step 3: Run UI tests**

```powershell
npm run test:ui
```

Expected: PASS. If sandbox denies access to Vitest config, rerun with approved escalation for `npm run test:ui`.

- [ ] **Step 4: Run build**

```powershell
npm run build
```

Expected: PASS.

- [ ] **Step 5: Run static import check**

```powershell
rg -n "playerLinkProposalCloudService" src\components\admin\GestaoView.tsx
```

Expected: no output.

- [ ] **Step 6: Review changed files**

```powershell
git status --short
git log --oneline -5
```

Expected: working tree clean after commits, and recent commits include the three implementation commits from Tasks 1-4.

## Self-Review

- Spec coverage:
  - Admin approval/rejection through application layer: Task 4.
  - Failed review remains retryable: Task 1.
  - Propose/approve/reject/cancel replay: Task 2.
  - Unlink via RPC: Tasks 1 and 2.
  - No direct writes to `player_link_proposals`: Task 2 only calls `playerLinkProposalCloudService` RPC methods.
  - Existing sync outside link lifecycle unchanged: Task 2 limits edits to player unlink handling and proposal loop.
- Ambiguity resolved:
  - `Player(userId: undefined, syncStatus: 'pending')` is not enough to identify unlink. The plan adds `pendingUserLinkAction: 'unlink'` so sync only calls `unlink_player_user` for a real local unlink intent.
  - Local proposals for another user cannot safely be created through `propose_player_link`, because that RPC uses the authenticated user. Task 2 keeps those pending and reports an issue instead of creating the wrong server proposal.
- Type consistency:
  - `pendingUserLinkAction` is declared on `Player`, set in `unlinkPlayerCommand`, cleared in application and sync success paths, and checked by `syncService`.
  - `fetchAllPlayerLinkProposalsQuery` returns `PlayerLinkStateChange`, matching existing hook update patterns.
