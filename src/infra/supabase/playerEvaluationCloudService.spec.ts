import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makePlayer } from '../../test/fixtures';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock('../../lib/supabaseClient', () => ({
  supabase: {
    rpc: mocks.rpc,
    from: mocks.from,
  },
}));

import { playerEvaluationCloudService } from './playerEvaluationCloudService';

const legacyCommunity = '10000000-0000-4000-8000-000000000001';
const targetCommunity = '20000000-0000-4000-8000-000000000002';
const playerCloudId = '30000000-0000-4000-8000-000000000003';

describe('playerEvaluationCloudService legacy write guard', () => {
  beforeEach(() => {
    mocks.rpc.mockReset();
    mocks.from.mockReset();
    mocks.upsert.mockReset();
    mocks.from.mockReturnValue({ upsert: mocks.upsert });
    mocks.upsert.mockResolvedValue({ error: null });
  });

  it('filters target players before conflict-key deduplication', async () => {
    mocks.rpc.mockResolvedValue({ data: [targetCommunity], error: null });
    const legacy = makePlayer('legacy', {
      cloudId: playerCloudId,
      evaluationCommunityId: legacyCommunity,
      updatedAt: '2026-09-07T10:00:00.000Z',
    });
    const target = makePlayer('target', {
      cloudId: playerCloudId,
      evaluationCommunityId: targetCommunity,
      updatedAt: '2026-09-07T11:00:00.000Z',
    });

    await playerEvaluationCloudService.bulkUpsertForPlayers([legacy, target], 'owner-1');

    expect(mocks.rpc).toHaveBeenCalledWith('community_evaluation_target_ids', {
      p_community_ids: [legacyCommunity, targetCommunity],
    });
    expect(mocks.upsert).toHaveBeenCalledWith(
      [expect.objectContaining({ community_id: legacyCommunity, local_id: 'legacy' })],
      { onConflict: 'owner_id,player_id' },
    );
  });

  it('fails the batch closed when target lookup fails for reasons other than a missing RPC', async () => {
    const lookupError = { code: '42501', message: 'forbidden' };
    mocks.rpc.mockResolvedValue({ data: null, error: lookupError });

    await expect(
      playerEvaluationCloudService.bulkUpsertForPlayers(
        [makePlayer('player', { cloudId: playerCloudId, evaluationCommunityId: legacyCommunity })],
        'owner-1',
      ),
    ).rejects.toBe(lookupError);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it('fails the batch closed when target lookup returns malformed data', async () => {
    mocks.rpc.mockResolvedValue({ data: { community_id: targetCommunity }, error: null });

    await expect(
      playerEvaluationCloudService.bulkUpsertForPlayers(
        [makePlayer('player', { cloudId: playerCloudId, evaluationCommunityId: legacyCommunity })],
        'owner-1',
      ),
    ).rejects.toThrow(/resposta inv.lida/i);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it.each(['PGRST202', '42883'])(
    'uses legacy behavior when lookup RPC is unavailable (%s)',
    async (code) => {
      mocks.rpc.mockResolvedValue({ data: null, error: { code, message: 'missing function' } });
      await playerEvaluationCloudService.bulkUpsertForPlayers(
        [makePlayer('player', { cloudId: playerCloudId, evaluationCommunityId: legacyCommunity })],
        'owner-1',
      );
      expect(mocks.upsert).toHaveBeenCalledTimes(1);
    },
  );

  it('refuses an individual legacy upsert for a target Community', async () => {
    mocks.rpc.mockResolvedValue({ data: [targetCommunity], error: null });

    await expect(
      playerEvaluationCloudService.upsertForPlayer(
        makePlayer('player', {
          cloudId: playerCloudId,
          evaluationCommunityId: targetCommunity,
        }),
        'owner-1',
        playerCloudId,
      ),
    ).rejects.toThrow(/desativadas/i);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});
