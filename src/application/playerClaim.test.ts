import test from 'node:test';
import assert from 'node:assert/strict';
import { applyClaimToPlayers } from './playerClaim';
import { makePlayer } from '../test/fixtures';

const now = '2026-07-22T00:00:00Z';

test('applyClaimToPlayers preserves canonical username and archives legacy copy', () => {
  const canonical = makePlayer('canonical-local', {
    cloudId: 'canonical-cloud',
    username: 'ana',
    userId: 'canonical-user',
  });
  const legacy = makePlayer('legacy-local', {
    cloudId: 'legacy-cloud',
    username: 'legacy-ana',
    userId: 'legacy-user',
  });

  const result = applyClaimToPlayers(
    [canonical, legacy],
    {
      claimId: 'claim-1',
      canonicalPlayerId: 'canonical-cloud',
      legacyPlayerId: 'legacy-cloud',
      legacyLocalId: 'legacy-local',
    },
    now,
  );

  assert.equal(result.find((player) => player.cloudId === 'canonical-cloud'), canonical);
  assert.equal(result.find((player) => player.cloudId === 'canonical-cloud')?.username, 'ana');
  assert.equal(result.find((player) => player.cloudId === 'canonical-cloud')?.userId, 'canonical-user');
  assert.deepEqual(result.find((player) => player.id === 'legacy-local'), {
    ...legacy,
    ativo: false,
    deletedAt: now,
    syncStatus: 'synced',
    lastSyncedAt: now,
    updatedAt: now,
    username: undefined,
    userId: undefined,
  });
});

test('applyClaimToPlayers falls back to legacyLocalId before legacy cloud id compatibility', () => {
  const canonical = makePlayer('canonical-local', { cloudId: 'canonical-cloud', username: 'ana' });
  const legacy = makePlayer('legacy-local', {
    cloudId: 'stale-legacy-cloud',
    username: 'legacy-ana',
  });

  const result = applyClaimToPlayers(
    [canonical, legacy],
    {
      claimId: 'claim-1',
      canonicalPlayerId: 'canonical-cloud',
      legacyPlayerId: 'legacy-cloud',
      legacyLocalId: 'legacy-local',
    },
    now,
  );

  assert.equal(result[0], canonical);
  assert.equal(result[1].id, 'legacy-local');
  assert.equal(result[1].deletedAt, now);
});

test('applyClaimToPlayers preserves players when canonical and legacy ids collide', () => {
  const canonical = makePlayer('canonical-local', { cloudId: 'canonical-cloud', username: 'ana' });
  const legacy = makePlayer('legacy-local', { cloudId: 'legacy-cloud', username: 'legacy-ana' });

  const result = applyClaimToPlayers(
    [canonical, legacy],
    {
      claimId: 'claim-1',
      canonicalPlayerId: 'canonical-cloud',
      legacyPlayerId: 'canonical-cloud',
      legacyLocalId: 'legacy-local',
    },
    now,
  );

  assert.equal(result[0], canonical);
  assert.equal(result[1], legacy);
});

test('applyClaimToPlayers does not archive canonical player when aliases resolve to it', () => {
  const canonical = makePlayer('legacy-local', { cloudId: 'canonical-cloud', username: 'ana' });
  const legacy = makePlayer('other-local', { cloudId: 'stale-legacy-cloud', username: 'legacy-ana' });

  const result = applyClaimToPlayers(
    [canonical, legacy],
    {
      claimId: 'claim-1',
      canonicalPlayerId: 'canonical-cloud',
      legacyPlayerId: 'legacy-cloud',
      legacyLocalId: 'legacy-local',
    },
    now,
  );

  assert.equal(result[0], canonical);
  assert.equal(result[1], legacy);
});
