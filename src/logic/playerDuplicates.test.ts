import test from 'node:test';
import assert from 'node:assert/strict';
import { makePlayer } from '../test/fixtures';
import { findGuestMatchInCommunity } from './playerDuplicates';

const perfil = {
  nome: 'Vitur',
  genero: 'M' as const,
  posicaoPrincipal: 'oposto' as const,
  alturaCm: 176,
};
const candidato = makePlayer('novo', { ...perfil, nome: ' vitur ' });

test('acha convidado de mesmo perfil na mesma comunidade', () => {
  const g = makePlayer('g', { ...perfil, communityIds: ['c1'] });
  assert.equal(findGuestMatchInCommunity([g], candidato, 'c1')?.id, 'g');
});

test('acha tambem o desativado', () => {
  const g = makePlayer('g', { ...perfil, communityIds: ['c1'], ativo: false });
  assert.equal(findGuestMatchInCommunity([g], candidato, 'c1')?.id, 'g');
});

test('nunca acha de outra comunidade, com conta ou apagado', () => {
  const outra = makePlayer('o', { ...perfil, communityIds: ['c2'] });
  const conta = makePlayer('k', { ...perfil, communityIds: ['c1'], userId: 'u1' });
  const apagado = makePlayer('x', {
    ...perfil,
    communityIds: ['c1'],
    deletedAt: '2026-09-01T00:00:00.000Z',
  });
  assert.equal(findGuestMatchInCommunity([outra, conta, apagado], candidato, 'c1'), undefined);
});

test('sem nome nao acha nada', () => {
  const g = makePlayer('g', { ...perfil, communityIds: ['c1'] });
  assert.equal(findGuestMatchInCommunity([g], { ...candidato, nome: '  ' }, 'c1'), undefined);
});
