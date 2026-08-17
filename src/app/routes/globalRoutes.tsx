import { lazy, useState } from 'react';
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
import { normalizeHandle, validateHandle } from '@logic/handle';
import { useHandleAvailability } from '@hooks/useHandleAvailability';
import { clearSessionDraft } from '../../logic/sessionDraft';
import { useShell } from '../shellContext';
import { useAuthSession } from '../auth/useAuthSession';
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
  const { account } = useAuthSession();
  const [editing, setEditing] = useState(false);
  const current = account?.username ?? null;

  return (
    <div className="space-y-6">
      <div className="card card-border bg-base-200">
        <div className="card-body gap-2">
          <h2 className="text-base font-black uppercase tracking-tight">Nome de usuário</h2>
          {current ? (
            <p className="text-sm text-base-content/70">@{current}</p>
          ) : (
            <p className="text-sm text-base-content/60">Você ainda não escolheu um.</p>
          )}
          <p className="text-xs text-base-content/60">
            É por ele que outras pessoas te encontram. Ao trocar, o nome antigo fica livre para
            outra pessoa.
          </p>
          <div className="card-actions">
            <button type="button" className="btn btn-sm" onClick={() => setEditing((v) => !v)}>
              {editing ? 'Cancelar' : 'Trocar'}
            </button>
          </div>
          {editing && <HandleChangeForm onDone={() => setEditing(false)} />}
        </div>
      </div>
      <SettingsModule
        onExportBackup={shell.handleExportBackup}
        onImportBackup={shell.handleImportBackup}
        onRestoreDemoPlayers={shell.play.handleRestoreDemoPlayers}
      />
    </div>
  );
}

export function HandleChangeForm({ onDone }: { onDone: () => void }) {
  const { completeUsername } = useAuthSession();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const handle = normalizeHandle(value);
  const availability = useHandleAvailability(handle);

  return (
    <form
      className="flex flex-col gap-2 pt-2"
      onSubmit={async (event) => {
        event.preventDefault();
        const invalid = validateHandle(value);
        if (invalid) {
          setError(invalid);
          return;
        }
        try {
          await completeUsername(handle);
          onDone();
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : 'Não foi possível trocar.');
        }
      }}
    >
      <input
        aria-label="Novo nome de usuário"
        className="input input-bordered input-sm"
        value={value}
        autoCapitalize="none"
        autoCorrect="off"
        onChange={(event) => {
          setValue(event.target.value);
          setError(null);
        }}
      />
      {availability === 'checking' && <p className="text-xs text-base-content/60">Verificando…</p>}
      {availability === 'taken' && <p className="text-xs text-error">@{handle} já está em uso.</p>}
      {availability === 'free' && (
        <p className="text-xs text-success">@{handle} está disponível.</p>
      )}
      {error && (
        <p role="alert" className="text-xs text-error">
          {error}
        </p>
      )}
      <button type="submit" className="btn btn-primary btn-sm" disabled={availability === 'taken'}>
        Salvar
      </button>
    </form>
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
