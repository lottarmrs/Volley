import { useAuth } from './useAuth';
import { useCommunityMembers } from './useCommunityMembers';
import { Community } from '../types';
import {
  deriveCommunityPermissions,
  type CommunityPermissions,
} from '../domain/communityPermissions';

export function useCommunityPermissions(
  community: Community | null,
): CommunityPermissions & { membersResolved: boolean } {
  const auth = useAuth();
  const enabled = auth.isSupabaseConfigured && !!community?.cloudId;

  const { members, resolved } = useCommunityMembers({
    communityCloudId: community?.cloudId,
    communityLocalId: community?.id,
    currentUserId: auth.user?.id ?? null,
    enabled,
  });

  return {
    ...deriveCommunityPermissions({
      isSupabaseConfigured: auth.isSupabaseConfigured,
      userId: auth.user?.id ?? null,
      globalRole: auth.profile?.role ?? null,
      community,
      members,
    }),
    membersResolved: !enabled || !auth.user || resolved,
  };
}
