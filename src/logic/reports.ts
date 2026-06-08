import { Game, PointEvent, Team, Player, GameReport, SessionReport, Session } from "../types";
import { calculateTournamentStandings, isResultGame } from "./tournament";

export function generateGameReport(
  game: Game,
  allPoints: PointEvent[],
  teams: Team[],
  players: Player[]
): GameReport {
  const gamePoints = allPoints.filter(p => p.gameId === game.id);
  const teamA = teams.find(t => t.id === game.teamAId)!;
  const teamB = teams.find(t => t.id === game.teamBId)!;

  const getPlayerStatsForGame = (playerId: string, team: Team) => {
    const pPoints = gamePoints.filter(p => p.playerId === playerId);
    return {
      playerId,
      playerName: players.find(p => p.id === playerId)?.nome || "Atleta",
      teamId: team.id,
      teamName: team.name,
      totalPoints: pPoints.length,
      attacks: pPoints.filter(p => p.reason === 'attack' || p.reason === 'defense_counterattack' || p.reason === 'tip').length,
      blocks: pPoints.filter(p => p.reason === 'block').length,
      aces: pPoints.filter(p => p.reason === 'serve_ace').length,
      tips: pPoints.filter(p => p.reason === 'tip').length,
      counterAttacks: pPoints.filter(p => p.reason === 'defense_counterattack').length,
    };
  };

  const playerStats = [
    ...teamA.playerIds.map(pid => getPlayerStatsForGame(pid, teamA)),
    ...teamB.playerIds.map(pid => getPlayerStatsForGame(pid, teamB))
  ];

  const winnerTeam = game.winnerTeamId === teamA.id ? teamA : teamB;
  const loserTeam = game.winnerTeamId === teamA.id ? teamB : teamA;

  return {
    id: `report-${Date.now()}-${game.id}`,
    sessionId: game.sessionId,
    gameId: game.id,
    sequenceNumber: game.sequenceNumber || 0,
    generatedAt: new Date().toISOString(),
    teamA: {
      id: teamA.id,
      name: teamA.name,
      playerIds: teamA.playerIds,
      playerNames: teamA.playerIds.map(pid => players.find(p => p.id === pid)?.nome || "Atleta"),
      score: game.scoreA
    },
    teamB: {
      id: teamB.id,
      name: teamB.name,
      playerIds: teamB.playerIds,
      playerNames: teamB.playerIds.map(pid => players.find(p => p.id === pid)?.nome || "Atleta"),
      score: game.scoreB
    },
    winnerTeamId: winnerTeam.id,
    winnerTeamName: winnerTeam.name,
    loserTeamId: loserTeam.id,
    loserTeamName: loserTeam.name,
    startedAt: game.startedAt,
    finishedAt: game.finishedAt,
    totalPoints: gamePoints.length,
    playerStats
  };
}

export function generateSessionReport(
  session: Session,
  sessionGames: Game[],
  sessionPoints: PointEvent[],
  sessionTeams: Team[],
  players: Player[]
): SessionReport {
  const gameReports = sessionGames
    .filter(isResultGame)
    .sort((a,b) => (a.sequenceNumber || 0) - (b.sequenceNumber || 0))
    .map(g => generateGameReport(g, sessionPoints, sessionTeams, players));

  // Team Standings
  const teamStandings = session.type === 'tournament' && session.config?.type === 'tournament'
    ? calculateTournamentStandings(sessionGames, session.teamIds, session.config.classificationPoints).map(row => ({
      teamId: row.teamId,
      teamName: sessionTeams.find(team => team.id === row.teamId)?.name || 'Time',
      wins: row.wins,
      losses: row.losses,
      classificationPoints: row.classificationPoints,
      pointsFor: row.pointsFor,
      pointsAgainst: row.pointsAgainst,
      pointDifference: row.pointDifference,
      winRate: row.winRate,
    }))
    : sessionTeams.map(team => {
    const tGames = sessionGames.filter(g => isResultGame(g) && (g.teamAId === team.id || g.teamBId === team.id));
    const wins = tGames.filter(g => g.winnerTeamId === team.id).length;
    const pointsFor = tGames.reduce((acc, g) => acc + (g.teamAId === team.id ? g.scoreA : g.scoreB), 0);
    const pointsAgainst = tGames.reduce((acc, g) => acc + (g.teamAId === team.id ? g.scoreB : g.scoreA), 0);

    return {
      teamId: team.id,
      teamName: team.name,
      wins,
      losses: tGames.length - wins,
      pointsFor,
      pointsAgainst,
      pointDifference: pointsFor - pointsAgainst
    };
  }).sort((a,b) => b.wins - a.wins || b.pointDifference - a.pointDifference);

  // Player Ranking
  const playerIds = Array.from(new Set(sessionTeams.flatMap(t => t.playerIds)));
  const playerRanking = playerIds.map(pid => {
    const pPoints = sessionPoints.filter(p => p.playerId === pid);
    return {
      playerId: pid,
      playerName: players.find(p => p.id === pid)?.nome || "Atleta",
      totalPoints: pPoints.length,
      attacks: pPoints.filter(p => p.reason === 'attack' || p.reason === 'defense_counterattack' || p.reason === 'tip').length,
      blocks: pPoints.filter(p => p.reason === 'block').length,
      aces: pPoints.filter(p => p.reason === 'serve_ace').length,
      tips: pPoints.filter(p => p.reason === 'tip').length,
      counterAttacks: pPoints.filter(p => p.reason === 'defense_counterattack').length,
    };
  }).sort((a,b) => b.totalPoints - a.totalPoints);

  return {
    id: `session-report-${Date.now()}-${session.id}`,
    sessionId: session.id,
    generatedAt: new Date().toISOString(),
    sessionName: session.name,
    date: session.date,
    type: session.type || 'free_play',
    rules: {
      maxPoints: session.config?.maxPoints || 15,
      tieBreakMethod: session.config?.tieBreakMethod || 'win_by_2',
      rotationSystem: session.config?.type === 'free_play' ? session.config.rotationSystem : undefined,
      maxConsecutiveGames: session.config?.type === 'free_play' ? session.config.maxConsecutiveGames : undefined
    },
    totalGames: gameReports.length,
    totalPoints: sessionPoints.length,
    teamStandings,
    playerRanking,
    games: gameReports
  };
}
