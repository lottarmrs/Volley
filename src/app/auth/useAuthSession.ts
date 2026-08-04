import { createContext, useContext } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { AccountSnapshot } from '@app/accountUseCases';
import type { AuthSessionState } from '@app/authSession';
import type { AuthClient } from '@app/authClient';

export interface AuthSessionContextValue {
  state: AuthSessionState;
  session: Session | null;
  account: AccountSnapshot | null;
  authClient: AuthClient;
  retry(): Promise<void>;
  completeUsername(username: string): Promise<void>;
  signOut(): Promise<void>;
}

export const AuthSessionContext = createContext<AuthSessionContextValue | null>(null);

export function useAuthSession(): AuthSessionContextValue {
  const value = useContext(AuthSessionContext);
  if (!value) throw new Error('useAuthSession must be used within AuthSessionProvider');
  return value;
}
