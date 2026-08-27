# Framework Fase 3 Application Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the athlete/account linking flow into the first application-layer slice with commands, queries, product/technical errors, and a UI-facing View Model.

**Architecture:** Keep domain rules pure in `src/domain/*`. Add `src/application/*` as the orchestration layer between hooks/components and Supabase/local state. This first slice keeps React components free from direct Supabase calls for the account-link flow, while preserving local-first behavior and cloud-failure tolerance.

**Tech Stack:** React 19, Vite, TypeScript, Node test runner, Supabase client adapters already present in the repo. No new runtime library in this slice: TanStack Query and Zod remain explicit candidates after command/query contracts are stable enough to justify cache/schema adoption.

---

## Scope

This plan implements the Fase 3 gate through one critical flow:

- Account user selects an athlete profile and requests a link.
- The app can render linked, pending, ready, blocked, and failed-check states through a View Model.
- Commands return product errors separately from technical recoverable issues.
- The UI stops importing `playerCloudService` and `playerLinkProposalCloudService` directly for the account-link query.

Out of scope for this slice:

- Full admin review refactor in `GestaoView`.
- TanStack Query adoption.
- Zod adoption.
- Rewriting all hooks/components into commands/queries.

## File Structure

- Create `src/application/appResult.ts`
  - Shared result, error, and issue types for application commands/queries.
- Create `src/application/appResult.test.ts`
  - Tests product vs technical error creation and recoverable issues.
- Create `src/application/playerLinkViewModel.ts`
  - Pure Account screen View Model builder for athlete/account link state.
- Create `src/application/playerLinkViewModel.test.ts`
  - Tests linked, pending, checking, failed, and ready states.
- Create `src/application/playerLinkUseCases.ts`
  - Application commands and queries for propose/cancel/review/unlink and cloud account-link lookup.
- Create `src/application/playerLinkUseCases.test.ts`
  - Tests success, recoverable cloud failure, and permission denied.
- Modify `src/application/index.ts`
  - Export the new application modules.
- Modify `src/hooks/usePlayerLinkProposals.ts`
  - Replace direct Supabase service import with application commands.
- Modify `src/components/account/AccountSyncView.tsx`
  - Replace direct Supabase service imports with application query + View Model.
- Modify `src/App.tsx`
  - Pass optional toast/error handling only if needed after command result behavior changes.
- Modify `package.json`
  - Include the new application tests in `test:unit`.
- Modify `docs/architecture/domain-model.md`
  - Record the new application layer boundary.

---

### Task 1: Application Result Primitives

**Files:**
- Create: `src/application/appResult.ts`
- Create: `src/application/appResult.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Write the failing tests**

Create `src/application/appResult.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  appOk,
  productError,
  technicalError,
  recoverableIssue,
  isAppOk,
} from './appResult';

test('appOk carries a value and optional recoverable issues', () => {
  const issue = recoverableIssue('cloud_unavailable', 'Cloud write failed.');
  const result = appOk({ saved: true }, [issue]);

  assert.equal(isAppOk(result), true);
  assert.deepEqual(result.value, { saved: true });
  assert.equal(result.issues?.[0].code, 'cloud_unavailable');
  assert.equal(result.issues?.[0].recoverable, true);
});

test('productError creates a non-technical failure for user-action problems', () => {
  const result = productError('permission_denied', 'Ação não autorizada.');

  assert.equal(result.ok, false);
  assert.equal(result.error.kind, 'product');
  assert.equal(result.error.code, 'permission_denied');
  assert.equal(result.error.recoverable, false);
});

test('technicalError preserves cause without exposing it as product state', () => {
  const cause = new Error('RLS denied');
  const result = technicalError('Não foi possível falar com a nuvem.', cause);

  assert.equal(result.ok, false);
  assert.equal(result.error.kind, 'technical');
  assert.equal(result.error.recoverable, true);
  assert.equal(result.error.cause, cause);
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
node --import tsx --test src/application/appResult.test.ts
```

Expected: FAIL because `src/application/appResult.ts` does not exist.

- [ ] **Step 3: Add the application result primitives**

Create `src/application/appResult.ts`:

```ts
export type ProductErrorCode =
  | 'permission_denied'
  | 'not_authenticated'
  | 'not_found'
  | 'invalid_input'
  | 'guest_player_cannot_be_linked'
  | 'cloud_unavailable';

export interface AppIssue {
  code: ProductErrorCode;
  message: string;
  recoverable: true;
  cause?: unknown;
}

export interface ProductAppError {
  kind: 'product';
  code: ProductErrorCode;
  message: string;
  recoverable: false;
}

export interface TechnicalAppError {
  kind: 'technical';
  code: 'technical_error';
  message: string;
  recoverable: true;
  cause?: unknown;
}

export type AppError = ProductAppError | TechnicalAppError;

export type AppResult<T> =
  | { ok: true; value: T; issues?: AppIssue[] }
  | { ok: false; error: AppError };

export function appOk<T>(value: T, issues?: AppIssue[]): AppResult<T> {
  return issues && issues.length > 0 ? { ok: true, value, issues } : { ok: true, value };
}

export function productError(code: ProductErrorCode, message: string): AppResult<never> {
  return {
    ok: false,
    error: { kind: 'product', code, message, recoverable: false },
  };
}

export function technicalError(message: string, cause?: unknown): AppResult<never> {
  return {
    ok: false,
    error: { kind: 'technical', code: 'technical_error', message, recoverable: true, cause },
  };
}

export function recoverableIssue(
  code: ProductErrorCode,
  message: string,
  cause?: unknown,
): AppIssue {
  return { code, message, recoverable: true, cause };
}

export function isAppOk<T>(result: AppResult<T>): result is { ok: true; value: T; issues?: AppIssue[] } {
  return result.ok;
}
```

- [ ] **Step 4: Run the primitive tests**

Run:

```bash
node --import tsx --test src/application/appResult.test.ts
```

Expected: PASS, 3 tests.

- [ ] **Step 5: Add primitive tests to `test:unit`**

Modify the `test:unit` script in `package.json` so it includes:

```text
src/application/appResult.test.ts
```

Place it before the existing domain tests.

- [ ] **Step 6: Run unit tests**

Run:

```bash
npm run test:unit
```

Expected: PASS. Test count increases by 3 from the current 152 baseline.

- [ ] **Step 7: Commit**

Run:

```bash
git add package.json src/application/appResult.ts src/application/appResult.test.ts
git commit -m "feat(app): add application result primitives"
```

---

### Task 2: Account Link View Model

**Files:**
- Create: `src/application/playerLinkViewModel.ts`
- Create: `src/application/playerLinkViewModel.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Write the failing View Model tests**

Create `src/application/playerLinkViewModel.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAccountPlayerLinkViewModel } from './playerLinkViewModel';
import { makePlayer } from '../test/fixtures';
import type { PlayerLinkProposal } from '../types';

const user = { id: 'user-1', email: 'ana@example.com' };

function pendingProposal(overrides: Partial<PlayerLinkProposal> = {}): PlayerLinkProposal {
  return {
    id: 'proposal-1',
    playerId: 'player-1',
    playerCloudId: 'cloud-player-1',
    userId: 'user-1',
    status: 'pending',
    createdAt: '2026-01-01T12:00:00.000Z',
    syncStatus: 'synced',
    ...overrides,
  };
}

test('account link view model returns disabled when Supabase is not configured', () => {
  const vm = buildAccountPlayerLinkViewModel({
    user,
    isSupabaseConfigured: false,
    syncLoading: false,
    checkingLinkedPlayer: false,
    linkedPlayerCheckFailed: false,
    players: [],
    linkProposals: [],
    cloudLinkedPlayer: null,
    cloudPendingProposal: null,
  });

  assert.equal(vm.state, 'disabled');
  assert.equal(vm.canRequestLink, false);
});

test('account link view model prefers locally linked player', () => {
  const localLinked = makePlayer('player-1', { userId: 'user-1', apelido: 'Ana' });
  const cloudLinked = makePlayer('player-2', { userId: 'user-1', apelido: 'Cloud' });
  const vm = buildAccountPlayerLinkViewModel({
    user,
    isSupabaseConfigured: true,
    syncLoading: false,
    checkingLinkedPlayer: false,
    linkedPlayerCheckFailed: false,
    players: [localLinked],
    linkProposals: [],
    cloudLinkedPlayer: cloudLinked,
    cloudPendingProposal: null,
  });

  assert.equal(vm.state, 'linked');
  assert.equal(vm.linkedPlayer?.id, 'player-1');
});

test('account link view model resolves pending proposal and pending player', () => {
  const player = makePlayer('player-1', { cloudId: 'cloud-player-1', apelido: 'Ana' });
  const vm = buildAccountPlayerLinkViewModel({
    user,
    isSupabaseConfigured: true,
    syncLoading: false,
    checkingLinkedPlayer: false,
    linkedPlayerCheckFailed: false,
    players: [player],
    linkProposals: [pendingProposal()],
    cloudLinkedPlayer: null,
    cloudPendingProposal: null,
  });

  assert.equal(vm.state, 'pending');
  assert.equal(vm.pendingProposal?.id, 'proposal-1');
  assert.equal(vm.pendingPlayer?.id, 'player-1');
});

test('account link view model exposes available non-guest active players', () => {
  const available = makePlayer('player-1', { userId: undefined, isGuest: false, ativo: true });
  const linked = makePlayer('player-2', { userId: 'other', isGuest: false, ativo: true });
  const guest = makePlayer('player-3', { userId: undefined, isGuest: true, ativo: true });
  const inactive = makePlayer('player-4', { userId: undefined, isGuest: false, ativo: false });

  const vm = buildAccountPlayerLinkViewModel({
    user,
    isSupabaseConfigured: true,
    syncLoading: false,
    checkingLinkedPlayer: false,
    linkedPlayerCheckFailed: false,
    players: [available, linked, guest, inactive],
    linkProposals: [],
    cloudLinkedPlayer: null,
    cloudPendingProposal: null,
  });

  assert.equal(vm.state, 'ready');
  assert.deepEqual(vm.availablePlayers.map((player) => player.id), ['player-1']);
  assert.equal(vm.canRequestLink, true);
});

test('account link view model blocks requests after a failed cloud check', () => {
  const player = makePlayer('player-1', { userId: undefined, isGuest: false, ativo: true });
  const vm = buildAccountPlayerLinkViewModel({
    user,
    isSupabaseConfigured: true,
    syncLoading: false,
    checkingLinkedPlayer: false,
    linkedPlayerCheckFailed: true,
    players: [player],
    linkProposals: [],
    cloudLinkedPlayer: null,
    cloudPendingProposal: null,
  });

  assert.equal(vm.state, 'check_failed');
  assert.equal(vm.canRequestLink, false);
});
```

- [ ] **Step 2: Run the View Model test and verify it fails**

Run:

```bash
node --import tsx --test src/application/playerLinkViewModel.test.ts
```

Expected: FAIL because `src/application/playerLinkViewModel.ts` does not exist.

- [ ] **Step 3: Implement the View Model builder**

Create `src/application/playerLinkViewModel.ts`:

```ts
import type { Player, PlayerLinkProposal } from '../types';

export type AccountPlayerLinkState =
  | 'disabled'
  | 'anonymous'
  | 'checking'
  | 'linked'
  | 'pending'
  | 'check_failed'
  | 'ready';

export interface AccountPlayerLinkViewModel {
  state: AccountPlayerLinkState;
  linkedPlayer: Player | null;
  pendingProposal: PlayerLinkProposal | null;
  pendingPlayer: Player | null;
  availablePlayers: Player[];
  canRequestLink: boolean;
  canCancelPending: boolean;
}

export interface AccountPlayerLinkViewModelInput {
  user: { id: string } | null;
  isSupabaseConfigured: boolean;
  syncLoading: boolean;
  checkingLinkedPlayer: boolean;
  linkedPlayerCheckFailed: boolean;
  players: Player[];
  linkProposals: PlayerLinkProposal[];
  cloudLinkedPlayer: Player | null;
  cloudPendingProposal: PlayerLinkProposal | null;
}

export function buildAccountPlayerLinkViewModel(
  input: AccountPlayerLinkViewModelInput,
): AccountPlayerLinkViewModel {
  const availablePlayers = input.players.filter(
    (player) => !player.userId && !player.isGuest && player.ativo,
  );

  if (!input.isSupabaseConfigured) {
    return baseViewModel('disabled', availablePlayers);
  }

  if (!input.user) {
    return baseViewModel('anonymous', availablePlayers);
  }

  if (input.checkingLinkedPlayer || input.syncLoading) {
    return baseViewModel('checking', availablePlayers);
  }

  const localLinkedPlayer =
    input.players.find((player) => player.userId === input.user?.id) ?? null;
  const linkedPlayer = localLinkedPlayer ?? input.cloudLinkedPlayer;

  if (linkedPlayer) {
    return {
      ...baseViewModel('linked', availablePlayers),
      linkedPlayer,
    };
  }

  const localPendingProposal =
    input.linkProposals.find(
      (proposal) => proposal.userId === input.user?.id && proposal.status === 'pending',
    ) ?? null;
  const pendingProposal = localPendingProposal ?? input.cloudPendingProposal;

  if (pendingProposal) {
    const pendingPlayer =
      input.players.find(
        (player) =>
          player.id === pendingProposal.playerId ||
          (!!player.cloudId &&
            !!pendingProposal.playerCloudId &&
            player.cloudId === pendingProposal.playerCloudId),
      ) ?? null;

    return {
      ...baseViewModel('pending', availablePlayers),
      pendingProposal,
      pendingPlayer,
      canCancelPending: true,
    };
  }

  if (input.linkedPlayerCheckFailed) {
    return baseViewModel('check_failed', availablePlayers);
  }

  return {
    ...baseViewModel('ready', availablePlayers),
    canRequestLink: availablePlayers.length > 0,
  };
}

function baseViewModel(
  state: AccountPlayerLinkState,
  availablePlayers: Player[],
): AccountPlayerLinkViewModel {
  return {
    state,
    linkedPlayer: null,
    pendingProposal: null,
    pendingPlayer: null,
    availablePlayers,
    canRequestLink: false,
    canCancelPending: false,
  };
}
```

- [ ] **Step 4: Run the View Model tests**

Run:

```bash
node --import tsx --test src/application/playerLinkViewModel.test.ts
```

Expected: PASS, 5 tests.

- [ ] **Step 5: Add View Model tests to `test:unit`**

Modify `package.json` so `test:unit` includes:

```text
src/application/playerLinkViewModel.test.ts
```

- [ ] **Step 6: Run unit tests**

Run:

```bash
npm run test:unit
```

Expected: PASS. Test count increases by 5.

- [ ] **Step 7: Commit**

Run:

```bash
git add package.json src/application/playerLinkViewModel.ts src/application/playerLinkViewModel.test.ts
git commit -m "feat(app): model account player link view state"
```

---

### Task 3: Player Link Commands and Query

**Files:**
- Create: `src/application/playerLinkUseCases.ts`
- Create: `src/application/playerLinkUseCases.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Write failing command/query tests**

Create `src/application/playerLinkUseCases.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cancelPlayerLinkCommand,
  fetchAccountPlayerLinkQuery,
  proposePlayerLinkCommand,
  reviewPlayerLinkCommand,
  unlinkPlayerCommand,
} from './playerLinkUseCases';
import { makePlayer } from '../test/fixtures';
import type { PlayerLinkProposal } from '../types';

const now = '2026-01-01T12:00:00.000Z';

function proposal(overrides: Partial<PlayerLinkProposal> = {}): PlayerLinkProposal {
  return {
    id: 'proposal-1',
    playerId: 'player-1',
    playerCloudId: 'cloud-player-1',
    userId: 'user-1',
    status: 'pending',
    createdAt: now,
    syncStatus: 'synced',
    ...overrides,
  };
}

test('proposePlayerLinkCommand approves a local unlinked player without cloud IO', async () => {
  const player = makePlayer('player-1', { userId: undefined, cloudId: undefined });
  const result = await proposePlayerLinkCommand(
    {
      players: [player],
      linkProposals: [],
      currentUserId: 'user-1',
      playerId: 'player-1',
      nowIso: now,
      proposalId: 'proposal-local',
    },
    { propose: async () => assert.fail('local direct link should not call cloud') },
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.linkProposals[0].status, 'approved');
  assert.equal(result.value.players[0].userId, 'user-1');
});

test('proposePlayerLinkCommand preserves local pending proposal when cloud write fails', async () => {
  const player = makePlayer('player-1', { cloudId: 'cloud-player-1', cloudOwnerId: 'other' });
  const result = await proposePlayerLinkCommand(
    {
      players: [player],
      linkProposals: [],
      currentUserId: 'user-1',
      playerId: 'player-1',
      nowIso: now,
      proposalId: 'proposal-local',
    },
    { propose: async () => { throw new Error('network down'); } },
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.linkProposals[0].syncStatus, 'pending');
  assert.equal(result.issues?.[0].code, 'cloud_unavailable');
});

test('proposePlayerLinkCommand returns permission error for anonymous user', async () => {
  const result = await proposePlayerLinkCommand(
    {
      players: [makePlayer('player-1')],
      linkProposals: [],
      currentUserId: null,
      playerId: 'player-1',
      nowIso: now,
      proposalId: 'proposal-local',
    },
    { propose: async () => 'cloud-proposal' },
  );

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error.kind, 'product');
  assert.equal(result.error.code, 'not_authenticated');
});

test('reviewPlayerLinkCommand approves proposal and supersedes competing pending proposals', async () => {
  const players = [makePlayer('player-1', { cloudId: 'cloud-player-1', userId: undefined })];
  const proposals = [
    proposal({ id: 'proposal-1', userId: 'user-1' }),
    proposal({ id: 'proposal-2', userId: 'other-user', status: 'pending' }),
  ];
  const result = await reviewPlayerLinkCommand(
    {
      players,
      linkProposals: proposals,
      currentUserId: 'reviewer-1',
      proposalId: 'proposal-1',
      action: 'approve',
      nowIso: now,
    },
    {
      approve: async () => undefined,
      reject: async () => undefined,
    },
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.players[0].userId, 'user-1');
  assert.equal(result.value.linkProposals.find((item) => item.id === 'proposal-1')?.status, 'approved');
  assert.equal(result.value.linkProposals.find((item) => item.id === 'proposal-2')?.status, 'superseded');
});

test('cancelPlayerLinkCommand rejects the proposal locally and tolerates cloud failure', async () => {
  const result = await cancelPlayerLinkCommand(
    {
      linkProposals: [proposal()],
      currentUserId: 'user-1',
      proposalId: 'proposal-1',
      nowIso: now,
    },
    { cancel: async () => { throw new Error('RLS denied'); } },
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.linkProposals[0].status, 'rejected');
  assert.equal(result.issues?.[0].code, 'cloud_unavailable');
});

test('unlinkPlayerCommand clears player user id and reports recoverable cloud issue', async () => {
  const result = await unlinkPlayerCommand(
    {
      players: [makePlayer('player-1', { userId: 'user-1', cloudId: 'cloud-player-1' })],
      linkProposals: [proposal()],
      currentUserId: 'user-1',
      playerId: 'player-1',
      nowIso: now,
    },
    { unlink: async () => { throw new Error('offline'); } },
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.players[0].userId, undefined);
  assert.equal(result.value.linkProposals[0].status, 'superseded');
  assert.equal(result.issues?.[0].code, 'cloud_unavailable');
});

test('fetchAccountPlayerLinkQuery maps cloud lookup success', async () => {
  const linked = makePlayer('player-1', { userId: 'user-1' });
  const result = await fetchAccountPlayerLinkQuery('user-1', {
    fetchLinkedToUser: async () => linked,
    fetchPendingForUser: async () => proposal(),
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.linkedPlayer?.id, 'player-1');
  assert.equal(result.value.pendingProposal?.id, 'proposal-1');
});
```

- [ ] **Step 2: Run the use-case tests and verify they fail**

Run:

```bash
node --import tsx --test src/application/playerLinkUseCases.test.ts
```

Expected: FAIL because `src/application/playerLinkUseCases.ts` does not exist.

- [ ] **Step 3: Implement the use cases**

Create `src/application/playerLinkUseCases.ts`:

```ts
import type { Player, PlayerLinkProposal } from '../types';
import {
  buildPlayerLinkProposal,
  linkPlayerToUser,
  supersedePendingProposalsForLink,
} from '../domain/playerLink';
import { playerCloudService } from '../services/supabase/playerCloudService';
import { playerLinkProposalCloudService } from '../services/supabase/playerLinkProposalCloudService';
import { appOk, AppResult, productError, recoverableIssue } from './appResult';

export interface PlayerLinkCommandGateway {
  propose?: (playerCloudId: string) => Promise<string>;
  approve?: (proposalId: string) => Promise<void>;
  reject?: (proposalId: string) => Promise<void>;
  cancel?: (proposalId: string) => Promise<void>;
  unlink?: (playerCloudId: string) => Promise<void>;
}

export interface PlayerLinkQueryGateway {
  fetchLinkedToUser: (userId: string) => Promise<Player | null>;
  fetchPendingForUser: (userId: string) => Promise<PlayerLinkProposal | null>;
}

export interface PlayerLinkStateChange {
  players?: Player[];
  linkProposals: PlayerLinkProposal[];
}

export const supabasePlayerLinkCommandGateway: Required<PlayerLinkCommandGateway> = {
  propose: playerLinkProposalCloudService.propose,
  approve: playerLinkProposalCloudService.approve,
  reject: playerLinkProposalCloudService.reject,
  cancel: playerLinkProposalCloudService.cancel,
  unlink: playerLinkProposalCloudService.unlink,
};

export const supabasePlayerLinkQueryGateway: PlayerLinkQueryGateway = {
  fetchLinkedToUser: playerCloudService.fetchLinkedToUser,
  fetchPendingForUser: playerLinkProposalCloudService.fetchPendingForUser,
};

export async function proposePlayerLinkCommand(
  input: {
    players: Player[];
    linkProposals: PlayerLinkProposal[];
    currentUserId: string | null;
    playerId: string;
    nowIso: string;
    proposalId: string;
  },
  gateway: PlayerLinkCommandGateway = supabasePlayerLinkCommandGateway,
): Promise<AppResult<PlayerLinkStateChange>> {
  if (!input.currentUserId) {
    return productError('not_authenticated', 'Usuário não autenticado.');
  }

  const player = input.players.find((item) => item.id === input.playerId);
  if (!player) return productError('not_found', 'Atleta não encontrado.');
  if (player.isGuest) {
    return productError('guest_player_cannot_be_linked', 'Não é possível vincular atletas convidados.');
  }

  const newProposal = buildPlayerLinkProposal(
    player,
    input.currentUserId,
    input.nowIso,
    input.proposalId,
  );
  let players =
    newProposal.status === 'approved'
      ? linkPlayerToUser(input.players, input.playerId, input.currentUserId, input.nowIso)
      : input.players;
  let linkProposals = [
    ...input.linkProposals.filter(
      (proposal) =>
        !(
          proposal.playerId === input.playerId &&
          proposal.userId === input.currentUserId &&
          proposal.status === 'pending'
        ),
    ),
    newProposal,
  ];

  if (player.cloudId && gateway.propose) {
    try {
      const cloudProposalId = await gateway.propose(player.cloudId);
      linkProposals = linkProposals.map((proposal) =>
        proposal.id === input.proposalId
          ? {
              ...proposal,
              id: cloudProposalId,
              syncStatus: 'synced',
              lastSyncedAt: new Date().toISOString(),
            }
          : proposal,
      );
    } catch (error) {
      return appOk(
        { players, linkProposals },
        [recoverableIssue('cloud_unavailable', 'Vínculo salvo localmente; a nuvem será sincronizada depois.', error)],
      );
    }
  }

  return appOk({ players, linkProposals });
}

export async function reviewPlayerLinkCommand(
  input: {
    players: Player[];
    linkProposals: PlayerLinkProposal[];
    currentUserId: string | null;
    proposalId: string;
    action: 'approve' | 'reject';
    nowIso: string;
  },
  gateway: PlayerLinkCommandGateway = supabasePlayerLinkCommandGateway,
): Promise<AppResult<PlayerLinkStateChange>> {
  if (!input.currentUserId) return productError('not_authenticated', 'Usuário não autenticado.');

  const proposal = input.linkProposals.find((item) => item.id === input.proposalId);
  if (!proposal) return productError('not_found', 'Solicitação não encontrada.');

  const player = input.players.find(
    (item) => item.id === proposal.playerId || (!!item.cloudId && item.cloudId === proposal.playerCloudId),
  );
  if (!player) return productError('not_found', 'Atleta associado não encontrado.');

  const isTemp = proposal.syncStatus === 'pending';
  let players = input.players;
  let linkProposals = input.linkProposals;

  if (input.action === 'approve') {
    players = linkPlayerToUser(input.players, player.id, proposal.userId, input.nowIso);
    linkProposals = supersedePendingProposalsForLink(
      input.linkProposals,
      {
        playerId: player.id,
        playerCloudId: proposal.playerCloudId ?? player.cloudId,
        userId: proposal.userId,
      },
      input.currentUserId,
      input.nowIso,
    ).map((item) =>
      item.id === input.proposalId
        ? {
            ...item,
            status: 'approved',
            reviewedBy: input.currentUserId,
            reviewedAt: input.nowIso,
            syncStatus: isTemp ? 'pending' : 'synced',
          }
        : item,
    );
  } else {
    linkProposals = input.linkProposals.map((item) =>
      item.id === input.proposalId
        ? {
            ...item,
            status: 'rejected',
            reviewedBy: input.currentUserId,
            reviewedAt: input.nowIso,
            syncStatus: isTemp ? 'pending' : 'synced',
          }
        : item,
    );
  }

  if (!isTemp) {
    try {
      if (input.action === 'approve') await gateway.approve?.(input.proposalId);
      else await gateway.reject?.(input.proposalId);
      linkProposals = markProposalSynced(linkProposals, input.proposalId);
    } catch (error) {
      return appOk(
        { players, linkProposals },
        [recoverableIssue('cloud_unavailable', 'Revisão salva localmente; a nuvem será sincronizada depois.', error)],
      );
    }
  }

  return appOk({ players, linkProposals });
}

export async function cancelPlayerLinkCommand(
  input: {
    linkProposals: PlayerLinkProposal[];
    currentUserId: string | null;
    proposalId: string;
    nowIso: string;
  },
  gateway: PlayerLinkCommandGateway = supabasePlayerLinkCommandGateway,
): Promise<AppResult<PlayerLinkStateChange>> {
  if (!input.currentUserId) return productError('not_authenticated', 'Usuário não autenticado.');
  const proposal = input.linkProposals.find((item) => item.id === input.proposalId);
  if (!proposal) return productError('not_found', 'Solicitação não encontrada.');

  const isTemp = proposal.syncStatus === 'pending';
  let linkProposals = input.linkProposals.map((item) =>
    item.id === input.proposalId
      ? {
          ...item,
          status: 'rejected',
          reviewedBy: input.currentUserId,
          reviewedAt: input.nowIso,
          syncStatus: isTemp ? 'pending' : 'synced',
        }
      : item,
  );

  if (!isTemp) {
    try {
      await gateway.cancel?.(input.proposalId);
      linkProposals = markProposalSynced(linkProposals, input.proposalId);
    } catch (error) {
      return appOk(
        { linkProposals },
        [recoverableIssue('cloud_unavailable', 'Cancelamento salvo localmente; a nuvem será sincronizada depois.', error)],
      );
    }
  }

  return appOk({ linkProposals });
}

export async function unlinkPlayerCommand(
  input: {
    players: Player[];
    linkProposals: PlayerLinkProposal[];
    currentUserId: string | null;
    playerId: string;
    nowIso: string;
  },
  gateway: PlayerLinkCommandGateway = supabasePlayerLinkCommandGateway,
): Promise<AppResult<PlayerLinkStateChange>> {
  if (!input.currentUserId) return productError('not_authenticated', 'Usuário não autenticado.');
  const player = input.players.find((item) => item.id === input.playerId);
  if (!player) return productError('not_found', 'Atleta não encontrado.');

  const players = input.players.map((item) =>
    item.id === input.playerId
      ? { ...item, userId: undefined, syncStatus: 'pending', updatedAt: input.nowIso }
      : item,
  );
  const linkProposals = input.linkProposals.map((proposal) => {
    const samePlayer =
      proposal.playerId === input.playerId ||
      (!!proposal.playerCloudId && !!player.cloudId && proposal.playerCloudId === player.cloudId);
    if (samePlayer && proposal.status === 'pending') {
      return {
        ...proposal,
        status: 'superseded',
        reviewedBy: input.currentUserId,
        reviewedAt: input.nowIso,
        syncStatus: proposal.syncStatus === 'pending' ? 'pending' : 'synced',
      };
    }
    return proposal;
  });

  if (player.cloudId) {
    try {
      await gateway.unlink?.(player.cloudId);
    } catch (error) {
      return appOk(
        { players, linkProposals },
        [recoverableIssue('cloud_unavailable', 'Desvínculo salvo localmente; a nuvem será sincronizada depois.', error)],
      );
    }
  }

  return appOk({ players, linkProposals });
}

export async function fetchAccountPlayerLinkQuery(
  userId: string,
  gateway: PlayerLinkQueryGateway = supabasePlayerLinkQueryGateway,
): Promise<AppResult<{ linkedPlayer: Player | null; pendingProposal: PlayerLinkProposal | null }>> {
  try {
    const [linkedPlayer, pendingProposal] = await Promise.all([
      gateway.fetchLinkedToUser(userId),
      gateway.fetchPendingForUser(userId),
    ]);
    return appOk({ linkedPlayer, pendingProposal });
  } catch (error) {
    return appOk(
      { linkedPlayer: null, pendingProposal: null },
      [recoverableIssue('cloud_unavailable', 'Não foi possível verificar o vínculo na nuvem agora.', error)],
    );
  }
}

function markProposalSynced(
  proposals: PlayerLinkProposal[],
  proposalId: string,
): PlayerLinkProposal[] {
  return proposals.map((proposal) =>
    proposal.id === proposalId
      ? { ...proposal, syncStatus: 'synced', lastSyncedAt: new Date().toISOString() }
      : proposal,
  );
}
```

- [ ] **Step 4: Run command/query tests**

Run:

```bash
node --import tsx --test src/application/playerLinkUseCases.test.ts
```

Expected: PASS, 7 tests.

- [ ] **Step 5: Add use-case tests to `test:unit`**

Modify `package.json` so `test:unit` includes:

```text
src/application/playerLinkUseCases.test.ts
```

- [ ] **Step 6: Run unit tests**

Run:

```bash
npm run test:unit
```

Expected: PASS. Test count increases by 7.

- [ ] **Step 7: Commit**

Run:

```bash
git add package.json src/application/playerLinkUseCases.ts src/application/playerLinkUseCases.test.ts
git commit -m "feat(app): add player link commands and query"
```

---

### Task 4: Refactor Player Link Hook to Commands

**Files:**
- Modify: `src/hooks/usePlayerLinkProposals.ts`

- [ ] **Step 1: Replace direct service orchestration with command calls**

Modify imports in `src/hooks/usePlayerLinkProposals.ts`:

```ts
import {
  cancelPlayerLinkCommand,
  proposePlayerLinkCommand,
  reviewPlayerLinkCommand,
  unlinkPlayerCommand,
} from '../application/playerLinkUseCases';
```

Remove:

```ts
import { playerLinkProposalCloudService } from '../services/supabase/playerLinkProposalCloudService';
import {
  buildPlayerLinkProposal,
  linkPlayerToUser,
  supersedePendingProposalsForLink,
} from '../domain/playerLink';
```

Keep:

```ts
import { generateUUID } from '../logic/uuid';
```

- [ ] **Step 2: Update `handleProposePlayerLink`**

Replace the body of `handleProposePlayerLink` with:

```ts
const result = await proposePlayerLinkCommand({
  players,
  linkProposals,
  currentUserId,
  playerId,
  nowIso: new Date().toISOString(),
  proposalId: `proposal-${generateUUID()}`,
});

if (!result.ok) throw new Error(result.error.message);

setLinkProposals(result.value.linkProposals);
if (result.value.players) setPlayers(result.value.players);
if (result.issues?.length) console.warn('[player-link] recoverable issue:', result.issues[0]);
```

Update the dependency array to include `linkProposals`.

- [ ] **Step 3: Update `handleReviewPlayerLink`**

Replace the body after argument validation with:

```ts
const result = await reviewPlayerLinkCommand({
  players,
  linkProposals,
  currentUserId,
  proposalId,
  action,
  nowIso: new Date().toISOString(),
});

if (!result.ok) throw new Error(result.error.message);

if (result.value.players) setPlayers(result.value.players);
setLinkProposals(result.value.linkProposals);
if (result.issues?.length) console.warn('[player-link] recoverable issue:', result.issues[0]);
```

- [ ] **Step 4: Update `handleCancelPlayerLink`**

Replace the body after argument validation with:

```ts
const result = await cancelPlayerLinkCommand({
  linkProposals,
  currentUserId,
  proposalId,
  nowIso: new Date().toISOString(),
});

if (!result.ok) throw new Error(result.error.message);

setLinkProposals(result.value.linkProposals);
if (result.issues?.length) console.warn('[player-link] recoverable issue:', result.issues[0]);
```

- [ ] **Step 5: Update `handleUnlinkPlayer`**

Replace the body after argument validation with:

```ts
const result = await unlinkPlayerCommand({
  players,
  linkProposals,
  currentUserId,
  playerId,
  nowIso: new Date().toISOString(),
});

if (!result.ok) throw new Error(result.error.message);

if (result.value.players) setPlayers(result.value.players);
setLinkProposals(result.value.linkProposals);
if (result.issues?.length) console.warn('[player-link] recoverable issue:', result.issues[0]);
```

Update the dependency array to include `linkProposals`.

- [ ] **Step 6: Run targeted tests**

Run:

```bash
npm run lint
npm run test:unit
```

Expected: both PASS.

- [ ] **Step 7: Commit**

Run:

```bash
git add src/hooks/usePlayerLinkProposals.ts
git commit -m "refactor(app): route player link hook through commands"
```

---

### Task 5: Refactor Account Screen Query and View Model

**Files:**
- Modify: `src/components/account/AccountSyncView.tsx`

- [ ] **Step 1: Replace direct service imports**

Remove these imports from `src/components/account/AccountSyncView.tsx`:

```ts
import { playerCloudService } from '../../services/supabase/playerCloudService';
import { playerLinkProposalCloudService } from '../../services/supabase/playerLinkProposalCloudService';
```

Add:

```ts
import { fetchAccountPlayerLinkQuery } from '../../application/playerLinkUseCases';
import { buildAccountPlayerLinkViewModel } from '../../application/playerLinkViewModel';
```

- [ ] **Step 2: Replace the cloud lookup effect**

Replace the `Promise.all([...])` block inside the effect with:

```ts
fetchAccountPlayerLinkQuery(user.id)
  .then((result) => {
    if (cancelled) return;
    if (result.ok) {
      setCloudLinkedPlayer(result.value.linkedPlayer);
      setCloudPendingProposal(result.value.pendingProposal);
      setLinkedPlayerCheckFailed(!!result.issues?.length);
      if (result.issues?.length) {
        console.warn('[account] Falha recuperável ao verificar vínculo:', result.issues[0]);
      }
      return;
    }
    setCloudLinkedPlayer(null);
    setCloudPendingProposal(null);
    setLinkedPlayerCheckFailed(true);
  })
  .finally(() => {
    if (!cancelled) setCheckingLinkedPlayer(false);
  });
```

- [ ] **Step 3: Build the View Model after state declarations**

Add after `pendingPlayer` is removed or before render:

```ts
const playerLinkVm = buildAccountPlayerLinkViewModel({
  user,
  isSupabaseConfigured,
  syncLoading,
  checkingLinkedPlayer,
  linkedPlayerCheckFailed,
  players,
  linkProposals,
  cloudLinkedPlayer,
  cloudPendingProposal,
});
```

Remove the local `myLinkedPlayer`, `linkedPlayer`, `myPendingProposal`, `pendingProposal`, `pendingPlayer`, and `availablePlayers` memo blocks if they become unused.

- [ ] **Step 4: Render from the View Model**

Replace references:

```ts
linkedPlayer
pendingProposal
pendingPlayer
availablePlayers
linkedPlayerCheckFailed
checkingLinkedPlayer || syncLoading
```

With:

```ts
playerLinkVm.linkedPlayer
playerLinkVm.pendingProposal
playerLinkVm.pendingPlayer
playerLinkVm.availablePlayers
playerLinkVm.state === 'check_failed'
playerLinkVm.state === 'checking'
```

Use:

```ts
disabled={claiming || !playerLinkVm.canRequestLink}
```

for the select when appropriate, and:

```ts
disabled={!selectedPlayerId || claiming || !playerLinkVm.canRequestLink}
```

for the request button.

- [ ] **Step 5: Run targeted verification**

Run:

```bash
npm run lint
npm run lint:eslint -- --quiet
npm run test:unit
```

Expected: all PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add src/components/account/AccountSyncView.tsx
git commit -m "refactor(app): render account link view model"
```

---

### Task 6: Application Layer Barrel and Documentation

**Files:**
- Create or modify: `src/application/index.ts`
- Modify: `docs/architecture/domain-model.md`

- [ ] **Step 1: Add application exports**

Create `src/application/index.ts`:

```ts
export * from './appResult';
export * from './playerLinkUseCases';
export * from './playerLinkViewModel';
```

- [ ] **Step 2: Document the application boundary**

Append this section to `docs/architecture/domain-model.md`:

```md
## Application Layer

- Application commands and queries live in `src/application/*`.
- Commands receive user intentions, current local state, timestamps, and IO gateways.
- Commands may update local state even when cloud IO fails, but must report recoverable technical issues.
- Product errors such as missing auth, missing athlete, or invalid link attempts are not logged as technical failures.
- Account-link UI renders a View Model from the application layer rather than deriving cloud/local state directly in JSX.
- Supabase services remain adapters; React components should not call them directly for flows that have commands or queries.
```

- [ ] **Step 3: Run format**

Run:

```bash
npm run format
npm run format:check
```

Expected: both PASS.

- [ ] **Step 4: Commit**

Run:

```bash
git add docs/architecture/domain-model.md src/application/index.ts
git commit -m "docs(app): document application layer boundary"
```

---

### Task 7: Final Fase 3 Verification

**Files:**
- No code changes expected unless verification finds a regression.

- [ ] **Step 1: Run full local checks**

Run:

```bash
npm run format:check
npm run lint
npm run lint:eslint -- --quiet
npm run test:unit
npm run test:ui
npm run build
```

Expected:

- `format:check`: PASS.
- `lint`: PASS.
- `lint:eslint -- --quiet`: PASS.
- `test:unit`: PASS with existing tests plus 15 new application tests.
- `test:ui`: PASS.
- `build`: PASS. The existing Vite chunk-size warning may remain.

- [ ] **Step 2: Inspect direct service imports in account link UI**

Run:

```bash
rg -n "playerCloudService|playerLinkProposalCloudService" src/components/account src/hooks/usePlayerLinkProposals.ts src/application
```

Expected:

- No direct service import in `src/components/account/AccountSyncView.tsx`.
- No direct service import in `src/hooks/usePlayerLinkProposals.ts`.
- Service imports only in `src/application/playerLinkUseCases.ts`.

- [ ] **Step 3: Inspect git diff**

Run:

```bash
git status --short --branch
git diff --stat origin/main...HEAD
```

Expected:

- Only intentional Fase 3 files are changed.
- Branch is ahead of `origin/main`.

- [ ] **Step 4: Push and open PR**

Run:

```bash
git push -u origin codex/framework-phase-3-application
```

Open a draft PR:

```bash
gh pr create --repo lottarmrs/Volley --base main --head codex/framework-phase-3-application --title "[codex] Framework Fase 3 application layer" --draft
```

PR body should include:

```md
## Summary

- Adds application-layer result primitives for product vs technical failures.
- Moves account/athlete link commands and cloud query into `src/application`.
- Renders the account link area from a View Model instead of raw mixed cloud/local state.

## Validation

- `npm run format:check`
- `npm run lint`
- `npm run lint:eslint -- --quiet`
- `npm run test:unit`
- `npm run test:ui`
- `npm run build`

## Notes

- No new runtime library was introduced in this slice.
- TanStack Query and Zod remain candidates after more command/query boundaries exist.
```

---

## Self-Review

- Spec coverage: covers Fase 3 command/query pattern, View Model, direct service reduction in one critical flow, product vs technical errors, and the Fase 3 gate.
- Libraries: documents why TanStack Query and Zod are not introduced in this first slice.
- Risk: local-first behavior is preserved by commands returning recoverable cloud issues instead of rolling back local state.
- Verification: includes formatting, typecheck, ESLint, unit tests, UI tests, build, and import audit.
