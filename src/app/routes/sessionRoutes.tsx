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
import { buildManualSessionStartResult, selectSessionTeams } from '@app/sessionLifecycleUseCases';
import { getCommunityPlayers, getCommunitySessions } from '@logic/community';
import { generateUUID } from '@logic/uuid';
import { SessionCreationBlocked } from '../../components/session/SessionCreationBlocked';
import { useCommunityMembers } from '../../hooks/useCommunityMembers';
import { useCommunityPermissions } from '../../hooks/useCommunityPermissions';
import { transferSessionOrganizer } from '@app/sessionOrganizerUseCases';
import {
  buildRegistrationShareUrl,
  resolveRegistrationTarget,
} from '@app/registrationLinkUseCases';
import { sessionCohortCloudService } from '@infra/supabase/sessionCohortCloudService';
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
        { to: paths.sessoes(communityId), label: 'Sessões', active: ativa === 'lista' },
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
  const communityPlayers = getCommunityPlayers(community.id, play.players);

  return (
    <div className="space-y-5">
      <SessoesTabs communityId={community.id} ativa="presenca" />
      <CommunityPresenceArea
        community={community}
        players={communityPlayers}
        presenceApi={communityPresence}
        canCreateSession={permissions.canCreateSession}
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

  return (
    <div className="space-y-5">
      <SessoesTabs communityId={community.id} ativa="whatsapp" />
      <CommunityWhatsAppArea
        community={community}
        players={getCommunityPlayers(community.id, play.players)}
        whatsAppApi={whatsAppLists}
        canCreateSession={permissions.canCreateSession}
        canEditRules={permissions.canEditRules}
      />
    </div>
  );
}

export function CommunitySessionsRoute() {
  const { community, sess, play } = useCommunityShell();
  const navigate = useNavigate();
  const communitySessions = getCommunitySessions(community.id, sess.sessions);

  return (
    <div className="space-y-5">
      <SessoesTabs communityId={community.id} ativa="lista" />
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
          onDeleteSession: (sessionId) => {
            sess.deleteSession(sessionId);
            navigate(paths.sessoes(community.id));
          },
          onBackToDashboard: () => navigate(paths.comunidade(community.id)),
          initialTab: 'sessions',
          hideTabs: true,
        })}
      />
    </div>
  );
}

export function CommunityRegistrationRoute() {
  const { community, play, sess, comm, whatsAppLists, auth } = useCommunityShell();
  const { sessionId } = useParams();
  const permissions = useCommunityPermissions(community);
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
    defaultCapacity: session?.config?.teamCount ? session.config.teamCount * 6 : 12,
    sessionCloudId: alvo?.sessionCloudId ?? null,
    onSessionChange: (next) =>
      sess.setSessions((prev) => prev.map((item) => (item.id === next.id ? next : item))),
  });

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

  if (!alvo) return <Navigate to={paths.sessoes(community.id)} replace />;

  const sessionCloudId = alvo.sessionCloudId;

  return (
    <RegistrationBoardView
      api={api}
      players={getCommunityPlayers(community.id, play.players)}
      sessionName={alvo.name ?? nomeDaNuvem ?? 'Pelada da comunidade'}
      sessionDate={alvo.date}
      canOpen={!!session && permissions.canCreateSession}
      pixKey={pixKey}
      shareUrl={buildRegistrationShareUrl({
        origin: window.location.origin,
        communityId: community.id,
        sessionId: alvo.sessionCloudId,
      })}
      organizerHandover={
        sessionCloudId
          ? {
              podeTransferir: permissions.canManageMembers,
              currentUserId: auth.user?.id ?? null,
              membros: members
                .filter((membro) => membro.status !== 'suspended')
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
  );
}

export function CommunitySessionDetailRoute() {
  const { community, sess, play } = useCommunityShell();
  const navigate = useNavigate();
  const { sessionId } = useParams();
  const communitySessions = getCommunitySessions(community.id, sess.sessions);

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
        onDeleteSession: (id) => {
          sess.deleteSession(id);
          navigate(paths.sessoes(community.id));
        },
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
  const access = resolveSessionCreationAccess({
    membersResolved: permissions.membersResolved,
    canCreateSession: permissions.canCreateSession,
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
      })}
    />
  );
}

export function SessionActiveRoute() {
  const shell = useCommunityShell();
  const navigate = useNavigate();
  const { community, sess, play } = shell;
  const phase = derivePhase(sess.activeSession, sess.games);
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

  return (
    <div className="space-y-5">
      <SessoesTabs communityId={community.id} ativa="torneios" />
      <TournamentsModule
        sessions={getCommunitySessions(community.id, sess.sessions)}
        games={sess.games}
        teams={sess.teams}
        sessionReports={sess.sessionReports}
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
