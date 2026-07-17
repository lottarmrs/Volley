import { Game, PointEvent, Team, Player, GameReport, SessionReport, Session } from '../types';
import { generateUUID } from './uuid';

import { calculateTournamentStandings, isResultGame } from './tournament';
import { calculateMatchRating, calculateSessionRating } from './rating';
import { isCreditedPoint } from './match';

const isAttackPoint = (point: PointEvent) =>
  point.skill === 'ataque' ||
  point.skill === 'defesa' ||
  point.skill === 'largada' ||
  (!point.skill &&
    (point.reason === 'attack' ||
      point.reason === 'defense_counterattack' ||
      point.reason === 'tip'));

const isBlockPoint = (point: PointEvent) =>
  point.skill === 'bloqueio' || (!point.skill && point.reason === 'block');

const isAcePoint = (point: PointEvent) =>
  point.skill === 'saque' || (!point.skill && point.reason === 'serve_ace');

const isTipPoint = (point: PointEvent) =>
  point.skill === 'largada' || (!point.skill && point.reason === 'tip');

const isCounterAttackPoint = (point: PointEvent) =>
  point.skill === 'defesa' || (!point.skill && point.reason === 'defense_counterattack');

export function generateGameReport(
  game: Game,
  allPoints: PointEvent[],
  teams: Team[],
  players: Player[],
): GameReport {
  const gamePoints = allPoints.filter((p) => p.gameId === game.id);
  const teamA = (teams.find((t) => t.id === game.teamAId) || {
    id: game.teamAId || 'teamA',
    sessionId: game.sessionId || '',
    name: 'Time A',
    playerIds: [],
  }) as Team;
  const teamB = (teams.find((t) => t.id === game.teamBId) || {
    id: game.teamBId || 'teamB',
    sessionId: game.sessionId || '',
    name: 'Time B',
    playerIds: [],
  }) as Team;

  const getPlayerStatsForGame = (playerId: string, team: Team) => {
    const playerPoints = gamePoints.filter((p) => p.playerId === playerId);
    const creditedPoints = playerPoints.filter(isCreditedPoint);
    const errorPoints = playerPoints.filter((p) => {
      if (p.eventKind === 'highlight') return false;
      if (p.pointType) return p.pointType === 'error';
      return p.reason === 'opponent_error' && p.concedingTeamId === team.id;
    });
    const highlightPoints = playerPoints.filter((p) => p.eventKind === 'highlight');

    const player = players.find((p) => p.id === playerId);
    return {
      playerId,
      playerName: player?.nome || 'Atleta',
      teamId: team.id,
      teamName: team.name,
      totalPoints: creditedPoints.length,
      attacks: creditedPoints.filter(isAttackPoint).length,
      blocks: creditedPoints.filter(isBlockPoint).length,
      aces: creditedPoints.filter(isAcePoint).length,
      tips: creditedPoints.filter(isTipPoint).length,
      counterAttacks: creditedPoints.filter(isCounterAttackPoint).length,
      errors: errorPoints.length,
      highlights: highlightPoints.length,
      rating: player
        ? calculateMatchRating({ player, game, gamePoints, playerTeamId: team.id })
        : undefined,
    };
  };

  const playerStats = [
    ...teamA.playerIds.map((pid) => getPlayerStatsForGame(pid, teamA)),
    ...teamB.playerIds.map((pid) => getPlayerStatsForGame(pid, teamB)),
  ];

  const winnerTeam = game.winnerTeamId === teamA.id ? teamA : teamB;
  const loserTeam = game.winnerTeamId === teamA.id ? teamB : teamA;

  return {
    id: generateUUID(),
    sessionId: game.sessionId,
    gameId: game.id,
    sequenceNumber: game.sequenceNumber || 0,
    generatedAt: new Date().toISOString(),
    teamA: {
      id: teamA.id,
      name: teamA.name,
      playerIds: teamA.playerIds,
      playerNames: teamA.playerIds.map(
        (pid) => players.find((p) => p.id === pid)?.nome || 'Atleta',
      ),
      score: game.scoreA,
    },
    teamB: {
      id: teamB.id,
      name: teamB.name,
      playerIds: teamB.playerIds,
      playerNames: teamB.playerIds.map(
        (pid) => players.find((p) => p.id === pid)?.nome || 'Atleta',
      ),
      score: game.scoreB,
    },
    winnerTeamId: winnerTeam.id,
    winnerTeamName: winnerTeam.name,
    loserTeamId: loserTeam.id,
    loserTeamName: loserTeam.name,
    startedAt: game.startedAt,
    finishedAt: game.finishedAt,
    sets: game.sets,
    totalPoints: gamePoints.length,
    playerStats,
  };
}

export function generateSessionReport(
  session: Session,
  sessionGames: Game[],
  sessionPoints: PointEvent[],
  sessionTeams: Team[],
  players: Player[],
): SessionReport {
  const gameReports = sessionGames
    .filter(isResultGame)
    .sort((a, b) => (a.sequenceNumber || 0) - (b.sequenceNumber || 0))
    .map((g) => generateGameReport(g, sessionPoints, sessionTeams, players));

  // Team Standings
  const teamStandings =
    session.type === 'tournament' && session.config?.type === 'tournament'
      ? calculateTournamentStandings(
          sessionGames,
          session.teamIds,
          session.config.classificationPoints,
        ).map((row) => ({
          teamId: row.teamId,
          teamName: sessionTeams.find((team) => team.id === row.teamId)?.name || 'Time',
          wins: row.wins,
          losses: row.losses,
          classificationPoints: row.classificationPoints,
          pointsFor: row.pointsFor,
          pointsAgainst: row.pointsAgainst,
          pointDifference: row.pointDifference,
          winRate: row.winRate,
        }))
      : sessionTeams
          .map((team) => {
            const tGames = sessionGames.filter(
              (g) => isResultGame(g) && (g.teamAId === team.id || g.teamBId === team.id),
            );
            const wins = tGames.filter((g) => g.winnerTeamId === team.id).length;
            const pointsFor = tGames.reduce(
              (acc, g) => acc + (g.teamAId === team.id ? g.scoreA : g.scoreB),
              0,
            );
            const pointsAgainst = tGames.reduce(
              (acc, g) => acc + (g.teamAId === team.id ? g.scoreB : g.scoreA),
              0,
            );

            return {
              teamId: team.id,
              teamName: team.name,
              wins,
              losses: tGames.length - wins,
              pointsFor,
              pointsAgainst,
              pointDifference: pointsFor - pointsAgainst,
            };
          })
          .sort((a, b) => b.wins - a.wins || b.pointDifference - a.pointDifference);

  // Player Ranking
  const playerIds = Array.from(new Set(sessionTeams.flatMap((t) => t.playerIds)));
  const playerRanking = playerIds
    .map((pid) => {
      const playerPoints = sessionPoints.filter((p) => p.playerId === pid);
      const player = players.find((p) => p.id === pid);

      const creditedPoints = playerPoints.filter(isCreditedPoint);
      const playerTeams = sessionTeams.filter((t) => t.playerIds.includes(pid));
      const playerTeamIds = new Set(playerTeams.map((t) => t.id));

      const errorPoints = playerPoints.filter((p) => {
        if (p.eventKind === 'highlight') return false;
        if (p.pointType) return p.pointType === 'error';
        return p.reason === 'opponent_error' && playerTeamIds.has(p.concedingTeamId);
      });
      const highlightPoints = playerPoints.filter((p) => p.eventKind === 'highlight');

      return {
        playerId: pid,
        playerName: player?.nome || 'Atleta',
        totalPoints: creditedPoints.length,
        attacks: creditedPoints.filter(isAttackPoint).length,
        blocks: creditedPoints.filter(isBlockPoint).length,
        aces: creditedPoints.filter(isAcePoint).length,
        tips: creditedPoints.filter(isTipPoint).length,
        counterAttacks: creditedPoints.filter(isCounterAttackPoint).length,
        errors: errorPoints.length,
        highlights: highlightPoints.length,
        rating: player
          ? (calculateSessionRating({ player, sessionGames, sessionPoints, teams: sessionTeams }) ??
            undefined)
          : undefined,
      };
    })
    .sort((a, b) => b.totalPoints - a.totalPoints);

  return {
    id: generateUUID(),
    sessionId: session.id,
    generatedAt: new Date().toISOString(),
    sessionName: session.name,
    date: session.date,
    type: session.type || 'free_play',
    rules: {
      maxPoints: session.config?.maxPoints || 15,
      tieBreakMethod: session.config?.tieBreakMethod || 'win_by_2',
      rotationSystem:
        session.config?.type === 'free_play' ? session.config.rotationSystem : undefined,
      maxConsecutiveGames:
        session.config?.type === 'free_play' ? session.config.maxConsecutiveGames : undefined,
    },
    totalGames: gameReports.length,
    totalPoints: sessionPoints.length,
    teamStandings,
    playerRanking,
    games: gameReports,
  };
}
