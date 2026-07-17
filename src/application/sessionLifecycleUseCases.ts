import type {
  Community,
  CommunityRules,
  FreePlayConfig,
  Game,
  Player,
  PointEvent,
  Session,
  SessionReport,
  Team,
  TournamentConfig,
} from '../types';
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

export function selectSessionTeams(teams: Team[], sessionId: string | null | undefined): Team[] {
  if (!sessionId) return [];
  return teams.filter((team) => team.sessionId === sessionId);
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
