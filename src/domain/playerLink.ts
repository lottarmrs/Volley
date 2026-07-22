import { Player, PlayerLinkProposal } from '../types';

export interface LinkTarget {
  playerId: string;
  playerCloudId?: string;
  userId: string;
  winnerProposalId?: string;
}

export function canDirectlyLinkPlayer(player: Player, userId: string | null): boolean {
  if (!userId) return false;
  return player.cloudOwnerId === userId || (!player.cloudId && !player.userId);
}

export function buildPlayerLinkProposal(
  player: Player,
  userId: string | null,
  nowIso: string,
  proposalId: string,
): PlayerLinkProposal {
  if (!userId) throw new Error('USER_NOT_AUTHENTICATED');
  if (player.isGuest) throw new Error('GUEST_PLAYER_CANNOT_BE_LINKED');

  return {
    id: proposalId,
    playerId: player.id,
    playerCloudId: player.cloudId,
    userId,
    status: canDirectlyLinkPlayer(player, userId) ? 'approved' : 'pending',
    createdAt: nowIso,
    syncStatus: 'pending',
  };
}

export function linkPlayerToUser(
  players: Player[],
  playerId: string,
  userId: string,
  nowIso: string,
): Player[] {
  return players.map((player) =>
    player.id === playerId
      ? { ...player, userId, syncStatus: 'pending', updatedAt: nowIso }
      : player,
  );
}

export function supersedePendingProposalsForLink(
  proposals: PlayerLinkProposal[],
  target: LinkTarget,
  reviewerId: string,
  nowIso: string,
): PlayerLinkProposal[] {
  return proposals.map((proposal) => {
    const samePlayer =
      proposal.playerId === target.playerId ||
      (!!proposal.playerCloudId && proposal.playerCloudId === target.playerCloudId);
    const sameUser = proposal.userId === target.userId;

    const pendingSyncIntent = proposal.syncStatus === 'pending' || proposal.syncStatus === 'local';
    const unresolvedIntent =
      proposal.status === 'pending' || (pendingSyncIntent && proposal.status !== 'superseded');
    if (
      proposal.id !== target.winnerProposalId &&
      unresolvedIntent &&
      (samePlayer || sameUser)
    ) {
      return {
        ...proposal,
        status: 'superseded',
        reviewedBy: reviewerId,
        reviewedAt: nowIso,
        syncStatus: proposal.syncStatus === 'pending' ? 'pending' : 'synced',
      };
    }

    return proposal;
  });
}
