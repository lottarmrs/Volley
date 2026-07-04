import { useCallback, useEffect, useState } from 'react';
import { CommunityMember, CommunityMemberRole } from '../types';
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
 * Wraps community membership application use cases with React state: keeps the member list
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
      const result = await fetchCommunityMembersQuery({ communityCloudId, communityLocalId });
      if (result.ok === false) throw new Error(result.error.message);
      setMembers(result.value.members);
      if (result.issues?.length) setError(result.issues[0].message);
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
  const canManage =
    (currentMember?.status ?? 'active') === 'active' &&
    (currentMember?.role === 'owner' || currentMember?.role === 'admin');

  const activeMembers = members.filter((m) => (m.status ?? 'active') === 'active');
  const pendingRequests = members.filter((m) => m.status === 'pending');

  const invite = useCallback(
    async (email: string, role: CommunityMemberRole) => {
      const result = await inviteCommunityMemberCommand({
        communityCloudId,
        communityLocalId,
        email,
        role,
      });
      if (result.ok === false) throw new Error(result.error.message);
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
      if (result.ok === false) throw new Error(result.error.message);
      await reload();
    },
    [currentUserId, members, reload],
  );

  const remove = useCallback(
    async (memberId: string) => {
      const result = await removeCommunityMemberCommand({ members, currentUserId, memberId });
      if (result.ok === false) throw new Error(result.error.message);
      await reload();
    },
    [currentUserId, members, reload],
  );

  const approveRequest = useCallback(
    async (memberId: string) => {
      const result = await approveCommunityJoinRequestCommand({
        members,
        currentUserId,
        memberId,
      });
      if (result.ok === false) throw new Error(result.error.message);
      await reload();
    },
    [currentUserId, members, reload],
  );

  const rejectRequest = useCallback(
    async (memberId: string) => {
      const result = await rejectCommunityJoinRequestCommand({
        members,
        currentUserId,
        memberId,
      });
      if (result.ok === false) throw new Error(result.error.message);
      await reload();
    },
    [currentUserId, members, reload],
  );

  const generateJoinCode = useCallback(async () => {
    const result = await generateCommunityJoinCodeCommand({
      communityCloudId,
      members,
      currentUserId,
    });
    if (result.ok === false) throw new Error(result.error.message);
    return result.value.joinCode;
  }, [communityCloudId, currentUserId, members]);

  const disableJoinCode = useCallback(async () => {
    const result = await disableCommunityJoinCodeCommand({
      communityCloudId,
      members,
      currentUserId,
    });
    if (result.ok === false) throw new Error(result.error.message);
  }, [communityCloudId, currentUserId, members]);

  const leave = useCallback(async () => {
    const result = await leaveCommunityCommand({ communityCloudId, currentMember });
    if (result.ok === false) throw new Error(result.error.message);
    await reload();
  }, [communityCloudId, currentMember, reload]);

  return {
    members,
    activeMembers,
    pendingRequests,
    loading,
    error,
    currentMember,
    canManage,
    reload,
    invite,
    changeRole,
    remove,
    approveRequest,
    rejectRequest,
    generateJoinCode,
    disableJoinCode,
    leave,
  };
}
