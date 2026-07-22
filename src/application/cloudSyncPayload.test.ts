import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildLocalSyncPayload,
  normalizeCloudSyncResultPayload,
  type CloudSyncPayloadCollections,
} from './cloudSyncPayload';

const collections = (
  overrides: Partial<CloudSyncPayloadCollections> = {},
): CloudSyncPayloadCollections => ({
  communities: [],
  players: [],
  rules: [],
  templates: [],
  drafts: [],
  sessions: [],
  teams: [],
  games: [],
  pointEvents: [],
  gameReports: [],
  sessionReports: [],
  presenceRecords: [],
  linkProposals: [],
  ...overrides,
});

test('buildLocalSyncPayload preserves all sync collections for cloud commands', () => {
  const payload = buildLocalSyncPayload(
    collections({
      communities: [{ id: 'community-1', name: 'Panelinha' } as never],
      players: [{ id: 'player-1', nome: 'Ana' } as never],
      linkProposals: [{ id: 'proposal-1', playerId: 'player-1' } as never],
    }),
  );

  assert.deepEqual(
    {
      communities: payload.communities.map((item) => item.id),
      players: payload.players.map((item) => item.id),
      linkProposals: payload.linkProposals.map((item) => item.id),
    },
    {
      communities: ['community-1'],
      players: ['player-1'],
      linkProposals: ['proposal-1'],
    },
  );
});

test('normalizeCloudSyncResultPayload migrates legacy session and game records before applying them', () => {
  const payload = buildLocalSyncPayload(
    collections({
      sessions: [{ id: 'session-1', type: 'championship', config: { type: 'championship' } } as never],
      games: [{ id: 'game-1', type: 'championship' } as never],
    }),
  );

  const normalized = normalizeCloudSyncResultPayload(payload);

  assert.equal(normalized.sessions[0].type, 'tournament');
  assert.equal(normalized.games[0].type, 'tournament');
});
