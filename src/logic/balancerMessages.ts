import type {
  BalanceCandidate,
  FreePlayConfig,
  PlayerBalanceSnapshot,
  TournamentConfig,
} from '../types';
import type { PartnershipMatrix } from './partnershipHistory';
import { InfeasibleConstraintsError } from './balancing';

export interface BalanceRequest {
  type: 'balance';
  snapshots: PlayerBalanceSnapshot[];
  numTeams: number;
  config?: TournamentConfig | FreePlayConfig;
  partnershipMatrix?: PartnershipMatrix;
}

/**
 * Stable error codes crossing the worker boundary.
 *
 * The message is user-facing pt-BR and may be reworded at any time; the CODE is the
 * contract callers branch on. Before this, the UI had to decide whether a failure was a
 * domain refusal or a broken worker by inspecting a translated string.
 *
 * The split mirrors the XS-W0-05 outcome vocabulary: INFEASIBLE_CONSTRAINTS is a
 * DOMAIN_REJECTION that retrying cannot fix, TECHNICAL_ERROR is a TECHNICAL_FAILURE that
 * a retry might.
 */
export const INFEASIBLE_CONSTRAINTS = 'INFEASIBLE_CONSTRAINTS';
export const TECHNICAL_ERROR = 'TECHNICAL_ERROR';

export type BalanceErrorCode = typeof INFEASIBLE_CONSTRAINTS | typeof TECHNICAL_ERROR;

export interface BalanceErrorResponse {
  type: 'error';
  code: BalanceErrorCode;
  message: string;
}

export type BalanceResponse =
  | { type: 'progress'; percent: number; bestScore: number }
  | { type: 'done'; candidates: BalanceCandidate[] }
  | BalanceErrorResponse;

/**
 * Classifies a thrown value into the stable error contract.
 *
 * Only an error the domain deliberately typed counts as infeasible. Anything else is
 * technical by default, so an unexpected crash is never mistaken for "these constraints
 * are impossible" and shown to the user as a rules problem.
 */
export function buildBalanceErrorResponse(error: unknown): BalanceErrorResponse {
  if (error instanceof InfeasibleConstraintsError) {
    return { type: 'error', code: INFEASIBLE_CONSTRAINTS, message: error.message };
  }

  const message = error instanceof Error ? error.message : String(error);
  return { type: 'error', code: TECHNICAL_ERROR, message };
}
