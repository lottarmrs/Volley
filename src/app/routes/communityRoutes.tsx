import { lazy, useEffect } from 'react';
import {
  Navigate,
  Outlet,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router';
import type { Community } from '@shared/types';
import {
  NEW_PLAYER_ID,
  paths,
  resolveBackTarget,
  resolveCommunityRoute,
  resolvePlayerRoute,
} from '@app/appRoutes';
import { buildPlayersViewContract } from '@app/screens/playersView/playersViewContract';
import { buildPlayerEditViewContract } from '@app/screens/playerEditView/playerEditViewContract';
import { buildHistoryViewContract } from '@app/screens/historyView/historyViewContract';
import { getCommunityPlayers, getCommunitySessions } from '@logic/community';
import { useShell, useCommunityShell } from '../shellContext';
import { useCommunityPermissions } from '../../hooks/useCommunityPermissions';
import { CommunitiesView } from './globalRoutes';
import { useCommunitiesContract } from './communitiesContract';

const PlayersView = lazy(() =>
  import('../../components/player/PlayersView').then((module) => ({ default: module.PlayersView })),
);
const PlayerEditView = lazy(() =>
  import('../../components/player/PlayerEditView').then((module) => ({
    default: module.PlayerEditView,
  })),
);
const RankingModule = lazy(() =>
  import('../../components/ranking/RankingModule').then((module) => ({
    default: module.RankingModule,
  })),
);
const HistoryView = lazy(() =>
  import('../../components/history/HistoryView').then((module) => ({
    default: module.HistoryView,
  })),
);

export function CommunityShell() {
  const shell = useShell();
  const { communityId } = useParams();
  const resolution = resolveCommunityRoute({
    communityId,
    communityIds: shell.comm.communities.map((community) => community.id),
  });
  if (resolution.kind === 'redirect') return <Navigate to={resolution.to} replace />;

  const community = shell.comm.communities.find((item) => item.id === communityId) as Community;

  return <Outlet context={{ ...shell, community }} />;
}

export function CommunityOverviewRoute() {
  const { community } = useCommunityShell();
  const contract = useCommunitiesContract({ selectedCommunityId: community.id });
  return <CommunitiesView contract={contract} />;
}

export function CommunityGestaoRoute() {
  const { community } = useCommunityShell();
  const contract = useCommunitiesContract({
    selectedCommunityId: community.id,
    initialCommunityTab: 'rules',
  });
  return <CommunitiesView contract={contract} />;
}

export function CommunityPeopleRoute() {
  const shell = useCommunityShell();
  const navigate = useNavigate();
  const { community, play, sess, comm } = shell;
  const communityPlayers = getCommunityPlayers(community.id, play.players);

  return (
    <PlayersView
      contract={buildPlayersViewContract({
        players: communityPlayers,
        communities: comm.communities,
        games: sess.games,
        pointEvents: sess.pointEvents,
        teams: sess.teams,
        sessions: getCommunitySessions(community.id, sess.sessions),
        onBack: () => navigate(paths.comunidade(community.id)),
        onAddPlayer: () => {
          play.handleAddPlayer();
          navigate(paths.atleta(community.id, NEW_PLAYER_ID));
        },
        onEditPlayer: (player) => {
          play.handleEditPlayer(player);
          navigate(paths.atleta(community.id, player.username ?? player.id));
        },
        onRestoreDemoPlayers: play.handleRestoreDemoPlayers,
        onAddGuestPlayer: (newPlayer, editDetails) =>
          shell.applyGuestPlayer(newPlayer, editDetails, community.id),
      })}
    />
  );
}

export function PlayerEditRoute() {
  const shell = useCommunityShell();
  const navigate = useNavigate();
  const location = useLocation();
  const { playerId } = useParams();
  const { community, play, sess, comm, auth } = shell;
  const permissions = useCommunityPermissions(community);
  const fallbackPath = paths.pessoas(community.id);
  const communityPlayers = getCommunityPlayers(community.id, play.players);
  const resolution = resolvePlayerRoute({ param: playerId, players: communityPlayers });
  const targetPlayer =
    resolution.kind === 'ok'
      ? communityPlayers.find((item) => item.id === resolution.playerId)
      : undefined;

  useEffect(() => {
    if (!playerId) return;
    if (targetPlayer && play.editingPlayer?.id === targetPlayer.id) return;
    if (playerId === NEW_PLAYER_ID) {
      if (!play.editingPlayer) play.handleAddPlayer();
      return;
    }
    if (targetPlayer) play.handleEditPlayer(targetPlayer);
  }, [playerId, play.editingPlayer, targetPlayer]);

  const goBack = () => {
    const target = resolveBackTarget({ locationKey: location.key, fallbackPath });
    if (target.kind === 'history') navigate(-1);
    else navigate(target.to);
  };

  if (resolution.kind === 'not-found') {
    return <Navigate to={fallbackPath} replace />;
  }
  if (!play.editingPlayer) return null;

  return (
    <PlayerEditView
      contract={buildPlayerEditViewContract({
        editingPlayer: play.editingPlayer,
        setEditingPlayer: play.setEditingPlayer,
        players: play.players,
        games: sess.games,
        pointEvents: sess.pointEvents,
        teams: sess.teams,
        communities: comm.communities,
        sessions: sess.sessions,
        validationErrors: play.validationErrors,
        showDeleteConfirm: play.showDeleteConfirm,
        setShowDeleteConfirm: play.setShowDeleteConfirm,
        permissions,
        currentUserId: auth.user?.id ?? null,
        onBack: goBack,
        onSave: () => {
          try {
            if (play.handleSavePlayer(permissions, community.id)) goBack();
          } catch (err) {
            shell.handlePlayerEditActionError(err);
          }
        },
        onDelete: () => {
          try {
            play.handleDeletePlayer(permissions);
            goBack();
          } catch (err) {
            shell.handlePlayerEditActionError(err);
          }
        },
      })}
    />
  );
}

export function CommunityPerformanceRoute() {
  const shell = useCommunityShell();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { community, play, sess } = shell;
  const selectedSessionId = searchParams.get('sessao');
  const aba = selectedSessionId ? 'historico' : (searchParams.get('aba') ?? 'ranking');
  const communityPlayers = getCommunityPlayers(community.id, play.players);
  const communitySessions = getCommunitySessions(community.id, sess.sessions);

  return (
    <div className="space-y-5">
      <div role="tablist" className="tabs tabs-box overflow-x-auto flex-nowrap justify-start">
        <button
          type="button"
          role="tab"
          className={`tab whitespace-nowrap ${aba === 'ranking' ? 'tab-active' : ''}`}
          onClick={() => navigate(paths.desempenho(community.id, { aba: 'ranking' }))}
        >
          Ranking
        </button>
        <button
          type="button"
          role="tab"
          className={`tab whitespace-nowrap ${aba === 'historico' ? 'tab-active' : ''}`}
          onClick={() => navigate(paths.desempenho(community.id, { aba: 'historico' }))}
        >
          Histórico
        </button>
      </div>

      {aba === 'ranking' ? (
        <RankingModule
          players={communityPlayers}
          games={sess.games}
          pointEvents={sess.pointEvents}
          teams={sess.teams}
          sessions={communitySessions}
        />
      ) : (
        <HistoryView
          contract={buildHistoryViewContract({
            sessions: communitySessions,
            games: sess.games,
            pointEvents: sess.pointEvents,
            teams: sess.teams,
            players: play.players,
            sessionReports: sess.sessionReports,
            selectedHistorySessionId: selectedSessionId,
            setSelectedHistorySessionId: (id) =>
              navigate(
                id
                  ? paths.desempenho(community.id, { sessao: id })
                  : paths.desempenho(community.id, { aba: 'historico' }),
              ),
            onDeleteSession: (sessionId) => {
              sess.deleteSession(sessionId);
              navigate(paths.desempenho(community.id, { aba: 'historico' }));
            },
            onBackToDashboard: () => navigate(paths.comunidade(community.id)),
            initialTab: 'sessions',
            hideTabs: false,
          })}
        />
      )}
    </div>
  );
}
