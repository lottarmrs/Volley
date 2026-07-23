import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthClient } from './authClient';

function fakeAuth(mfa: Record<string, (value?: unknown) => Promise<unknown>>) {
  return { mfa } as never;
}

test('Google sign-in uses callback route', async () => {
  let options: unknown;
  const client = createAuthClient({
    signInWithOAuth: async (value: unknown) => {
      options = value;
      return { data: {}, error: null };
    },
  } as never, { origin: 'https://panelinha.test' });
  await client.signInWithGoogle();
  assert.deepEqual(options, {
    provider: 'google',
    options: { redirectTo: 'https://panelinha.test/auth/callback' },
  });
});

test('Google identity linking uses the account callback route', async () => {
  let options: unknown;
  const client = createAuthClient({
    linkIdentity: async (value: unknown) => {
      options = value;
      return { data: {}, error: null };
    },
  } as never, { origin: 'https://panelinha.test' });
  await client.linkGoogleIdentity();
  assert.deepEqual(options, {
    provider: 'google',
    options: { redirectTo: 'https://panelinha.test/auth/callback' },
  });
});

test('TOTP verification challenges and verifies the selected factor', async () => {
  const calls: unknown[] = [];
  const client = createAuthClient(fakeAuth({
    listFactors: async () => ({ data: { totp: [{ id: 'factor-1', status: 'verified' }] }, error: null }),
    challenge: async (value) => { calls.push(['challenge', value]); return { data: { id: 'challenge-1' }, error: null }; },
    verify: async (value) => { calls.push(['verify', value]); return { data: {}, error: null }; },
  }), { origin: 'https://panelinha.test' });
  await client.verifyTotp('123456');
  assert.deepEqual(calls, [
    ['challenge', { factorId: 'factor-1' }],
    ['verify', { factorId: 'factor-1', challengeId: 'challenge-1', code: '123456' }],
  ]);
});
