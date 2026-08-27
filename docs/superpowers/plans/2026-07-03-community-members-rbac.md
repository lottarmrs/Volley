# Community Members RBAC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate community membership and local RBAC into application-layer contracts and a UI-facing View Model without changing the visual design or Supabase schema.

**Architecture:** Keep `src/domain/communityPermissions.ts` as the pure permission source. Add `src/application/communityMembershipUseCases.ts` for cloud membership commands/queries and `src/application/communityMembersViewModel.ts` for render-ready panel state. Refactor `useCommunityMembers` and `CommunityMembersPanel` to call these contracts while continuing to use existing Supabase adapters.

**Tech Stack:** React 19, Vite, TypeScript, Node test runner with `tsx`, Vitest/Testing Library if JSX changes become risky, existing Supabase JS adapters. No new runtime library in this slice.

---

## Scope Check

This plan implements only the first Fase 4 slice:

- Community members.
- Local community RBAC.
- Application use cases for membership commands/queries.
- View Model for the existing member panel.

This plan intentionally does not:

- add TanStack Query, Zod, Dexie, or XState;
- redesign `CommunityMembersPanel`;
- create or apply new Supabase migrations;
- change RLS in the real Supabase project;
- migrate local storage;
- refactor unrelated community flows.

## File Structure

Create:

- `src/application/communityMembersViewModel.ts`
  - Builds render-ready state for the members panel from auth, community, members, players, and domain permissions.
- `src/application/communityMembersViewModel.test.ts`
  - Tests role capabilities, active/pending split, member editability, blocked states, and athlete labels.
- `src/application/communityMembershipUseCases.ts`
  - Commands/queries for member fetch, invite, role change, removal, join requests, join code, public discovery, and leave.
- `src/application/communityMembershipUseCases.test.ts`
  - Tests product errors, gateway calls, technical failures, and safe blockers for owner/self operations.

Modify:

- `src/application/index.ts`
  - Export the new application modules.
- `package.json`
  - Add the new application tests to `test:unit`.
- `src/hooks/useCommunityMembers.ts`
  - Delegate fetch/mutations to application use cases and reuse the View Model contract where useful.
- `src/components/community/CommunityMembersPanel.tsx`
  - Use the View Model instead of recalculating role order, current member, `canManage`, `canLeave`, and athlete labels in JSX.
- `docs/architecture/domain-model.md`
  - Record that membership operations now have an application-layer boundary and that direct table update/delete is isolated behind gateways pending a later RPC slice.

Do not modify Supabase migrations in this plan.

## Task 0: Prepare Workspace And Baseline

**Files:**
- Read only: `docs/superpowers/specs/2026-07-03-community-members-rbac-design.md`
- Read only: `package.json`

- [ ] **Step 1: Create an isolated worktree**

Run from `C:\Users\Matheus Silva\antigravity\Volley`:

```powershell
git worktree add .worktrees\community-members-rbac -b codex/community-members-rbac main
```

Expected: a new worktree at `.worktrees\community-members-rbac` on branch `codex/community-members-rbac`.

- [ ] **Step 2: Enter the worktree**

```powershell
Set-Location .worktrees\community-members-rbac
```

Expected: current directory is `C:\Users\Matheus Silva\antigravity\Volley\.worktrees\community-members-rbac`.

- [ ] **Step 3: Run baseline checks**

Run:

```powershell
npm run lint
node --import tsx --test src/domain/communityPermissions.test.ts
```

Expected: both pass before changes. If either fails, stop and inspect before editing.

## Task 1: Community Members View Model

**Files:**
- Create: `src/application/communityMembersViewModel.test.ts`
- Create: `src/application/communityMembersViewModel.ts`
- Modify: `package.json`
- Modify: `src/application/index.ts`
- Test: `node --import tsx --test src/application/communityMembersViewModel.test.ts`

- [ ] **Step 1: Write the failing View Model tests**

Create `src/application/communityMembersViewModel.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCommunityMembersViewModel } from './communityMembersViewModel';
import type { Community, CommunityMember, Player } from '../types';

const community: Community = {
  id: 'community-local',
  cloudId: 'community-cloud',
  name: 'Terça Forte',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function member(overrides: Partial<CommunityMember>): CommunityMember {
  return {
    id: overrides.id ?? 'member-1',
    communityId: 'community-local',
    userId: overrides.userId ?? 'user-1',
    role: overrides.role ?? 'member',
    status: overrides.status ?? 'active',
    name: overrides.name ?? null,
    email: overrides.email ?? null,
    invitedBy: overrides.invitedBy ?? null,
    createdAt: overrides.createdAt ?? '2026-01-01T00:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-01-01T00:00:00.000Z',
  };
}

function player(overrides: Partial<Player>): Player {
  return {
    id: overrides.id ?? 'player-1',
    nome: overrides.nome ?? 'Ana Silva',
    apelido: overrides.apelido ?? 'Ana',
    genero: 'F',
    ativo: true,
    posicaoPrincipal: 'ponteiro',
    posicoesSecundarias: [],
    maoDominante: 'direita',
    atributos: {
      saque: 50,
      recepcao: 50,
      levantamento: 50,
      ataque: 50,
      bloqueio: 50,
      defesa: 50,
      velocidade: 50,
      resistencia: 50,
      leituraDeJogo: 50,
      regularidade: 50,
      controleEmocional: 50,
    },
    perfil: {
      nivel: 50,
      classe: 'C',
      arquetipo: 'Equilibrada',
      especialidade: 'Passe',
      fraqueza: 'Bloqueio',
    },
    formaAtual: { valor: 50, observacao: '', ultimasPartidas: [] },
    status: { lesionado: false, limitacaoFisica: null, presencaFrequente: true },
    metadata: {
      criadoEm: '2026-01-01T00:00:00.000Z',
      atualizadoEm: '2026-01-01T00:00:00.000Z',
    },
    ...overrides,
  };
}

test('view model returns cloud disabled state when Supabase is unavailable', () => {
  const vm = buildCommunityMembersViewModel({
    community,
    members: [],
    players: [],
    currentUserId: null,
    isSupabaseConfigured: false,
    globalRole: null,
  });

  assert.equal(vm.state, 'cloud_disabled');
  assert.equal(vm.canManage, false);
  assert.equal(vm.blockedMessage, 'Conecte uma conta na nuvem para gerenciar membros desta comunidade.');
});

test('view model returns not synced state when community has no cloud id', () => {
  const vm = buildCommunityMembersViewModel({
    community: { ...community, cloudId: undefined },
    members: [],
    players: [],
    currentUserId: 'owner-1',
    isSupabaseConfigured: true,
    globalRole: 'user',
  });

  assert.equal(vm.state, 'community_not_synced');
  assert.equal(vm.canManage, false);
  assert.match(vm.blockedMessage ?? '', /Sincronize esta comunidade/);
});

test('view model separates active members from pending requests and sorts active members by role', () => {
  const vm = buildCommunityMembersViewModel({
    community,
    members: [
      member({ id: 'member-regular', userId: 'regular-1', role: 'member', name: 'Zeca' }),
      member({ id: 'member-owner', userId: 'owner-1', role: 'owner', name: 'Ana' }),
      member({ id: 'member-pending', userId: 'pending-1', role: 'member', status: 'pending' }),
      member({ id: 'member-admin', userId: 'admin-1', role: 'admin', name: 'Bruno' }),
    ],
    players: [],
    currentUserId: 'owner-1',
    isSupabaseConfigured: true,
    globalRole: 'user',
  });

  assert.equal(vm.state, 'ready');
  assert.deepEqual(
    vm.activeMembers.map((row) => row.member.id),
    ['member-owner', 'member-admin', 'member-regular'],
  );
  assert.deepEqual(
    vm.pendingRequests.map((row) => row.member.id),
    ['member-pending'],
  );
});

test('owner can manage others but cannot edit owner or self', () => {
  const vm = buildCommunityMembersViewModel({
    community,
    members: [
      member({ id: 'owner-row', userId: 'owner-1', role: 'owner' }),
      member({ id: 'admin-row', userId: 'admin-1', role: 'admin' }),
    ],
    players: [],
    currentUserId: 'owner-1',
    isSupabaseConfigured: true,
    globalRole: 'user',
  });

  assert.equal(vm.canManage, true);
  assert.equal(vm.canLeave, false);
  assert.equal(vm.activeMembers[0].isSelf, true);
  assert.equal(vm.activeMembers[0].canChangeRole, false);
  assert.equal(vm.activeMembers[0].canRemove, false);
  assert.equal(vm.activeMembers[1].canChangeRole, true);
  assert.deepEqual(vm.activeMembers[1].assignableRoles, ['admin', 'moderator', 'member']);
});

test('moderator can leave but cannot manage members', () => {
  const vm = buildCommunityMembersViewModel({
    community,
    members: [member({ userId: 'moderator-1', role: 'moderator' })],
    players: [],
    currentUserId: 'moderator-1',
    isSupabaseConfigured: true,
    globalRole: 'user',
  });

  assert.equal(vm.canManage, false);
  assert.equal(vm.canLeave, true);
  assert.equal(vm.activeMembers[0].roleLabel, 'Moderador');
});

test('programmer sees read-only support state even if membership says owner', () => {
  const vm = buildCommunityMembersViewModel({
    community,
    members: [member({ userId: 'support-1', role: 'owner' })],
    players: [],
    currentUserId: 'support-1',
    isSupabaseConfigured: true,
    globalRole: 'programmer',
  });

  assert.equal(vm.canManage, false);
  assert.equal(vm.canLeave, false);
  assert.equal(vm.currentMember, null);
});

test('member row exposes linked athlete label by user id', () => {
  const vm = buildCommunityMembersViewModel({
    community,
    members: [member({ userId: 'athlete-user', role: 'member' })],
    players: [player({ userId: 'athlete-user', apelido: 'Foguete' })],
    currentUserId: 'athlete-user',
    isSupabaseConfigured: true,
    globalRole: 'user',
  });

  assert.equal(vm.activeMembers[0].athleteLabel, 'Foguete');
});
```

- [ ] **Step 2: Run the View Model tests and verify RED**

Run:

```powershell
node --import tsx --test src/application/communityMembersViewModel.test.ts
```

Expected: FAIL because `src/application/communityMembersViewModel.ts` does not exist.

- [ ] **Step 3: Implement the View Model**

Create `src/application/communityMembersViewModel.ts`:

```ts
import type {
  AuthRole,
  Community,
  CommunityMember,
  CommunityMemberRole,
  Player,
} from '../types';
import {
  deriveCommunityPermissions,
  type CommunityPermissions,
} from '../domain/communityPermissions';

export type CommunityMembersPanelState = 'cloud_disabled' | 'community_not_synced' | 'ready';

export interface CommunityMemberRowViewModel {
  member: CommunityMember;
  displayName: string;
  secondaryText: string | null;
  initials: string;
  roleLabel: string;
  roleBadgeClass: string;
  isSelf: boolean;
  isOwner: boolean;
  canChangeRole: boolean;
  canRemove: boolean;
  assignableRoles: CommunityMemberRole[];
  athleteLabel: string | null;
}

export interface CommunityMembersViewModel {
  state: CommunityMembersPanelState;
  blockedMessage: string | null;
  permissions: CommunityPermissions;
  currentMember: CommunityMember | null;
  canManage: boolean;
  canLeave: boolean;
  activeMembers: CommunityMemberRowViewModel[];
  pendingRequests: CommunityMemberRowViewModel[];
  assignableRoles: CommunityMemberRole[];
}

export interface CommunityMembersViewModelInput {
  community: Community;
  members: CommunityMember[];
  players: Player[];
  currentUserId: string | null;
  isSupabaseConfigured: boolean;
  globalRole?: AuthRole | null;
}

export const COMMUNITY_ROLE_LABELS: Record<CommunityMemberRole, string> = {
  owner: 'Dono',
  admin: 'Admin',
  moderator: 'Moderador',
  member: 'Membro',
};

export const COMMUNITY_ROLE_BADGE_CLASSES: Record<CommunityMemberRole, string> = {
  owner: 'badge-primary',
  admin: 'badge-accent badge-soft',
  moderator: 'badge-outline',
  member: 'badge-ghost',
};

export const ASSIGNABLE_COMMUNITY_MEMBER_ROLES: CommunityMemberRole[] = [
  'admin',
  'moderator',
  'member',
];

const ROLE_ORDER: Record<CommunityMemberRole, number> = {
  owner: 0,
  admin: 1,
  moderator: 2,
  member: 3,
};

export function buildCommunityMembersViewModel(
  input: CommunityMembersViewModelInput,
): CommunityMembersViewModel {
  const permissions = deriveCommunityPermissions({
    isSupabaseConfigured: input.isSupabaseConfigured,
    userId: input.currentUserId,
    globalRole: input.globalRole ?? null,
    community: input.community,
    members: input.members,
  });

  const base = {
    permissions,
    currentMember: null,
    canManage: false,
    canLeave: false,
    activeMembers: [] as CommunityMemberRowViewModel[],
    pendingRequests: [] as CommunityMemberRowViewModel[],
    assignableRoles: ASSIGNABLE_COMMUNITY_MEMBER_ROLES,
  };

  if (!input.isSupabaseConfigured) {
    return {
      ...base,
      state: 'cloud_disabled',
      blockedMessage: 'Conecte uma conta na nuvem para gerenciar membros desta comunidade.',
    };
  }

  if (!input.community.cloudId) {
    return {
      ...base,
      state: 'community_not_synced',
      blockedMessage:
        'Sincronize esta comunidade com a nuvem antes de gerenciar membros.',
    };
  }

  const currentMember =
    input.members.find(
      (member) =>
        member.userId === input.currentUserId && (member.status ?? 'active') === 'active',
    ) ?? null;
  const canManage = permissions.canManageMembers;
  const canLeave = !!currentMember && currentMember.role !== 'owner' && permissions.role !== null;

  const playersByUserId = new Map(
    input.players
      .filter((player) => player.userId && !player.deletedAt)
      .map((player) => [player.userId as string, player]),
  );

  const toRow = (member: CommunityMember): CommunityMemberRowViewModel => {
    const isSelf = member.userId === input.currentUserId;
    const isOwner = member.role === 'owner';
    const athlete = playersByUserId.get(member.userId);
    return {
      member,
      displayName: member.name || member.email || 'Membro',
      secondaryText: member.email && member.name ? member.email : null,
      initials: initialsForMember(member),
      roleLabel: COMMUNITY_ROLE_LABELS[member.role],
      roleBadgeClass: COMMUNITY_ROLE_BADGE_CLASSES[member.role],
      isSelf,
      isOwner,
      canChangeRole: canManage && !isSelf && !isOwner,
      canRemove: canManage && !isSelf && !isOwner,
      assignableRoles: ASSIGNABLE_COMMUNITY_MEMBER_ROLES,
      athleteLabel: athlete ? athlete.apelido || athlete.nome : null,
    };
  };

  const activeMembers = input.members
    .filter((member) => (member.status ?? 'active') === 'active')
    .map(toRow)
    .sort(compareMemberRows);
  const pendingRequests = input.members
    .filter((member) => member.status === 'pending')
    .map(toRow)
    .sort(compareMemberRows);

  return {
    ...base,
    state: 'ready',
    blockedMessage: null,
    currentMember: permissions.role === null ? null : currentMember,
    canManage,
    canLeave,
    activeMembers,
    pendingRequests,
  };
}

function initialsForMember(member: CommunityMember): string {
  const base = member.name || member.email || '?';
  return base.slice(0, 2).toUpperCase();
}

function compareMemberRows(
  a: CommunityMemberRowViewModel,
  b: CommunityMemberRowViewModel,
): number {
  return (
    (ROLE_ORDER[a.member.role] ?? 9) - (ROLE_ORDER[b.member.role] ?? 9) ||
    a.displayName.localeCompare(b.displayName)
  );
}
```

- [ ] **Step 4: Export the View Model**

Modify `src/application/index.ts`:

```ts
export * from './appResult';
export * from './communityMembersViewModel';
export * from './playerLinkUseCases';
export * from './playerLinkViewModel';
```

- [ ] **Step 5: Add the View Model test to `test:unit`**

In `package.json`, update `scripts.test:unit` so it includes:

```text
src/application/communityMembersViewModel.test.ts
```

Place it after `src/application/appResult.test.ts`.

- [ ] **Step 6: Run the View Model tests and verify GREEN**

Run:

```powershell
node --import tsx --test src/application/communityMembersViewModel.test.ts
```

Expected: 7 tests pass.

- [ ] **Step 7: Run focused domain/application tests**

Run:

```powershell
node --import tsx --test src/application/appResult.test.ts src/application/communityMembersViewModel.test.ts src/domain/communityPermissions.test.ts
```

Expected: all pass.

- [ ] **Step 8: Commit Task 1**

Run:

```powershell
git add package.json src/application/index.ts src/application/communityMembersViewModel.ts src/application/communityMembersViewModel.test.ts
git commit -m "feat(app): add community members view model"
```

## Task 2: Community Membership Use Cases

**Files:**
- Create: `src/application/communityMembershipUseCases.test.ts`
- Create: `src/application/communityMembershipUseCases.ts`
- Modify: `package.json`
- Modify: `src/application/index.ts`
- Test: `node --import tsx --test src/application/communityMembershipUseCases.test.ts`

- [ ] **Step 1: Write the failing use-case tests**

Create `src/application/communityMembershipUseCases.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  approveCommunityJoinRequestCommand,
  changeCommunityMemberRoleCommand,
  disableCommunityJoinCodeCommand,
  fetchCommunityMembersQuery,
  generateCommunityJoinCodeCommand,
  inviteCommunityMemberCommand,
  leaveCommunityCommand,
  rejectCommunityJoinRequestCommand,
  removeCommunityMemberCommand,
  requestCommunityJoinByCodeCommand,
  requestPublicCommunityJoinCommand,
  searchPublicCommunitiesQuery,
} from './communityMembershipUseCases';
import type { CommunityMember, CommunityMemberRole } from '../types';

function member(overrides: Partial<CommunityMember> = {}): CommunityMember {
  return {
    id: overrides.id ?? 'member-1',
    communityId: overrides.communityId ?? 'community-local',
    userId: overrides.userId ?? 'user-1',
    role: overrides.role ?? 'member',
    status: overrides.status ?? 'active',
    name: overrides.name ?? null,
    email: overrides.email ?? null,
    invitedBy: overrides.invitedBy ?? null,
    createdAt: overrides.createdAt ?? '2026-01-01T00:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-01-01T00:00:00.000Z',
  };
}

function membershipGateway(calls: string[] = []) {
  return {
    fetchByCommunity: async (communityCloudId: string, communityLocalId?: string) => {
      calls.push(`fetch:${communityCloudId}:${communityLocalId ?? ''}`);
      return [member({ id: 'member-fetched' })];
    },
    addMemberByEmail: async (
      communityCloudId: string,
      email: string,
      role: CommunityMemberRole,
      communityLocalId?: string,
    ) => {
      calls.push(`invite:${communityCloudId}:${email}:${role}:${communityLocalId ?? ''}`);
      return member({ id: 'member-invited', email, role });
    },
    updateRole: async (memberId: string, role: CommunityMemberRole) => {
      calls.push(`role:${memberId}:${role}`);
      return member({ id: memberId, role });
    },
    removeMember: async (memberId: string) => {
      calls.push(`remove:${memberId}`);
    },
    approveRequest: async (memberId: string) => {
      calls.push(`approve:${memberId}`);
    },
    rejectRequest: async (memberId: string) => {
      calls.push(`reject:${memberId}`);
    },
    generateJoinCode: async (communityCloudId: string) => {
      calls.push(`generate:${communityCloudId}`);
      return 'ABCD1234';
    },
    disableJoinCode: async (communityCloudId: string) => {
      calls.push(`disable:${communityCloudId}`);
    },
    leaveCommunity: async (communityCloudId: string) => {
      calls.push(`leave:${communityCloudId}`);
    },
    findByCode: async (code: string) => {
      calls.push(`find:${code}`);
      return { id: 'community-cloud', name: 'Terça', description: null, memberCount: 3, myStatus: null };
    },
    requestToJoin: async (code: string, communityLocalId?: string) => {
      calls.push(`join-code:${code}:${communityLocalId ?? ''}`);
      return member({ status: 'pending' });
    },
  };
}

function discoveryGateway(calls: string[] = []) {
  return {
    searchPublic: async (query: string) => {
      calls.push(`search:${query}`);
      return [{ id: 'community-cloud', name: 'Terça', description: null, memberCount: 2, myStatus: null }];
    },
    requestToJoinPublic: async (communityCloudId: string) => {
      calls.push(`join-public:${communityCloudId}`);
    },
  };
}

test('fetchCommunityMembersQuery returns members from gateway', async () => {
  const calls: string[] = [];
  const result = await fetchCommunityMembersQuery(
    { communityCloudId: 'community-cloud', communityLocalId: 'community-local' },
    membershipGateway(calls),
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.members[0].id, 'member-fetched');
  assert.deepEqual(calls, ['fetch:community-cloud:community-local']);
});

test('fetchCommunityMembersQuery returns recoverable empty state on cloud failure', async () => {
  const result = await fetchCommunityMembersQuery(
    { communityCloudId: 'community-cloud', communityLocalId: 'community-local' },
    {
      ...membershipGateway(),
      fetchByCommunity: async () => {
        throw new Error('network');
      },
    },
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.value.members, []);
  assert.equal(result.issues?.[0].code, 'cloud_unavailable');
});

test('inviteCommunityMemberCommand normalizes email and calls gateway', async () => {
  const calls: string[] = [];
  const result = await inviteCommunityMemberCommand(
    {
      communityCloudId: 'community-cloud',
      communityLocalId: 'community-local',
      email: ' ANA@EXAMPLE.COM ',
      role: 'moderator',
    },
    membershipGateway(calls),
  );

  assert.equal(result.ok, true);
  assert.deepEqual(calls, ['invite:community-cloud:ana@example.com:moderator:community-local']);
});

test('inviteCommunityMemberCommand rejects empty email and owner role', async () => {
  const empty = await inviteCommunityMemberCommand(
    { communityCloudId: 'community-cloud', email: ' ', role: 'member' },
    membershipGateway(),
  );
  const owner = await inviteCommunityMemberCommand(
    { communityCloudId: 'community-cloud', email: 'ana@example.com', role: 'owner' },
    membershipGateway(),
  );

  assert.equal(empty.ok, false);
  if (!empty.ok) assert.equal(empty.error.code, 'invalid_input');
  assert.equal(owner.ok, false);
  if (!owner.ok) assert.equal(owner.error.code, 'permission_denied');
});

test('changeCommunityMemberRoleCommand blocks owner, self, and owner target role', async () => {
  const members = [
    member({ id: 'owner-row', userId: 'owner-1', role: 'owner' }),
    member({ id: 'self-row', userId: 'self-1', role: 'admin' }),
  ];

  const owner = await changeCommunityMemberRoleCommand(
    { members, currentUserId: 'self-1', memberId: 'owner-row', role: 'admin' },
    membershipGateway(),
  );
  const self = await changeCommunityMemberRoleCommand(
    { members, currentUserId: 'self-1', memberId: 'self-row', role: 'moderator' },
    membershipGateway(),
  );
  const targetOwner = await changeCommunityMemberRoleCommand(
    { members, currentUserId: 'self-1', memberId: 'self-row', role: 'owner' },
    membershipGateway(),
  );

  assert.equal(owner.ok, false);
  if (!owner.ok) assert.equal(owner.error.code, 'permission_denied');
  assert.equal(self.ok, false);
  if (!self.ok) assert.equal(self.error.code, 'permission_denied');
  assert.equal(targetOwner.ok, false);
  if (!targetOwner.ok) assert.equal(targetOwner.error.code, 'permission_denied');
});

test('changeCommunityMemberRoleCommand calls gateway for editable member', async () => {
  const calls: string[] = [];
  const result = await changeCommunityMemberRoleCommand(
    {
      members: [member({ id: 'member-row', userId: 'member-1', role: 'member' })],
      currentUserId: 'admin-1',
      memberId: 'member-row',
      role: 'moderator',
    },
    membershipGateway(calls),
  );

  assert.equal(result.ok, true);
  assert.deepEqual(calls, ['role:member-row:moderator']);
});

test('removeCommunityMemberCommand blocks owner and self', async () => {
  const members = [
    member({ id: 'owner-row', userId: 'owner-1', role: 'owner' }),
    member({ id: 'self-row', userId: 'self-1', role: 'admin' }),
  ];

  const owner = await removeCommunityMemberCommand(
    { members, currentUserId: 'self-1', memberId: 'owner-row' },
    membershipGateway(),
  );
  const self = await removeCommunityMemberCommand(
    { members, currentUserId: 'self-1', memberId: 'self-row' },
    membershipGateway(),
  );

  assert.equal(owner.ok, false);
  if (!owner.ok) assert.equal(owner.error.code, 'permission_denied');
  assert.equal(self.ok, false);
  if (!self.ok) assert.equal(self.error.code, 'permission_denied');
});

test('approve and reject commands call gateway', async () => {
  const calls: string[] = [];
  const gateway = membershipGateway(calls);

  await approveCommunityJoinRequestCommand({ memberId: 'pending-1' }, gateway);
  await rejectCommunityJoinRequestCommand({ memberId: 'pending-2' }, gateway);

  assert.deepEqual(calls, ['approve:pending-1', 'reject:pending-2']);
});

test('join code commands require cloud community id and call gateway', async () => {
  const missing = await generateCommunityJoinCodeCommand({ communityCloudId: undefined }, membershipGateway());
  const calls: string[] = [];
  const generated = await generateCommunityJoinCodeCommand(
    { communityCloudId: 'community-cloud' },
    membershipGateway(calls),
  );
  await disableCommunityJoinCodeCommand({ communityCloudId: 'community-cloud' }, membershipGateway(calls));

  assert.equal(missing.ok, false);
  if (!missing.ok) assert.equal(missing.error.code, 'cloud_unavailable');
  assert.equal(generated.ok, true);
  if (generated.ok) assert.equal(generated.value.joinCode, 'ABCD1234');
  assert.deepEqual(calls, ['generate:community-cloud', 'disable:community-cloud']);
});

test('leaveCommunityCommand blocks owner and calls gateway for non-owner', async () => {
  const owner = await leaveCommunityCommand(
    { communityCloudId: 'community-cloud', currentMember: member({ role: 'owner' }) },
    membershipGateway(),
  );
  const calls: string[] = [];
  const memberResult = await leaveCommunityCommand(
    { communityCloudId: 'community-cloud', currentMember: member({ role: 'member' }) },
    membershipGateway(calls),
  );

  assert.equal(owner.ok, false);
  if (!owner.ok) assert.equal(owner.error.code, 'permission_denied');
  assert.equal(memberResult.ok, true);
  assert.deepEqual(calls, ['leave:community-cloud']);
});

test('public discovery query and join command call discovery gateway', async () => {
  const calls: string[] = [];
  const gateway = discoveryGateway(calls);

  const search = await searchPublicCommunitiesQuery({ query: 'terca' }, gateway);
  const join = await requestPublicCommunityJoinCommand({ communityCloudId: 'community-cloud' }, gateway);

  assert.equal(search.ok, true);
  assert.equal(join.ok, true);
  assert.deepEqual(calls, ['search:terca', 'join-public:community-cloud']);
});

test('requestCommunityJoinByCodeCommand normalizes code and calls gateway', async () => {
  const calls: string[] = [];
  const result = await requestCommunityJoinByCodeCommand(
    { code: ' abcd1234 ', communityLocalId: 'community-local' },
    membershipGateway(calls),
  );

  assert.equal(result.ok, true);
  assert.deepEqual(calls, ['join-code:ABCD1234:community-local']);
});
```

- [ ] **Step 2: Run the use-case tests and verify RED**

Run:

```powershell
node --import tsx --test src/application/communityMembershipUseCases.test.ts
```

Expected: FAIL because `src/application/communityMembershipUseCases.ts` does not exist.

- [ ] **Step 3: Implement the use cases**

Create `src/application/communityMembershipUseCases.ts`:

```ts
import type { CommunityMember, CommunityMemberRole } from '../types';
import { membershipCloudService } from '../services/supabase/membershipCloudService';
import {
  communityDiscoveryService,
  type PublicCommunityResult,
} from '../services/supabase/communityDiscoveryService';
import { appOk, productError, recoverableIssue, technicalError } from './appResult';
import type { AppResult } from './appResult';

export interface CommunityMembershipGateway {
  fetchByCommunity: (
    communityCloudId: string,
    communityLocalId?: string,
  ) => Promise<CommunityMember[]>;
  addMemberByEmail: (
    communityCloudId: string,
    email: string,
    role: CommunityMemberRole,
    communityLocalId?: string,
  ) => Promise<CommunityMember>;
  updateRole: (memberId: string, role: CommunityMemberRole) => Promise<CommunityMember>;
  removeMember: (memberId: string) => Promise<void>;
  approveRequest: (memberId: string) => Promise<void>;
  rejectRequest: (memberId: string) => Promise<void>;
  generateJoinCode: (communityCloudId: string) => Promise<string>;
  disableJoinCode: (communityCloudId: string) => Promise<void>;
  leaveCommunity: (communityCloudId: string) => Promise<void>;
  findByCode: (
    code: string,
  ) => Promise<{ id: string; name: string; description: string | null; memberCount: number; myStatus: string | null } | null>;
  requestToJoin: (code: string, communityLocalId?: string) => Promise<CommunityMember>;
}

export interface CommunityDiscoveryGateway {
  searchPublic: (query: string) => Promise<PublicCommunityResult[]>;
  requestToJoinPublic: (communityCloudId: string) => Promise<void>;
}

export const supabaseCommunityMembershipGateway: CommunityMembershipGateway = {
  fetchByCommunity: membershipCloudService.fetchByCommunity,
  addMemberByEmail: membershipCloudService.addOrganizerByEmail,
  updateRole: membershipCloudService.updateRole,
  removeMember: membershipCloudService.removeMember,
  approveRequest: membershipCloudService.approveRequest,
  rejectRequest: membershipCloudService.rejectRequest,
  generateJoinCode: membershipCloudService.generateJoinCode,
  disableJoinCode: membershipCloudService.disableJoinCode,
  leaveCommunity: membershipCloudService.leaveCommunity,
  findByCode: membershipCloudService.findByCode,
  requestToJoin: membershipCloudService.requestToJoin,
};

export const supabaseCommunityDiscoveryGateway: CommunityDiscoveryGateway = {
  searchPublic: communityDiscoveryService.searchPublic,
  requestToJoinPublic: communityDiscoveryService.requestToJoinPublic,
};

export async function fetchCommunityMembersQuery(
  input: { communityCloudId?: string; communityLocalId?: string },
  gateway: CommunityMembershipGateway = supabaseCommunityMembershipGateway,
): Promise<AppResult<{ members: CommunityMember[] }>> {
  if (!input.communityCloudId) {
    return productError('cloud_unavailable', 'Sincronize a comunidade com a nuvem antes.');
  }

  try {
    return appOk({
      members: await gateway.fetchByCommunity(input.communityCloudId, input.communityLocalId),
    });
  } catch (error) {
    return appOk({ members: [] }, [
      recoverableIssue('cloud_unavailable', 'Nao foi possivel carregar os membros.', error),
    ]);
  }
}

export async function inviteCommunityMemberCommand(
  input: {
    communityCloudId?: string;
    communityLocalId?: string;
    email: string;
    role: CommunityMemberRole;
  },
  gateway: CommunityMembershipGateway = supabaseCommunityMembershipGateway,
): Promise<AppResult<{ member: CommunityMember }>> {
  const cloudCheck = requireCommunityCloudId(input.communityCloudId);
  if (!cloudCheck.ok) return cloudCheck;
  const email = input.email.trim().toLowerCase();
  if (!email) return productError('invalid_input', 'Informe um e-mail para convidar.');
  if (input.role === 'owner') {
    return productError('permission_denied', 'O papel de dono nao pode ser atribuido por convite.');
  }

  try {
    const member = await gateway.addMemberByEmail(
      cloudCheck.value.communityCloudId,
      email,
      input.role,
      input.communityLocalId,
    );
    return appOk({ member });
  } catch (error) {
    return technicalError('Nao foi possivel convidar o membro.', error);
  }
}

export async function changeCommunityMemberRoleCommand(
  input: {
    members: CommunityMember[];
    currentUserId: string | null;
    memberId: string;
    role: CommunityMemberRole;
  },
  gateway: CommunityMembershipGateway = supabaseCommunityMembershipGateway,
): Promise<AppResult<{ member: CommunityMember }>> {
  if (input.role === 'owner') {
    return productError('permission_denied', 'O papel de dono nao pode ser atribuido pela UI.');
  }
  const target = findTargetMember(input.members, input.memberId);
  if (!target.ok) return target;
  const editable = ensureEditableMember(target.value.member, input.currentUserId);
  if (!editable.ok) return editable;

  try {
    return appOk({ member: await gateway.updateRole(input.memberId, input.role) });
  } catch (error) {
    return technicalError('Nao foi possivel alterar o papel do membro.', error);
  }
}

export async function removeCommunityMemberCommand(
  input: { members: CommunityMember[]; currentUserId: string | null; memberId: string },
  gateway: CommunityMembershipGateway = supabaseCommunityMembershipGateway,
): Promise<AppResult<{ removedMemberId: string }>> {
  const target = findTargetMember(input.members, input.memberId);
  if (!target.ok) return target;
  const editable = ensureEditableMember(target.value.member, input.currentUserId);
  if (!editable.ok) return editable;

  try {
    await gateway.removeMember(input.memberId);
    return appOk({ removedMemberId: input.memberId });
  } catch (error) {
    return technicalError('Nao foi possivel remover o membro.', error);
  }
}

export async function approveCommunityJoinRequestCommand(
  input: { memberId: string },
  gateway: CommunityMembershipGateway = supabaseCommunityMembershipGateway,
): Promise<AppResult<{ memberId: string }>> {
  try {
    await gateway.approveRequest(input.memberId);
    return appOk({ memberId: input.memberId });
  } catch (error) {
    return technicalError('Nao foi possivel aprovar o pedido.', error);
  }
}

export async function rejectCommunityJoinRequestCommand(
  input: { memberId: string },
  gateway: CommunityMembershipGateway = supabaseCommunityMembershipGateway,
): Promise<AppResult<{ memberId: string }>> {
  try {
    await gateway.rejectRequest(input.memberId);
    return appOk({ memberId: input.memberId });
  } catch (error) {
    return technicalError('Nao foi possivel rejeitar o pedido.', error);
  }
}

export async function generateCommunityJoinCodeCommand(
  input: { communityCloudId?: string },
  gateway: CommunityMembershipGateway = supabaseCommunityMembershipGateway,
): Promise<AppResult<{ joinCode: string }>> {
  const cloudCheck = requireCommunityCloudId(input.communityCloudId);
  if (!cloudCheck.ok) return cloudCheck;

  try {
    return appOk({ joinCode: await gateway.generateJoinCode(cloudCheck.value.communityCloudId) });
  } catch (error) {
    return technicalError('Nao foi possivel gerar o codigo.', error);
  }
}

export async function disableCommunityJoinCodeCommand(
  input: { communityCloudId?: string },
  gateway: CommunityMembershipGateway = supabaseCommunityMembershipGateway,
): Promise<AppResult<Record<string, never>>> {
  const cloudCheck = requireCommunityCloudId(input.communityCloudId);
  if (!cloudCheck.ok) return cloudCheck;

  try {
    await gateway.disableJoinCode(cloudCheck.value.communityCloudId);
    return appOk({});
  } catch (error) {
    return technicalError('Nao foi possivel desativar o codigo.', error);
  }
}

export async function leaveCommunityCommand(
  input: { communityCloudId?: string; currentMember: CommunityMember | null },
  gateway: CommunityMembershipGateway = supabaseCommunityMembershipGateway,
): Promise<AppResult<Record<string, never>>> {
  const cloudCheck = requireCommunityCloudId(input.communityCloudId);
  if (!cloudCheck.ok) return cloudCheck;
  if (!input.currentMember) {
    return productError('not_found', 'Sua participacao nesta comunidade nao foi encontrada.');
  }
  if (input.currentMember.role === 'owner') {
    return productError('permission_denied', 'O dono nao pode sair da comunidade por este fluxo.');
  }

  try {
    await gateway.leaveCommunity(cloudCheck.value.communityCloudId);
    return appOk({});
  } catch (error) {
    return technicalError('Nao foi possivel sair da comunidade.', error);
  }
}

export async function searchPublicCommunitiesQuery(
  input: { query: string },
  gateway: CommunityDiscoveryGateway = supabaseCommunityDiscoveryGateway,
): Promise<AppResult<{ communities: PublicCommunityResult[] }>> {
  try {
    return appOk({ communities: await gateway.searchPublic(input.query.trim()) });
  } catch (error) {
    return technicalError('Nao foi possivel buscar comunidades.', error);
  }
}

export async function requestPublicCommunityJoinCommand(
  input: { communityCloudId?: string },
  gateway: CommunityDiscoveryGateway = supabaseCommunityDiscoveryGateway,
): Promise<AppResult<Record<string, never>>> {
  const cloudCheck = requireCommunityCloudId(input.communityCloudId);
  if (!cloudCheck.ok) return cloudCheck;

  try {
    await gateway.requestToJoinPublic(cloudCheck.value.communityCloudId);
    return appOk({});
  } catch (error) {
    return technicalError('Nao foi possivel enviar o pedido.', error);
  }
}

export async function requestCommunityJoinByCodeCommand(
  input: { code: string; communityLocalId?: string },
  gateway: CommunityMembershipGateway = supabaseCommunityMembershipGateway,
): Promise<AppResult<{ member: CommunityMember }>> {
  const code = input.code.trim().toUpperCase();
  if (!code) return productError('invalid_input', 'Informe o codigo da comunidade.');

  try {
    return appOk({ member: await gateway.requestToJoin(code, input.communityLocalId) });
  } catch (error) {
    return technicalError('Nao foi possivel enviar o pedido.', error);
  }
}

function requireCommunityCloudId(
  communityCloudId: string | undefined,
): AppResult<{ communityCloudId: string }> {
  return communityCloudId
    ? appOk({ communityCloudId })
    : productError('cloud_unavailable', 'Sincronize a comunidade com a nuvem antes.');
}

function findTargetMember(
  members: CommunityMember[],
  memberId: string,
): AppResult<{ member: CommunityMember }> {
  const member = members.find((item) => item.id === memberId);
  return member
    ? appOk({ member })
    : productError('not_found', 'Membro nao encontrado.');
}

function ensureEditableMember(
  member: CommunityMember,
  currentUserId: string | null,
): AppResult<Record<string, never>> {
  if (member.role === 'owner') {
    return productError('permission_denied', 'O dono nao pode ser alterado por este fluxo.');
  }
  if (member.userId === currentUserId) {
    return productError('permission_denied', 'Voce nao pode alterar sua propria participacao aqui.');
  }
  return appOk({});
}
```

- [ ] **Step 4: Export the use cases**

Modify `src/application/index.ts`:

```ts
export * from './appResult';
export * from './communityMembershipUseCases';
export * from './communityMembersViewModel';
export * from './playerLinkUseCases';
export * from './playerLinkViewModel';
```

- [ ] **Step 5: Add the use-case test to `test:unit`**

In `package.json`, update `scripts.test:unit` so it includes:

```text
src/application/communityMembershipUseCases.test.ts
```

Place it after `src/application/communityMembersViewModel.test.ts`.

- [ ] **Step 6: Run use-case tests**

Run:

```powershell
node --import tsx --test src/application/communityMembershipUseCases.test.ts
```

Expected: tests pass.

- [ ] **Step 7: Run focused application tests**

Run:

```powershell
node --import tsx --test src/application/appResult.test.ts src/application/communityMembersViewModel.test.ts src/application/communityMembershipUseCases.test.ts
```

Expected: all pass.

- [ ] **Step 8: Commit Task 2**

Run:

```powershell
git add package.json src/application/index.ts src/application/communityMembershipUseCases.ts src/application/communityMembershipUseCases.test.ts
git commit -m "feat(app): add community membership use cases"
```

## Task 3: Wire Hook And Members Panel To Application Contracts

**Files:**
- Modify: `src/hooks/useCommunityMembers.ts`
- Modify: `src/components/community/CommunityMembersPanel.tsx`
- Modify: `src/components/community/CommunitiesView.tsx`
- Modify: `src/App.tsx`
- Modify: `docs/architecture/domain-model.md`
- Test: `node --import tsx --test src/application/communityMembershipUseCases.test.ts src/application/communityMembersViewModel.test.ts`
- Test: `npm run lint`

- [ ] **Step 1: Update `useCommunityMembers` imports**

In `src/hooks/useCommunityMembers.ts`, replace the direct service import:

```ts
import { membershipCloudService } from '../services/supabase/membershipCloudService';
```

with:

```ts
import {
  approveCommunityJoinRequestCommand,
  changeCommunityMemberRoleCommand,
  disableCommunityJoinCodeCommand,
  fetchCommunityMembersQuery,
  generateCommunityJoinCodeCommand,
  inviteCommunityMemberCommand,
  leaveCommunityCommand,
  rejectCommunityJoinRequestCommand,
  removeCommunityMemberCommand,
} from '../application/communityMembershipUseCases';
```

- [ ] **Step 2: Replace member reload with application query**

In `reload`, replace the direct `membershipCloudService.fetchByCommunity` call with:

```ts
      const result = await fetchCommunityMembersQuery({
        communityCloudId,
        communityLocalId,
      });
      if (!result.ok) throw new Error(result.error.message);
      setMembers(result.value.members);
      if (result.issues?.length) setError(result.issues[0].message);
```

Keep the existing `try/catch/finally` shape.

- [ ] **Step 3: Replace hook mutations with application commands**

In `useCommunityMembers`, replace each direct cloud action:

```ts
  const invite = useCallback(
    async (email: string, role: CommunityMemberRole) => {
      const result = await inviteCommunityMemberCommand({
        communityCloudId,
        communityLocalId,
        email,
        role,
      });
      if (!result.ok) throw new Error(result.error.message);
      await reload();
    },
    [communityCloudId, communityLocalId, reload],
  );

  const changeRole = useCallback(
    async (memberId: string, role: CommunityMemberRole) => {
      const result = await changeCommunityMemberRoleCommand({
        members,
        currentUserId,
        memberId,
        role,
      });
      if (!result.ok) throw new Error(result.error.message);
      await reload();
    },
    [currentUserId, members, reload],
  );

  const remove = useCallback(
    async (memberId: string) => {
      const result = await removeCommunityMemberCommand({
        members,
        currentUserId,
        memberId,
      });
      if (!result.ok) throw new Error(result.error.message);
      await reload();
    },
    [currentUserId, members, reload],
  );

  const approveRequest = useCallback(
    async (memberId: string) => {
      const result = await approveCommunityJoinRequestCommand({ memberId });
      if (!result.ok) throw new Error(result.error.message);
      await reload();
    },
    [reload],
  );

  const rejectRequest = useCallback(
    async (memberId: string) => {
      const result = await rejectCommunityJoinRequestCommand({ memberId });
      if (!result.ok) throw new Error(result.error.message);
      await reload();
    },
    [reload],
  );

  const generateJoinCode = useCallback(async () => {
    const result = await generateCommunityJoinCodeCommand({ communityCloudId });
    if (!result.ok) throw new Error(result.error.message);
    return result.value.joinCode;
  }, [communityCloudId]);

  const disableJoinCode = useCallback(async () => {
    const result = await disableCommunityJoinCodeCommand({ communityCloudId });
    if (!result.ok) throw new Error(result.error.message);
  }, [communityCloudId]);

  const leave = useCallback(async () => {
    const result = await leaveCommunityCommand({
      communityCloudId,
      currentMember,
    });
    if (!result.ok) throw new Error(result.error.message);
    await reload();
  }, [communityCloudId, currentMember, reload]);
```

Keep the return object shape unchanged so `CommunityMembersPanel` keeps working during this step.

- [ ] **Step 4: Run hook-adjacent typecheck**

Run:

```powershell
npm run lint
```

Expected: pass. If dependency arrays need adjustment, update only the arrays affected by this task.

- [ ] **Step 5: Refactor `CommunityMembersPanel` to use the View Model**

In `src/components/community/CommunityMembersPanel.tsx`:

1. Add imports:

```ts
import {
  buildCommunityMembersViewModel,
  COMMUNITY_ROLE_LABELS,
} from '../../application/communityMembersViewModel';
```

Also import `AuthRole` from `../../types`.

2. Remove these local definitions because the View Model owns them now: `ROLE_LABELS`, `ROLE_BADGE`, `ASSIGNABLE_ROLES`, `ROLE_ORDER`, and `initials`.

3. After calling `useCommunityMembers`, build the View Model:

```ts
  const vm = buildCommunityMembersViewModel({
    community,
    members,
    players,
    currentUserId,
    isSupabaseConfigured,
    globalRole,
  });
```

To make this possible:

- add `globalRole?: AuthRole | null` to `CommunityMembersPanelProps`;
- destructure `globalRole = null` from props;
- destructure `members` from `useCommunityMembers`.

4. Replace the early blocked states with `vm.state`:

```tsx
  if (vm.state === 'cloud_disabled' || vm.state === 'community_not_synced') {
    return (
      <div className="bg-surface p-6 rounded-xl border border-border text-center space-y-2">
        <Cloud className="w-8 h-8 mx-auto text-text-muted" />
        <p className="text-sm text-text-muted">{vm.blockedMessage}</p>
      </div>
    );
  }
```

5. Replace `canManage`, `sortedMembers`, `pendingRequests`, `activeMembers`, `canLeave`, `currentMember`, and `athleteByUserId` usages with `vm`.

Examples:

```tsx
      {vm.canManage && (
```

```tsx
            {vm.pendingRequests.map((row) => (
              <li key={row.member.id}>
```

```tsx
                    {row.displayName}
```

```tsx
            {vm.activeMembers.map((row) => {
              const member = row.member;
              return (
```

```tsx
                    {row.canChangeRole ? (
                      <select
                        value={member.role}
                        onChange={(e) =>
                          handleRoleChange(member, e.target.value as CommunityMemberRole)
                        }
                        className="select select-bordered select-sm"
                        disabled={busy}
                        aria-label="Papel do membro"
                      >
                        {row.assignableRoles.map((role) => (
                          <option key={role} value={role}>
                            {COMMUNITY_ROLE_LABELS[role]}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className={`badge ${row.roleBadgeClass}`}>
                        {row.roleLabel}
                      </span>
                    )}
```

```tsx
                    {row.athleteLabel && (
                      <span className="badge badge-sm badge-outline gap-1 mt-1">
                        <Volleyball className="w-3 h-3" />
                        {row.athleteLabel}
                      </span>
                    )}
```

Keep markup classes and visual structure otherwise unchanged.

- [ ] **Step 6: Thread global role through the community route**

In `src/components/community/CommunitiesView.tsx`:

1. Import `AuthRole` from `../../types`.
2. Add `globalRole: AuthRole | null` to `CommunitiesViewProps`.
3. Destructure `globalRole` in `CommunitiesView`.
4. Pass `globalRole={globalRole}` into `CommunityDetailView`.
5. Destructure `globalRole` in `CommunityDetailView`.
6. Pass `globalRole={globalRole}` into `CommunityMembersPanel`.

In `src/App.tsx`, pass the signed-in profile role to `CommunitiesView`:

```tsx
globalRole={auth.profile?.role ?? null}
```

Expected: `programmer` remains read-only and `master` keeps elevated local access through `deriveCommunityPermissions`.

- [ ] **Step 7: Run focused tests**

Run:

```powershell
node --import tsx --test src/application/communityMembershipUseCases.test.ts src/application/communityMembersViewModel.test.ts src/domain/communityPermissions.test.ts
```

Expected: all pass.

- [ ] **Step 8: Run typecheck**

Run:

```powershell
npm run lint
```

Expected: pass.

- [ ] **Step 9: Update domain architecture doc**

Append to `docs/architecture/domain-model.md` under `## Application Layer`:

```md
- Community membership operations live behind `src/application/communityMembershipUseCases.ts`.
- Community member panels should render `communityMembersViewModel` output instead of deriving role/editability rules in JSX.
- Direct Supabase table update/delete for membership role and removal is isolated behind a gateway for now; a later Supabase/RPC slice should replace those adapter internals with dedicated RPCs.
```

- [ ] **Step 10: Commit Task 3**

Run:

```powershell
git add src/hooks/useCommunityMembers.ts src/components/community/CommunityMembersPanel.tsx src/components/community/CommunitiesView.tsx src/App.tsx docs/architecture/domain-model.md
git commit -m "refactor(app): route community members through application layer"
```

## Task 4: Final Verification And Review

**Files:**
- Read only: all changed files.

- [ ] **Step 1: Run full unit suite**

Run:

```powershell
npm run test:unit
```

Expected: all unit tests pass, including the new community membership tests.

- [ ] **Step 2: Run UI suite**

Run:

```powershell
npm run test:ui
```

Expected: all Vitest UI tests pass.

- [ ] **Step 3: Run build**

Run:

```powershell
npm run build
```

Expected: build passes. The existing Vite large chunk warning is acceptable if unchanged.

- [ ] **Step 4: Search for new direct Supabase usage in community UI**

Run:

```powershell
rg -n "membershipCloudService|communityDiscoveryService|supabase\\.from|supabase\\.rpc" src\components\community src\hooks\useCommunityMembers.ts
```

Expected:

- `src/hooks/useCommunityMembers.ts` should not import `membershipCloudService`.
- `src/components/community/CommunityMembersPanel.tsx` should not import Supabase services.
- Existing `CommunityDiscovery.tsx` may still import `communityDiscoveryService`; if left unchanged, record it as the next candidate for the same application-layer treatment rather than expanding this slice.

- [ ] **Step 5: Review diff against spec**

Run:

```powershell
git diff --stat main...HEAD
git diff main...HEAD -- src\application src\hooks\useCommunityMembers.ts src\components\community\CommunityMembersPanel.tsx docs\architecture\domain-model.md package.json
```

Checklist:

- Application use cases exist and have tests.
- View Model exists and has tests.
- No new runtime dependencies were added.
- No Supabase migration was added.
- `CommunityMembersPanel` keeps the same visual structure.
- Direct role/remove table access is isolated behind gateway and documented for a later RPC slice.

- [ ] **Step 6: Request code review**

Dispatch a code reviewer with:

```text
Review branch codex/community-members-rbac against docs/superpowers/specs/2026-07-03-community-members-rbac-design.md and docs/superpowers/plans/2026-07-03-community-members-rbac.md.
Focus on application-layer boundary, RBAC safety, direct Supabase coupling, test quality, and accidental UI redesign.
```

Fix Critical and Important findings before finishing.

## Final Handoff

After all tasks pass:

- Use `superpowers:finishing-a-development-branch`.
- Offer the standard options:
  1. Merge back to `main` locally.
  2. Push and create a Pull Request.
  3. Keep the branch as-is.
  4. Discard this work.

Do not push or merge without the user's chosen option.
