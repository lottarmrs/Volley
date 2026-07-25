import test from 'node:test';
import assert from 'node:assert/strict';
import { submitSelfEvaluation } from './selfEvaluationUseCases';
import type { Attributes } from '../types';

const attributes: Attributes = {
  saque: 7,
  recepcao: 6,
  levantamento: 5,
  ataque: 8,
  bloqueio: 6,
  defesa: 6,
  velocidade: 7,
  resistencia: 7,
  leituraDeJogo: 6,
  regularidade: 6,
  controleEmocional: 6,
};

test('submitSelfEvaluation upserts through the gateway', async () => {
  const calls: Array<{ playerId: string; attributes: Attributes }> = [];

  const result = await submitSelfEvaluation('player-cloud-1', attributes, {
    upsert: async (playerId, attrs) => {
      calls.push({ playerId, attributes: attrs });
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(calls, [{ playerId: 'player-cloud-1', attributes }]);
});

test('submitSelfEvaluation rejects a blank player id without calling the gateway', async () => {
  const result = await submitSelfEvaluation('   ', attributes, {
    upsert: async () => assert.fail('blank player id should not call gateway'),
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error.code, 'invalid_input');
});

test('submitSelfEvaluation wraps gateway failures as a technical error', async () => {
  const result = await submitSelfEvaluation('player-cloud-1', attributes, {
    upsert: async () => {
      throw new Error('network down');
    },
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error.kind, 'technical');
});
