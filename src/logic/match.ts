import { Game, PointEvent, PointReason, Skill, Fault, Team, Player } from '../types';

export const POINT_REASON_LABELS: Record<PointReason, string> = {
  attack: 'Ataque',
  block: 'Bloqueio',
  serve_ace: 'Ace',
  opponent_error: 'Erro adversário',
  defense_counterattack: 'Contra-ataque',
  tip: 'Largada',
  unknown: 'Não informado',
};

// Termos do vôlei para as ações positivas (ponto nosso).
export const SKILL_LABELS: Record<Skill, string> = {
  saque: 'Ace (Saque)',
  recepcao: 'Recepção',
  levantamento: 'Levantamento',
  ataque: 'Cortada (Ataque)',
  bloqueio: 'Bloqueio',
  defesa: 'Defesa',
  posicionamento: 'Posicionamento',
};

// Termos do vôlei para os erros (faltas).
export const FAULT_LABELS: Record<Fault, string> = {
  saque_fora: 'Saque para fora',
  saque_rede: 'Saque na rede',
  ataque_fora: 'Ataque para fora',
  ataque_rede: 'Ataque na rede',
  dois_toques: 'Dois toques',
  conducao: 'Condução',
  quatro_toques: 'Quatro toques',
  toque_apoiado: 'Toque apoiado',
  toque_rede: 'Toque na rede',
  invasao_quadra: 'Invasão de quadra',
  invasao_rede: 'Invasão da rede',
  ataque_linha_ataque: 'Ataque atrás da linha de ataque',
  libero_ataque: 'Líbero atacando',
  libero_levantamento_frente: 'Líbero levantou à frente da linha',
  libero_bloqueio: 'Líbero bloqueando',
  libero_saque: 'Líbero sacando',
  bloqueio_fora_antena: 'Bloqueio fora da antena',
  posicao_rotacao: 'Erro de rodízio / posição',
};

// Mapeia uma habilidade (taxonomia nova) para o `reason` legado, mantendo
// compatibilidade com leituras e estatísticas antigas.
const SKILL_TO_REASON: Record<Skill, PointReason> = {
  saque: 'serve_ace',
  ataque: 'attack',
  bloqueio: 'block',
  defesa: 'defense_counterattack',
  recepcao: 'unknown',
  levantamento: 'unknown',
  posicionamento: 'unknown',
};

export function skillToReason(skill: Skill): PointReason {
  return SKILL_TO_REASON[skill] ?? 'unknown';
}

const CREDITED_REASONS: PointReason[] = [
  'attack',
  'block',
  'serve_ace',
  'defense_counterattack',
  'tip',
];

/** Um ponto conta para o ranking individual quando foi conquistado ativamente. */
export function isCreditedPoint(point: PointEvent): boolean {
  // Taxonomia nova: crédito por ponto conquistado (winner).
  if (point.pointType) return point.pointType === 'winner';
  // Legado: crédito pelos reasons históricos.
  return CREDITED_REASONS.includes(point.reason ?? 'unknown');
}

export function calculatePlayerScoringRanking(pointEvents: PointEvent[]) {
  const ranking: Record<string, number> = {};

  pointEvents.forEach((point) => {
    if (!point.playerId) return;
    if (!isCreditedPoint(point)) return;

    ranking[point.playerId] = (ranking[point.playerId] || 0) + 1;
  });

  return Object.entries(ranking)
    .map(([playerId, points]) => ({ playerId, points }))
    .sort((a, b) => b.points - a.points);
}

export function calculateTeamSessionStats(games: Game[], teamIds: string[]) {
  return teamIds
    .map((teamId) => {
      const finishedGames = games.filter(
        (g) => g.status === 'finished' && (g.teamAId === teamId || g.teamBId === teamId),
      );

      const wins = finishedGames.filter((g) => g.winnerTeamId === teamId).length;
      const losses = finishedGames.filter((g) => g.loserTeamId === teamId).length;

      const pointsFor = finishedGames.reduce((sum, game) => {
        if (game.teamAId === teamId) return sum + game.scoreA;
        if (game.teamBId === teamId) return sum + game.scoreB;
        return sum;
      }, 0);

      const pointsAgainst = finishedGames.reduce((sum, game) => {
        if (game.teamAId === teamId) return sum + game.scoreB;
        if (game.teamBId === teamId) return sum + game.scoreA;
        return sum;
      }, 0);

      return {
        teamId,
        gamesPlayed: finishedGames.length,
        wins,
        losses,
        pointsFor,
        pointsAgainst,
        pointDifference: pointsFor - pointsAgainst,
      };
    })
    .sort(
      (a, b) =>
        b.wins - a.wins || b.pointDifference - a.pointDifference || b.pointsFor - a.pointsFor,
    );
}

export function getPointLabel(point: PointEvent, teams: Team[], players: Player[]) {
  const team = teams.find((t) => t.id === point.scoringTeamId);
  const player = players.find((p) => p.id === point.playerId);
  // Prefere a taxonomia nova (skill/fault); cai para o reason legado.
  const reason = point.skill
    ? SKILL_LABELS[point.skill]
    : point.fault
      ? FAULT_LABELS[point.fault]
      : POINT_REASON_LABELS[point.reason ?? 'unknown'];

  return {
    score: `${point.scoreAfter.teamA}x${point.scoreAfter.teamB}`,
    teamName: team?.name ?? 'Time',
    playerName: player?.nome ?? 'Ponto do time',
    reason,
  };
}
