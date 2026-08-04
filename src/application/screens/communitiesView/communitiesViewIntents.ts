import type {
  Championship,
  Community,
  CommunityRules,
  Player,
} from '@shared/types';
import type { CreateChampionshipInput } from '@app/championshipUseCases';

export type CommunitiesViewIntent =
  | { kind: 'back' }
  | { kind: 'addCommunity'; input: Partial<Community> }
  | { kind: 'updateCommunity'; communityId: string; patch: Partial<Community>; allowed?: boolean }
  | { kind: 'deleteCommunity'; communityId: string }
  | { kind: 'duplicateCommunity'; communityId: string; includeAthletes: boolean }
  | { kind: 'updatePlayerCommunities'; communityId: string; playerIds: string[] }
  | { kind: 'createPlayer'; name: string; communityId: string }
  | { kind: 'createSession'; community: Community; playerIds: string[]; rules: CommunityRules }
  | { kind: 'viewSession'; sessionId: string }
  | { kind: 'clearCommunityHistory'; communityId: string }
  | { kind: 'createChampionship'; input: CreateChampionshipInput }
  | { kind: 'materializeRound'; roundId: string }
  | { kind: 'deleteChampionship'; championshipId: string }
  | { kind: 'rescheduleRound'; roundId: string; scheduledDate: string }
  | { kind: 'setRoundSkipped'; roundId: string; skipped: boolean }
  | {
      kind: 'updateChampionshipRecurrence';
      championshipId: string;
      recurrenceRule: Championship['recurrenceRule'];
    }
  | { kind: 'linkedCloudPlayer'; player: Player; communityId: string };
