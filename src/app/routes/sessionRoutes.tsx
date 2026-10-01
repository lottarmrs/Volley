import { lazy, useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router';
import { derivePhase } from '@domain/sessionPhase';
import {
  paths,
  resolveLiveSessionRoute,
  resolveNewSessionPath,
  resolveWizardRoute,
} from '@app/appRoutes';
import { buildHistoryViewContract } from '@app/screens/historyView/historyViewContract';
import { buildSessionWizardContract } from '@app/screens/sessionWizard/sessionWizardContract';
import { buildSessionActiveViewContract } from '@app/screens/sessionActiveView/sessionActiveViewContract';
import { resolveSessionCreationAccess } from '@app/sessionCreationAccess';
import { loadSessionOrganizer } from '@app/sessionOrganizerReadUseCases';
import { useCanManageSessions } from '@hooks/useCanManageSessions';
import { buildManualSessionStartResult, selectSessionTeams } from '@app/sessionLifecycleUseCases';
import { frequentPlayerIds, getCommunityPlayers, getCommunitySessions } from '@logic/community';
import { generateUUID } from '@logic/uuid';
import { SessionCreationBlocked } from '../../components/session/SessionCreationBlocked';
import { useCommunityMembers } from '../../hooks/useCommunityMembers';
import { useCommunityPermissions } from '../../hooks/useCommunityPermissions';
import { transferSessionOrganizer } from '@app/sessionOrganizerUseCases';
import {
  buildRegistrationShareUrl,
  resolveRegistrationTarget,
} from '@app/registrationLinkUseCases';
import { buildInviteShareUrl } from '@app/communityInviteUseCases';
import { suggestedRegistrationCapacity } from '@app/scheduleSessionUseCases';
import { sessionCohortCloudService } from '@infra/supabase/sessionCohortCloudService';
import { useScoringOffline } from '@hooks/useScoringOffline';
import { useSessionRealtime } from '@hooks/useSessionRealtime';
import { peladaNextStep, type PeladaActionKind } from '@app/peladaNextStep';
import { closeListAndFinalize, markPelada } from '@app/peladaFlowUseCases';
import { markPeladaDefaults, peladaName, plannedStartIso } from '@app/markPeladaDefaults';
import { MarkPeladaView } from '../../components/session/MarkPeladaView';
import { useToast } from '../../ui/common/useToast';
import { OnlineLoading } from '@ui/common/OnlineDataState';
import { openPeladas } from '@app/openPeladas';
import { formatLocalDateInput } from '@logic/date';
import { OpenPeladasList } from '../../components/session/OpenPeladasList';
import { useCommunityShell } from '../shellContext';
import { CommunityAreaTabs } from '../../components/community/areas/CommunityAreaTabs';
import { CommunityPresenceArea } from '../../components/community/areas/CommunityPresenceArea';
import { CommunityWhatsAppArea } from '../../components/community/areas/CommunityWhatsAppArea';
import { useRegistrationBoard } from '../../hooks/useRegistrationBoard';

const HistoryView = lazy(() =>
  import('../../components/history/HistoryView').then((module) => ({
    default: module.HistoryView,
  })),
);
const TournamentsModule = lazy(() =>
  import('../../components/tournaments/TournamentsModule').then((module) => ({
    default: module.TournamentsModule,
  })),
);
const SessionWizard = lazy(() =>
  import('../../components/session/SessionWizard').then((module) => ({
    default: module.SessionWizard,
  })),
);
const RegistrationBoardView = lazy(() =>
  import('../../components/session/RegistrationBoardView').then((module) => ({
    default: module.RegistrationBoardView,
  })),
);
export const SessionActiveView = lazy(() =>
  import('../../components/live/SessionActiveView').then((module) => ({
    default: module.SessionActiveView,
  })),
);

function SessoesTabs({
  communityId,
  ativa,
}: {
  communityId: string;
  ativa: 'lista' | 'presenca' | 'whatsapp' | 'torneios';
}) {
  return (
    <CommunityAreaTabs
      items={[
        { to: paths.sessoes(communityId), label: 'Peladas', active: ativa === 'lista' },
        { to: paths.presenca(communityId), label: 'Presença', active: ativa === 'presenca' },
        {
          to: paths.listaWhatsapp(communityId),
          label: 'Lista de WhatsApp',
          active: ativa === 'whatsapp',
        },
        { to: paths.torneios(communityId), label: 'Torneios', active: ativa === 'torneios' },
      ]}
    />
  );
}

export function CommunityPresenceRoute() {
  const shell = useCommunityShell();
  const { community, play, communityPresence, communityRules } = shell;
  const permissions = useCommunityPermissions(community);
  const podeOrganizar = useCanManageSessions(community);
  const communityPlayers = getCommunityPlayers(community.id, play.players);

  return (
    <div className="space-y-5">
      <SessoesTabs communityId={community.id} ativa="presenca" />
      <CommunityPresenceArea
        community={community}
        players={communityPlayers}
        sessions={getCommunitySessions(community.id, shell.sess.sessions)}
        presenceApi={communityPresence}
        canCreateSession={podeOrganizar.allowed && !podeOrganizar.pending}
        onCreateSession={() =>
          shell.createSessionFromCommunity(
            community,
            communityPresence
              .getPresentPlayers(community.id, communityPlayers)
              .map((player) => player.id),
            communityRules.getRules(community),
          )
        }
      />
    </div>
  );
}

export function CommunityWhatsAppRoute() {
  const shell = useCommunityShell();
  const { community, play, whatsAppLists } = shell;
  const permissions = useCommunityPermissions(community);
  const podeOrganizar = useCanManageSessions(community);

  return (
    <div className="space-y-5">
      <SessoesTabs communityId={community.id} ativa="whatsapp" />
      <CommunityWhatsAppArea
        community={community}
        players={getCommunityPlayers(community.id, play.players)}
        whatsAppApi={whatsAppLists}
        canCreateSession={podeOrganizar.allowed && !podeOrganizar.pending}
        canEditRules={permissions.canEditRules}
      />
    </div>
  );
}

export function CommunitySessionsRoute() {
  const { community, sess, play } = useCommunityShell();
  const navigate = useNavigate();
  const { canClearHistory } = useCommunityPermissions(community);
  const communitySessions = getCommunitySessions(community.id, sess.sessions);

  if (sess.status.loading) return <OnlineLoading label="Carregando peladas…" />;

  return (
    <div className="space-y-5">
      <SessoesTabs communityId={community.id} ativa="lista" />
      <OpenPeladasList
        communityId={community.id}
        sessions={openPeladas(sess.sessions, community.id)}
        today={formatLocalDateInput(new Date())}
      />
      <HistoryView
        contract={buildHistoryViewContract({
          sessions: communitySessions,
          games: sess.games,
          pointEvents: sess.pointEvents,
          teams: sess.teams,
          players: play.players,
          sessionReports: sess.sessionReports,
          selectedHistorySessionId: null,
          setSelectedHistorySessionId: (id) =>
            navigate(id ? paths.sessao(community.id, id) : paths.sessoes(community.id)),
          onDeleteSession: canClearHistory
            ? (sessionId) => {
                sess.deleteSession(sessionId);
                navigate(paths.sessoes(community.id));
              }
            : undefined,
          onBackToDashboard: () => navigate(paths.comunidade(community.id)),
          initialTab: 'sessions',
          hideTabs: true,
        })}
      />
    </div>
  );
}

export function SessionNewRoute() {
  const { sess } = useCommunityShell();
  return sess.online ? <MarkPeladaRoute /> : <SessionWizardRoute />;
}

function hojeIso(): string {
  const agora = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${agora.getFullYear()}-${pad(agora.getMonth() + 1)}-${pad(agora.getDate())}`;
}

export function MarkPeladaRoute() {
  const { community, sess } = useCommunityShell();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const podeOrganizar = useCanManageSessions(community);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sugestao] = useState(() => {
    const base = markPeladaDefaults(community, new Date());
    return searchParams.get('tipo') === 'torneio' ? { ...base, type: 'tournament' as const } : base;
  });

  if (!podeOrganizar.pending && !podeOrganizar.allowed) {
    return <SessionCreationBlocked onBack={() => navigate(paths.comunidade(community.id))} />;
  }

  return (
    <MarkPeladaView
      communityName={community.name}
      defaults={sugestao}
      today={hojeIso()}
      busy={busy}
      error={erro}
      onCancel={() => navigate(paths.comunidade(community.id))}
      onSubmit={async (valores) => {
        if (!community.cloudId) {
          setErro('A comunidade ainda não está salva. Tente em instantes.');
          return;
        }
        setBusy(true);
        setErro(null);
        const marcada = await markPelada({
          communityCloudId: community.cloudId,
          name: peladaName(community.name, valores.date),
          plannedStartAt: plannedStartIso(valores.date, valores.time),
          location: valores.location.trim() || null,
          capacity: valores.capacity,
          type: valores.type,
        });
        if (marcada.ok === false) {
          setErro(marcada.error.message);
          setBusy(false);
          return;
        }
        await sess.refresh();
        navigate(paths.inscricao(community.id, marcada.value.sessionId));
      }}
    />
  );
}

export function CommunityRegistrationRoute() {
  const { community, play, sess, comm, whatsAppLists, auth } = useCommunityShell();
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const toasts = useToast();
  const [passoOcupado, setPassoOcupado] = useState(false);
  const permissions = useCommunityPermissions(community);
  const podeOrganizar = useCanManageSessions(community);
  const { members } = useCommunityMembers({
    communityCloudId: community.cloudId,
    communityLocalId: community.id,
    currentUserId: auth.user?.id ?? null,
    enabled: !!community.cloudId,
  });
  const session = sess.sessions.find((item) => item.id === sessionId) ?? null;
  const alvo = resolveRegistrationTarget({ routeSessionId: sessionId, session });
  const communityCloudId =
    comm.communities.find((item) => item.id === community.id)?.cloudId ?? null;
  const pixKey = whatsAppLists
    .getCommunityTemplates(community.id)
    .find((template) => !!template.pixKey)?.pixKey;
  const api = useRegistrationBoard({
    session,
    communityCloudId,
    defaultCapacity:
      session?.registrationCapacity ?? (session ? suggestedRegistrationCapacity(session) : 12),
    sessionCloudId: alvo?.sessionCloudId ?? null,
    onSessionChange: (next) =>
      sess.setSessions((prev) => prev.map((item) => (item.id === next.id ? next : item))),
  });
  useSessionRealtime(
    (session?.authorityModel === 'target' ? session.cloudId : null) ?? alvo?.sessionCloudId ?? null,
    () => void api.reload(),
  );

  // Quem abre pelo link nao tem a sessao aqui; o nome vem da nuvem.
  const [nomeDaNuvem, setNomeDaNuvem] = useState<string | null>(null);
  const precisaDoNome = !!alvo?.fromLink;
  const alvoCloudId = alvo?.sessionCloudId ?? null;
  useEffect(() => {
    if (!precisaDoNome || !alvoCloudId) return;
    let vivo = true;
    void sessionCohortCloudService
      .readTargetSession(alvoCloudId)
      .then((lida) => {
        if (vivo) setNomeDaNuvem(lida.name ?? null);
      })
      .catch(() => {
        /* o cabecalho fica neutro; o quadro ja reporta a propria falha */
      });
    return () => {
      vivo = false;
    };
  }, [precisaDoNome, alvoCloudId]);

  const [organizador, setOrganizador] = useState<string | null>(null);
  useEffect(() => {
    if (!alvoCloudId) return;
    let vivo = true;
    void loadSessionOrganizer(alvoCloudId).then((result) => {
      if (vivo && result.ok) setOrganizador(result.value?.name ?? null);
    });
    return () => {
      vivo = false;
    };
  }, [alvoCloudId]);

  if (sess.status.loading) return <OnlineLoading label="Carregando a pelada…" />;
  if (!alvo) return <Navigate to={paths.sessoes(community.id)} replace />;

  const sessionCloudId = alvo.sessionCloudId;
  const board = api.board;
  const jogoAtual = session
    ? sess.games.find((game) => game.sessionId === session.id && game.status === 'active')
    : undefined;

  const agirNoPasso = async (kind: PeladaActionKind) => {
    if (!session || !board) return;
    if (kind === 'sortear' || kind === 'comecar') {
      navigate(paths.sortear(community.id, session.id));
      return;
    }
    if (kind === 'abrir_placar') {
      sess.setActiveSession(session);
      navigate(paths.sessaoAtiva(community.id));
      return;
    }
    if (kind === 'ver_resumo') {
      navigate(paths.historico(community.id, { sessao: session.id }));
      return;
    }
    if (
      kind === 'fechar_lista' &&
      !window.confirm(
        'Fechar a lista? Quem confirmou joga; quem não entrou fica de fora até você reabrir.',
      )
    ) {
      return;
    }
    setPassoOcupado(true);
    try {
      if (kind === 'abrir_lista') await api.open();
      if (kind === 'reabrir_lista') await api.setOpen(true);
      if (kind === 'fechar_lista') {
        const fechada = await closeListAndFinalize({ windowId: board.windowId });
        if (fechada.ok === false) toasts.push(fechada.error.message, 'error');
        await api.reload();
        await sess.refresh();
      }
    } finally {
      setPassoOcupado(false);
    }
  };

  const nextStep =
    session && board
      ? {
          step: peladaNextStep({
            status: session.status,
            windowStatus: board.status,
            confirmed: board.confirmedCount,
            capacity: board.capacity,
            canManage: board.viewerCanManage,
            gameNumber: jogoAtual?.sequenceNumber,
          }),
          busy: passoOcupado,
          onAction: (kind: PeladaActionKind) => void agirNoPasso(kind),
        }
      : undefined;

  const podeCancelar =
    !!session && podeOrganizar.allowed && !['finished', 'cancelled'].includes(session.status);
  const cancelar = () => {
    if (!session) return;
    if (!window.confirm('Cancelar esta pelada? Ela sai da agenda e a lista fecha para todos.')) {
      return;
    }
    const agora = new Date().toISOString();
    sess.setSessions((atuais) =>
      atuais.map((item) =>
        item.id === session.id ? { ...item, status: 'cancelled', updatedAt: agora } : item,
      ),
    );
    toasts.push('Pelada cancelada.', 'success');
    navigate(paths.sessoes(community.id));
  };

  return (
    <>
      <RegistrationBoardView
        nextStep={nextStep}
        api={api}
        players={getCommunityPlayers(community.id, play.players)}
        frequentPlayerIds={frequentPlayerIds(getCommunitySessions(community.id, sess.sessions))}
        organizerName={organizador}
        sessionName={alvo.name ?? nomeDaNuvem}
        sessionDate={alvo.date}
        canOpen={!!session && podeOrganizar.allowed && !podeOrganizar.pending}
        pixKey={pixKey}
        shareUrl={buildRegistrationShareUrl({
          origin: window.location.origin,
          communityId: community.id,
          sessionId: alvo.sessionCloudId,
        })}
        drawUrl={paths.sortear(community.id, sessionId ?? alvo.sessionCloudId)}
        inviteUrl={buildInviteShareUrl({
          origin: window.location.origin,
          code: community.joinCode,
          sessionId: alvo.sessionCloudId,
        })}
        organizerHandover={
          sessionCloudId
            ? {
                podeTransferir: permissions.canManageMembers,
                currentUserId: auth.user?.id ?? null,
                membros: members
                  .filter((membro) => (membro.status ?? 'active') === 'active')
                  .map((membro) => ({
                    userId: membro.userId,
                    nome: membro.name || membro.email || 'Membro',
                  })),
                onTransfer: (organizerUserId: string) =>
                  transferSessionOrganizer({
                    sessionCloudId,
                    communityCloudId,
                    organizerUserId,
                    commandId: generateUUID(),
                    assignmentId: generateUUID(),
                    granterUserId: auth.user?.id ?? undefined,
                  }),
              }
            : undefined
        }
      />
      {podeCancelar && (
        <div className="mx-auto mt-6 flex max-w-3xl justify-center">
          <button
            type="button"
            className="btn btn-ghost btn-sm min-h-11 text-error"
            onClick={cancelar}
          >
            Cancelar a pelada
          </button>
        </div>
      )}
    </>
  );
}

export function CommunitySessionDetailRoute() {
  const { community, sess, play } = useCommunityShell();
  const navigate = useNavigate();
  const { canClearHistory } = useCommunityPermissions(community);
  const { sessionId } = useParams();
  const communitySessions = getCommunitySessions(community.id, sess.sessions);

  if (sess.status.loading) return <OnlineLoading label="Carregando a pelada…" />;

  return (
    <HistoryView
      contract={buildHistoryViewContract({
        sessions: communitySessions,
        games: sess.games,
        pointEvents: sess.pointEvents,
        teams: sess.teams,
        players: play.players,
        sessionReports: sess.sessionReports,
        selectedHistorySessionId: sessionId ?? null,
        setSelectedHistorySessionId: (id) =>
          navigate(id ? paths.sessao(community.id, id) : paths.sessoes(community.id)),
        onDeleteSession: canClearHistory
          ? (id) => {
              sess.deleteSession(id);
              navigate(paths.sessoes(community.id));
            }
          : undefined,
        onBackToDashboard: () => navigate(paths.sessoes(community.id)),
        initialTab: 'sessions',
        hideTabs: true,
      })}
    />
  );
}

export function SessionWizardRoute() {
  const shell = useCommunityShell();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { community, sess, play, comm, wizard } = shell;
  const permissions = useCommunityPermissions(community);
  const podeOrganizar = useCanManageSessions(community);
  const access = resolveSessionCreationAccess({
    pending: podeOrganizar.pending || !permissions.membersResolved,
    allowed: podeOrganizar.allowed,
  });
  const type = searchParams.get('tipo') === 'torneio' ? 'tournament' : undefined;
  const resolution = resolveWizardRoute({
    communityId: community.id,
    hasActiveSession: !!sess.activeSession,
    activeSessionCommunityId: shell.activeSessionCommunityId,
    phase: derivePhase(sess.activeSession, sess.games),
  });
  const bootstrapped = useRef(false);
  const [bootstrapDone, setBootstrapDone] = useState(false);

  useEffect(() => {
    if (bootstrapped.current) return;
    if (access !== 'allowed') return;
    if (resolution.kind === 'create') {
      bootstrapped.current = true;
      const result = buildManualSessionStartResult({
        type,
        communityId: community.id,
        now: new Date(),
        createId: generateUUID,
      });
      sess.setActiveSession(result.session);
      wizard.setWizardStep(result.nextWizardStep);
      setBootstrapDone(true);
      return;
    }
    if (resolution.kind === 'adopt') {
      bootstrapped.current = true;
      wizard.updateSession({ communityId: community.id });
      setBootstrapDone(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolution.kind, community.id, type, access]);

  if (resolution.kind === 'redirect') return <Navigate to={resolution.to} replace />;
  if (access === 'blocked' && !bootstrapDone) {
    return <SessionCreationBlocked onBack={() => navigate(paths.comunidade(community.id))} />;
  }
  if (!sess.activeSession) {
    if (!bootstrapDone) return null;
    return <Navigate to={paths.comunidade(community.id)} replace />;
  }

  return (
    <SessionWizard
      contract={buildSessionWizardContract({
        activeSession: sess.activeSession,
        players: play.players,
        communities: comm.communities,
        hookApi: wizard,
        applyGuestPlayer: (player, editDetails) =>
          shell.applyGuestPlayer(player, editDetails, community.id),
        reactivateGuestPlayer: (playerId, editDetails) =>
          shell.reactivateGuestPlayerForSession(
            playerId,
            editDetails,
            community.id,
            permissions.canEditPlayerProfile,
          ),
        canEditGuestDetails: permissions.canEditPlayerProfile,
      })}
    />
  );
}

export function SessionActiveRoute() {
  const shell = useCommunityShell();
  const navigate = useNavigate();
  const { community, sess, play } = shell;
  const scoringOffline = useScoringOffline(sess);
  const phase = derivePhase(sess.activeSession, sess.games);
  if (sess.status.loading) return <OnlineLoading label="Carregando a pelada…" />;
  const resolution = resolveLiveSessionRoute({
    communityId: community.id,
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
        offline: scoringOffline,
        setGames: sess.setGames,
        setPointEvents: sess.setPointEvents,
        setGameReports: sess.setGameReports,
        setActiveSession: sess.updateActiveSession,
        onExit: () => navigate(paths.comunidade(community.id)),
        onFinishSession: shell.handleFinishSession,
      })}
    />
  );
}

export function CommunityTournamentsRoute() {
  const { community, sess } = useCommunityShell();
  const navigate = useNavigate();
  const podeOrganizar = useCanManageSessions(community);

  return (
    <div className="space-y-5">
      <SessoesTabs communityId={community.id} ativa="torneios" />
      <TournamentsModule
        sessions={getCommunitySessions(community.id, sess.sessions)}
        games={sess.games}
        teams={sess.teams}
        sessionReports={sess.sessionReports}
        canManage={podeOrganizar.allowed}
        onNewTournament={() =>
          navigate(resolveNewSessionPath({ communityIds: [community.id], type: 'tournament' }))
        }
        onOpenTournament={(tournament, shouldOpenLive) => {
          if (shouldOpenLive) {
            sess.setActiveSession(tournament);
            navigate(paths.sessaoAtiva(community.id));
          } else {
            navigate(paths.sessao(community.id, tournament.id));
          }
        }}
      />
    </div>
  );
}
