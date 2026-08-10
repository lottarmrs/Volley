import { CloudSyncStatus } from '../types';

interface MaybeSyncable {
  syncStatus?: CloudSyncStatus;
  cloudId?: string | null;
}

/**
 * Um registro conta como pendente quando tem `syncStatus` local/pending, ou
 * quando nao tem `syncStatus` algum e tambem nao tem `cloudId` — nesse caso ele
 * foi criado aqui e nunca subiu. Tratar o status ausente como sincronizado
 * derrubava a guarda de `planStartupCloudDownload` e o download de startup
 * apagava o registro; o default seguro e o inverso.
 */
function isPending(item: MaybeSyncable | null | undefined): boolean {
  if (!item) return false;
  if (item.syncStatus === 'local' || item.syncStatus === 'pending') return true;
  return item.syncStatus === undefined && !item.cloudId;
}

/**
 * Counts how many records across the given collections still have unsynced local
 * changes. Used to surface a badge so the user knows a sync is due, and as the
 * guard that keeps the startup download from overwriting unsynced local work.
 */
export function countPendingChanges(collections: MaybeSyncable[][]): number {
  return collections.reduce((total, list) => total + list.filter(isPending).length, 0);
}
