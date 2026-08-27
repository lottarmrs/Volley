import type { Community, Game, Player, PointEvent, Session, Team } from '@shared/types';

export interface PlayerEditViewPermissions {
  canEditPlayerProfile: boolean;
  canEvaluatePlayer: boolean;
}

export interface PlayerEditViewModel {
  editingPlayer: Player;
  players: Player[];
  games: Game[];
  pointEvents: PointEvent[];
  teams: Team[];
  communities: Community[];
  sessions: Session[];
  validationErrors: Record<string, string>;
  showDeleteConfirm: boolean;
  permissions?: PlayerEditViewPermissions;
  currentUserId?: string | null;
}
