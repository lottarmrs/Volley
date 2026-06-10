import { CloudSyncStatus } from '../types';

interface MaybeSyncable {
  syncStatus?: CloudSyncStatus;
}

/**
 * Counts how many records across the given collections still have unsynced local
 * changes (`syncStatus === 'pending'`). Used to surface a "N pending changes"
 * badge so the user knows a sync is due.
 */
export function countPendingChanges(collections: MaybeSyncable[][]): number {
  return collections.reduce(
    (total, list) => total + list.filter((item) => item?.syncStatus === 'pending').length,
    0,
  );
}
