import test from 'node:test';
import assert from 'node:assert/strict';
import { loadCommunitySkillProfile } from './communitySkillProfileUseCases';

const input = { communityId: 'community', playerId: 'player', rubricVersion: 'v0-legacy-11' };

test('profile read requires an explicit Community, Player and rubric before calling the gateway', async () => {
  for (const field of ['communityId', 'playerId', 'rubricVersion']) {
    let called = false;
    const result = await loadCommunitySkillProfile(
      { ...input, [field]: '  ' },
      {
        fetchProfile: async () => {
          called = true;
          throw new Error('Unexpected request');
        },
      },
    );
    assert.equal(called, false);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.kind, 'product');
  }
});

test('profile read forwards normalized context without any caller-supplied actor', async () => {
  const result = await loadCommunitySkillProfile(
    {
      communityId: ' community ',
      playerId: ' player ',
      rubricVersion: ' v0-legacy-11 ',
    },
    {
      fetchProfile: async (request) => {
        assert.deepEqual(request, input);
        return {
          community_id: 'community',
          player_id: 'player',
          rubric_version: 'v0-legacy-11',
          aggregation_policy_version: 'v0-legacy-mad-mean',
          status: 'EXPERIMENTAL',
          source_revision: 'checkpoint',
          calculated_at: '2026-09-06T00:00:00Z',
          contribution_count: 0,
          dimensions: [],
        };
      },
    },
  );
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.value.contribution_count, 0);
});

test('profile access refusals become a Portuguese permission error without exposing server text', async () => {
  const result = await loadCommunitySkillProfile(input, {
    fetchProfile: async () => {
      throw { code: '42501', message: 'Private SQL details' };
    },
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.kind, 'product');
    assert.match(result.error.message, /avaliador autorizado/);
    assert.doesNotMatch(result.error.message, /Private SQL/);
  }
});

test('missing server function is reported as unavailable rather than an empty profile', async () => {
  for (const code of ['PGRST202', '42883', 'CLOUD_UNAVAILABLE']) {
    const result = await loadCommunitySkillProfile(input, {
      fetchProfile: async () => {
        throw { code };
      },
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error.message, /disponível|nuvem/);
  }
});

test('profile network failures remain retryable errors', async () => {
  const result = await loadCommunitySkillProfile(input, {
    fetchProfile: async () => {
      throw new Error('Network unavailable');
    },
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.kind, 'technical');
    assert.equal(result.error.recoverable, true);
  }
});
