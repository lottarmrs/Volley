import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isDefinitiveRefusal,
  isPermissionError,
  OFFLINE_MESSAGE,
  toOnlineError,
} from './onlineErrors';

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

test('recusa definitiva: permissao, integridade, dado invalido e pedido mal formado', () => {
  for (const code of ['42501', '23505', '23503', '22P02', '22001', 'PGRST100', 'PGRST204']) {
    assert.equal(isDefinitiveRefusal({ code, message: 'x' }), true, code);
  }
});

test('o resto e parada temporaria: rede, 5xx, tempo esgotado, token vencido', () => {
  const temporarios: unknown[] = [
    new TypeError('Failed to fetch'),
    { code: '57014', message: 'canceling statement due to statement timeout' },
    { code: 'PGRST301', message: 'JWT expired' },
    { code: '', message: 'Internal Server Error', status: 500 },
    { message: 'sem codigo' },
    null,
    'texto',
  ];
  for (const erro of temporarios) {
    assert.equal(isDefinitiveRefusal(erro), false, JSON.stringify(erro));
  }
});
