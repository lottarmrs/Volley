import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { AuthForm } from '../../components/account/AuthForm';
import type { AuthSessionState } from '@app/authSession';
import type { AuthSessionContextValue } from './AuthSessionProvider';

// ponytail: no @testing-library/user-event in this repo's deps — fireEvent
// (already the convention in AccountSyncView.spec.tsx) drives the same inputs.

const { authSessionMock } = vi.hoisted(() => ({
  authSessionMock: { current: null as unknown as AuthSessionContextValue },
}));

vi.mock('./AuthSessionProvider', () => ({
  useAuthSession: () => authSessionMock.current,
}));

import { UsernameOnboardingPage } from './AuthPages';

function LocationDisplay() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

function renderAuthPage(
  path: string,
  overrides: Partial<AuthSessionContextValue> & { state: AuthSessionState },
  locationState?: Record<string, unknown>,
) {
  authSessionMock.current = {
    state: overrides.state,
    session: null,
    account: null,
    retry: vi.fn(),
    completeUsername: vi.fn(),
    signOut: vi.fn(),
    ...overrides,
  };
  const initialEntries = [{ pathname: path, state: locationState }];
  return render(
    <MemoryRouter initialEntries={initialEntries as unknown as string[]}>
      <UsernameOnboardingPage />
      <LocationDisplay />
    </MemoryRouter> as ReactNode,
  );
}

describe('AuthForm', () => {
  it('submits username with signup', async () => {
    const signUp = vi.fn().mockResolvedValue(undefined);
    render(
      <MemoryRouter>
        <AuthForm
          mode="signup"
          loading={false}
          onSignIn={vi.fn()}
          onSignUp={signUp}
          onGoogle={vi.fn()}
          onForgotPassword={vi.fn()}
        />
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByLabelText('Nome de exibicao'), { target: { value: 'Ana' } });
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'ana-voleio' } });
    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'ana@example.com' } });
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'senha-segura' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar conta' }));
    await waitFor(() =>
      expect(signUp).toHaveBeenCalledWith('ana@example.com', 'senha-segura', 'Ana', 'ana-voleio'),
    );
  });

  it('rejects an invalid username without calling onSignUp', () => {
    const signUp = vi.fn();
    render(
      <MemoryRouter>
        <AuthForm
          mode="signup"
          loading={false}
          onSignIn={vi.fn()}
          onSignUp={signUp}
          onGoogle={vi.fn()}
          onForgotPassword={vi.fn()}
        />
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'ana@example.com' } });
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'senha-segura' } });
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'AB' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar conta' }));
    expect(signUp).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toBeTruthy();
  });
});

describe('UsernameOnboardingPage', () => {
  it('completes username onboarding and returns to intended route', async () => {
    const completeUsername = vi.fn().mockResolvedValue(undefined);
    renderAuthPage(
      '/escolher-username',
      { state: { kind: 'onboarding', userId: 'u1', playerId: 'p1' }, completeUsername },
      { from: { pathname: '/comunidades' } },
    );
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'ana-voleio' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    await waitFor(() => expect(completeUsername).toHaveBeenCalledWith('ana-voleio'));
    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/comunidades'));
  });
});
