import type { Player, PlayerLinkProposal } from '../types';
import {
  buildPlayerLinkProposal,
  linkPlayerToUser,
  supersedePendingProposalsForLink,
} from '../domain/playerLink';
import { playerCloudService } from '../services/supabase/playerCloudService';
import { playerLinkProposalCloudService } from '../services/supabase/playerLinkProposalCloudService';
import { appOk, productError, recoverableIssue } from './appResult';
import type { AppResult } from './appResult';

export interface PlayerLinkCommandGateway {
  propose?: (playerCloudId: string) => Promise<string>;
  approve?: (proposalId: string) => Promise<void>;
  reject?: (proposalId: string) => Promise<void>;
  cancel?: (proposalId: string) => Promise<void>;
  unlink?: (playerCloudId: string) => Promise<void>;
}

export interface PlayerLinkQueryGateway {
  fetchLinkedToUser: (userId: string) => Promise<Player | null>;
  fetchPendingForUser: (userId: string) => Promise<PlayerLinkProposal | null>;
}

export interface PlayerLinkAdminQueryGateway {
  fetchAll: () => Promise<PlayerLinkProposal[]>;
}

export interface PlayerLinkStateChange {
  players?: Player[];
  linkProposals: PlayerLinkProposal[];
}

export const supabasePlayerLinkCommandGateway: Required<PlayerLinkCommandGateway> = {
  propose: playerLinkProposalCloudService.propose,
  approve: playerLinkProposalCloudService.approve,
  reject: playerLinkProposalCloudService.reject,
  cancel: playerLinkProposalCloudService.cancel,
  unlink: playerLinkProposalCloudService.unlink,
};

export const supabasePlayerLinkQueryGateway: PlayerLinkQueryGateway = {
  fetchLinkedToUser: playerCloudService.fetchLinkedToUser,
  fetchPendingForUser: playerLinkProposalCloudService.fetchPendingForUser,
};

export const supabasePlayerLinkAdminQueryGateway: PlayerLinkAdminQueryGateway = {
  fetchAll: playerLinkProposalCloudService.fetchAll,
};

export async function proposePlayerLinkCommand(
  input: {
    players: Player[];
    linkProposals: PlayerLinkProposal[];
    currentUserId: string | null;
    playerId: string;
    nowIso: string;
    proposalId: string;
  },
  gateway: PlayerLinkCommandGateway = supabasePlayerLinkCommandGateway,
): Promise<AppResult<PlayerLinkStateChange>> {
  if (!input.currentUserId) {
    return productError('not_authenticated', 'Usuario nao autenticado.');
  }

  const player = input.players.find((item) => item.id === input.playerId);
  if (!player) return productError('not_found', 'Atleta nao encontrado.');
  if (player.isGuest) {
    return productError(
      'guest_player_cannot_be_linked',
      'Nao e possivel vincular atletas convidados.',
    );
  }

  const newProposal = buildPlayerLinkProposal(
    player,
    input.currentUserId,
    input.nowIso,
    input.proposalId,
  );
  const players: Player[] =
    newProposal.status === 'approved'
      ? linkPlayerToUser(input.players, input.playerId, input.currentUserId, input.nowIso)
      : input.players;
  let linkProposals: PlayerLinkProposal[] = [
    ...input.linkProposals.filter(
      (proposal) =>
        !(
          proposal.playerId === input.playerId &&
          proposal.userId === input.currentUserId &&
          proposal.status === 'pending'
        ),
    ),
    newProposal,
  ];

  if (player.cloudId && gateway.propose) {
    try {
      const cloudProposalId = await gateway.propose(player.cloudId);
      linkProposals = linkProposals.map(
        (proposal): PlayerLinkProposal =>
          proposal.id === input.proposalId
            ? {
                ...proposal,
                id: cloudProposalId,
                syncStatus: 'synced',
                lastSyncedAt: new Date().toISOString(),
              }
            : proposal,
      );
    } catch (error) {
      return appOk({ players, linkProposals }, [
        recoverableIssue(
          'cloud_unavailable',
          'Vinculo salvo localmente; a nuvem sera sincronizada depois.',
          error,
        ),
      ]);
    }
  }

  return appOk({ players, linkProposals });
}

export async function reviewPlayerLinkCommand(
  input: {
    players: Player[];
    linkProposals: PlayerLinkProposal[];
    currentUserId: string | null;
    proposalId: string;
    action: 'approve' | 'reject';
    nowIso: string;
  },
  gateway: PlayerLinkCommandGateway = supabasePlayerLinkCommandGateway,
): Promise<AppResult<PlayerLinkStateChange>> {
  if (!input.currentUserId) {
    return productError('not_authenticated', 'Usuario nao autenticado.');
  }

  const proposal = input.linkProposals.find((item) => item.id === input.proposalId);
  if (!proposal) return productError('not_found', 'Solicitacao nao encontrada.');

  const player = input.players.find(
    (item) =>
      item.id === proposal.playerId || (!!item.cloudId && item.cloudId === proposal.playerCloudId),
  );
  if (!player) return productError('not_found', 'Atleta associado nao encontrado.');

  const isTemp = proposal.syncStatus === 'pending';
  let players: Player[] = input.players;
  let linkProposals: PlayerLinkProposal[];

  if (input.action === 'approve') {
    players = linkPlayerToUser(input.players, player.id, proposal.userId, input.nowIso);
    linkProposals = supersedePendingProposalsForLink(
      input.linkProposals,
      {
        playerId: player.id,
        playerCloudId: proposal.playerCloudId ?? player.cloudId,
        userId: proposal.userId,
      },
      input.currentUserId,
      input.nowIso,
    ).map(
      (item): PlayerLinkProposal =>
        item.id === input.proposalId
          ? {
              ...item,
              status: 'approved',
              reviewedBy: input.currentUserId,
              reviewedAt: input.nowIso,
              syncStatus: isTemp ? 'pending' : 'synced',
            }
          : item,
    );
  } else {
    linkProposals = input.linkProposals.map(
      (item): PlayerLinkProposal =>
        item.id === input.proposalId
          ? {
              ...item,
              status: 'rejected',
              reviewedBy: input.currentUserId,
              reviewedAt: input.nowIso,
              syncStatus: isTemp ? 'pending' : 'synced',
            }
          : item,
    );
  }

  if (!isTemp) {
    try {
      if (input.action === 'approve') await gateway.approve?.(input.proposalId);
      else await gateway.reject?.(input.proposalId);
      linkProposals = markProposalSynced(linkProposals, input.proposalId);
    } catch (error) {
      linkProposals = markProposalPending(linkProposals, input.proposalId);
      return appOk({ players, linkProposals }, [
        recoverableIssue(
          'cloud_unavailable',
          'Revisao salva localmente; a nuvem sera sincronizada depois.',
          error,
        ),
      ]);
    }
  }

  return appOk({ players, linkProposals });
}

export async function cancelPlayerLinkCommand(
  input: {
    linkProposals: PlayerLinkProposal[];
    currentUserId: string | null;
    proposalId: string;
    nowIso: string;
  },
  gateway: PlayerLinkCommandGateway = supabasePlayerLinkCommandGateway,
): Promise<AppResult<PlayerLinkStateChange>> {
  if (!input.currentUserId) {
    return productError('not_authenticated', 'Usuario nao autenticado.');
  }
  const proposal = input.linkProposals.find((item) => item.id === input.proposalId);
  if (!proposal) return productError('not_found', 'Solicitacao nao encontrada.');

  const isTemp = proposal.syncStatus === 'pending';
  let linkProposals: PlayerLinkProposal[] = input.linkProposals.map(
    (item): PlayerLinkProposal =>
      item.id === input.proposalId
        ? {
            ...item,
            status: 'rejected',
            reviewedBy: input.currentUserId,
            reviewedAt: input.nowIso,
            syncStatus: isTemp ? 'pending' : 'synced',
          }
        : item,
  );

  if (!isTemp) {
    try {
      await gateway.cancel?.(input.proposalId);
      linkProposals = markProposalSynced(linkProposals, input.proposalId);
    } catch (error) {
      linkProposals = markProposalPending(linkProposals, input.proposalId);
      return appOk({ linkProposals }, [
        recoverableIssue(
          'cloud_unavailable',
          'Cancelamento salvo localmente; a nuvem sera sincronizada depois.',
          error,
        ),
      ]);
    }
  }

  return appOk({ linkProposals });
}

export async function unlinkPlayerCommand(
  input: {
    players: Player[];
    linkProposals: PlayerLinkProposal[];
    currentUserId: string | null;
    playerId: string;
    nowIso: string;
  },
  gateway: PlayerLinkCommandGateway = supabasePlayerLinkCommandGateway,
): Promise<AppResult<PlayerLinkStateChange>> {
  if (!input.currentUserId) {
    return productError('not_authenticated', 'Usuario nao autenticado.');
  }
  const player = input.players.find((item) => item.id === input.playerId);
  if (!player) return productError('not_found', 'Atleta nao encontrado.');

  let players: Player[] = input.players.map(
    (item): Player =>
      item.id === input.playerId
        ? {
            ...item,
            userId: undefined,
            pendingUserLinkAction: item.cloudId ? 'unlink' : undefined,
            syncStatus: 'pending',
            updatedAt: input.nowIso,
          }
        : item,
  );
  const linkProposals: PlayerLinkProposal[] = input.linkProposals.map(
    (proposal): PlayerLinkProposal => {
      const samePlayer =
        proposal.playerId === input.playerId ||
        (!!proposal.playerCloudId && !!player.cloudId && proposal.playerCloudId === player.cloudId);

      if (samePlayer && proposal.status === 'pending') {
        return {
          ...proposal,
          status: 'superseded',
          reviewedBy: input.currentUserId,
          reviewedAt: input.nowIso,
          syncStatus: proposal.syncStatus === 'pending' ? 'pending' : 'synced',
        };
      }

      return proposal;
    },
  );

  if (player.cloudId) {
    try {
      await gateway.unlink?.(player.cloudId);
      players = markPlayerUserLinkSynced(players, input.playerId, input.nowIso);
    } catch (error) {
      return appOk({ players, linkProposals }, [
        recoverableIssue(
          'cloud_unavailable',
          'Desvinculo salvo localmente; a nuvem sera sincronizada depois.',
          error,
        ),
      ]);
    }
  }

  return appOk({ players, linkProposals });
}

export async function fetchAccountPlayerLinkQuery(
  userId: string,
  gateway: PlayerLinkQueryGateway = supabasePlayerLinkQueryGateway,
): Promise<AppResult<{ linkedPlayer: Player | null; pendingProposal: PlayerLinkProposal | null }>> {
  try {
    const [linkedPlayer, pendingProposal] = await Promise.all([
      gateway.fetchLinkedToUser(userId),
      gateway.fetchPendingForUser(userId),
    ]);

    return appOk({ linkedPlayer, pendingProposal });
  } catch (error) {
    return appOk({ linkedPlayer: null, pendingProposal: null }, [
      recoverableIssue(
        'cloud_unavailable',
        'Nao foi possivel verificar o vinculo na nuvem agora.',
        error,
      ),
    ]);
  }
}

export async function fetchAllPlayerLinkProposalsQuery(
  gateway: PlayerLinkAdminQueryGateway = supabasePlayerLinkAdminQueryGateway,
): Promise<AppResult<PlayerLinkStateChange>> {
  try {
    const linkProposals = await gateway.fetchAll();
    return appOk({ linkProposals });
  } catch (error) {
    return appOk({ linkProposals: [] }, [
      recoverableIssue(
        'cloud_unavailable',
        'Nao foi possivel carregar solicitacoes de vinculo da nuvem agora.',
        error,
      ),
    ]);
  }
}

function markProposalSynced(
  proposals: PlayerLinkProposal[],
  proposalId: string,
): PlayerLinkProposal[] {
  return proposals.map(
    (proposal): PlayerLinkProposal =>
      proposal.id === proposalId
        ? { ...proposal, syncStatus: 'synced', lastSyncedAt: new Date().toISOString() }
        : proposal,
  );
}

function markProposalPending(
  proposals: PlayerLinkProposal[],
  proposalId: string,
): PlayerLinkProposal[] {
  return proposals.map(
    (proposal): PlayerLinkProposal =>
      proposal.id === proposalId ? { ...proposal, syncStatus: 'pending' } : proposal,
  );
}

function markPlayerUserLinkSynced(players: Player[], playerId: string, syncedAt: string): Player[] {
  return players.map(
    (player): Player =>
      player.id === playerId
        ? {
            ...player,
            pendingUserLinkAction: undefined,
            syncStatus: 'synced',
            lastSyncedAt: syncedAt,
          }
        : player,
  );
}
