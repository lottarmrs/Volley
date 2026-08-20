import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { isAuthOnlyPath, resolveTransitionDestination } from './authRoutes';
import type { AuthSessionState } from '@app/authSession';

const readyState: AuthSessionState = {
  kind: 'ready',
  userId: 'u1',
  account: {
    state: 'ready',
    profile: {
      id: 'u1',
      name: 'Ana',
      email: 'ana@example.com',
      role: 'user',
      createdAt: '2026-07-22T00:00:00Z',
      updatedAt: '2026-07-22T00:00:00Z',
    },
    playerId: 'p1',
    username: 'ana',
    requiresAal2: false,
  },
};

test('isAuthOnlyPath reconhece rotas de autenticacao', () => {
  assert.equal(isAuthOnlyPath('/entrar'), true);
  assert.equal(isAuthOnlyPath('/cadastro'), true);
  assert.equal(isAuthOnlyPath('/auth/loading'), true);
  assert.equal(isAuthOnlyPath('/auth/callback'), true);
  assert.equal(isAuthOnlyPath('/verificar-email'), true);
  assert.equal(isAuthOnlyPath('/escolher-username'), true);
  assert.equal(isAuthOnlyPath('/configurar-mfa'), true);
  assert.equal(isAuthOnlyPath('/confirmar-mfa'), true);
  assert.equal(isAuthOnlyPath('/recuperar-senha'), true);
});

test('isAuthOnlyPath nao confunde prefixo com rota protegida real', () => {
  assert.equal(isAuthOnlyPath('/comunidades'), false);
  assert.equal(isAuthOnlyPath('/agenda'), false);
  assert.equal(isAuthOnlyPath('/painel'), false);
  assert.equal(isAuthOnlyPath('/comunidades/c1/desempenho'), false);
});

test('resolveTransitionDestination restaura o destino original quando o estado resolve para ready', () => {
  const destination = resolveTransitionDestination(readyState, {
    pathname: '/comunidades/c1/desempenho',
    search: '?aba=historico',
    hash: '',
  });
  assert.deepEqual(destination, {
    pathname: '/comunidades/c1/desempenho',
    search: '?aba=historico',
    hash: '',
  });
});

test('resolveTransitionDestination cai no fallback quando nao ha destino original', () => {
  assert.equal(resolveTransitionDestination(readyState, undefined), '/');
});

test('convidado sai da tela de transicao para o app, nao para o login', () => {
  assert.equal(resolveTransitionDestination({ kind: 'anonymous' }, undefined), '/');
  assert.deepEqual(resolveTransitionDestination({ kind: 'anonymous' }, { pathname: '/painel' }), {
    pathname: '/painel',
  });
});

test('convidado que veio de uma rota de autenticacao nao volta para ela', () => {
  assert.equal(resolveTransitionDestination({ kind: 'anonymous' }, { pathname: '/entrar' }), '/');
});

test('resolveTransitionDestination nao cria laco quando o destino original e uma rota de autenticacao', () => {
  const destination = resolveTransitionDestination(readyState, { pathname: '/entrar' });
  assert.equal(destination, '/');
});

test('resolveTransitionDestination prioriza a rota forcada quando o estado ainda nao esta pronto', () => {
  const destination = resolveTransitionDestination(
    { kind: 'onboarding', userId: 'u1', playerId: 'p1' },
    { pathname: '/comunidades/c1/desempenho' },
  );
  assert.equal(destination, '/escolher-username');
});
