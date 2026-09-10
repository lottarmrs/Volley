import { solveTeamFormationDirect } from '../application/teamFormationPort';
import { buildBalanceErrorResponse } from './balancerMessages';
import type { BalanceRequest, BalanceResponse } from './balancerMessages';

self.onmessage = (event: MessageEvent<BalanceRequest>) => {
  const { request, partnershipMatrix } = event.data;
  const post = (message: BalanceResponse) => self.postMessage(message);
  try {
    const outcome = solveTeamFormationDirect(request, partnershipMatrix, (percent, bestScore) =>
      post({ type: 'progress', percent, bestScore }),
    );
    if (!outcome.ok) {
      const code =
        outcome.refusal.code === 'ALGORITHM_VERSION_MISMATCH'
          ? 'TECHNICAL_ERROR'
          : 'INFEASIBLE_CONSTRAINTS';
      post({ type: 'error', code, message: outcome.refusal.message });
      return;
    }
    post({ type: 'done', candidates: outcome.candidates, fingerprint: outcome.fingerprint });
  } catch (error) {
    post(buildBalanceErrorResponse(error));
  }
};
