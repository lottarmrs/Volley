import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { resolveLegacyQueryRoute } from '@app/appRoutes';

export function LegacyQueryRedirect({ children }: { children: ReactNode }) {
  const location = useLocation();
  const resolution = resolveLegacyQueryRoute(location.pathname, location.search);
  if (resolution.kind === 'redirect') return <Navigate to={resolution.to} replace />;
  return <>{children}</>;
}
