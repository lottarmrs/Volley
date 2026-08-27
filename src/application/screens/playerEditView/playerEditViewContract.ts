import type { Dispatch, SetStateAction } from 'react';
import type { Community, Game, Player, PointEvent, Session, Team } from '@shared/types';
import type { ScreenContract } from '../screenContract';
import type { PlayerEditViewPermissions, PlayerEditViewModel } from './playerEditViewModel';
import type { PlayerEditViewIntent } from './playerEditViewIntents';

export interface PlayerEditViewContractInput {
  editingPlayer: Player;
  setEditingPlayer: Dispatch<SetStateAction<Player | null>>;
  players: Player[];
  games: Game[];
  pointEvents: PointEvent[];
  teams: Team[];
  communities: Community[];
  sessions: Session[];
  validationErrors: Record<string, string>;
  showDeleteConfirm: boolean;
  setShowDeleteConfirm: Dispatch<SetStateAction<boolean>>;
  permissions?: PlayerEditViewPermissions;
  currentUserId?: string | null;
  onBack: () => void;
  onSave: () => void;
  onDelete: () => void;
}

function buildModel(input: PlayerEditViewContractInput): PlayerEditViewModel {
  return {
    editingPlayer: input.editingPlayer,
    players: input.players,
    games: input.games,
    pointEvents: input.pointEvents,
    teams: input.teams,
    communities: input.communities,
    sessions: input.sessions,
    validationErrors: input.validationErrors,
    showDeleteConfirm: input.showDeleteConfirm,
    permissions: input.permissions,
    currentUserId: input.currentUserId,
  };
}

export function buildPlayerEditViewContract(
  input: PlayerEditViewContractInput,
): ScreenContract<PlayerEditViewModel, PlayerEditViewIntent> {
  const model = buildModel(input);
  const dispatch = async (intent: PlayerEditViewIntent): Promise<void> => {
    switch (intent.kind) {
      case 'setEditingPlayer':
        input.setEditingPlayer(intent.player);
        return;
      case 'setShowDeleteConfirm':
        input.setShowDeleteConfirm(intent.value);
        return;
      case 'back':
        input.onBack();
        return;
      case 'save':
        input.onSave();
        return;
      case 'delete':
        input.onDelete();
        return;
    }
  };
  return { model, dispatch };
}
