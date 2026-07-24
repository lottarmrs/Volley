import test from 'node:test';
import assert from 'node:assert/strict';
import {
  downloadCloudDataQuery,
  repairDuplicateCloudDataCommand,
  syncCloudDataCommand,
  uploadCloudDataCommand,
  type CloudSyncGateway,
  type LocalSyncPayload,
} from './cloudSyncUseCases';

const payload = (): LocalSyncPayload => ({
  communities: [],
  players: [],
  rules: [],
  templates: [],
  sessions: [],
  teams: [],
  games: [],
  pointEvents: [],
  gameReports: [],
  sessionReports: [],
  presenceRecords: [],
  drafts: [],
});

test('uploadCloudDataCommand sends local data through the gateway', async () => {
  const inputPayload = payload();
  const issueCalls: Array<{ context: string; error: unknown }> = [];
  const calls: string[] = [];
  const gateway: CloudSyncGateway = {
    uploadLocalDataToCloud: async (local, ownerId, options) => {
      calls.push(`upload:${ownerId}:${local.players.length}`);
      options?.onIssue?.('atleta "Ana"', new Error('offline'));
      return { ...local, players: [] };
    },
    downloadCloudDataToLocal: async () => payload(),
    syncNow: async () => payload(),
    repairDuplicateCloudData: async () => payload(),
  };

  const result = await uploadCloudDataCommand(
    {
      payload: inputPayload,
      userId: 'user-1',
      onIssue: (context, error) => issueCalls.push({ context, error }),
    },
    gateway,
  );

  assert.equal(result.players.length, 0);
  assert.deepEqual(calls, ['upload:user-1:0']);
  assert.equal(issueCalls[0].context, 'atleta "Ana"');
});

test('downloadCloudDataQuery requests cloud data for the owner', async () => {
  const calls: string[] = [];
  const gateway: CloudSyncGateway = {
    uploadLocalDataToCloud: async () => payload(),
    downloadCloudDataToLocal: async (ownerId) => {
      calls.push(`download:${ownerId}`);
      return payload();
    },
    syncNow: async () => payload(),
    repairDuplicateCloudData: async () => payload(),
  };

  await downloadCloudDataQuery({ userId: 'user-1' }, gateway);

  assert.deepEqual(calls, ['download:user-1']);
});

test('syncCloudDataCommand runs the two-way sync through the gateway', async () => {
  const inputPayload = payload();
  const calls: string[] = [];
  const gateway: CloudSyncGateway = {
    uploadLocalDataToCloud: async () => payload(),
    downloadCloudDataToLocal: async () => payload(),
    syncNow: async (local, ownerId) => {
      calls.push(`sync:${ownerId}:${local.communities.length}`);
      return local;
    },
    repairDuplicateCloudData: async () => payload(),
  };

  const result = await syncCloudDataCommand({ payload: inputPayload, userId: 'user-1' }, gateway);

  assert.equal(result, inputPayload);
  assert.deepEqual(calls, ['sync:user-1:0']);
});

test('repairDuplicateCloudDataCommand delegates duplicate cleanup to the gateway', async () => {
  const calls: string[] = [];
  const gateway: CloudSyncGateway = {
    uploadLocalDataToCloud: async () => payload(),
    downloadCloudDataToLocal: async () => payload(),
    syncNow: async () => payload(),
    repairDuplicateCloudData: async (ownerId) => {
      calls.push(`repair:${ownerId}`);
      return payload();
    },
  };

  await repairDuplicateCloudDataCommand({ userId: 'user-1' }, gateway);

  assert.deepEqual(calls, ['repair:user-1']);
});
