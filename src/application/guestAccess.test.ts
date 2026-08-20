import test from 'node:test';
import assert from 'node:assert/strict';
import { describeAccountOnlyArea, isGuestAccess, resolveAccessLevel } from './guestAccess';
import type { AccountSnapshot } from './accountUseCases';

const account: AccountSnapshot = {
  state: 'ready',
  profile: {
    id: 'u1',
    name: 'Ana',
    email: 'ana@example.com',
    role: 'user',
    createdAt: '2026-08-17T00:00:00Z',
    updatedAt: '2026-08-17T00:00:00Z',
  },
  playerId: 'p1',
  username: 'ana',
  requiresAal2: false,
};

test('uma sessao resolvida da acesso de conta', () => {
  assert.equal(resolveAccessLevel({ kind: 'ready', userId: 'u1', account }), 'account');
});

test('anonimo e convidado, nao bloqueado', () => {
  assert.equal(resolveAccessLevel({ kind: 'anonymous' }), 'guest');
  assert.equal(isGuestAccess({ kind: 'anonymous' }), true);
});

test('estados intermediarios de autenticacao continuam bloqueando o app', () => {
  assert.equal(resolveAccessLevel({ kind: 'initializing' }), 'blocked');
  assert.equal(resolveAccessLevel({ kind: 'email_verification', userId: 'u1' }), 'blocked');
  assert.equal(resolveAccessLevel({ kind: 'onboarding', userId: 'u1', playerId: 'p1' }), 'blocked');
  assert.equal(resolveAccessLevel({ kind: 'mfa_required', userId: 'u1', account }), 'blocked');
  assert.equal(
    resolveAccessLevel({ kind: 'mfa_setup_required', userId: 'u1', account }),
    'blocked',
  );
  assert.equal(
    resolveAccessLevel({ kind: 'recoverable_error', userId: 'u1', message: 'falha' }),
    'blocked',
  );
});

test('so a sessao resolvida deixa de ser convidado', () => {
  assert.equal(isGuestAccess({ kind: 'ready', userId: 'u1', account }), false);
  assert.equal(isGuestAccess({ kind: 'initializing' }), false);
});

test('a area bloqueada se nomeia, em vez de dar um aviso generico', () => {
  assert.match(describeAccountOnlyArea('/agenda').title, /agenda/i);
  assert.match(describeAccountOnlyArea('/ligas').title, /ligas/i);
  assert.match(describeAccountOnlyArea('/ligas/nova').title, /ligas/i);
  assert.match(describeAccountOnlyArea('/comunidades').title, /comunidades/i);
  assert.match(describeAccountOnlyArea('/comunidades/c1/pessoas').title, /comunidades/i);
  assert.match(describeAccountOnlyArea('/perfil/sync').title, /perfil/i);
});

test('uma rota desconhecida cai no texto padrao em vez de quebrar', () => {
  const area = describeAccountOnlyArea('/rota-que-nao-existe');
  assert.match(area.title, /precisa de conta/i);
  assert.ok(area.reason.length > 0);
});

test('prefixo so casa em fronteira de segmento', () => {
  assert.equal(describeAccountOnlyArea('/agendamentos').title, 'Esta área precisa de conta');
});
