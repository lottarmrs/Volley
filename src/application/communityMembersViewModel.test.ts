import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCommunityMembersViewModel } from './communityMembersViewModel';
import type { Community, CommunityMember, Player } from '../types';

const community: Community = {
  id: 'community-local',
  cloudId: 'community-cloud',
  name: 'Terca Forte',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function member(overrides: Partial<CommunityMember>): CommunityMember {
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
  assert.equal(
    vm.blockedMessage,
    'Conecte uma conta na nuvem para gerenciar membros desta comunidade.',
  );
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

test('member row exposes initials from display name', () => {
  const vm = buildCommunityMembersViewModel({
    community,
    members: [
      member({ id: 'named-member', userId: 'named-user', role: 'member', name: 'ana' }),
      member({ id: 'email-member', userId: 'email-user', role: 'member', email: 'be@example.com' }),
      member({ id: 'fallback-member', userId: 'fallback-user', role: 'member' }),
    ],
    players: [],
    currentUserId: 'named-user',
    isSupabaseConfigured: true,
    globalRole: 'user',
  });

  assert.deepEqual(
    vm.activeMembers
      .map((row) => [row.member.id, row.displayName, row.initials])
      .sort(([left], [right]) => String(left).localeCompare(String(right))),
    [
      ['email-member', 'be@example.com', 'BE'],
      ['fallback-member', 'Membro', 'ME'],
      ['named-member', 'ana', 'AN'],
    ],
  );
});

test('view model ignores memberships from other communities', () => {
  const vm = buildCommunityMembersViewModel({
    community,
    members: [
      member({
        id: 'target-member',
        userId: 'shared-user',
        role: 'member',
        name: 'Target Member',
      }),
      member({
        id: 'other-owner',
        communityId: 'other-community',
        userId: 'shared-user',
        role: 'owner',
        name: 'Other Owner',
      }),
      member({
        id: 'other-pending',
        communityId: 'other-community',
        userId: 'other-pending-user',
        role: 'member',
        status: 'pending',
      }),
    ],
    players: [],
    currentUserId: 'shared-user',
    isSupabaseConfigured: true,
    globalRole: 'user',
  });

  assert.equal(vm.canManage, false);
  assert.deepEqual(
    vm.activeMembers.map((row) => row.member.id),
    ['target-member'],
  );
  assert.deepEqual(
    vm.pendingRequests.map((row) => row.member.id),
    [],
  );
  assert.equal(vm.currentMember?.id, 'target-member');
});
