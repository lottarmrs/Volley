import test from 'node:test';
import assert from 'node:assert/strict';
import { slugify, generateUsername, generateUsernames, resolveUsername } from './username';

test('slugify strips accents and lowercases', () => {
  assert.equal(slugify('Thaís'), 'thais');
  assert.equal(slugify('Jânio'), 'janio');
  assert.equal(slugify('Hávila'), 'havila');
  assert.equal(slugify('Carol Mendes'), 'carol-mendes');
});

test('slugify collapses separators and trims hyphens', () => {
  assert.equal(slugify('  Matheus   Lottar '), 'matheus-lottar');
  assert.equal(slugify('Léo Rocha!!'), 'leo-rocha');
  assert.equal(slugify('A. J. (NAJU)'), 'a-j-naju');
});

test('generateUsername suffixes collisions deterministically', () => {
  const taken = new Set<string>();
  assert.equal(generateUsername('Matheus', taken), 'matheus');
  assert.equal(generateUsername('Matheus', taken), 'matheus-2');
  assert.equal(generateUsername('Matheus', taken), 'matheus-3');
});

test('generateUsername falls back when the name has no slug-able chars', () => {
  const taken = new Set<string>();
  assert.equal(generateUsername('!!!', taken), 'atleta');
  assert.equal(generateUsername('---', taken), 'atleta-2');
});

test('generateUsernames is deterministic and unique across a batch', () => {
  const result = generateUsernames(['Matheus Lottar', 'Matheus', 'Matheus']);
  assert.deepEqual(result, ['matheus-lottar', 'matheus', 'matheus-2']);
  assert.equal(new Set(result).size, result.length);
});

test('resolveUsername nunca inventa handle: quem não tem, continua sem', () => {
  assert.equal(resolveUsername({ nome: 'Thaís Lottar' }, []), undefined);
  assert.equal(resolveUsername({ nome: 'Thaís Lottar', isGuest: false }, ['outro']), undefined);
});

test('resolveUsername preserva o handle de quem já tem', () => {
  assert.equal(resolveUsername({ nome: 'Thaís Lottar', username: 'thais' }, ['outro']), 'thais');
  assert.equal(resolveUsername({ nome: 'Nome Novo', username: 'thais' }, []), 'thais');
});

test('resolveUsername keeps an existing handle and skips guests/blank names', () => {
  assert.equal(resolveUsername({ nome: 'Renamed', username: 'carol-mendes' }, []), 'carol-mendes');
  assert.equal(resolveUsername({ nome: 'Lucca', isGuest: true }, []), undefined);
  assert.equal(resolveUsername({ nome: '   ' }, []), undefined);
});
