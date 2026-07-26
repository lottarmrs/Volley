import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type { AuthSessionState } from '@app/authSession';
import type { AuthSessionContextValue } from './auth/useAuthSession';

const { authSessionMock } = vi.hoisted(() => ({
  authSessionMock: { current: null as unknown as AuthSessionContextValue },
}));

vi.mock('./auth/useAuthSession', () => ({
  useAuthSession: () => authSessionMock.current,
}));

import { AppRouter } from './AppRouter';

function renderRouter(path: string, state: AuthSessionState) {
  authSessionMock.current = {
    state,
    session: null,
    account: null,
    retry: vi.fn(),
    completeUsername: vi.fn(),
    signOut: vi.fn(),
  };
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppRouter />
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
        <AppRouter />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: /entrar/i })).toBeTruthy();
  });
});
