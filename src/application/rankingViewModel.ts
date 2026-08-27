import type { Game, Player, PointEvent, Session, Team } from '../types';
import { calculateGeneralOverall } from '../logic/calculations';
import { calculatePlayerStats } from '../logic/statistics';

export type RankingSort = 'overall' | 'winRate' | 'points';

export const rankingPositionLabels: Record<string, string> = {
  levantador: 'Levantador',
  oposto: 'Oposto',
  ponteiro: 'Ponteiro',
  central: 'Central',
  libero: 'Líbero',
  'all-rounder': 'Coringa',
};

export function getRankDisplay(index: number) {
  if (index === 0) return '🥇';
  if (index === 1) return '🥈';
  if (index === 2) return '🥉';
  return `#${index + 1}`;
}

export function buildRankingViewModel(input: {
  players: Player[];
  games: Game[];
  pointEvents: PointEvent[];
  teams: Team[];
  sessions: Session[];
  search: string;
  sort: RankingSort;
}) {
  const search = input.search.trim().toLowerCase();
  const rankings = input.players
    .filter((player) => player.ativo)
    .map((player) => ({
      player,
      stats: calculatePlayerStats(
        player,
        input.games,
        input.pointEvents,
        input.teams,
        input.sessions,
      ),
      overall: calculateGeneralOverall(player),
    }))
    .filter(
      (ranking) =>
        !search ||
        ranking.player.nome.toLowerCase().includes(search) ||
        (ranking.player.apelido ?? '').toLowerCase().includes(search),
    );

  return rankings.sort((a, b) => {
    if (input.sort === 'winRate') return b.stats.winRate - a.stats.winRate;
    if (input.sort === 'points') return b.stats.totalPoints - a.stats.totalPoints;
    return b.overall - a.overall;
  });
}
