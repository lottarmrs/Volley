import type { BalanceCandidate, TeamFormationRequest } from '@shared/types';
import {
  fingerprintFormation,
  precheckFormation,
  summarizePartnershipMatrix,
  type FormationRefusal,
} from '@domain/teamFormation';
import { balanceSnapshots } from '../logic/balancing';
import type { PartnershipMatrix } from '../logic/partnershipHistory';

export type FormationOutcome =
  | { ok: true; candidates: BalanceCandidate[]; fingerprint: string }
  | { ok: false; refusal: FormationRefusal };

const ENGINE_ALGORITHM_VERSION = 'simulated-annealing-v1';

export function solveTeamFormationDirect(
  request: TeamFormationRequest,
  partnershipMatrix?: PartnershipMatrix,
  onProgress?: (percent: number, bestScore: number) => void,
): FormationOutcome {
  const refusal = precheckFormation(request);
  if (refusal) return { ok: false, refusal };

  if (request.algorithmVersion !== ENGINE_ALGORITHM_VERSION) {
    return {
      ok: false,
      refusal: {
        code: 'ALGORITHM_VERSION_MISMATCH',
        message: `O motor executa ${ENGINE_ALGORITHM_VERSION}, e o pedido declara ${request.algorithmVersion}.`,
      },
    };
  }

  const candidates = balanceSnapshots(
    request.participants as never,
    request.teamCount,
    {
      balanceMode: request.objective.mode,
      rotationType: request.objective.rotationType,
      repetitionWeight: request.objective.repetitionWeight,
      balanceConstraints: request.hardConstraints,
      balanceSeed: request.seed,
      teamCount: request.teamCount,
    } as never,
    onProgress,
    partnershipMatrix,
    request.budget,
  );

  return {
    ok: true,
    candidates,
    fingerprint: fingerprintFormation(
      request,
      candidates,
      summarizePartnershipMatrix(partnershipMatrix ?? null),
    ),
  };
}
