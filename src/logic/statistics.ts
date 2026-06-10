import { Player, PointEvent, Game, Team, Session } from '../types';

export interface PlayerStats {
  gamesPlayed: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPoints: number;
  aces: number;
  kills: number;
  blocks: number;
  errors: number;
  pointsContribution: number; // percentage of team points scored by player
}

export function calculatePlayerStats(
  player: Player,
  allGames: Game[],
  allPoints: PointEvent[],
  allTeams: Team[],
  allSessions: Session[] = [],
): PlayerStats {
  const registeredSessionIds = new Set(
    allSessions.filter((session) => session.status === 'finished').map((session) => session.id),
  );
  const registeredGames = allGames.filter(
    (game) => game.status === 'finished' && registeredSessionIds.has(game.sessionId),
  );
  const registeredGameIds = new Set(registeredGames.map((game) => game.id));
  const playerTeams = allTeams.filter((t) => t.playerIds.includes(player.id));
  const playerTeamIds = playerTeams.map((t) => t.id);

  const playerGames = registeredGames.filter(
    (g) => playerTeamIds.includes(g.teamAId) || playerTeamIds.includes(g.teamBId),
  );

  const wins = playerGames.filter((g) => {
    const isTeamA = playerTeamIds.includes(g.teamAId);
    return isTeamA ? g.winnerTeamId === g.teamAId : g.winnerTeamId === g.teamBId;
  }).length;

  const playerPoints = allPoints.filter(
    (p) => p.playerId === player.id && registeredGameIds.has(p.gameId),
  );

  const CREDITED_REASONS = [
    'attack',
    'block',
    'serve_ace',
    'defense_counterattack',
    'tip',
  ] as const;
  const creditedPoints = playerPoints.filter((p) => CREDITED_REASONS.includes(p.reason as any));

  const aces = playerPoints.filter((p) => p.reason === 'serve_ace').length;
  const kills = playerPoints.filter((p) => p.reason === 'attack').length;
  const blocks = playerPoints.filter((p) => p.reason === 'block').length;
  const defenseCounter = playerPoints.filter((p) => p.reason === 'defense_counterattack').length;
  const tips = playerPoints.filter((p) => p.reason === 'tip').length;

  // Errors are points marked as opponent_error?
  // No, opponent_error means the SCORING team got a point because of an error.
  // We need to look for points where this player's team CONCEDED a point and a reason was error.
  const teamIdentity = allTeams.filter((t) => t.playerIds.includes(player.id)).map((t) => t.id);
  const errorsPoints = allPoints.filter(
    (p) =>
      registeredGameIds.has(p.gameId) &&
      p.concedingTeamId &&
      teamIdentity.includes(p.concedingTeamId) &&
      p.reason === 'opponent_error' &&
      p.playerId === player.id, // If we log which player made the error
  ).length;

  return {
    gamesPlayed: playerGames.length,
    wins,
    losses: playerGames.length - wins,
    winRate: playerGames.length > 0 ? (wins / playerGames.length) * 100 : 0,
    totalPoints: creditedPoints.length,
    aces,
    kills: kills + defenseCounter + tips,
    blocks,
    errors: errorsPoints,
    pointsContribution: 0,
  };
}
