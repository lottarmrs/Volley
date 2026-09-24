import { Navigate, Route, Routes } from 'react-router';
import { AppShell } from './AppShell';
import { AccountGate, SessionGate } from './auth/AuthGuard';
import { CommunityInviteRoute } from './routes/CommunityInviteRoute';
import { QuickStartRoute, SessionRecapRoute } from './routes/onboardingRoutes';
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
import { LigasHubRoute, LigaNovaRoute, LigaDetalheRoute } from './routes/championshipRoutes';
import {
  AdminRoute,
  AgendaRoute,
  ComunidadesRoute,
  LegacyActiveSessionRoute,
  PainelRoute,
  PerfilRoute,
  PerfilSyncRoute,
} from './routes/globalRoutes';
import {
  CommunityDataRoute,
  CommunityGestaoRoute,
  CommunityHistoryRoute,
  CommunityStatsRoute,
  CommunityLeaguesRoute,
  CommunityRulesRoute,
  CommunityOverviewRoute,
  CommunityPeopleRoute,
  CommunityPerformanceRoute,
  CommunityShell,
  PlayerEditRoute,
} from './routes/communityRoutes';
import {
  CommunitySessionDetailRoute,
  CommunitySessionsRoute,
  CommunityPresenceRoute,
  CommunityRegistrationRoute,
  CommunityTournamentsRoute,
  CommunityWhatsAppRoute,
  SessionActiveRoute,
  SessionWizardRoute,
} from './routes/sessionRoutes';

export function AppRouter() {
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
      <Route element={<SessionGate />}>
        <Route element={<AppShell />}>
          <Route index element={<Navigate to="/painel" replace />} />

          {/* Modo local: sortear e marcar a pelada de hoje nao exige conta. */}
          <Route path="/painel" element={<PainelRoute />} />
          <Route path="/comecar" element={<QuickStartRoute />} />
          <Route path="/pelada/resumo" element={<SessionRecapRoute />} />
          <Route path="/sessao/ativa" element={<LegacyActiveSessionRoute />} />

          <Route path="/comunidades/:communityId" element={<CommunityShell />}>
            <Route path="sessoes/nova" element={<SessionWizardRoute />} />
            <Route path="sessoes/ativa" element={<SessionActiveRoute />} />
            <Route element={<AccountGate />}>
              <Route index element={<CommunityOverviewRoute />} />
              <Route path="pessoas" element={<CommunityPeopleRoute />} />
              <Route path="pessoas/editar-atleta/:playerId" element={<PlayerEditRoute />} />
              <Route path="sessoes" element={<CommunitySessionsRoute />} />
              <Route path="sessoes/torneios" element={<CommunityTournamentsRoute />} />
              <Route path="sessoes/presenca" element={<CommunityPresenceRoute />} />
              <Route path="sessoes/lista-whatsapp" element={<CommunityWhatsAppRoute />} />
              <Route path="sessoes/:sessionId/inscricao" element={<CommunityRegistrationRoute />} />
              <Route path="sessoes/:sessionId" element={<CommunitySessionDetailRoute />} />
              <Route path="ligas" element={<CommunityLeaguesRoute />} />
              <Route path="desempenho" element={<CommunityPerformanceRoute />} />
              <Route path="desempenho/estatisticas" element={<CommunityStatsRoute />} />
              <Route path="desempenho/historico" element={<CommunityHistoryRoute />} />
              <Route path="gestao" element={<CommunityGestaoRoute />} />
              <Route path="gestao/regras" element={<CommunityRulesRoute />} />
              <Route path="gestao/dados" element={<CommunityDataRoute />} />
            </Route>
            <Route path="*" element={<Navigate to="/comunidades" replace />} />
          </Route>

          {/* Tudo que atravessa dispositivos ou pessoas mora na conta. */}
          <Route element={<AccountGate />}>
            {/* Fora do CommunityShell: quem chega pelo link nao tem a
                comunidade neste aparelho, e o shell o mandaria embora. */}
            <Route path="/convite/:codigo" element={<CommunityInviteRoute />} />
            <Route path="/agenda" element={<AgendaRoute />} />
            <Route path="/ligas" element={<LigasHubRoute />} />
            <Route path="/ligas/nova" element={<LigaNovaRoute />} />
            <Route path="/ligas/:championshipId" element={<LigaDetalheRoute />} />
            <Route path="/comunidades" element={<ComunidadesRoute />} />
            <Route path="/perfil" element={<PerfilRoute />} />
            <Route path="/perfil/sync" element={<PerfilSyncRoute />} />
            <Route path="/plataforma" element={<AdminRoute />} />
            <Route path="/admin" element={<Navigate to="/plataforma" replace />} />
          </Route>

          <Route path="*" element={<Navigate to="/painel" replace />} />
        </Route>
      </Route>
    </Routes>
  );
}
