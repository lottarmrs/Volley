/// <reference lib="webworker" />
import { balanceTeams } from './balancing';
import type { BalanceRequest, BalanceResponse } from './balancerMessages';

self.onmessage = (e: MessageEvent<BalanceRequest>) => {
  const { players, numTeams, sessionId, config } = e.data;
  const post = (m: BalanceResponse) => self.postMessage(m);
  try {
    const divisions = balanceTeams(players, numTeams, sessionId, config, (percent, bestScore) =>
      post({ type: 'progress', percent, bestScore }),
    );
    post({ type: 'done', divisions });
  } catch (err) {
    post({ type: 'error', message: (err as Error).message });
  }
};
