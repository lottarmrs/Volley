import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthClient } from './authClient';

function fakeAuth(mfa: Record<string, (value?: unknown) => Promise<unknown>>) {
  return { mfa } as never;
}

test('Google sign-in uses callback route', async () => {
  let options: unknown;
  const client = createAuthClient(
    {
      signInWithOAuth: async (value: unknown) => {
        options = value;
        return { data: {}, error: null };
      },
    } as never,
    { origin: 'https://panelinha.test' },
  );
  await client.signInWithGoogle();
  assert.deepEqual(options, {
    provider: 'google',
    options: { redirectTo: 'https://panelinha.test/auth/callback' },
  });
});

test('Google identity linking uses the account callback route', async () => {
  let options: unknown;
  const client = createAuthClient(
    {
      linkIdentity: async (value: unknown) => {
        options = value;
        return { data: {}, error: null };
      },
    } as never,
    { origin: 'https://panelinha.test' },
  );
  await client.linkGoogleIdentity();
  assert.deepEqual(options, {
    provider: 'google',
    options: { redirectTo: 'https://panelinha.test/auth/callback' },
  });
});

test('TOTP verification challenges and verifies the selected factor', async () => {
  const calls: unknown[] = [];
  const client = createAuthClient(
    fakeAuth({
      listFactors: async () => ({
        data: { totp: [{ id: 'factor-1', status: 'verified' }] },
        error: null,
      }),
      challenge: async (value) => {
        calls.push(['challenge', value]);
        return { data: { id: 'challenge-1' }, error: null };
      },
      verify: async (value) => {
        calls.push(['verify', value]);
        return { data: {}, error: null };
      },
    }),
    { origin: 'https://panelinha.test' },
  );
  await client.verifyTotp('123456');
  assert.deepEqual(calls, [
    ['challenge', { factorId: 'factor-1' }],
    ['verify', { factorId: 'factor-1', challengeId: 'challenge-1', code: '123456' }],
  ]);
});

test('password sign-in forwards the CAPTCHA token to Supabase', async () => {
  let payload: unknown;
  const client = createAuthClient(
    {
      signInWithPassword: async (value: unknown) => {
        payload = value;
        return { data: {}, error: null };
      },
    } as never,
    { origin: 'https://panelinha.test' },
  );
  await client.signIn('ana@example.com', 'senha-segura', 'captcha-token');
  assert.deepEqual(payload, {
    email: 'ana@example.com',
    password: 'senha-segura',
    options: { captchaToken: 'captcha-token' },
  });
});

test('TOTP verification with an explicit factorId skips the verified-status lookup', async () => {
  const calls: unknown[] = [];
  const client = createAuthClient(
    fakeAuth({
      listFactors: async () => {
        calls.push(['listFactors']);
        return { data: { totp: [] }, error: null };
      },
      challenge: async (value) => {
        calls.push(['challenge', value]);
        return { data: { id: 'challenge-1' }, error: null };
      },
      verify: async (value) => {
        calls.push(['verify', value]);
        return { data: {}, error: null };
      },
    }),
    { origin: 'https://panelinha.test' },
  );
  await client.verifyTotp('123456', 'factor-1');
  assert.deepEqual(calls, [
    ['challenge', { factorId: 'factor-1' }],
    ['verify', { factorId: 'factor-1', challengeId: 'challenge-1', code: '123456' }],
  ]);
});

test('signOutOthers calls auth.signOut with scope "others"', async () => {
  let options: unknown;
  const client = createAuthClient(
    {
      signOut: async (value: unknown) => {
        options = value;
        return { error: null };
      },
    } as never,
    { origin: 'https://panelinha.test' },
  );
  await client.signOutOthers();
  assert.deepEqual(options, { scope: 'others' });
});

test('sign-up forwards the claim code as auth metadata', async () => {
  let payload: unknown;
  const client = createAuthClient(
    {
      signUp: async (value: unknown) => {
        payload = value;
        return { data: {}, error: null };
      },
    } as never,
    { origin: 'https://panelinha.test' },
  );
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

test('enrollTotp recovers from a leftover unverified factor', async () => {
  // O Supabase responde 422 ("A factor with the friendly name ... already exists")
  // enquanto existir um fator nao verificado. Com MFA obrigatorio essa tela e o unico
  // caminho para master/programmer/owner/admin, entao sem esta recuperacao a conta
  // fica trancada fora do app.
  const unenrolled: string[] = [];
  let enrollCalls = 0;
  const client = createAuthClient(
    fakeAuth({
      listFactors: async () => ({
        data: {
          all: [
            { id: 'stale-totp', factor_type: 'totp', status: 'unverified' },
            { id: 'live-totp', factor_type: 'totp', status: 'verified' },
            { id: 'a-phone', factor_type: 'phone', status: 'unverified' },
          ],
        },
        error: null,
      }),
      unenroll: async (value?: unknown) => {
        unenrolled.push((value as { factorId: string }).factorId);
        return { data: {}, error: null };
      },
      enroll: async () => {
        enrollCalls += 1;
        if (enrollCalls === 1) {
          return {
            data: null,
            error: { message: 'A factor with the friendly name "" for this user already exists' },
          };
        }
        return { data: { id: 'fresh', totp: { qr_code: 'qr', secret: 'S' } }, error: null };
      },
    }),
    { origin: 'https://panelinha.test' },
  );

  const result = await client.enrollTotp();

  assert.deepEqual(unenrolled, ['stale-totp'], 'only the unverified TOTP factor is removed');
  assert.equal(enrollCalls, 2, 'enroll is retried after the cleanup');
  assert.deepEqual(result, { factorId: 'fresh', qrCode: 'qr', secret: 'S' });
});

test('enrollTotp does not touch existing factors when the first enroll succeeds', async () => {
  let listCalls = 0;
  let unenrollCalls = 0;
  const client = createAuthClient(
    fakeAuth({
      listFactors: async () => {
        listCalls += 1;
        return { data: { all: [] }, error: null };
      },
      unenroll: async () => {
        unenrollCalls += 1;
        return { data: {}, error: null };
      },
      enroll: async () => ({
        data: { id: 'first', totp: { qr_code: 'qr', secret: 'S' } },
        error: null,
      }),
    }),
    { origin: 'https://panelinha.test' },
  );

  const result = await client.enrollTotp();

  assert.equal(listCalls, 0, 'happy path makes no extra API calls');
  assert.equal(unenrollCalls, 0, 'a verified factor is never removed on the happy path');
  assert.deepEqual(result, { factorId: 'first', qrCode: 'qr', secret: 'S' });
});
