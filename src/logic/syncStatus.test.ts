import test from 'node:test';
import assert from 'node:assert/strict';
import { countPendingChanges } from './syncStatus';

test('countPendingChanges sums local and pending records across collections', () => {
  const total = countPendingChanges([
    [{ syncStatus: 'pending' }, { syncStatus: 'synced' }, { syncStatus: 'local' }],
    [{ syncStatus: 'synced' }],
    [{ syncStatus: 'pending' }],
  ]);
  assert.equal(total, 3);
});

test('countPendingChanges ignores synced and errored statuses', () => {
  const total = countPendingChanges([[{ syncStatus: 'synced' }, { syncStatus: 'error' }], []]);
  assert.equal(total, 0);
});

// Um registro sem `syncStatus` e sem `cloudId` nunca subiu: e o convidado criado
// pelo GuestPlayerModal. Contar como sincronizado derrubava a guarda de
// planStartupCloudDownload e o download de startup apagava o atleta.
test('countPendingChanges counts records with no status and no cloudId as pending', () => {
  assert.equal(countPendingChanges([[{}, { cloudId: null }]]), 2);
});

test('countPendingChanges ignores statusless records that already have a cloudId', () => {
  assert.equal(countPendingChanges([[{ cloudId: 'abc' }]]), 0);
});

test('countPendingChanges tolerates empty input', () => {
  assert.equal(countPendingChanges([]), 0);
});
