import { Navigate, Outlet, useLocation, useOutletContext } from 'react-router';
import { resolveAccessLevel } from '@app/guestAccess';
import { useAuthSession } from './useAuthSession';
import { routeForAuthState } from './authRoutes';
import { AccountRequiredView } from '../../components/onboarding/AccountRequiredView';

export function SessionGate() {
  const { state } = useAuthSession();
  const location = useLocation();

  if (resolveAccessLevel(state) === 'blocked') {
    const destination = routeForAuthState(state);
    if (destination) {
      return <Navigate to={destination} replace state={{ from: location }} />;
    }
  }

  return <Outlet />;
}

export function AccountGate() {
  const { state } = useAuthSession();
  const location = useLocation();
  const outletContext = useOutletContext();
  const access = resolveAccessLevel(state);

  if (access === 'blocked') {
    const destination = routeForAuthState(state);
    if (destination) {
      return <Navigate to={destination} replace state={{ from: location }} />;
    }
  }

  if (access === 'guest') {
    return <AccountRequiredView pathname={location.pathname} />;
  }

  return <Outlet context={outletContext} />;
}
