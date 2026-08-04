import type { Dispatch, SetStateAction } from 'react';
import type { FreePlayConfig, Game, GameReport, Player, PointEvent, Session, Team } from '@shared/types';
import type { ScreenContract } from '../screenContract';
import type { SessionActiveViewModel } from './sessionActiveViewModel';
import type { SessionActiveViewIntent } from './sessionActiveViewIntents';

export interface SessionActiveViewContractInput {
  activeSession: Session;
  games: Game[];
  pointEvents: PointEvent[];
  players: Player[];
  sessionTeams: Team[];
  gameReports: GameReport[];
  currentDeviceId: string;
  setGames: Dispatch<SetStateAction<Game[]>>;
  setPointEvents: Dispatch<SetStateAction<PointEvent[]>>;
  setGameReports: Dispatch<SetStateAction<GameReport[]>>;
  setActiveSession: (s: Session) => void;
  onExit: () => void;
  onFinishSession: () => void;
}

export function buildSessionActiveViewContract(
  input: SessionActiveViewContractInput,
): ScreenContract<SessionActiveViewModel, SessionActiveViewIntent> {
  const model: SessionActiveViewModel = {
    activeSession: input.activeSession,
    games: input.games,
    pointEvents: input.pointEvents,
    players: input.players,
    sessionTeams: input.sessionTeams,
    gameReports: input.gameReports,
    currentDeviceId: input.currentDeviceId,
    setGames: input.setGames,
    setPointEvents: input.setPointEvents,
    setGameReports: input.setGameReports,
    setActiveSession: input.setActiveSession,
  };
  const dispatch = async (intent: SessionActiveViewIntent): Promise<void> => {
    switch (intent.kind) {
      case 'updateFreePlayQueue':
        input.setActiveSession({
          ...input.activeSession,
          config: {
            ...(input.activeSession.config as FreePlayConfig),
            initialQueue: intent.newQueue,
          },
        });
        return;
      case 'exit':
        input.onExit();
        return;
      case 'finishSession':
        input.onFinishSession();
        return;
    }
  };
  return { model, dispatch };
}
