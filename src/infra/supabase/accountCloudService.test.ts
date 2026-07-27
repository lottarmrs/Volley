import test from 'node:test';
import assert from 'node:assert/strict';
import { createAccountCloudService } from './accountCloudService';

test('account adapter maps ensure_account_ready row', async () => {
  const calls: unknown[] = [];
  const service = createAccountCloudService({
    rpc: async (name: string, args: unknown) => {
      calls.push([name, args]);
      return {
        data: [
          {
            state: 'ready',
            profile_id: 'u1',
            profile_name: 'Ana',
            profile_email: 'ana@example.com',
            profile_role: 'user',
            profile_created_at: '2026-07-22T00:00:00Z',
            profile_updated_at: '2026-07-22T00:00:00Z',
            player_id: 'p1',
            username: 'ana',
            requires_aal2: true,
          },
        ],
        error: null,
      };
    },
  });
  assert.deepEqual(await service.ensureReady('ana'), {
    state: 'ready',
    profile: {
      id: 'u1',
      name: 'Ana',
      email: 'ana@example.com',
      role: 'user',
      createdAt: '2026-07-22T00:00:00Z',
      updatedAt: '2026-07-22T00:00:00Z',
    },
    playerId: 'p1',
    username: 'ana',
    requiresAal2: true,
  });
  assert.deepEqual(calls, [['ensure_account_ready', { p_username: 'ana' }]]);
});
