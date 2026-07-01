import React, { useCallback, useEffect, useState } from 'react';
import type { Player, PlayerLinkProposal } from '../types';
import { STORAGE_KEYS, loadFromStorage, saveToStorage } from '../storage/localStorageRepository';
import { generateUUID } from '../logic/uuid';
import {
  cancelPlayerLinkCommand,
  fetchAllPlayerLinkProposalsQuery,
  proposePlayerLinkCommand,
  reviewPlayerLinkCommand,
  unlinkPlayerCommand,
} from '../application/playerLinkUseCases';

function normalizeRefreshedLinkProposal(
  proposal: PlayerLinkProposal,
  players: Player[],
): PlayerLinkProposal {
  const localPlayer = players.find(
    (player) => player.cloudId === proposal.playerId || player.id === proposal.playerId,
  );
  return {
    ...proposal,
    playerId: localPlayer?.id ?? proposal.playerId,
    playerCloudId: proposal.playerCloudId ?? localPlayer?.cloudId ?? proposal.playerId,
  };
}

function shouldKeepCurrentProposal(
  current: PlayerLinkProposal,
  incoming?: PlayerLinkProposal,
): boolean {
  if (!incoming) return true;
  if (current.syncStatus === 'pending' || current.syncStatus === 'local') return true;
  if (current.status !== 'pending' && incoming.status === 'pending') return true;
  if (current.reviewedAt && (!incoming.reviewedAt || current.reviewedAt > incoming.reviewedAt)) {
    return true;
  }
  return false;
}

function mergeLinkProposalRefresh(
  current: PlayerLinkProposal[],
  incoming: PlayerLinkProposal[],
  players: Player[],
): PlayerLinkProposal[] {
  const byId = new Map<string, PlayerLinkProposal>();
  for (const proposal of incoming) {
    const normalized = normalizeRefreshedLinkProposal(proposal, players);
    byId.set(normalized.id, normalized);
  }
  for (const proposal of current) {
    if (shouldKeepCurrentProposal(proposal, byId.get(proposal.id))) byId.set(proposal.id, proposal);
  }
  return Array.from(byId.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

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

  const handleRefreshPlayerLinkProposals = useCallback(async () => {
    const result = await fetchAllPlayerLinkProposalsQuery();

    if (result.ok === false) throw new Error(result.error.message);
    if (result.issues?.length) throw new Error(result.issues[0].message);

    setLinkProposals((current) =>
      mergeLinkProposalRefresh(current, result.value.linkProposals, players),
    );
  }, [players]);

  const handleProposePlayerLink = useCallback(
    async (playerId: string) => {
      const result = await proposePlayerLinkCommand({
        players,
        linkProposals,
        currentUserId,
        playerId,
        nowIso: new Date().toISOString(),
        proposalId: `proposal-${generateUUID()}`,
      });

      if (result.ok === false) throw new Error(result.error.message);

      setLinkProposals(result.value.linkProposals);
      if (result.value.players) setPlayers(result.value.players);
      if (result.issues?.length) console.warn('[player-link] recoverable issue:', result.issues[0]);
    },
    [players, setPlayers, linkProposals, currentUserId],
  );

  const handleReviewPlayerLink = useCallback(
    async (proposalId: string, action: 'approve' | 'reject') => {
      const result = await reviewPlayerLinkCommand({
        players,
        linkProposals,
        currentUserId,
        proposalId,
        action,
        nowIso: new Date().toISOString(),
      });

      if (result.ok === false) throw new Error(result.error.message);

      if (result.value.players) setPlayers(result.value.players);
      setLinkProposals(result.value.linkProposals);
      if (result.issues?.length) console.warn('[player-link] recoverable issue:', result.issues[0]);
    },
    [players, setPlayers, linkProposals, currentUserId],
  );

  const handleCancelPlayerLink = useCallback(
    async (proposalId: string) => {
      const result = await cancelPlayerLinkCommand({
        linkProposals,
        currentUserId,
        proposalId,
        nowIso: new Date().toISOString(),
      });

      if (result.ok === false) throw new Error(result.error.message);

      setLinkProposals(result.value.linkProposals);
      if (result.issues?.length) console.warn('[player-link] recoverable issue:', result.issues[0]);
    },
    [linkProposals, currentUserId],
  );

  const handleUnlinkPlayer = useCallback(
    async (playerId: string) => {
      const result = await unlinkPlayerCommand({
        players,
        linkProposals,
        currentUserId,
        playerId,
        nowIso: new Date().toISOString(),
      });

      if (result.ok === false) throw new Error(result.error.message);

      if (result.value.players) setPlayers(result.value.players);
      setLinkProposals(result.value.linkProposals);
      if (result.issues?.length) console.warn('[player-link] recoverable issue:', result.issues[0]);
    },
    [players, setPlayers, linkProposals, currentUserId],
  );

  return {
    linkProposals,
    setLinkProposals,
    handleProposePlayerLink,
    handleReviewPlayerLink,
    handleCancelPlayerLink,
    handleUnlinkPlayer,
    handleRefreshPlayerLinkProposals,
  };
}
