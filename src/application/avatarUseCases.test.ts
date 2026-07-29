import test from 'node:test';
import assert from 'node:assert/strict';
import {
  listAvatarApprovalQueueQuery,
  proposePlayerAvatarCommand,
  reviewPlayerAvatarCommand,
} from './avatarUseCases';
import type { PlayerAvatarProposal } from '../types';

const imageFile = new File(['image-bytes'], 'avatar.png', { type: 'image/png' });

const proposal = (input: Partial<PlayerAvatarProposal> = {}): PlayerAvatarProposal => ({
  id: 'proposal-1',
  playerCloudId: 'player-cloud-1',
  proposedBy: 'user-1',
  imageUrl: 'https://example.com/avatar.webp',
  status: 'pending',
  createdAt: '2026-07-17T00:00:00.000Z',
  ...input,
});

test('proposePlayerAvatarCommand uploads through the gateway', async () => {
  const result = await proposePlayerAvatarCommand(
    { playerCloudId: 'player-cloud-1', file: imageFile },
    {
      proposeAvatar: async (playerCloudId, file) => ({
        proposalId: `proposal-${playerCloudId}`,
        imageUrl: `uploaded://${file.name}`,
        applied: true,
      }),
      listMyApprovalQueue: async () => [],
      approve: async () => undefined,
      reject: async () => undefined,
    },
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.imageUrl, 'uploaded://avatar.png');
  assert.equal(result.value.applied, true);
});

test('proposePlayerAvatarCommand rejects missing cloud player ids', async () => {
  const result = await proposePlayerAvatarCommand(
    { playerCloudId: undefined, file: imageFile },
    {
      proposeAvatar: async () => assert.fail('missing cloud id should not call gateway'),
      listMyApprovalQueue: async () => [],
      approve: async () => undefined,
      reject: async () => undefined,
    },
  );

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal((result.error as any).code, 'invalid_input');
});

test('listAvatarApprovalQueueQuery returns queue items', async () => {
  const result = await listAvatarApprovalQueueQuery({
    proposeAvatar: async () => ({ proposalId: 'unused', imageUrl: '', applied: false }),
    listMyApprovalQueue: async () => [{ ...proposal(), playerName: 'Ana Silva' }],
    approve: async () => undefined,
    reject: async () => undefined,
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.items[0].playerName, 'Ana Silva');
});

test('reviewPlayerAvatarCommand routes approve and reject actions', async () => {
  const actions: string[] = [];
  const gateway = {
    proposeAvatar: async () => ({ proposalId: 'unused', imageUrl: '', applied: false }),
    listMyApprovalQueue: async () => [],
    approve: async (proposalId: string) => {
      actions.push(`approve:${proposalId}`);
    },
    reject: async (proposalId: string) => {
      actions.push(`reject:${proposalId}`);
    },
  };

  await reviewPlayerAvatarCommand({ proposalId: 'proposal-1', action: 'approve' }, gateway);
  await reviewPlayerAvatarCommand({ proposalId: 'proposal-2', action: 'reject' }, gateway);

  assert.deepEqual(actions, ['approve:proposal-1', 'reject:proposal-2']);
});

test('reviewPlayerAvatarCommand rejects missing proposal ids', async () => {
  const result = await reviewPlayerAvatarCommand(
    { proposalId: ' ', action: 'approve' },
    {
      proposeAvatar: async () => ({ proposalId: 'unused', imageUrl: '', applied: false }),
      listMyApprovalQueue: async () => [],
      approve: async () => assert.fail('invalid proposal should not call gateway'),
      reject: async () => assert.fail('invalid proposal should not call gateway'),
    },
  );

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal((result.error as any).code, 'invalid_input');
});
