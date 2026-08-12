import { Navigate, Route, Routes } from 'react-router';
import { AppShell } from './AppShell';
import { AuthGuard } from './auth/AuthGuard';
import {
  AuthTransitionPage,
  EmailVerificationPage,
  LoginPage,
  MfaChallengePage,
  MfaSetupPage,
  PasswordRecoveryPage,
  RecoverableSessionPage,
  UsernameOnboardingPage,
} from './auth/AuthPages';
import { PainelRoute } from './routes/globalRoutes';

export function AppRouterV7() {
  return (
    <Routes>
      <Route path="/entrar" element={<LoginPage mode="signin" />} />
      <Route path="/cadastro" element={<LoginPage mode="signup" />} />
      <Route path="/recuperar-senha" element={<PasswordRecoveryPage />} />
      <Route path="/auth/callback" element={<AuthTransitionPage />} />
      <Route path="/auth/loading" element={<AuthTransitionPage />} />
      <Route path="/auth/recuperar-sessao" element={<RecoverableSessionPage />} />
      <Route path="/verificar-email" element={<EmailVerificationPage />} />
      <Route path="/escolher-username" element={<UsernameOnboardingPage />} />
      <Route path="/configurar-mfa" element={<MfaSetupPage />} />
      <Route path="/confirmar-mfa" element={<MfaChallengePage />} />
      <Route element={<AuthGuard />}>
        <Route element={<AppShell />}>
          <Route index element={<Navigate to="/painel" replace />} />
          <Route path="/painel" element={<PainelRoute />} />
          <Route path="*" element={<Navigate to="/painel" replace />} />
        </Route>
      </Route>
    </Routes>
  );
}
