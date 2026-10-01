import test from 'node:test';
import assert from 'node:assert/strict';
import { diffById } from './rowDiff';

test('novos e trocados vao para gravar; os que sumiram, para remover', () => {
  const a = { id: 'a' };
  const b = { id: 'b' };
  const c = { id: 'c' };
  const bNovo = { id: 'b', x: 1 };
  const d = { id: 'd' };
  const { upserted, removed } = diffById([a, b, c], [a, bNovo, d]);
  assert.deepEqual(upserted, [bNovo, d]);
  assert.deepEqual(removed, [c]);
});

test('lista igual nao grava nada', () => {
  const a = { id: 'a' };
  assert.deepEqual(diffById([a], [a]), { upserted: [], removed: [] });
});
