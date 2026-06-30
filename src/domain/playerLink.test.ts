import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPlayerLinkProposal,
  canDirectlyLinkPlayer,
  linkPlayerToUser,
  supersedePendingProposalsForLink,
} from './playerLink';
import { makePlayer } from '../test/fixtures';
import { PlayerLinkProposal } from '../types';

const now = '2026-01-01T12:00:00.000Z';

function proposal(overrides: Partial<PlayerLinkProposal> = {}): PlayerLinkProposal {
  return {
    id: 'proposal-1',
    playerId: 'player-1',
    playerCloudId: 'player-cloud',
    userId: 'user-1',
    status: 'pending',
    createdAt: now,
    syncStatus: 'pending',
    ...overrides,
  };
}

test('direct player linking is allowed only for owner-owned or local unlinked players', () => {
  assert.equal(canDirectlyLinkPlayer(makePlayer('p1', { cloudOwnerId: 'user-1' }), 'user-1'), true);
  assert.equal(canDirectlyLinkPlayer(makePlayer('p2', { cloudId: undefined }), 'user-1'), true);
  assert.equal(
    canDirectlyLinkPlayer(makePlayer('p3', { cloudId: 'cloud', cloudOwnerId: 'other' }), 'user-1'),
    false,
  );
  assert.equal(
    canDirectlyLinkPlayer(makePlayer('p4', { cloudId: undefined, userId: 'other-user' }), 'user-1'),
    false,
  );
});

test('buildPlayerLinkProposal rejects missing user and guest players', () => {
  assert.throws(() => buildPlayerLinkProposal(makePlayer('p1'), null, now, 'proposal-x'));
  assert.throws(() =>
    buildPlayerLinkProposal(makePlayer('p1', { isGuest: true }), 'user-1', now, 'proposal-x'),
  );
});

test('buildPlayerLinkProposal creates approved direct link or pending cloud proposal', () => {
  const local = buildPlayerLinkProposal(makePlayer('p1'), 'user-1', now, 'proposal-local');
  const cloud = buildPlayerLinkProposal(
    makePlayer('p2', { cloudId: 'player-cloud', cloudOwnerId: 'other' }),
    'user-1',
    now,
    'proposal-cloud',
  );

  assert.equal(local.status, 'approved');
  assert.equal(local.syncStatus, 'pending');
  assert.equal(cloud.status, 'pending');
  assert.equal(cloud.playerCloudId, 'player-cloud');
});

test('linkPlayerToUser changes only the target player and preserves sync intent', () => {
  const players = [
    makePlayer('p1', { userId: undefined }),
    makePlayer('p2', { userId: undefined }),
  ];
  const updated = linkPlayerToUser(players, 'p1', 'user-1', now);

  assert.equal(updated.find((player) => player.id === 'p1')?.userId, 'user-1');
  assert.equal(updated.find((player) => player.id === 'p1')?.syncStatus, 'pending');
  assert.equal(updated.find((player) => player.id === 'p2')?.userId, undefined);
});

test('supersedePendingProposalsForLink closes competing pending proposals', () => {
  const proposals = [
    proposal({ id: 'same-player', playerId: 'player-1', userId: 'other-user' }),
    proposal({ id: 'same-cloud', playerId: 'player-3', userId: 'other-user' }),
    proposal({ id: 'same-user', playerId: 'player-2', userId: 'user-1' }),
    proposal({
      id: 'already-rejected',
      playerId: 'player-4',
      userId: 'user-3',
      status: 'rejected',
    }),
  ];
  const updated = supersedePendingProposalsForLink(
    proposals,
    { playerId: 'player-1', playerCloudId: 'player-cloud', userId: 'user-1' },
    'reviewer-1',
    now,
  );

  assert.equal(updated.find((item) => item.id === 'same-player')?.status, 'superseded');
  assert.equal(updated.find((item) => item.id === 'same-cloud')?.status, 'superseded');
  assert.equal(updated.find((item) => item.id === 'same-user')?.status, 'superseded');
  assert.equal(updated.find((item) => item.id === 'already-rejected')?.status, 'rejected');
});
