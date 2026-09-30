import test from 'node:test';
import assert from 'node:assert/strict';
import { queryKeys } from './queryKeys';

test('as chaves sao estaveis para o mesmo usuario', () => {
  assert.deepEqual(queryKeys.comunidades('u1'), queryKeys.comunidades('u1'));
  assert.deepEqual(queryKeys.atletas('u1'), ['atletas', 'u1']);
  assert.deepEqual(queryKeys.regras('u1'), ['regras', 'u1']);
  assert.deepEqual(queryKeys.membros('c1'), ['comunidade', 'c1', 'membros']);
});

test('as chaves mudam por usuario e por comunidade', () => {
  assert.notDeepEqual(queryKeys.comunidades('u1'), queryKeys.comunidades('u2'));
  assert.notDeepEqual(queryKeys.atletas('u1'), queryKeys.regras('u1'));
  assert.notDeepEqual(queryKeys.membros('c1'), queryKeys.membros('c2'));
});
