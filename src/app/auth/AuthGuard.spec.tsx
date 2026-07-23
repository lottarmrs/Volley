import { describe, expect, it } from 'vitest';
import { routeForAuthState } from './AuthGuard';
import type { AccountSnapshot } from '@app/accountUseCases';

const account: AccountSnapshot = {
  state: 'ready',
  profile: {
    id: 'u1', name: 'Ana', email: 'ana@example.com', role: 'user',
    createdAt: '2026-07-22T00:00:00Z', updatedAt: '2026-07-22T00:00:00Z',
  },
  playerId: 'p1',
  username: 'ana',
};

describe('routeForAuthState', () => {
  it('maps auth states to transition routes', () => {
    expect(routeForAuthState({ kind: 'initializing' })).toBe('/auth/loading');
    expect(routeForAuthState({ kind: 'anonymous' })).toBe('/entrar');
    expect(routeForAuthState({ kind: 'email_verification', userId: 'u1' })).toBe('/verificar-email');
    expect(routeForAuthState({ kind: 'onboarding', userId: 'u1', playerId: 'p1' })).toBe('/escolher-username');
    expect(routeForAuthState({ kind: 'mfa_required', userId: 'u1', account: account })).toBe('/confirmar-mfa');
    expect(routeForAuthState({ kind: 'recoverable_error', userId: 'u1', message: 'Session recovery needed' })).toBe('/auth/recuperar-sessao');
    expect(routeForAuthState({ kind: 'ready', userId: 'u1', account })).toBeNull();
  });
});
