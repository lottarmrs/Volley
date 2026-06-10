import { Game, PointEvent, Player, Team, TournamentFormat, TournamentConfig } from '../types';

export interface ScheduledTournamentMatch {
  round: number;
  teamAId: string;
  teamBId: string;
  groupId?: string | null;
  stage?: "group" | "semifinal" | "final" | "third_place";
}

export interface TournamentStanding {
  teamId: string;
  gamesPlayed: number;
  wins: number;
  losses: number;
  classificationPoints: number;
  pointsFor: number;
  pointsAgainst: number;
  pointDifference: number;
  winRate: number;
  position: number;
  tieBreakerReason?: string;
}

export interface TournamentMVP {
  playerId: string;
  playerName: string;
  teamId?: string;
  teamName?: string;
  totalPoints: number;
  mvpScore: number;
  topReason: string;
  teamWinRate: number;
}

export function generateGroupStageSchedule(teamIds: string[]): ScheduledTournamentMatch[] {
  const groupATeamIds = teamIds.filter((_, idx) => idx % 2 === 0);
  const groupBTeamIds = teamIds.filter((_, idx) => idx % 2 === 1);

  const schedA = generateRoundRobinSchedule(groupATeamIds).map(m => ({
    ...m,
    groupId: 'A',
    stage: 'group' as const
  }));
  const schedB = generateRoundRobinSchedule(groupBTeamIds).map(m => ({
    ...m,
    groupId: 'B',
    stage: 'group' as const
  }));

  return [...schedA, ...schedB];
}

export function generateTournamentSchedule(
  teamIds: string[],
  format: TournamentFormat = 'round_robin',
  config?: TournamentConfig
): ScheduledTournamentMatch[] {
  let matches: ScheduledTournamentMatch[];

  if (format === 'double_round_robin') {
    const firstLeg = generateRoundRobinSchedule(teamIds).map(m => ({
      ...m,
      stage: 'group' as const
    }));
    const secondLeg = firstLeg.map(match => ({
      round: match.round + Math.max(...firstLeg.map(m => m.round), 0),
      teamAId: match.teamBId,
      teamBId: match.teamAId,
      stage: 'group' as const
    }));
    matches = resequenceRounds([...firstLeg, ...secondLeg]);
  } else if (format === 'knockout') {
    matches = generateKnockoutSchedule(teamIds);
  } else if (format === 'groups_knockout') {
    matches = generateGroupsKnockoutSchedule(teamIds);
  } else if (format === 'group_stage') {
    matches = generateGroupStageSchedule(teamIds);
  } else {
    // default to round robin
    matches = generateRoundRobinSchedule(teamIds).map(m => ({
      ...m,
      stage: 'group' as const
    }));
  }

  // Filter based on configuration
  if (config) {
    if (config.hasFinal === false) {
      matches = matches.filter(m => m.stage !== 'final');
    }
    if (config.hasThirdPlaceMatch === false) {
      matches = matches.filter(m => m.stage !== 'third_place');
    }
  }

  return matches;
}

export function generateRoundRobinSchedule(teamIds: string[]): ScheduledTournamentMatch[] {
  const teams = teamIds.length % 2 === 0 ? [...teamIds] : [...teamIds, '__bye__'];
  const rounds = teams.length - 1;
  const half = teams.length / 2;
  const matches: ScheduledTournamentMatch[] = [];

  for (let round = 0; round < rounds; round++) {
    for (let i = 0; i < half; i++) {
      const home = teams[i];
      const away = teams[teams.length - 1 - i];
      if (home !== '__bye__' && away !== '__bye__') {
        matches.push({ round: round + 1, teamAId: home, teamBId: away });
      }
    }
    const last = teams.splice(teams.length - 1, 1)[0];
    teams.splice(1, 0, last);
  }

  return matches;
}

function resequenceRounds(matches: ScheduledTournamentMatch[]) {
  const rounds = Array.from(new Set(matches.map(match => match.round))).sort((a, b) => a - b);
  const roundMap = new Map(rounds.map((round, index) => [round, index + 1]));
  return matches.map(match => ({ ...match, round: roundMap.get(match.round) || match.round }));
}

export function calculateTournamentStandings(
  games: Game[],
  teamIds: string[],
  classPoints: { win: number; loss: number; walkoverWin?: number; walkoverLoss?: number }
): TournamentStanding[] {
  const map = new Map<string, TournamentStanding>(
    teamIds.map(id => [id, {
      teamId: id,
      gamesPlayed: 0,
      wins: 0,
      losses: 0,
      classificationPoints: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      pointDifference: 0,
      winRate: 0,
      position: 0,
    }])
  );

  const finishedGames = games.filter(g => isResultGame(g));

  finishedGames.forEach(game => {
    const a = map.get(game.teamAId);
    const b = map.get(game.teamBId);
    if (!a || !b || !game.winnerTeamId) return;

    a.gamesPlayed++;
    b.gamesPlayed++;
    a.pointsFor += game.scoreA;
    a.pointsAgainst += game.scoreB;
    b.pointsFor += game.scoreB;
    b.pointsAgainst += game.scoreA;

    const winner = game.winnerTeamId === game.teamAId ? a : b;
    const loser = game.winnerTeamId === game.teamAId ? b : a;
    const winPts = game.status === 'walkover' ? (classPoints.walkoverWin ?? classPoints.win) : classPoints.win;
    const lossPts = game.status === 'walkover' ? (classPoints.walkoverLoss ?? classPoints.loss) : classPoints.loss;

    winner.wins++;
    winner.classificationPoints += winPts;
    loser.losses++;
    loser.classificationPoints += lossPts;
  });

  const rows = [...map.values()].map(row => ({
    ...row,
    pointDifference: row.pointsFor - row.pointsAgainst,
    winRate: row.gamesPlayed > 0 ? Math.round((row.wins / row.gamesPlayed) * 100) : 0,
  }));

  return rows
    .sort((a, b) => compareTournamentStandings(a, b, finishedGames))
    .map((standing, index, sorted) => ({
      ...standing,
      position: index + 1,
      tieBreakerReason: getTieBreakerReason(standing, sorted[index - 1], finishedGames, sorted),
    }));
}

function compareTournamentStandings(a: TournamentStanding, b: TournamentStanding, games: Game[]) {
  return (
    b.classificationPoints - a.classificationPoints ||
    b.wins - a.wins ||
    b.pointDifference - a.pointDifference ||
    b.pointsFor - a.pointsFor ||
    compareHeadToHead(a.teamId, b.teamId, games) ||
    a.pointsAgainst - b.pointsAgainst
  );
}

function compareHeadToHead(teamAId: string, teamBId: string, games: Game[]) {
  const direct = games.filter(game =>
    game.status !== 'cancelled' &&
    ((game.teamAId === teamAId && game.teamBId === teamBId) ||
     (game.teamAId === teamBId && game.teamBId === teamAId))
  );
  if (direct.length === 0) return 0;
  const aWins = direct.filter(game => game.winnerTeamId === teamAId).length;
  const bWins = direct.filter(game => game.winnerTeamId === teamBId).length;
  return bWins - aWins;
}

function getTieBreakerReason(
  current: TournamentStanding,
  previous: TournamentStanding | undefined,
  games: Game[],
  sorted: TournamentStanding[]
) {
  if (!previous) return undefined;
  if (previous.classificationPoints !== current.classificationPoints) return 'pontos de classificacao';
  if (previous.wins !== current.wins) return 'vitorias';
  if (previous.pointDifference !== current.pointDifference) return 'saldo de pontos';
  if (previous.pointsFor !== current.pointsFor) return 'pontos pro';

  const tiedGroup = sorted.filter(row =>
    row.classificationPoints === current.classificationPoints &&
    row.wins === current.wins &&
    row.pointDifference === current.pointDifference &&
    row.pointsFor === current.pointsFor
  );
  if (tiedGroup.length === 2 && compareHeadToHead(previous.teamId, current.teamId, games) !== 0) {
    return 'confronto direto';
  }

  if (previous.pointsAgainst !== current.pointsAgainst) return 'menor numero de pontos contra';
  return tiedGroup.length > 2 ? 'criterios agregados' : 'criterio manual';
}

export function getTournamentProgress(
  games: Game[],
  sessionId: string
): { total: number; finished: number; remaining: number; isComplete: boolean } {
  const sessionGames = games.filter(g => g.sessionId === sessionId && g.status !== 'cancelled');
  const total = sessionGames.length;
  const finished = sessionGames.filter(isResultGame).length;
  return { total, finished, remaining: total - finished, isComplete: finished === total && total > 0 };
}

export function groupGamesByRound(games: Game[]) {
  return [...games]
    .sort((a, b) => (a.round || 0) - (b.round || 0) || (a.sequenceNumber || 0) - (b.sequenceNumber || 0))
    .reduce<Record<number, Game[]>>((acc, game) => {
      const round = game.round || 1;
      acc[round] = acc[round] || [];
      acc[round].push(game);
      return acc;
    }, {});
}

export function isResultGame(game: Game) {
  return game.status === 'finished' || game.status === 'walkover';
}

export function createWalkoverResult(game: Game, winnerTeamId: string, pointsPerGame: number): Game {
  const winnerIsA = winnerTeamId === game.teamAId;
  return {
    ...game,
    scoreA: winnerIsA ? pointsPerGame : 0,
    scoreB: winnerIsA ? 0 : pointsPerGame,
    winnerTeamId,
    loserTeamId: winnerIsA ? game.teamBId : game.teamAId,
    status: 'walkover',
    finishedAt: new Date().toISOString(),
    finishReason: 'walkover',
  };
}

export function calculateTopScorers(pointEvents: PointEvent[]) {
  const stats = new Map<string, {
    playerId: string;
    totalPoints: number;
    attacks: number;
    blocks: number;
    aces: number;
    counterAttacks: number;
    tips: number;
    opponentErrors: number;
  }>();

  pointEvents.forEach(point => {
    if (!point.playerId) return;
    const row = stats.get(point.playerId) || {
      playerId: point.playerId,
      totalPoints: 0,
      attacks: 0,
      blocks: 0,
      aces: 0,
      counterAttacks: 0,
      tips: 0,
      opponentErrors: 0,
    };
    row.totalPoints++;
    if (point.reason === 'attack') row.attacks++;
    if (point.reason === 'block') row.blocks++;
    if (point.reason === 'serve_ace') row.aces++;
    if (point.reason === 'defense_counterattack') row.counterAttacks++;
    if (point.reason === 'tip') row.tips++;
    if (point.reason === 'opponent_error') row.opponentErrors++;
    stats.set(point.playerId, row);
  });

  return [...stats.values()].sort((a, b) =>
    b.totalPoints - a.totalPoints ||
    b.aces - a.aces ||
    b.blocks - a.blocks
  );
}

export function calculateTournamentMVP(
  pointEvents: PointEvent[],
  teams: Team[],
  players: Player[],
  standings: TournamentStanding[]
): TournamentMVP | null {
  const scorers = calculateTopScorers(pointEvents);
  if (scorers.length === 0) return null;

  const ranked = scorers.map(scorer => {
    const team = teams.find(t => t.playerIds.includes(scorer.playerId));
    const standing = standings.find(s => s.teamId === team?.id);
    const mvpScore = scorer.totalPoints + scorer.aces * 0.5 + scorer.blocks * 0.5 + (standing?.wins || 0) * 0.75;
    const reasons: [string, number][] = [
      ['Ataque', scorer.attacks],
      ['Bloqueio', scorer.blocks],
      ['Ace', scorer.aces],
      ['Contra-ataque', scorer.counterAttacks],
      ['Largada', scorer.tips],
    ];
    const topReason = reasons.sort((a, b) => b[1] - a[1])[0]?.[0] || 'Pontos';
    const player = players.find(p => p.id === scorer.playerId);

    return {
      playerId: scorer.playerId,
      playerName: player?.apelido || player?.nome || 'Atleta',
      teamId: team?.id,
      teamName: team?.name,
      totalPoints: scorer.totalPoints,
      mvpScore,
      topReason,
      teamWinRate: standing?.winRate || 0,
    };
  });

  return ranked.sort((a, b) => b.mvpScore - a.mvpScore || b.totalPoints - a.totalPoints)[0];
}

export function getHighestScoreMatch(games: Game[], teams: Team[]): string {
  const finished = games.filter(g => g.status === 'finished');
  if (finished.length === 0) return "Nenhum jogo finalizado";
  const sorted = [...finished].sort((a, b) => (b.scoreA + b.scoreB) - (a.scoreA + a.scoreB));
  const match = sorted[0];
  const tA = teams.find(t => t.id === match.teamAId)?.name || "Time A";
  const tB = teams.find(t => t.id === match.teamBId)?.name || "Time B";
  return `${tA} ${match.scoreA} x ${match.scoreB} ${tB} (${match.scoreA + match.scoreB} pts)`;
}

export function getMostBalancedMatch(games: Game[], teams: Team[]): string {
  const finished = games.filter(g => g.status === 'finished');
  if (finished.length === 0) return "Nenhum jogo finalizado";
  const sorted = [...finished].sort((a, b) => {
    const diffA = Math.abs(a.scoreA - a.scoreB);
    const diffB = Math.abs(b.scoreA - b.scoreB);
    if (diffA !== diffB) return diffA - diffB;
    return (b.scoreA + b.scoreB) - (a.scoreA + a.scoreB);
  });
  const match = sorted[0];
  const tA = teams.find(t => t.id === match.teamAId)?.name || "Time A";
  const tB = teams.find(t => t.id === match.teamBId)?.name || "Time B";
  return `${tA} ${match.scoreA} x ${match.scoreB} ${tB} (${match.scoreA + match.scoreB} pts)`;
}

export function getLongestWinStreak(games: Game[], teams: Team[]): string {
  const finished = games
    .filter(g => g.status === 'finished' || g.status === 'walkover')
    .sort((a, b) => (a.sequenceNumber || 0) - (b.sequenceNumber || 0));

  if (finished.length === 0) return "Nenhuma vitória registrada";

  const currentStreaks: Record<string, number> = {};
  const maxStreaks: Record<string, number> = {};

  teams.forEach(t => {
    currentStreaks[t.id] = 0;
    maxStreaks[t.id] = 0;
  });

  finished.forEach(g => {
    const winnerId = g.winnerTeamId;
    const loserId = g.loserTeamId;
    if (!winnerId || !loserId) return;

    currentStreaks[winnerId] = (currentStreaks[winnerId] || 0) + 1;
    if (currentStreaks[winnerId] > (maxStreaks[winnerId] || 0)) {
      maxStreaks[winnerId] = currentStreaks[winnerId];
    }

    currentStreaks[loserId] = 0;
  });

  const sortedStreaks = Object.entries(maxStreaks)
    .sort((a, b) => b[1] - a[1]);

  const topTeamId = sortedStreaks[0]?.[0];
  const topStreakVal = sortedStreaks[0]?.[1] || 0;

  if (topStreakVal === 0) return "Nenhuma sequência de vitórias";

  const teamName = teams.find(t => t.id === topTeamId)?.name || "Time";
  return `${teamName} (${topStreakVal} vitória${topStreakVal > 1 ? 's' : ''} consecutiva${topStreakVal > 1 ? 's' : ''})`;
}

export function generateKnockoutSchedule(teamIds: string[]): ScheduledTournamentMatch[] {
  const n = teamIds.length;
  if (n <= 1) return [];

  const matches: ScheduledTournamentMatch[] = [];

  if (n === 2) {
    matches.push({
      round: 1,
      teamAId: teamIds[0],
      teamBId: teamIds[1],
      stage: 'final'
    });
  } else if (n === 3) {
    matches.push({
      round: 1,
      teamAId: teamIds[1],
      teamBId: teamIds[2],
      stage: 'semifinal'
    });
    matches.push({
      round: 2,
      teamAId: teamIds[0],
      teamBId: 'winner:1',
      stage: 'final'
    });
  } else if (n === 4) {
    matches.push({
      round: 1,
      teamAId: teamIds[0],
      teamBId: teamIds[3],
      stage: 'semifinal'
    });
    matches.push({
      round: 1,
      teamAId: teamIds[1],
      teamBId: teamIds[2],
      stage: 'semifinal'
    });
    matches.push({
      round: 2,
      teamAId: 'loser:1',
      teamBId: 'loser:2',
      stage: 'third_place'
    });
    matches.push({
      round: 2,
      teamAId: 'winner:1',
      teamBId: 'winner:2',
      stage: 'final'
    });
  } else if (n === 5) {
    matches.push({
      round: 1,
      teamAId: teamIds[3],
      teamBId: teamIds[4],
      stage: 'group'
    });
    matches.push({
      round: 2,
      teamAId: teamIds[0],
      teamBId: 'winner:1',
      stage: 'semifinal'
    });
    matches.push({
      round: 2,
      teamAId: teamIds[1],
      teamBId: teamIds[2],
      stage: 'semifinal'
    });
    matches.push({
      round: 3,
      teamAId: 'loser:2',
      teamBId: 'loser:3',
      stage: 'third_place'
    });
    matches.push({
      round: 3,
      teamAId: 'winner:2',
      teamBId: 'winner:3',
      stage: 'final'
    });
  } else if (n === 6) {
    matches.push({
      round: 1,
      teamAId: teamIds[2],
      teamBId: teamIds[5],
      stage: 'group'
    });
    matches.push({
      round: 1,
      teamAId: teamIds[3],
      teamBId: teamIds[4],
      stage: 'group'
    });
    matches.push({
      round: 2,
      teamAId: teamIds[0],
      teamBId: 'winner:2',
      stage: 'semifinal'
    });
    matches.push({
      round: 2,
      teamAId: teamIds[1],
      teamBId: 'winner:1',
      stage: 'semifinal'
    });
    matches.push({
      round: 3,
      teamAId: 'loser:3',
      teamBId: 'loser:4',
      stage: 'third_place'
    });
    matches.push({
      round: 3,
      teamAId: 'winner:3',
      teamBId: 'winner:4',
      stage: 'final'
    });
  } else if (n === 7) {
    matches.push({
      round: 1,
      teamAId: teamIds[1],
      teamBId: teamIds[6],
      stage: 'group'
    });
    matches.push({
      round: 1,
      teamAId: teamIds[2],
      teamBId: teamIds[5],
      stage: 'group'
    });
    matches.push({
      round: 1,
      teamAId: teamIds[3],
      teamBId: teamIds[4],
      stage: 'group'
    });
    matches.push({
      round: 2,
      teamAId: teamIds[0],
      teamBId: 'winner:3',
      stage: 'semifinal'
    });
    matches.push({
      round: 2,
      teamAId: 'winner:1',
      teamBId: 'winner:2',
      stage: 'semifinal'
    });
    matches.push({
      round: 3,
      teamAId: 'loser:4',
      teamBId: 'loser:5',
      stage: 'third_place'
    });
    matches.push({
      round: 3,
      teamAId: 'winner:4',
      teamBId: 'winner:5',
      stage: 'final'
    });
  } else if (n === 8) {
    matches.push({
      round: 1,
      teamAId: teamIds[0],
      teamBId: teamIds[7],
      stage: 'group'
    });
    matches.push({
      round: 1,
      teamAId: teamIds[1],
      teamBId: teamIds[6],
      stage: 'group'
    });
    matches.push({
      round: 1,
      teamAId: teamIds[2],
      teamBId: teamIds[5],
      stage: 'group'
    });
    matches.push({
      round: 1,
      teamAId: teamIds[3],
      teamBId: teamIds[4],
      stage: 'group'
    });
    matches.push({
      round: 2,
      teamAId: 'winner:1',
      teamBId: 'winner:4',
      stage: 'semifinal'
    });
    matches.push({
      round: 2,
      teamAId: 'winner:2',
      teamBId: 'winner:3',
      stage: 'semifinal'
    });
    matches.push({
      round: 3,
      teamAId: 'loser:5',
      teamBId: 'loser:6',
      stage: 'third_place'
    });
    matches.push({
      round: 3,
      teamAId: 'winner:5',
      teamBId: 'winner:6',
      stage: 'final'
    });
  }

  return matches;
}

export function generateGroupsKnockoutSchedule(teamIds: string[]): ScheduledTournamentMatch[] {
  const groupATeamIds = teamIds.filter((_, idx) => idx % 2 === 0);
  const groupBTeamIds = teamIds.filter((_, idx) => idx % 2 === 1);

  const schedA = generateRoundRobinSchedule(groupATeamIds).map(m => ({
    ...m,
    groupId: 'A',
    stage: 'group' as const
  }));
  const schedB = generateRoundRobinSchedule(groupBTeamIds).map(m => ({
    ...m,
    groupId: 'B',
    stage: 'group' as const
  }));

  const groupStageMatches = [...schedA, ...schedB];
  const maxGroupRound = Math.max(...groupStageMatches.map(m => m.round), 0);

  const sfRound = maxGroupRound + 1;
  const fRound = maxGroupRound + 2;
  const sf1Seq = groupStageMatches.length + 1;
  const sf2Seq = groupStageMatches.length + 2;

  const sf1: ScheduledTournamentMatch = {
    round: sfRound,
    teamAId: 'group:A:1',
    teamBId: 'group:B:2',
    stage: 'semifinal'
  };
  const sf2: ScheduledTournamentMatch = {
    round: sfRound,
    teamAId: 'group:B:1',
    teamBId: 'group:A:2',
    stage: 'semifinal'
  };

  const thirdPlace: ScheduledTournamentMatch = {
    round: fRound,
    teamAId: `loser:${sf1Seq}`,
    teamBId: `loser:${sf2Seq}`,
    stage: 'third_place'
  };
  const finalMatch: ScheduledTournamentMatch = {
    round: fRound,
    teamAId: `winner:${sf1Seq}`,
    teamBId: `winner:${sf2Seq}`,
    stage: 'final'
  };

  return [...groupStageMatches, sf1, sf2, thirdPlace, finalMatch];
}

function resolvePlaceholder(
  placeholder: string,
  gameBySeq: Map<number, Game>,
  sessionGames: Game[],
  config: TournamentConfig,
  classPoints: any
): string | null {
  if (!placeholder) return null;

  if (placeholder.startsWith('winner:') || placeholder.startsWith('loser:')) {
    const parts = placeholder.split(':');
    const type = parts[0];
    const seqNum = parseInt(parts[1], 10);
    const targetGame = gameBySeq.get(seqNum);
    if (!targetGame) return null;
    if (targetGame.status === 'finished' || targetGame.status === 'walkover') {
      return type === 'winner' ? targetGame.winnerTeamId || null : targetGame.loserTeamId || null;
    }
    return null;
  }

  if (placeholder.startsWith('group:')) {
    const parts = placeholder.split(':');
    if (parts.length !== 3) return null;
    const groupId = parts[1];
    const pos = parseInt(parts[2], 10);
    if (isNaN(pos)) return null;

    const group = config.groups?.find(g => g.id === groupId);
    if (!group) return null;

    const groupGames = sessionGames.filter(g => g.groupId === groupId && g.status !== 'cancelled');
    const allFinished = groupGames.length > 0 && groupGames.every(g => g.status === 'finished' || g.status === 'walkover');
    
    if (allFinished) {
      const standings = calculateTournamentStandings(groupGames, group.teamIds, classPoints);
      return standings[pos - 1]?.teamId || null;
    }
    return null;
  }

  return null;
}

export function propagateKnockoutResults(games: Game[], sessionId: string, config: TournamentConfig): Game[] {
  let currentGames = [...games];
  let changed = true;
  let iterations = 0;
  
  const classPoints = config.classificationPoints || { win: 3, loss: 0 };

  while (changed && iterations < 10) {
    changed = false;
    iterations++;
    
    const sessionGames = currentGames.filter(g => g.sessionId === sessionId);
    const gameBySeq = new Map<number, Game>();
    sessionGames.forEach(g => {
      gameBySeq.set(g.sequenceNumber, g);
    });

    currentGames = currentGames.map(g => {
      if (g.sessionId !== sessionId) return g;

      const origA = g.metadata?.originalTeamAId;
      const origB = g.metadata?.originalTeamBId;
      let nextTeamA = g.teamAId;
      let nextTeamB = g.teamBId;

      if (origA) {
        const resolved = resolvePlaceholder(origA, gameBySeq, sessionGames, config, classPoints);
        const expected = resolved || origA;
        if (nextTeamA !== expected) {
          nextTeamA = expected;
          changed = true;
        }
      }
      if (origB) {
        const resolved = resolvePlaceholder(origB, gameBySeq, sessionGames, config, classPoints);
        const expected = resolved || origB;
        if (nextTeamB !== expected) {
          nextTeamB = expected;
          changed = true;
        }
      }

      if (nextTeamA !== g.teamAId || nextTeamB !== g.teamBId) {
        return {
          ...g,
          teamAId: nextTeamA,
          teamBId: nextTeamB
        };
      }
      return g;
    });
  }

  return currentGames;
}

export function getTeamDisplayName(teamId: string, teams: Team[]): string {
  if (!teamId) return 'Time';
  const found = teams.find(t => t.id === teamId);
  if (found) return found.name;

  if (teamId.startsWith('winner:')) {
    const seq = teamId.split(':')[1];
    return `Vencedor Jogo ${seq}`;
  }
  if (teamId.startsWith('loser:')) {
    const seq = teamId.split(':')[1];
    return `Perdedor Jogo ${seq}`;
  }
  if (teamId.startsWith('group:')) {
    const parts = teamId.split(':');
    const groupName = parts[1];
    const pos = parts[2];
    return `${pos}º Colocado Grupo ${groupName}`;
  }

  return 'Time';
}

export function getFinalStandingsKnockout(
  games: Game[],
  teams: Team[],
  standings: TournamentStanding[]
): TournamentStanding[] {
  const finalMatch = games.find(g => g.stage === 'final' && (g.status === 'finished' || g.status === 'walkover'));
  const thirdPlaceMatch = games.find(g => g.stage === 'third_place' && (g.status === 'finished' || g.status === 'walkover'));

  if (!finalMatch) return standings;

  const firstId = finalMatch.winnerTeamId;
  const secondId = finalMatch.loserTeamId;
  const thirdId = thirdPlaceMatch?.winnerTeamId;
  const fourthId = thirdPlaceMatch?.loserTeamId;

  const order = [firstId, secondId, thirdId, fourthId].filter(id => !!id) as string[];

  const sorted = [...standings].sort((a, b) => {
    const indexA = order.indexOf(a.teamId);
    const indexB = order.indexOf(b.teamId);
    
    if (indexA !== -1 && indexB !== -1) return indexA - indexB;
    if (indexA !== -1) return -1;
    if (indexB !== -1) return 1;
    
    return standings.indexOf(a) - standings.indexOf(b);
  });

  return sorted.map((s, idx) => ({ ...s, position: idx + 1 }));
}


