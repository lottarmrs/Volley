import test from 'node:test';
import assert from 'node:assert/strict';
import type { VutCard } from '@logic/futCards';
import { faseDa, formaRecente, iniciaisDe } from './athleteProfileTones';

const cartaCom = (ultimasPartidas: number[]) =>
  ({ player: { formaAtual: { valor: 0, observacao: '', ultimasPartidas } } }) as unknown as VutCard;

test('formaRecente: última nota acima da média leva sinal de mais e vírgula', () => {
  assert.equal(formaRecente(cartaCom([7.6, 8.1, 8.4, 8.8, 9.1])), '+0,7');
});

test('formaRecente: última nota abaixo da média leva sinal de menos', () => {
  assert.equal(formaRecente(cartaCom([6.2, 5.8, 5.1, 4.9])), '−0,6');
});

test('formaRecente: última nota igual à média dá ±0,0', () => {
  assert.equal(formaRecente(cartaCom([7, 7, 7])), '±0,0');
});

test('formaRecente: menos de duas notas dá traço', () => {
  assert.equal(formaRecente(cartaCom([])), '—');
  assert.equal(formaRecente(cartaCom([8.2])), '—');
});

test('faseDa: faixas em 8, 7 e 6', () => {
  assert.equal(faseDa(9.4).texto, 'em alta');
  assert.equal(faseDa(8).texto, 'em alta');
  assert.equal(faseDa(7.99).texto, 'boa');
  assert.equal(faseDa(7).texto, 'boa');
  assert.equal(faseDa(6.99).texto, 'regular');
  assert.equal(faseDa(6).texto, 'regular');
  assert.equal(faseDa(5.99).texto, 'péssima');
  assert.equal(faseDa(0).texto, 'péssima');
});

test('faseDa: sem média é sem jogos', () => {
  assert.equal(faseDa(null).texto, 'sem jogos');
});

test('iniciaisDe: sem nome não inventa iniciais', () => {
  assert.equal(iniciaisDe('Ana Souza'), 'AN');
  assert.equal(iniciaisDe(undefined), '?');
  assert.equal(iniciaisDe('  '), '?');
});
