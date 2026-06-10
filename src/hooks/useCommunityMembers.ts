import { useCallback, useEffect, useState } from 'react';
import { CommunityMember, CommunityMemberRole } from '../types';
import { membershipCloudService } from '../services/supabase/membershipCloudService';

interface UseCommunityMembersOptions {
  /** Cloud (uuid) id of the community. Membership lives only in the cloud. */
  communityCloudId?: string;
  /** Local id, used to map members back to the local community. */
  communityLocalId?: string;
  /** Currently signed-in user, to derive the viewer's own role. */
  currentUserId: string | null;
  /** Only fetch when cloud sync is available and the panel is visible. */
  enabled: boolean;
}

function messageOf(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string') return error;
  return fallback;
}

/**
 * Wraps {@link membershipCloudService} with React state: keeps the member list
 * for a single community, exposes the viewer's own role (to gate management
 * controls) and the invite / role-change / remove actions. Mutations re-fetch so
 * the list always reflects the server (and server-side RLS / trigger guards).
 */
export function useCommunityMembers({
  communityCloudId,
  communityLocalId,
  currentUserId,
  enabled,
}: UseCommunityMembersOptions) {
  const [members, setMembers] = useState<CommunityMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!enabled || !communityCloudId) {
      setMembers([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await membershipCloudService.fetchByCommunity(
        communityCloudId,
        communityLocalId,
      );
      setMembers(data);
    } catch (e) {
      setError(messageOf(e, 'Não foi possível carregar os membros.'));
    } finally {
      setLoading(false);
    }
  }, [enabled, communityCloudId, communityLocalId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const currentMember = members.find((member) => member.userId === currentUserId) ?? null;
  const canManage = currentMember?.role === 'owner' || currentMember?.role === 'admin';

  const invite = useCallback(
    async (email: string, role: CommunityMemberRole) => {
      if (!communityCloudId) {
        throw new Error('Sincronize a comunidade com a nuvem antes de convidar membros.');
      }
      await membershipCloudService.addOrganizerByEmail(
        communityCloudId,
        email,
        role,
        communityLocalId,
      );
      await reload();
    },
    [communityCloudId, communityLocalId, reload],
  );

  const changeRole = useCallback(
    async (memberId: string, role: CommunityMemberRole) => {
      await membershipCloudService.updateRole(memberId, role);
      await reload();
    },
    [reload],
  );

  const remove = useCallback(
    async (memberId: string) => {
      await membershipCloudService.removeMember(memberId);
      await reload();
    },
    [reload],
  );

  return {
    members,
    loading,
    error,
    currentMember,
    canManage,
    reload,
    invite,
    changeRole,
    remove,
  };
}
