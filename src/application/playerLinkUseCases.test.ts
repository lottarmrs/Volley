import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cancelPlayerLinkCommand,
  fetchAccountPlayerLinkQuery,
  fetchAllPlayerLinkProposalsQuery,
  proposePlayerLinkCommand,
  reviewPlayerLinkCommand,
  unlinkPlayerCommand,
} from './playerLinkUseCases';
import { makePlayer } from '../test/fixtures';
import type { PlayerLinkProposal } from '../types';

const now = '2026-01-01T12:00:00.000Z';

function proposal(overrides: Partial<PlayerLinkProposal> = {}): PlayerLinkProposal {
  return {
    id: 'proposal-1',
    playerId: 'player-1',
    playerCloudId: 'cloud-player-1',
    userId: 'user-1',
    status: 'pending',
    createdAt: now,
    syncStatus: 'synced',
    ...overrides,
  };
}

test('proposePlayerLinkCommand approves a local unlinked player without cloud IO', async () => {
  const player = makePlayer('player-1', { userId: undefined, cloudId: undefined });
  const result = await proposePlayerLinkCommand(
    {
      players: [player],
      linkProposals: [],
      currentUserId: 'user-1',
      playerId: 'player-1',
      nowIso: now,
      proposalId: 'proposal-local',
    },
    { propose: async () => assert.fail('local direct link should not call cloud') },
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.linkProposals[0].status, 'approved');
  assert.equal(result.value.players?.[0].userId, 'user-1');
});

test('proposePlayerLinkCommand preserves local pending proposal when cloud write fails', async () => {
  const player = makePlayer('player-1', { cloudId: 'cloud-player-1', cloudOwnerId: 'other' });
  const result = await proposePlayerLinkCommand(
    {
      players: [player],
      linkProposals: [],
      currentUserId: 'user-1',
      playerId: 'player-1',
      nowIso: now,
      proposalId: 'proposal-local',
    },
    {
      propose: async () => {
        throw new Error('network down');
      },
    },
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.linkProposals[0].syncStatus, 'pending');
  assert.equal(result.issues?.[0].code, 'cloud_unavailable');
});

test('proposePlayerLinkCommand returns permission error for anonymous user', async () => {
  const result = await proposePlayerLinkCommand(
    {
      players: [makePlayer('player-1')],
      linkProposals: [],
      currentUserId: null,
      playerId: 'player-1',
      nowIso: now,
      proposalId: 'proposal-local',
    },
    { propose: async () => 'cloud-proposal' },
  );

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error.kind, 'product');
  assert.equal(result.error.code, 'not_authenticated');
});

test('reviewPlayerLinkCommand approves proposal and supersedes competing pending proposals', async () => {
  const players = [makePlayer('player-1', { cloudId: 'cloud-player-1', userId: undefined })];
  const proposals = [
    proposal({ id: 'proposal-1', userId: 'user-1' }),
    proposal({ id: 'proposal-2', userId: 'other-user', status: 'pending' }),
  ];
  const result = await reviewPlayerLinkCommand(
    {
      players,
      linkProposals: proposals,
      currentUserId: 'reviewer-1',
      proposalId: 'proposal-1',
      action: 'approve',
      nowIso: now,
    },
    {
      approve: async () => undefined,
      reject: async () => undefined,
    },
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.players?.[0].userId, 'user-1');
  assert.equal(
    result.value.linkProposals.find((item) => item.id === 'proposal-1')?.status,
    'approved',
  );
  assert.equal(
    result.value.linkProposals.find((item) => item.id === 'proposal-2')?.status,
    'superseded',
  );
});

test('reviewPlayerLinkCommand keeps approved cloud proposal pending when cloud approve fails', async () => {
  const players = [makePlayer('player-1', { cloudId: 'cloud-player-1', userId: undefined })];
  const result = await reviewPlayerLinkCommand(
    {
      players,
      linkProposals: [proposal({ syncStatus: 'synced' })],
      currentUserId: 'reviewer-1',
      proposalId: 'proposal-1',
      action: 'approve',
      nowIso: now,
    },
    {
      approve: async () => {
        throw new Error('offline');
      },
    },
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.players?.[0].userId, 'user-1');
  assert.equal(result.value.linkProposals[0].status, 'approved');
  assert.equal(result.value.linkProposals[0].syncStatus, 'pending');
  assert.equal(result.issues?.[0].code, 'cloud_unavailable');
});

test('reviewPlayerLinkCommand keeps rejected cloud proposal pending when cloud reject fails', async () => {
  const players = [makePlayer('player-1', { cloudId: 'cloud-player-1', userId: undefined })];
  const result = await reviewPlayerLinkCommand(
    {
      players,
      linkProposals: [proposal({ syncStatus: 'synced' })],
      currentUserId: 'reviewer-1',
      proposalId: 'proposal-1',
      action: 'reject',
      nowIso: now,
    },
    {
      reject: async () => {
        throw new Error('offline');
      },
    },
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.linkProposals[0].status, 'rejected');
  assert.equal(result.value.linkProposals[0].syncStatus, 'pending');
  assert.equal(result.issues?.[0].code, 'cloud_unavailable');
});

test('cancelPlayerLinkCommand rejects the proposal locally and tolerates cloud failure', async () => {
  const result = await cancelPlayerLinkCommand(
    {
      linkProposals: [proposal()],
      currentUserId: 'user-1',
      proposalId: 'proposal-1',
      nowIso: now,
    },
    {
      cancel: async () => {
        throw new Error('RLS denied');
      },
    },
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.linkProposals[0].status, 'rejected');
  assert.equal(result.value.linkProposals[0].syncStatus, 'pending');
  assert.equal(result.issues?.[0].code, 'cloud_unavailable');
});

test('unlinkPlayerCommand clears player user id and reports recoverable cloud issue', async () => {
  const result = await unlinkPlayerCommand(
    {
      players: [makePlayer('player-1', { userId: 'user-1', cloudId: 'cloud-player-1' })],
      linkProposals: [proposal()],
      currentUserId: 'user-1',
      playerId: 'player-1',
      nowIso: now,
    },
    {
      unlink: async () => {
        throw new Error('offline');
      },
    },
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.players?.[0].userId, undefined);
  assert.equal(result.value.players?.[0].pendingUserLinkAction, 'unlink');
  assert.equal(result.value.linkProposals[0].status, 'superseded');
  assert.equal(result.issues?.[0].code, 'cloud_unavailable');
});

test('unlinkPlayerCommand clears unlink intent when cloud unlink succeeds', async () => {
  const result = await unlinkPlayerCommand(
    {
      players: [makePlayer('player-1', { userId: 'user-1', cloudId: 'cloud-player-1' })],
      linkProposals: [proposal()],
      currentUserId: 'reviewer-1',
      playerId: 'player-1',
      nowIso: now,
    },
    {
      unlink: async () => undefined,
    },
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.players?.[0].userId, undefined);
  assert.equal(result.value.players?.[0].pendingUserLinkAction, undefined);
  assert.equal(result.value.players?.[0].syncStatus, 'synced');
});

test('fetchAccountPlayerLinkQuery maps cloud lookup success', async () => {
  const linked = makePlayer('player-1', { userId: 'user-1' });
  const result = await fetchAccountPlayerLinkQuery('user-1', {
    fetchLinkedToUser: async () => linked,
    fetchPendingForUser: async () => proposal(),
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.linkedPlayer?.id, 'player-1');
  assert.equal(result.value.pendingProposal?.id, 'proposal-1');
});

test('fetchAllPlayerLinkProposalsQuery returns recoverable issue on cloud failure', async () => {
  const result = await fetchAllPlayerLinkProposalsQuery({
    fetchAll: async () => {
      throw new Error('network down');
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.value.linkProposals, []);
  assert.equal(result.issues?.[0].code, 'cloud_unavailable');
});
