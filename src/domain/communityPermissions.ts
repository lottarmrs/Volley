import type { AuthRole, Community, CommunityMember, CommunityMemberRole } from '../types';

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
  canApproveMembers: boolean;
  canEditRules: boolean;
  canEditPlayerProfile: boolean;
  canEvaluatePlayer: boolean;
  canCreateSession: boolean;
}

function permissionsForRole(
  role: CommunityMemberRole | null,
  isGlobalAdmin = false,
  isSupabaseConfigured = true,
): CommunityPermissions {
  const isOwner = role === 'owner';
  const isAdmin = role === 'admin';
  const isModerator = role === 'moderator';
  const isOrganizador = role === 'organizador';
  const canReadCommunity = role !== null;

  return {
    role,
    isGlobalAdmin,
    isSupabaseConfigured,
    canReadCommunity,
    canDeleteCommunity: isOwner,
    canClearHistory: isOwner,
    canManageMembers: isOwner || isAdmin,
    canApproveMembers: isOwner || isAdmin || isModerator,
    canEditRules: isOwner || isAdmin,
    canEditPlayerProfile: isOwner || isAdmin,
    // Apenas owner/admin: a RLS de player_evaluations exige
    // current_user_has_community_role(community_id, array['owner','admin']), entao
    // liberar moderator aqui so mostraria uma acao que o banco recusa depois.
    canEvaluatePlayer: isOwner || isAdmin,
    canCreateSession: isOwner || isAdmin || isModerator || isOrganizador,
  };
}

export function deriveCommunityPermissions(input: CommunityPermissionInput): CommunityPermissions {
  const { isSupabaseConfigured, userId, globalRole, community, members } = input;

  if (!isSupabaseConfigured || !userId) {
    return permissionsForRole('owner', false, false);
  }

  if (globalRole === 'master') {
    return {
      ...permissionsForRole('owner', true, true),
      role: 'admin',
    };
  }

  if (globalRole === 'programmer') {
    return {
      role: null,
      isGlobalAdmin: false,
      isSupabaseConfigured: true,
      canReadCommunity: true,
      canDeleteCommunity: false,
      canClearHistory: false,
      canManageMembers: false,
      canApproveMembers: false,
      canEditRules: false,
      canEditPlayerProfile: false,
      canEvaluatePlayer: false,
      canCreateSession: false,
    };
  }

  if (!community?.cloudId) {
    return permissionsForRole('owner');
  }

  const activeMember = members.find(
    (member) => member.userId === userId && (member.status ?? 'active') === 'active',
  );

  return permissionsForRole(activeMember?.role ?? null);
}
