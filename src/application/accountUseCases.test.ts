import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ensureAccountReadyCommand,
  type AccountGateway,
  type AccountSnapshot,
} from './accountUseCases';

const ready: AccountSnapshot = {
  state: 'ready',
  profile: {
    id: 'user-1',
    name: 'Ana',
    email: 'ana@example.com',
    role: 'user',
    createdAt: '2026-07-22T00:00:00Z',
    updatedAt: '2026-07-22T00:00:00Z',
  },
  playerId: 'player-1',
  username: 'ana-voleio',
  requiresAal2: false,
};

test('ensureAccountReadyCommand delegates normalized username', async () => {
  let received: string | null | undefined;
  const gateway: AccountGateway = {
    ensureReady: async (username) => {
      received = username;
      return ready;
    },
  };
  const result = await ensureAccountReadyCommand(gateway, '  Ana-Voleio  ');
  assert.equal(result.ok, true);
  assert.equal(received, 'ana-voleio');
});

test('ensureAccountReadyCommand maps username conflict', async () => {
  const gateway: AccountGateway = {
    ensureReady: async () => {
      throw { code: '23505', message: 'Username unavailable' };
    },
  };
  const result = await ensureAccountReadyCommand(gateway, 'ana-voleio');
  assert.deepEqual(result, {
    ok: false,
    error: {
      kind: 'product',
      code: 'username_unavailable',
      message: 'Este username ja esta em uso.',
      recoverable: false,
    },
  });
});
