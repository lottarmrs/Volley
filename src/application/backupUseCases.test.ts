import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildBackupFileName,
  buildBackupPayload,
  buildImportedBackupPersistencePlan,
  prepareImportedBackup,
} from './backupUseCases';
import { makePlayer, makeSession } from '../test/fixtures';
import type { Championship, ChampionshipRound, ChampionshipTeam } from '../types';

test('buildBackupFileName uses the export calendar date', () => {
  const fileName = buildBackupFileName(new Date('2026-07-17T15:45:00.000Z'));

  assert.equal(fileName, 'panelinha_backup_2026-07-17.json');
});

test('buildBackupPayload includes operational data and local resume metadata', () => {
  const player = makePlayer('player-1');
  const session = makeSession('session-1');
  const championship: Championship = {
    id: 'champ-1',
    communityId: 'community-1',
    name: 'Liga',
    format: 'round_robin',
    classificationPoints: { win: 3, loss: 0 },
    recurrenceRule: { daysOfWeek: [2], time: '20:00', startDate: '2026-08-04' },
    createdAt: '2026-07-26T00:00:00.000Z',
    updatedAt: '2026-07-26T00:00:00.000Z',
  };
  const championshipTeam: ChampionshipTeam = {
    id: 'champ-team-1',
    championshipId: championship.id,
    name: 'Aurora',
    playerIds: ['player-1'],
  };
  const championshipRound: ChampionshipRound = {
    id: 'round-1',
    championshipId: championship.id,
    round: 1,
    teamAId: 'champ-team-1',
    teamBId: 'champ-team-2',
    scheduledDate: '2026-08-04T20:00',
    skipped: false,
  };
  const payload = buildBackupPayload({
    players: [player],
    sessions: [session],
    teams: [],
    games: [],
    pointEvents: [],
    gameReports: [],
    sessionReports: [],
    communities: [],
    communityPresence: [],
    whatsAppListTemplates: [],
    whatsAppListDrafts: [],
    communityRules: [],
    championships: [championship],
    championshipTeams: [championshipTeam],
    championshipRounds: [championshipRound],
    activeSession: session,
    sessionDraft: null,
    lastSelectedPlayerIds: ['player-1'],
    lastSessionConfig: { type: 'free_play' },
  });

  assert.deepEqual(payload.players, [player]);
  assert.deepEqual(payload.sessions, [session]);
  assert.deepEqual(payload.championships, [championship]);
  assert.deepEqual(payload.championshipTeams, [championshipTeam]);
  assert.deepEqual(payload.championshipRounds, [championshipRound]);
  assert.equal(payload.activeSession, session);
  assert.equal(payload.sessionDraft, null);
  assert.deepEqual(payload.lastSelectedPlayerIds, ['player-1']);
  assert.deepEqual(payload.lastSessionConfig, { type: 'free_play' });
});

test('prepareImportedBackup sanitizes cloud metadata and normalizes legacy session records', () => {
  const result = prepareImportedBackup({
    players: [{ id: 'player-1', nome: 'Ana', cloudId: 'cloud-player-1' }],
    communities: [{ id: 'community-1', name: 'Domingo', cloudId: 'cloud-community-1' }],
    sessions: [{ id: 'session-1', type: 'championship', config: null }],
    games: [{ id: 'game-1', sessionId: 'session-1', type: 'championship' }],
    activeSession: { id: 'session-2', type: 'championship', config: null },
    sessionDraft: {
      session: { id: 'session-3', type: 'championship', config: null },
    },
  }) as any;

  assert.equal(result.players[0].cloudId, undefined);
  assert.equal(result.communities[0].cloudId, undefined);
  assert.equal(result.sessions[0].type, 'tournament');
  assert.equal(result.games[0].type, 'tournament');
  assert.equal(result.activeSession.type, 'tournament');
  assert.equal(result.sessionDraft.session.type, 'tournament');
});

test('prepareImportedBackup keeps the existing import defaults for omitted collections', () => {
  const result = prepareImportedBackup({ players: [] }) as any;

  assert.deepEqual(result.players, []);
  assert.deepEqual(result.sessions, []);
  assert.deepEqual(result.teams, []);
  assert.deepEqual(result.communityPresence, []);
  assert.equal(result.activeSession, undefined);
  assert.equal(result.sessionDraft, undefined);
});

test('buildImportedBackupPersistencePlan distinguishes save clear and ignore actions', () => {
  const plan = buildImportedBackupPersistencePlan({
    sessionDraft: { session: makeSession('session-1') } as any,
    lastSelectedPlayerIds: null,
  });

  assert.equal(plan.sessionDraft.kind, 'save');
  assert.equal(plan.lastSelectedPlayerIds.kind, 'clear');
  assert.equal(plan.lastSessionConfig.kind, 'ignore');
});
