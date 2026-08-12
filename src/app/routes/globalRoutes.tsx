import { lazy } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { paths, resolveAdminRoute, resolveNewSessionPath } from '@app/appRoutes';
import { buildDashboardContract } from '@app/screens/dashboard/dashboardContract';
import { buildCommunitiesViewContract } from '@app/screens/communitiesView/communitiesViewContract';
import { buildAccountSyncViewContract } from '@app/screens/accountSyncView/accountSyncViewContract';
import { buildGestaoViewContract } from '@app/screens/gestaoView/gestaoViewContract';
import {
  buildActiveSessionClearResult,
  buildDraftClearResult,
} from '@app/sessionLifecycleUseCases';
import {
  applyCommunityHistoryClear,
  applyCommunityMembershipDuplicate,
  applyLinkedCloudPlayer,
  applyPlayerCommunityMemberships,
} from '@app/localCommunityUseCases';
import { supabaseAuthClient } from '@infra/supabase/authClient';
import { clearSessionDraft } from '../../logic/sessionDraft';
import { useShell } from '../shellContext';

const Dashboard = lazy(() =>
  import('../../components/dashboard/Dashboard').then((module) => ({ default: module.Dashboard })),
);
const CommunitiesView = lazy(() =>
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
            sess.activeSession?.communityId
              ? paths.sessaoAtiva(sess.activeSession.communityId)
              : paths.sessaoAtivaSemComunidade,
          ),
        onResumeDraft: (draft) => {
          wizard.resumeDraft(draft);
          navigate(resolveNewSessionPath({ communityIds }));
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

export function useCommunitiesContract() {
  const shell = useShell();
  const navigate = useNavigate();
  const {
    sess,
    play,
    comm,
    championships,
    communityPresence,
    communityRules,
    whatsAppLists,
    auth,
  } = shell;

  return buildCommunitiesViewContract({
    communities: comm.communities,
    players: play.players,
    sessions: sess.sessions,
    games: sess.games,
    pointEvents: sess.pointEvents,
    teams: sess.teams,
    sessionReports: sess.sessionReports,
    championships: championships.championships,
    championshipTeams: championships.championshipTeams,
    championshipRounds: championships.championshipRounds,
    presenceApi: communityPresence,
    whatsAppApi: whatsAppLists,
    rulesApi: communityRules,
    currentUserId: auth.user?.id ?? null,
    isSupabaseConfigured: auth.isSupabaseConfigured,
    globalRole: auth.profile?.role ?? null,
    onBack: () => navigate(paths.painel),
    onAddCommunity: comm.addCommunity,
    onUpdateCommunity: comm.updateCommunity,
    onDeleteCommunity: (communityId) => {
      if (!window.confirm('Excluir esta comunidade? Os atletas continuarao cadastrados.')) return;
      shell.deleteCommunityAggregate(communityId);
      navigate(paths.comunidades);
    },
    onDuplicateCommunity: (communityId, includeAthletes) => {
      const result = comm.duplicateCommunity(communityId, includeAthletes);
      if (result?.includeAthletes) {
        play.setPlayers((prev) =>
          applyCommunityMembershipDuplicate(prev, {
            sourceCommunityId: communityId,
            duplicateCommunityId: result.duplicate.id,
          }),
        );
      }
    },
    onUpdatePlayerCommunities: (communityId, memberPlayerIds) => {
      play.setPlayers((prev) =>
        applyPlayerCommunityMemberships(prev, communityId, memberPlayerIds),
      );
    },
    onCreatePlayer: shell.createPlayerForCommunity,
    onCreateSession: shell.createSessionFromCommunity,
    onViewSession: (sessionId) => {
      const session = sess.sessions.find((item) => item.id === sessionId);
      const communityId = session?.communityId ?? null;
      navigate(communityId ? paths.sessao(communityId, sessionId) : paths.painel);
    },
    onClearCommunityHistory: (communityId) => {
      sess.setSessions((prev) => applyCommunityHistoryClear(prev, communityId));
    },
    onCreateChampionship: championships.create,
    onMaterializeRound: shell.materializeChampionshipRound,
    onDeleteChampionship: shell.deleteChampionshipAggregate,
    onRescheduleRound: championships.rescheduleRound,
    onSetRoundSkipped: championships.setRoundSkipped,
    onUpdateChampionshipRecurrence: championships.updateRecurrence,
    onLinkedCloudPlayer: (player, communityId) => {
      play.setPlayers((prev) => applyLinkedCloudPlayer(prev, player, communityId));
    },
  });
}

export function ComunidadesRoute() {
  const contract = useCommunitiesContract();
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
