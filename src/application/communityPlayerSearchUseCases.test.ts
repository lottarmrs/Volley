import test from 'node:test';
import assert from 'node:assert/strict';
import {
  linkCommunityPlayerByUsernameCommand,
  searchPlayerByUsernameQuery,
} from './communityPlayerSearchUseCases';
import { makePlayer } from '../test/fixtures';

test('searchPlayerByUsernameQuery trims leading at-sign before gateway lookup', async () => {
  let searched = '';
  const result = await searchPlayerByUsernameQuery('@ana.silva ', {
    findByUsername: async (username) => {
      searched = username;
      return { cloudId: 'cloud-player-1', username, name: 'Ana Silva' };
    },
    fetchByCloudId: async () => null,
    linkPlayer: async () => undefined,
  });

  assert.equal(result.ok, true);
  assert.equal(searched, 'ana.silva');
});

test('searchPlayerByUsernameQuery rejects empty usernames', async () => {
  const result = await searchPlayerByUsernameQuery(' @ ', {
    findByUsername: async () => assert.fail('empty username should not call gateway'),
    fetchByCloudId: async () => null,
    linkPlayer: async () => undefined,
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal((result.error as any).code, 'invalid_input');
});

test('linkCommunityPlayerByUsernameCommand links cloud player and returns local community membership', async () => {
  const player = makePlayer('player-1', {
    cloudId: 'cloud-player-1',
    communityIds: ['community-other'],
  });
  const linked: Array<{ communityCloudId: string; playerCloudId: string; ownerId: string }> = [];

  const result = await linkCommunityPlayerByUsernameCommand(
    {
      communityId: 'community-1',
      communityCloudId: 'cloud-community-1',
      playerCloudId: 'cloud-player-1',
      currentUserId: 'user-1',
    },
    {
      findByUsername: async () => null,
      linkPlayer: async (communityCloudId, playerCloudId, ownerId) => {
        linked.push({ communityCloudId, playerCloudId, ownerId });
      },
      fetchByCloudId: async () => player,
    },
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(linked, [
    {
      communityCloudId: 'cloud-community-1',
      playerCloudId: 'cloud-player-1',
      ownerId: 'user-1',
    },
  ]);
  assert.equal(result.value.linkedPlayer?.id, 'player-1');
  assert.deepEqual(result.value.linkedPlayer?.communityIds, ['community-other', 'community-1']);
});

test('linkCommunityPlayerByUsernameCommand rejects anonymous users', async () => {
  const result = await linkCommunityPlayerByUsernameCommand(
    {
      communityId: 'community-1',
      communityCloudId: 'cloud-community-1',
      playerCloudId: 'cloud-player-1',
      currentUserId: null,
    },
    {
      findByUsername: async () => null,
      linkPlayer: async () => assert.fail('anonymous link should not call gateway'),
      fetchByCloudId: async () => null,
    },
  );

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal((result.error as any).code, 'not_authenticated');
});
