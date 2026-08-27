import { syncService, type LocalSyncPayload, type SyncOptions } from '@infra/supabase/syncService';

export type { LocalSyncPayload } from '@infra/supabase/syncService';

export interface CloudSyncGateway {
  uploadLocalDataToCloud(
    payload: LocalSyncPayload,
    userId: string,
    options?: SyncOptions,
  ): Promise<LocalSyncPayload>;
  downloadCloudDataToLocal(userId?: string): Promise<LocalSyncPayload>;
  syncNow(
    payload: LocalSyncPayload,
    userId: string,
    options?: SyncOptions,
  ): Promise<LocalSyncPayload>;
  repairDuplicateCloudData(userId: string, options?: SyncOptions): Promise<LocalSyncPayload>;
}

export interface CloudSyncPayloadCommandInput {
  payload: LocalSyncPayload;
  userId: string;
  onIssue?: SyncOptions['onIssue'];
}

export interface CloudSyncOwnerQueryInput {
  userId?: string;
}

const supabaseCloudSyncGateway: CloudSyncGateway = {
  uploadLocalDataToCloud: (payload, userId, options) =>
    syncService.uploadLocalDataToCloud(payload, userId, options),
  downloadCloudDataToLocal: (userId) => syncService.downloadCloudDataToLocal(userId),
  syncNow: (payload, userId, options) => syncService.syncNow(payload, userId, options),
  repairDuplicateCloudData: (userId, options) =>
    syncService.repairDuplicateCloudData(userId, options),
};

export function uploadCloudDataCommand(
  input: CloudSyncPayloadCommandInput,
  gateway: CloudSyncGateway = supabaseCloudSyncGateway,
) {
  return gateway.uploadLocalDataToCloud(input.payload, input.userId, { onIssue: input.onIssue });
}

export function downloadCloudDataQuery(
  input: CloudSyncOwnerQueryInput,
  gateway: CloudSyncGateway = supabaseCloudSyncGateway,
) {
  return gateway.downloadCloudDataToLocal(input.userId);
}

export function syncCloudDataCommand(
  input: CloudSyncPayloadCommandInput,
  gateway: CloudSyncGateway = supabaseCloudSyncGateway,
) {
  return gateway.syncNow(input.payload, input.userId, { onIssue: input.onIssue });
}

export function repairDuplicateCloudDataCommand(
  input: Required<CloudSyncOwnerQueryInput> & Pick<CloudSyncPayloadCommandInput, 'onIssue'>,
  gateway: CloudSyncGateway = supabaseCloudSyncGateway,
) {
  return gateway.repairDuplicateCloudData(input.userId, { onIssue: input.onIssue });
}
