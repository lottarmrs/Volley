import type { AuthRole, Community, CommunityMember, CommunityMemberRole, Player } from '../types';
import {
  deriveCommunityPermissions,
  type CommunityPermissions,
} from '../domain/communityPermissions';

export type CommunityMembersPanelState = 'cloud_disabled' | 'community_not_synced' | 'ready';

export interface CommunityMemberRowViewModel {
  member: CommunityMember;
  displayName: string;
  initials: string;
  roleLabel: string;
  roleBadgeClass: string;
  athleteLabel: string | null;
  isSelf: boolean;
  canChangeRole: boolean;
  canRemove: boolean;
  assignableRoles: readonly CommunityMemberRole[];
}

export interface CommunityMembersViewModel {
  state: CommunityMembersPanelState;
  community: Community;
  permissions: CommunityPermissions;
  activeMembers: CommunityMemberRowViewModel[];
  pendingRequests: CommunityMemberRowViewModel[];
  currentMember: CommunityMember | null;
  canManage: boolean;
  /** Avaliar pedidos de entrada e uma permissao MAIS AMPLA que canManage: inclui
   *  moderador. Sem expor isto separado, o painel gateava os pedidos por canManage e o
   *  moderador nunca via os botoes — mesmo o banco e o caso de uso ja permitindo. */
  canApprove: boolean;
  canLeave: boolean;
  blockedMessage: string | null;
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
  organizador: 'Organizador',
  member: 'Membro',
};

export const COMMUNITY_ROLE_BADGE_CLASSES: Record<CommunityMemberRole, string> = {
  owner: 'badge-primary',
  admin: 'badge-accent badge-soft',
  moderator: 'badge-outline',
  organizador: 'badge-outline badge-soft',
  member: 'badge-ghost',
};

export const ASSIGNABLE_COMMUNITY_MEMBER_ROLES: readonly CommunityMemberRole[] = [
  'admin',
  'moderator',
  'organizador',
  'member',
];

const ROLE_ORDER: Record<CommunityMemberRole, number> = {
  owner: 0,
  admin: 1,
  moderator: 2,
  organizador: 3,
  member: 4,
};

function memberStatus(member: CommunityMember): NonNullable<CommunityMember['status']> {
  return member.status ?? 'active';
}

function displayNameFor(member: CommunityMember): string {
  return member.name || member.email || 'Membro';
}

function initialsFor(displayName: string): string {
  return (displayName || '?').slice(0, 2).toUpperCase();
}

function sortMemberRows(a: CommunityMemberRowViewModel, b: CommunityMemberRowViewModel): number {
  return (
    (ROLE_ORDER[a.member.role] ?? 9) - (ROLE_ORDER[b.member.role] ?? 9) ||
    a.displayName.localeCompare(b.displayName)
  );
}

export function buildCommunityMembersViewModel(
  input: CommunityMembersViewModelInput,
): CommunityMembersViewModel {
  const { community, members, players, currentUserId, isSupabaseConfigured, globalRole } = input;
  const communityMembers = members.filter((member) => member.communityId === community.id);
  const permissions = deriveCommunityPermissions({
    isSupabaseConfigured,
    userId: currentUserId,
    globalRole,
    community,
    members: communityMembers,
  });

  const state: CommunityMembersPanelState = !isSupabaseConfigured
    ? 'cloud_disabled'
    : community.cloudId
      ? 'ready'
      : 'community_not_synced';

  const canManage = state === 'ready' && permissions.canManageMembers;
  const canApprove = state === 'ready' && permissions.canApproveMembers;
  const athleteByUserId = new Map(
    players
      .filter((player) => player.userId && !player.deletedAt)
      .map((player) => [player.userId as string, player]),
  );

  const currentMember =
    permissions.role === null
      ? null
      : (communityMembers.find(
          (member) => member.userId === currentUserId && memberStatus(member) === 'active',
        ) ?? null);

  const toRow = (member: CommunityMember): CommunityMemberRowViewModel => {
    const athlete = athleteByUserId.get(member.userId);
    const isSelf = member.userId === currentUserId;
    const isOwner = member.role === 'owner';
    const editable = canManage && !isSelf && !isOwner;
    const displayName = displayNameFor(member);

    return {
      member,
      displayName,
      initials: initialsFor(displayName),
      roleLabel: COMMUNITY_ROLE_LABELS[member.role],
      roleBadgeClass: COMMUNITY_ROLE_BADGE_CLASSES[member.role],
      athleteLabel: athlete ? athlete.apelido || athlete.nome : null,
      isSelf,
      canChangeRole: editable,
      canRemove: editable,
      assignableRoles: editable ? ASSIGNABLE_COMMUNITY_MEMBER_ROLES : [],
    };
  };

  const activeMembers = communityMembers
    .filter((member) => memberStatus(member) === 'active')
    .map(toRow)
    .sort(sortMemberRows);
  const pendingRequests = communityMembers
    .filter((member) => memberStatus(member) === 'pending')
    .map(toRow)
    .sort(sortMemberRows);

  return {
    state,
    community,
    permissions,
    activeMembers,
    pendingRequests,
    currentMember,
    canManage,
    canApprove,
    canLeave: state === 'ready' && currentMember !== null && currentMember.role !== 'owner',
    blockedMessage:
      state === 'cloud_disabled'
        ? 'Conecte uma conta na nuvem para gerenciar membros desta comunidade.'
        : state === 'community_not_synced'
          ? 'Sincronize esta comunidade com a nuvem (aba Nuvem & Conta) antes de gerenciar membros.'
          : null,
  };
}
