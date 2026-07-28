import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeIdempotencyKey,
  validateOutboxPayload,
  pendingOutboxTransition,
  type OutboxEntry,
} from './outboxClient';

test('computeIdempotencyKey is deterministic for the same operation+payload+user', () => {
  const a = computeIdempotencyKey('session.conclude', { sessionId: 's1' }, 'user-a');
  const b = computeIdempotencyKey('session.conclude', { sessionId: 's1' }, 'user-a');
  assert.equal(a, b);
  assert.match(a, /^[0-9a-f]{64}$/i);
});

test('computeIdempotencyKey differs across users, operations, or payloads', () => {
  const base = computeIdempotencyKey('session.conclude', { sessionId: 's1' }, 'user-a');
  assert.notEqual(base, computeIdempotencyKey('session.conclude', { sessionId: 's1' }, 'user-b'));
  assert.notEqual(base, computeIdempotencyKey('point.register', { sessionId: 's1' }, 'user-a'));
  assert.notEqual(base, computeIdempotencyKey('session.conclude', { sessionId: 's2' }, 'user-a'));
});

test('validateOutboxPayload accepts known operation shapes and rejects unknown/invalid', () => {
  assert.equal(validateOutboxPayload('session.conclude', { sessionId: 's-1' }).ok, true);
  assert.equal(validateOutboxPayload('session.conclude', { sessionId: '' }).ok, false);
  assert.equal(validateOutboxPayload('session.conclude', {}).ok, false);
  assert.equal(validateOutboxPayload('unknown.op', { anything: true }).ok, false);
});

test('pendingOutboxTransition moves pending_upload to syncing and back on recoverable failure', () => {
  const base: OutboxEntry = {
    id: 'e-1', authUserId: 'u-1', operation: 'session.conclude', payload: { sessionId: 's-1' },
    idempotencyKey: 'k-1', status: 'pending_upload', attempts: 0, lastError: null,
    createdAt: '2026-07-27T00:00:00Z', updatedAt: '2026-07-27T00:00:00Z',
  };
  const syncing = pendingOutboxTransition(base, 'markSyncing');
  assert.equal(syncing.status, 'syncing');
  assert.equal(syncing.attempts, 0);
  const failed = pendingOutboxTransition(syncing, 'markRecoverableError', 'network down');
  assert.equal(failed.status, 'recoverable_error');
  assert.equal(failed.attempts, 1);
  assert.equal(failed.lastError, 'network down');
  const retry = pendingOutboxTransition(failed, 'markRetryReady');
  assert.equal(retry.status, 'pending_upload');
  assert.equal(retry.attempts, 1);
});

test('pendingOutboxTransition keeps entries frozen after 5 attempts', () => {
  const base: OutboxEntry = {
    id: 'e-1', authUserId: 'u-1', operation: 'session.conclude', payload: { sessionId: 's-1' },
    idempotencyKey: 'k-1', status: 'recoverable_error', attempts: 5, lastError: 'persistent',
    createdAt: '2026-07-27T00:00:00Z', updatedAt: '2026-07-27T00:31:00Z',
  };
  const retry = pendingOutboxTransition(base, 'markRetryReady');
  assert.equal(retry.status, 'recoverable_error');
  assert.equal(retry.attempts, 5);
});
