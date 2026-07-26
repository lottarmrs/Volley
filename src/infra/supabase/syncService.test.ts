import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mergeEntityLists,
  computeStaleRelationIds,
  communitySemanticKey,
  isUuid,
  playerSemanticKey,
  consolidateDuplicateRecords,
  syncService,
  type LocalSyncPayload,
} from './syncService';
import { operationalCloudService } from './operationalCloudService';
import { playerCloudService } from './playerCloudService';
import { playerEvaluationCloudService } from './playerEvaluationCloudService';
import { selfEvaluationCloudService } from './selfEvaluationCloudService';
import { communityCloudService } from './communityCloudService';
import { communityPlayerCloudService } from './communityPlayerCloudService';
import { communityRulesCloudService } from './communityRulesCloudService';
import { whatsappTemplateCloudService } from './whatsappTemplateCloudService';
import { championshipCloudService } from './championshipCloudService';
import { aggregatePlayerEvaluations } from '../../logic/playerEvaluations';
import {
  CloudSyncStatus,
  Community,
  CommunityPresence,
  Championship,
  ChampionshipRound,
  ChampionshipTeam,
  Player,
  PlayerEvaluation,
  PointEvent,
  Session,
  Team,
  WhatsAppListDraft,
} from '../../types';

interface TestEntity {
  id: string;
  cloudId?: string;
  sessionId?: string;
  updatedAt?: string;
  deletedAt?: string;
  syncStatus?: CloudSyncStatus;
  scoreA?: number;
  name?: string;
  nome?: string;
  username?: string;
  genero?: string;
  posicaoPrincipal?: string;
  alturaCm?: number;
}

function emptyPayload(overrides: Partial<LocalSyncPayload> = {}): LocalSyncPayload {
  return {
    communities: [],
    players: [],
    rules: [],
    templates: [],
    sessions: [],
    teams: [],
    games: [],
    pointEvents: [],
    gameReports: [],
    sessionReports: [],
    presenceRecords: [],
    drafts: [],
    championships: [],
    championshipTeams: [],
    championshipRounds: [],
    ...overrides,
  };
}

test('uploadLocalDataToCloud resolves championship references before upload', async () => {
  const originalUpsertChampionship = championshipCloudService.upsertChampionship;
  const originalUpsertTeam = championshipCloudService.upsertTeam;
  const originalUpsertRound = championshipCloudService.upsertRound;
  const originalUpsertSession = operationalCloudService.upsertSession;
  const calls: Record<string, unknown> = {};

  const championship: Championship = {
    id: 'champ-local',
    communityId: 'community-local',
    name: 'Liga de Verao',
    format: 'round_robin',
    classificationPoints: { win: 3, loss: 0 },
    recurrenceRule: { daysOfWeek: [2], time: '20:00', startDate: '2026-08-01' },
    createdAt: '2026-07-26T00:00:00.000Z',
    updatedAt: '2026-07-26T00:00:00.000Z',
    syncStatus: 'pending',
  };
  const championshipTeam: ChampionshipTeam = {
    id: 'champ-team-local-a',
    championshipId: 'champ-local',
    name: 'Time A',
    playerIds: ['player-local'],
    syncStatus: 'pending',
  };
  const otherTeam: ChampionshipTeam = {
    ...championshipTeam,
    id: 'champ-team-local-b',
    name: 'Time B',
    playerIds: [],
  };
  const round: ChampionshipRound = {
    id: 'round-local',
    championshipId: 'champ-local',
    round: 1,
    teamAId: championshipTeam.id,
    teamBId: otherTeam.id,
    scheduledDate: '2026-08-04T20:00',
    skipped: false,
    sessionId: 'session-local',
    syncStatus: 'pending',
  };

  try {
    championshipCloudService.upsertChampionship = async (item) => {
      calls.championship = item;
      return { ...item, cloudId: 'champ-cloud' };
    };
    championshipCloudService.upsertTeam = async (item, championshipCloudId) => {
      calls[`team:${item.id}`] = { item, championshipCloudId };
      return { ...item, cloudId: `${item.id}-cloud` };
    };
    championshipCloudService.upsertRound = async (
      item,
      championshipCloudId,
      teamACloudId,
      teamBCloudId,
    ) => {
      calls.round = { item, championshipCloudId, teamACloudId, teamBCloudId };
      return { ...item, cloudId: 'round-cloud' };
    };
    operationalCloudService.upsertSession = async (item) => ({ ...item, cloudId: 'session-cloud' });

    const result = await syncService.uploadLocalDataToCloud(
      emptyPayload({
        communities: [makeSharedCommunity({ id: 'community-local', cloudId: 'community-cloud' })],
        players: [makeSyncPlayer({ id: 'player-local', cloudId: 'player-cloud' })],
        sessions: [makeSession()],
        championships: [championship],
        championshipTeams: [championshipTeam, otherTeam],
        championshipRounds: [round],
      }),
      'owner-1',
    );

    assert.equal((calls.championship as Championship).communityId, 'community-cloud');
    assert.deepEqual(
      (calls['team:champ-team-local-a'] as { item: ChampionshipTeam }).item.playerIds,
      ['player-cloud'],
    );
    assert.equal(
      (calls['team:champ-team-local-a'] as { championshipCloudId: string }).championshipCloudId,
      'champ-cloud',
    );
    assert.deepEqual(calls.round, {
      item: { ...round, sessionId: 'session-cloud' },
      championshipCloudId: 'champ-cloud',
      teamACloudId: 'champ-team-local-a-cloud',
      teamBCloudId: 'champ-team-local-b-cloud',
    });
    assert.equal(result.championships[0].cloudId, 'champ-cloud');
    assert.equal(result.championshipTeams[0].cloudId, 'champ-team-local-a-cloud');
    assert.equal(result.championshipRounds[0].cloudId, 'round-cloud');
  } finally {
    championshipCloudService.upsertChampionship = originalUpsertChampionship;
    championshipCloudService.upsertTeam = originalUpsertTeam;
    championshipCloudService.upsertRound = originalUpsertRound;
    operationalCloudService.upsertSession = originalUpsertSession;
  }
});

test('uploadLocalDataToCloud excludes a championship round whose session has not synced yet', async () => {
  // Critical-bug-shaped case: championship_rounds.session_id is a nullable FK to
  // sessions.id (the CLOUD id). If the referenced session hasn't been uploaded yet
  // (no cloud row exists), the round must NOT be uploaded with the session's LOCAL
  // id disguised as a cloud id — it must be excluded from this sync pass and
  // retried once the session actually syncs.
  const originalUpsertChampionship = championshipCloudService.upsertChampionship;
  const originalUpsertTeam = championshipCloudService.upsertTeam;
  const originalUpsertRound = championshipCloudService.upsertRound;
  const originalUpsertSession = operationalCloudService.upsertSession;
  let roundUploadCalled = false;

  const championship: Championship = {
    id: 'champ-local',
    communityId: 'community-local',
    name: 'Liga de Verao',
    format: 'round_robin',
    classificationPoints: { win: 3, loss: 0 },
    recurrenceRule: { daysOfWeek: [2], time: '20:00', startDate: '2026-08-01' },
    createdAt: '2026-07-26T00:00:00.000Z',
    updatedAt: '2026-07-26T00:00:00.000Z',
    syncStatus: 'pending',
  };
  const championshipTeam: ChampionshipTeam = {
    id: 'champ-team-local-a',
    championshipId: 'champ-local',
    name: 'Time A',
    playerIds: [],
    syncStatus: 'pending',
  };
  const otherTeam: ChampionshipTeam = {
    ...championshipTeam,
    id: 'champ-team-local-b',
    name: 'Time B',
  };
  const round: ChampionshipRound = {
    id: 'round-local',
    championshipId: 'champ-local',
    round: 1,
    teamAId: championshipTeam.id,
    teamBId: otherTeam.id,
    scheduledDate: '2026-08-04T20:00',
    skipped: false,
    sessionId: 'session-not-yet-synced',
    syncStatus: 'pending',
  };

  try {
    championshipCloudService.upsertChampionship = async (item) => ({
      ...item,
      cloudId: 'champ-cloud',
    });
    championshipCloudService.upsertTeam = async (item) => ({
      ...item,
      cloudId: `${item.id}-cloud`,
    });
    championshipCloudService.upsertRound = async (item) => {
      roundUploadCalled = true;
      return { ...item, cloudId: 'round-cloud' };
    };
    // The referenced session fails to upload (e.g. offline, RLS, transient error) —
    // it never gets a cloudId this pass.
    operationalCloudService.upsertSession = async () => {
      throw new Error('network error');
    };

    const result = await syncService.uploadLocalDataToCloud(
      emptyPayload({
        communities: [makeSharedCommunity({ id: 'community-local', cloudId: 'community-cloud' })],
        sessions: [makeSession({ id: 'session-not-yet-synced' })],
        championships: [championship],
        championshipTeams: [championshipTeam, otherTeam],
        championshipRounds: [round],
      }),
      'owner-1',
    );

    assert.equal(
      roundUploadCalled,
      false,
      'round must not be uploaded while its session is unsynced',
    );
    assert.equal(result.championshipRounds[0].sessionId, 'session-not-yet-synced');
    assert.equal(result.championshipRounds[0].cloudId, undefined);
    assert.equal(result.championshipRounds[0].syncStatus, 'pending');
  } finally {
    championshipCloudService.upsertChampionship = originalUpsertChampionship;
    championshipCloudService.upsertTeam = originalUpsertTeam;
    championshipCloudService.upsertRound = originalUpsertRound;
    operationalCloudService.upsertSession = originalUpsertSession;
  }
});

test('uploadLocalDataToCloud defers a session team while its championship team is unresolved', async () => {
  const originalUpsertChampionship = championshipCloudService.upsertChampionship;
  const originalUpsertChampionshipTeam = championshipCloudService.upsertTeam;
  const originalUpsertSession = operationalCloudService.upsertSession;
  const originalBulkUpsertTeams = operationalCloudService.bulkUpsertTeams;
  let sessionTeamUploadCalled = false;

  const championship: Championship = {
    id: 'champ-local',
    communityId: 'community-local',
    name: 'Liga',
    format: 'round_robin',
    classificationPoints: { win: 3, loss: 0 },
    recurrenceRule: { daysOfWeek: [2], time: '20:00', startDate: '2026-08-01' },
    createdAt: '2026-07-26T00:00:00.000Z',
    updatedAt: '2026-07-26T00:00:00.000Z',
    syncStatus: 'pending',
  };
  const championshipTeam: ChampionshipTeam = {
    id: 'champ-team-local',
    championshipId: championship.id,
    name: 'Time A',
    playerIds: [],
    syncStatus: 'pending',
  };
  const sessionTeam = makeTeam({
    id: 'session-team-local',
    championshipTeamId: championshipTeam.id,
  });

  try {
    championshipCloudService.upsertChampionship = async (item) => ({
      ...item,
      cloudId: 'champ-cloud',
    });
    championshipCloudService.upsertTeam = async () => {
      throw new Error('championship roster dependency not ready');
    };
    operationalCloudService.upsertSession = async (item) => ({
      ...item,
      cloudId: 'session-cloud',
    });
    operationalCloudService.bulkUpsertTeams = async (items) => {
      sessionTeamUploadCalled = true;
      return items.map((item) => ({ ...item, cloudId: `${item.id}-cloud` }));
    };

    const result = await syncService.uploadLocalDataToCloud(
      emptyPayload({
        communities: [makeSharedCommunity()],
        sessions: [makeSession()],
        teams: [sessionTeam],
        championships: [championship],
        championshipTeams: [championshipTeam],
      }),
      'owner-1',
    );

    assert.equal(sessionTeamUploadCalled, false);
    assert.equal(result.teams[0].id, sessionTeam.id);
    assert.equal(result.teams[0].cloudId, undefined);
    assert.equal(result.teams[0].syncStatus, 'pending');
    assert.equal(result.teams[0].championshipTeamId, championshipTeam.id);
  } finally {
    championshipCloudService.upsertChampionship = originalUpsertChampionship;
    championshipCloudService.upsertTeam = originalUpsertChampionshipTeam;
    operationalCloudService.upsertSession = originalUpsertSession;
    operationalCloudService.bulkUpsertTeams = originalBulkUpsertTeams;
  }
});

test('downloadCloudDataToLocal restores championship references to local ids', async () => {
  const originalCommunities = communityCloudService.fetchAll;
  const originalPlayers = playerCloudService.fetchAll;
  const originalRules = communityRulesCloudService.fetchAll;
  const originalTemplates = whatsappTemplateCloudService.fetchAll;
  const originalRelations = communityPlayerCloudService.fetchAll;
  const originalEvaluations = playerEvaluationCloudService.fetchAll;
  const originalOperational = operationalCloudService.fetchAll;
  const originalSelfEvaluation = selfEvaluationCloudService.fetch;
  const originalChampionships = championshipCloudService.fetchAll;
  const originalTeams = championshipCloudService.fetchTeams;
  const originalRounds = championshipCloudService.fetchRounds;

  try {
    communityCloudService.fetchAll = async () => [
      makeSharedCommunity({ id: 'community-local', cloudId: 'community-cloud' }),
    ];
    playerCloudService.fetchAll = async () => [
      makeSyncPlayer({ id: 'player-local', cloudId: 'player-cloud' }),
    ];
    communityRulesCloudService.fetchAll = async () => [];
    whatsappTemplateCloudService.fetchAll = async () => [];
    communityPlayerCloudService.fetchAll = async () => [];
    playerEvaluationCloudService.fetchAll = async () => [];
    selfEvaluationCloudService.fetch = async () => null;
    operationalCloudService.fetchAll = async () => ({
      sessions: [makeSession({ id: 'session-local', cloudId: 'session-cloud' })],
      teams: [
        makeTeam({
          id: 'session-team-local',
          cloudId: 'session-team-cloud',
          championshipTeamId: 'champ-team-cloud-a',
          syncStatus: 'synced',
        }),
      ],
      games: [],
      pointEvents: [],
      gameReports: [],
      sessionReports: [],
      presenceRecords: [],
      drafts: [],
    });
    championshipCloudService.fetchAll = async () => [
      {
        id: 'champ-local',
        cloudId: 'champ-cloud',
        communityId: 'community-cloud',
        name: 'Liga',
        format: 'round_robin',
        classificationPoints: { win: 3, loss: 0 },
        recurrenceRule: { daysOfWeek: [2], time: '20:00', startDate: '2026-08-01' },
        createdAt: '2026-07-26T00:00:00.000Z',
        updatedAt: '2026-07-26T00:00:00.000Z',
      },
    ];
    championshipCloudService.fetchTeams = async () => [
      {
        id: 'champ-team-local-a',
        cloudId: 'champ-team-cloud-a',
        championshipId: 'champ-cloud',
        name: 'Time A',
        playerIds: ['player-cloud'],
      },
      {
        id: 'champ-team-local-b',
        cloudId: 'champ-team-cloud-b',
        championshipId: 'champ-cloud',
        name: 'Time B',
        playerIds: [],
      },
    ];
    championshipCloudService.fetchRounds = async () => [
      {
        id: 'round-local',
        cloudId: 'round-cloud',
        championshipId: 'champ-cloud',
        round: 1,
        teamAId: 'champ-team-cloud-a',
        teamBId: 'champ-team-cloud-b',
        scheduledDate: '2026-08-04T20:00',
        skipped: false,
        sessionId: 'session-cloud',
      },
    ];

    const result = await syncService.downloadCloudDataToLocal('owner-1');

    assert.equal(result.championships[0].communityId, 'community-local');
    assert.equal(result.championshipTeams[0].championshipId, 'champ-local');
    assert.deepEqual(result.championshipTeams[0].playerIds, ['player-local']);
    assert.equal(result.teams[0].championshipTeamId, 'champ-team-local-a');
    assert.deepEqual(result.championshipRounds[0], {
      ...result.championshipRounds[0],
      championshipId: 'champ-local',
      teamAId: 'champ-team-local-a',
      teamBId: 'champ-team-local-b',
      sessionId: 'session-local',
    });
  } finally {
    communityCloudService.fetchAll = originalCommunities;
    playerCloudService.fetchAll = originalPlayers;
    communityRulesCloudService.fetchAll = originalRules;
    whatsappTemplateCloudService.fetchAll = originalTemplates;
    communityPlayerCloudService.fetchAll = originalRelations;
    playerEvaluationCloudService.fetchAll = originalEvaluations;
    operationalCloudService.fetchAll = originalOperational;
    selfEvaluationCloudService.fetch = originalSelfEvaluation;
    championshipCloudService.fetchAll = originalChampionships;
    championshipCloudService.fetchTeams = originalTeams;
    championshipCloudService.fetchRounds = originalRounds;
  }
});

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 'session-local',
    name: 'Treino',
    date: '2026-06-28',
    status: 'draft',
    selectedPlayerIds: [],
    teamIds: [],
    createdAt: '2026-06-28T20:00:00.000Z',
    updatedAt: '2026-06-28T20:00:00.000Z',
    syncStatus: 'pending',
    ...overrides,
  };
}

function makeTeam(overrides: Partial<Team> = {}): Team {
  return {
    id: 'team-local',
    sessionId: 'session-local',
    name: 'Time A',
    playerIds: [],
    generatedByAlgorithm: true,
    locked: false,
    strengthSnapshot: {} as Team['strengthSnapshot'],
    updatedAt: '2026-06-28T20:00:00.000Z',
    syncStatus: 'pending',
    ...overrides,
  };
}

function makeSharedCommunity(overrides: Partial<Community> = {}): Community {
  return {
    id: 'community-local',
    cloudId: 'community-cloud',
    cloudOwnerId: 'other-owner',
    name: 'Terca do Volei',
    createdAt: '2026-06-28T20:00:00.000Z',
    updatedAt: '2026-06-28T20:00:00.000Z',
    syncStatus: 'synced',
    ...overrides,
  };
}

function makeSyncPlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: 'player-local',
    cloudId: 'player-cloud',
    cloudOwnerId: 'owner-1',
    nome: 'Ana Souza',
    apelido: '',
    genero: 'F',
    ativo: true,
    posicaoPrincipal: 'ponteiro',
    posicoesSecundarias: [],
    alturaCm: 170,
    maoDominante: 'direita',
    atributos: {
      saque: 5,
      recepcao: 5,
      levantamento: 5,
      ataque: 5,
      bloqueio: 5,
      defesa: 5,
      velocidade: 5,
      resistencia: 5,
      leituraDeJogo: 5,
      regularidade: 5,
      controleEmocional: 5,
    },
    perfil: {
      nivel: 5,
      classe: 'B',
      arquetipo: 'Equilibrada',
      especialidade: 'Passe',
      fraqueza: 'Bloqueio',
    },
    formaAtual: {
      valor: 5,
      observacao: '',
      ultimasPartidas: [],
    },
    status: {
      lesionado: false,
      limitacaoFisica: null,
      presencaFrequente: true,
    },
    metadata: {
      criadoEm: '2026-06-01T00:00:00.000Z',
      atualizadoEm: '2026-06-01T00:00:00.000Z',
    },
    syncStatus: 'pending',
    ...overrides,
  };
}

function silenceConsoleError() {
  const originalConsoleError = console.error;
  console.error = () => {};
  return () => {
    console.error = originalConsoleError;
  };
}

test('uploadLocalDataToCloud reports thrown bulk session child failures through onIssue', async () => {
  const originalUpsertSession = operationalCloudService.upsertSession;
  const originalBulkUpsertTeams = operationalCloudService.bulkUpsertTeams;
  const restoreConsoleError = silenceConsoleError();

  const issues: string[] = [];
  const session = makeSession();
  const team = makeTeam();

  try {
    operationalCloudService.upsertSession = async (item: Session) => ({
      ...item,
      cloudId: 'session-cloud',
    });
    operationalCloudService.bulkUpsertTeams = async () => {
      throw new Error('network down');
    };

    const result = await syncService.uploadLocalDataToCloud(
      emptyPayload({ sessions: [session], teams: [team] }),
      'owner-1',
      { onIssue: (context) => issues.push(context) },
    );

    assert.equal(result.teams.length, 1);
    assert.equal(result.teams[0].id, 'team-local');
    assert.equal(result.teams[0].syncStatus, 'pending');
    assert.equal(issues.length, 1);
    assert.match(issues[0], /teams/i);
  } finally {
    operationalCloudService.upsertSession = originalUpsertSession;
    operationalCloudService.bulkUpsertTeams = originalBulkUpsertTeams;
    restoreConsoleError();
  }
});

test('uploadLocalDataToCloud keeps child items pending when bulk returns no matching result', async () => {
  const originalUpsertSession = operationalCloudService.upsertSession;
  const originalBulkUpsertTeams = operationalCloudService.bulkUpsertTeams;

  const issues: string[] = [];
  const session = makeSession();
  const team = makeTeam();

  try {
    operationalCloudService.upsertSession = async (item: Session) => ({
      ...item,
      cloudId: 'session-cloud',
    });
    operationalCloudService.bulkUpsertTeams = async () => [];

    const result = await syncService.uploadLocalDataToCloud(
      emptyPayload({ sessions: [session], teams: [team] }),
      'owner-1',
      { onIssue: (context) => issues.push(context) },
    );

    assert.equal(result.teams.length, 1);
    assert.equal(result.teams[0].id, 'team-local');
    assert.equal(result.teams[0].syncStatus, 'pending');
    assert.equal(issues.length, 1);
    assert.match(issues[0], /teams/i);
  } finally {
    operationalCloudService.upsertSession = originalUpsertSession;
    operationalCloudService.bulkUpsertTeams = originalBulkUpsertTeams;
  }
});

test('uploadLocalDataToCloud reports presence bulk failures through onIssue', async () => {
  const originalBulkUpsertPresence = operationalCloudService.bulkUpsertPresence;
  const restoreConsoleError = silenceConsoleError();
  const issues: string[] = [];
  const presence: CommunityPresence = {
    communityId: 'community-local',
    date: '2026-06-28',
    items: [],
    updatedAt: '2026-06-28T20:00:00.000Z',
    syncStatus: 'pending',
  };

  try {
    operationalCloudService.bulkUpsertPresence = async () => {
      throw new Error('presence upload failed');
    };

    const result = await syncService.uploadLocalDataToCloud(
      emptyPayload({
        communities: [makeSharedCommunity()],
        presenceRecords: [presence],
      }),
      'owner-1',
      { onIssue: (context) => issues.push(context) },
    );

    assert.equal(result.presenceRecords.length, 1);
    assert.equal(result.presenceRecords[0].communityId, 'community-local');
    assert.equal(result.presenceRecords[0].syncStatus, 'pending');
    assert.equal(issues.length, 1);
    assert.match(issues[0], /community_presence|presenca/i);
  } finally {
    operationalCloudService.bulkUpsertPresence = originalBulkUpsertPresence;
    restoreConsoleError();
  }
});

test('uploadLocalDataToCloud keeps presence records pending when bulk returns no matching result', async () => {
  const originalBulkUpsertPresence = operationalCloudService.bulkUpsertPresence;
  const issues: string[] = [];
  const presence: CommunityPresence = {
    communityId: 'community-local',
    date: '2026-06-28',
    items: [],
    updatedAt: '2026-06-28T20:00:00.000Z',
    syncStatus: 'pending',
  };

  try {
    operationalCloudService.bulkUpsertPresence = async () => [];

    const result = await syncService.uploadLocalDataToCloud(
      emptyPayload({
        communities: [makeSharedCommunity()],
        presenceRecords: [presence],
      }),
      'owner-1',
      { onIssue: (context) => issues.push(context) },
    );

    assert.equal(result.presenceRecords.length, 1);
    assert.equal(result.presenceRecords[0].communityId, 'community-local');
    assert.equal(result.presenceRecords[0].syncStatus, 'pending');
    assert.equal(issues.length, 1);
    assert.match(issues[0], /community_presence|presenca/i);
  } finally {
    operationalCloudService.bulkUpsertPresence = originalBulkUpsertPresence;
  }
});

test('uploadLocalDataToCloud preserves pending presence deletes when bulk delete fails', async () => {
  const originalBulkSoftDelete = operationalCloudService.bulkSoftDelete;
  const restoreConsoleError = silenceConsoleError();
  const issues: string[] = [];
  const presence: CommunityPresence = {
    communityId: 'community-local',
    date: '2026-06-28',
    cloudId: 'presence-cloud',
    items: [],
    updatedAt: '2026-06-28T20:00:00.000Z',
    deletedAt: '2026-06-28T21:00:00.000Z',
    syncStatus: 'pending',
  };

  try {
    operationalCloudService.bulkSoftDelete = async (table, ids) => {
      if (table === 'community_presence') {
        throw new Error('presence delete failed');
      }
      return originalBulkSoftDelete(table, ids);
    };

    const result = await syncService.uploadLocalDataToCloud(
      emptyPayload({
        communities: [makeSharedCommunity()],
        presenceRecords: [presence],
      }),
      'owner-1',
      { onIssue: (context) => issues.push(context) },
    );

    assert.equal(result.presenceRecords.length, 1);
    assert.equal(result.presenceRecords[0].communityId, 'community-local');
    assert.equal(result.presenceRecords[0].deletedAt, '2026-06-28T21:00:00.000Z');
    assert.equal(result.presenceRecords[0].syncStatus, 'pending');
    assert.equal(issues.length, 1);
    assert.match(issues[0], /community_presence|presenca/i);
  } finally {
    operationalCloudService.bulkSoftDelete = originalBulkSoftDelete;
    restoreConsoleError();
  }
});

test('uploadLocalDataToCloud reports WhatsApp draft bulk failures through onIssue', async () => {
  const originalBulkUpsertDrafts = operationalCloudService.bulkUpsertDrafts;
  const restoreConsoleError = silenceConsoleError();
  const issues: string[] = [];
  const draft: WhatsAppListDraft = {
    id: 'draft-local',
    communityId: 'community-local',
    title: 'Lista',
    date: '2026-06-28',
    setters: [],
    mainSlots: [],
    reserveSlots: [],
    settersSectionTitle: 'Levantadores',
    reserveSectionTitle: 'Reserva',
    showLockIcon: true,
    paymentSymbol: '$',
    createdAt: '2026-06-28T20:00:00.000Z',
    updatedAt: '2026-06-28T20:00:00.000Z',
    syncStatus: 'pending',
  };

  try {
    operationalCloudService.bulkUpsertDrafts = async () => {
      throw new Error('draft upload failed');
    };

    const result = await syncService.uploadLocalDataToCloud(
      emptyPayload({
        communities: [makeSharedCommunity()],
        drafts: [draft],
      }),
      'owner-1',
      { onIssue: (context) => issues.push(context) },
    );

    assert.equal(result.drafts.length, 1);
    assert.equal(result.drafts[0].id, 'draft-local');
    assert.equal(result.drafts[0].syncStatus, 'pending');
    assert.equal(issues.length, 1);
    assert.match(issues[0], /whatsapp_list_drafts|rascunho/i);
  } finally {
    operationalCloudService.bulkUpsertDrafts = originalBulkUpsertDrafts;
    restoreConsoleError();
  }
});

test('uploadLocalDataToCloud keeps WhatsApp drafts pending when bulk returns no matching result', async () => {
  const originalBulkUpsertDrafts = operationalCloudService.bulkUpsertDrafts;
  const issues: string[] = [];
  const draft: WhatsAppListDraft = {
    id: 'draft-local',
    communityId: 'community-local',
    title: 'Lista',
    date: '2026-06-28',
    setters: [],
    mainSlots: [],
    reserveSlots: [],
    settersSectionTitle: 'Levantadores',
    reserveSectionTitle: 'Reserva',
    showLockIcon: true,
    paymentSymbol: '$',
    createdAt: '2026-06-28T20:00:00.000Z',
    updatedAt: '2026-06-28T20:00:00.000Z',
    syncStatus: 'pending',
  };

  try {
    operationalCloudService.bulkUpsertDrafts = async () => [];

    const result = await syncService.uploadLocalDataToCloud(
      emptyPayload({
        communities: [makeSharedCommunity()],
        drafts: [draft],
      }),
      'owner-1',
      { onIssue: (context) => issues.push(context) },
    );

    assert.equal(result.drafts.length, 1);
    assert.equal(result.drafts[0].id, 'draft-local');
    assert.equal(result.drafts[0].syncStatus, 'pending');
    assert.equal(issues.length, 1);
    assert.match(issues[0], /whatsapp_list_drafts|rascunho/i);
  } finally {
    operationalCloudService.bulkUpsertDrafts = originalBulkUpsertDrafts;
  }
});

test('uploadLocalDataToCloud preserves pending WhatsApp draft deletes when bulk delete fails', async () => {
  const originalBulkSoftDelete = operationalCloudService.bulkSoftDelete;
  const restoreConsoleError = silenceConsoleError();
  const issues: string[] = [];
  const draft: WhatsAppListDraft = {
    id: 'draft-local',
    cloudId: 'draft-cloud',
    communityId: 'community-local',
    title: 'Lista',
    date: '2026-06-28',
    setters: [],
    mainSlots: [],
    reserveSlots: [],
    settersSectionTitle: 'Levantadores',
    reserveSectionTitle: 'Reserva',
    showLockIcon: true,
    paymentSymbol: '$',
    createdAt: '2026-06-28T20:00:00.000Z',
    updatedAt: '2026-06-28T20:00:00.000Z',
    deletedAt: '2026-06-28T21:00:00.000Z',
    syncStatus: 'pending',
  };

  try {
    operationalCloudService.bulkSoftDelete = async (table, ids) => {
      if (table === 'whatsapp_list_drafts') {
        throw new Error('draft delete failed');
      }
      return originalBulkSoftDelete(table, ids);
    };

    const result = await syncService.uploadLocalDataToCloud(
      emptyPayload({
        communities: [makeSharedCommunity()],
        drafts: [draft],
      }),
      'owner-1',
      { onIssue: (context) => issues.push(context) },
    );

    assert.equal(result.drafts.length, 1);
    assert.equal(result.drafts[0].id, 'draft-local');
    assert.equal(result.drafts[0].deletedAt, '2026-06-28T21:00:00.000Z');
    assert.equal(result.drafts[0].syncStatus, 'pending');
    assert.equal(issues.length, 1);
    assert.match(issues[0], /whatsapp_list_drafts|rascunho/i);
  } finally {
    operationalCloudService.bulkSoftDelete = originalBulkSoftDelete;
    restoreConsoleError();
  }
});

test('mergeEntityLists keeps newer local records pending with cloud id attached', () => {
  const [merged] = mergeEntityLists<TestEntity>(
    [{ id: 'session-local', cloudId: 'session-cloud', updatedAt: '2026-06-09T12:00:00.000Z' }],
    [{ id: 'session-local', cloudId: 'session-cloud', updatedAt: '2026-06-09T11:00:00.000Z' }],
    { getId: (item) => item.id },
  );

  assert.equal(merged.id, 'session-local');
  assert.equal(merged.cloudId, 'session-cloud');
  assert.equal(merged.syncStatus, 'pending');
});

test('mergeEntityLists accepts newer cloud records but preserves local relationship ids', () => {
  const [merged] = mergeEntityLists<TestEntity>(
    [
      {
        id: 'game-local',
        cloudId: 'game-cloud',
        sessionId: 'session-local',
        updatedAt: '2026-06-09T10:00:00.000Z',
        scoreA: 1,
      },
    ],
    [
      {
        id: 'game-from-cloud-local-id',
        cloudId: 'game-cloud',
        sessionId: 'session-from-cloud-local-id',
        updatedAt: '2026-06-09T12:00:00.000Z',
        scoreA: 2,
      },
    ],
    { getId: (item) => item.id },
  );

  assert.equal(merged.id, 'game-local');
  assert.equal(merged.sessionId, 'session-local');
  assert.equal(merged.scoreA, 2);
  assert.equal(merged.syncStatus, 'synced');
});

test('mergeEntityLists propagates soft deletes for cloud-backed local records', () => {
  const [merged] = mergeEntityLists<TestEntity>(
    [
      {
        id: 'point-local',
        cloudId: 'point-cloud',
        sessionId: 'session-local',
        deletedAt: '2026-06-09T12:00:00.000Z',
        updatedAt: '2026-06-09T12:00:00.000Z',
      },
    ],
    [
      {
        id: 'point-local',
        cloudId: 'point-cloud',
        sessionId: 'session-local',
        updatedAt: '2026-06-09T11:00:00.000Z',
      },
    ],
    { getId: (item) => item.id },
  );

  assert.equal(merged.deletedAt, '2026-06-09T12:00:00.000Z');
  assert.equal(merged.syncStatus, 'pending');
});

test('mergeEntityLists adds cloud-only records to the local payload', () => {
  const merged = mergeEntityLists<TestEntity>(
    [{ id: 'session-local', updatedAt: '2026-06-09T10:00:00.000Z' }],
    [
      {
        id: 'session-cloud-local-id',
        cloudId: 'session-cloud',
        updatedAt: '2026-06-09T12:00:00.000Z',
      },
    ],
    { getId: (item) => item.id },
  );

  assert.equal(merged.length, 2);
  assert.equal(merged[1].cloudId, 'session-cloud');
});

test('mergeEntityLists matches communities by semantic name to prevent cross-device duplicates', () => {
  const [merged] = mergeEntityLists<TestEntity>(
    [{ id: 'community-device-b', name: 'Terça do Vôlei', updatedAt: '2026-06-09T12:00:00.000Z' }],
    [
      {
        id: 'community-device-a',
        cloudId: 'community-cloud',
        name: 'Terca do Volei',
        updatedAt: '2026-06-09T11:00:00.000Z',
      },
    ],
    {
      getId: (item) => item.id,
      getSemanticKey: (item) => communitySemanticKey({ name: item.name || '' }),
    },
  );

  assert.equal(merged.id, 'community-device-b');
  assert.equal(merged.cloudId, 'community-cloud');
  assert.equal(merged.syncStatus, 'pending');
});

test('mergeEntityLists matches players by username/profile to prevent cross-device duplicates', () => {
  const [merged] = mergeEntityLists<TestEntity>(
    [
      {
        id: 'player-device-b',
        nome: 'Ana Souza',
        username: 'ana-souza',
        genero: 'F',
        posicaoPrincipal: 'levantador',
        alturaCm: 171,
        updatedAt: '2026-06-09T10:00:00.000Z',
      },
    ],
    [
      {
        id: 'player-device-a',
        cloudId: 'player-cloud',
        nome: 'Ana Souza',
        username: 'ANA-SOUZA',
        genero: 'F',
        posicaoPrincipal: 'levantador',
        alturaCm: 171,
        updatedAt: '2026-06-09T12:00:00.000Z',
      },
    ],
    {
      getId: (item) => item.id,
      getUpdatedAt: (item) => item.updatedAt,
      getSemanticKey: (item) =>
        playerSemanticKey({
          username: item.username,
          nome: item.nome || '',
          genero: item.genero as any,
          posicaoPrincipal: item.posicaoPrincipal as any,
          alturaCm: item.alturaCm,
        }),
    },
  );

  assert.equal(merged.id, 'player-device-b');
  assert.equal(merged.cloudId, 'player-cloud');
  assert.equal(merged.syncStatus, 'synced');
});

test('mergeEntityLists preserves local records with cloudId if missing from cloud response (avoiding deletion)', () => {
  const merged = mergeEntityLists<TestEntity>(
    [{ id: 'session-local', cloudId: 'session-cloud', updatedAt: '2026-06-09T10:00:00.000Z' }],
    [], // empty cloud response (could be RLS / truncation)
    { getId: (item) => item.id },
  );

  assert.equal(merged.length, 1);
  assert.equal(merged[0].id, 'session-local');
  assert.equal(merged[0].cloudId, 'session-cloud');
  assert.equal(merged[0].deletedAt, undefined);
});

test('consolidateDuplicateRecords merges old duplicates and remaps historical references', () => {
  const { payload, summary } = consolidateDuplicateRecords(
    {
      communities: [
        {
          id: 'comm-old-local',
          cloudId: 'comm-old-cloud',
          cloudOwnerId: 'owner-1',
          name: 'Terca do Volei',
          createdAt: '2026-06-01T10:00:00.000Z',
          updatedAt: '2026-06-01T10:00:00.000Z',
        },
        {
          id: 'comm-new-local',
          cloudId: 'comm-new-cloud',
          cloudOwnerId: 'owner-1',
          name: ' terca do volei ',
          createdAt: '2026-06-02T10:00:00.000Z',
          updatedAt: '2026-06-02T10:00:00.000Z',
        },
      ],
      players: [
        {
          id: 'player-old-local',
          cloudId: 'player-old-cloud',
          cloudOwnerId: 'owner-1',
          username: 'ana-souza',
          nome: 'Ana Souza',
          genero: 'F',
          posicaoPrincipal: 'levantador',
          alturaCm: 171,
          communityIds: ['comm-old-cloud'],
          updatedAt: '2026-06-01T10:00:00.000Z',
          metadata: { atualizadoEm: '2026-06-01T10:00:00.000Z' },
        },
        {
          id: 'player-new-local',
          cloudId: 'player-new-cloud',
          cloudOwnerId: 'owner-1',
          username: 'ANA-SOUZA',
          nome: 'Ana Souza',
          genero: 'F',
          posicaoPrincipal: 'levantador',
          alturaCm: 171,
          communityIds: ['comm-new-cloud'],
          userId: 'auth-user',
          updatedAt: '2026-06-02T10:00:00.000Z',
          metadata: { atualizadoEm: '2026-06-02T10:00:00.000Z' },
        },
      ],
      rules: [],
      templates: [],
      sessions: [
        {
          id: 'session-1',
          communityId: 'comm-old-cloud',
          name: 'Treino',
          date: '2026-06-03',
          status: 'active',
          selectedPlayerIds: ['player-old-cloud', 'player-new-local'],
          teamIds: ['team-1'],
          createdAt: '2026-06-03T10:00:00.000Z',
          updatedAt: '2026-06-03T10:00:00.000Z',
          config: {
            type: 'free_play',
            teamCount: 2,
            maxPoints: 15,
            tieBreakMethod: 'direct_3',
            rotationSystem: 'winner_stays',
            initialCourtTeams: ['team-1', 'team-2'],
            initialQueue: [],
            queuePolicy: 'fifo',
            playerPositions: {
              'player-old-cloud': 'levantador',
            },
            balanceConstraints: {
              lockedPlayerIdxs: { 'player-old-cloud': 0 },
              pairsTogether: [['player-old-cloud', 'player-new-local']],
            },
          },
        },
      ],
      teams: [
        {
          id: 'team-1',
          sessionId: 'session-1',
          name: 'Time A',
          playerIds: ['player-old-cloud', 'player-new-local'],
          generatedByAlgorithm: true,
          locked: false,
          strengthSnapshot: {},
        },
      ],
      games: [],
      pointEvents: [
        {
          id: 'point-1',
          sessionId: 'session-1',
          gameId: 'game-1',
          sequenceNumber: 1,
          scoringTeamId: 'team-1',
          concedingTeamId: 'team-2',
          playerId: 'player-old-cloud',
          assistPlayerId: 'player-old-local',
          scoreBefore: { teamA: 0, teamB: 0 },
          scoreAfter: { teamA: 1, teamB: 0 },
          timestamp: '2026-06-03T10:05:00.000Z',
        },
      ],
      gameReports: [
        {
          id: 'report-1',
          sessionId: 'session-1',
          gameId: 'game-1',
          sequenceNumber: 1,
          generatedAt: '2026-06-03T11:00:00.000Z',
          teamA: {
            id: 'team-1',
            name: 'Time A',
            playerIds: ['player-old-cloud'],
            playerNames: ['Ana Souza'],
            score: 15,
          },
          teamB: {
            id: 'team-2',
            name: 'Time B',
            playerIds: [],
            playerNames: [],
            score: 12,
          },
          winnerTeamId: 'team-1',
          winnerTeamName: 'Time A',
          loserTeamId: 'team-2',
          loserTeamName: 'Time B',
          totalPoints: 27,
          playerStats: [
            {
              playerId: 'player-old-cloud',
              playerName: 'Ana Souza',
              teamId: 'team-1',
              teamName: 'Time A',
              totalPoints: 1,
              attacks: 1,
              blocks: 0,
              aces: 0,
              tips: 0,
              counterAttacks: 0,
            },
          ],
        },
      ],
      sessionReports: [],
      presenceRecords: [
        {
          communityId: 'comm-old-cloud',
          date: '2026-06-03',
          items: [{ playerId: 'player-old-cloud', status: 'present' }],
          updatedAt: '2026-06-03T09:00:00.000Z',
        },
      ],
      drafts: [
        {
          id: 'draft-1',
          communityId: 'comm-old-cloud',
          title: 'Lista',
          date: '2026-06-03',
          setters: [{ index: 0, playerId: 'player-old-cloud' }],
          mainSlots: [{ index: 0, playerId: 'player-old-local' }],
          reserveSlots: [],
          settersSectionTitle: 'Levantadores',
          reserveSectionTitle: 'Reserva',
          showLockIcon: true,
          paymentSymbol: '$',
          createdAt: '2026-06-03T08:00:00.000Z',
          updatedAt: '2026-06-03T08:00:00.000Z',
        },
      ],
      championships: [],
      championshipTeams: [],
      championshipRounds: [],
    } as any,
    { ownerId: 'owner-1', deletedAt: '2026-06-04T00:00:00.000Z' },
  );

  assert.equal(summary.communitiesMerged, 1);
  assert.equal(summary.playersMerged, 1);
  assert.equal(
    payload.communities.find((community) => community.id === 'comm-old-local')?.deletedAt,
    '2026-06-04T00:00:00.000Z',
  );
  assert.equal(
    payload.players.find((player) => player.id === 'player-old-local')?.deletedAt,
    '2026-06-04T00:00:00.000Z',
  );
  assert.deepEqual(
    payload.players.find((player) => player.id === 'player-new-local')?.communityIds,
    ['comm-new-local'],
  );
  assert.equal(payload.sessions[0].communityId, 'comm-new-local');
  assert.deepEqual(payload.sessions[0].selectedPlayerIds, ['player-new-local']);
  assert.deepEqual(payload.teams[0].playerIds, ['player-new-local']);
  assert.equal(payload.pointEvents[0].playerId, 'player-new-local');
  assert.equal(payload.pointEvents[0].assistPlayerId, 'player-new-local');
  assert.deepEqual(payload.gameReports[0].teamA.playerIds, ['player-new-local']);
  assert.equal(payload.gameReports[0].playerStats[0].playerId, 'player-new-local');
  assert.equal(payload.presenceRecords[0].communityId, 'comm-new-local');
  assert.equal(payload.presenceRecords[0].items[0].playerId, 'player-new-local');
  assert.equal(payload.drafts[0].communityId, 'comm-new-local');
  assert.equal(payload.drafts[0].setters[0].playerId, 'player-new-local');
  assert.equal(payload.drafts[0].mainSlots[0].playerId, 'player-new-local');
});

test('uploadLocalDataToCloud repairs legacy unlink intent without rpc or clearing user id', async () => {
  const originalUpsert = playerCloudService.upsert;
  const originalBulkEvaluations = playerEvaluationCloudService.bulkUpsertForPlayers;

  try {
    playerCloudService.upsert = async () => {
      assert.fail('shared unlink should not upsert player');
    };
    playerEvaluationCloudService.bulkUpsertForPlayers = async () => undefined;

    const result = await syncService.uploadLocalDataToCloud(
      emptyPayload({
        players: [
          makeSyncPlayer({
            cloudOwnerId: 'other-owner',
            userId: 'account-user',
            pendingUserLinkAction: 'unlink',
            syncStatus: 'pending',
          }),
        ],
      }),
      'owner-1',
    );

    assert.equal(result.players[0].userId, 'account-user');
    assert.equal(result.players[0].pendingUserLinkAction, undefined);
    assert.equal(result.players[0].syncStatus, 'synced');
  } finally {
    playerCloudService.upsert = originalUpsert;
    playerEvaluationCloudService.bulkUpsertForPlayers = originalBulkEvaluations;
  }
});

test('syncNow restores cloud user id while repairing a newer legacy unlink intent', async () => {
  const originalDownload = syncService.downloadCloudDataToLocal;
  const originalBulkEvaluations = playerEvaluationCloudService.bulkUpsertForPlayers;

  try {
    syncService.downloadCloudDataToLocal = async () =>
      emptyPayload({
        players: [
          makeSyncPlayer({
            cloudOwnerId: 'other-owner',
            userId: 'account-user',
            updatedAt: '2026-07-01T00:00:00.000Z',
            syncStatus: 'synced',
          }),
        ],
      });
    playerEvaluationCloudService.bulkUpsertForPlayers = async () => undefined;

    const result = await syncService.syncNow(
      emptyPayload({
        players: [
          makeSyncPlayer({
            cloudOwnerId: 'other-owner',
            userId: undefined,
            pendingUserLinkAction: 'unlink',
            updatedAt: '2026-07-02T00:00:00.000Z',
            syncStatus: 'pending',
          }),
        ],
      }),
      'owner-1',
    );

    assert.equal(result.players[0].userId, 'account-user');
    assert.equal(result.players[0].pendingUserLinkAction, undefined);
    assert.equal(result.players[0].updatedAt, '2026-07-02T00:00:00.000Z');
  } finally {
    syncService.downloadCloudDataToLocal = originalDownload;
    playerEvaluationCloudService.bulkUpsertForPlayers = originalBulkEvaluations;
  }
});

test('syncNow auto-repairs duplicate local players before uploading', async () => {
  const originalDownload = syncService.downloadCloudDataToLocal;
  const originalUpload = syncService.uploadLocalDataToCloud;
  let capturedMergedPayload: LocalSyncPayload | null = null;

  try {
    syncService.downloadCloudDataToLocal = async () => emptyPayload();
    syncService.uploadLocalDataToCloud = async (payload: LocalSyncPayload) => {
      capturedMergedPayload = payload;
      return payload;
    };

    const result = await syncService.syncNow(
      emptyPayload({
        players: [
          {
            id: 'player-empty',
            nome: 'Vitur',
            genero: 'M',
            posicaoPrincipal: 'oposto',
            alturaCm: 176,
            updatedAt: '2026-07-01T10:00:00.000Z',
          } as Player,
          {
            id: 'player-active',
            nome: 'Vitur',
            genero: 'M',
            posicaoPrincipal: 'oposto',
            alturaCm: 176,
            updatedAt: '2026-06-01T10:00:00.000Z',
          } as Player,
        ],
        sessions: [
          {
            id: 'session-1',
            selectedPlayerIds: ['player-empty', 'player-active'],
            updatedAt: '2026-07-01T10:00:00.000Z',
          } as Session,
        ],
        pointEvents: [
          {
            id: 'point-1',
            playerId: 'player-active',
            assistPlayerId: 'player-empty',
          } as PointEvent,
        ],
      }),
      'owner-1',
    );

    assert.deepEqual(
      capturedMergedPayload?.players
        .filter((player) => !player.deletedAt)
        .map((player) => player.id),
      ['player-active'],
    );
    assert.deepEqual(result.sessions[0].selectedPlayerIds, ['player-active']);
    assert.equal(result.pointEvents[0].playerId, 'player-active');
    assert.equal(result.pointEvents[0].assistPlayerId, 'player-active');
  } finally {
    syncService.downloadCloudDataToLocal = originalDownload;
    syncService.uploadLocalDataToCloud = originalUpload;
  }
});

test('computeStaleRelationIds deletes only undesired relations of payload players', () => {
  const owned = [
    { id: 'rel-keep', community_id: 'comm-1', player_id: 'player-1' },
    { id: 'rel-stale', community_id: 'comm-2', player_id: 'player-1' },
  ];
  const desired = new Set(['comm-1:player-1']);
  const payloadPlayers = new Set(['player-1']);

  const stale = computeStaleRelationIds(owned, desired, payloadPlayers);

  assert.deepEqual(stale, ['rel-stale']);
});

test('computeStaleRelationIds NEVER deletes relations of players absent from the payload (C1)', () => {
  // player-2 não está no payload deste device (ex.: nunca carregado). Mesmo não
  // estando no conjunto desejado, a sua relação não pode ser apagada.
  const owned = [{ id: 'rel-other-device', community_id: 'comm-9', player_id: 'player-2' }];
  const desired = new Set<string>(); // nada desejado neste device
  const payloadPlayers = new Set(['player-1']);

  const stale = computeStaleRelationIds(owned, desired, payloadPlayers);

  assert.deepEqual(stale, []);
});

test('computeStaleRelationIds is case-insensitive on ids', () => {
  const owned = [{ id: 'rel-1', community_id: 'COMM-1', player_id: 'PLAYER-1' }];
  const desired = new Set(['comm-1:player-1']);
  const payloadPlayers = new Set(['player-1']);

  assert.deepEqual(computeStaleRelationIds(owned, desired, payloadPlayers), []);
});

test('isUuid distinguishes native uuids from temporary/local ids (I2)', () => {
  assert.equal(isUuid('0f2b679a-680e-486a-871e-e8d2c6052bff'), true);
  assert.equal(isUuid('proposal-1782082372208'), false);
  assert.equal(isUuid('proposal-0f2b679a-680e-486a-871e-e8d2c6052bff'), false);
  assert.equal(isUuid('community-123'), false);
  assert.equal(isUuid(''), false);
  assert.equal(isUuid(undefined), false);
});

const baseAttributes = {
  saque: 5,
  recepcao: 5,
  levantamento: 5,
  ataque: 5,
  bloqueio: 5,
  defesa: 5,
  velocidade: 5,
  resistencia: 5,
  leituraDeJogo: 5,
  regularidade: 5,
  controleEmocional: 5,
};

function emptyOperationalPayload() {
  return {
    sessions: [],
    teams: [],
    games: [],
    pointEvents: [],
    gameReports: [],
    sessionReports: [],
    presenceRecords: [],
    drafts: [],
  };
}

test('downloadCloudDataToLocal fetches and merges the current user own self-evaluation only', async () => {
  const originalCommunities = communityCloudService.fetchAll;
  const originalPlayers = playerCloudService.fetchAll;
  const originalRules = communityRulesCloudService.fetchAll;
  const originalTemplates = whatsappTemplateCloudService.fetchAll;
  const originalRelations = communityPlayerCloudService.fetchAll;
  const originalEvaluations = playerEvaluationCloudService.fetchAll;
  const originalOperational = operationalCloudService.fetchAll;
  const originalChampionships = championshipCloudService.fetchAll;
  const originalSelfEvaluationFetch = selfEvaluationCloudService.fetch;
  const fetchedPlayerIds: string[] = [];

  try {
    communityCloudService.fetchAll = async () => [];
    playerCloudService.fetchAll = async () => [
      makeSyncPlayer({ id: 'player-me', cloudId: 'cloud-me', userId: 'owner-1' }),
      makeSyncPlayer({ id: 'player-other', cloudId: 'cloud-other', userId: 'owner-2' }),
    ];
    communityRulesCloudService.fetchAll = async () => [];
    whatsappTemplateCloudService.fetchAll = async () => [];
    communityPlayerCloudService.fetchAll = async () => [];
    playerEvaluationCloudService.fetchAll = async () => [];
    operationalCloudService.fetchAll = async () => emptyOperationalPayload();
    championshipCloudService.fetchAll = async () => [];
    selfEvaluationCloudService.fetch = async (playerId: string) => {
      fetchedPlayerIds.push(playerId);
      return { attributes: { ...baseAttributes, saque: 9 }, updatedAt: '2026-07-24T00:00:00.000Z' };
    };

    const result = await syncService.downloadCloudDataToLocal('owner-1');

    const me = result.players.find((player) => player.id === 'player-me');
    const other = result.players.find((player) => player.id === 'player-other');

    assert.deepEqual(fetchedPlayerIds, ['cloud-me']);
    assert.equal(me?.selfEvaluation?.attributes.saque, 9);
    assert.equal(other?.selfEvaluation, undefined);
  } finally {
    communityCloudService.fetchAll = originalCommunities;
    playerCloudService.fetchAll = originalPlayers;
    communityRulesCloudService.fetchAll = originalRules;
    whatsappTemplateCloudService.fetchAll = originalTemplates;
    communityPlayerCloudService.fetchAll = originalRelations;
    playerEvaluationCloudService.fetchAll = originalEvaluations;
    operationalCloudService.fetchAll = originalOperational;
    championshipCloudService.fetchAll = originalChampionships;
    selfEvaluationCloudService.fetch = originalSelfEvaluationFetch;
  }
});

test('downloadCloudDataToLocal never fetches a self-evaluation when no owner is authenticated', async () => {
  const originalCommunities = communityCloudService.fetchAll;
  const originalPlayers = playerCloudService.fetchAll;
  const originalRules = communityRulesCloudService.fetchAll;
  const originalTemplates = whatsappTemplateCloudService.fetchAll;
  const originalRelations = communityPlayerCloudService.fetchAll;
  const originalEvaluations = playerEvaluationCloudService.fetchAll;
  const originalOperational = operationalCloudService.fetchAll;
  const originalChampionships = championshipCloudService.fetchAll;
  const originalSelfEvaluationFetch = selfEvaluationCloudService.fetch;

  try {
    communityCloudService.fetchAll = async () => [];
    playerCloudService.fetchAll = async () => [
      makeSyncPlayer({ id: 'player-me', cloudId: 'cloud-me', userId: 'owner-1' }),
    ];
    communityRulesCloudService.fetchAll = async () => [];
    whatsappTemplateCloudService.fetchAll = async () => [];
    communityPlayerCloudService.fetchAll = async () => [];
    playerEvaluationCloudService.fetchAll = async () => [];
    operationalCloudService.fetchAll = async () => emptyOperationalPayload();
    championshipCloudService.fetchAll = async () => [];
    selfEvaluationCloudService.fetch = async () => assert.fail('should not fetch without an owner');

    const result = await syncService.downloadCloudDataToLocal(undefined);

    assert.equal(result.players[0].selfEvaluation, undefined);
  } finally {
    communityCloudService.fetchAll = originalCommunities;
    playerCloudService.fetchAll = originalPlayers;
    communityRulesCloudService.fetchAll = originalRules;
    whatsappTemplateCloudService.fetchAll = originalTemplates;
    communityPlayerCloudService.fetchAll = originalRelations;
    playerEvaluationCloudService.fetchAll = originalEvaluations;
    operationalCloudService.fetchAll = originalOperational;
    championshipCloudService.fetchAll = originalChampionships;
    selfEvaluationCloudService.fetch = originalSelfEvaluationFetch;
  }
});

test('uploadLocalDataToCloud only forwards players with a known evaluationCommunityId to bulkUpsertForPlayers', async () => {
  const originalUpsert = playerCloudService.upsert;
  const originalBulkEvaluations = playerEvaluationCloudService.bulkUpsertForPlayers;
  let receivedPlayers: Player[] = [];

  try {
    playerCloudService.upsert = async (local) => ({
      ...local,
      cloudId: local.cloudId || 'cloud-new',
    });
    playerEvaluationCloudService.bulkUpsertForPlayers = async (players) => {
      receivedPlayers = players;
    };

    await syncService.uploadLocalDataToCloud(
      emptyPayload({
        communities: [makeSharedCommunity({ id: 'community-1', cloudId: 'community-1-cloud' })],
        players: [
          makeSyncPlayer({
            id: 'evaluated',
            nome: 'Beatriz Lima',
            cloudId: 'cloud-evaluated',
            evaluationCommunityId: 'community-1',
          }),
          makeSyncPlayer({
            id: 'never-evaluated',
            nome: 'Carla Nunes',
            cloudId: 'cloud-never-evaluated',
            evaluationCommunityId: undefined,
          }),
        ],
      }),
      'owner-1',
    );

    assert.deepEqual(
      receivedPlayers.map((player) => player.id),
      ['evaluated'],
    );
  } finally {
    playerCloudService.upsert = originalUpsert;
    playerEvaluationCloudService.bulkUpsertForPlayers = originalBulkEvaluations;
  }
});

test('uploadLocalDataToCloud resolves evaluationCommunityId to the community cloud id before uploading', async () => {
  const originalUpsert = playerCloudService.upsert;
  const originalBulkEvaluations = playerEvaluationCloudService.bulkUpsertForPlayers;
  let receivedPlayers: Player[] = [];

  try {
    playerCloudService.upsert = async (local) => ({
      ...local,
      cloudId: local.cloudId || 'cloud-new',
    });
    playerEvaluationCloudService.bulkUpsertForPlayers = async (players) => {
      receivedPlayers = players;
    };

    await syncService.uploadLocalDataToCloud(
      emptyPayload({
        communities: [
          makeSharedCommunity({ id: 'community-local-1', cloudId: 'community-cloud-1' }),
        ],
        players: [
          makeSyncPlayer({
            id: 'evaluated',
            nome: 'Beatriz Lima',
            cloudId: 'cloud-evaluated',
            evaluationCommunityId: 'community-local-1',
          }),
        ],
      }),
      'owner-1',
    );

    assert.equal(receivedPlayers.length, 1);
    assert.equal(receivedPlayers[0].evaluationCommunityId, 'community-cloud-1');
  } finally {
    playerCloudService.upsert = originalUpsert;
    playerEvaluationCloudService.bulkUpsertForPlayers = originalBulkEvaluations;
  }
});

test('uploadLocalDataToCloud excludes players whose evaluation community has not synced yet', async () => {
  const originalUpsert = playerCloudService.upsert;
  const originalBulkEvaluations = playerEvaluationCloudService.bulkUpsertForPlayers;
  let receivedPlayers: Player[] = [];

  try {
    playerCloudService.upsert = async (local) => ({
      ...local,
      cloudId: local.cloudId || 'cloud-new',
    });
    playerEvaluationCloudService.bulkUpsertForPlayers = async (players) => {
      receivedPlayers = players;
    };

    await syncService.uploadLocalDataToCloud(
      emptyPayload({
        // Nenhuma comunidade correspondente em `communities`: simula uma
        // comunidade que ainda não sincronizou (sem cloudId conhecido).
        communities: [],
        players: [
          makeSyncPlayer({
            id: 'pending-community',
            nome: 'Carla Nunes',
            cloudId: 'cloud-pending-community',
            evaluationCommunityId: 'community-not-synced',
          }),
        ],
      }),
      'owner-1',
    );

    assert.deepEqual(receivedPlayers, []);
  } finally {
    playerCloudService.upsert = originalUpsert;
    playerEvaluationCloudService.bulkUpsertForPlayers = originalBulkEvaluations;
  }
});

test('aggregatePlayerEvaluations output is unaffected by communityId on input evaluations (regression guard)', () => {
  const baseEvaluation: PlayerEvaluation = {
    id: 'eval-1',
    playerId: 'player-1',
    attributes: { ...baseAttributes, saque: 8, ataque: 2 },
    communityId: 'community-1',
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
  };

  const evaluationWithoutCommunityId: PlayerEvaluation = {
    ...baseEvaluation,
    communityId: undefined as unknown as string,
  };

  const withCommunityId = aggregatePlayerEvaluations([baseEvaluation], baseAttributes);
  const withoutCommunityId = aggregatePlayerEvaluations(
    [evaluationWithoutCommunityId],
    baseAttributes,
  );

  assert.deepEqual(withCommunityId, withoutCommunityId);
});
