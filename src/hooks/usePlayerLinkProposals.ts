import React, { useState, useEffect, useCallback } from 'react';
import { Player, PlayerLinkProposal } from '../types';
import { STORAGE_KEYS, loadFromStorage, saveToStorage } from '../storage/localStorageRepository';
import { playerLinkProposalCloudService } from '../services/supabase/playerLinkProposalCloudService';
import { generateUUID } from '../logic/uuid';
import {
  buildPlayerLinkProposal,
  linkPlayerToUser,
  supersedePendingProposalsForLink,
} from '../domain/playerLink';

export function usePlayerLinkProposals(
  players: Player[],
  setPlayers: React.Dispatch<React.SetStateAction<Player[]>>,
  currentUserId: string | null,
) {
  const [linkProposals, setLinkProposals] = useState<PlayerLinkProposal[]>(() =>
    loadFromStorage<PlayerLinkProposal[]>(STORAGE_KEYS.playerLinkProposals, []),
  );

  useEffect(() => {
    saveToStorage(STORAGE_KEYS.playerLinkProposals, linkProposals);
  }, [linkProposals]);

  const handleProposePlayerLink = useCallback(
    async (playerId: string) => {
      if (!currentUserId) throw new Error('Usuário não autenticado.');

      const player = players.find((p) => p.id === playerId);
      if (!player) throw new Error('Atleta não encontrado.');
      if (player.isGuest) throw new Error('Não é possível vincular atletas convidados.');

      const now = new Date().toISOString();
      const tempProposalId = `proposal-${generateUUID()}`;
      const newProposal = buildPlayerLinkProposal(player, currentUserId, now, tempProposalId);

      // Atualiza localmente
      setLinkProposals((prev) => [
        ...prev.filter(
          (p) => !(p.playerId === playerId && p.userId === currentUserId && p.status === 'pending'),
        ),
        newProposal,
      ]);

      if (newProposal.status === 'approved') {
        setPlayers((prev) => linkPlayerToUser(prev, playerId, currentUserId, now));
      }

      try {
        if (player.cloudId) {
          const cloudProposalId = await playerLinkProposalCloudService.propose(player.cloudId);
          setLinkProposals((prev) =>
            prev.map((p) =>
              p.id === tempProposalId
                ? {
                    ...p,
                    id: cloudProposalId,
                    syncStatus: 'synced',
                    lastSyncedAt: new Date().toISOString(),
                  }
                : p,
            ),
          );
        }
      } catch (error) {
        console.error('Erro ao propor vínculo na nuvem:', error);
      }
    },
    [players, setPlayers, currentUserId],
  );

  const handleReviewPlayerLink = useCallback(
    async (proposalId: string, action: 'approve' | 'reject') => {
      if (!currentUserId) throw new Error('Usuário não autenticado.');

      const proposal = linkProposals.find((p) => p.id === proposalId);
      if (!proposal) throw new Error('Solicitação não encontrada.');

      const player = players.find(
        (p) => p.id === proposal.playerId || (p.cloudId && p.cloudId === proposal.playerCloudId),
      );
      if (!player) throw new Error('Atleta associado não encontrado.');

      const now = new Date().toISOString();
      const isTemp = proposal.syncStatus === 'pending';

      if (action === 'approve') {
        setPlayers((prev) => linkPlayerToUser(prev, player.id, proposal.userId, now));

        setLinkProposals((prev) =>
          supersedePendingProposalsForLink(
            prev,
            { playerId: player.id, playerCloudId: player.cloudId, userId: proposal.userId },
            currentUserId,
            now,
          ).map((p) => {
            if (p.id === proposalId) {
              return {
                ...p,
                status: 'approved',
                reviewedBy: currentUserId,
                reviewedAt: now,
                syncStatus: isTemp ? 'pending' : 'synced',
              };
            }
            return p;
          }),
        );
      } else {
        setLinkProposals((prev) =>
          prev.map((p) =>
            p.id === proposalId
              ? {
                  ...p,
                  status: 'rejected',
                  reviewedBy: currentUserId,
                  reviewedAt: now,
                  syncStatus: isTemp ? 'pending' : 'synced',
                }
              : p,
          ),
        );
      }

      if (!isTemp) {
        try {
          if (action === 'approve') {
            await playerLinkProposalCloudService.approve(proposalId);
          } else {
            await playerLinkProposalCloudService.reject(proposalId);
          }
          setLinkProposals((prev) =>
            prev.map((p) =>
              p.id === proposalId
                ? { ...p, syncStatus: 'synced', lastSyncedAt: new Date().toISOString() }
                : p,
            ),
          );
        } catch (error) {
          console.error(
            `Erro ao ${action === 'approve' ? 'aprovar' : 'rejeitar'} proposta na nuvem:`,
            error,
          );
        }
      }
    },
    [players, setPlayers, linkProposals, currentUserId],
  );

  const handleCancelPlayerLink = useCallback(
    async (proposalId: string) => {
      if (!currentUserId) throw new Error('Usuário não autenticado.');

      const proposal = linkProposals.find((p) => p.id === proposalId);
      if (!proposal) throw new Error('Solicitação não encontrada.');

      const now = new Date().toISOString();
      const isTemp = proposal.syncStatus === 'pending';

      setLinkProposals((prev) =>
        prev.map((p) =>
          p.id === proposalId
            ? {
                ...p,
                status: 'rejected',
                reviewedBy: currentUserId,
                reviewedAt: now,
                syncStatus: isTemp ? 'pending' : 'synced',
              }
            : p,
        ),
      );

      if (!isTemp) {
        try {
          await playerLinkProposalCloudService.cancel(proposalId);
          setLinkProposals((prev) =>
            prev.map((p) =>
              p.id === proposalId
                ? { ...p, syncStatus: 'synced', lastSyncedAt: new Date().toISOString() }
                : p,
            ),
          );
        } catch (error) {
          console.error('Erro ao cancelar proposta na nuvem:', error);
        }
      }
    },
    [linkProposals, currentUserId],
  );

  const handleUnlinkPlayer = useCallback(
    async (playerId: string) => {
      if (!currentUserId) throw new Error('Usuário não autenticado.');

      const player = players.find((p) => p.id === playerId);
      if (!player) throw new Error('Atleta não encontrado.');

      const now = new Date().toISOString();

      setPlayers((prev) =>
        prev.map((p) =>
          p.id === playerId
            ? { ...p, userId: undefined, syncStatus: 'pending', updatedAt: now }
            : p,
        ),
      );

      // Cancelar/supersede propostas locais pendentes para este atleta
      setLinkProposals((prev) =>
        prev.map((p) => {
          if (
            (p.playerId === playerId ||
              (p.playerCloudId && player.cloudId && p.playerCloudId === player.cloudId)) &&
            p.status === 'pending'
          ) {
            return {
              ...p,
              status: 'superseded',
              reviewedBy: currentUserId,
              reviewedAt: now,
              syncStatus: p.syncStatus === 'pending' ? 'pending' : 'synced',
            };
          }
          return p;
        }),
      );

      if (player.cloudId) {
        try {
          await playerLinkProposalCloudService.unlink(player.cloudId);
        } catch (error) {
          console.error('Erro ao desvincular atleta na nuvem:', error);
        }
      }
    },
    [players, setPlayers, currentUserId],
  );

  return {
    linkProposals,
    setLinkProposals,
    handleProposePlayerLink,
    handleReviewPlayerLink,
    handleCancelPlayerLink,
    handleUnlinkPlayer,
  };
}
