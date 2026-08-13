import type {
  AuthRole,
  Championship,
  ChampionshipRound,
  ChampionshipTeam,
  Community,
  CommunityRules,
  Game,
  Player,
  PointEvent,
  Session,
  SessionReport,
  Team,
} from '@shared/types';
import type { CreateChampionshipInput } from '@app/championshipUseCases';
import type { AppResult } from '@app/appResult';
import type { ScreenContract } from '../screenContract';
import type {
  CommunityPresenceApi,
  CommunitiesViewModel,
  CommunityTab,
  RulesApi,
  WhatsAppApi,
} from './communitiesViewModel';
import type { CommunitiesViewIntent } from './communitiesViewIntents';

export interface CommunitiesViewContractInput {
  communities: Community[];
  players: Player[];
  sessions: Session[];
  games: Game[];
  pointEvents: PointEvent[];
  teams: Team[];
  sessionReports: SessionReport[];
  championships: Championship[];
  championshipTeams: ChampionshipTeam[];
  championshipRounds: ChampionshipRound[];
  presenceApi: CommunityPresenceApi;
  whatsAppApi: WhatsAppApi;
  rulesApi: RulesApi;
  currentUserId: string | null;
  isSupabaseConfigured: boolean;
  globalRole: AuthRole | null;
  selectedCommunityId: string | null;
  initialCommunityTab?: CommunityTab;
  onSelectCommunity: (communityId: string | null) => void;
  onBack: () => void;
  onAddCommunity: (input: Partial<Community>) => Community;
  onUpdateCommunity: (communityId: string, patch: Partial<Community>, allowed?: boolean) => boolean;
  onDeleteCommunity: (communityId: string) => void;
  onDuplicateCommunity: (communityId: string, includeAthletes: boolean) => void;
  onUpdatePlayerCommunities: (communityId: string, playerIds: string[]) => void;
  onCreatePlayer: (name: string, communityId: string) => void;
  onCreateSession: (community: Community, playerIds: string[], rules: CommunityRules) => void;
  onViewSession: (sessionId: string) => void;
  onClearCommunityHistory: (communityId: string) => void;
  onCreateChampionship: (input: CreateChampionshipInput) => AppResult<unknown>;
  onMaterializeRound: (roundId: string) => AppResult<{ sessionId: string }>;
  onDeleteChampionship: (championshipId: string) => void;
  onRescheduleRound: (roundId: string, scheduledDate: string) => AppResult<unknown>;
  onSetRoundSkipped: (roundId: string, skipped: boolean) => AppResult<unknown>;
  onUpdateChampionshipRecurrence: (
    championshipId: string,
    recurrenceRule: Championship['recurrenceRule'],
  ) => AppResult<unknown>;
  onLinkedCloudPlayer?: (player: Player, communityId: string) => void;
}

function buildModel(input: CommunitiesViewContractInput): CommunitiesViewModel {
  return {
    communities: input.communities,
    players: input.players,
    sessions: input.sessions,
    games: input.games,
    pointEvents: input.pointEvents,
    teams: input.teams,
    sessionReports: input.sessionReports,
    championships: input.championships,
    championshipTeams: input.championshipTeams,
    championshipRounds: input.championshipRounds,
    presenceApi: input.presenceApi,
    whatsAppApi: input.whatsAppApi,
    rulesApi: input.rulesApi,
    currentUserId: input.currentUserId,
    isSupabaseConfigured: input.isSupabaseConfigured,
    globalRole: input.globalRole,
    selectedCommunityId: input.selectedCommunityId,
    initialCommunityTab: input.initialCommunityTab,
    addCommunity: input.onAddCommunity,
    updateCommunity: input.onUpdateCommunity,
    createChampionship: input.onCreateChampionship,
    materializeRound: input.onMaterializeRound,
    rescheduleRound: input.onRescheduleRound,
    setRoundSkipped: input.onSetRoundSkipped,
    updateChampionshipRecurrence: input.onUpdateChampionshipRecurrence,
  };
}

export function buildCommunitiesViewContract(
  input: CommunitiesViewContractInput,
): ScreenContract<CommunitiesViewModel, CommunitiesViewIntent> {
  const model = buildModel(input);
  const dispatch = async (intent: CommunitiesViewIntent): Promise<void> => {
    switch (intent.kind) {
      case 'back':
        input.onBack();
        return;
      case 'addCommunity':
        input.onAddCommunity(intent.input);
        return;
      case 'updateCommunity':
        input.onUpdateCommunity(intent.communityId, intent.patch, intent.allowed);
        return;
      case 'deleteCommunity':
        input.onDeleteCommunity(intent.communityId);
        return;
      case 'duplicateCommunity':
        input.onDuplicateCommunity(intent.communityId, intent.includeAthletes);
        return;
      case 'updatePlayerCommunities':
        input.onUpdatePlayerCommunities(intent.communityId, intent.playerIds);
        return;
      case 'createPlayer':
        input.onCreatePlayer(intent.name, intent.communityId);
        return;
      case 'createSession':
        input.onCreateSession(intent.community, intent.playerIds, intent.rules);
        return;
      case 'viewSession':
        input.onViewSession(intent.sessionId);
        return;
      case 'clearCommunityHistory':
        input.onClearCommunityHistory(intent.communityId);
        return;
      case 'createChampionship':
        input.onCreateChampionship(intent.input);
        return;
      case 'materializeRound':
        input.onMaterializeRound(intent.roundId);
        return;
      case 'deleteChampionship':
        input.onDeleteChampionship(intent.championshipId);
        return;
      case 'rescheduleRound':
        input.onRescheduleRound(intent.roundId, intent.scheduledDate);
        return;
      case 'setRoundSkipped':
        input.onSetRoundSkipped(intent.roundId, intent.skipped);
        return;
      case 'updateChampionshipRecurrence':
        input.onUpdateChampionshipRecurrence(intent.championshipId, intent.recurrenceRule);
        return;
      case 'linkedCloudPlayer':
        if (input.onLinkedCloudPlayer) input.onLinkedCloudPlayer(intent.player, intent.communityId);
        return;
      case 'selectCommunity':
        input.onSelectCommunity(intent.communityId);
        return;
    }
  };
  return { model, dispatch };
}
