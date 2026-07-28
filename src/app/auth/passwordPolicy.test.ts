import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MIN_PASSWORD_LENGTH,
  PASSWORD_TOO_SHORT_MESSAGE,
  validatePasswordLength,
} from './passwordPolicy';

test('the client policy matches the server policy', () => {
  // O projeto Supabase esta com password_min_length = 8 (Authentication -> Policies).
  // Se as duas pontas divergirem, uma senha passa na validacao local e volta recusada
  // pelo GoTrue com mensagem em ingles, que vaza direto para a tela.
  assert.equal(MIN_PASSWORD_LENGTH, 8);
});

test('rejects a password below the minimum', () => {
  // 7 caracteres era o buraco: passava no antigo `length < 6` e o servidor recusava.
  assert.equal(validatePasswordLength('1234567'), PASSWORD_TOO_SHORT_MESSAGE);
  assert.equal(validatePasswordLength(''), PASSWORD_TOO_SHORT_MESSAGE);
});

test('accepts a password at or above the minimum', () => {
  assert.equal(validatePasswordLength('12345678'), null);
  assert.equal(validatePasswordLength('uma-senha-bem-longa'), null);
});

test('the message states the real minimum', () => {
  // Mensagem fixa dizendo "6" ja ficou mentirosa uma vez; agora deriva da constante.
  assert.match(PASSWORD_TOO_SHORT_MESSAGE, new RegExp(String(MIN_PASSWORD_LENGTH)));
});
