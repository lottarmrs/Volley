import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeEntityLists, computeStaleRelationIds, isUuid } from './syncService';
import { CloudSyncStatus } from '../../types';

interface TestEntity {
  id: string;
  cloudId?: string;
  sessionId?: string;
  updatedAt?: string;
  deletedAt?: string;
  syncStatus?: CloudSyncStatus;
  scoreA?: number;
}

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
  const owned = [
    { id: 'rel-other-device', community_id: 'comm-9', player_id: 'player-2' },
  ];
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
  assert.equal(isUuid('community-123'), false);
  assert.equal(isUuid(''), false);
  assert.equal(isUuid(undefined), false);
});

