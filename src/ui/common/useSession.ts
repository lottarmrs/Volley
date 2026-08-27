import { createContext, useContext } from 'react';
import { useSessions } from '../../hooks/useSessions';

export type SessionContextValue = ReturnType<typeof useSessions>;

export const SessionContext = createContext<SessionContextValue | null>(null);

/**
 * Access the app-wide active-session store provided by {@link SessionProvider}.
 * Throws when used outside a provider.
 */
export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession deve ser usado dentro de <SessionProvider>');
  return ctx;
}
