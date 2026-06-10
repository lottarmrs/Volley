import { Game, PointEvent, PointReason, Team, Player } from '../types';

export const POINT_REASON_LABELS: Record<PointReason, string> = {
  attack: 'Ataque',
  block: 'Bloqueio',
  serve_ace: 'Ace',
  opponent_error: 'Erro adversário',
  defense_counterattack: 'Contra-ataque',
  tip: 'Largada',
  unknown: 'Não informado',
};

const CREDITED_REASONS: PointReason[] = [
  'attack',
  'block',
  'serve_ace',
  'defense_counterattack',
  'tip',
];

export function calculatePlayerScoringRanking(pointEvents: PointEvent[]) {
  const ranking: Record<string, number> = {};

  pointEvents.forEach((point) => {
    if (!point.playerId) return;
    const reason = point.reason ?? 'unknown';
    if (!CREDITED_REASONS.includes(reason)) return;

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
  const reason = POINT_REASON_LABELS[point.reason ?? 'unknown'];

  return {
    score: `${point.scoreAfter.teamA}x${point.scoreAfter.teamB}`,
    teamName: team?.name ?? 'Time',
    playerName: player?.nome ?? 'Ponto do time',
    reason,
  };
}
