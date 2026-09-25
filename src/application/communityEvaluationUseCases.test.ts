import assert from 'node:assert/strict';
import test from 'node:test';
import {
  loadCommunityEvaluationRoster,
  parseScores,
  submitCommunityEvaluation,
  type CommunityEvaluationGateway,
} from './communityEvaluationUseCases';

test('new evaluation keeps missing distinct from zero and never accepts coercion defaults', () => {
  assert.deepEqual(parseScores({ saque: '0', defesa: '' }), { ok: true, value: { saque: 0 } });
  for (const values of [
    {},
    { saque: ' ' },
    { saque: 'NaN' },
    { saque: 'Infinity' },
    { saque: '-1' },
    { saque: '11' },
    { inventado: '5' },
  ] as Record<string, string>[]) {
    assert.equal(parseScores(values).ok, false);
  }
  assert.deepEqual(parseScores({ ataque: '6.5' }), { ok: true, value: { ataque: 6.5 } });
});

const command = {
  commandId: 'command',
  contributionId: 'contribution',
  communityId: 'community',
  playerId: 'player',
  rubricVersion: 'v0-legacy-11',
  dimensions: { saque: 0 },
  expectedContributionId: null,
};

test('semantic submission forwards the same immutable command for an uncertain retry', async () => {
  const calls: unknown[] = [];
  const gateway = {
    record: async (input: unknown) => {
      calls.push(input);
      if (calls.length === 1) throw new Error('network');
    },
  } as unknown as CommunityEvaluationGateway;
  const first = await submitCommunityEvaluation(command, gateway);
  assert.equal(first.ok, false);
  if (!first.ok) assert.equal(first.error.recoverable, true);
  assert.equal((await submitCommunityEvaluation(command, gateway)).ok, true);
  assert.equal(calls[0], command);
  assert.equal(calls[1], command);
  assert.equal('actorId' in command, false);
});

test('semantic submission reports stale revision and permission refusal without legacy fallback', async () => {
  for (const [code, expected] of [
    ['40001', 'conflict'],
    ['42501', 'permission_denied'],
    ['PGRST202', 'cloud_unavailable'],
    ['CLOUD_UNAVAILABLE', 'cloud_unavailable'],
    ['23514', 'invalid_input'],
  ]) {
    const gateway = {
      record: async () => {
        throw { code, message: 'private SQL detail' };
      },
    } as unknown as CommunityEvaluationGateway;
    const result = await submitCommunityEvaluation(command, gateway);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal('code' in result.error ? result.error.code : undefined, expected);
      assert.equal(result.error.message.includes('private SQL'), false);
    }
  }
});

test('sem comunidade na nuvem, a lista pede para sincronizar e nao chama o servidor', async () => {
  let chamou = false;
  const gateway = {
    listRoster: async () => {
      chamou = true;
      return [];
    },
  } as unknown as CommunityEvaluationGateway;
  const result = await loadCommunityEvaluationRoster(null, gateway);
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error.message, /Sincronize esta comunidade antes de avaliar/);
  assert.equal(chamou, false);
});

test('a recusa da autoavaliacao chega em portugues, distinta da recusa comum', async () => {
  const gateway = {
    record: async () => {
      throw {
        code: '42501',
        message: 'Only the sole evaluator of this Community can assess themselves',
      };
    },
  } as unknown as CommunityEvaluationGateway;
  const result = await submitCommunityEvaluation(command, gateway);
  assert.equal(result.ok, false);
  if (!result.ok)
    assert.equal(
      result.error.message,
      'Você só pode se avaliar enquanto for a única pessoa que avalia nesta comunidade.',
    );
});
