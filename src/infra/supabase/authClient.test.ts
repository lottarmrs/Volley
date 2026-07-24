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

test('password sign-in forwards the CAPTCHA token to Supabase', async () => {
  let payload: unknown;
  const client = createAuthClient({
    signInWithPassword: async (value: unknown) => {
      payload = value;
      return { data: {}, error: null };
    },
  } as never, { origin: 'https://panelinha.test' });
  await client.signIn('ana@example.com', 'senha-segura', 'captcha-token');
  assert.deepEqual(payload, {
    email: 'ana@example.com',
    password: 'senha-segura',
    options: { captchaToken: 'captcha-token' },
  });
});

test('TOTP verification with an explicit factorId skips the verified-status lookup', async () => {
  const calls: unknown[] = [];
  const client = createAuthClient(fakeAuth({
    listFactors: async () => { calls.push(['listFactors']); return { data: { totp: [] }, error: null }; },
    challenge: async (value) => { calls.push(['challenge', value]); return { data: { id: 'challenge-1' }, error: null }; },
    verify: async (value) => { calls.push(['verify', value]); return { data: {}, error: null }; },
  }), { origin: 'https://panelinha.test' });
  await client.verifyTotp('123456', 'factor-1');
  assert.deepEqual(calls, [
    ['challenge', { factorId: 'factor-1' }],
    ['verify', { factorId: 'factor-1', challengeId: 'challenge-1', code: '123456' }],
  ]);
});

test('sign-up forwards the claim code as auth metadata', async () => {
  let payload: unknown;
  const client = createAuthClient({
    signUp: async (value: unknown) => {
      payload = value;
      return { data: {}, error: null };
    },
  } as never, { origin: 'https://panelinha.test' });
  await client.signUp('ana@example.com', 'senha-segura', 'Ana', 'ana-voleio', 'ABCD1234');
  assert.deepEqual(payload, {
    email: 'ana@example.com',
    password: 'senha-segura',
    options: {
      data: { name: 'Ana', username: 'ana-voleio', claim_code: 'ABCD1234' },
      captchaToken: undefined,
    },
  });
});
