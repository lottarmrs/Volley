import test from 'node:test';
import assert from 'node:assert/strict';
import { makePlayer } from '../test/fixtures';
import { findDuplicatePlayerByProfile } from './playerDuplicates';

test('findDuplicatePlayerByProfile matches active players by normalized profile', () => {
  const existing = makePlayer('player-existing', {
    nome: 'Vitur',
    genero: 'M',
    posicaoPrincipal: 'oposto',
    alturaCm: 176,
  });
  const candidate = makePlayer('player-new', {
    nome: ' vitur ',
    genero: 'M',
    posicaoPrincipal: 'oposto',
    alturaCm: 176,
  });

  assert.equal(findDuplicatePlayerByProfile([existing], candidate)?.id, 'player-existing');
});
