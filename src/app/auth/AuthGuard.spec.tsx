import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { routeForAuthState } from './authRoutes';
import { AuthGuard } from './AuthGuard';
import { AuthTransitionPage } from './AuthPages';
import type { AuthSessionState } from '@app/authSession';
import type { AuthSessionContextValue } from './useAuthSession';
import type { AccountSnapshot } from '@app/accountUseCases';

const account: AccountSnapshot = {
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
};

describe('routeForAuthState', () => {
  it('maps auth states to transition routes', () => {
    expect(routeForAuthState({ kind: 'initializing' })).toBe('/auth/loading');
    expect(routeForAuthState({ kind: 'anonymous' })).toBe('/entrar');
    expect(routeForAuthState({ kind: 'email_verification', userId: 'u1' })).toBe(
      '/verificar-email',
    );
    expect(routeForAuthState({ kind: 'onboarding', userId: 'u1', playerId: 'p1' })).toBe(
      '/escolher-username',
    );
    expect(routeForAuthState({ kind: 'mfa_required', userId: 'u1', account: account })).toBe(
      '/confirmar-mfa',
    );
    expect(
      routeForAuthState({
        kind: 'recoverable_error',
        userId: 'u1',
        message: 'Session recovery needed',
      }),
    ).toBe('/auth/recuperar-sessao');
    expect(routeForAuthState({ kind: 'ready', userId: 'u1', account })).toBeNull();
  });
});

const { authSessionMock } = vi.hoisted(() => ({
  authSessionMock: { current: null as unknown as AuthSessionContextValue },
}));

vi.mock('./useAuthSession', () => ({
  useAuthSession: () => authSessionMock.current,
}));

function setAuthSessionState(state: AuthSessionState) {
  authSessionMock.current = {
    state,
    session: null,
    account: 'account' in state ? state.account : null,
    authClient: {} as AuthSessionContextValue['authClient'],
    retry: vi.fn(),
    completeUsername: vi.fn(),
    signOut: vi.fn(),
  };
}

function LocationDisplay() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname + location.search}</div>;
}

function protectedAppTree(initialPath: string) {
  return (
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/auth/loading" element={<AuthTransitionPage />} />
        <Route path="/entrar" element={<div>Tela de entrar</div>} />
        <Route element={<AuthGuard />}>
          <Route path="/painel" element={<div>Painel</div>} />
          <Route
            path="/comunidades/:communityId/desempenho"
            element={<div>Desempenho da comunidade</div>}
          />
        </Route>
      </Routes>
      <LocationDisplay />
    </MemoryRouter>
  );
}

const readyState: AuthSessionState = {
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
};

describe('AuthGuard + AuthTransitionPage — sobrevivencia da URL no reload (F5)', () => {
  it('restaura a rota profunda original depois que a sessao resolve para ready', async () => {
    setAuthSessionState({ kind: 'initializing' });
    const initialPath = '/comunidades/c1/desempenho?aba=historico';
    const { rerender } = render(protectedAppTree(initialPath));

    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/auth/loading'));

    setAuthSessionState(readyState);
    rerender(protectedAppTree(initialPath));

    await waitFor(() =>
      expect(screen.getByTestId('location').textContent).toBe(
        '/comunidades/c1/desempenho?aba=historico',
      ),
    );
    expect(screen.getByText('Desempenho da comunidade')).toBeTruthy();
    expect(screen.queryByText('Painel')).toBeNull();
  });

  it('nao entra em laco quando o destino original e uma rota de autenticacao', async () => {
    setAuthSessionState({ kind: 'initializing' });
    const entry = { pathname: '/auth/loading', state: { from: { pathname: '/entrar' } } };
    function loopGuardTree() {
      return (
        <MemoryRouter initialEntries={[entry]}>
          <Routes>
            <Route path="/auth/loading" element={<AuthTransitionPage />} />
            <Route path="/entrar" element={<div>Tela de entrar</div>} />
            <Route path="/" element={<div>Painel</div>} />
          </Routes>
          <LocationDisplay />
        </MemoryRouter>
      );
    }
    const { rerender } = render(loopGuardTree());
    expect(screen.getByTestId('location').textContent).toBe('/auth/loading');

    setAuthSessionState(readyState);
    rerender(loopGuardTree());

    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/'));
  });
});
