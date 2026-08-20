import type { ChampionshipRequest, Game } from '../types';
import { generateUUID } from '../logic/uuid';

export function createChampionshipRequest(
  input: Omit<ChampionshipRequest, 'id' | 'status' | 'createdAt' | 'updatedAt'>,
): ChampionshipRequest {
  const now = new Date().toISOString();
  return {
    id: generateUUID(),
    status: 'pending',
    createdAt: now,
    updatedAt: now,
    ...input,
  };
}

export function approveChampionshipRequest(
  request: ChampionshipRequest,
  adminOrCaptainId: string,
): ChampionshipRequest {
  const now = new Date().toISOString();
  return {
    ...request,
    status: 'approved',
    approvedByAdminId: adminOrCaptainId,
    updatedAt: now,
  };
}

export function acceptChampionshipRequest(
  request: ChampionshipRequest,
  captainId: string,
): ChampionshipRequest {
  return {
    ...request,
    status: 'accepted',
    acceptedByCaptainId: captainId,
    updatedAt: new Date().toISOString(),
  };
}

export function rejectChampionshipRequest(request: ChampionshipRequest): ChampionshipRequest {
  return {
    ...request,
    status: 'rejected',
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Uma solicitacao so aceita transicao enquanto esta aberta. `approved` e
 * `rejected` sao terminais: sem esta guarda daria para aprovar de novo o que ja
 * foi recusado, e a rodada mudaria de data pelas costas de quem recusou.
 */
export function isRequestOpen(request: ChampionshipRequest): boolean {
  return request.status === 'pending' || request.status === 'accepted';
}

export function calculateRecentForm(teamId: string, games: Game[]): ('v' | 'd')[] {
  const teamGames = games.filter(
    (g) => (g.teamAId === teamId || g.teamBId === teamId) && g.winnerTeamId,
  );
  const lastFive = teamGames.slice(-5);
  return lastFive.map((g) => (g.winnerTeamId === teamId ? 'v' : 'd'));
}
