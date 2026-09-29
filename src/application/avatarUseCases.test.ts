import test from 'node:test';
import assert from 'node:assert/strict';
import { proposePlayerAvatarCommand } from './avatarUseCases';

const imageFile = new File(['image-bytes'], 'avatar.png', { type: 'image/png' });

test('proposePlayerAvatarCommand uploads through the gateway', async () => {
  const result = await proposePlayerAvatarCommand(
    { playerCloudId: 'player-cloud-1', file: imageFile },
    {
      proposeAvatar: async (playerCloudId, file) => ({
        proposalId: `proposal-${playerCloudId}`,
        imageUrl: `uploaded://${file.name}`,
        applied: true,
      }),
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
    },
  );

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal((result.error as any).code, 'invalid_input');
});
