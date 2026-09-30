import test from 'node:test';
import assert from 'node:assert/strict';
import { allCommunityKeys, invalidationKeysFor, REALTIME_TABLES } from './realtimeInvalidation';

const ctx = { userId: 'u1', communityCloudId: 'c1' };

test('communities invalida a lista de comunidades', () => {
  assert.deepEqual(invalidationKeysFor('communities', ctx), [['comunidades', 'u1']]);
});

test('community_members invalida membros e comunidades', () => {
  assert.deepEqual(invalidationKeysFor('community_members', ctx), [
    ['comunidade', 'c1', 'membros'],
    ['comunidades', 'u1'],
  ]);
});

test('community_players e players invalidam o elenco', () => {
  assert.deepEqual(invalidationKeysFor('community_players', ctx), [['atletas', 'u1']]);
  assert.deepEqual(invalidationKeysFor('players', ctx), [['atletas', 'u1']]);
});

test('community_rules invalida as regras', () => {
  assert.deepEqual(invalidationKeysFor('community_rules', ctx), [['regras', 'u1']]);
});

test('reconectar invalida as quatro chaves da comunidade', () => {
  assert.equal(allCommunityKeys(ctx).length, 4);
});

test('so players fica sem filtro de coluna', () => {
  const semFiltro = REALTIME_TABLES.filter(({ filterColumn }) => filterColumn === null);
  assert.deepEqual(
    semFiltro.map(({ table }) => table),
    ['players'],
  );
  assert.equal(REALTIME_TABLES.find(({ table }) => table === 'communities')?.filterColumn, 'id');
});
