import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { AccountGateway, AccountSnapshot } from '@app/accountUseCases';
import { ensureAccountReadyCommand } from '@app/accountUseCases';
import { isAppOk } from '@app/appResult';
import { resolveAuthSessionState, type AuthSessionState } from '@app/authSession';
import type { AuthClient } from '@app/authClient';
import { AuthSessionContext, type AuthSessionContextValue } from './useAuthSession';

export function AuthSessionProvider({
  children,
  authClient,
  accountGateway,
}: {
  children: ReactNode;
  authClient: AuthClient;
  accountGateway: AccountGateway;
}) {
  const [state, setState] = useState<AuthSessionState>({ kind: 'initializing' });
  const [session, setSession] = useState<Session | null>(null);
  const [account, setAccount] = useState<AccountSnapshot | null>(null);

  const reconcile = useCallback(
    async (nextSession: Session | null, username?: string) => {
      setSession(nextSession);
      if (!nextSession) {
        setAccount(null);
        setState({ kind: 'anonymous' });
        return;
      }
      if (!nextSession.user.email_confirmed_at) {
        setState({ kind: 'email_verification', userId: nextSession.user.id });
        return;
      }
      const result = await ensureAccountReadyCommand(accountGateway, username);
      if (!isAppOk(result)) {
        // Handle tomado entre a checagem e o submit e erro de campo, nao falha de
        // bootstrap: virar 'recoverable_error' aqui arrancaria a pessoa do
        // formulario para /auth/recuperar-sessao. Quem chamou com username tem
        // try/catch esperando exatamente isso.
        if (
          username &&
          result.error.kind === 'product' &&
          result.error.code === 'username_unavailable'
        ) {
          throw new Error(result.error.message);
        }
        setState({
          kind: 'recoverable_error',
          userId: nextSession.user.id,
          message: result.error.message,
        });
        return;
      }
      setAccount(result.value);
      const aal = await authClient.getAssuranceLevel().catch(() => null);
      setState(
        resolveAuthSessionState({
          session: { userId: nextSession.user.id, emailConfirmed: true },
          account: result.value,
          aal,
        }),
      );
    },
    [accountGateway, authClient],
  );

  useEffect(() => {
    let active = true;
    // getSession() rejeita quando o refresh token esta expirado/invalido. Sem
    // este catch a promise fica pendente, o estado nunca sai de 'initializing'
    // e a tela trava em "Carregando Sessao..." para sempre.
    authClient
      .getSession()
      .then((value) => active && reconcile(value))
      .catch((cause) => {
        console.error('Falha ao restaurar a sessao:', cause);
        if (active) void reconcile(null);
      });
    const unsubscribe = authClient.onSessionChange((value) => {
      if (active) void reconcile(value);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [authClient, reconcile]);

  const value = useMemo<AuthSessionContextValue>(
    () => ({
      state,
      session,
      account,
      authClient,
      retry: async () => reconcile(session),
      completeUsername: async (username) => reconcile(session, username),
      signOut: async () => {
        await authClient.signOut();
        await reconcile(null);
      },
    }),
    [account, authClient, reconcile, session, state],
  );

  return <AuthSessionContext.Provider value={value}>{children}</AuthSessionContext.Provider>;
}
