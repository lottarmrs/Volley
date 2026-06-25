import { useAuth } from './useAuth';
import { useCommunityMembers } from './useCommunityMembers';
import { Community } from '../types';

export function useCommunityPermissions(community: Community | null) {
  const auth = useAuth();
  const enabled = auth.isSupabaseConfigured && !!community?.cloudId;

  const { members } = useCommunityMembers({
    communityCloudId: community?.cloudId,
    communityLocalId: community?.id,
    currentUserId: auth.user?.id ?? null,
    enabled,
  });

  const isGlobalAdmin = auth.isAdmin; // master = bypass total (escrita + leitura)
  const isProgrammer = auth.isProgrammer; // suporte = somente leitura
  const isSupabaseConfigured = auth.isSupabaseConfigured;

  // Se não estiver logado ou se o Supabase não estiver configurado, assume modo local (acesso total)
  if (!isSupabaseConfigured || !auth.user) {
    return {
      role: 'owner' as const,
      isGlobalAdmin: false,
      isSupabaseConfigured: false,
      canDeleteCommunity: true,
      canClearHistory: true,
      canManageMembers: true,
      canEditRules: true,
      canEditPlayerProfile: true,
      canEvaluatePlayer: true,
      canCreateSession: true,
    };
  }

  // Se for admin global, tem acesso total a qualquer comunidade
  if (isGlobalAdmin) {
    return {
      role: 'admin' as const,
      isGlobalAdmin: true,
      isSupabaseConfigured: true,
      canDeleteCommunity: true,
      canClearHistory: true,
      canManageMembers: true,
      canEditRules: true,
      canEditPlayerProfile: true,
      canEvaluatePlayer: true,
      canCreateSession: true,
    };
  }

  // Programador/suporte: enxerga tudo (leitura), mas SEM ações de escrita.
  // Mantém os botões de mutação escondidos para não disparar erros de RLS.
  if (isProgrammer) {
    return {
      role: null,
      isGlobalAdmin: false,
      isSupabaseConfigured: true,
      canDeleteCommunity: false,
      canClearHistory: false,
      canManageMembers: false,
      canEditRules: false,
      canEditPlayerProfile: false,
      canEvaluatePlayer: false,
      canCreateSession: false,
    };
  }

  // Encontra o registro de membro ATIVO do usuário logado na comunidade atual.
  // Membros 'pending'/'invited' não recebem permissões até serem aprovados.
  const myMemberRecord = members.find(
    (m) => m.userId === auth.user?.id && (m.status ?? 'active') === 'active',
  );
  const communityRole = myMemberRecord?.role || null; // 'owner' | 'admin' | 'moderator' | 'member' | null

  // Se a comunidade for local e sem cloudId, o criador tem acesso total
  if (!community?.cloudId) {
    return {
      role: 'owner' as const,
      isGlobalAdmin: false,
      isSupabaseConfigured: true,
      canDeleteCommunity: true,
      canClearHistory: true,
      canManageMembers: true,
      canEditRules: true,
      canEditPlayerProfile: true,
      canEvaluatePlayer: true,
      canCreateSession: true,
    };
  }

  const isOwner = communityRole === 'owner';
  const isAdmin = communityRole === 'admin';
  const isModerator = communityRole === 'moderator';
  // 'member' é participante comum (atleta/usuário): sem ações de gestão.

  return {
    role: communityRole,
    isGlobalAdmin: false,
    isSupabaseConfigured: true,
    canDeleteCommunity: isOwner,
    canClearHistory: isOwner,
    canManageMembers: isOwner || isAdmin,
    canEditRules: isOwner || isAdmin,
    canEditPlayerProfile: isOwner || isAdmin,
    canEvaluatePlayer: isOwner || isAdmin || isModerator,
    canCreateSession: isOwner || isAdmin || isModerator,
  };
}
