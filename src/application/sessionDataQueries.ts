import type {
  Community,
  Game,
  GameReport,
  PointEvent,
  Session,
  SessionConfig,
  SessionReport,
  SessionStatus,
  Team,
} from '@shared/types';
import {
  fetchOnlineRows,
  fetchRulesSnapshots,
  mapDbToGame,
  mapDbToGameReport,
  mapDbToPointEvent,
  mapDbToSession,
  mapDbToSessionReport,
  mapDbToTeam,
} from '@infra/supabase/operationalCloudService';

type DbRecord = Record<string, any>;

export interface SessionBundle {
  sessions: Session[];
  teams: Team[];
  games: Game[];
  pointEvents: PointEvent[];
  gameReports: GameReport[];
  sessionReports: SessionReport[];
}

export interface SessionRows {
  sessions: DbRecord[];
  teams: DbRecord[];
  games: DbRecord[];
  point_events: DbRecord[];
  game_reports: DbRecord[];
  session_reports: DbRecord[];
}

export function emptySessionBundle(): SessionBundle {
  return {
    sessions: [],
    teams: [],
    games: [],
    pointEvents: [],
    gameReports: [],
    sessionReports: [],
  };
}

const norm = (value: unknown) => (typeof value === 'string' ? value.toLowerCase() : '');

function targetStatus(lifecycle: unknown, hasTeams: boolean): SessionStatus {
  switch (lifecycle) {
    case 'IN_PROGRESS':
      return 'active';
    case 'COMPLETED':
      return 'finished';
    case 'CANCELLED':
      return 'cancelled';
    default:
      return hasTeams ? 'teams_generated' : 'draft';
  }
}

export function assembleSessionBundle(input: {
  rows: SessionRows;
  snapshots: { session_id: string; rules_payload: unknown }[];
  communities: Community[];
}): SessionBundle {
  const communityAppIds = new Map(
    input.communities.map((community) => [norm(community.cloudId || community.id), community.id]),
  );
  const teams = input.rows.teams.map(mapDbToTeam);
  const configBySession = new Map(
    input.snapshots.map((snapshot) => [
      norm(snapshot.session_id),
      ((snapshot.rules_payload ?? {}) as { config?: SessionConfig }).config,
    ]),
  );

  const sessions = input.rows.sessions.map((row) => {
    const session = mapDbToSession(row);
    const communityId = session.communityId
      ? (communityAppIds.get(norm(session.communityId)) ?? session.communityId)
      : session.communityId;
    if (row.authority_model !== 'target') return { ...session, communityId };
    const ownTeams = teams.filter(
      (team) => norm(team.sessionId) === norm(row.id) || norm(team.sessionId) === norm(session.id),
    );
    const config = configBySession.get(norm(row.id));
    return {
      ...session,
      communityId,
      status: targetStatus(row.lifecycle_status, ownTeams.length > 0),
      teamIds: ownTeams.map((team) => team.id),
      selectedPlayerIds: [...new Set(ownTeams.flatMap((team) => team.playerIds))],
      config: config ?? session.config,
    };
  });

  return {
    sessions,
    teams,
    games: input.rows.games.map(mapDbToGame),
    pointEvents: input.rows.point_events.map(mapDbToPointEvent),
    gameReports: input.rows.game_reports.map(mapDbToGameReport),
    sessionReports: input.rows.session_reports.map(mapDbToSessionReport),
  };
}

export async function fetchMySessions(communities: Community[]): Promise<SessionBundle> {
  const [sessions, teams, games, pointEvents, gameReports, sessionReports] = await Promise.all([
    fetchOnlineRows('sessions'),
    fetchOnlineRows('teams'),
    fetchOnlineRows('games'),
    fetchOnlineRows('point_events'),
    fetchOnlineRows('game_reports'),
    fetchOnlineRows('session_reports'),
  ]);
  const targetIds = sessions
    .filter((row) => row.authority_model === 'target')
    .map((row) => String(row.id));
  const snapshots = await fetchRulesSnapshots(targetIds);
  return assembleSessionBundle({
    rows: {
      sessions,
      teams,
      games,
      point_events: pointEvents,
      game_reports: gameReports,
      session_reports: sessionReports,
    },
    snapshots,
    communities,
  });
}
