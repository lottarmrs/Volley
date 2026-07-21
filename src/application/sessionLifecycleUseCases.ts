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
import type { BalanceRequest, BalanceResponse } from '../logic/balancerMessages';
import { balanceTeams } from '../logic/balancing';
import type { SessionValidationErrors } from '../domain/sessionSetup';
import {
  addPlayerPairConstraint,
  removePlayerPairConstraint,
  selectPlayablePlayerIds,
  toggleLockedPlayerTeam,
  toggleSessionPlayerSelection,
  validateSessionWizardStep,
} from '../domain/sessionSetup';
import { buildPartnershipMatrix, type PartnershipMatrix } from '../logic/partnershipHistory';
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

export function buildSessionPatchResult(input: {
  activeSession: Session | null;
  patch: Partial<Session>;
  now: string;
}): Session | null {
  if (!input.activeSession) return null;
  return { ...input.activeSession, ...input.patch, updatedAt: input.now };
}

export function buildSessionLastSelectionResult(rawSelection: string | null): {
  patch: Pick<Session, 'selectedPlayerIds'> | null;
  shouldRemoveStoredSelection: boolean;
} {
  if (!rawSelection) return { patch: null, shouldRemoveStoredSelection: false };

  try {
    const selectedPlayerIds = JSON.parse(rawSelection);
    if (
      Array.isArray(selectedPlayerIds) &&
      selectedPlayerIds.every((playerId) => typeof playerId === 'string' && playerId.length > 0)
    ) {
      return { patch: { selectedPlayerIds }, shouldRemoveStoredSelection: false };
    }
    return { patch: null, shouldRemoveStoredSelection: true };
  } catch {
    return { patch: null, shouldRemoveStoredSelection: true };
  }
}

export function buildSessionLastSelectionApplicationResult(input: {
  activeSession: Session | null;
  rawSelection: string | null;
  now: string;
}): {
  nextActiveSession: Session | null;
  shouldRemoveStoredSelection: boolean;
  shouldWarnInvalidSelection: boolean;
  warningMessage: string | null;
  storageRemovals: Array<'lastSelectedPlayerIds'>;
} {
  const selection = buildSessionLastSelectionResult(input.rawSelection);
  const nextActiveSession = selection.patch
    ? buildSessionPatchResult({
        activeSession: input.activeSession,
        patch: selection.patch,
        now: input.now,
      })
    : null;

  return {
    nextActiveSession,
    shouldRemoveStoredSelection: selection.shouldRemoveStoredSelection,
    shouldWarnInvalidSelection: selection.shouldRemoveStoredSelection,
    warningMessage: selection.shouldRemoveStoredSelection
      ? 'Ignoring invalid last player selection from storage'
      : null,
    storageRemovals: selection.shouldRemoveStoredSelection ? ['lastSelectedPlayerIds'] : [],
  };
}

export function buildSessionDraftResumeResult(draft: {
  session: Session;
  wizardStep: number;
  bestDivisions: Division[];
  selectedDivisionIndex: number;
  updatedAt?: string;
}) {
  return {
    nextActiveSession: draft.session,
    nextWizardStep: draft.wizardStep,
    nextBestDivisions: draft.bestDivisions,
    nextSelectedDivisionIndex: draft.selectedDivisionIndex,
    nextPage: 'session-wizard' as const,
  };
}

export function buildSessionDraftPersistenceResult(input: {
  activeSession: Session | null;
  wizardStep: number;
  bestDivisions: Division[];
  selectedDivisionIndex: number;
  now: string;
}): {
  draft: {
    session: Session;
    wizardStep: number;
    bestDivisions: Division[];
    selectedDivisionIndex: number;
    updatedAt: string;
  } | null;
} {
  if (!input.activeSession || input.activeSession.status !== 'draft') {
    return { draft: null };
  }

  return {
    draft: {
      session: input.activeSession,
      wizardStep: input.wizardStep,
      bestDivisions: input.bestDivisions,
      selectedDivisionIndex: input.selectedDivisionIndex,
      updatedAt: input.now,
    },
  };
}

export function buildSessionPartnershipMatrixResult(input: {
  activeSession: Session | null;
  sessions: Session[];
  teams: Team[];
}): {
  partnershipMatrix: PartnershipMatrix | undefined;
} {
  if (!input.activeSession?.communityId) {
    return { partnershipMatrix: undefined };
  }

  const historySessions = input.sessions.filter(
    (session) => session.communityId === input.activeSession?.communityId,
  );
  return {
    partnershipMatrix: buildPartnershipMatrix(historySessions, input.teams),
  };
}

export function buildSessionStepValidationResult(
  activeSession: Session | null,
  wizardStep: number,
): {
  errors: SessionValidationErrors;
  isValid: boolean;
} {
  if (!activeSession) {
    return { errors: {}, isValid: false };
  }

  const errors = validateSessionWizardStep(activeSession, wizardStep);
  return {
    errors,
    isValid: Object.keys(errors).length === 0,
  };
}

export function buildSessionPlayerToggleResult(input: {
  activeSession: Session | null;
  playerId: string;
  validationErrors: SessionValidationErrors;
  now: string;
}): {
  nextActiveSession: Session | null;
  nextValidationErrors: SessionValidationErrors | null;
} {
  const nextActiveSession = buildSessionPatchResult({
    activeSession: input.activeSession,
    patch: {
      selectedPlayerIds: toggleSessionPlayerSelection(
        input.activeSession?.selectedPlayerIds ?? [],
        input.playerId,
      ),
    },
    now: input.now,
  });
  if (!nextActiveSession) {
    return { nextActiveSession: null, nextValidationErrors: null };
  }

  return {
    nextActiveSession,
    nextValidationErrors: input.validationErrors.players
      ? { ...input.validationErrors, players: '' }
      : null,
  };
}

export function buildSessionPlayerBulkSelectionResult(input: {
  activeSession: Session | null;
  players: Player[];
  mode: 'select-playable' | 'clear';
  now: string;
}): {
  nextActiveSession: Session | null;
} {
  const selectedPlayerIds =
    input.mode === 'select-playable' ? selectPlayablePlayerIds(input.players) : [];

  return {
    nextActiveSession: buildSessionPatchResult({
      activeSession: input.activeSession,
      patch: { selectedPlayerIds },
      now: input.now,
    }),
  };
}

export function buildSessionPlayerLockResult(input: {
  activeSession: Session | null;
  playerId: string;
  teamIndex: number;
  now: string;
}): {
  nextActiveSession: Session | null;
} {
  if (!input.activeSession?.config) {
    return { nextActiveSession: null };
  }

  return {
    nextActiveSession: buildSessionPatchResult({
      activeSession: input.activeSession,
      patch: {
        config: toggleLockedPlayerTeam(input.activeSession.config, input.playerId, input.teamIndex),
      },
      now: input.now,
    }),
  };
}

export function buildSessionPlayerPairConstraintResult(input: {
  activeSession: Session | null;
  playerAId: string;
  playerBId: string;
  type: 'together' | 'separated';
  mode: 'add' | 'remove';
  now: string;
}): {
  nextActiveSession: Session | null;
} {
  if (!input.activeSession?.config) {
    return { nextActiveSession: null };
  }

  const nextConfig =
    input.mode === 'add'
      ? addPlayerPairConstraint(
          input.activeSession.config,
          input.playerAId,
          input.playerBId,
          input.type,
        )
      : removePlayerPairConstraint(
          input.activeSession.config,
          input.playerAId,
          input.playerBId,
          input.type,
        );

  return {
    nextActiveSession: buildSessionPatchResult({
      activeSession: input.activeSession,
      patch: { config: nextConfig },
      now: input.now,
    }),
  };
}

export function buildWizardCancelResult(): {
  nextSessionDraft: null;
  nextActiveSession: null;
  nextPage: 'dashboard';
} {
  return {
    nextSessionDraft: null,
    nextActiveSession: null,
    nextPage: 'dashboard',
  };
}

export function buildWizardCancelRequestResult(): {
  confirmationMessage: string;
} {
  return {
    confirmationMessage: 'Deseja cancelar a criação da sessão? O progresso será perdido.',
  };
}

export function buildWizardCancelApplicationResult(
  isConfirmed: boolean,
): (ReturnType<typeof buildWizardCancelResult> & { shouldClearSessionDraft: true }) | null {
  if (!isConfirmed) return null;

  return {
    ...buildWizardCancelResult(),
    shouldClearSessionDraft: true,
  };
}

export type DivisionGenerationPlan = {
  sessionPlayers: Player[];
  updatedConfig: FreePlayConfig | TournamentConfig;
  sessionPatch: Pick<Session, 'config'>;
  request: BalanceRequest;
};

export function buildDivisionGenerationPlan(input: {
  activeSession: Session | null;
  players: Player[];
  seed: number;
  partnershipMatrix?: PartnershipMatrix;
}): DivisionGenerationPlan | null {
  const { activeSession } = input;
  if (!activeSession || !activeSession.config) return null;

  const sessionPlayers = input.players.filter((player) =>
    activeSession.selectedPlayerIds.includes(player.id),
  );
  const updatedConfig = {
    ...activeSession.config,
    balanceSeed: input.seed,
  };

  return {
    sessionPlayers,
    updatedConfig,
    sessionPatch: { config: updatedConfig },
    request: {
      type: 'balance',
      players: sessionPlayers,
      numTeams: updatedConfig.teamCount,
      sessionId: activeSession.id,
      config: updatedConfig,
      partnershipMatrix: input.partnershipMatrix,
    },
  };
}

export function buildDivisionFallbackBalanceInput(plan: DivisionGenerationPlan | null): {
  players: Player[];
  numTeams: number;
  sessionId: string;
  config: FreePlayConfig | TournamentConfig;
  partnershipMatrix?: PartnershipMatrix;
} | null {
  if (!plan) return null;

  return {
    players: plan.request.players,
    numTeams: plan.request.numTeams,
    sessionId: plan.request.sessionId,
    config: plan.request.config,
    partnershipMatrix: plan.request.partnershipMatrix,
  };
}

export function buildDivisionFallbackBalanceResult(plan: DivisionGenerationPlan | null): {
  divisions: Division[];
} | null {
  const input = buildDivisionFallbackBalanceInput(plan);
  if (!input) return null;

  return {
    divisions: balanceTeams(
      input.players,
      input.numTeams,
      input.sessionId,
      input.config,
      undefined,
      input.partnershipMatrix,
    ),
  };
}

export function buildDivisionGenerationResult(input: {
  divisions: Division[];
  advanceStep: boolean;
}): {
  nextBestDivisions: Division[];
  nextSelectedDivisionIndex: number;
  nextIsGenerating: boolean;
  nextProgress: number;
  shouldAdvanceStep: boolean;
} {
  return {
    nextBestDivisions: input.divisions,
    nextSelectedDivisionIndex: 0,
    nextIsGenerating: false,
    nextProgress: 100,
    shouldAdvanceStep: input.advanceStep,
  };
}

export function buildDivisionGenerationCompletionApplicationResult(input: {
  divisions: Division[];
  advanceStep: boolean;
  currentWizardStep: number;
}): Omit<ReturnType<typeof buildDivisionGenerationResult>, 'shouldAdvanceStep'> & {
  nextWizardStep: number | null;
} {
  const result = buildDivisionGenerationResult(input);
  return {
    nextBestDivisions: result.nextBestDivisions,
    nextSelectedDivisionIndex: result.nextSelectedDivisionIndex,
    nextIsGenerating: result.nextIsGenerating,
    nextProgress: result.nextProgress,
    nextWizardStep: result.shouldAdvanceStep ? input.currentWizardStep + 1 : null,
  };
}

export function buildDivisionGenerationStartResult(mode: 'start' | 'cancel'): {
  nextIsGenerating: boolean;
  nextProgress: number;
} {
  return {
    nextIsGenerating: mode === 'start',
    nextProgress: 0,
  };
}

export function buildDivisionGenerationStatusApplicationResult(
  mode: 'start' | 'cancel',
): ReturnType<typeof buildDivisionGenerationStartResult> {
  return buildDivisionGenerationStartResult(mode);
}

export function buildDivisionWorkerStartApplicationResult(plan: DivisionGenerationPlan | null): {
  generationStatus: ReturnType<typeof buildDivisionGenerationStatusApplicationResult>;
  message: BalanceRequest;
} | null {
  if (!plan) return null;

  return {
    generationStatus: buildDivisionGenerationStatusApplicationResult('start'),
    message: plan.request,
  };
}

export function buildDivisionWorkerUnavailableApplicationResult(): {
  generationStatus: ReturnType<typeof buildDivisionGenerationStatusApplicationResult>;
  shouldRunFallback: true;
} {
  return {
    generationStatus: buildDivisionGenerationStatusApplicationResult('start'),
    shouldRunFallback: true,
  };
}

export function buildDivisionWorkerMessageResult(
  message: BalanceResponse,
):
  | { type: 'progress'; percent: number }
  | { type: 'done'; divisions: Division[] }
  | { type: 'fallback'; message: string } {
  if (message.type === 'progress') {
    return { type: 'progress', percent: message.percent };
  }
  if (message.type === 'done') {
    return { type: 'done', divisions: message.divisions };
  }
  return { type: 'fallback', message: message.message };
}

export function buildDivisionWorkerFallbackApplicationResult(input: {
  source: 'worker-message' | 'runtime-error';
  message: string;
}): {
  shouldTerminateWorker: true;
  shouldRunFallback: true;
  logMessage: string;
} {
  return {
    shouldTerminateWorker: true,
    shouldRunFallback: true,
    logMessage:
      input.source === 'worker-message'
        ? `Balancer worker error: ${input.message}`
        : `Balancer worker failed, falling back to sync: ${input.message}`,
  };
}

export function shouldClearDivisionWorkerReference(
  currentWorker: unknown,
  workerToClear: unknown,
): boolean {
  return currentWorker !== null && currentWorker === workerToClear;
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

export function buildDivisionConfirmationCompletionResult(finalSession: Session): {
  selectedPlayerIdsValue: string;
  sessionConfigValue: string;
  storageWrites: Array<{
    target: 'lastSelectedPlayerIds' | 'lastSessionConfig';
    value: string;
  }>;
  shouldClearSessionDraft: boolean;
  shouldAdvanceStep: boolean;
  nextPage: 'session-active' | null;
} {
  const selectedPlayerIdsValue = JSON.stringify(finalSession.selectedPlayerIds);
  const sessionConfigValue = JSON.stringify(finalSession.config);

  return {
    selectedPlayerIdsValue,
    sessionConfigValue,
    storageWrites: [
      { target: 'lastSelectedPlayerIds', value: selectedPlayerIdsValue },
      { target: 'lastSessionConfig', value: sessionConfigValue },
    ],
    shouldClearSessionDraft: true,
    shouldAdvanceStep: finalSession.type === 'tournament',
    nextPage: finalSession.type === 'tournament' ? null : 'session-active',
  };
}

export function buildDivisionConfirmationResult(input: {
  activeSession: Session;
  division: Division;
  sessions: Session[];
  teams: Team[];
  games: Game[];
  now: string;
  createGameId: () => string;
  generateTournamentSchedule: (
    teamIds: string[],
    format: TournamentConfig['format'],
    config: TournamentConfig,
  ) => ScheduledTournamentMatch[];
}): {
  finalSession: Session;
  updatedSessions: Session[];
  updatedTeams: Team[];
  updatedGames: Game[] | null;
} {
  if (input.activeSession.type !== 'tournament') {
    const result = buildFreePlayDivisionConfirmationResult({
      activeSession: input.activeSession,
      division: input.division,
      sessions: input.sessions,
      teams: input.teams,
      now: input.now,
    });
    return { ...result, updatedGames: null };
  }

  const config = input.activeSession.config as TournamentConfig;
  const schedule = input.generateTournamentSchedule(
    input.division.teams.map((team) => team.id),
    config.format,
    config,
  );
  const result = buildTournamentDivisionConfirmationResult({
    activeSession: input.activeSession,
    division: input.division,
    sessions: input.sessions,
    teams: input.teams,
    games: input.games,
    schedule,
    now: input.now,
    createGameId: input.createGameId,
  });

  return result;
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

export function buildTournamentStartResult(input: {
  activeSession: Session;
  sessions: Session[];
  games: Game[];
  now: string;
}) {
  const startedSession: Session = {
    ...input.activeSession,
    status: 'active',
    updatedAt: input.now,
  };

  const sessionGames = input.games
    .filter((game) => game.sessionId === input.activeSession.id)
    .sort((a, b) => (a.sequenceNumber || 0) - (b.sequenceNumber || 0));
  const firstScheduled = sessionGames.find((game) => game.status === 'scheduled');

  return {
    startedSession,
    updatedSessions: input.sessions.map((session) =>
      session.id === startedSession.id ? startedSession : session,
    ),
    updatedGames: input.games.map((game) =>
      game.id === firstScheduled?.id
        ? { ...game, status: 'active' as const, startedAt: input.now }
        : game,
    ),
  };
}

export function buildGeneratedTournamentStartApplicationResult(input: {
  activeSession: Session | null;
  sessions: Session[];
  games: Game[];
  now: string;
}): (ReturnType<typeof buildTournamentStartResult> & { nextPage: 'session-active' }) | null {
  if (!input.activeSession || input.activeSession.type !== 'tournament') return null;

  return {
    ...buildTournamentStartResult({
      activeSession: input.activeSession,
      sessions: input.sessions,
      games: input.games,
      now: input.now,
    }),
    nextPage: 'session-active',
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
