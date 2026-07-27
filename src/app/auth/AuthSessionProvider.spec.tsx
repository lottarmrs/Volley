import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Session } from '@supabase/supabase-js';
import { AuthSessionProvider } from './AuthSessionProvider';
import { useAuthSession } from './useAuthSession';
import type { AuthClient } from '@infra/supabase/authClient';
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
});
