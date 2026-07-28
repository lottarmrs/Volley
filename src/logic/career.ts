import type { CareerTotals } from '@shared/types/career';
import type { PlayerStats } from './statistics';

/** Carreira confirmada vem do livro-razao (nuvem); provisoria e calculada localmente
 *  sobre dados ainda nao sincronizados. O spec base exige a distincao: conquista e VUT
 *  oficiais so mudam apos confirmacao cloud. */
export type CareerConfidence = 'confirmed' | 'provisional';

export interface CareerStats {
  gamesPlayed: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPoints: number;
  errors: number;
  highlights: number;
}

const EMPTY: CareerStats = {
  gamesPlayed: 0,
  wins: 0,
  losses: 0,
  winRate: 0,
  totalPoints: 0,
  errors: 0,
  highlights: 0,
};

export function careerStatsFromTotals(totals: CareerTotals | null): CareerStats {
  if (!totals) return { ...EMPTY };

  const gamesPlayed = totals.gamesPlayed;
  const wins = totals.gamesWon;
  const losses = Math.max(0, gamesPlayed - wins);

  return {
    gamesPlayed,
    wins,
    losses,
    // Sem jogo nenhum a divisao seria 0/0 = NaN, e esse numero vai direto para a tela.
    winRate: gamesPlayed > 0 ? Math.round((wins / gamesPlayed) * 100) : 0,
    totalPoints: totals.totalPoints,
    errors: totals.totalErrors,
    highlights: totals.totalHighlights,
  };
}

/** Escolhe entre carreira confirmada e provisoria, sempre dizendo qual e qual.
 *  Confirmado vem do livro-razao; sem ele, cai para o que o dispositivo calculou
 *  localmente (calculatePlayerStats) e rotula como provisorio. */
export function resolveCareer(
  confirmed: CareerTotals | null,
  local: PlayerStats,
): { stats: CareerStats; confidence: CareerConfidence } {
  if (confirmed) {
    return { stats: careerStatsFromTotals(confirmed), confidence: 'confirmed' };
  }

  return {
    stats: {
      gamesPlayed: local.gamesPlayed,
      wins: local.wins,
      losses: local.losses,
      winRate: local.winRate,
      totalPoints: local.totalPoints,
      errors: local.errors,
      highlights: local.highlights,
    },
    confidence: 'provisional',
  };
}
