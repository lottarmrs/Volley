import test from 'node:test';
import assert from 'node:assert/strict';
import { isPermissionError, OFFLINE_MESSAGE, toOnlineError } from './onlineErrors';

test('falha de rede vira sem conexao', () => {
  const error = toOnlineError(new TypeError('Failed to fetch'));
  assert.equal(error.kind, 'offline_unavailable');
  assert.equal(error.message, OFFLINE_MESSAGE);
  assert.equal(OFFLINE_MESSAGE, 'Sem conexão. Tente de novo quando o sinal voltar.');
});

test('42501 vira falta de permissao com a mensagem do servidor', () => {
  const error = toOnlineError({ code: '42501', message: 'x' });
  assert.equal(error.kind, 'authorization');
  assert.equal(error.message, 'x');
  assert.equal(isPermissionError({ code: '42501', message: 'x' }), true);
});

test('qualquer outro erro e inesperado', () => {
  const error = toOnlineError({ code: '23505', message: 'duplicado' });
  assert.equal(error.kind, 'unexpected');
  assert.equal(isPermissionError(new Error('y')), false);
});
