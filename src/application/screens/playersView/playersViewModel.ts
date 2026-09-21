import type { Community, Game, Player, PointEvent, Session, Team } from '@shared/types';

export interface CommunityRosterContext {
  community: Community;
  canManageMembers: boolean;
  currentUserId: string | null;
  isSupabaseConfigured: boolean;
}

export interface PlayersViewModel {
  roster: CommunityRosterContext | null;
  players: Player[];
  communities: Community[];
  games: Game[];
  pointEvents: PointEvent[];
  teams: Team[];
  sessions: Session[];
}
