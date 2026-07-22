import type { Player } from '../types';

export interface PlayerIdentityAlias {
  legacyPlayerId: string;
  legacyLocalId?: string;
  canonicalPlayerId: string;
}

export interface PlayerClaimResult extends PlayerIdentityAlias {
  claimId: string;
}

export function applyClaimToPlayers(
  players: Player[],
  claim: PlayerClaimResult,
  nowIso: string,
): Player[] {
  const canonicalIndex = findPlayerIndex(players, claim.canonicalPlayerId);
  const legacyIndex = findPlayerIndex(players, claim.legacyPlayerId);

  if (legacyIndex < 0 || legacyIndex === canonicalIndex) return players;

  return players.map((player, index) =>
    index === legacyIndex
      ? {
          ...player,
          ativo: false,
          deletedAt: nowIso,
          syncStatus: 'synced',
          lastSyncedAt: nowIso,
          updatedAt: nowIso,
          username: undefined,
          userId: undefined,
        }
      : player,
  );
}

function findPlayerIndex(players: Player[], playerId: string): number {
  const cloudIndex = players.findIndex((player) => player.cloudId === playerId);
  return cloudIndex >= 0 ? cloudIndex : players.findIndex((player) => player.id === playerId);
}
