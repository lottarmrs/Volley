import { type ReactNode } from 'react';
import { useSessions } from '../../hooks/useSessions';
import { SessionContext } from './useSession';

/**
 * Wraps the app with a single shared active-session store. Descendants call
 * {@link useSession} instead of instantiating `useSessions` directly, so the
 * active session (and its games/points/heartbeat) survives route-driven
 * remounts of <App/> in the Fase 3 navigation refactor.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const sessions = useSessions();
  return <SessionContext.Provider value={sessions}>{children}</SessionContext.Provider>;
}
