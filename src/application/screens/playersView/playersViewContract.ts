import type { Community, Game, Player, PointEvent, Session, Team } from '@shared/types';
import type { ScreenContract } from '../screenContract';
import type { CommunityRosterContext, PlayersViewModel } from './playersViewModel';
import type { PlayersViewIntent } from './playersViewIntents';

export interface PlayersViewContractInput {
  roster?: CommunityRosterContext | null;
  players: Player[];
  communities: Community[];
  games: Game[];
  pointEvents: PointEvent[];
  teams: Team[];
  sessions: Session[];
  onBack: () => void;
  onAddPlayer: () => void;
  onEditPlayer: (player: Player) => void;
  onRestoreDemoPlayers: () => void;
  onAddGuestPlayer: (player: Player, editDetails: boolean) => void;
  onCreatePlayerInCommunity?: (name: string) => void;
  onLinkedCloudPlayer?: (player: Player, communityId: string) => void;
}

function buildModel(input: PlayersViewContractInput): PlayersViewModel {
  return {
    roster: input.roster ?? null,
    players: input.players,
    communities: input.communities,
    games: input.games,
    pointEvents: input.pointEvents,
    teams: input.teams,
    sessions: input.sessions,
  };
}

export function buildPlayersViewContract(
  input: PlayersViewContractInput,
): ScreenContract<PlayersViewModel, PlayersViewIntent> {
  const model = buildModel(input);
  const dispatch = async (intent: PlayersViewIntent): Promise<void> => {
    switch (intent.kind) {
      case 'back':
        input.onBack();
        return;
      case 'addPlayer':
        input.onAddPlayer();
        return;
      case 'editPlayer':
        input.onEditPlayer(intent.player);
        return;
      case 'restoreDemoPlayers':
        input.onRestoreDemoPlayers();
        return;
      case 'addGuestPlayer':
        input.onAddGuestPlayer(intent.player, intent.editDetails);
        return;
      case 'createPlayerInCommunity':
        input.onCreatePlayerInCommunity?.(intent.name);
        return;
      case 'linkedCloudPlayer':
        input.onLinkedCloudPlayer?.(intent.player, intent.communityId);
        return;
    }
  };
  return { model, dispatch };
}
