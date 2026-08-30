import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionCohortCloudService } from './sessionCohortCloudService';

test('inspection adapter maps an object RPC row and sends only the Session id', async () => {
  const calls: unknown[] = [];
  const service = createSessionCohortCloudService({
    rpc: async (name, args) => {
      calls.push([name, args]);
      return {
        data: {
          eligible: true,
          blockers: ['HAS_GAME_EVIDENCE'],
          source_fingerprint: 'fingerprint-1',
          selected_player_count: 3,
        },
        error: null,
      };
    },
  });

  const inspection = await service.inspect('session-1');

  assert.deepEqual(calls, [['inspect_legacy_session_cutover', { p_session_id: 'session-1' }]]);
  assert.deepEqual(inspection, {
    eligible: true,
    blockers: ['HAS_GAME_EVIDENCE'],
    sourceFingerprint: 'fingerprint-1',
    selectedPlayerCount: 3,
  });
});

test('inspection adapter accepts Supabase one-row array responses', async () => {
  const service = createSessionCohortCloudService({
    rpc: async () => ({
      data: [
        {
          eligible: false,
          blockers: ['NOT_DRAFT'],
          source_fingerprint: 'fingerprint-2',
          selected_player_count: 0,
        },
      ],
      error: null,
    }),
  });

  assert.deepEqual(await service.inspect('session-2'), {
    eligible: false,
    blockers: ['NOT_DRAFT'],
    sourceFingerprint: 'fingerprint-2',
    selectedPlayerCount: 0,
  });
});

test('inspection adapter rejects RPC errors', async () => {
  const service = createSessionCohortCloudService({
    rpc: async () => ({
      data: null,
      error: { code: '42501', message: 'Not authorized' },
    }),
  });

  await assert.rejects(service.inspect('session-3'), { code: '42501', message: 'Not authorized' });
});

test('inspection adapter rejects malformed RPC rows', async () => {
  const service = createSessionCohortCloudService({
    rpc: async () => ({
      data: {
        eligible: true,
        blockers: ['NOT_DRAFT'],
        source_fingerprint: 'fingerprint-3',
        selected_player_count: '1',
      },
      error: null,
    }),
  });

  await assert.rejects(service.inspect('session-3'), /Invalid Session cutover inspection response/);
});

test('inspection adapter rejects RPC arrays that are not one-row responses', async () => {
  const service = createSessionCohortCloudService({
    rpc: async () => ({
      data: [
        {
          eligible: true,
          blockers: [],
          source_fingerprint: 'fingerprint-4',
          selected_player_count: 1,
        },
        {
          eligible: false,
          blockers: ['NOT_DRAFT'],
          source_fingerprint: 'fingerprint-5',
          selected_player_count: 0,
        },
      ],
      error: null,
    }),
  });

  await assert.rejects(service.inspect('session-4'), /Invalid Session cutover inspection response/);
});
