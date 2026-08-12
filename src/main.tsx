import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { AppRouter } from './app/AppRouter';
import { AppRouterV7 } from './app/AppRouterV7';
import { AuthSessionProvider } from './app/auth/AuthSessionProvider';
import { supabaseAuthClient } from './infra/supabase/authClient';
import { accountCloudService } from './infra/supabase/accountCloudService';
import { ToastProvider } from './ui/common/ToastProvider';
import { SessionProvider } from './ui/common/SessionProvider';
import { migrateLocalDbToUuids } from './logic/migrations';
import './index.css';

// Execute UUID migration before any React state/hook reads localStorage.
// Idempotent (guard vpg_uuid_migration_completed), so HMR is safe.
migrateLocalDbToUuids();

const navParam = new URLSearchParams(window.location.search).get('nav');
if (navParam === 'v3') sessionStorage.setItem('nav_v3', '1');
if (navParam === 'v2') sessionStorage.removeItem('nav_v3');
const useNavV3 = import.meta.env.VITE_NAV_V3 === 'true' || sessionStorage.getItem('nav_v3') === '1';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthSessionProvider authClient={supabaseAuthClient} accountGateway={accountCloudService}>
        <ToastProvider>
          <SessionProvider>{useNavV3 ? <AppRouterV7 /> : <AppRouter />}</SessionProvider>
        </ToastProvider>
      </AuthSessionProvider>
    </BrowserRouter>
  </StrictMode>,
);
