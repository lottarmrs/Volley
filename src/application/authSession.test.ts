import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveAuthSessionState } from './authSession';
import type { UserProfile } from '@shared/types';

function profile(id: string): UserProfile {
  return {
    id, name: 'Ana', email: 'ana@example.com', role: 'user',
    createdAt: '2026-07-22T00:00:00Z', updatedAt: '2026-07-22T00:00:00Z',
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
        state: 'needs_username', profile: profile('u1'), playerId: 'p1', username: null,
      },
    }).kind,
    'onboarding',
  );
});

test('administrative AAL requirement routes an AAL1 session to MFA', () => {
  assert.equal(
    resolveAuthSessionState({
      session: { userId: 'u1', emailConfirmed: true },
      account: { state: 'ready', profile: profile('u1'), playerId: 'p1', username: 'ana' },
      aal: { current: 'aal1', next: 'aal2' },
      requireAal2: true,
    }).kind,
    'mfa_required',
  );
});
