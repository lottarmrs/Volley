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
  if (claim.canonicalPlayerId === claim.legacyPlayerId) return players;

  const canonicalIndex = findPlayerIndex(players, claim.canonicalPlayerId);
  const legacyIndex = findLegacyPlayerIndex(players, claim);

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

function findLegacyPlayerIndex(players: Player[], claim: PlayerClaimResult): number {
  const cloudIndex = players.findIndex((player) => player.cloudId === claim.legacyPlayerId);
  if (cloudIndex >= 0) return cloudIndex;

  if (claim.legacyLocalId) {
    const localIndex = players.findIndex((player) => player.id === claim.legacyLocalId);
    if (localIndex >= 0) return localIndex;
  }

  return players.findIndex((player) => player.id === claim.legacyPlayerId);
}
