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
  resolveCommunityAreaAccess,
  resolveCommunityRoute,
  resolvePlayerEditAction,
  resolvePlayerRoute,
} from '@app/appRoutes';
import { buildPlayersViewContract } from '@app/screens/playersView/playersViewContract';
import { buildPlayerEditViewContract } from '@app/screens/playerEditView/playerEditViewContract';
import { buildHistoryViewContract } from '@app/screens/historyView/historyViewContract';
import { getCommunityPlayers, getCommunitySessions } from '@logic/community';
import { useShell, useCommunityShell } from '../shellContext';
import { useAuthSession } from '../auth/useAuthSession';
import { isGuestAccess } from '@app/guestAccess';
import { AccountRequiredView } from '../../components/onboarding/AccountRequiredView';
import { useCommunityPermissions } from '../../hooks/useCommunityPermissions';
import { useCommunityMembers } from '../../hooks/useCommunityMembers';
import { CommunitiesView } from './globalRoutes';
import { useCommunitiesContract } from './communitiesContract';
import { LegacyQueryRedirect } from './LegacyQueryRedirect';
import {
  applyCommunityHistoryClear,
  applyCommunityMembershipDuplicate,
  applyLinkedCloudPlayer,
} from '@app/localCommunityUseCases';
import { CommunityMembersPanel } from '../../components/community/CommunityMembersPanel';
import { AthleteUsernameSearch } from '../../components/community/AthleteUsernameSearch';
import { CommunityAreaTabs } from '../../components/community/areas/CommunityAreaTabs';
import { CommunityRulesArea } from '../../components/community/areas/CommunityRulesArea';
import { CommunityDataArea } from '../../components/community/areas/CommunityDataArea';
import { CommunityGuestsArea } from '../../components/community/areas/CommunityGuestsArea';
import { CommunityLeaguesArea } from '../../components/community/areas/CommunityLeaguesArea';
import { CommunityOverviewArea } from '../../components/community/areas/CommunityOverviewArea';
import { CommunityRankingArea } from '../../components/community/areas/CommunityRankingArea';

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
  const location = useLocation();
  const { state: authState } = useAuthSession();
  const { communityId } = useParams();
  const resolution = resolveCommunityRoute({
    communityId,
    communityIds: shell.comm.communities.map((community) => community.id),
  });
  if (resolution.kind === 'redirect') {
    // Quem nao tem conta nunca vai ter a comunidade neste aparelho. Mandar para
    // /comunidades so troca um muro por outro e apaga de que pelada se tratava
    // -- exatamente o que um link compartilhado carrega.
    if (isGuestAccess(authState)) {
      return <AccountRequiredView pathname={location.pathname} />;
    }
    return <Navigate to={resolution.to} replace />;
  }

  const community = shell.comm.communities.find((item) => item.id === communityId) as Community;

  return <Outlet context={{ ...shell, community }} />;
}

export function CommunityOverviewRoute() {
  const shell = useCommunityShell();
  const navigate = useNavigate();
  const { community, play, sess, communityRules, auth, toasts } = shell;
  const permissions = useCommunityPermissions(community);
  const { currentMember, leave } = useCommunityMembers({
    communityCloudId: community.cloudId,
    communityLocalId: community.id,
    currentUserId: auth.user?.id ?? null,
    enabled: auth.isSupabaseConfigured && !!community.cloudId,
  });
  const communityPlayers = getCommunityPlayers(community.id, play.players);
  const podeSairAqui =
    permissions.membersResolved &&
    !permissions.canSeeManagement &&
    !!currentMember &&
    currentMember.role !== 'owner';

  const sair = async () => {
    if (!window.confirm('Tem certeza que deseja sair desta comunidade?')) return;
    try {
      await leave();
      navigate(paths.comunidades);
    } catch (erro) {
      toasts.push((erro as Error).message || 'Não foi possível sair da comunidade.', 'error');
    }
  };

  return (
    <div className="space-y-6">
      <CommunityOverviewArea
        community={community}
        players={play.players}
        sessions={sess.sessions}
        games={sess.games}
        pointEvents={sess.pointEvents}
        sessionReports={sess.sessionReports}
        canCreateSession={permissions.canCreateSession}
        canManageRoster={permissions.canEditPlayerProfile}
        onCreateSession={() =>
          shell.createSessionFromCommunity(
            community,
            communityPlayers.filter((player) => player.ativo).map((player) => player.id),
            communityRules.getRules(community),
          )
        }
      />
      {podeSairAqui && (
        <div className="flex justify-end">
          <button
            type="button"
            className="btn btn-ghost btn-sm min-h-[44px] text-error"
            onClick={() => void sair()}
          >
            Sair da comunidade
          </button>
        </div>
      )}
    </div>
  );
}

function useGestaoContext() {
  const shell = useCommunityShell();
  const navigate = useNavigate();
  const permissions = useCommunityPermissions(shell.community);
  const acesso = permissions.membersResolved
    ? resolveCommunityAreaAccess({
        area: 'gestao',
        canSeeManagement: permissions.canSeeManagement,
        communityId: shell.community.id,
      })
    : null;
  return { shell, navigate, permissions, acesso };
}

function GestaoTabs({
  communityId,
  ativa,
  canEditPlayerProfile,
}: {
  communityId: string;
  ativa: 'membros' | 'regras' | 'dados' | 'convidados';
  canEditPlayerProfile: boolean;
}) {
  return (
    <CommunityAreaTabs
      items={[
        { to: paths.gestao(communityId), label: 'Membros', active: ativa === 'membros' },
        { to: paths.regras(communityId), label: 'Regras', active: ativa === 'regras' },
        { to: paths.dados(communityId), label: 'Dados', active: ativa === 'dados' },
        ...(canEditPlayerProfile
          ? [
              {
                to: paths.convidados(communityId),
                label: 'Convidados',
                active: ativa === 'convidados',
              },
            ]
          : []),
      ]}
    />
  );
}

export function CommunityGestaoRoute() {
  const { shell, permissions, acesso } = useGestaoContext();
  const { community, play, auth } = shell;
  if (!acesso) return null;
  if (acesso.kind === 'redirect') return <Navigate to={acesso.to} replace />;

  return (
    <div className="space-y-5">
      <GestaoTabs
        communityId={community.id}
        ativa="membros"
        canEditPlayerProfile={permissions.canEditPlayerProfile}
      />
      <CommunityMembersPanel
        community={community}
        currentUserId={auth.user?.id ?? null}
        isSupabaseConfigured={auth.isSupabaseConfigured}
        globalRole={auth.profile?.role ?? null}
        players={getCommunityPlayers(community.id, play.players)}
        onLinkedPlayer={(player, communityId) =>
          play.setPlayers((prev) => applyLinkedCloudPlayer(prev, player, communityId))
        }
      />
    </div>
  );
}

export function CommunityGuestsRoute() {
  const { shell, permissions, acesso } = useGestaoContext();
  const { community, play, auth } = shell;
  const [searchParams] = useSearchParams();
  if (!acesso) return null;
  if (acesso.kind === 'redirect') return <Navigate to={acesso.to} replace />;
  if (!permissions.canEditPlayerProfile) {
    return <Navigate to={paths.comunidade(community.id)} replace />;
  }

  const guests = getCommunityPlayers(community.id, play.players).filter((player) => !player.userId);
  const noCloud = !community.cloudId || !auth.isSupabaseConfigured;

  return (
    <div className="space-y-5">
      <GestaoTabs
        communityId={community.id}
        ativa="convidados"
        canEditPlayerProfile={permissions.canEditPlayerProfile}
      />
      <CommunityGuestsArea
        guests={guests}
        noCloud={noCloud}
        onSave={(input) =>
          play.saveGuestPlayer({
            ...input,
            communityId: community.id,
            canEdit: permissions.canEditPlayerProfile,
            currentUserId: auth.user?.id ?? null,
          })
        }
        onRemove={(playerId) =>
          play.removeGuestPlayer({
            playerId,
            canEdit: permissions.canEditPlayerProfile,
            currentUserId: auth.user?.id ?? null,
          })
        }
        hasHistory={(playerId) => play.getPlayerHistoryUsage(playerId).hasHistory}
        searchSlot={
          permissions.canManageMembers ? (
            <AthleteUsernameSearch
              community={community}
              currentUserId={auth.user?.id ?? null}
              isSupabaseConfigured={auth.isSupabaseConfigured}
              onLinkedPlayer={(player, communityId) =>
                play.setPlayers((prev) => applyLinkedCloudPlayer(prev, player, communityId))
              }
            />
          ) : undefined
        }
        initialEditingId={searchParams.get('editar')}
      />
    </div>
  );
}

export function CommunityRulesRoute() {
  const { shell, permissions, acesso } = useGestaoContext();
  const { community, communityRules } = shell;
  if (!acesso) return null;
  if (acesso.kind === 'redirect') return <Navigate to={acesso.to} replace />;

  return (
    <div className="space-y-5">
      <GestaoTabs
        communityId={community.id}
        ativa="regras"
        canEditPlayerProfile={permissions.canEditPlayerProfile}
      />
      <CommunityRulesArea
        rules={communityRules.getRules(community)}
        canEditRules={permissions.canEditRules}
        onSave={(draftRules) => {
          try {
            communityRules.saveRules(draftRules, permissions.canEditRules);
          } catch (err) {
            if ((err as Error).message === 'PERMISSION_DENIED') {
              alert('Erro: Ação não autorizada pelo nível de permissão.');
            }
          }
        }}
      />
    </div>
  );
}

export function CommunityDataRoute() {
  const { shell, navigate, permissions, acesso } = useGestaoContext();
  const { community, play, sess, comm } = shell;
  if (!acesso) return null;
  if (acesso.kind === 'redirect') return <Navigate to={acesso.to} replace />;

  return (
    <div className="space-y-5">
      <GestaoTabs
        communityId={community.id}
        ativa="dados"
        canEditPlayerProfile={permissions.canEditPlayerProfile}
      />
      <CommunityDataArea
        community={community}
        players={play.players}
        sessions={sess.sessions}
        canEditRules={permissions.canEditRules}
        canDeleteCommunity={permissions.canDeleteCommunity}
        canClearHistory={permissions.canClearHistory}
        canExportCommunity={permissions.canExportCommunity}
        onUpdateCommunity={(id, patch) => {
          try {
            return comm.updateCommunity(id, patch, permissions.canEditRules);
          } catch (err) {
            if ((err as Error).message === 'PERMISSION_DENIED') {
              alert('Erro: Ação não autorizada pelo nível de permissão.');
            }
            return false;
          }
        }}
        onDeleteCommunity={(id) => {
          if (!permissions.canDeleteCommunity) {
            alert('Erro: Ação não autorizada pelo nível de permissão.');
            return;
          }
          if (!window.confirm('Excluir esta comunidade? Os atletas continuarão cadastrados.')) {
            return;
          }
          shell.deleteCommunityAggregate(id);
          navigate(paths.comunidades);
        }}
        onDuplicateCommunity={(id, includeAthletes) => {
          if (!permissions.canExportCommunity) return;
          const result = comm.duplicateCommunity(id, includeAthletes);
          if (result?.includeAthletes) {
            play.setPlayers((prev) =>
              applyCommunityMembershipDuplicate(prev, {
                sourceCommunityId: id,
                duplicateCommunityId: result.duplicate.id,
              }),
            );
          }
        }}
        onClearCommunityHistory={(id) => {
          if (!permissions.canClearHistory) {
            alert('Erro: Ação não autorizada pelo nível de permissão.');
            return;
          }
          sess.setSessions((prev) => applyCommunityHistoryClear(prev, id));
        }}
      />
    </div>
  );
}

export function CommunityPeopleRoute() {
  const shell = useCommunityShell();
  const navigate = useNavigate();
  const { community, play, sess, comm, auth } = shell;
  const permissions = useCommunityPermissions(community);
  const communityPlayers = getCommunityPlayers(community.id, play.players);

  return (
    <PlayersView
      contract={buildPlayersViewContract({
        roster: {
          community,
          canManageMembers: permissions.canManageMembers,
          currentUserId: auth.user?.id ?? null,
          isSupabaseConfigured: auth.isSupabaseConfigured,
        },
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
        onCreatePlayerInCommunity: (name) => shell.createPlayerForCommunity(name, community.id),
        onLinkedCloudPlayer: (player, communityId) =>
          play.setPlayers((prev) => applyLinkedCloudPlayer(prev, player, communityId)),
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
    const action = resolvePlayerEditAction({
      playerId,
      targetPlayerId: targetPlayer?.id,
      editingPlayerId: play.editingPlayer?.id,
      hasEditingPlayer: Boolean(play.editingPlayer),
    });
    if (action === 'add-new') play.handleAddPlayer();
    else if (action === 'edit-existing' && targetPlayer) play.handleEditPlayer(targetPlayer);
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
            if (play.handleSavePlayer(permissions, community.id, !play.editingPlayer.cloudId))
              goBack();
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

export function CommunityLeaguesRoute() {
  const shell = useCommunityShell();
  const { community, play, sess, championships } = shell;
  const permissions = useCommunityPermissions(community);

  return (
    <CommunityLeaguesArea
      community={community}
      players={getCommunityPlayers(community.id, play.players)}
      games={sess.games}
      pointEvents={sess.pointEvents}
      sessionTeams={sess.teams}
      championships={championships.championships}
      championshipTeams={championships.championshipTeams}
      championshipRounds={championships.championshipRounds}
      canManage={permissions.canEditRules}
      onCreateChampionship={championships.create}
      onMaterializeRound={shell.materializeChampionshipRound}
      onDeleteChampionship={shell.deleteChampionshipAggregate}
      onRescheduleRound={championships.rescheduleRound}
      onSetRoundSkipped={championships.setRoundSkipped}
      onUpdateChampionshipRecurrence={championships.updateRecurrence}
    />
  );
}

function DesempenhoTabs({
  communityId,
  ativa,
}: {
  communityId: string;
  ativa: 'ranking' | 'estatisticas' | 'historico';
}) {
  return (
    <CommunityAreaTabs
      items={[
        { to: paths.desempenho(communityId), label: 'Ranking', active: ativa === 'ranking' },
        {
          to: paths.estatisticas(communityId),
          label: 'Estatísticas',
          active: ativa === 'estatisticas',
        },
        { to: paths.historico(communityId), label: 'Histórico', active: ativa === 'historico' },
      ]}
    />
  );
}

export function CommunityPerformanceRoute() {
  const { community, play, sess } = useCommunityShell();

  return (
    <LegacyQueryRedirect>
      <div className="space-y-5">
        <DesempenhoTabs communityId={community.id} ativa="ranking" />
        <CommunityRankingArea
          community={community}
          players={play.players}
          sessions={sess.sessions}
          games={sess.games}
          pointEvents={sess.pointEvents}
          teams={sess.teams}
          sessionReports={sess.sessionReports}
        />
      </div>
    </LegacyQueryRedirect>
  );
}

export function CommunityStatsRoute() {
  const { community, play, sess } = useCommunityShell();

  return (
    <div className="space-y-5">
      <DesempenhoTabs communityId={community.id} ativa="estatisticas" />
      <RankingModule
        players={getCommunityPlayers(community.id, play.players)}
        games={sess.games}
        pointEvents={sess.pointEvents}
        teams={sess.teams}
        sessions={getCommunitySessions(community.id, sess.sessions)}
      />
    </div>
  );
}

export function CommunityHistoryRoute() {
  const { community, play, sess } = useCommunityShell();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const selectedSessionId = searchParams.get('sessao');

  return (
    <div className="space-y-5">
      <DesempenhoTabs communityId={community.id} ativa="historico" />
      <HistoryView
        contract={buildHistoryViewContract({
          sessions: getCommunitySessions(community.id, sess.sessions),
          games: sess.games,
          pointEvents: sess.pointEvents,
          teams: sess.teams,
          players: play.players,
          sessionReports: sess.sessionReports,
          selectedHistorySessionId: selectedSessionId,
          setSelectedHistorySessionId: (id) =>
            navigate(
              id ? paths.historico(community.id, { sessao: id }) : paths.historico(community.id),
            ),
          onDeleteSession: (sessionId) => {
            sess.deleteSession(sessionId);
            navigate(paths.historico(community.id));
          },
          onBackToDashboard: () => navigate(paths.comunidade(community.id)),
          initialTab: 'sessions',
          hideTabs: false,
        })}
      />
    </div>
  );
}
