import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDefaultLocalCommunityRules,
  removeLocalCommunityRules,
  saveLocalCommunityRules,
  selectVisibleCommunityRules,
} from './localCommunityRulesUseCases';
import type { Community, CommunityRules } from '../types';

const now = '2026-07-20T12:00:00.000Z';

function community(input: Partial<Community> = {}): Community {
  return {
    id: input.id ?? 'community-1',
    name: input.name ?? 'Domingo',
    description: '',
    defaultLocation: input.defaultLocation ?? 'Quadra A',
    defaultDay: input.defaultDay ?? 'domingo',
    defaultStartTime: input.defaultStartTime ?? '08:00',
    defaultEndTime: input.defaultEndTime ?? '11:00',
    defaultFormat: input.defaultFormat ?? 'free_play',
    color: 'primary',
    icon: 'volleyball',
    archived: false,
    createdAt: now,
    updatedAt: now,
    ...input,
  };
}

function rules(input: Partial<CommunityRules> = {}): CommunityRules {
  return {
    communityId: input.communityId ?? 'community-1',
    defaultFormat: input.defaultFormat ?? 'free_play',
    defaultLocation: input.defaultLocation ?? '',
    defaultDay: input.defaultDay ?? '',
    defaultStartTime: input.defaultStartTime ?? '',
    defaultEndTime: input.defaultEndTime ?? '',
    updatedAt: input.updatedAt ?? now,
    ...input,
  };
}

test('createDefaultLocalCommunityRules mirrors community defaults', () => {
  const result = createDefaultLocalCommunityRules({
    community: community({ defaultFormat: 'tournament' }),
    now,
  });

  assert.equal(result.communityId, 'community-1');
  assert.equal(result.defaultFormat, 'tournament');
  assert.equal(result.defaultLocation, 'Quadra A');
  assert.equal(result.defaultDay, 'domingo');
  assert.equal(result.defaultStartTime, '08:00');
  assert.equal(result.defaultEndTime, '11:00');
  assert.equal(result.freePlay?.teamCount, 3);
  assert.equal(result.tournament?.format, 'round_robin');
  assert.equal(result.updatedAt, now);
});

test('saveLocalCommunityRules updates existing rules as pending', () => {
  const result = saveLocalCommunityRules({
    rules: [rules({ communityId: 'community-1', defaultLocation: 'Antiga' })],
    next: rules({ communityId: 'community-1', defaultLocation: 'Nova' }),
    allowed: true,
    now,
  });

  assert.equal(result.length, 1);
  assert.equal(result[0].defaultLocation, 'Nova');
  assert.equal(result[0].syncStatus, 'pending');
  assert.equal(result[0].updatedAt, now);
});

test('saveLocalCommunityRules appends new rules as local', () => {
  const result = saveLocalCommunityRules({
    rules: [rules({ communityId: 'community-1' })],
    next: rules({ communityId: 'community-2' }),
    allowed: true,
    now,
  });

  assert.equal(result.length, 2);
  assert.equal(result[1].communityId, 'community-2');
  assert.equal(result[1].syncStatus, 'local');
});

test('saveLocalCommunityRules denies unauthorized saves', () => {
  assert.throws(
    () =>
      saveLocalCommunityRules({
        rules: [],
        next: rules(),
        allowed: false,
        now,
      }),
    /PERMISSION_DENIED/,
  );
});

test('removeLocalCommunityRules removes only the requested community', () => {
  const result = removeLocalCommunityRules({
    rules: [rules({ communityId: 'community-1' }), rules({ communityId: 'community-2' })],
    communityId: 'community-1',
  });

  assert.deepEqual(
    result.map((item) => item.communityId),
    ['community-2'],
  );
});

test('selectVisibleCommunityRules hides deleted rules', () => {
  const result = selectVisibleCommunityRules([
    rules({ communityId: 'visible' }),
    rules({ communityId: 'deleted', deletedAt: now }),
  ]);

  assert.deepEqual(
    result.map((item) => item.communityId),
    ['visible'],
  );
});
