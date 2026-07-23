import { Navigate, Outlet, useLocation } from 'react-router';
import type { AuthSessionState } from '@app/authSession';
import { useAuthSession } from './AuthSessionProvider';

export function routeForAuthState(state: AuthSessionState): string | null {
  switch (state.kind) {
    case 'initializing': return '/auth/loading';
    case 'anonymous': return '/entrar';
    case 'email_verification': return '/verificar-email';
    case 'onboarding': return '/escolher-username';
    case 'mfa_required': return '/confirmar-mfa';
    case 'recoverable_error': return '/auth/recuperar-sessao';
    case 'ready': return null;
  }
}

export function AuthGuard() {
  const { state } = useAuthSession();
  const location = useLocation();
  const destination = routeForAuthState(state);
  if (destination) {
    return <Navigate to={destination} replace state={{ from: location }} />;
  }
  return <Outlet />;
}
