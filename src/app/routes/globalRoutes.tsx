import { lazy, useMemo, useState } from 'react';
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router';
import { buildMyCards } from '@app/myCards';
import { useCardStatsForCommunities } from '@hooks/useCardStatsForCommunities';
import { applyAthleteDraftToPlayer } from '@app/athleteProfileUseCases';
import { useMyLinkedPlayer } from '@hooks/useMyLinkedPlayer';
import type { Player } from '@shared/types';
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
import { useGoogleAuthEnabled } from '@hooks/useGoogleAuthEnabled';
import { clearSessionDraft } from '../../logic/sessionDraft';
import { useShell } from '../shellContext';
import { useScoringOffline } from '@hooks/useScoringOffline';
import { onlineDataState } from './onlineDataState';
import { OnlineLoading, OnlineReadError } from '@ui/common/OnlineDataState';
import { useAuthSession } from '../auth/useAuthSession';
import { useCommunitiesContract } from './communitiesContract';
import { SessionActiveView } from './sessionRoutes';
import { useCommunitiesWithCapability } from '@hooks/useCommunitiesWithCapability';

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
const UserProfileView = lazy(() =>
  import('../../components/account/UserProfileView').then((module) => ({
    default: module.UserProfileView,
  })),
);
const MyAthleteProfile = lazy(() =>
  import('../../components/account/MyAthleteProfile').then((module) => ({
    default: module.MyAthleteProfile,
  })),
);
const AgendaView = lazy(() =>
  import('../../components/agenda/AgendaView').then((module) => ({ default: module.AgendaView })),
);

export function PainelRoute() {
  const shell = useShell();
  const navigate = useNavigate();
  const { sess, comm, wizard, play } = shell;
  const communityIds = comm.communities.map((community) => community.id);
  const organiza = useCommunitiesWithCapability(comm.communities, 'session.manage', () => true);

  // Painel vazio nao ensina nada: sem elenco, sem sessao e sem rascunho, o
  // proximo passo util e montar a lista e sortear. Nao ha laco aqui porque
  // /comecar nunca devolve para /painel.
  const online = onlineDataState(shell);
  if (comm.status.loading || play.status.loading || sess.status.loading) {
    return <OnlineLoading label="Carregando seu painel…" />;
  }
  const semNada =
    play.players.length === 0 && !sess.activeSession && !shell.sessionDraft && !comm.communities[0];
  if (semNada && !online.readError) return <Navigate to={paths.comecar} replace />;

  return (
    <>
      {online.readError && (
        <div className="mb-4">
          <OnlineReadError error={online.readError} onRetry={online.retry} />
        </div>
      )}
      <Dashboard
        contract={buildDashboardContract({
          activeSession: sess.activeSession,
          sessionDraft: sess.online ? null : shell.sessionDraft,
          games: sess.games,
          sessions: sess.sessions,
          communities: comm.communities,
          today: formatLocalDateInput(new Date()),
          canStartSession:
            comm.communities.length === 0 || (!organiza.pending && organiza.allowedIds.size > 0),
          // Sem comunidade nenhuma, `resolveNewSessionPath` despeja o usuario numa
          // lista vazia de comunidades. O comeco rapido cria a comunidade sozinho.
          onNewSession: () =>
            navigate(
              communityIds.length === 0 ? paths.comecar : resolveNewSessionPath({ communityIds }),
            ),
          onQuickPelada: () => navigate(paths.comecar),
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
            if (
              window.confirm(
                'Descartar o rascunho da pelada? Os atletas escolhidos e os times sorteados até aqui se perdem. O elenco da comunidade não muda.',
              )
            ) {
              const result = buildDraftClearResult();
              clearSessionDraft();
              sess.setActiveSession(result.nextActiveSession);
            }
          },
          onClearActiveSession: () => {
            if (
              sess.activeSession &&
              window.confirm('Descartar a pelada em andamento? Os jogos dela serão perdidos.')
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
    </>
  );
}

export function AgendaRoute() {
  const shell = useShell();
  const { sess, comm, championships } = shell;
  const navigate = useNavigate();
  const today = formatLocalDateInput(new Date());
  const online = onlineDataState(shell);
  const items = buildAgendaItems({
    today,
    communities: comm.communities,
    sessions: sess.sessions,
    championships: championships.championships,
    championshipTeams: championships.championshipTeams,
    championshipRounds: championships.championshipRounds,
  });

  if (comm.status.loading || sess.status.loading) {
    return <OnlineLoading label="Carregando a agenda…" />;
  }
  if (online.readError) {
    return <OnlineReadError error={online.readError} onRetry={online.retry} />;
  }

  return (
    <AgendaView
      items={items}
      markPath={
        comm.communities.length === 1 ? paths.sessaoNova(comm.communities[0].id) : paths.comunidades
      }
      onOpen={(item) =>
        navigate(
          item.kind === 'session'
            ? paths.inscricao(item.communityId, item.refId)
            : paths.torneios(item.communityId),
        )
      }
    />
  );
}

export function ComunidadesRoute() {
  const shell = useShell();
  const contract = useCommunitiesContract({ selectedCommunityId: null });
  const online = onlineDataState(shell);
  if (shell.comm.status.loading) return <OnlineLoading label="Carregando comunidades…" />;
  return (
    <>
      {online.readError && (
        <div className="mb-4">
          <OnlineReadError error={online.readError} onRetry={online.retry} />
        </div>
      )}
      <CommunitiesView contract={contract} />
    </>
  );
}

export function PerfilRoute() {
  const shell = useShell();
  const { auth, play, comm } = shell;
  const { account } = useAuthSession();
  const [editing, setEditing] = useState(false);
  const current = account?.username ?? null;

  const currentPlayer = play.players.find((p) => p.userId === auth.user?.id) ?? null;
  const { linkedPlayer, buscado, erro, tentarDeNovo, setLinkedPlayer } = useMyLinkedPlayer(
    auth.user?.id,
    currentPlayer,
  );

  const minhaFicha = currentPlayer ?? linkedPlayer;
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const jogadores = useMemo(
    () =>
      minhaFicha && !play.players.some((p) => p.id === minhaFicha.id)
        ? [...play.players, minhaFicha]
        : play.players,
    [play.players, minhaFicha],
  );
  const {
    valores: skillValuesByCommunity,
    erros: errosDosNumeros,
    tentarDeNovo: tentarNumerosDeNovo,
  } = useCardStatsForCommunities(comm.communities, jogadores);
  const { sessions, teams, games, pointEvents, sessionReports } = shell.sess;
  const history = useMemo(
    () => ({ sessions, teams, games, pointEvents, players: jogadores, sessionReports }),
    [sessions, teams, games, pointEvents, jogadores, sessionReports],
  );
  const cards = useMemo(
    () =>
      minhaFicha
        ? buildMyCards({
            player: minhaFicha,
            communities: comm.communities,
            history,
            skillValuesByCommunity,
            erros: errosDosNumeros,
          })
        : [],
    [minhaFicha, comm.communities, history, skillValuesByCommunity, errosDosNumeros],
  );
  const carregando =
    comm.status.loading ||
    shell.sess.status.loading ||
    play.status.loading ||
    (!minhaFicha && !buscado);
  const doLeque = !!(location.state as { doLeque?: boolean } | null)?.doLeque;
  const comunidadePedida = searchParams.get('comunidade');
  const selectedCommunityId =
    cards.find((c) => c.community.id === comunidadePedida)?.community.id ??
    cards[0]?.community.id ??
    null;
  const vista = searchParams.get('vista') === 'atleta' ? 'atleta' : 'carta';
  const mostrarErroDaBusca = !!auth.user && !minhaFicha && erro;
  const mostrarMinhaFicha = !!auth.user && !mostrarErroDaBusca && (!!minhaFicha || !buscado);

  function atualizarMinhaFicha(atualizada: Player) {
    if (currentPlayer) {
      play.replacePlayer(atualizada);
    } else {
      setLinkedPlayer(atualizada);
    }
  }

  const profile = account
    ? { ...account.profile, username: account.username ?? undefined }
    : auth.profile;

  return (
    <div className="space-y-6">
      <UserProfileView
        user={auth.user}
        profile={profile}
        player={minhaFicha}
        myCards={{
          cards,
          selectedCommunityId,
          onSelect: (id) => setSearchParams({ comunidade: id }, { replace: true }),
          view: vista,
          carregando,
          naComunidade: comm.communities.length > 0,
          onRetry: tentarNumerosDeNovo,
          onOpenProfile: (id) =>
            setSearchParams({ comunidade: id, vista: 'atleta' }, { state: { doLeque: true } }),
          onShowCard: () => {
            if (doLeque) {
              navigate(-1);
              return;
            }
            setSearchParams(selectedCommunityId ? { comunidade: selectedCommunityId } : {}, {
              replace: true,
            });
          },
        }}
        {...(play.online
          ? {}
          : {
              onExportBackup: shell.handleExportBackup,
              onImportBackup: shell.handleImportBackup,
              onRestoreDemoPlayers: play.handleRestoreDemoPlayers,
            })}
      />
      {mostrarErroDaBusca && (
        <div className="card card-border bg-base-200">
          <div className="card-body gap-2">
            <h2 className="text-base font-black uppercase tracking-tight">Minha ficha</h2>
            <p className="text-sm text-error">Não foi possível carregar sua ficha.</p>
            <div className="card-actions">
              <button type="button" className="btn btn-sm" onClick={tentarDeNovo}>
                Tentar de novo
              </button>
            </div>
          </div>
        </div>
      )}
      {mostrarMinhaFicha && (
        <MyAthleteProfile
          player={minhaFicha}
          onSaved={(draft) => {
            if (!minhaFicha) return;
            atualizarMinhaFicha(applyAthleteDraftToPlayer(minhaFicha, draft));
          }}
          onAvatarApplied={(url) => {
            if (!minhaFicha) return;
            atualizarMinhaFicha({ ...minhaFicha, avatarUrl: url });
          }}
        />
      )}
      <div className="card card-border bg-base-200">
        <div className="card-body gap-2">
          <h2 className="text-base font-black uppercase tracking-tight">Nome de usuário</h2>
          {!current && <p className="text-sm text-base-content/60">Você ainda não escolheu um.</p>}
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
  const googleEnabled = useGoogleAuthEnabled(supabaseAuthClient.isGoogleEnabled);
  return (
    <AccountSyncView
      contract={buildAccountSyncViewContract({
        user: auth.user,
        profile: auth.profile,
        loading: auth.loading,
        isSupabaseConfigured: auth.isSupabaseConfigured,
        googleEnabled,
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
  const scoringOffline = useScoringOffline(sess);
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
        pointEvents: sess.rawPointEvents,
        players: play.players,
        sessionTeams: selectSessionTeams(sess.teams, sess.activeSession?.id),
        gameReports: sess.gameReports,
        currentDeviceId: shell.currentDeviceId,
        offline: scoringOffline,
        scoreQueue: sess.scoreQueue,
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
