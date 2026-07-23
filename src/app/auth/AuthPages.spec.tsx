import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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

const { authClientMock } = vi.hoisted(() => ({
  authClientMock: {
    enrollTotp: vi.fn(),
    verifyTotp: vi.fn(),
  },
}));

vi.mock('@infra/supabase/authClient', () => ({
  supabaseAuthClient: authClientMock,
}));

import { MfaChallengePage, MfaSetupPage, UsernameOnboardingPage } from './AuthPages';

function LocationDisplay() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

function renderAuthPage(
  path: string,
  overrides: Partial<AuthSessionContextValue> & { state: AuthSessionState },
  locationState?: Record<string, unknown>,
  page: ReactNode = <UsernameOnboardingPage />,
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
      {page}
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
      expect(signUp).toHaveBeenCalledWith(
        'ana@example.com',
        'senha-segura',
        'Ana',
        'ana-voleio',
        undefined,
      ),
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

describe('MfaSetupPage', () => {
  beforeEach(() => {
    authClientMock.enrollTotp.mockReset();
    authClientMock.verifyTotp.mockReset();
  });

  it('enrolls, shows the QR code and verifies the first code before returning to route', async () => {
    authClientMock.enrollTotp.mockResolvedValue({
      factorId: 'factor-1',
      qrCode: 'data:image/png;base64,qr',
      secret: 'SECRET123',
    });
    authClientMock.verifyTotp.mockResolvedValue(undefined);
    renderAuthPage(
      '/configurar-mfa',
      { state: { kind: 'mfa_setup', userId: 'u1' } as unknown as AuthSessionState },
      { from: { pathname: '/comunidades' } },
      <MfaSetupPage />,
    );
    await waitFor(() => expect(
      (screen.getByAltText(/QR code/i) as HTMLImageElement).getAttribute('src'),
    ).toBe('data:image/png;base64,qr'));
    fireEvent.change(screen.getByLabelText('Codigo de 6 digitos'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ativar' }));
    await waitFor(() => expect(authClientMock.verifyTotp).toHaveBeenCalledWith('123456', 'factor-1'));
    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/comunidades'));
  });

  it('shows a recoverable error for an invalid code', async () => {
    authClientMock.enrollTotp.mockResolvedValue({
      factorId: 'factor-1',
      qrCode: 'data:image/png;base64,qr',
      secret: 'SECRET123',
    });
    authClientMock.verifyTotp.mockRejectedValue(new Error('Codigo invalido.'));
    renderAuthPage(
      '/configurar-mfa',
      { state: { kind: 'mfa_setup', userId: 'u1' } as unknown as AuthSessionState },
      undefined,
      <MfaSetupPage />,
    );
    await waitFor(() => expect(screen.getByAltText(/QR code/i)).toBeTruthy());
    fireEvent.change(screen.getByLabelText('Codigo de 6 digitos'), { target: { value: '000000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ativar' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Codigo invalido.'));
  });
});

describe('MfaChallengePage', () => {
  beforeEach(() => {
    authClientMock.enrollTotp.mockReset();
    authClientMock.verifyTotp.mockReset();
  });

  it('verifies a valid challenge code, retries the session and returns to route', async () => {
    const retry = vi.fn().mockResolvedValue(undefined);
    authClientMock.verifyTotp.mockResolvedValue(undefined);
    renderAuthPage(
      '/confirmar-mfa',
      { state: { kind: 'mfa_required', userId: 'u1' } as unknown as AuthSessionState, retry },
      { from: { pathname: '/comunidades' } },
      <MfaChallengePage />,
    );
    fireEvent.change(screen.getByLabelText('Codigo de 6 digitos'), { target: { value: '654321' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(authClientMock.verifyTotp).toHaveBeenCalledWith('654321'));
    await waitFor(() => expect(retry).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/comunidades'));
  });

  it('shows a recoverable error for an invalid challenge code', async () => {
    const retry = vi.fn();
    authClientMock.verifyTotp.mockRejectedValue(new Error('Codigo invalido.'));
    renderAuthPage(
      '/confirmar-mfa',
      { state: { kind: 'mfa_required', userId: 'u1' } as unknown as AuthSessionState, retry },
      undefined,
      <MfaChallengePage />,
    );
    fireEvent.change(screen.getByLabelText('Codigo de 6 digitos'), { target: { value: '000000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Codigo invalido.'));
    expect(retry).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Codigo de 6 digitos')).toBeTruthy();
  });

  it('offers enrollment when there is no verified factor yet, then completes and returns to route', async () => {
    const retry = vi.fn().mockResolvedValue(undefined);
    authClientMock.verifyTotp
      .mockRejectedValueOnce(new Error('Nenhum fator TOTP verificado.'))
      .mockResolvedValueOnce(undefined);
    authClientMock.enrollTotp.mockResolvedValue({
      factorId: 'factor-1',
      qrCode: 'data:image/png;base64,qr',
      secret: 'SECRET123',
    });
    renderAuthPage(
      '/confirmar-mfa',
      { state: { kind: 'mfa_required', userId: 'u1' } as unknown as AuthSessionState, retry },
      { from: { pathname: '/comunidades' } },
      <MfaChallengePage />,
    );
    fireEvent.change(screen.getByLabelText('Codigo de 6 digitos'), { target: { value: '111111' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(authClientMock.enrollTotp).toHaveBeenCalled());
    await waitFor(() => expect(
      (screen.getByAltText(/QR code/i) as HTMLImageElement).getAttribute('src'),
    ).toBe('data:image/png;base64,qr'));
    fireEvent.change(screen.getByLabelText('Codigo de 6 digitos'), { target: { value: '222222' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ativar' }));
    await waitFor(() => expect(authClientMock.verifyTotp).toHaveBeenLastCalledWith('222222', 'factor-1'));
    await waitFor(() => expect(retry).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/comunidades'));
  });
});
