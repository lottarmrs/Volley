import test from 'node:test';
import assert from 'node:assert/strict';
import { foldForComparison, matchesSearch } from './textNormalization';

test('foldForComparison strips the diacritics Brazilian names actually use', () => {
  assert.equal(foldForComparison('José Silva'), 'jose silva');
  assert.equal(foldForComparison('João'), 'joao');
  assert.equal(foldForComparison('Thaís'), 'thais');
  assert.equal(foldForComparison('Antônio'), 'antonio');
  // Cedilha e til precisam preservar a letra base, nao sumir com ela.
  assert.equal(foldForComparison('Conceição'), 'conceicao');
  assert.equal(foldForComparison('Gonçalves'), 'goncalves');
  assert.equal(foldForComparison('Muñoz'), 'munoz');
  // Acento em maiuscula no inicio e o caso que mais aparece em cadastro.
  assert.equal(foldForComparison('ÁVILA'), 'avila');
});

test('foldForComparison collapses whitespace and survives null', () => {
  assert.equal(foldForComparison('  Luís   Inácio  '), 'luis inacio');
  assert.equal(foldForComparison(null), '');
  assert.equal(foldForComparison(undefined), '');
});

test('matchesSearch finds an accented name typed without accents', () => {
  // O caso que motivou o modulo: o admin cadastra "João Pedro" e depois procura
  // "joao". Antes disso a lista voltava vazia e ele cadastrava de novo.
  assert.equal(matchesSearch('João Pedro', 'joao'), true);
  assert.equal(matchesSearch('José Silva', 'jose'), true);
  assert.equal(matchesSearch('Thaís Lottar', 'thais'), true);
  // E o inverso: digitou com acento, cadastro esta sem.
  assert.equal(matchesSearch('Jose Silva', 'josé'), true);
});

test('matchesSearch keeps rejecting what genuinely does not match', () => {
  assert.equal(matchesSearch('João Pedro', 'maria'), false);
  assert.equal(matchesSearch('', 'joao'), false);
});

test('matchesSearch treats a blank query as "show everything"', () => {
  assert.equal(matchesSearch('João', ''), true);
  assert.equal(matchesSearch('João', '   '), true);
});
