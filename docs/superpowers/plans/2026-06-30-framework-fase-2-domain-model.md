# Framework Fase 2 Domain Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish the first stable domain layer for community permissions, athlete-account links, and session setup rules before building broader scalable product modules.

**Architecture:** This phase keeps `src/types.ts` as the current data contract, but moves selected business rules out of React hooks into pure `src/domain/*` modules. The domain modules have no Supabase, React, localStorage, or browser dependencies; hooks continue to orchestrate IO and call the pure rules. No new runtime library is introduced in this phase; Zod remains a candidate for Fase 3/4 once command/query boundaries exist.

**Tech Stack:** React 19, Vite 6, TypeScript, Node test runner with `tsx`, Vitest/Testing Library, Supabase as the cloud adapter outside the domain layer.

---

## Scope Check

This plan covers only:

- Fase 2 - Modelo de dominio.
- The first executable domain contracts for:
  - global role vs local community role,
  - athlete without account vs linked athlete vs pending link proposal,
  - session setup readiness and rule snapshot validation.

This plan intentionally does not:

- introduce TanStack Query, Zod, Dexie, or XState yet;
- migrate localStorage to IndexedDB;
- create a full command/query application layer;
- redesign the UI;
- change Supabase schema or RLS.

## File Structure

Create:

- `docs/architecture/domain-model.md` - canonical domain vocabulary and source-of-truth decisions.
- `src/domain/communityPermissions.ts` - pure permission derivation from auth role, community, and membership.
- `src/domain/communityPermissions.test.ts` - permission matrix regression tests.
- `src/domain/playerLink.ts` - pure athlete-account link decisions and local state transforms.
- `src/domain/playerLink.test.ts` - athlete link regression tests.
- `src/domain/sessionSetup.ts` - pure session setup validation for wizard steps and playable snapshots.
- `src/domain/sessionSetup.test.ts` - session setup regression tests.
- `src/domain/index.ts` - explicit exports for domain modules.

Modify:

- `package.json` - add the new domain tests to `test:unit`.
- `src/hooks/useCommunityPermissions.ts` - replace inline permission branching with `deriveCommunityPermissions`.
- `src/hooks/usePlayerLinkProposals.ts` - use `buildPlayerLinkProposal`, `linkPlayerToUser`, and `supersedePendingProposalsForLink`.
- `src/hooks/useSessionWizard.ts` - use `validateSessionWizardStep`.

Do not modify Supabase services, migrations, or UI components in this phase unless a task below names them.

## Task 1: Baseline and Domain Vocabulary

**Files:**
- Create: `docs/architecture/domain-model.md`
- Read only: `docs/superpowers/specs/2026-06-29-framework-profundo-design.md`
- Read only: `src/types.ts`

- [ ] **Step 1: Confirm clean baseline**

Run:

```powershell
git status --short --branch
npm run lint
npm run test:unit
```

Expected: `main...origin/main` with no dirty tracked files, typecheck passes, and unit tests pass.

- [ ] **Step 2: Create domain vocabulary document**

Create `docs/architecture/domain-model.md`:

```md
# Domain Model

This document records the product language used by the codebase. It is not a
database schema. It defines source-of-truth decisions so new code can move
business rules out of React components and IO services without changing behavior.

## Layers

- UI renders view models and sends user intentions.
- Application commands and queries orchestrate use cases.
- Domain modules hold pure business rules.
- Sync modules move local/cloud data and report issues.
- Storage adapters handle localStorage, Supabase, and future persistence engines.
- Supabase/Postgres enforce cloud authorization, constraints, and migrations.

## Identity

- `UserProfile` is an authenticated account profile.
- `AuthRole` is global: `master`, `programmer`, or `user`.
- Global role never replaces local community role.
- `master` can write globally.
- `programmer` is support/read-only in product UI.
- Normal users get write permission from `CommunityMember`.

## Communities

- `Community` is the organizational space.
- `CommunityMember` is the local role inside one community.
- Only active memberships grant write permissions.
- Pending, invited, and rejected memberships do not grant product mutations.
- Local-only communities keep local-first owner behavior.

## Athletes

- `Player` is the athlete identity. It may exist without an authenticated account.
- `Player.userId` links an athlete to one auth account.
- `PlayerLinkProposal` represents a request to bind a user to a player.
- Guest players cannot be linked to accounts.
- Direct self-link is local-only/creator-owned behavior; cloud players use RPC review flows.

## Sessions

- `Session` is a playable event.
- `Session.config` is the rules snapshot used for that event.
- A session cannot be ready for team generation without name, date, enough players,
  a matching config type, and a valid team count.
- Ranking and statistics remain derived from sessions, games, teams, point events,
  and reports. They are not primary write models.

## Sync

- `syncStatus` expresses local/cloud state, not product authorization.
- Failed upload items must remain local and pending.
- Cloud adapters may throw technical errors; domain modules return deterministic
  product decisions.
```

- [ ] **Step 3: Commit**

Run:

```powershell
git add -- docs/architecture/domain-model.md
git commit -m "docs(domain): define model vocabulary"
```

Expected: commit contains only `docs/architecture/domain-model.md`.

## Task 2: Community Permission Domain

**Files:**
- Create: `src/domain/communityPermissions.ts`
- Create: `src/domain/communityPermissions.test.ts`
- Modify: `package.json`
- Modify: `src/hooks/useCommunityPermissions.ts`
- Test: `node --import tsx --test src/domain/communityPermissions.test.ts`
- Test: `npm run lint`

- [ ] **Step 1: Write the permission tests**

Create `src/domain/communityPermissions.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveCommunityPermissions } from './communityPermissions';
import { Community, CommunityMember } from '../types';

const community: Pick<Community, 'id' | 'cloudId'> = {
  id: 'community-local',
  cloudId: 'community-cloud',
};

function member(overrides: Partial<CommunityMember>): CommunityMember {
  return {
    id: 'member-id',
    communityId: 'community-local',
    userId: 'user-1',
    role: 'member',
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

test('offline or anonymous local-first mode grants owner permissions', () => {
  const permissions = deriveCommunityPermissions({
    isSupabaseConfigured: false,
    userId: null,
    globalRole: null,
    community,
    members: [],
  });

  assert.equal(permissions.role, 'owner');
  assert.equal(permissions.canManageMembers, true);
  assert.equal(permissions.canCreateSession, true);
});

test('master has write access regardless of membership', () => {
  const permissions = deriveCommunityPermissions({
    isSupabaseConfigured: true,
    userId: 'master-user',
    globalRole: 'master',
    community,
    members: [],
  });

  assert.equal(permissions.isGlobalAdmin, true);
  assert.equal(permissions.canDeleteCommunity, true);
  assert.equal(permissions.canEditPlayerProfile, true);
});

test('programmer is read-only support in product permissions', () => {
  const permissions = deriveCommunityPermissions({
    isSupabaseConfigured: true,
    userId: 'support-user',
    globalRole: 'programmer',
    community,
    members: [member({ userId: 'support-user', role: 'owner' })],
  });

  assert.equal(permissions.role, null);
  assert.equal(permissions.canReadCommunity, true);
  assert.equal(permissions.canManageMembers, false);
  assert.equal(permissions.canCreateSession, false);
});

test('pending memberships do not grant write permissions', () => {
  const permissions = deriveCommunityPermissions({
    isSupabaseConfigured: true,
    userId: 'user-1',
    globalRole: 'user',
    community,
    members: [member({ status: 'pending', role: 'admin' })],
  });

  assert.equal(permissions.role, null);
  assert.equal(permissions.canReadCommunity, false);
  assert.equal(permissions.canEditRules, false);
});

test('active owner admin moderator and member roles map to product permissions', () => {
  const owner = deriveCommunityPermissions({
    isSupabaseConfigured: true,
    userId: 'user-1',
    globalRole: 'user',
    community,
    members: [member({ role: 'owner' })],
  });
  const admin = deriveCommunityPermissions({
    isSupabaseConfigured: true,
    userId: 'user-1',
    globalRole: 'user',
    community,
    members: [member({ role: 'admin' })],
  });
  const moderator = deriveCommunityPermissions({
    isSupabaseConfigured: true,
    userId: 'user-1',
    globalRole: 'user',
    community,
    members: [member({ role: 'moderator' })],
  });
  const regularMember = deriveCommunityPermissions({
    isSupabaseConfigured: true,
    userId: 'user-1',
    globalRole: 'user',
    community,
    members: [member({ role: 'member' })],
  });

  assert.equal(owner.canDeleteCommunity, true);
  assert.equal(admin.canManageMembers, true);
  assert.equal(admin.canDeleteCommunity, false);
  assert.equal(moderator.canCreateSession, true);
  assert.equal(moderator.canManageMembers, false);
  assert.equal(regularMember.canReadCommunity, true);
  assert.equal(regularMember.canCreateSession, false);
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```powershell
node --import tsx --test src/domain/communityPermissions.test.ts
```

Expected: FAIL because `src/domain/communityPermissions.ts` does not exist.

- [ ] **Step 3: Implement the permission domain**

Create `src/domain/communityPermissions.ts`:

```ts
import {
  AuthRole,
  Community,
  CommunityMember,
  CommunityMemberRole,
} from '../types';

export interface CommunityPermissionInput {
  isSupabaseConfigured: boolean;
  userId: string | null;
  globalRole?: AuthRole | null;
  community: Pick<Community, 'id' | 'cloudId'> | null;
  members: Pick<CommunityMember, 'userId' | 'role' | 'status'>[];
}

export interface CommunityPermissions {
  role: CommunityMemberRole | null;
  isGlobalAdmin: boolean;
  isSupabaseConfigured: boolean;
  canReadCommunity: boolean;
  canDeleteCommunity: boolean;
  canClearHistory: boolean;
  canManageMembers: boolean;
  canEditRules: boolean;
  canEditPlayerProfile: boolean;
  canEvaluatePlayer: boolean;
  canCreateSession: boolean;
}

function fullAccess(role: CommunityMemberRole, isGlobalAdmin = false): CommunityPermissions {
  return {
    role,
    isGlobalAdmin,
    isSupabaseConfigured: true,
    canReadCommunity: true,
    canDeleteCommunity: true,
    canClearHistory: true,
    canManageMembers: true,
    canEditRules: true,
    canEditPlayerProfile: true,
    canEvaluatePlayer: true,
    canCreateSession: true,
  };
}

function noWriteAccess(isSupabaseConfigured: boolean): CommunityPermissions {
  return {
    role: null,
    isGlobalAdmin: false,
    isSupabaseConfigured,
    canReadCommunity: isSupabaseConfigured,
    canDeleteCommunity: false,
    canClearHistory: false,
    canManageMembers: false,
    canEditRules: false,
    canEditPlayerProfile: false,
    canEvaluatePlayer: false,
    canCreateSession: false,
  };
}

export function deriveCommunityPermissions(
  input: CommunityPermissionInput,
): CommunityPermissions {
  if (!input.isSupabaseConfigured || !input.userId) {
    return { ...fullAccess('owner'), isSupabaseConfigured: false };
  }

  if (input.globalRole === 'master') {
    return fullAccess('admin', true);
  }

  if (input.globalRole === 'programmer') {
    return noWriteAccess(true);
  }

  if (!input.community?.cloudId) {
    return fullAccess('owner');
  }

  const communityRole =
    input.members.find(
      (member) => member.userId === input.userId && (member.status ?? 'active') === 'active',
    )?.role ?? null;

  if (!communityRole) {
    return { ...noWriteAccess(true), canReadCommunity: false };
  }

  const isOwner = communityRole === 'owner';
  const isAdmin = communityRole === 'admin';
  const isModerator = communityRole === 'moderator';

  return {
    role: communityRole,
    isGlobalAdmin: false,
    isSupabaseConfigured: true,
    canReadCommunity: true,
    canDeleteCommunity: isOwner,
    canClearHistory: isOwner,
    canManageMembers: isOwner || isAdmin,
    canEditRules: isOwner || isAdmin,
    canEditPlayerProfile: isOwner || isAdmin,
    canEvaluatePlayer: isOwner || isAdmin || isModerator,
    canCreateSession: isOwner || isAdmin || isModerator,
  };
}
```

- [ ] **Step 4: Add the test to `package.json`**

In `package.json`, add `src/domain/communityPermissions.test.ts` to the `test:unit` command after `src/logic/date.test.ts`.

- [ ] **Step 5: Update `useCommunityPermissions`**

Replace the inline permission branching in `src/hooks/useCommunityPermissions.ts` with:

```ts
import { useAuth } from './useAuth';
import { useCommunityMembers } from './useCommunityMembers';
import { Community } from '../types';
import { deriveCommunityPermissions } from '../domain/communityPermissions';

export function useCommunityPermissions(community: Community | null) {
  const auth = useAuth();
  const enabled = auth.isSupabaseConfigured && !!community?.cloudId;

  const { members } = useCommunityMembers({
    communityCloudId: community?.cloudId,
    communityLocalId: community?.id,
    currentUserId: auth.user?.id ?? null,
    enabled,
  });

  return deriveCommunityPermissions({
    isSupabaseConfigured: auth.isSupabaseConfigured,
    userId: auth.user?.id ?? null,
    globalRole: auth.profile?.role ?? null,
    community,
    members,
  });
}
```

- [ ] **Step 6: Verify**

Run:

```powershell
node --import tsx --test src/domain/communityPermissions.test.ts
npm run lint
npm run test:unit
```

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```powershell
git add -- package.json src/domain/communityPermissions.ts src/domain/communityPermissions.test.ts src/hooks/useCommunityPermissions.ts
git commit -m "feat(domain): derive community permissions"
```

Expected: commit contains only the listed files.

## Task 3: Athlete Link Domain

**Files:**
- Create: `src/domain/playerLink.ts`
- Create: `src/domain/playerLink.test.ts`
- Modify: `package.json`
- Modify: `src/hooks/usePlayerLinkProposals.ts`
- Test: `node --import tsx --test src/domain/playerLink.test.ts`
- Test: `npm run lint`

- [ ] **Step 1: Write the athlete link tests**

Create `src/domain/playerLink.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPlayerLinkProposal,
  canDirectlyLinkPlayer,
  linkPlayerToUser,
  supersedePendingProposalsForLink,
} from './playerLink';
import { makePlayer } from '../test/fixtures';
import { PlayerLinkProposal } from '../types';

const now = '2026-01-01T12:00:00.000Z';

function proposal(overrides: Partial<PlayerLinkProposal> = {}): PlayerLinkProposal {
  return {
    id: 'proposal-1',
    playerId: 'player-1',
    playerCloudId: 'player-cloud',
    userId: 'user-1',
    status: 'pending',
    createdAt: now,
    syncStatus: 'pending',
    ...overrides,
  };
}

test('direct player linking is allowed only for owner-owned or local unlinked players', () => {
  assert.equal(
    canDirectlyLinkPlayer(makePlayer('p1', { cloudOwnerId: 'user-1' }), 'user-1'),
    true,
  );
  assert.equal(canDirectlyLinkPlayer(makePlayer('p2', { cloudId: undefined }), 'user-1'), true);
  assert.equal(
    canDirectlyLinkPlayer(makePlayer('p3', { cloudId: 'cloud', cloudOwnerId: 'other' }), 'user-1'),
    false,
  );
});

test('buildPlayerLinkProposal rejects missing user and guest players', () => {
  assert.throws(() => buildPlayerLinkProposal(makePlayer('p1'), null, now, 'proposal-x'));
  assert.throws(() =>
    buildPlayerLinkProposal(makePlayer('p1', { isGuest: true }), 'user-1', now, 'proposal-x'),
  );
});

test('buildPlayerLinkProposal creates approved direct link or pending cloud proposal', () => {
  const local = buildPlayerLinkProposal(makePlayer('p1'), 'user-1', now, 'proposal-local');
  const cloud = buildPlayerLinkProposal(
    makePlayer('p2', { cloudId: 'player-cloud', cloudOwnerId: 'other' }),
    'user-1',
    now,
    'proposal-cloud',
  );

  assert.equal(local.status, 'approved');
  assert.equal(local.syncStatus, 'pending');
  assert.equal(cloud.status, 'pending');
  assert.equal(cloud.playerCloudId, 'player-cloud');
});

test('linkPlayerToUser changes only the target player and preserves sync intent', () => {
  const players = [
    makePlayer('p1', { userId: undefined }),
    makePlayer('p2', { userId: undefined }),
  ];
  const updated = linkPlayerToUser(players, 'p1', 'user-1', now);

  assert.equal(updated.find((player) => player.id === 'p1')?.userId, 'user-1');
  assert.equal(updated.find((player) => player.id === 'p1')?.syncStatus, 'pending');
  assert.equal(updated.find((player) => player.id === 'p2')?.userId, undefined);
});

test('supersedePendingProposalsForLink closes competing pending proposals', () => {
  const proposals = [
    proposal({ id: 'same-player', playerId: 'player-1', userId: 'other-user' }),
    proposal({ id: 'same-user', playerId: 'player-2', userId: 'user-1' }),
    proposal({ id: 'already-rejected', playerId: 'player-3', userId: 'user-3', status: 'rejected' }),
  ];
  const updated = supersedePendingProposalsForLink(
    proposals,
    { playerId: 'player-1', playerCloudId: 'player-cloud', userId: 'user-1' },
    'reviewer-1',
    now,
  );

  assert.equal(updated.find((item) => item.id === 'same-player')?.status, 'superseded');
  assert.equal(updated.find((item) => item.id === 'same-user')?.status, 'superseded');
  assert.equal(updated.find((item) => item.id === 'already-rejected')?.status, 'rejected');
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```powershell
node --import tsx --test src/domain/playerLink.test.ts
```

Expected: FAIL because `src/domain/playerLink.ts` does not exist.

- [ ] **Step 3: Implement the athlete link domain**

Create `src/domain/playerLink.ts`:

```ts
import { Player, PlayerLinkProposal } from '../types';

export interface LinkTarget {
  playerId: string;
  playerCloudId?: string;
  userId: string;
}

export function canDirectlyLinkPlayer(player: Player, userId: string | null): boolean {
  if (!userId) return false;
  return player.cloudOwnerId === userId || (!player.cloudId && !player.userId);
}

export function buildPlayerLinkProposal(
  player: Player,
  userId: string | null,
  nowIso: string,
  proposalId: string,
): PlayerLinkProposal {
  if (!userId) throw new Error('USER_NOT_AUTHENTICATED');
  if (player.isGuest) throw new Error('GUEST_PLAYER_CANNOT_BE_LINKED');

  return {
    id: proposalId,
    playerId: player.id,
    playerCloudId: player.cloudId,
    userId,
    status: canDirectlyLinkPlayer(player, userId) ? 'approved' : 'pending',
    createdAt: nowIso,
    syncStatus: 'pending',
  };
}

export function linkPlayerToUser(
  players: Player[],
  playerId: string,
  userId: string,
  nowIso: string,
): Player[] {
  return players.map((player) =>
    player.id === playerId
      ? { ...player, userId, syncStatus: 'pending', updatedAt: nowIso }
      : player,
  );
}

export function supersedePendingProposalsForLink(
  proposals: PlayerLinkProposal[],
  target: LinkTarget,
  reviewerId: string,
  nowIso: string,
): PlayerLinkProposal[] {
  return proposals.map((proposal) => {
    const samePlayer =
      proposal.playerId === target.playerId ||
      (!!proposal.playerCloudId && proposal.playerCloudId === target.playerCloudId);
    const sameUser = proposal.userId === target.userId;

    if (proposal.status === 'pending' && (samePlayer || sameUser)) {
      return {
        ...proposal,
        status: 'superseded',
        reviewedBy: reviewerId,
        reviewedAt: nowIso,
        syncStatus: proposal.syncStatus === 'pending' ? 'pending' : 'synced',
      };
    }

    return proposal;
  });
}
```

- [ ] **Step 4: Add the test to `package.json`**

In `package.json`, add `src/domain/playerLink.test.ts` to `test:unit` after `src/domain/communityPermissions.test.ts`.

- [ ] **Step 5: Update `usePlayerLinkProposals` propose path**

In `src/hooks/usePlayerLinkProposals.ts`, add:

```ts
import {
  buildPlayerLinkProposal,
  linkPlayerToUser,
} from '../domain/playerLink';
```

Inside `handleProposePlayerLink`, replace the local `isOwner`, `tempProposalId`, and `newProposal` construction with:

```ts
const now = new Date().toISOString();
const tempProposalId = `proposal-${generateUUID()}`;
const newProposal = buildPlayerLinkProposal(player, currentUserId, now, tempProposalId);
```

Replace the direct-link player update branch with:

```ts
if (newProposal.status === 'approved') {
  setPlayers((prev) => linkPlayerToUser(prev, playerId, currentUserId, now));
}
```

- [ ] **Step 6: Verify**

Run:

```powershell
node --import tsx --test src/domain/playerLink.test.ts
npm run lint
npm run test:unit
```

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```powershell
git add -- package.json src/domain/playerLink.ts src/domain/playerLink.test.ts src/hooks/usePlayerLinkProposals.ts
git commit -m "feat(domain): model athlete account links"
```

Expected: commit contains only the listed files.

## Task 4: Session Setup Domain

**Files:**
- Create: `src/domain/sessionSetup.ts`
- Create: `src/domain/sessionSetup.test.ts`
- Modify: `package.json`
- Modify: `src/hooks/useSessionWizard.ts`
- Test: `node --import tsx --test src/domain/sessionSetup.test.ts`
- Test: `npm run lint`

- [ ] **Step 1: Write session setup tests**

Create `src/domain/sessionSetup.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateSessionWizardStep, hasPlayableRuleSnapshot } from './sessionSetup';
import { makeFreePlayConfig, makeSession } from '../test/fixtures';

test('step 0 requires name and date', () => {
  const errors = validateSessionWizardStep(
    makeSession('s1', { name: ' ', date: '' }),
    0,
  );

  assert.equal(errors.name, 'O nome da sessao e obrigatorio.');
  assert.equal(errors.date, 'A data e obrigatoria.');
});

test('step 1 requires at least four selected athletes', () => {
  const errors = validateSessionWizardStep(
    makeSession('s1', { selectedPlayerIds: ['p1', 'p2', 'p3'] }),
    1,
  );

  assert.equal(errors.players, 'Selecione pelo menos 4 atletas.');
});

test('free play step 3 requires enough players and at least three teams', () => {
  const errors = validateSessionWizardStep(
    makeSession('s1', {
      type: 'free_play',
      selectedPlayerIds: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'],
      config: makeFreePlayConfig({ teamCount: 2 }),
    }),
    3,
  );

  assert.equal(errors.teamCount, 'Jogo livre exige pelo menos 3 times.');
});

test('tournament group formats require at least four teams', () => {
  const errors = validateSessionWizardStep(
    makeSession('s1', {
      type: 'tournament',
      selectedPlayerIds: Array.from({ length: 12 }, (_, index) => `p${index}`),
      config: {
        type: 'tournament',
        format: 'group_stage',
        teamCount: 3,
        useGroupStage: true,
        roundTrip: false,
        maxPoints: 12,
        tieBreakMethod: 'direct_3',
        hasFinal: true,
        hasThirdPlaceMatch: true,
        classificationPoints: { win: 3, loss: 0 },
        standingsRules: ['wins'],
      },
    }),
    3,
  );

  assert.equal(errors.teamCount, 'Fase de grupos exige pelo menos 4 times.');
});

test('hasPlayableRuleSnapshot requires matching session and config types', () => {
  assert.equal(
    hasPlayableRuleSnapshot(
      makeSession('s1', {
        type: 'free_play',
        config: makeFreePlayConfig({ type: 'free_play' }),
      }),
    ),
    true,
  );
  assert.equal(
    hasPlayableRuleSnapshot(
      makeSession('s2', {
        type: 'tournament',
        config: makeFreePlayConfig({ type: 'free_play' }),
      }),
    ),
    false,
  );
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```powershell
node --import tsx --test src/domain/sessionSetup.test.ts
```

Expected: FAIL because `src/domain/sessionSetup.ts` does not exist.

- [ ] **Step 3: Implement session setup domain**

Create `src/domain/sessionSetup.ts`:

```ts
import { FreePlayConfig, Session, TournamentConfig } from '../types';

export type SessionValidationErrors = Record<string, string>;

export function hasPlayableRuleSnapshot(session: Session | null): boolean {
  if (!session?.config || !session.type) return false;
  return session.config.type === session.type;
}

export function validateSessionWizardStep(
  session: Session | null,
  wizardStep: number,
): SessionValidationErrors {
  if (!session) return {};

  const errors: SessionValidationErrors = {};

  if (wizardStep === 0) {
    if (!session.name.trim()) errors.name = 'O nome da sessao e obrigatorio.';
    if (!session.date) errors.date = 'A data e obrigatoria.';
  }

  if (wizardStep === 1 && session.selectedPlayerIds.length < 4) {
    errors.players = 'Selecione pelo menos 4 atletas.';
  }

  if (wizardStep === 3) {
    const teamCount = session.config?.teamCount ?? 0;
    const minPlayers = session.type === 'tournament' ? 3 : 3;

    if (!hasPlayableRuleSnapshot(session)) {
      errors.config = 'As regras da sessao precisam corresponder ao tipo da sessao.';
    }

    if (session.selectedPlayerIds.length < teamCount * minPlayers) {
      errors.teamCount = `Para ${teamCount} times, selecione pelo menos ${
        teamCount * minPlayers
      } jogadores.`;
    }

    if (session.type === 'free_play' && teamCount < 3) {
      errors.teamCount = 'Jogo livre exige pelo menos 3 times.';
    }

    if (session.type === 'tournament' && teamCount < 2) {
      errors.teamCount = 'Torneio exige pelo menos 2 times.';
    }

    if (session.type === 'tournament' && session.config?.type === 'tournament') {
      const cfg = session.config as TournamentConfig;
      if ((cfg.format === 'groups_knockout' || cfg.format === 'group_stage') && teamCount < 4) {
        errors.teamCount = 'Fase de grupos exige pelo menos 4 times.';
      }
    }
  }

  return errors;
}

export function getFreePlaySetupConfig(session: Session): FreePlayConfig | null {
  return session.type === 'free_play' && session.config?.type === 'free_play'
    ? session.config
    : null;
}
```

- [ ] **Step 4: Add the test to `package.json`**

In `package.json`, add `src/domain/sessionSetup.test.ts` to `test:unit` after `src/domain/playerLink.test.ts`.

- [ ] **Step 5: Update `useSessionWizard` validation**

In `src/hooks/useSessionWizard.ts`, add:

```ts
import { validateSessionWizardStep } from '../domain/sessionSetup';
```

Replace the body of `validateCurrentStep` with:

```ts
const validateCurrentStep = () => {
  const errors = validateSessionWizardStep(activeSession, wizardStep);
  setValidationErrors(errors);
  return Object.keys(errors).length === 0;
};
```

- [ ] **Step 6: Verify**

Run:

```powershell
node --import tsx --test src/domain/sessionSetup.test.ts
npm run lint
npm run test:unit
```

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```powershell
git add -- package.json src/domain/sessionSetup.ts src/domain/sessionSetup.test.ts src/hooks/useSessionWizard.ts
git commit -m "feat(domain): validate session setup rules"
```

Expected: commit contains only the listed files.

## Task 5: Domain Exports and Boundary Guard

**Files:**
- Create: `src/domain/index.ts`
- Test: source scans
- Test: `npm run lint`

- [ ] **Step 1: Create explicit domain exports**

Create `src/domain/index.ts`:

```ts
export * from './communityPermissions';
export * from './playerLink';
export * from './sessionSetup';
```

- [ ] **Step 2: Verify domain modules do not import IO or React**

Run:

```powershell
rg -n "from 'react'|from \"react\"|supabase|localStorage|window\\." src/domain
```

Expected: no matches.

- [ ] **Step 3: Verify typecheck**

Run:

```powershell
npm run lint
```

Expected: PASS.

- [ ] **Step 4: Commit**

Run:

```powershell
git add -- src/domain/index.ts
git commit -m "chore(domain): expose domain modules"
```

Expected: commit contains only `src/domain/index.ts`.

## Task 6: Final Fase 2 Verification

**Files:**
- Read only: all changed files
- Test: full verification commands

- [ ] **Step 1: Run typecheck**

Run:

```powershell
npm run lint
```

Expected: PASS.

- [ ] **Step 2: Run ESLint quiet mode**

Run:

```powershell
npm run lint:eslint -- --quiet
```

Expected: PASS.

- [ ] **Step 3: Run unit tests**

Run:

```powershell
npm run test:unit
```

Expected: PASS.

- [ ] **Step 4: Run UI tests**

Run:

```powershell
npm run test:ui
```

Expected: PASS.

- [ ] **Step 5: Run production build**

Run:

```powershell
npm run build
```

Expected: PASS. Existing chunk-size warning is acceptable if unchanged.

- [ ] **Step 6: Record dependency audit state**

Run:

```powershell
npm audit --audit-level=moderate
```

Expected: still may FAIL with the known Vite, esbuild, and Babel advisories. Do not fix dependencies in this Fase 2 plan unless the user explicitly expands scope.

- [ ] **Step 7: Review final history and status**

Run:

```powershell
git status --short --branch
git log --oneline -8
```

Expected: only intentional Fase 2 commits are ahead of `origin/main`.

## Self-Review

Spec coverage:

- Fase 2 domain vocabulary is covered by Task 1.
- Global vs local roles are covered by Task 2.
- Athlete without account vs linked athlete vs proposal is covered by Task 3.
- Session rule snapshot and setup readiness are covered by Task 4.
- Domain boundary guard is covered by Task 5.
- Final gates are covered by Task 6.

Placeholder scan:

- This plan contains no TODO/TBD/fill-later implementation steps.

Type consistency:

- `AuthRole`, `CommunityMemberRole`, `Player`, `PlayerLinkProposal`, `Session`, `FreePlayConfig`, and `TournamentConfig` are imported from the existing `src/types.ts`.
- The hook changes preserve existing public hook return shapes.
- New domain modules depend only on existing project types and pure data inputs.

Library decision:

- No new dependency is introduced in Fase 2.
- Zod remains recommended for Fase 3/4 command/query and cloud/local boundary validation.
- TanStack Query remains deferred until cloud state is moved out of components/hooks.
