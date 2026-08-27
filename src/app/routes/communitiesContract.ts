import { useNavigate } from 'react-router';
import { paths } from '@app/appRoutes';
import { buildCommunitiesViewContract } from '@app/screens/communitiesView/communitiesViewContract';
import type { CommunityTab } from '@app/screens/communitiesView/communitiesViewModel';
import {
  applyCommunityHistoryClear,
  applyCommunityMembershipDuplicate,
  applyLinkedCloudPlayer,
  applyPlayerCommunityMemberships,
} from '@app/localCommunityUseCases';
import { useShell } from '../shellContext';

export function useCommunitiesContract(input: {
  selectedCommunityId: string | null;
  initialCommunityTab?: CommunityTab;
}) {
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
    selectedCommunityId: input.selectedCommunityId,
    initialCommunityTab: input.initialCommunityTab,
    onSelectCommunity: (communityId) =>
      navigate(communityId ? paths.comunidade(communityId) : paths.comunidades),
    onBack: () => navigate(paths.painel),
    onAddCommunity: comm.addCommunity,
    onUpdateCommunity: comm.updateCommunity,
    onDeleteCommunity: (communityId) => {
      if (!window.confirm('Excluir esta comunidade? Os atletas continuarão cadastrados.')) return;
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
      const communityId = session?.communityId ?? input.selectedCommunityId;
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
