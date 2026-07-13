import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareImportedBackup } from './backupUseCases';

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
