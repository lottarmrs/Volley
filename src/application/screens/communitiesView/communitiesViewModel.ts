import type {
  AuthRole,
  Championship,
  ChampionshipRound,
  ChampionshipTeam,
  Community,
  CommunityPresence,
  CommunityPresenceStatus,
  CommunityRules,
  Game,
  Player,
  PointEvent,
  Session,
  SessionReport,
  Team,
  WhatsAppListDraft,
  WhatsAppListTemplate,
} from '@shared/types';
import type { CreateChampionshipInput } from '@app/championshipUseCases';
import type { AppResult } from '@app/appResult';

export interface CommunityPresenceApi {
  getPresence: (communityId: string) => CommunityPresence | null;
  setPresenceStatus: (
    communityId: string,
    playerId: string,
    status: CommunityPresenceStatus,
  ) => void;
  clearPresence: (communityId: string) => void;
  selectFrequentPlayers: (communityId: string, players: Player[]) => void;
  useLastPresence: (communityId: string) => void;
  addGuest: (communityId: string, temporaryName: string) => void;
  getPresentPlayers: (communityId: string, players: Player[]) => Player[];
}

export interface WhatsAppApi {
  saveTemplate: (template: WhatsAppListTemplate) => void;
  saveDraft: (draft: WhatsAppListDraft) => void;
  getCommunityTemplates: (communityId: string) => WhatsAppListTemplate[];
  getLatestDraft: (communityId: string) => WhatsAppListDraft | undefined;
}

export interface RulesApi {
  getRules: (community: Community) => CommunityRules;
  saveRules: (rules: CommunityRules, allowed?: boolean) => void;
  removeRules: (communityId: string) => void;
}

export interface CommunitiesViewModel {
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
  // ponytail: estes callbacks tem retorno consumido de forma sincrona pela view
  // (handleAdd le .id; CommunityRulesTab le o boolean; ChampionshipsTab le .ok).
  // dispatch eh async (Promise<void>) e ignora o retorno, entao sigam pelo Model.
  addCommunity: (input: Partial<Community>) => Community;
  updateCommunity: (communityId: string, patch: Partial<Community>, allowed?: boolean) => boolean;
  createChampionship: (input: CreateChampionshipInput) => AppResult<unknown>;
  materializeRound: (roundId: string) => AppResult<{ sessionId: string }>;
  rescheduleRound: (roundId: string, scheduledDate: string) => AppResult<unknown>;
  setRoundSkipped: (roundId: string, skipped: boolean) => AppResult<unknown>;
  updateChampionshipRecurrence: (
    championshipId: string,
    recurrenceRule: Championship['recurrenceRule'],
  ) => AppResult<unknown>;
}
