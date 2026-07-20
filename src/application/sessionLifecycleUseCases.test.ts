import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildActiveSessionClearResult,
  buildDivisionConfirmationResult,
  buildDivisionConfirmationCompletionResult,
  buildDivisionFallbackBalanceInput,
  buildDivisionGenerationPlan,
  buildDivisionGenerationResult,
  buildDivisionGenerationStartResult,
  buildDivisionWorkerMessageResult,
  buildDraftClearResult,
  buildFinishedSessionResult,
  buildFreePlayDivisionConfirmationResult,
  buildFreePlayConfigFromCommunityRules,
  buildManualSessionDraft,
  buildManualSessionStartResult,
  buildSessionDeletionResult,
  buildSessionLastSelectionApplicationResult,
  buildSessionDraftResumeResult,
  buildSessionDraftPersistenceResult,
  buildSessionFromCommunity,
  buildSessionLastSelectionResult,
  buildSessionPatchResult,
  buildSessionPlayerToggleResult,
  buildSessionStepValidationResult,
  buildTournamentStartResult,
  buildTournamentDivisionConfirmationResult,
  buildWizardCancelResult,
  removeOrphanedSessionData,
  buildTournamentConfigFromCommunityRules,
  selectSessionTeams,
  shouldClearDivisionWorkerReference,
} from './sessionLifecycleUseCases';
import type {
  Community,
  CommunityRules,
  GameReport,
  PointEvent,
  SessionReport,
  TournamentConfig,
} from '../types';
import { makeGame, makePlayer, makeSession, makeTeam } from '../test/fixtures';

const community = {
  id: 'community-1',
  name: 'Domingo',
  defaultFormat: 'free_play',
  defaultLocation: 'Quadra A',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
} as Community;

test('buildFreePlayConfigFromCommunityRules applies scalable defaults', () => {
  const config = buildFreePlayConfigFromCommunityRules({
    communityId: 'community-1',
    defaultFormat: 'free_play',
    updatedAt: '2026-01-01T00:00:00.000Z',
    freePlay: { teamCount: 2, maxPoints: 21, balanceSpeed: 'fast' },
  } as CommunityRules);

  assert.equal(config.type, 'free_play');
  assert.equal(config.teamCount, 3);
  assert.equal(config.maxPoints, 21);
  assert.equal(config.balanceSpeed, 'fast');
  assert.deepEqual(config.initialCourtTeams, ['', '']);
});

test('buildTournamentConfigFromCommunityRules applies tournament defaults', () => {
  const config = buildTournamentConfigFromCommunityRules({
    communityId: 'community-1',
    defaultFormat: 'tournament',
    updatedAt: '2026-01-01T00:00:00.000Z',
    tournament: { teamCount: 1, maxPoints: 12, hasFinal: false },
  } as CommunityRules);

  assert.equal(config.type, 'tournament');
  assert.equal(config.teamCount, 2);
  assert.equal(config.maxPoints, 12);
  assert.equal(config.hasFinal, false);
  assert.deepEqual(config.standingsRules, [
    'classificationPoints',
    'wins',
    'pointDifference',
    'pointsFor',
    'headToHead',
    'pointsAgainst',
  ]);
});

test('buildSessionFromCommunity creates a draft session and next wizard step', () => {
  const result = buildSessionFromCommunity({
    community,
    playerIds: ['p1', '', 'p1', 'p2'],
    rules: {
      communityId: 'community-1',
      defaultFormat: 'free_play',
      defaultLocation: 'Quadra B',
      notes: 'Levar bola',
      updatedAt: '2026-01-01T00:00:00.000Z',
    } as CommunityRules,
    now: new Date('2026-07-13T12:00:00.000Z'),
    createId: () => 'session-1',
  });

  assert.equal(result.nextWizardStep, 2);
  assert.equal(result.session.id, 'session-1');
  assert.equal(result.session.name, 'Domingo - 13/07/2026');
  assert.equal(result.session.date, '2026-07-13');
  assert.equal(result.session.location, 'Quadra B');
  assert.equal(result.session.notes, 'Levar bola');
  assert.deepEqual(result.session.selectedPlayerIds, ['p1', 'p2']);
});

test('buildSessionFromCommunity starts at details step when no players are selected', () => {
  const result = buildSessionFromCommunity({
    community,
    playerIds: [],
    rules: {
      communityId: 'community-1',
      defaultFormat: 'tournament',
      updatedAt: '2026-01-01T00:00:00.000Z',
    } as CommunityRules,
    now: new Date('2026-07-13T12:00:00.000Z'),
    createId: () => 'session-2',
  });

  assert.equal(result.nextWizardStep, 0);
  assert.equal(result.session.type, 'tournament');
  assert.equal(result.session.config?.type, 'tournament');
});

test('buildManualSessionDraft creates a default free-play draft', () => {
  const session = buildManualSessionDraft({
    now: new Date('2026-07-14T12:00:00.000Z'),
    createId: () => 'session-1',
  });

  assert.equal(session.id, 'session-1');
  assert.equal(session.name, 'Sessão — 14/07/2026');
  assert.equal(session.date, '2026-07-14');
  assert.equal(session.status, 'draft');
  assert.deepEqual(session.selectedPlayerIds, []);
  assert.deepEqual(session.teamIds, []);
  assert.equal(session.type, undefined);
  assert.equal(session.createdAt, '2026-07-14T12:00:00.000Z');
  assert.equal(session.updatedAt, '2026-07-14T12:00:00.000Z');
});

test('buildManualSessionDraft creates a tournament draft', () => {
  const session = buildManualSessionDraft({
    type: 'tournament',
    now: new Date('2026-07-14T12:00:00.000Z'),
    createId: () => 'session-2',
  });

  assert.equal(session.id, 'session-2');
  assert.equal(session.name, 'Torneio — 14/07/2026');
  assert.equal(session.type, 'tournament');
});

test('buildManualSessionStartResult creates a draft and resets the wizard', () => {
  const result = buildManualSessionStartResult({
    type: 'tournament',
    now: new Date('2026-07-14T12:00:00.000Z'),
    createId: () => 'session-3',
  });

  assert.equal(result.nextWizardStep, 0);
  assert.equal(result.session.id, 'session-3');
  assert.equal(result.session.type, 'tournament');
});

test('buildDraftClearResult clears draft and active session state', () => {
  const result = buildDraftClearResult();

  assert.equal(result.nextSessionDraft, null);
  assert.equal(result.nextActiveSession, null);
});

test('buildActiveSessionClearResult returns session id to delete and clears resume state', () => {
  const activeSession = makeSession('session-active', { status: 'active' });
  const result = buildActiveSessionClearResult(activeSession);

  assert.equal(result?.sessionIdToDelete, 'session-active');
  assert.equal(result?.nextSessionDraft, null);
  assert.equal(result?.nextActiveSession, null);
});

test('buildActiveSessionClearResult does nothing without an active session', () => {
  const result = buildActiveSessionClearResult(null);

  assert.equal(result, null);
});

test('buildSessionPatchResult applies patch and refreshes updatedAt', () => {
  const activeSession = makeSession('session-1', {
    name: 'Treino antigo',
    selectedPlayerIds: ['player-1'],
    updatedAt: '2026-01-01T12:00:00.000Z',
  });

  const result = buildSessionPatchResult({
    activeSession,
    patch: {
      name: 'Treino novo',
      selectedPlayerIds: ['player-1', 'player-2'],
    },
    now: '2026-07-20T13:00:00.000Z',
  });

  assert.equal(result?.name, 'Treino novo');
  assert.deepEqual(result?.selectedPlayerIds, ['player-1', 'player-2']);
  assert.equal(result?.updatedAt, '2026-07-20T13:00:00.000Z');
  assert.equal(result?.id, 'session-1');
});

test('buildSessionLastSelectionResult parses saved player selection', () => {
  const result = buildSessionLastSelectionResult('["player-1","player-2"]');

  assert.deepEqual(result.patch, { selectedPlayerIds: ['player-1', 'player-2'] });
  assert.equal(result.shouldRemoveStoredSelection, false);
});

test('buildSessionLastSelectionResult requests cleanup for invalid saved selection', () => {
  const result = buildSessionLastSelectionResult('{invalid-json');

  assert.equal(result.patch, null);
  assert.equal(result.shouldRemoveStoredSelection, true);
});

test('buildSessionLastSelectionResult rejects non-string player ids from storage', () => {
  const result = buildSessionLastSelectionResult('["player-1",42,{}]');

  assert.equal(result.patch, null);
  assert.equal(result.shouldRemoveStoredSelection, true);
});

test('buildSessionLastSelectionApplicationResult applies valid selection and flags invalid storage', () => {
  const activeSession = makeSession('session-1', {
    selectedPlayerIds: ['old-player'],
    updatedAt: '2026-07-20T10:00:00.000Z',
  });

  const validResult = buildSessionLastSelectionApplicationResult({
    activeSession,
    rawSelection: '["player-1","player-2"]',
    now: '2026-07-20T13:00:00.000Z',
  });

  assert.deepEqual(validResult.nextActiveSession?.selectedPlayerIds, ['player-1', 'player-2']);
  assert.equal(validResult.nextActiveSession?.updatedAt, '2026-07-20T13:00:00.000Z');
  assert.equal(validResult.shouldRemoveStoredSelection, false);
  assert.equal(validResult.shouldWarnInvalidSelection, false);

  const invalidResult = buildSessionLastSelectionApplicationResult({
    activeSession,
    rawSelection: '["player-1",42]',
    now: '2026-07-20T13:00:00.000Z',
  });

  assert.equal(invalidResult.nextActiveSession, null);
  assert.equal(invalidResult.shouldRemoveStoredSelection, true);
  assert.equal(invalidResult.shouldWarnInvalidSelection, true);
});

test('buildSessionDraftResumeResult restores wizard state from draft', () => {
  const session = makeSession('session-1', { status: 'draft' });
  const division = {
    teams: [makeTeam('team-a', 'session-1', []), makeTeam('team-b', 'session-1', [])],
    penalty: 0,
    score: 100,
  };

  const result = buildSessionDraftResumeResult({
    session,
    wizardStep: 2,
    bestDivisions: [division],
    selectedDivisionIndex: 0,
    updatedAt: '2026-07-20T13:00:00.000Z',
  });

  assert.equal(result.nextActiveSession.id, 'session-1');
  assert.equal(result.nextWizardStep, 2);
  assert.deepEqual(result.nextBestDivisions, [division]);
  assert.equal(result.nextSelectedDivisionIndex, 0);
  assert.equal(result.nextPage, 'session-wizard');
});

test('buildSessionDraftPersistenceResult saves only draft sessions with wizard state', () => {
  const draftSession = makeSession('session-draft', { status: 'draft' });
  const activeSession = makeSession('session-active', { status: 'active' });
  const divisions = [
    {
      teams: [makeTeam('team-a', 'session-draft', [])],
      penalty: 0,
      score: 100,
    },
  ];

  assert.deepEqual(
    buildSessionDraftPersistenceResult({
      activeSession: draftSession,
      wizardStep: 2,
      bestDivisions: divisions,
      selectedDivisionIndex: 0,
      now: '2026-07-20T12:00:00.000Z',
    }),
    {
      draft: {
        session: draftSession,
        wizardStep: 2,
        bestDivisions: divisions,
        selectedDivisionIndex: 0,
        updatedAt: '2026-07-20T12:00:00.000Z',
      },
    },
  );
  assert.deepEqual(
    buildSessionDraftPersistenceResult({
      activeSession,
      wizardStep: 2,
      bestDivisions: divisions,
      selectedDivisionIndex: 0,
      now: '2026-07-20T12:00:00.000Z',
    }),
    { draft: null },
  );
  assert.deepEqual(
    buildSessionDraftPersistenceResult({
      activeSession: null,
      wizardStep: 2,
      bestDivisions: divisions,
      selectedDivisionIndex: 0,
      now: '2026-07-20T12:00:00.000Z',
    }),
    { draft: null },
  );
});

test('buildSessionStepValidationResult clears errors without session and validates active step', () => {
  const session = makeSession('session-1', {
    name: '',
    date: '',
    selectedPlayerIds: [],
  });

  assert.deepEqual(buildSessionStepValidationResult(null, 0), {
    errors: {},
    isValid: false,
  });

  const result = buildSessionStepValidationResult(session, 0);

  assert.equal(result.isValid, false);
  assert.equal(result.errors.name, 'O nome da sessão é obrigatório.');
  assert.equal(result.errors.date, 'A data é obrigatória.');
});

test('buildSessionPlayerToggleResult toggles players and clears player validation error', () => {
  const activeSession = makeSession('session-1', {
    selectedPlayerIds: ['player-1'],
    updatedAt: '2026-07-20T10:00:00.000Z',
  });

  const result = buildSessionPlayerToggleResult({
    activeSession,
    playerId: 'player-2',
    validationErrors: {
      players: 'Selecione pelo menos 4 atletas.',
      name: 'O nome da sessão é obrigatório.',
    },
    now: '2026-07-20T13:00:00.000Z',
  });

  assert.deepEqual(result.nextActiveSession?.selectedPlayerIds, ['player-1', 'player-2']);
  assert.equal(result.nextActiveSession?.updatedAt, '2026-07-20T13:00:00.000Z');
  assert.deepEqual(result.nextValidationErrors, {
    players: '',
    name: 'O nome da sessão é obrigatório.',
  });

  assert.deepEqual(
    buildSessionPlayerToggleResult({
      activeSession: null,
      playerId: 'player-2',
      validationErrors: { players: 'Erro' },
      now: '2026-07-20T13:00:00.000Z',
    }),
    {
      nextActiveSession: null,
      nextValidationErrors: null,
    },
  );
});

test('buildWizardCancelResult clears draft state and returns to dashboard', () => {
  const result = buildWizardCancelResult();

  assert.equal(result.nextSessionDraft, null);
  assert.equal(result.nextActiveSession, null);
  assert.equal(result.nextPage, 'dashboard');
});

test('buildDivisionGenerationPlan prepares selected players and seeded balance request', () => {
  const activeSession = makeSession('session-1', {
    selectedPlayerIds: ['player-1', 'player-3'],
    config: { ...makeSession('config-source').config!, teamCount: 2 },
  });
  const players = [makePlayer('player-1'), makePlayer('player-2'), makePlayer('player-3')];

  const result = buildDivisionGenerationPlan({
    activeSession,
    players,
    seed: 12345,
    partnershipMatrix: { 'player-1|player-3': 2 },
  });

  assert.deepEqual(
    result?.sessionPlayers.map((player) => player.id),
    ['player-1', 'player-3'],
  );
  assert.equal(result?.updatedConfig.balanceSeed, 12345);
  assert.deepEqual(result?.sessionPatch, { config: result?.updatedConfig });
  assert.deepEqual(result?.request, {
    type: 'balance',
    players: result.sessionPlayers,
    numTeams: 2,
    sessionId: 'session-1',
    config: result.updatedConfig,
    partnershipMatrix: { 'player-1|player-3': 2 },
  });
});

test('buildDivisionGenerationResult stores generated divisions and resets generation state', () => {
  const divisions = [
    {
      teams: [makeTeam('team-a', 'session-1', []), makeTeam('team-b', 'session-1', [])],
      penalty: 0,
      score: 100,
    },
  ];

  const result = buildDivisionGenerationResult({ divisions, advanceStep: true });

  assert.deepEqual(result.nextBestDivisions, divisions);
  assert.equal(result.nextSelectedDivisionIndex, 0);
  assert.equal(result.nextIsGenerating, false);
  assert.equal(result.nextProgress, 100);
  assert.equal(result.shouldAdvanceStep, true);
});

test('buildDivisionGenerationStartResult resets progress for start and cancel states', () => {
  assert.deepEqual(buildDivisionGenerationStartResult('start'), {
    nextIsGenerating: true,
    nextProgress: 0,
  });
  assert.deepEqual(buildDivisionGenerationStartResult('cancel'), {
    nextIsGenerating: false,
    nextProgress: 0,
  });
});

test('buildDivisionFallbackBalanceInput reuses the generation request for sync balancing', () => {
  const activeSession = makeSession('session-1', {
    selectedPlayerIds: ['player-1', 'player-2'],
    config: { ...makeSession('config-source').config!, teamCount: 2 },
  });
  const plan = buildDivisionGenerationPlan({
    activeSession,
    players: [makePlayer('player-1'), makePlayer('player-2')],
    seed: 777,
    partnershipMatrix: { 'player-1|player-2': 1 },
  });

  const result = buildDivisionFallbackBalanceInput(plan);

  assert.deepEqual(result, {
    players: plan?.request.players,
    numTeams: 2,
    sessionId: 'session-1',
    config: plan?.request.config,
    partnershipMatrix: { 'player-1|player-2': 1 },
  });
});

test('buildDivisionWorkerMessageResult maps balancer messages to wizard actions', () => {
  const divisions = [
    {
      teams: [makeTeam('team-a', 'session-1', []), makeTeam('team-b', 'session-1', [])],
      penalty: 0,
      score: 100,
    },
  ];

  assert.deepEqual(
    buildDivisionWorkerMessageResult({ type: 'progress', percent: 45, bestScore: 88 }),
    {
      type: 'progress',
      percent: 45,
    },
  );
  assert.deepEqual(buildDivisionWorkerMessageResult({ type: 'done', divisions }), {
    type: 'done',
    divisions,
  });
  assert.deepEqual(buildDivisionWorkerMessageResult({ type: 'error', message: 'boom' }), {
    type: 'fallback',
    message: 'boom',
  });
});

test('shouldClearDivisionWorkerReference clears only the current worker', () => {
  const currentWorker = {};
  const staleWorker = {};

  assert.equal(shouldClearDivisionWorkerReference(currentWorker, currentWorker), true);
  assert.equal(shouldClearDivisionWorkerReference(currentWorker, staleWorker), false);
  assert.equal(shouldClearDivisionWorkerReference(null, staleWorker), false);
});

test('removeOrphanedSessionData keeps records from existing and active sessions only', () => {
  const result = removeOrphanedSessionData({
    sessions: [makeSession('session-1')],
    activeSession: makeSession('active-session'),
    games: [
      makeGame('game-1', 'session-1'),
      makeGame('game-active', 'active-session'),
      makeGame('game-orphan', 'orphan-session'),
    ],
    pointEvents: [
      { id: 'point-1', sessionId: 'session-1' },
      { id: 'point-orphan', sessionId: 'orphan-session' },
    ] as PointEvent[],
    teams: [makeTeam('team-1', 'session-1', []), makeTeam('team-orphan', 'orphan-session', [])],
    gameReports: [
      { id: 'report-1', sessionId: 'active-session' },
      { id: 'report-orphan', sessionId: 'orphan-session' },
    ] as GameReport[],
    sessionReports: [
      { id: 'session-report-1', sessionId: 'session-1' },
      { id: 'session-report-orphan', sessionId: 'orphan-session' },
    ] as SessionReport[],
  });

  assert.deepEqual(
    result.games.map((game) => game.id),
    ['game-1', 'game-active'],
  );
  assert.deepEqual(
    result.pointEvents.map((point) => point.id),
    ['point-1'],
  );
  assert.deepEqual(
    result.teams.map((team) => team.id),
    ['team-1'],
  );
  assert.deepEqual(
    result.gameReports.map((report) => report.id),
    ['report-1'],
  );
  assert.deepEqual(
    result.sessionReports.map((report) => report.id),
    ['session-report-1'],
  );
});

test('buildSessionDeletionResult soft-deletes cloud children and removes local children', () => {
  const result = buildSessionDeletionResult({
    sessionId: 'session-1',
    sessions: [makeSession('session-1'), makeSession('session-2')],
    games: [
      makeGame('cloud-game', 'session-1', { cloudId: 'cloud-game-id' }),
      makeGame('local-game', 'session-1'),
      makeGame('other-game', 'session-2'),
    ],
    pointEvents: [
      { id: 'cloud-point', sessionId: 'session-1', cloudId: 'cloud-point-id' },
      { id: 'local-point', sessionId: 'session-1' },
      { id: 'other-point', sessionId: 'session-2' },
    ] as PointEvent[],
    teams: [
      makeTeam('cloud-team', 'session-1', [], { cloudId: 'cloud-team-id' }),
      makeTeam('local-team', 'session-1', []),
      makeTeam('other-team', 'session-2', []),
    ],
    gameReports: [
      { id: 'cloud-report', sessionId: 'session-1', cloudId: 'cloud-report-id' },
      { id: 'local-report', sessionId: 'session-1' },
      { id: 'other-report', sessionId: 'session-2' },
    ] as GameReport[],
    sessionReports: [
      { id: 'cloud-session-report', sessionId: 'session-1', cloudId: 'cloud-session-report-id' },
      { id: 'local-session-report', sessionId: 'session-1' },
      { id: 'other-session-report', sessionId: 'session-2' },
    ] as SessionReport[],
    now: '2026-07-20T12:00:00.000Z',
  });

  assert.equal(result.sessions[0].deletedAt, '2026-07-20T12:00:00.000Z');
  assert.equal(result.sessions[0].syncStatus, 'pending');
  assert.deepEqual(
    result.games.map((game) => game.id),
    ['cloud-game', 'other-game'],
  );
  assert.equal(result.games[0].deletedAt, '2026-07-20T12:00:00.000Z');
  assert.equal(result.games[0].syncStatus, 'pending');
  assert.deepEqual(
    result.pointEvents.map((point) => point.id),
    ['cloud-point', 'other-point'],
  );
  assert.deepEqual(
    result.teams.map((team) => team.id),
    ['cloud-team', 'other-team'],
  );
  assert.deepEqual(
    result.gameReports.map((report) => report.id),
    ['cloud-report', 'other-report'],
  );
  assert.deepEqual(
    result.sessionReports.map((report) => report.id),
    ['cloud-session-report', 'other-session-report'],
  );
});

test('selectSessionTeams returns only teams from the active session', () => {
  const teams = [
    makeTeam('team-1', 'session-1', []),
    makeTeam('team-2', 'session-2', []),
    makeTeam('team-3', 'session-1', []),
  ];

  assert.deepEqual(
    selectSessionTeams(teams, 'session-1').map((team) => team.id),
    ['team-1', 'team-3'],
  );
  assert.deepEqual(selectSessionTeams(teams, null), []);
});

test('buildFreePlayDivisionConfirmationResult activates session and stores generated teams', () => {
  const activeSession = makeSession('session-1', {
    status: 'draft',
    selectedPlayerIds: ['player-1', 'player-2'],
    teamIds: [],
  });
  const otherSession = makeSession('session-2', { status: 'draft' });
  const teams = [makeTeam('old-team', 'session-1', []), makeTeam('other-team', 'session-2', [])];
  const division = {
    teams: [
      makeTeam('team-a', 'session-1', ['player-1']),
      makeTeam('team-b', 'session-1', ['player-2']),
      makeTeam('team-c', 'session-1', []),
    ],
    penalty: 0,
    score: 100,
  };

  const result = buildFreePlayDivisionConfirmationResult({
    activeSession,
    division,
    sessions: [otherSession, activeSession],
    teams,
    now: '2026-07-20T12:00:00.000Z',
  });

  assert.equal(result.finalSession.status, 'active');
  assert.deepEqual(result.finalSession.teamIds, ['team-a', 'team-b', 'team-c']);
  assert.deepEqual(
    (result.finalSession.config as { initialCourtTeams: [string, string] }).initialCourtTeams,
    ['team-a', 'team-b'],
  );
  assert.deepEqual((result.finalSession.config as { initialQueue: string[] }).initialQueue, [
    'team-c',
  ]);
  assert.deepEqual(
    result.updatedSessions.map((session) => [session.id, session.status]),
    [
      ['session-2', 'draft'],
      ['session-1', 'active'],
    ],
  );
  assert.deepEqual(
    result.updatedTeams.map((team) => team.id),
    ['other-team', 'team-a', 'team-b', 'team-c'],
  );
});

test('buildDivisionConfirmationCompletionResult persists selection and routes by session type', () => {
  const freePlaySession = makeSession('free-play-session', {
    type: 'free_play',
    selectedPlayerIds: ['player-1', 'player-2'],
    config: { ...makeSession('config-source').config!, teamCount: 2 },
  });
  const tournamentSession = makeSession('tournament-session', {
    type: 'tournament',
    selectedPlayerIds: ['player-3'],
    config: {
      type: 'tournament',
      format: 'round_robin',
      teamCount: 2,
      maxPoints: 15,
      tieBreakMethod: 'direct_3',
      victoryRule: 'direct_3',
      hardPointCap: null,
      hasFinal: true,
      hasThirdPlaceMatch: true,
      classificationPoints: { win: 3, loss: 0, walkoverWin: 3, walkoverLoss: 0 },
      standingsRules: ['classificationPoints'],
    } as TournamentConfig,
  });

  assert.deepEqual(buildDivisionConfirmationCompletionResult(freePlaySession), {
    selectedPlayerIdsValue: JSON.stringify(['player-1', 'player-2']),
    sessionConfigValue: JSON.stringify(freePlaySession.config),
    shouldClearSessionDraft: true,
    shouldAdvanceStep: false,
    nextPage: 'session-active',
  });
  assert.deepEqual(buildDivisionConfirmationCompletionResult(tournamentSession), {
    selectedPlayerIdsValue: JSON.stringify(['player-3']),
    sessionConfigValue: JSON.stringify(tournamentSession.config),
    shouldClearSessionDraft: true,
    shouldAdvanceStep: true,
    nextPage: null,
  });
});

test('buildDivisionConfirmationResult confirms free play directly and delegates tournament scheduling', () => {
  const now = '2026-07-20T12:00:00.000Z';
  const freePlaySession = makeSession('free-play-session', {
    type: 'free_play',
    status: 'draft',
    config: { ...makeSession('config-source').config!, teamCount: 2 },
  });
  const freePlayDivision = {
    teams: [
      makeTeam('free-team-a', 'free-play-session', []),
      makeTeam('free-team-b', 'free-play-session', []),
    ],
    penalty: 0,
    score: 100,
  };
  const freePlayResult = buildDivisionConfirmationResult({
    activeSession: freePlaySession,
    division: freePlayDivision,
    sessions: [freePlaySession],
    teams: [],
    games: [makeGame('existing-game', 'other-session')],
    now,
    createGameId: () => 'unused-game',
    generateTournamentSchedule: () => {
      throw new Error('free play should not schedule tournament games');
    },
  });

  assert.equal(freePlayResult.finalSession.status, 'active');
  assert.equal(freePlayResult.updatedGames, null);

  const tournamentConfig: TournamentConfig = {
    type: 'tournament',
    format: 'round_robin',
    teamCount: 2,
    useGroupStage: false,
    roundTrip: false,
    maxPoints: 15,
    tieBreakMethod: 'direct_3',
    victoryRule: 'direct_3',
    hardPointCap: null,
    hasFinal: true,
    hasThirdPlaceMatch: false,
    classificationPoints: { win: 3, loss: 0, walkoverWin: 3, walkoverLoss: 0 },
    standingsRules: ['classificationPoints'],
  };
  const tournamentSession = makeSession('tournament-session', {
    type: 'tournament',
    status: 'draft',
    config: tournamentConfig,
  });
  const tournamentDivision = {
    teams: [
      makeTeam('tournament-team-a', 'tournament-session', []),
      makeTeam('tournament-team-b', 'tournament-session', []),
    ],
    penalty: 0,
    score: 100,
  };
  const scheduleCalls: unknown[] = [];
  const tournamentResult = buildDivisionConfirmationResult({
    activeSession: tournamentSession,
    division: tournamentDivision,
    sessions: [tournamentSession],
    teams: [],
    games: [],
    now,
    createGameId: () => 'scheduled-game',
    generateTournamentSchedule: (teamIds, format, config) => {
      scheduleCalls.push([teamIds, format, config]);
      return [{ round: 1, teamAId: 'tournament-team-a', teamBId: 'tournament-team-b' }];
    },
  });

  assert.deepEqual(scheduleCalls, [
    [['tournament-team-a', 'tournament-team-b'], 'round_robin', tournamentConfig],
  ]);
  assert.equal(tournamentResult.finalSession.status, 'teams_generated');
  assert.deepEqual(
    tournamentResult.updatedGames?.map((game) => [game.id, game.type, game.status]),
    [['scheduled-game', 'tournament', 'scheduled']],
  );
});

test('buildTournamentDivisionConfirmationResult schedules games and stores generated teams', () => {
  const config: TournamentConfig = {
    type: 'tournament',
    format: 'groups_knockout',
    teamCount: 4,
    useGroupStage: true,
    roundTrip: false,
    maxPoints: 15,
    tieBreakMethod: 'direct_3',
    victoryRule: 'direct_3',
    hardPointCap: null,
    hasFinal: true,
    hasThirdPlaceMatch: true,
    playoffSetTargets: [12, 12, 7],
    classificationPoints: {
      win: 3,
      loss: 0,
      walkoverWin: 3,
      walkoverLoss: 0,
    },
    standingsRules: ['classificationPoints', 'wins'],
  };
  const activeSession = makeSession('session-1', {
    status: 'draft',
    type: 'tournament',
    teamIds: [],
    config,
  });
  const otherSession = makeSession('session-2', { status: 'draft' });
  const teams = [makeTeam('old-team', 'session-1', []), makeTeam('other-team', 'session-2', [])];
  const games = [makeGame('old-game', 'session-1'), makeGame('other-game', 'session-2')];
  const division = {
    teams: [
      makeTeam('team-a', 'session-1', []),
      makeTeam('team-b', 'session-1', []),
      makeTeam('team-c', 'session-1', []),
      makeTeam('team-d', 'session-1', []),
    ],
    penalty: 0,
    score: 100,
  };

  const result = buildTournamentDivisionConfirmationResult({
    activeSession,
    division,
    sessions: [otherSession, activeSession],
    teams,
    games,
    schedule: [
      { round: 1, stage: 'group', groupId: 'A', teamAId: 'team-a', teamBId: 'team-c' },
      { round: 2, stage: 'final', teamAId: 'team-a', teamBId: 'team-b' },
    ],
    now: '2026-07-20T12:00:00.000Z',
    createGameId: () => 'new-game',
  });

  assert.equal(result.finalSession.status, 'teams_generated');
  assert.deepEqual(result.finalSession.teamIds, ['team-a', 'team-b', 'team-c', 'team-d']);
  assert.deepEqual((result.finalSession.config as TournamentConfig).groups, [
    { id: 'A', name: 'Grupo A', teamIds: ['team-a', 'team-c'] },
    { id: 'B', name: 'Grupo B', teamIds: ['team-b', 'team-d'] },
  ]);
  assert.deepEqual(
    result.updatedSessions.map((session) => [session.id, session.status]),
    [
      ['session-2', 'draft'],
      ['session-1', 'teams_generated'],
    ],
  );
  assert.deepEqual(
    result.updatedTeams.map((team) => team.id),
    ['other-team', 'team-a', 'team-b', 'team-c', 'team-d'],
  );
  assert.deepEqual(
    result.updatedGames.map((game) => [game.id, game.sessionId, game.stage, game.status]),
    [
      ['other-game', 'session-2', undefined, 'active'],
      ['new-game', 'session-1', 'group', 'scheduled'],
      ['new-game', 'session-1', 'final', 'scheduled'],
    ],
  );
  assert.deepEqual(result.updatedGames[2].setTargets, [12, 12, 7]);
  assert.deepEqual(result.updatedGames[2].metadata, {
    originalTeamAId: 'team-a',
    originalTeamBId: 'team-b',
  });
});

test('buildTournamentStartResult activates tournament and starts first scheduled game', () => {
  const activeSession = makeSession('session-1', {
    status: 'teams_generated',
    type: 'tournament',
  });
  const otherSession = makeSession('session-2', { status: 'draft' });
  const games = [
    makeGame('other-game', 'session-2', { status: 'scheduled', sequenceNumber: 1 }),
    makeGame('later-game', 'session-1', { status: 'scheduled', sequenceNumber: 2 }),
    makeGame('first-game', 'session-1', { status: 'scheduled', sequenceNumber: 1 }),
  ];

  const result = buildTournamentStartResult({
    activeSession,
    sessions: [otherSession, activeSession],
    games,
    now: '2026-07-20T12:30:00.000Z',
  });

  assert.equal(result.startedSession.status, 'active');
  assert.equal(result.startedSession.updatedAt, '2026-07-20T12:30:00.000Z');
  assert.deepEqual(
    result.updatedSessions.map((session) => [session.id, session.status]),
    [
      ['session-2', 'draft'],
      ['session-1', 'active'],
    ],
  );
  assert.deepEqual(
    result.updatedGames.map((game) => [game.id, game.status, game.startedAt]),
    [
      ['other-game', 'scheduled', '2026-01-01T12:00:00.000Z'],
      ['later-game', 'scheduled', '2026-01-01T12:00:00.000Z'],
      ['first-game', 'active', '2026-07-20T12:30:00.000Z'],
    ],
  );
});

test('buildFinishedSessionResult marks active session finished and builds updated collections', () => {
  const activeSession = makeSession('session-1', {
    status: 'active',
    teamIds: ['team-1'],
  });
  const otherSession = makeSession('session-2', { status: 'draft' });
  const team = makeTeam('team-1', 'session-1', ['player-1']);
  const player = makePlayer('player-1');

  const result = buildFinishedSessionResult({
    activeSession,
    sessions: [activeSession, otherSession],
    games: [],
    pointEvents: [],
    teams: [team],
    players: [player],
    sessionReports: [],
    finishedAt: '2026-07-13T15:00:00.000Z',
  });

  assert.equal(result.finishedSession.status, 'finished');
  assert.equal(result.finishedSession.updatedAt, '2026-07-13T15:00:00.000Z');
  assert.deepEqual(
    result.participants.map((participant) => participant.id),
    ['player-1'],
  );
  assert.deepEqual(
    result.updatedSessions.map((session) => [session.id, session.status]),
    [
      ['session-1', 'finished'],
      ['session-2', 'draft'],
    ],
  );
  assert.equal(result.updatedPlayers[0].id, 'player-1');
  assert.equal(result.updatedReports.length, 1);
  assert.equal(result.updatedReports[0].sessionId, 'session-1');
});
