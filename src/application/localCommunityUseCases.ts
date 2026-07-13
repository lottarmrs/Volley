import type {
  Community,
  CommunityPresence,
  Player,
  Session,
  WhatsAppListDraft,
  WhatsAppListTemplate,
} from '../types';

export function applyCommunityDeletion(input: {
  communityId: string;
  communities: Community[];
  players: Player[];
  presenceRecords: CommunityPresence[];
  templates: WhatsAppListTemplate[];
  drafts: WhatsAppListDraft[];
}) {
  const { communityId } = input;
  return {
    communities: input.communities.filter((community) => community.id !== communityId),
    players: input.players.map((player) => ({
      ...player,
      communityIds: (player.communityIds ?? []).filter((id) => id !== communityId),
    })),
    presenceRecords: input.presenceRecords.filter((record) => record.communityId !== communityId),
    templates: input.templates.filter((template) => template.communityId !== communityId),
    drafts: input.drafts.filter((draft) => draft.communityId !== communityId),
  };
}

export function applyCommunityMembershipDuplicate(
  players: Player[],
  input: { sourceCommunityId: string; duplicateCommunityId: string },
): Player[] {
  return players.map((player) => {
    const communityIds = player.communityIds ?? [];
    if (!communityIds.includes(input.sourceCommunityId)) return player;
    return {
      ...player,
      communityIds: Array.from(new Set([...communityIds, input.duplicateCommunityId])),
    };
  });
}

export function applyPlayerCommunityMemberships(
  players: Player[],
  communityId: string,
  memberPlayerIds: string[],
): Player[] {
  const memberIds = new Set(memberPlayerIds);
  return players.map((player) => {
    const currentIds = player.communityIds ?? [];
    const isMember = memberIds.has(player.id);
    const exists = currentIds.includes(communityId);
    if (isMember && !exists) return { ...player, communityIds: [...currentIds, communityId] };
    if (!isMember && exists) {
      return { ...player, communityIds: currentIds.filter((id) => id !== communityId) };
    }
    return player;
  });
}

export function applyCommunityHistoryClear(sessions: Session[], communityId: string): Session[] {
  return sessions.map((session) =>
    session.communityId === communityId ? { ...session, communityId: null } : session,
  );
}

export function applyLinkedCloudPlayer(
  players: Player[],
  player: Player,
  communityId: string,
): Player[] {
  const updatedPlayer: Player = {
    ...player,
    communityIds: Array.from(new Set([...(player.communityIds ?? []), communityId])),
    syncStatus: 'synced',
  };
  return players.some((item) => item.id === player.id)
    ? players.map((item) => (item.id === player.id ? updatedPlayer : item))
    : [...players, updatedPlayer];
}
