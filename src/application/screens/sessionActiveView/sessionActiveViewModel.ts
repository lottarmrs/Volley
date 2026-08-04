import type { Dispatch, SetStateAction } from 'react';
import type { Game, GameReport, Player, PointEvent, Session, Team } from '@shared/types';

export interface SessionActiveViewModel {
  // dados read-only (7)
  activeSession: Session;
  games: Game[];
  pointEvents: PointEvent[];
  players: Player[];
  sessionTeams: Team[];
  gameReports: GameReport[];
  currentDeviceId: string;
  // ponytail: setters no model p/ shallow contract alimentar o hook interno sem extraí-lo ao shell.
  // sync-safe: NÃO são functional updaters — são pass-through. Os 19 (prev)=>… ficam DENTRO do hook.
  setGames: Dispatch<SetStateAction<Game[]>>;
  setPointEvents: Dispatch<SetStateAction<PointEvent[]>>;
  setGameReports: Dispatch<SetStateAction<GameReport[]>>;
  setActiveSession: (s: Session) => void;
}
