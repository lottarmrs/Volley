import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveSessionCreationAccess } from './sessionCreationAccess';

test('espera enquanto o sinal de quem organiza nao chegou', () => {
  assert.equal(resolveSessionCreationAccess({ pending: true, allowed: false }), 'pending');
  assert.equal(resolveSessionCreationAccess({ pending: true, allowed: true }), 'pending');
});

test('libera quem organiza pelada', () => {
  assert.equal(resolveSessionCreationAccess({ pending: false, allowed: true }), 'allowed');
});

test('bloqueia quem nao organiza pelada', () => {
  assert.equal(resolveSessionCreationAccess({ pending: false, allowed: false }), 'blocked');
});
