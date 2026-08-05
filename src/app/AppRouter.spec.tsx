import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type { AuthSessionState } from '@app/authSession';
import type { AuthClient } from '@app/authClient';
import type { AuthSessionContextValue } from './auth/useAuthSession';
import { ToastProvider } from '@ui/common/ToastProvider';
import { SessionProvider } from '@ui/common/SessionProvider';

const { authSessionMock } = vi.hoisted(() => ({
  authSessionMock: { current: null as unknown as AuthSessionContextValue },
}));

vi.mock('./auth/useAuthSession', () => ({
  useAuthSession: () => authSessionMock.current,
}));

import { AppRouter } from './AppRouter';

const stubAuthClient = {
  getSession: async () => null,
  onSessionChange: () => () => {},
  signIn: async () => {},
  signUp: async () => {},
  signInWithGoogle: async () => {},
  linkGoogleIdentity: async () => {},
  requestPasswordRecovery: async () => {},
  updatePassword: async () => {},
  getAssuranceLevel: async () => ({ current: null, next: null }),
  signOut: async () => {},
  signOutOthers: async () => {},
  enrollTotp: async () => ({ factorId: '', qrCode: '', secret: '' }),
  verifyTotp: async () => {},
} as unknown as AuthClient;

function renderRouter(path: string, state: AuthSessionState) {
  authSessionMock.current = {
    state,
    session: null,
    account: null,
    authClient: stubAuthClient,
    retry: vi.fn(),
    completeUsername: vi.fn(),
    signOut: vi.fn(),
  };
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ToastProvider>
        <SessionProvider>
          <AppRouter />
        </SessionProvider>
      </ToastProvider>
    </MemoryRouter>,
  );
}

describe('AppRouter', () => {
  it('renders login route without mounting the protected app', () => {
    renderRouter('/entrar', { kind: 'anonymous' });
    expect(screen.getByRole('heading', { name: /entrar/i })).toBeTruthy();
  });

  it('redirects protected route to onboarding and preserves destination', () => {
    renderRouter('/comunidades', { kind: 'onboarding', userId: 'u1', playerId: 'p1' });
    expect(screen.getByLabelText('Username')).toBeTruthy();
  });

  it('leaves the login page once the session is signed in', () => {
    renderRouter('/entrar', {
      kind: 'ready',
      userId: 'u1',
      account: {
        state: 'ready',
        profile: {
          id: 'u1',
          name: 'Ana',
          email: 'ana@example.com',
          role: 'user',
          createdAt: '2026-07-22T00:00:00Z',
          updatedAt: '2026-07-22T00:00:00Z',
        },
        playerId: 'p1',
        username: 'ana',
        requiresAal2: false,
      },
    });
    expect(screen.queryByRole('heading', { name: /entrar no sistema/i })).toBeNull();
  });

  it('navigates away from /auth/loading once the session finishes resolving', () => {
    const { rerender } = renderRouter('/auth/loading', { kind: 'initializing' });
    expect(screen.getByText(/carregando sess/i)).toBeTruthy();

    authSessionMock.current = { ...authSessionMock.current, state: { kind: 'anonymous' } };
    rerender(
      <MemoryRouter initialEntries={['/auth/loading']}>
        <ToastProvider>
          <AppRouter />
        </ToastProvider>
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: /entrar/i })).toBeTruthy();
  });
});
