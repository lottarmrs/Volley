import test from 'node:test';
import assert from 'node:assert/strict';
import { STORAGE_KEYS } from '@storage/localStorageRepository';
import { clearAccountEntitiesFromStorage } from './accountStorageCleanup';

test('com conta, apaga comunidades, atletas e regras do aparelho', () => {
  const removidas: string[] = [];
  const apagou = clearAccountEntitiesFromStorage('u1', (key) => removidas.push(key));
  assert.equal(apagou, true);
  assert.deepEqual(
    removidas.sort(),
    [STORAGE_KEYS.communities, STORAGE_KEYS.communityRules, STORAGE_KEYS.players].sort(),
  );
});

test('sem conta, nao apaga nada', () => {
  const removidas: string[] = [];
  assert.equal(
    clearAccountEntitiesFromStorage(null, (key) => removidas.push(key)),
    false,
  );
  assert.deepEqual(removidas, []);
});
