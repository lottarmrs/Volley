import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MotionConfig } from 'motion/react';
import { BrowserRouter } from 'react-router';
import { AppRouter } from './app/AppRouter';
import { AuthSessionProvider } from './app/auth/AuthSessionProvider';
import { supabaseAuthClient } from './infra/supabase/authClient';
import { accountCloudService } from './infra/supabase/accountCloudService';
import { ToastProvider } from './ui/common/ToastProvider';
import { SessionProvider } from './ui/common/SessionProvider';
import { migrateLocalDbToUuids } from './logic/migrations';
// Fontes servidas pelo próprio app: na quadra sem sinal, uma CDN de fonte
// derruba o alinhamento tabular do placar justamente durante o jogo.
// Só o eixo de peso (sem itálico, sem optical size) — é o que o DESIGN.md usa.
import '@fontsource-variable/inter/wght.css';
import '@fontsource-variable/jetbrains-mono/wght.css';
import './index.css';

// Execute UUID migration before any React state/hook reads localStorage.
// Idempotent (guard vpg_uuid_migration_completed), so HMR is safe.
migrateLocalDbToUuids();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Um lugar so resolve os dez componentes que animam: com "user", o motion
        respeita a preferencia do sistema e desliga deslocamento e escala,
        mantendo opacidade e cor — que sao as que confirmam estado. */}
    <MotionConfig reducedMotion="user">
      <BrowserRouter>
        <AuthSessionProvider authClient={supabaseAuthClient} accountGateway={accountCloudService}>
          <ToastProvider>
            <SessionProvider>
              <AppRouter />
            </SessionProvider>
          </ToastProvider>
        </AuthSessionProvider>
      </BrowserRouter>
    </MotionConfig>
  </StrictMode>,
);
