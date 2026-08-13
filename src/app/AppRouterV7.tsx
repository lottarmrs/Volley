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
import {
  AdminRoute,
  AgendaRoute,
  ComunidadesRoute,
  PainelRoute,
  PerfilRoute,
  PerfilSyncRoute,
} from './routes/globalRoutes';
import {
  CommunityGestaoRoute,
  CommunityOverviewRoute,
  CommunityPeopleRoute,
  CommunityPerformanceRoute,
  CommunityShell,
  PlayerEditRoute,
} from './routes/communityRoutes';

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
          <Route path="/agenda" element={<AgendaRoute />} />
          <Route path="/comunidades" element={<ComunidadesRoute />} />
          <Route path="/comunidades/:communityId" element={<CommunityShell />}>
            <Route index element={<CommunityOverviewRoute />} />
            <Route path="pessoas" element={<CommunityPeopleRoute />} />
            <Route path="pessoas/editar-atleta/:playerId" element={<PlayerEditRoute />} />
            <Route path="desempenho" element={<CommunityPerformanceRoute />} />
            <Route path="gestao" element={<CommunityGestaoRoute />} />
            <Route path="*" element={<Navigate to="/comunidades" replace />} />
          </Route>
          <Route path="/perfil" element={<PerfilRoute />} />
          <Route path="/perfil/sync" element={<PerfilSyncRoute />} />
          <Route path="/admin" element={<AdminRoute />} />
          <Route path="*" element={<Navigate to="/painel" replace />} />
        </Route>
      </Route>
    </Routes>
  );
}
