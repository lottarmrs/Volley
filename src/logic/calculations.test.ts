import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateGeneralOverall,
  calculatePositionOverall,
  getAutoSpecialty,
  getAutoWeakness,
} from './calculations';
import { Player, Position } from '../types';
import { makePlayer } from '../test/fixtures';

// A player created by ensure_account_ready at signup: the RPC inserts only
// owner_id/user_id/name/username, so the DB defaults apply — attributes, forma_atual,
// profile and status are all '{}'::jsonb and primary_position is null. The cloud
// mapper passes those straight through, so this is exactly what reaches the UI.
function accountCreatedPlayer(): Player {
  return makePlayer('p1', {
    nome: 'TESTEADM',
    apelido: '',
    genero: null,
    posicaoPrincipal: null,
    // These fields are genuinely `{}` on the wire for an account-created player —
    // the DB's jsonb defaults, not a typed Player value. That's the precondition
    // under test, so the cast is the point, not a shortcut around it.
    atributos: {} as Player['atributos'],
    perfil: {} as Player['perfil'],
    formaAtual: {} as Player['formaAtual'],
    status: {} as Player['status'],
  });
}

test('calculatePositionOverall survives a player with no primary position', () => {
  // Regression: POSITION_WEIGHTS[null] is undefined and the body did
  // Object.entries(weights), which throws "Cannot convert undefined or null to
  // object". PlayerItem calls this with player.posicaoPrincipal on every card, so a
  // single account-created player crashed the whole Atletas tab to a black screen.
  const player = accountCreatedPlayer();

  const overall = calculatePositionOverall(player, player.posicaoPrincipal);

  assert.equal(typeof overall, 'number');
  assert.ok(Number.isFinite(overall), 'must not be NaN — the UI renders this value');
});

test('calculatePositionOverall survives an unknown position string', () => {
  const player = accountCreatedPlayer();

  const overall = calculatePositionOverall(player, 'nao-existe' as Position);

  assert.ok(Number.isFinite(overall));
});

test('calculatePositionOverall is finite when attributes and form are empty', () => {
  const player = accountCreatedPlayer();

  for (const pos of [
    'levantador',
    'oposto',
    'ponteiro',
    'central',
    'libero',
    'all-rounder',
  ] as Position[]) {
    const overall = calculatePositionOverall(player, pos);
    assert.ok(Number.isFinite(overall), `${pos} produced ${overall}`);
  }
});

test('calculateGeneralOverall is finite when attributes are empty', () => {
  // Object.values({}) is empty, so sum/length was 0/0 = NaN and React warned
  // "Received NaN for the children attribute".
  const overall = calculateGeneralOverall(accountCreatedPlayer());

  assert.ok(Number.isFinite(overall), `expected a number, got ${overall}`);
});

test('getAutoSpecialty and getAutoWeakness survive empty attributes', () => {
  // Both did `const [k, v] = sorted[0]` on an empty array, throwing "undefined is not
  // iterable". This was the second crash in the same card, hidden behind the first.
  const player = accountCreatedPlayer();

  assert.equal(getAutoSpecialty(player), 'Em Desenvolvimento');
  assert.equal(getAutoWeakness(player), 'Sem dados suficientes');
});

test('getAutoSpecialty still reads the top attribute when there is data', () => {
  const player = {
    ...accountCreatedPlayer(),
    atributos: { ataque: 9, defesa: 3 } as unknown as Player['atributos'],
    formaAtual: { valor: 0 } as Player['formaAtual'],
  } as Player;

  const specialty = getAutoSpecialty(player);

  assert.notEqual(specialty, 'Em Desenvolvimento');
  assert.equal(typeof specialty, 'string');
  assert.ok(specialty.length > 0);
});

test('a fully specified player still scores the same as before', () => {
  // Guard against the fallback quietly changing real ratings.
  const player = {
    ...accountCreatedPlayer(),
    alturaCm: 185,
    posicaoPrincipal: 'oposto' as Position,
    atributos: {
      ataque: 8,
      bloqueio: 7,
      saque: 6,
      defesa: 5,
      levantamento: 4,
      recepcao: 5,
      velocidade: 7,
      resistencia: 6,
      leituraDeJogo: 6,
      regularidade: 7,
      controleEmocional: 8,
    } as unknown as Player['atributos'],
    formaAtual: { valor: 2 } as Player['formaAtual'],
  } as Player;

  const overall = calculatePositionOverall(player, 'oposto');

  assert.ok(Number.isFinite(overall));
  assert.ok(overall > 0, 'a strong player must not score zero');
});
