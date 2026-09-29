import type { Community } from '@shared/types';
import { canManageSessions } from '../domain/communityPermissions';
import { useAuth } from './useAuth';
import { useCommunityCapabilities } from './useCommunityCapabilities';
import { useCommunityPermissions } from './useCommunityPermissions';

export function useCanManageSessions(community: Community | null): {
  allowed: boolean;
  pending: boolean;
} {
  const auth = useAuth();
  const permissions = useCommunityPermissions(community);
  const { capabilities, resolved } = useCommunityCapabilities(community);
  return canManageSessions({
    cloud: auth.isSupabaseConfigured && !!community?.cloudId && !!auth.user,
    capabilities,
    resolved,
    roleCanCreateSession: permissions.canCreateSession,
  });
}
