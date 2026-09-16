import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveSessionCreationAccess } from './sessionCreationAccess';

test('espera enquanto os membros nao foram lidos, mesmo sem permissao ainda', () => {
  assert.equal(
    resolveSessionCreationAccess({ membersResolved: false, canCreateSession: false }),
    'pending',
  );
  assert.equal(
    resolveSessionCreationAccess({ membersResolved: false, canCreateSession: true }),
    'pending',
  );
});

test('libera quem pode criar sessao depois de ler os membros', () => {
  assert.equal(
    resolveSessionCreationAccess({ membersResolved: true, canCreateSession: true }),
    'allowed',
  );
});

test('bloqueia quem nao pode criar sessao depois de ler os membros', () => {
  assert.equal(
    resolveSessionCreationAccess({ membersResolved: true, canCreateSession: false }),
    'blocked',
  );
});
