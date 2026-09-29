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

test('findDuplicatePlayerByProfile ignora atleta com conta de mesmo perfil', () => {
  const comConta = makePlayer('player-conta', {
    nome: 'Vitur',
    genero: 'M',
    posicaoPrincipal: 'oposto',
    alturaCm: 176,
    userId: 'conta-1',
  });
  const candidate = makePlayer('player-new', {
    nome: 'Vitur',
    genero: 'M',
    posicaoPrincipal: 'oposto',
    alturaCm: 176,
  });

  assert.equal(findDuplicatePlayerByProfile([comConta], candidate), undefined);
});
