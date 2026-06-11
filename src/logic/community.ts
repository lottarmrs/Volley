import {
  Community,
  CommunityRanking,
  CommunityRankingFilter,
  CommunitySummary,
  Game,
  Player,
  PointEvent,
  Session,
  SessionReport,
  SessionType,
  Team,
} from '../types';
import { calculateGeneralOverall } from './calculations';

const CREDITED_REASONS = ['attack', 'block', 'serve_ace', 'defense_counterattack', 'tip'];

export function getCommunityPlayers(communityId: string, players: Player[]) {
  return (players || []).filter(
    (player) => player && (player.communityIds ?? []).includes(communityId),
  );
}

export function getCommunitySessions(communityId: string, sessions: Session[]) {
  return (sessions || [])
    .filter((session) => session && session.communityId === communityId)
    .sort((a, b) => {
      const timeA = a.date ? new Date(a.date).getTime() : 0;
      const timeB = b.date ? new Date(b.date).getTime() : 0;
      return timeB - timeA;
    });
}

export function getCommunityGames(communityId: string, sessions: Session[], games: Game[]) {
  const sessionIds = new Set(
    getCommunitySessions(communityId, sessions).map((session) => session.id),
  );
  return (games || []).filter((game) => game && sessionIds.has(game.sessionId));
}

export function getCommunityPoints(
  communityId: string,
  sessions: Session[],
  pointEvents: PointEvent[],
) {
  const sessionIds = new Set(
    getCommunitySessions(communityId, sessions).map((session) => session.id),
  );
  return (pointEvents || []).filter((point) => point && sessionIds.has(point.sessionId));
}

export function getPlayerDisplayName(player?: Player) {
  if (!player) return 'Atleta';
  return player.apelido || player.nome || 'Atleta';
}

function getLastMvpName(sessionReports: SessionReport[], communitySessions: Session[]) {
  const ids = new Set(communitySessions.map((session) => session.id));
  const reportsList = Array.isArray(sessionReports) ? sessionReports : [];
  const report = [...reportsList].reverse().find((item) => item && ids.has(item.sessionId));
  return report?.playerRanking?.[0]?.playerName;
}

function getMostFrequentPlayerName(communitySessions: Session[], players: Player[]) {
  const counts: Record<string, number> = {};
  communitySessions.forEach((session) => {
    if (session && Array.isArray(session.selectedPlayerIds)) {
      session.selectedPlayerIds.forEach((playerId) => {
        if (playerId) {
          counts[playerId] = (counts[playerId] || 0) + 1;
        }
      });
    }
  });

  const entries = Object.entries(counts);
  if (entries.length === 0) return 'Sem dados';
  const [playerId] = entries.sort((a, b) => b[1] - a[1])[0] || [];
  if (!playerId) return 'Sem dados';
  return getPlayerDisplayName((players || []).find((player) => player && player.id === playerId));
}

function getMostUsedFormat(communitySessions: Session[]): SessionType | undefined {
  const counts: Record<SessionType, number> = { free_play: 0, tournament: 0 };
  communitySessions.forEach((session) => {
    if (session && session.type && session.type in counts) {
      counts[session.type] += 1;
    }
  });
  if (counts.free_play === 0 && counts.tournament === 0) return undefined;
  return counts.tournament > counts.free_play ? 'tournament' : 'free_play';
}

export function getCommunitySummary(params: {
  community: Community;
  players: Player[];
  sessions: Session[];
  games: Game[];
  pointEvents: PointEvent[];
  sessionReports: SessionReport[];
}): CommunitySummary {
  const communityPlayers = getCommunityPlayers(params.community?.id, params.players || []);
  const communitySessions = getCommunitySessions(params.community?.id, params.sessions || []);
  const communityGames = getCommunityGames(
    params.community?.id,
    params.sessions || [],
    params.games || [],
  );
  const communityPoints = getCommunityPoints(
    params.community?.id,
    params.sessions || [],
    params.pointEvents || [],
  );
  const finishedSessions = communitySessions.filter((session) => session && session.status === 'finished');
  const finishedGames = communityGames.filter(
    (game) => game && (game.status === 'finished' || game.status === 'walkover'),
  );

  return {
    totalAthletes: communityPlayers.length,
    activeAthletes: communityPlayers.filter((player) => player && player.ativo).length,
    totalSessions: finishedSessions.length,
    totalMatches: finishedGames.length,
    totalPoints: communityPoints.filter((point) => point && CREDITED_REASONS.includes(point.reason || ''))
      .length,
    lastSession: finishedSessions[0],
    lastMvpName: getLastMvpName(params.sessionReports || [], communitySessions),
    mostFrequentPlayerName: getMostFrequentPlayerName(communitySessions, params.players || []),
    mostUsedFormat: getMostUsedFormat(communitySessions),
  };
}

function filterRankingSessions(sessions: Session[], filter: CommunityRankingFilter) {
  const finished = sessions.filter((session) => session && session.status === 'finished');
  if (filter === 'last5') return finished.slice(0, 5);
  if (filter === 'last10') return finished.slice(0, 10);
  if (filter === 'month') {
    const now = new Date();
    return finished.filter((session) => {
      if (!session || !session.date) return false;
      const date = new Date(`${session.date}T12:00:00`);
      return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
    });
  }
  if (filter === 'season') {
    const year = new Date().getFullYear();
    return finished.filter((session) => {
      if (!session || !session.date) return false;
      return new Date(`${session.date}T12:00:00`).getFullYear() === year;
    });
  }
  return finished;
}

export function getCommunityRanking(params: {
  communityId: string;
  filter: CommunityRankingFilter;
  players: Player[];
  sessions: Session[];
  games: Game[];
  pointEvents: PointEvent[];
  teams: Team[];
  sessionReports: SessionReport[];
}): CommunityRanking {
  const communitySessions = filterRankingSessions(
    getCommunitySessions(params.communityId, params.sessions || []),
    params.filter,
  );
  const sessionIds = new Set(communitySessions.map((session) => session.id));
  const sessionGames = (params.games || []).filter(
    (game) =>
      game &&
      sessionIds.has(game.sessionId) &&
      (game.status === 'finished' || game.status === 'walkover'),
  );
  const sessionPoints = (params.pointEvents || []).filter(
    (point) => point && sessionIds.has(point.sessionId),
  );
  const communityPlayerIds = new Set<string>();
  communitySessions.forEach((session) => {
    if (session && Array.isArray(session.selectedPlayerIds)) {
      session.selectedPlayerIds.forEach((playerId) => {
        if (playerId) communityPlayerIds.add(playerId);
      });
    }
  });
  getCommunityPlayers(params.communityId, params.players || []).forEach((player) => {
    if (player && player.id) communityPlayerIds.add(player.id);
  });

  const rows = Array.from(communityPlayerIds).map((playerId) => {
    const player = (params.players || []).find((item) => item && item.id === playerId);
    const playerTeamIds = (params.teams || [])
      .filter(
        (team) =>
          team &&
          Array.isArray(team.playerIds) &&
          team.playerIds.includes(playerId) &&
          sessionIds.has(team.sessionId),
      )
      .map((team) => team.id);
    const playerGames = sessionGames.filter(
      (game) =>
        playerTeamIds.includes(game.teamAId || '') || playerTeamIds.includes(game.teamBId || ''),
    );
    const wins = playerGames.filter((game) => playerTeamIds.includes(game.winnerTeamId || '')).length;
    const playerPoints = sessionPoints.filter((point) => point.playerId === playerId);
    const credited = playerPoints.filter((point) => CREDITED_REASONS.includes(point.reason || ''));
    const mvpCount = (params.sessionReports || [])
      .filter((report) => report && sessionIds.has(report.sessionId))
      .filter((report) => report.playerRanking?.[0]?.playerId === playerId).length;
    const attendances = communitySessions.filter(
      (session) =>
        session &&
        Array.isArray(session.selectedPlayerIds) &&
        session.selectedPlayerIds.includes(playerId),
    ).length;

    return {
      playerId,
      playerName: getPlayerDisplayName(player),
      totalPoints: credited.length,
      attendances,
      wins,
      mvpCount,
      aces: playerPoints.filter((point) => point.reason === 'serve_ace').length,
      blocks: playerPoints.filter((point) => point.reason === 'block').length,
      attacks: playerPoints.filter(
        (point) =>
          point.reason === 'attack' ||
          point.reason === 'defense_counterattack' ||
          point.reason === 'tip',
      ).length,
      gamesPlayed: playerGames.length,
      winRate: playerGames.length > 0 ? Math.round((wins / playerGames.length) * 100) : 0,
      presenceRate:
        communitySessions.length > 0 ? Math.round((attendances / communitySessions.length) * 100) : 0,
      regularity:
        player?.atributos?.regularidade !== undefined
          ? Math.round(player.atributos.regularidade * 10)
          : 0,
      evolution:
        player?.formaAtual?.valor !== undefined ? Math.round(player.formaAtual.valor * 10) : 0,
      overall: player ? calculateGeneralOverall(player) : 0,
    };
  });

  return {
    filter: params.filter,
    rows: rows
      .sort(
        (a, b) => b.totalPoints - a.totalPoints || b.wins - a.wins || b.attendances - a.attendances,
      )
      .map(({ overall: _overall, ...row }) => row),
  };
}

export function getCommunityFrequency(playerId: string, sessions: Session[]) {
  const list = Array.isArray(sessions) ? sessions : [];
  if (list.length === 0) return 0;
  const attended = list.filter(
    (session) =>
      session &&
      Array.isArray(session.selectedPlayerIds) &&
      session.selectedPlayerIds.includes(playerId),
  ).length;
  return Math.round((attended / list.length) * 100);
}
