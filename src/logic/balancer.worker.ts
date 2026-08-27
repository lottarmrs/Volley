import { balanceSnapshots } from './balancing';
import { buildBalanceErrorResponse } from './balancerMessages';
import type { BalanceRequest, BalanceResponse } from './balancerMessages';

self.onmessage = (event: MessageEvent<BalanceRequest>) => {
  const { snapshots, numTeams, config, partnershipMatrix } = event.data;
  const post = (message: BalanceResponse) => self.postMessage(message);
  try {
    const candidates = balanceSnapshots(
      snapshots,
      numTeams,
      config,
      (percent, bestScore) => post({ type: 'progress', percent, bestScore }),
      partnershipMatrix,
    );
    post({ type: 'done', candidates });
  } catch (error) {
    // Classified once, at the boundary, so every consumer receives the same stable code.
    post(buildBalanceErrorResponse(error));
  }
};
