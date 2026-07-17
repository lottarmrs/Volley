import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildBackupFileName,
  buildBackupPayload,
  buildImportedBackupPersistencePlan,
  prepareImportedBackup,
} from './backupUseCases';
import { makePlayer, makeSession } from '../test/fixtures';

test('buildBackupFileName uses the export calendar date', () => {
  const fileName = buildBackupFileName(new Date('2026-07-17T15:45:00.000Z'));

  assert.equal(fileName, 'panelinha_backup_2026-07-17.json');
});

test('buildBackupPayload includes operational data and local resume metadata', () => {
  const player = makePlayer('player-1');
  const session = makeSession('session-1');
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
    activeSession: session,
    sessionDraft: null,
    lastSelectedPlayerIds: ['player-1'],
    lastSessionConfig: { type: 'free_play' },
  });

  assert.deepEqual(payload.players, [player]);
  assert.deepEqual(payload.sessions, [session]);
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
