import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocalPresence, upsertLocalPresence } from './localCommunityPresenceUseCases';
import type { CommunityPresence } from '../types';

const now = '2026-07-20T12:00:00.000Z';
const today = '2026-07-20';

function presence(
  communityId: string,
  date: string,
  items: CommunityPresence['items'] = [],
): CommunityPresence {
  return {
    communityId,
    date,
    items,
    updatedAt: now,
    syncStatus: 'synced',
  };
}

test('createLocalPresence creates an empty pending presence for the given date', () => {
  const result = createLocalPresence({
    communityId: 'community-1',
    date: today,
    now,
  });

  assert.deepEqual(result, {
    communityId: 'community-1',
    date: today,
    items: [],
    updatedAt: now,
    syncStatus: 'pending',
  });
});

test('upsertLocalPresence replaces only the same community and date as pending', () => {
  const next = {
    ...presence('community-1', today, [{ playerId: 'player-1', status: 'present' }]),
    updatedAt: '2026-07-20T11:00:00.000Z',
  };

  const result = upsertLocalPresence({
    records: [
      presence('community-1', '2026-07-19', [{ playerId: 'old', status: 'present' }]),
      presence('community-1', today, [{ playerId: 'player-1', status: 'absent' }]),
      presence('community-2', today, [{ playerId: 'other', status: 'present' }]),
    ],
    presence: next,
    now,
  });

  assert.equal(result.length, 3);
  assert.deepEqual(result[0].items, [{ playerId: 'old', status: 'present' }]);
  assert.deepEqual(result[1], {
    ...next,
    updatedAt: now,
    syncStatus: 'pending',
  });
  assert.equal(result[2].communityId, 'community-2');
});

test('upsertLocalPresence appends a missing presence as pending', () => {
  const result = upsertLocalPresence({
    records: [presence('community-1', '2026-07-19')],
    presence: presence('community-1', today),
    now,
  });

  assert.equal(result.length, 2);
  assert.equal(result[1].date, today);
  assert.equal(result[1].syncStatus, 'pending');
});
