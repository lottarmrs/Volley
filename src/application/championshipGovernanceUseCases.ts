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

export function calculateRecentForm(teamId: string, games: Game[]): ('v' | 'd')[] {
  const teamGames = games.filter(
    (g) => (g.teamAId === teamId || g.teamBId === teamId) && g.winnerTeamId,
  );
  const lastFive = teamGames.slice(-5);
  return lastFive.map((g) => (g.winnerTeamId === teamId ? 'v' : 'd'));
}
