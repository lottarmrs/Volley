import test from 'node:test';
import assert from 'node:assert/strict';
import { linkMaterializedRound } from './championshipRoundLink';

test('com a rodada ja na nuvem, liga direto e devolve sincronizada', async () => {
  const chamadas: string[] = [];
  const resultado = await linkMaterializedRound(
    { roundCloudId: 'r-nuvem', sessionId: 's1' },
    { linkRoundToSession: async (r, s) => void chamadas.push(`${r}->${s}`) },
  );
  assert.deepEqual(chamadas, ['r-nuvem->s1']);
  assert.equal(resultado, 'synced');
});

test('rodada que ainda nao subiu fica para o sync', async () => {
  const resultado = await linkMaterializedRound(
    { roundCloudId: undefined, sessionId: 's1' },
    { linkRoundToSession: async () => assert.fail('nao deveria chamar') },
  );
  assert.equal(resultado, 'pending');
});

test('falha ao ligar nao perde o vinculo: fica para o sync', async () => {
  const resultado = await linkMaterializedRound(
    { roundCloudId: 'r-nuvem', sessionId: 's1' },
    {
      linkRoundToSession: async () => {
        throw new Error('sem rede');
      },
    },
  );
  assert.equal(resultado, 'pending');
});
