import { lazy, useEffect, useRef } from 'react';
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
import { buildManualSessionStartResult, selectSessionTeams } from '@app/sessionLifecycleUseCases';
import { getCommunitySessions } from '@logic/community';
import { generateUUID } from '@logic/uuid';
import { useCommunityShell } from '../shellContext';

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
export const SessionActiveView = lazy(() =>
  import('../../components/live/SessionActiveView').then((module) => ({
    default: module.SessionActiveView,
  })),
);

export function CommunitySessionsRoute() {
  const { community, sess, play } = useCommunityShell();
  const navigate = useNavigate();
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
  const [searchParams] = useSearchParams();
  const { community, sess, play, comm, wizard } = shell;
  const type = searchParams.get('tipo') === 'torneio' ? 'tournament' : undefined;
  const resolution = resolveWizardRoute({
    communityId: community.id,
    hasActiveSession: !!sess.activeSession,
    activeSessionCommunityId: shell.activeSessionCommunityId,
  });
  const bootstrapped = useRef(false);

  useEffect(() => {
    if (bootstrapped.current) return;
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
      return;
    }
    if (resolution.kind === 'adopt') {
      bootstrapped.current = true;
      wizard.updateSession({ communityId: community.id });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolution.kind, community.id, type]);

  if (resolution.kind === 'redirect') return <Navigate to={resolution.to} replace />;
  if (!sess.activeSession) return null;

  return (
    <SessionWizard
      contract={buildSessionWizardContract({
        activeSession: sess.activeSession,
        players: play.players,
        communities: comm.communities,
        hookApi: wizard,
        applyGuestPlayer: shell.applyGuestPlayer,
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
  );
}
