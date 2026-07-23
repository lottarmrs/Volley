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
});
