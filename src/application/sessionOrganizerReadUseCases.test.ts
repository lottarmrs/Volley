import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSessionOrganizer } from './sessionOrganizerReadUseCases';

test('devolve quem organiza a pelada', async () => {
  const result = await loadSessionOrganizer('s1', {
    fetchOrganizer: async () => ({ userId: 'u1', name: 'Beto' }),
  });
  assert.deepEqual(result, { ok: true, value: { userId: 'u1', name: 'Beto' } });
});

test('sem pelada na nuvem, ninguem e nao chama o servidor', async () => {
  let chamou = false;
  const result = await loadSessionOrganizer(null, {
    fetchOrganizer: async () => {
      chamou = true;
      return null;
    },
  });
  assert.deepEqual(result, { ok: true, value: null });
  assert.equal(chamou, false);
});

test('sem nuvem configurada, ninguem', async () => {
  const result = await loadSessionOrganizer('s1', {
    fetchOrganizer: async () => {
      throw Object.assign(new Error('x'), { code: 'CLOUD_UNAVAILABLE' });
    },
  });
  assert.deepEqual(result, { ok: true, value: null });
});

test('falha do servidor vira erro tecnico', async () => {
  const result = await loadSessionOrganizer('s1', {
    fetchOrganizer: async () => {
      throw new Error('rede');
    },
  });
  assert.equal(result.ok, false);
});
