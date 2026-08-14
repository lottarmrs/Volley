import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type { Session } from '@supabase/supabase-js';
import type { AuthClient } from '@app/authClient';
import type { AccountGateway, AccountSnapshot } from '@app/accountUseCases';
import type { UserProfile } from '@shared/types';

const { playerCloudServiceMock } = vi.hoisted(() => ({
  playerCloudServiceMock: { isHandleAvailable: vi.fn().mockResolvedValue(true) },
}));

vi.mock('@infra/supabase/playerCloudService', () => ({
  playerCloudService: playerCloudServiceMock,
}));

import { AuthSessionProvider } from './AuthSessionProvider';
import { useAuthSession } from './useAuthSession';
import { UsernameOnboardingPage } from './AuthPages';
import { HandleChangeForm } from '../routes/globalRoutes';

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

function fakeAuthClient(options: {
  user: { id: string; email_confirmed_at?: string } | null;
}): AuthClient {
  const session = options.user ? ({ user: options.user } as unknown as Session) : null;
  return {
    getSession: async () => session,
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
    enrollTotp: async () => {
      throw new Error('not implemented');
    },
    verifyTotp: async () => {},
  };
}

function Probe() {
  const auth = useAuthSession();
  return <div>{auth.state.kind}</div>;
}

function ProbeWithRetry() {
  const auth = useAuthSession();
  return (
    <div>
      <span>{auth.state.kind}</span>
      <button onClick={() => void auth.retry()}>retry</button>
    </div>
  );
}

function snapshot(overrides: Partial<AccountSnapshot> = {}): AccountSnapshot {
  return {
    state: 'ready',
    profile: profile('u1'),
    playerId: 'p1',
    username: 'ana',
    requiresAal2: false,
    ...overrides,
  };
}

// Reproduz a corrida real: o handle estava livre na checagem e foi tomado antes
// do submit, entao o RPC devolve unique violation (23505).
function handleTakenGateway(bootstrap: AccountSnapshot): AccountGateway {
  return {
    ensureReady: async (username) => {
      if (username) throw Object.assign(new Error('duplicate key'), { code: '23505' });
      return bootstrap;
    },
  };
}

describe('AuthSessionProvider', () => {
  it('becomes ready after session and account bootstrap', async () => {
    render(
      <AuthSessionProvider
        authClient={fakeAuthClient({ user: { id: 'u1', email_confirmed_at: 'now' } })}
        accountGateway={{
          ensureReady: async () => ({
            state: 'ready',
            profile: profile('u1'),
            playerId: 'p1',
            username: 'ana',
            requiresAal2: false,
          }),
        }}
      >
        <Probe />
      </AuthSessionProvider>,
    );
    await waitFor(() => expect(screen.getByText('ready')).toBeTruthy());
  });

  it('surfaces a recoverable error instead of hanging when getSession rejects', async () => {
    const client = fakeAuthClient({ user: null });
    render(
      <AuthSessionProvider
        authClient={{
          ...client,
          getSession: async () => {
            throw new Error('Invalid Refresh Token');
          },
        }}
        accountGateway={{
          ensureReady: async () => ({
            state: 'ready',
            profile: profile('u1'),
            playerId: 'p1',
            username: 'ana',
            requiresAal2: false,
          }),
        }}
      >
        <Probe />
      </AuthSessionProvider>,
    );
    await waitFor(() => expect(screen.queryByText('initializing')).toBeNull());
  });

  it('keeps a valid session as recoverable_error when bootstrap fails', async () => {
    render(
      <AuthSessionProvider
        authClient={fakeAuthClient({ user: { id: 'u1', email_confirmed_at: 'now' } })}
        accountGateway={{
          ensureReady: async () => {
            throw new Error('network');
          },
        }}
      >
        <Probe />
      </AuthSessionProvider>,
    );
    await waitFor(() => expect(screen.getByText('recoverable_error')).toBeTruthy());
  });

  it('does not reach ready on its own after verifyTotp; needs an explicit retry', async () => {
    // Mirrors mandatory-MFA enrollment: account.requiresAal2 is true and no
    // factor is enrolled yet (aal.next === null), so the provider starts in
    // mfa_setup_required.
    let aal: { current: 'aal1' | 'aal2' | null; next: 'aal1' | 'aal2' | null } = {
      current: 'aal1',
      next: null,
    };
    const client: AuthClient = {
      ...fakeAuthClient({ user: { id: 'u1', email_confirmed_at: 'now' } }),
      getAssuranceLevel: async () => aal,
    };
    render(
      <AuthSessionProvider
        authClient={client}
        accountGateway={{
          ensureReady: async () => ({
            state: 'ready',
            profile: profile('u1'),
            playerId: 'p1',
            username: 'ana',
            requiresAal2: true,
          }),
        }}
      >
        <ProbeWithRetry />
      </AuthSessionProvider>,
    );
    await waitFor(() => expect(screen.getByText('mfa_setup_required')).toBeTruthy());

    // Simulate verifyTotp succeeding (as MfaSetupPage's handleSubmit does)
    // and the assurance level advancing server-side. Nothing here re-triggers
    // the provider's reconcile — onSessionChange's listener is never invoked
    // by verifyTotp in this fake client, which matches production: verifyTotp
    // resolves without emitting a session change the provider listens to.
    aal = { current: 'aal2', next: 'aal2' };
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.getByText('mfa_setup_required')).toBeTruthy();

    // An explicit retry() — the same call MfaSetupPage.handleSubmit must make
    // before navigating — re-fetches the assurance level and reaches ready.
    screen.getByText('retry').click();
    await waitFor(() => expect(screen.getByText('ready')).toBeTruthy());
  });

  // Regressao: 'nome ja em uso' virava recoverable_error, que routeForAuthState
  // mapeia para /auth/recuperar-sessao — um erro de campo arrancava a pessoa da
  // tela inteira, e o catch dos formularios era codigo morto.
  it('mantem o onboarding na tela quando o username ja esta em uso', async () => {
    render(
      <MemoryRouter initialEntries={['/escolher-username']}>
        <AuthSessionProvider
          authClient={fakeAuthClient({ user: { id: 'u1', email_confirmed_at: 'now' } })}
          accountGateway={handleTakenGateway(snapshot({ state: 'needs_username', username: null }))}
        >
          <Probe />
          <UsernameOnboardingPage />
        </AuthSessionProvider>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText('onboarding')).toBeTruthy());
    fireEvent.change(screen.getByLabelText(/nome de usu/i), { target: { value: 'ana-voleio' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/ja esta em uso/i);
    expect(screen.queryByText('recoverable_error')).toBeNull();
    expect(screen.getByText('onboarding')).toBeTruthy();
  });

  it('mantem a troca de handle na tela quando o username ja esta em uso', async () => {
    const onDone = vi.fn();
    render(
      <AuthSessionProvider
        authClient={fakeAuthClient({ user: { id: 'u1', email_confirmed_at: 'now' } })}
        accountGateway={handleTakenGateway(snapshot())}
      >
        <Probe />
        <HandleChangeForm onDone={onDone} />
      </AuthSessionProvider>,
    );
    await waitFor(() => expect(screen.getByText('ready')).toBeTruthy());
    fireEvent.change(screen.getByLabelText('Novo nome de usuário'), {
      target: { value: 'ana-voleio' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/ja esta em uso/i);
    expect(onDone).not.toHaveBeenCalled();
    expect(screen.queryByText('recoverable_error')).toBeNull();
    expect(screen.getByText('ready')).toBeTruthy();
  });
});
