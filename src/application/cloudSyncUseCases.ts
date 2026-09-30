import {
  syncService,
  type LocalSyncPayload,
  type OnlineCatalog,
  type SyncOptions,
} from '@infra/supabase/syncService';

export type { LocalSyncPayload } from '@infra/supabase/syncService';

export interface CloudSyncGateway {
  uploadLocalDataToCloud(
    payload: LocalSyncPayload,
    userId: string,
    options?: SyncOptions,
  ): Promise<LocalSyncPayload>;
  downloadCloudDataToLocal(userId?: string, catalog?: OnlineCatalog): Promise<LocalSyncPayload>;
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
  catalog?: OnlineCatalog;
}

const supabaseCloudSyncGateway: CloudSyncGateway = {
  uploadLocalDataToCloud: (payload, userId, options) =>
    syncService.uploadLocalDataToCloud(payload, userId, options),
  downloadCloudDataToLocal: (userId, catalog) =>
    syncService.downloadCloudDataToLocal(userId, catalog),
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
  return gateway.downloadCloudDataToLocal(input.userId, input.catalog);
}

export function syncCloudDataCommand(
  input: CloudSyncPayloadCommandInput,
  gateway: CloudSyncGateway = supabaseCloudSyncGateway,
) {
  return gateway.syncNow(input.payload, input.userId, { onIssue: input.onIssue });
}

export function repairDuplicateCloudDataCommand(
  input: { userId: string } & Pick<CloudSyncPayloadCommandInput, 'onIssue'>,
  gateway: CloudSyncGateway = supabaseCloudSyncGateway,
) {
  return gateway.repairDuplicateCloudData(input.userId, { onIssue: input.onIssue });
}
