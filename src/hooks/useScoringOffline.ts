import { useEffect, useRef } from 'react';
import { scoringOfflineFor } from '@app/scoringLock';
import { useConnectivity } from './useConnectivity';

export function useScoringOffline(sess: {
  online: boolean;
  status: { offline: boolean };
  refresh: () => unknown;
}): boolean {
  const { state, onlineAt } = useConnectivity();
  const firstOnlineAt = useRef(onlineAt);
  const { refresh, online } = sess;
  useEffect(() => {
    if (!online || onlineAt === firstOnlineAt.current) return;
    void refresh();
  }, [onlineAt, online, refresh]);
  return scoringOfflineFor({
    online: sess.online,
    connectivity: state,
    lastWriteOffline: sess.status.offline,
  });
}
