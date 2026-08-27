import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveAuthSessionState } from './authSession';
import type { UserProfile } from '@shared/types';

function profile(id: string): UserProfile {
  return {
    id,
    name: 'Ana',
    email: 'ana@example.com',
    role: 'user',
    createdAt: '2026-07-22T00:00:00Z',
    updatedAt: '2026-07-22T00:00:00Z',
  };
}

test('anonymous session remains anonymous', () => {
  assert.deepEqual(resolveAuthSessionState({ session: null }), { kind: 'anonymous' });
});

test('unconfirmed email requires verification', () => {
  assert.equal(
    resolveAuthSessionState({ session: { userId: 'u1', emailConfirmed: false } }).kind,
    'email_verification',
  );
});

test('missing username requires onboarding without logging out', () => {
  assert.equal(
    resolveAuthSessionState({
      session: { userId: 'u1', emailConfirmed: true },
      account: {
        state: 'needs_username',
        profile: profile('u1'),
        playerId: 'p1',
        username: null,
        requiresAal2: false,
      },
    }).kind,
    'onboarding',
  );
});

test('administrative AAL requirement routes an AAL1 session to MFA', () => {
  assert.equal(
    resolveAuthSessionState({
      session: { userId: 'u1', emailConfirmed: true },
      account: {
        state: 'ready',
        profile: profile('u1'),
        playerId: 'p1',
        username: 'ana',
        requiresAal2: true,
      },
      aal: { current: 'aal1', next: 'aal2' },
    }).kind,
    'mfa_required',
  );
});

test('mandatory MFA with no factor enrolled requires TOTP setup', () => {
  assert.equal(
    resolveAuthSessionState({
      session: { userId: 'u1', emailConfirmed: true },
      account: {
        state: 'ready',
        profile: profile('u1'),
        playerId: 'p1',
        username: 'ana',
        requiresAal2: true,
      },
      aal: { current: 'aal1', next: null },
    }).kind,
    'mfa_setup_required',
  );
});

test('mandatory MFA with an enrolled factor requires step-up, not re-enrollment', () => {
  assert.equal(
    resolveAuthSessionState({
      session: { userId: 'u1', emailConfirmed: true },
      account: {
        state: 'ready',
        profile: profile('u1'),
        playerId: 'p1',
        username: 'ana',
        requiresAal2: true,
      },
      aal: { current: 'aal1', next: 'aal2' },
    }).kind,
    'mfa_required',
  );
});

test('voluntary 2FA step-up for an ordinary user still routes to MFA (regression)', () => {
  assert.equal(
    resolveAuthSessionState({
      session: { userId: 'u1', emailConfirmed: true },
      account: {
        state: 'ready',
        profile: profile('u1'),
        playerId: 'p1',
        username: 'ana',
        requiresAal2: false,
      },
      aal: { current: 'aal1', next: 'aal2' },
    }).kind,
    'mfa_required',
  );
});

test('mandatory MFA already satisfied at aal2 is ready', () => {
  assert.equal(
    resolveAuthSessionState({
      session: { userId: 'u1', emailConfirmed: true },
      account: {
        state: 'ready',
        profile: profile('u1'),
        playerId: 'p1',
        username: 'ana',
        requiresAal2: true,
      },
      aal: { current: 'aal2', next: 'aal2' },
    }).kind,
    'ready',
  );
});
