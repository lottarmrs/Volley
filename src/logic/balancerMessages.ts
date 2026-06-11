import { Player, TournamentConfig, FreePlayConfig, Division } from '../types';
import { PartnershipMatrix } from './partnershipHistory';

export interface BalanceRequest {
  type: 'balance';
  players: Player[];
  numTeams: number;
  sessionId: string;
  config?: TournamentConfig | FreePlayConfig;
  partnershipMatrix?: PartnershipMatrix;
}

export type BalanceResponse =
  | { type: 'progress'; percent: number; bestScore: number; partial?: Division }
  | { type: 'done'; divisions: Division[] }
  | { type: 'error'; message: string };
