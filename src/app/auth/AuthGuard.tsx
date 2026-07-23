import { Navigate, Outlet, useLocation } from 'react-router';
import { useAuthSession } from './useAuthSession';
import { routeForAuthState } from './authRoutes';

export function AuthGuard() {
  const { state } = useAuthSession();
  const location = useLocation();
  const destination = routeForAuthState(state);
  if (destination) {
    return <Navigate to={destination} replace state={{ from: location }} />;
  }
  return <Outlet />;
}
