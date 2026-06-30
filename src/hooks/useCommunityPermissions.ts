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
