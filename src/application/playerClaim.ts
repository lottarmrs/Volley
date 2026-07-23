import type { Player } from '../types';
import type { ProductErrorCode } from './appResult';

export interface PlayerIdentityAlias {
  legacyPlayerId: string;
  legacyLocalId?: string;
  canonicalPlayerId: string;
}

export interface PlayerClaimResult extends PlayerIdentityAlias {
  claimId: string;
}

export interface PermanentPlayerLinkFailure {
  code: Extract<ProductErrorCode, 'permission_denied' | 'conflict' | 'invalid_input' | 'not_found'>;
  message: string;
  recoverable: false;
}

export function classifyPermanentPlayerLinkFailure(
  error: unknown,
): PermanentPlayerLinkFailure | null {
  if (!error || typeof error !== 'object') return null;

  const value = error as Record<string, unknown>;
  const code = String(value.code ?? value.statusCode ?? '');
  const status = Number(value.status ?? value.statusCode);

  if (code === '23505' || status === 409) {
    return {
      code: 'conflict',
      message: 'O vinculo conflita com uma decisao existente.',
      recoverable: false,
    };
  }
  if (
    code === '42501' ||
    code === '28000' ||
    code === '28P01' ||
    status === 401 ||
    status === 403
  ) {
    return {
      code: 'permission_denied',
      message: 'Voce nao tem permissao para concluir este vinculo.',
      recoverable: false,
    };
  }
  if (status === 404) {
    return {
      code: 'not_found',
      message: 'A solicitacao de vinculo nao existe mais.',
      recoverable: false,
    };
  }
  if (
    code === '22023' ||
    code === '22P02' ||
    code === '23503' ||
    code === '23514' ||
    code === '0A000' ||
    status === 400 ||
    status === 422
  ) {
    return {
      code: 'invalid_input',
      message: 'A solicitacao de vinculo nao e mais valida.',
      recoverable: false,
    };
  }

  return null;
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

  if (canonicalIndex < 0) {
    return players.map((player, index) =>
      index === legacyIndex
        ? {
            ...player,
            cloudId: claim.canonicalPlayerId,
            ativo: true,
            deletedAt: undefined,
            syncStatus: 'synced',
            lastSyncedAt: nowIso,
            updatedAt: nowIso,
            username: undefined,
            userId: undefined,
          }
        : player,
    );
  }

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
