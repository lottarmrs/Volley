import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeCommunities,
  normalizeGames,
  normalizeSessionDraft,
  normalizeSessions,
  normalizeTournamentConfig,
  sanitizeImportedBackup,
} from './migrations';

test('normalizeTournamentConfig fills modern tournament defaults', () => {
  const normalized = normalizeTournamentConfig({ roundTrip: true });

  assert.equal(normalized.type, 'tournament');
  assert.equal(normalized.format, 'double_round_robin');
  assert.equal(normalized.victoryRule, 'direct_3');
  assert.deepEqual(normalized.classificationPoints, {
    win: 3,
    loss: 0,
    walkoverWin: 3,
    walkoverLoss: 0,
  });
});

test('normalizeSessions and normalizeGames migrate legacy championship records', () => {
  const [session] = normalizeSessions([
    {
      id: 'session-1',
      type: 'championship',
      config: { type: 'championship', maxPoints: 21 },
    },
  ]);
  const [game] = normalizeGames([{ id: 'game-1', type: 'championship' }]);

  assert.equal(session.type, 'tournament');
  assert.equal(session.communityId, null);
  assert.equal(session.config?.type, 'tournament');
  assert.equal(session.config?.maxPoints, 21);
  assert.equal(game.type, 'tournament');
});

test('normalizeSessionDraft and normalizeCommunities handle missing legacy fields', () => {
  const draft = normalizeSessionDraft({
    session: {
      id: 'session-draft',
      type: 'tournament',
      config: {},
    },
  });
  const [community] = normalizeCommunities([{ name: 'Terça do Vôlei' }]);

  assert.equal(draft.session.type, 'tournament');
  assert.equal(draft.session.config.format, 'round_robin');
  assert.equal(community.name, 'Terça do Vôlei');
  assert.equal(community.defaultFormat, 'free_play');
  assert.equal(community.archived, false);
});

test('normalizeCommunities preserves cloud metadata and sync state', () => {
  const [community] = normalizeCommunities([
    {
      id: 'community-local',
      name: 'Quinta Forte',
      cloudId: '4da17d42-0532-4fde-987e-a503827b57ab',
      cloudOwnerId: 'owner-cloud-id',
      visibility: 'public',
      joinCode: 'ABC123',
      syncStatus: 'synced',
      lastSyncedAt: '2026-06-24T18:00:00.000Z',
      deletedAt: '2026-06-25T10:00:00.000Z',
      createdAt: '2026-06-20T10:00:00.000Z',
      updatedAt: '2026-06-24T17:59:00.000Z',
    },
  ]);

  assert.equal(community.cloudId, '4da17d42-0532-4fde-987e-a503827b57ab');
  assert.equal(community.cloudOwnerId, 'owner-cloud-id');
  assert.equal(community.visibility, 'public');
  assert.equal(community.joinCode, 'ABC123');
  assert.equal(community.syncStatus, 'synced');
  assert.equal(community.lastSyncedAt, '2026-06-24T18:00:00.000Z');
  assert.equal(community.deletedAt, '2026-06-25T10:00:00.000Z');
  assert.equal(community.defaultFormat, 'free_play');
});

test('normalizers return empty arrays for invalid collection inputs', () => {
  assert.deepEqual(normalizeSessions(null as unknown as []), []);
  assert.deepEqual(normalizeGames(undefined as unknown as []), []);
  assert.deepEqual(normalizeCommunities('bad' as unknown as []), []);
});

test('sanitizeImportedBackup recursively removes cloudId/lastSyncedAt and sets syncStatus to pending', () => {
  const input = {
    players: [
      {
        id: 'player-1',
        nome: 'Carol Mendes',
        cloudId: 'dd346673-f27b-4a26-ae54-1b0dd511728d',
        syncStatus: 'synced',
        lastSyncedAt: '2026-06-10T21:02:10.391Z',
      },
    ],
    activeSession: {
      id: 'session-1',
      cloudId: 'some-uuid',
      syncStatus: 'synced',
      lastSyncedAt: 'yesterday',
    },
  };

  const sanitized = sanitizeImportedBackup(input);

  assert.deepEqual(sanitized, {
    players: [
      {
        id: 'player-1',
        nome: 'Carol Mendes',
        syncStatus: 'pending',
      },
    ],
    activeSession: {
      id: 'session-1',
      syncStatus: 'pending',
    },
  });
});
