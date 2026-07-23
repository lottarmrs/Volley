import type { Player, PlayerLinkProposal } from '../types';
import {
  buildPlayerLinkProposal,
  linkPlayerToUser,
  supersedePendingProposalsForLink,
} from '../domain/playerLink';
import { playerCloudService } from '@infra/supabase/playerCloudService';
import { playerLinkProposalCloudService } from '@infra/supabase/playerLinkProposalCloudService';
import { appOk, productError, recoverableIssue, terminalIssue } from './appResult';
import type { AppResult } from './appResult';
import { applyClaimToPlayers, classifyPermanentPlayerLinkFailure } from './playerClaim';
import type { PlayerClaimResult } from './playerClaim';

export interface PlayerLinkCommandGateway {
  propose?: (playerCloudId: string) => Promise<string>;
  approve?: (proposalId: string) => Promise<PlayerClaimResult>;
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
    persistApprovalIntent?: (proposals: PlayerLinkProposal[]) => void | Promise<void>;
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
  let players: Player[] =
    newProposal.status === 'approved' && !player.cloudId
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

  if (player.cloudId && newProposal.status === 'approved') {
    try {
      await input.persistApprovalIntent?.(linkProposals);
    } catch (error) {
      return appOk({ players, linkProposals }, [
        recoverableIssue(
          'cloud_unavailable',
          'Nao foi possivel salvar a intencao de aprovacao localmente.',
          error,
        ),
      ]);
    }
  }

  if (player.cloudId && gateway.propose) {
    try {
      const cloudProposalId = await gateway.propose(player.cloudId);
      linkProposals = linkProposals.map(
        (proposal): PlayerLinkProposal =>
          proposal.id === input.proposalId
            ? {
                ...proposal,
                id: cloudProposalId,
                syncStatus: newProposal.status === 'approved' ? 'pending' : 'synced',
                ...(newProposal.status === 'approved'
                  ? {}
                  : { lastSyncedAt: new Date().toISOString() }),
              }
            : proposal,
      );
      if (newProposal.status === 'approved') {
        const claim = await gateway.approve?.(cloudProposalId);
        if (!claim) throw new Error('approve_player_link did not return a claim result');
        players = applyClaimToPlayers(players, claim, input.nowIso);
        linkProposals = supersedePendingProposalsForLink(
          linkProposals,
          {
            playerId: input.playerId,
            playerCloudId: claim.legacyPlayerId,
            userId: input.currentUserId,
            winnerProposalId: cloudProposalId,
          },
          input.currentUserId,
          input.nowIso,
        );
        linkProposals = markProposalSynced(linkProposals, cloudProposalId);
      }
    } catch (error) {
      const permanentFailure = classifyPermanentPlayerLinkFailure(error);
      if (permanentFailure) {
        const proposalId = linkProposals.find(
          (proposal) => proposal.playerId === input.playerId,
        )?.id;
        return appOk(
          {
            players,
            linkProposals: proposalId
              ? settlePermanentProposalFailure(
                  linkProposals,
                  proposalId,
                  permanentFailure.code,
                  isUuidLike(proposalId),
                )
              : linkProposals,
          },
          [terminalIssue(permanentFailure.code, permanentFailure.message, error)],
        );
      }
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
    persistApprovalIntent?: (proposals: PlayerLinkProposal[]) => void | Promise<void>;
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

  const isTemp = proposal.syncStatus === 'pending' || proposal.syncStatus === 'local';
  let players: Player[] = input.players;
  let linkProposals: PlayerLinkProposal[];

  if (input.action === 'approve' && !isTemp) {
    const approvalIntent = input.linkProposals.map(
      (item): PlayerLinkProposal =>
        item.id === input.proposalId
          ? {
              ...item,
              status: 'approved',
              reviewedBy: input.currentUserId!,
              reviewedAt: input.nowIso,
              syncStatus: 'pending',
            }
          : item,
    );
    try {
      await input.persistApprovalIntent?.(approvalIntent);
    } catch (error) {
      return appOk({ players: input.players, linkProposals: input.linkProposals }, [
        recoverableIssue(
          'cloud_unavailable',
          'Nao foi possivel salvar a intencao de aprovacao localmente.',
          error,
        ),
      ]);
    }
    try {
      const claim = await gateway.approve?.(input.proposalId);
      if (!claim) throw new Error('approve_player_link did not return a claim result');

      players = applyClaimToPlayers(input.players, claim, input.nowIso);
      linkProposals = supersedePendingProposalsForLink(
        input.linkProposals,
        {
          playerId: proposal.playerId,
          playerCloudId: claim.legacyPlayerId,
          userId: proposal.userId,
          winnerProposalId: proposal.id,
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
                syncStatus: 'synced',
              }
            : item,
      );
      return appOk({ players, linkProposals: markProposalSynced(linkProposals, input.proposalId) });
    } catch (error) {
      const permanentFailure = classifyPermanentPlayerLinkFailure(error);
      if (permanentFailure) {
        return appOk(
          {
            players: input.players,
            linkProposals: settlePermanentProposalFailure(
              approvalIntent,
              input.proposalId,
              permanentFailure.code,
            ),
          },
          [terminalIssue(permanentFailure.code, permanentFailure.message, error)],
        );
      }
      return appOk({ players: input.players, linkProposals: approvalIntent }, [
        recoverableIssue(
          'cloud_unavailable',
          'Nao foi possivel concluir a revisao na nuvem agora.',
          error,
        ),
      ]);
    }
  }

  if (input.action === 'approve') {
    players = linkPlayerToUser(input.players, player.id, proposal.userId, input.nowIso);
    linkProposals = supersedePendingProposalsForLink(
      input.linkProposals,
      {
        playerId: player.id,
        playerCloudId: proposal.playerCloudId ?? player.cloudId,
        userId: proposal.userId,
        winnerProposalId: proposal.id,
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
      await gateway.reject?.(input.proposalId);
      linkProposals = markProposalSynced(linkProposals, input.proposalId);
    } catch (error) {
      const permanentFailure = classifyPermanentPlayerLinkFailure(error);
      if (permanentFailure) {
        return appOk(
          {
            players,
            linkProposals: settlePermanentProposalFailure(
              linkProposals,
              input.proposalId,
              permanentFailure.code,
            ),
          },
          [terminalIssue(permanentFailure.code, permanentFailure.message, error)],
        );
      }
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
      const permanentFailure = classifyPermanentPlayerLinkFailure(error);
      if (permanentFailure) {
        return appOk(
          {
            linkProposals: settlePermanentProposalFailure(
              linkProposals,
              input.proposalId,
              permanentFailure.code,
            ),
          },
          [terminalIssue(permanentFailure.code, permanentFailure.message, error)],
        );
      }
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
  _gateway: PlayerLinkCommandGateway = supabasePlayerLinkCommandGateway,
): Promise<AppResult<PlayerLinkStateChange>> {
  if (!input.currentUserId) {
    return productError('not_authenticated', 'Usuario nao autenticado.');
  }
  const player = input.players.find((item) => item.id === input.playerId);
  if (!player) return productError('not_found', 'Atleta nao encontrado.');
  return productError(
    'permission_denied',
    'A identidade canonica do jogador e imutavel; desvinculo nao e suportado.',
  );
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

function settlePermanentProposalFailure(
  proposals: PlayerLinkProposal[],
  proposalId: string,
  code: 'permission_denied' | 'conflict' | 'invalid_input' | 'not_found',
  keepPending = true,
): PlayerLinkProposal[] {
  return proposals.map((proposal) =>
    proposal.id === proposalId
      ? {
          ...proposal,
          status: code === 'conflict' ? 'superseded' : keepPending ? 'pending' : 'rejected',
          reviewedBy: code === 'conflict' ? proposal.reviewedBy : undefined,
          reviewedAt: code === 'conflict' ? proposal.reviewedAt : undefined,
          syncStatus: 'synced',
          lastSyncedAt: new Date().toISOString(),
        }
      : proposal,
  );
}

function isUuidLike(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
