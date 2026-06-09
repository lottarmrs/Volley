import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeEntityLists } from './syncService';
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
    { getId: item => item.id },
  );

  assert.equal(merged.id, 'session-local');
  assert.equal(merged.cloudId, 'session-cloud');
  assert.equal(merged.syncStatus, 'pending');
});

test('mergeEntityLists accepts newer cloud records but preserves local relationship ids', () => {
  const [merged] = mergeEntityLists<TestEntity>(
    [{
      id: 'game-local',
      cloudId: 'game-cloud',
      sessionId: 'session-local',
      updatedAt: '2026-06-09T10:00:00.000Z',
      scoreA: 1,
    }],
    [{
      id: 'game-from-cloud-local-id',
      cloudId: 'game-cloud',
      sessionId: 'session-from-cloud-local-id',
      updatedAt: '2026-06-09T12:00:00.000Z',
      scoreA: 2,
    }],
    { getId: item => item.id },
  );

  assert.equal(merged.id, 'game-local');
  assert.equal(merged.sessionId, 'session-local');
  assert.equal(merged.scoreA, 2);
  assert.equal(merged.syncStatus, 'synced');
});

test('mergeEntityLists propagates soft deletes for cloud-backed local records', () => {
  const [merged] = mergeEntityLists<TestEntity>(
    [{
      id: 'point-local',
      cloudId: 'point-cloud',
      sessionId: 'session-local',
      deletedAt: '2026-06-09T12:00:00.000Z',
      updatedAt: '2026-06-09T12:00:00.000Z',
    }],
    [{
      id: 'point-local',
      cloudId: 'point-cloud',
      sessionId: 'session-local',
      updatedAt: '2026-06-09T11:00:00.000Z',
    }],
    { getId: item => item.id },
  );

  assert.equal(merged.deletedAt, '2026-06-09T12:00:00.000Z');
  assert.equal(merged.syncStatus, 'pending');
});

test('mergeEntityLists adds cloud-only records to the local payload', () => {
  const merged = mergeEntityLists<TestEntity>(
    [{ id: 'session-local', updatedAt: '2026-06-09T10:00:00.000Z' }],
    [{ id: 'session-cloud-local-id', cloudId: 'session-cloud', updatedAt: '2026-06-09T12:00:00.000Z' }],
    { getId: item => item.id },
  );

  assert.equal(merged.length, 2);
  assert.equal(merged[1].cloudId, 'session-cloud');
});
