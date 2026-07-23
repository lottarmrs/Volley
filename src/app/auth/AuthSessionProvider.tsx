import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { AccountGateway, AccountSnapshot } from '@app/accountUseCases';
import { ensureAccountReadyCommand } from '@app/accountUseCases';
import { isAppOk } from '@app/appResult';
import { resolveAuthSessionState, type AuthSessionState } from '@app/authSession';
import type { AuthClient } from '@infra/supabase/authClient';
import { accountCloudService } from '@infra/supabase/accountCloudService';
import { supabaseAuthClient } from '@infra/supabase/authClient';

export interface AuthSessionContextValue {
  state: AuthSessionState;
  session: Session | null;
  account: AccountSnapshot | null;
  retry(): Promise<void>;
  completeUsername(username: string): Promise<void>;
  signOut(): Promise<void>;
}

const AuthSessionContext = createContext<AuthSessionContextValue | null>(null);

export function AuthSessionProvider({
  children,
  authClient = supabaseAuthClient,
  accountGateway = accountCloudService,
}: {
  children: ReactNode;
  authClient?: AuthClient;
  accountGateway?: AccountGateway;
}) {
  const [state, setState] = useState<AuthSessionState>({ kind: 'initializing' });
  const [session, setSession] = useState<Session | null>(null);
  const [account, setAccount] = useState<AccountSnapshot | null>(null);

  const reconcile = useCallback(async (nextSession: Session | null, username?: string) => {
    setSession(nextSession);
    if (!nextSession) { setAccount(null); setState({ kind: 'anonymous' }); return; }
    if (!nextSession.user.email_confirmed_at) {
      setState({ kind: 'email_verification', userId: nextSession.user.id }); return;
    }
    const result = await ensureAccountReadyCommand(accountGateway, username);
    if (!isAppOk(result)) {
      setState({
        kind: 'recoverable_error', userId: nextSession.user.id, message: result.error.message,
      });
      return;
    }
    setAccount(result.value);
    const aal = await authClient.getAssuranceLevel().catch(() => null);
    setState(resolveAuthSessionState({
      session: { userId: nextSession.user.id, emailConfirmed: true },
      account: result.value,
      aal,
    }));
  }, [accountGateway, authClient]);

  useEffect(() => {
    let active = true;
    authClient.getSession().then((value) => active && reconcile(value));
    const unsubscribe = authClient.onSessionChange((value) => { if (active) void reconcile(value); });
    return () => { active = false; unsubscribe(); };
  }, [authClient, reconcile]);

  const value = useMemo<AuthSessionContextValue>(() => ({
    state, session, account,
    retry: async () => reconcile(session),
    completeUsername: async (username) => reconcile(session, username),
    signOut: async () => { await authClient.signOut(); await reconcile(null); },
  }), [account, authClient, reconcile, session, state]);

  return <AuthSessionContext.Provider value={value}>{children}</AuthSessionContext.Provider>;
}

export function useAuthSession(): AuthSessionContextValue {
  const value = useContext(AuthSessionContext);
  if (!value) throw new Error('useAuthSession must be used within AuthSessionProvider');
  return value;
}
