import { lazy } from 'react';
import { Navigate, useNavigate } from 'react-router';
import {
  paths,
  resolveAdminRoute,
  resolveLegacyLiveSessionRoute,
  resolveNewSessionPath,
} from '@app/appRoutes';
import { buildAgendaItems } from '@app/agendaViewModel';
import { derivePhase } from '@domain/sessionPhase';
import { formatLocalDateInput } from '@logic/date';
import { buildDashboardContract } from '@app/screens/dashboard/dashboardContract';
import { buildAccountSyncViewContract } from '@app/screens/accountSyncView/accountSyncViewContract';
import { buildGestaoViewContract } from '@app/screens/gestaoView/gestaoViewContract';
import { buildSessionActiveViewContract } from '@app/screens/sessionActiveView/sessionActiveViewContract';
import {
  buildActiveSessionClearResult,
  buildDraftClearResult,
  selectSessionTeams,
} from '@app/sessionLifecycleUseCases';
import { supabaseAuthClient } from '@infra/supabase/authClient';
import { clearSessionDraft } from '../../logic/sessionDraft';
import { useShell } from '../shellContext';
import { useCommunitiesContract } from './communitiesContract';
import { SessionActiveView } from './sessionRoutes';

const Dashboard = lazy(() =>
  import('../../components/dashboard/Dashboard').then((module) => ({ default: module.Dashboard })),
);
export const CommunitiesView = lazy(() =>
  import('../../components/community/CommunitiesView').then((module) => ({
    default: module.CommunitiesView,
  })),
);
const AccountSyncView = lazy(() =>
  import('../../components/account/AccountSyncView').then((module) => ({
    default: module.AccountSyncView,
  })),
);
const GestaoView = lazy(() =>
  import('../../components/admin/GestaoView').then((module) => ({ default: module.GestaoView })),
);
const SettingsModule = lazy(() =>
  import('../../components/settings/SettingsModule').then((module) => ({
    default: module.SettingsModule,
  })),
);
const AgendaView = lazy(() =>
  import('../../components/agenda/AgendaView').then((module) => ({ default: module.AgendaView })),
);

export function PainelRoute() {
  const shell = useShell();
  const navigate = useNavigate();
  const { sess, comm, wizard } = shell;
  const communityIds = comm.communities.map((community) => community.id);

  return (
    <Dashboard
      contract={buildDashboardContract({
        activeSession: sess.activeSession,
        sessionDraft: shell.sessionDraft,
        games: sess.games,
        onNewSession: () => navigate(resolveNewSessionPath({ communityIds })),
        onResumeSession: () =>
          navigate(
            shell.activeSessionCommunityId
              ? paths.sessaoAtiva(shell.activeSessionCommunityId)
              : paths.sessaoAtivaSemComunidade,
          ),
        onResumeDraft: (draft) => {
          wizard.resumeDraft(draft);
          navigate(
            draft.session.communityId
              ? paths.sessaoNova(draft.session.communityId)
              : resolveNewSessionPath({ communityIds }),
          );
        },
        onClearDraft: () => {
          if (window.confirm('Deseja realmente descartar o rascunho?')) {
            const result = buildDraftClearResult();
            clearSessionDraft();
            sess.setActiveSession(result.nextActiveSession);
          }
        },
        onClearActiveSession: () => {
          if (
            sess.activeSession &&
            window.confirm(
              'Deseja realmente descartar a sessão ativa? Todo o progresso e jogos gerados serão perdidos permanentemente.',
            )
          ) {
            const result = buildActiveSessionClearResult(sess.activeSession);
            if (!result) return;
            sess.deleteSession(result.sessionIdToDelete);
            sess.setActiveSession(result.nextActiveSession);
            clearSessionDraft();
          }
        },
        onPlayers: () => navigate(paths.comunidades),
        onHistory: () => navigate(paths.agenda),
        onExportBackup: shell.handleExportBackup,
        onImportBackup: shell.handleImportBackup,
        onCommunities: () => navigate(paths.comunidades),
      })}
    />
  );
}

export function AgendaRoute() {
  const { sess, comm, championships } = useShell();
  const navigate = useNavigate();
  const today = formatLocalDateInput(new Date());
  const items = buildAgendaItems({
    today,
    communities: comm.communities,
    sessions: sess.sessions,
    championships: championships.championships,
    championshipTeams: championships.championshipTeams,
    championshipRounds: championships.championshipRounds,
  });

  return (
    <AgendaView
      items={items}
      onOpen={(item) =>
        navigate(
          item.kind === 'session'
            ? paths.sessao(item.communityId, item.refId)
            : paths.torneios(item.communityId),
        )
      }
    />
  );
}

export function ComunidadesRoute() {
  const contract = useCommunitiesContract({ selectedCommunityId: null });
  return <CommunitiesView contract={contract} />;
}

export function PerfilRoute() {
  const shell = useShell();
  return (
    <SettingsModule
      onExportBackup={shell.handleExportBackup}
      onImportBackup={shell.handleImportBackup}
      onRestoreDemoPlayers={shell.play.handleRestoreDemoPlayers}
    />
  );
}

export function PerfilSyncRoute() {
  const { auth, cloudSync, play } = useShell();
  return (
    <AccountSyncView
      contract={buildAccountSyncViewContract({
        user: auth.user,
        profile: auth.profile,
        loading: auth.loading,
        isSupabaseConfigured: auth.isSupabaseConfigured,
        onSignOut: auth.signOut,
        onLinkGoogleIdentity: supabaseAuthClient.linkGoogleIdentity,
        onSync: cloudSync.sync,
        onRepairDuplicates: cloudSync.repairDuplicateCloudData,
        lastSyncedAt: cloudSync.lastSyncedAt,
        syncLoading: cloudSync.syncLoading,
        players: play.players,
        recoverableSyncActions: cloudSync.recoverableSyncActions,
        syncIssueSummary: cloudSync.syncIssueSummary,
        onRetryPrimarySyncAction: cloudSync.retryPrimarySyncAction,
        onClearResolvedSyncIssues: cloudSync.clearResolvedSyncIssues,
      })}
    />
  );
}

export function LegacyActiveSessionRoute() {
  const shell = useShell();
  const navigate = useNavigate();
  const { sess, play } = shell;
  const phase = derivePhase(sess.activeSession, sess.games);
  const resolution = resolveLegacyLiveSessionRoute({
    activeSessionCommunityId: shell.activeSessionCommunityId,
    hasActiveSession: !!sess.activeSession,
    phase,
  });
  if (resolution.kind === 'redirect') return <Navigate to={resolution.to} replace />;

  return (
    <SessionActiveView
      contract={buildSessionActiveViewContract({
        activeSession: sess.activeSession!,
        games: sess.games,
        pointEvents: sess.pointEvents,
        players: play.players,
        sessionTeams: selectSessionTeams(sess.teams, sess.activeSession?.id),
        gameReports: sess.gameReports,
        currentDeviceId: shell.currentDeviceId,
        setGames: sess.setGames,
        setPointEvents: sess.setPointEvents,
        setGameReports: sess.setGameReports,
        setActiveSession: sess.updateActiveSession,
        onExit: () => navigate(paths.painel),
        onFinishSession: shell.handleFinishSession,
      })}
    />
  );
}

export function AdminRoute() {
  const { auth, toasts } = useShell();
  const resolution = resolveAdminRoute({ isStaff: auth.isStaff });
  if (resolution.kind === 'redirect') return <Navigate to={resolution.to} replace />;
  return (
    <GestaoView
      contract={buildGestaoViewContract({
        currentUserId: auth.user?.id ?? null,
        isMaster: auth.isMaster,
        onToast: toasts.push,
      })}
    />
  );
}
