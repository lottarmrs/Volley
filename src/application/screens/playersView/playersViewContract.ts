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
    }
  };
  return { model, dispatch };
}
