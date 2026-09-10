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
      post({ type: 'error', code: outcome.refusal.code, message: outcome.refusal.message });
      return;
    }
    post({ type: 'done', candidates: outcome.candidates, fingerprint: outcome.fingerprint });
  } catch (error) {
    // Classified once, at the boundary, so every consumer receives the same stable code.
    post(buildBalanceErrorResponse(error));
  }
};
