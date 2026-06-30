import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAccountPlayerLinkViewModel } from './playerLinkViewModel';
import { makePlayer } from '../test/fixtures';
import type { PlayerLinkProposal } from '../types';

const user = { id: 'user-1', email: 'ana@example.com' };

function pendingProposal(overrides: Partial<PlayerLinkProposal> = {}): PlayerLinkProposal {
  return {
    id: 'proposal-1',
    playerId: 'player-1',
    playerCloudId: 'cloud-player-1',
    userId: 'user-1',
    status: 'pending',
    createdAt: '2026-01-01T12:00:00.000Z',
    syncStatus: 'synced',
    ...overrides,
  };
}

test('account link view model returns disabled when Supabase is not configured', () => {
  const vm = buildAccountPlayerLinkViewModel({
    user,
    isSupabaseConfigured: false,
    syncLoading: false,
    checkingLinkedPlayer: false,
    linkedPlayerCheckFailed: false,
    players: [],
    linkProposals: [],
    cloudLinkedPlayer: null,
    cloudPendingProposal: null,
  });

  assert.equal(vm.state, 'disabled');
  assert.equal(vm.canRequestLink, false);
});

test('account link view model prefers locally linked player', () => {
  const localLinked = makePlayer('player-1', { userId: 'user-1', apelido: 'Ana' });
  const cloudLinked = makePlayer('player-2', { userId: 'user-1', apelido: 'Cloud' });
  const vm = buildAccountPlayerLinkViewModel({
    user,
    isSupabaseConfigured: true,
    syncLoading: false,
    checkingLinkedPlayer: false,
    linkedPlayerCheckFailed: false,
    players: [localLinked],
    linkProposals: [],
    cloudLinkedPlayer: cloudLinked,
    cloudPendingProposal: null,
  });

  assert.equal(vm.state, 'linked');
  assert.equal(vm.linkedPlayer?.id, 'player-1');
});

test('account link view model resolves pending proposal and pending player', () => {
  const player = makePlayer('player-1', { cloudId: 'cloud-player-1', apelido: 'Ana' });
  const vm = buildAccountPlayerLinkViewModel({
    user,
    isSupabaseConfigured: true,
    syncLoading: false,
    checkingLinkedPlayer: false,
    linkedPlayerCheckFailed: false,
    players: [player],
    linkProposals: [pendingProposal()],
    cloudLinkedPlayer: null,
    cloudPendingProposal: null,
  });

  assert.equal(vm.state, 'pending');
  assert.equal(vm.pendingProposal?.id, 'proposal-1');
  assert.equal(vm.pendingPlayer?.id, 'player-1');
});

test('account link view model exposes available non-guest active players', () => {
  const available = makePlayer('player-1', { userId: undefined, isGuest: false, ativo: true });
  const linked = makePlayer('player-2', { userId: 'other', isGuest: false, ativo: true });
  const guest = makePlayer('player-3', { userId: undefined, isGuest: true, ativo: true });
  const inactive = makePlayer('player-4', { userId: undefined, isGuest: false, ativo: false });

  const vm = buildAccountPlayerLinkViewModel({
    user,
    isSupabaseConfigured: true,
    syncLoading: false,
    checkingLinkedPlayer: false,
    linkedPlayerCheckFailed: false,
    players: [available, linked, guest, inactive],
    linkProposals: [],
    cloudLinkedPlayer: null,
    cloudPendingProposal: null,
  });

  assert.equal(vm.state, 'ready');
  assert.deepEqual(
    vm.availablePlayers.map((player) => player.id),
    ['player-1'],
  );
  assert.equal(vm.canRequestLink, true);
});

test('account link view model blocks requests after a failed cloud check', () => {
  const player = makePlayer('player-1', { userId: undefined, isGuest: false, ativo: true });
  const vm = buildAccountPlayerLinkViewModel({
    user,
    isSupabaseConfigured: true,
    syncLoading: false,
    checkingLinkedPlayer: false,
    linkedPlayerCheckFailed: true,
    players: [player],
    linkProposals: [],
    cloudLinkedPlayer: null,
    cloudPendingProposal: null,
  });

  assert.equal(vm.state, 'check_failed');
  assert.equal(vm.canRequestLink, false);
});
