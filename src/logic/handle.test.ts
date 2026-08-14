import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HANDLE_MAX_LENGTH,
  HANDLE_MIN_LENGTH,
  HANDLE_PATTERN,
  normalizeHandle,
  suggestHandle,
  validateHandle,
} from './handle';

test('o padrão do cliente é o mesmo que o Postgres impõe', () => {
  assert.equal(HANDLE_PATTERN.source, '^[a-z0-9][a-z0-9_-]{2,29}$');
  assert.equal(HANDLE_MIN_LENGTH, 3);
  assert.equal(HANDLE_MAX_LENGTH, 30);
});

test('normalizeHandle apara espaços, baixa a caixa e tira o arroba', () => {
  assert.equal(normalizeHandle('  @Joao_Silva '), 'joao_silva');
  assert.equal(normalizeHandle('MATHEUS'), 'matheus');
  assert.equal(normalizeHandle(''), '');
});

test('validateHandle aceita o que a constraint aceita', () => {
  assert.equal(validateHandle('joao'), null);
  assert.equal(validateHandle('joao-silva'), null);
  assert.equal(validateHandle('j0ao_silva'), null);
  assert.equal(validateHandle('a'.repeat(30)), null);
});

test('validateHandle recusa com mensagem em pt-BR', () => {
  assert.equal(validateHandle(''), 'Escolha um nome de usuário.');
  assert.equal(validateHandle('ab'), 'Use de 3 a 30 caracteres.');
  assert.equal(validateHandle('a'.repeat(31)), 'Use de 3 a 30 caracteres.');
  assert.equal(validateHandle('_joao'), 'Comece com uma letra ou número.');
  assert.equal(validateHandle('-joao'), 'Comece com uma letra ou número.');
  assert.equal(validateHandle('joão'), 'Use apenas letras sem acento, números, hífen e underline.');
  assert.equal(
    validateHandle('joao silva'),
    'Use apenas letras sem acento, números, hífen e underline.',
  );
});

test('validateHandle normaliza antes de julgar', () => {
  assert.equal(validateHandle('  @Joao_Silva '), null);
});

test('suggestHandle propõe a partir do nome e desvia de colisão', () => {
  assert.equal(suggestHandle('Thaís Lottar', []), 'thais-lottar');
  assert.equal(suggestHandle('Thaís Lottar', ['thais-lottar']), 'thais-lottar-2');
  assert.equal(suggestHandle('Thaís Lottar', ['thais-lottar', 'thais-lottar-2']), 'thais-lottar-3');
});

test('suggestHandle devolve undefined quando o nome não vira handle válido', () => {
  assert.equal(suggestHandle('', []), undefined);
  assert.equal(suggestHandle('!!!', []), undefined);
  assert.equal(suggestHandle('ab', []), undefined);
});
