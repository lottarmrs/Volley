import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { AppRouter } from './app/AppRouter';
import { AuthSessionProvider } from './app/auth/AuthSessionProvider';
import { supabaseAuthClient } from './infra/supabase/authClient';
import { accountCloudService } from './infra/supabase/accountCloudService';
import { ToastProvider } from './ui/common/ToastProvider';
import { migrateLocalDbToUuids } from './logic/migrations';
import './index.css';

// Execute UUID migration before any React state/hook reads localStorage.
// Idempotent (guard vpg_uuid_migration_completed), so HMR is safe.
migrateLocalDbToUuids();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthSessionProvider authClient={supabaseAuthClient} accountGateway={accountCloudService}>
        <ToastProvider>
          <AppRouter />
        </ToastProvider>
      </AuthSessionProvider>
    </BrowserRouter>
  </StrictMode>,
);
