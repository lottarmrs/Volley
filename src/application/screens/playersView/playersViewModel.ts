import type { Community, Game, Player, PointEvent, Session, Team } from '@shared/types';

export interface PlayersViewModel {
  players: Player[];
  communities: Community[];
  games: Game[];
  pointEvents: PointEvent[];
  teams: Team[];
  sessions: Session[];
}
