import type {
  BalanceCandidate,
  FreePlayConfig,
  PlayerBalanceSnapshot,
  TournamentConfig,
} from '../types';
import type { PartnershipMatrix } from './partnershipHistory';

export interface BalanceRequest {
  type: 'balance';
  snapshots: PlayerBalanceSnapshot[];
  numTeams: number;
  config?: TournamentConfig | FreePlayConfig;
  partnershipMatrix?: PartnershipMatrix;
}

export type BalanceResponse =
  | { type: 'progress'; percent: number; bestScore: number }
  | { type: 'done'; candidates: BalanceCandidate[] }
  | { type: 'error'; message: string };
