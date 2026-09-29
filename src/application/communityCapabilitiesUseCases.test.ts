import test from 'node:test';
import assert from 'node:assert/strict';
import { loadCommunityCapabilities } from './communityCapabilitiesUseCases';

test('sem comunidade na nuvem ou sem conta, nao ha capacidade e nao chama o servidor', async () => {
  let chamou = false;
  const gateway = {
    has: async () => {
      chamou = true;
      return true;
    },
  };
  assert.deepEqual(await loadCommunityCapabilities(null, 'u1', gateway), { ok: true, value: [] });
  assert.deepEqual(await loadCommunityCapabilities('c1', null, gateway), { ok: true, value: [] });
  assert.equal(chamou, false);
});

test('devolve as capacidades que o servidor confirma, uma a uma', async () => {
  const perguntadas: string[] = [];
  const gateway = {
    has: async (_community: string, capability: string) => {
      perguntadas.push(capability);
      return capability === 'player.evaluate';
    },
  };
  assert.deepEqual(await loadCommunityCapabilities('c1', 'u1', gateway), {
    ok: true,
    value: ['player.evaluate'],
  });
  assert.deepEqual(perguntadas, ['player.evaluate', 'session.manage', 'community.profile.update']);

  const nega = { has: async () => false };
  assert.deepEqual(await loadCommunityCapabilities('c1', 'u1', nega), { ok: true, value: [] });
});

test('falha do servidor vira erro tecnico, nunca capacidade', async () => {
  const gateway = {
    has: async () => {
      throw new Error('rede');
    },
  };
  const result = await loadCommunityCapabilities('c1', 'u1', gateway);
  assert.equal(result.ok, false);
});
