import type {
  Community,
  CommunityRules,
  Division,
  FreePlayConfig,
  Game,
  GameReport,
  Player,
  PointEvent,
  Session,
  SessionReport,
  Team,
  TournamentConfig,
} from '../types';
import type { ScheduledTournamentMatch } from '../logic/tournament';
import { formatLocalDateInput } from '../logic/date';
import { calculateAttributeProgression } from '../logic/progression';
import { applySessionRatingToForm } from '../logic/rating';
import { generateSessionReport } from '../logic/reports';

export function buildFreePlayConfigFromCommunityRules(rules: CommunityRules): FreePlayConfig {
  const teamCount = Math.max(3, rules.freePlay?.teamCount ?? 3);
  return {
    type: 'free_play',
    teamCount,
    maxPoints: rules.freePlay?.maxPoints ?? 15,
    tieBreakMethod: rules.freePlay?.tieBreakMethod ?? 'win_by_2',
    hardPointCap: rules.freePlay?.hardPointCap ?? null,
    rotationSystem: rules.freePlay?.rotationSystem ?? 'winner_stays',
    maxConsecutiveGames: rules.freePlay?.maxConsecutiveGames ?? 3,
    initialCourtTeams: ['', ''],
    initialQueue: [],
    queuePolicy: 'fifo',
    balanceMode: rules.freePlay?.balanceMode ?? 'balanced',
    balanceSpeed: rules.freePlay?.balanceSpeed ?? 'advanced',
    balanceConstraints: rules.freePlay?.balanceConstraints,
  };
}

export function buildTournamentConfigFromCommunityRules(rules: CommunityRules): TournamentConfig {
  return {
    type: 'tournament',
    format: rules.tournament?.format ?? 'round_robin',
    teamCount: Math.max(2, rules.tournament?.teamCount ?? 3),
    useGroupStage: rules.tournament?.useGroupStage ?? false,
    groups: rules.tournament?.groups,
    qualifiedPerGroup: rules.tournament?.qualifiedPerGroup,
    roundTrip: rules.tournament?.roundTrip ?? false,
    maxPoints: rules.tournament?.maxPoints ?? 15,
    tieBreakMethod: rules.tournament?.tieBreakMethod ?? 'direct_3',
    victoryRule: rules.tournament?.victoryRule ?? rules.tournament?.tieBreakMethod ?? 'direct_3',
    hardPointCap: rules.tournament?.hardPointCap ?? null,
    hasFinal: rules.tournament?.hasFinal ?? true,
    hasThirdPlaceMatch: rules.tournament?.hasThirdPlaceMatch ?? true,
    classificationPoints: {
      win: rules.tournament?.classificationPoints?.win ?? 3,
      loss: rules.tournament?.classificationPoints?.loss ?? 0,
      walkoverWin: rules.tournament?.classificationPoints?.walkoverWin ?? 3,
      walkoverLoss: rules.tournament?.classificationPoints?.walkoverLoss ?? 0,
    },
    standingsRules: rules.tournament?.standingsRules ?? [
      'classificationPoints',
      'wins',
      'pointDifference',
      'pointsFor',
      'headToHead',
      'pointsAgainst',
    ],
    balanceMode: rules.tournament?.balanceMode ?? 'balanced',
    balanceSpeed: rules.tournament?.balanceSpeed ?? 'advanced',
    balanceConstraints: rules.tournament?.balanceConstraints,
  };
}

export function buildSessionFromCommunity(input: {
  community: Community;
  playerIds: string[];
  rules: CommunityRules;
  now: Date;
  createId: () => string;
}): { session: Session; nextWizardStep: number } {
  const type = input.rules.defaultFormat || input.community.defaultFormat || 'free_play';
  const selectedPlayerIds = Array.from(new Set(input.playerIds)).filter(Boolean);
  const config =
    type === 'tournament'
      ? buildTournamentConfigFromCommunityRules(input.rules)
      : buildFreePlayConfigFromCommunityRules(input.rules);
  const session: Session = {
    id: input.createId(),
    communityId: input.community.id,
    name: `${input.community.name} - ${input.now.toLocaleDateString('pt-BR')}`,
    date: formatLocalDateInput(input.now),
    location: input.rules.defaultLocation || input.community.defaultLocation || null,
    notes: input.rules.notes || null,
    status: 'draft',
    type,
    selectedPlayerIds,
    teamIds: [],
    config,
    createdAt: input.now.toISOString(),
    updatedAt: input.now.toISOString(),
  };
  return {
    session,
    nextWizardStep: selectedPlayerIds.length > 0 ? 2 : 0,
  };
}

export function buildManualSessionDraft(input: {
  type?: Session['type'];
  now: Date;
  createId: () => string;
}): Session {
  const type = input.type;
  const label = type === 'tournament' ? 'Torneio' : 'Sessão';
  const session: Session = {
    id: input.createId(),
    name: `${label} — ${input.now.toLocaleDateString('pt-BR')}`,
    date: formatLocalDateInput(input.now),
    status: 'draft',
    selectedPlayerIds: [],
    teamIds: [],
    createdAt: input.now.toISOString(),
    updatedAt: input.now.toISOString(),
  };

  if (type) session.type = type;

  return session;
}

export function buildManualSessionStartResult(input: {
  type?: Session['type'];
  now: Date;
  createId: () => string;
}): { session: Session; nextWizardStep: number } {
  return {
    session: buildManualSessionDraft(input),
    nextWizardStep: 0,
  };
}

export function buildDraftClearResult(): {
  nextSessionDraft: null;
  nextActiveSession: null;
} {
  return {
    nextSessionDraft: null,
    nextActiveSession: null,
  };
}

export function buildActiveSessionClearResult(activeSession: Session | null): {
  sessionIdToDelete: string;
  nextSessionDraft: null;
  nextActiveSession: null;
} | null {
  if (!activeSession) return null;

  return {
    sessionIdToDelete: activeSession.id,
    nextSessionDraft: null,
    nextActiveSession: null,
  };
}

export function removeOrphanedSessionData(input: {
  sessions: Session[];
  activeSession: Session | null;
  games: Game[];
  pointEvents: PointEvent[];
  teams: Team[];
  gameReports: GameReport[];
  sessionReports: SessionReport[];
}) {
  const validSessionIds = new Set(input.sessions.map((session) => session.id));
  if (input.activeSession) validSessionIds.add(input.activeSession.id);

  const isValid = (id: string | undefined | null) => Boolean(id && validSessionIds.has(id));

  return {
    games: input.games.filter((game) => isValid(game.sessionId)),
    pointEvents: input.pointEvents.filter((point) => isValid(point.sessionId)),
    teams: input.teams.filter((team) => isValid(team.sessionId)),
    gameReports: input.gameReports.filter((report) => isValid(report.sessionId)),
    sessionReports: input.sessionReports.filter((report) => isValid(report.sessionId)),
  };
}

function softDeleteOrRemoveLocalSessionChildren<
  T extends { sessionId: string; cloudId?: string; deletedAt?: string; syncStatus?: string },
>(items: T[], sessionId: string, now: string): T[] {
  return items
    .map((item) => {
      if (item.sessionId !== sessionId) return item;
      if (!item.cloudId) return null;
      return { ...item, deletedAt: now, syncStatus: 'pending' as const };
    })
    .filter((item): item is T => item !== null);
}

export function buildSessionDeletionResult(input: {
  sessionId: string;
  sessions: Session[];
  games: Game[];
  pointEvents: PointEvent[];
  teams: Team[];
  gameReports: GameReport[];
  sessionReports: SessionReport[];
  now: string;
}) {
  return {
    sessions: input.sessions.map((session) =>
      session.id === input.sessionId
        ? { ...session, deletedAt: input.now, syncStatus: 'pending' as const }
        : session,
    ),
    games: softDeleteOrRemoveLocalSessionChildren(input.games, input.sessionId, input.now),
    pointEvents: softDeleteOrRemoveLocalSessionChildren(
      input.pointEvents,
      input.sessionId,
      input.now,
    ),
    teams: softDeleteOrRemoveLocalSessionChildren(input.teams, input.sessionId, input.now),
    gameReports: softDeleteOrRemoveLocalSessionChildren(
      input.gameReports,
      input.sessionId,
      input.now,
    ),
    sessionReports: softDeleteOrRemoveLocalSessionChildren(
      input.sessionReports,
      input.sessionId,
      input.now,
    ),
  };
}

export function selectSessionTeams(teams: Team[], sessionId: string | null | undefined): Team[] {
  if (!sessionId) return [];
  return teams.filter((team) => team.sessionId === sessionId);
}

export function buildFreePlayDivisionConfirmationResult(input: {
  activeSession: Session;
  division: Division;
  sessions: Session[];
  teams: Team[];
  now: string;
}) {
  const teamIds = input.division.teams.map((team) => team.id);
  const finalSession: Session = {
    ...input.activeSession,
    status: 'active',
    teamIds,
    updatedAt: input.now,
    config: {
      ...(input.activeSession.config as FreePlayConfig),
      initialCourtTeams: [teamIds[0], teamIds[1]] as [string, string],
      initialQueue: teamIds.slice(2),
    },
  };

  return {
    finalSession,
    updatedSessions: [
      ...input.sessions.filter((session) => session.id !== finalSession.id),
      finalSession,
    ],
    updatedTeams: [
      ...input.teams.filter((team) => team.sessionId !== finalSession.id),
      ...input.division.teams,
    ],
  };
}

export function buildTournamentDivisionConfirmationResult(input: {
  activeSession: Session;
  division: Division;
  sessions: Session[];
  teams: Team[];
  games: Game[];
  schedule: ScheduledTournamentMatch[];
  now: string;
  createGameId: () => string;
}) {
  const cfg = input.activeSession.config as TournamentConfig;
  const teamIds = input.division.teams.map((team) => team.id);
  let updatedConfig = { ...cfg };

  if (cfg.format === 'groups_knockout' || cfg.format === 'group_stage') {
    const groupATeamIds = input.division.teams
      .filter((_, index) => index % 2 === 0)
      .map((team) => team.id);
    const groupBTeamIds = input.division.teams
      .filter((_, index) => index % 2 === 1)
      .map((team) => team.id);
    updatedConfig = {
      ...cfg,
      groups: [
        { id: 'A', name: 'Grupo A', teamIds: groupATeamIds },
        { id: 'B', name: 'Grupo B', teamIds: groupBTeamIds },
      ],
    };
  }

  const scheduledGames: Game[] = input.schedule.map((match, index) => {
    const isPlayoff = match.stage === 'final' || match.stage === 'third_place';
    const setTargets = isPlayoff ? cfg.playoffSetTargets || [12, 12, 7] : undefined;

    return {
      id: input.createGameId(),
      sessionId: input.activeSession.id,
      type: 'tournament',
      sequenceNumber: index + 1,
      round: match.round,
      stage: match.stage || 'group',
      groupId: match.groupId || null,
      teamAId: match.teamAId,
      teamBId: match.teamBId,
      scoreA: 0,
      scoreB: 0,
      status: 'scheduled',
      pointIds: [],
      startedAt: null,
      sets: isPlayoff ? [] : undefined,
      setTargets,
      metadata: {
        originalTeamAId: match.teamAId,
        originalTeamBId: match.teamBId,
      },
    };
  });

  const finalSession: Session = {
    ...input.activeSession,
    status: 'teams_generated',
    teamIds,
    config: updatedConfig,
    updatedAt: input.now,
  };

  return {
    finalSession,
    scheduledGames,
    updatedSessions: [
      ...input.sessions.filter((session) => session.id !== finalSession.id),
      finalSession,
    ],
    updatedTeams: [
      ...input.teams.filter((team) => team.sessionId !== finalSession.id),
      ...input.division.teams,
    ],
    updatedGames: [
      ...input.games.filter((game) => game.sessionId !== finalSession.id),
      ...scheduledGames,
    ],
  };
}

export function buildFinishedSessionResult(input: {
  activeSession: Session;
  sessions: Session[];
  games: Game[];
  pointEvents: PointEvent[];
  teams: Team[];
  players: Player[];
  sessionReports: SessionReport[];
  finishedAt: string;
}) {
  const sessionPoints = input.pointEvents.filter(
    (point) => point.sessionId === input.activeSession.id,
  );
  const sessionGames = input.games.filter((game) => game.sessionId === input.activeSession.id);
  const sessionTeams = input.teams.filter((team) => team.sessionId === input.activeSession.id);
  const participantIds = new Set(sessionTeams.flatMap((team) => team.playerIds));
  const participants = input.players.filter((player) => participantIds.has(player.id));

  const progressedPlayers = calculateAttributeProgression(
    input.players,
    sessionPoints,
    sessionGames,
    sessionTeams,
  );
  const updatedPlayers = applySessionRatingToForm(
    progressedPlayers,
    sessionGames,
    sessionPoints,
    sessionTeams,
  );

  const finishedSession: Session = {
    ...input.activeSession,
    status: 'finished',
    updatedAt: input.finishedAt,
  };

  const report = generateSessionReport(
    finishedSession,
    sessionGames,
    sessionPoints,
    sessionTeams,
    updatedPlayers,
  );
  const updatedSessions = input.sessions.map((session) =>
    session.id === finishedSession.id ? finishedSession : session,
  );
  const updatedReports = [...input.sessionReports, report];

  return {
    sessionPoints,
    sessionGames,
    sessionTeams,
    participants,
    updatedPlayers,
    finishedSession,
    report,
    updatedSessions,
    updatedReports,
  };
}
