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
import { communityCloudService } from './communityCloudService';
import { communityPlayerCloudService } from './communityPlayerCloudService';
import { communityRulesCloudService } from './communityRulesCloudService';
import { whatsappTemplateCloudService } from './whatsappTemplateCloudService';
import {
  CloudSyncStatus,
  Community,
  CommunityPresence,
  Player,
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
    ...overrides,
  };
}

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

