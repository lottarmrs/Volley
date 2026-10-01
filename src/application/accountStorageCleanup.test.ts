import test from 'node:test';
import assert from 'node:assert/strict';
import { STORAGE_KEYS } from '@storage/localStorageRepository';
import { clearAccountEntitiesFromStorage } from './accountStorageCleanup';

test('com conta, apaga comunidades, atletas, regras e peladas do aparelho', () => {
  const removidas: string[] = [];
  const apagou = clearAccountEntitiesFromStorage('u1', (key) => removidas.push(key));
  assert.equal(apagou, true);
  assert.deepEqual(
    removidas.sort(),
    [
      STORAGE_KEYS.communities,
      STORAGE_KEYS.communityRules,
      STORAGE_KEYS.players,
      STORAGE_KEYS.sessions,
      STORAGE_KEYS.activeSession,
      STORAGE_KEYS.teams,
      STORAGE_KEYS.games,
      STORAGE_KEYS.points,
      STORAGE_KEYS.gameReports,
      STORAGE_KEYS.sessionReports,
    ].sort(),
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
