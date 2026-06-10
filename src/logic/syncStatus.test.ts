import test from 'node:test';
import assert from 'node:assert/strict';
import { countPendingChanges } from './syncStatus';

test('countPendingChanges sums pending records across collections', () => {
  const total = countPendingChanges([
    [{ syncStatus: 'pending' }, { syncStatus: 'synced' }, { syncStatus: 'pending' }],
    [{ syncStatus: 'synced' }],
    [{ syncStatus: 'pending' }],
  ]);
  assert.equal(total, 3);
});

test('countPendingChanges ignores synced, errored and undefined statuses', () => {
  const total = countPendingChanges([[{ syncStatus: 'synced' }, { syncStatus: 'error' }, {}], []]);
  assert.equal(total, 0);
});

test('countPendingChanges tolerates empty input', () => {
  assert.equal(countPendingChanges([]), 0);
});
