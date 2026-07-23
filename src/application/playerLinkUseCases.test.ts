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

test('proposePlayerLinkCommand consumes an owner auto-approved claim result', async () => {
  const canonical = makePlayer('canonical-local', {
    cloudId: 'canonical-cloud',
    username: 'ana',
    userId: 'user-1',
  });
  const legacy = makePlayer('player-1', {
    cloudId: 'cloud-player-1',
    cloudOwnerId: 'user-1',
  });
  const calls: string[] = [];
  let persistedBeforePropose = false;
  const result = await proposePlayerLinkCommand(
    {
      players: [canonical, legacy],
      linkProposals: [
        proposal({
          id: 'proposal-competitor',
          playerId: 'player-1',
          userId: 'other-user',
          syncStatus: 'synced',
        }),
      ],
      currentUserId: 'user-1',
      playerId: 'player-1',
      nowIso: now,
      proposalId: 'proposal-local',
      persistApprovalIntent: (proposals: PlayerLinkProposal[]) => {
        persistedBeforePropose =
          proposals.at(-1)?.status === 'approved' && proposals.at(-1)?.syncStatus === 'pending';
      },
    },
    {
      propose: async () => {
        calls.push(`persisted:${persistedBeforePropose}`);
        calls.push('propose');
        return 'proposal-cloud';
      },
      approve: async () => {
        calls.push('approve');
        return {
          claimId: 'claim-owner',
          canonicalPlayerId: 'canonical-cloud',
          legacyPlayerId: 'cloud-player-1',
          legacyLocalId: 'player-1',
        };
      },
    },
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(calls, ['persisted:true', 'propose', 'approve']);
  assert.equal(result.value.players?.[0].username, 'ana');
  assert.equal(result.value.players?.[1].deletedAt, now);
  assert.equal(
    result.value.linkProposals.find((item) => item.id === 'proposal-competitor')?.status,
    'superseded',
  );
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

test('reviewPlayerLinkCommand applies the canonical claim result without linking the legacy player', async () => {
  const canonical = makePlayer('canonical-local', {
    cloudId: 'canonical-cloud',
    username: 'ana',
    userId: 'canonical-user',
  });
  const legacy = makePlayer('player-1', {
    cloudId: 'cloud-player-1',
    username: 'legacy-ana',
    userId: undefined,
  });
  const players = [canonical, legacy];
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
      approve: async () => ({
        claimId: 'claim-1',
        canonicalPlayerId: 'canonical-cloud',
        legacyPlayerId: 'cloud-player-1',
        legacyLocalId: 'player-1',
      }),
      reject: async () => undefined,
    },
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.players?.[0], canonical);
  assert.equal(result.value.players?.[1].deletedAt, now);
  assert.equal(result.value.players?.[1].username, undefined);
  assert.equal(result.value.players?.[1].userId, undefined);
  assert.equal(
    result.value.linkProposals.find((item) => item.id === 'proposal-1')?.status,
    'approved',
  );
  assert.equal(
    result.value.linkProposals.find((item) => item.id === 'proposal-2')?.status,
    'superseded',
  );
});

test('reviewPlayerLinkCommand preserves the pending cloud intent when claim result fails', async () => {
  const canonical = makePlayer('canonical-local', {
    cloudId: 'canonical-cloud',
    username: 'ana',
    userId: 'canonical-user',
  });
  const legacy = makePlayer('player-1', {
    cloudId: 'cloud-player-1',
    username: 'legacy-ana',
    userId: undefined,
  });
  const players = [canonical, legacy];
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
  assert.equal(result.value.players?.[0], canonical);
  assert.equal(result.value.players?.[1], legacy);
  assert.equal(result.value.linkProposals[0].status, 'approved');
  assert.equal(result.value.linkProposals[0].reviewedBy, 'reviewer-1');
  assert.equal(result.value.linkProposals[0].reviewedAt, now);
  assert.equal(result.value.linkProposals[0].syncStatus, 'pending');
  assert.equal(result.issues?.[0].code, 'cloud_unavailable');
});

test('reviewPlayerLinkCommand terminates permanent approval failures without retrying them', async () => {
  const result = await reviewPlayerLinkCommand(
    {
      players: [makePlayer('player-1', { cloudId: 'cloud-player-1' })],
      linkProposals: [proposal({ syncStatus: 'synced' })],
      currentUserId: 'reviewer-1',
      proposalId: 'proposal-1',
      action: 'approve',
      nowIso: now,
    },
    {
      approve: async () => {
        throw { code: '42501', message: 'permission denied' };
      },
    },
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.linkProposals[0].status, 'pending');
  assert.equal(result.value.linkProposals[0].syncStatus, 'synced');
  assert.equal(result.issues?.[0].code, 'permission_denied');
  assert.equal(result.issues?.[0].recoverable, false);
});

test('reviewPlayerLinkCommand classifies permanent validation failures', async () => {
  const result = await reviewPlayerLinkCommand(
    {
      players: [makePlayer('player-1', { cloudId: 'cloud-player-1' })],
      linkProposals: [proposal({ syncStatus: 'synced' })],
      currentUserId: 'reviewer-1',
      proposalId: 'proposal-1',
      action: 'approve',
      nowIso: now,
    },
    {
      approve: async () => {
        throw { code: '22023', message: 'invalid parameter value' };
      },
    },
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.linkProposals[0].status, 'pending');
  assert.equal(result.value.linkProposals[0].syncStatus, 'synced');
  assert.equal(result.issues?.[0].code, 'invalid_input');
  assert.equal(result.issues?.[0].recoverable, false);
});

test('reviewPlayerLinkCommand persists approval intent before cloud approval', async () => {
  let persisted: PlayerLinkProposal[] = [];
  let observedPersistedIntent = false;
  const result = await reviewPlayerLinkCommand(
    {
      players: [makePlayer('player-1', { cloudId: 'cloud-player-1' })],
      linkProposals: [proposal({ syncStatus: 'synced' })],
      currentUserId: 'reviewer-1',
      proposalId: 'proposal-1',
      action: 'approve',
      nowIso: now,
      persistApprovalIntent: (proposals: PlayerLinkProposal[]) => {
        persisted = proposals;
      },
    },
    {
      approve: async () => {
        observedPersistedIntent =
          persisted[0]?.status === 'approved' && persisted[0]?.syncStatus === 'pending';
        throw new Error('lost response');
      },
    },
  );

  assert.equal(result.ok, true);
  assert.equal(observedPersistedIntent, true);
});

test('reviewPlayerLinkCommand approves a local proposal without calling a cloud RPC', async () => {
  const players = [makePlayer('player-1', { cloudId: 'cloud-player-1', userId: undefined })];
  const result = await reviewPlayerLinkCommand(
    {
      players,
      linkProposals: [proposal({ syncStatus: 'local' })],
      currentUserId: 'reviewer-1',
      proposalId: 'proposal-1',
      action: 'approve',
      nowIso: now,
    },
    {
      approve: async () => assert.fail('local proposal must not call approve'),
      reject: async () => assert.fail('local proposal must not call reject'),
    },
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.players?.[0].userId, 'user-1');
  assert.equal(result.value.linkProposals[0].status, 'approved');
  assert.equal(result.value.linkProposals[0].syncStatus, 'pending');
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

test('unlinkPlayerCommand rejects canonical unlink without changing state or calling cloud', async () => {
  const players = [makePlayer('player-1', { userId: 'user-1', cloudId: 'cloud-player-1' })];
  const linkProposals = [proposal()];
  let unlinkCalls = 0;
  const result = await unlinkPlayerCommand(
    {
      players,
      linkProposals,
      currentUserId: 'user-1',
      playerId: 'player-1',
      nowIso: now,
    },
    {
      unlink: async () => {
        unlinkCalls += 1;
      },
    },
  );

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error.kind, 'product');
  assert.equal(result.error.code, 'permission_denied');
  assert.equal(result.error.recoverable, false);
  assert.match(result.error.message, /identidade canonica.*imutavel/i);
  assert.equal(unlinkCalls, 0);
  assert.equal(players[0].userId, 'user-1');
  assert.equal(players[0].pendingUserLinkAction, undefined);
  assert.equal(linkProposals[0].status, 'pending');
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
