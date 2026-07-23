import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthClient } from './authClient';

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
