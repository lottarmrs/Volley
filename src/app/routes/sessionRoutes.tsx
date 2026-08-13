import { lazy } from 'react';
import { useNavigate, useParams } from 'react-router';
import { paths, resolveNewSessionPath } from '@app/appRoutes';
import { buildHistoryViewContract } from '@app/screens/historyView/historyViewContract';
import { getCommunitySessions } from '@logic/community';
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
