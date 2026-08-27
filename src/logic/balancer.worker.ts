import { balanceSnapshots } from './balancing';
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
    post({ type: 'error', message: (error as Error).message });
  }
};
