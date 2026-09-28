import test from 'node:test';
import assert from 'node:assert/strict';
import { levelFromAttributes, validateAthleteProfile } from './athleteProfile';
import { buildLevelAttributes } from '../application/quickStart';

const valido = {
  genero: 'F' as const,
  posicaoPrincipal: 'levantador' as const,
  alturaCm: 170,
  maoDominante: 'direita' as const,
  apelido: '',
  posicoesSecundarias: [],
};

test('os quatro obrigatorios', () => {
  assert.deepEqual(validateAthleteProfile(valido), {});
  const vazio = validateAthleteProfile({
    ...valido,
    genero: null,
    posicaoPrincipal: null,
    alturaCm: null,
    maoDominante: null,
  });
  assert.deepEqual(Object.keys(vazio).sort(), [
    'alturaCm',
    'genero',
    'maoDominante',
    'posicaoPrincipal',
  ]);
});

test('altura de 120 a 230, e secundarias validas, distintas e diferentes da principal', () => {
  assert.ok(validateAthleteProfile({ ...valido, alturaCm: 119 }).alturaCm);
  assert.ok(validateAthleteProfile({ ...valido, alturaCm: 231 }).alturaCm);
  assert.ok(
    validateAthleteProfile({ ...valido, posicoesSecundarias: ['levantador'] }).posicoesSecundarias,
  );
  assert.ok(
    validateAthleteProfile({ ...valido, posicoesSecundarias: ['oposto', 'oposto'] })
      .posicoesSecundarias,
  );
  assert.deepEqual(validateAthleteProfile({ ...valido, posicoesSecundarias: ['oposto'] }), {});
});

test('o nivel lido dos atributos e o inverso de buildLevelAttributes', () => {
  for (const nivel of [1, 2, 3, 4, 5] as const) {
    assert.equal(levelFromAttributes(buildLevelAttributes(nivel)), nivel);
  }
});
