import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildLevelAttributes,
  buildQuickStartPlayers,
  describeRosterReadiness,
  parseRosterInput,
  matchRosterNames,
  QUICK_START_MIN_PLAYERS,
} from './quickStart';

test('separa nomes por quebra de linha, virgula e ponto e virgula', () => {
  assert.deepEqual(parseRosterInput('Joao\nMaria, Pedro; Ana'), ['Joao', 'Maria', 'Pedro', 'Ana']);
});

test('remove a numeracao das listas coladas do WhatsApp', () => {
  const colado = '1. Joao\n2 - Maria\n3) Pedro\n- Ana\n• Bia';
  assert.deepEqual(parseRosterInput(colado), ['Joao', 'Maria', 'Pedro', 'Ana', 'Bia']);
});

test('ignora linhas vazias e colapsa espacos internos', () => {
  assert.deepEqual(parseRosterInput('  Joao   Silva \n\n\n   \n Maria '), ['Joao Silva', 'Maria']);
});

test('deduplica ignorando acento e caixa, preservando a primeira grafia', () => {
  assert.deepEqual(parseRosterInput('João\njoao\nJOAO\nJoão Pedro'), ['João', 'João Pedro']);
});

test('nivel vira atributo uniforme para o balanceador diferenciar', () => {
  assert.equal(buildLevelAttributes('iniciante').ataque, 3);
  assert.equal(buildLevelAttributes('bom').ataque, 5);
  assert.equal(buildLevelAttributes('forte').ataque, 7);
  assert.equal(buildLevelAttributes('forte').controleEmocional, 7);
});

test('constroi atletas locais com genero e nivel escolhidos', () => {
  let n = 0;
  const players = buildQuickStartPlayers({
    entries: [
      { name: 'Ana', level: 'forte', genero: 'F' },
      { name: 'Joao', level: 'iniciante', genero: 'M' },
    ],
    communityId: 'c1',
    now: '2026-08-17T12:00:00Z',
    createId: () => `p${++n}`,
  });

  assert.equal(players.length, 2);
  assert.equal(players[0].nome, 'Ana');
  assert.equal(players[0].genero, 'F');
  assert.equal(players[0].atributos.bloqueio, 7);
  assert.deepEqual(players[0].communityIds, ['c1']);
  assert.equal(players[0].syncStatus, 'local');
  assert.equal(players[1].genero, 'M');
  assert.equal(players[1].atributos.bloqueio, 3);
});

test('descarta entradas em branco na construcao', () => {
  const players = buildQuickStartPlayers({
    entries: [
      { name: '  ', level: 'bom', genero: 'M' },
      { name: 'Bia', level: 'bom', genero: 'F' },
    ],
    communityId: 'c1',
    now: '2026-08-17T12:00:00Z',
    createId: () => 'p1',
  });

  assert.equal(players.length, 1);
  assert.equal(players[0].nome, 'Bia');
});

test('a prontidao do elenco diz o que falta, nao so que esta invalido', () => {
  assert.equal(describeRosterReadiness(0).ready, false);
  assert.match(describeRosterReadiness(0).message, /Cole ou digite/);

  assert.equal(describeRosterReadiness(3).ready, false);
  assert.match(describeRosterReadiness(3).message, /Falta 1 atleta/);

  assert.equal(describeRosterReadiness(2).ready, false);
  assert.match(describeRosterReadiness(2).message, /Faltam 2 atletas/);

  assert.equal(describeRosterReadiness(QUICK_START_MIN_PLAYERS).ready, true);
  assert.match(describeRosterReadiness(8).message, /8 atletas prontos/);
});

test('a lista colada marca quem ja esta no elenco e separa quem e novo', () => {
  const elenco = [
    { id: 'p1', nome: 'Rafael Souza', apelido: 'Rafa' },
    { id: 'p2', nome: 'Beatriz Lima', apelido: '' },
    { id: 'p3', nome: 'Gustavo', apelido: 'Gus' },
  ];
  const resultado = matchRosterNames(['rafa', 'Beatriz Lima', 'Joao', 'GÚS'], elenco);
  assert.deepEqual(resultado.matchedIds, ['p1', 'p2', 'p3']);
  assert.deepEqual(resultado.unknownNames, ['Joao']);
});

test('nome que bate com dois atletas fica como novo para ninguem jogar no lugar do outro', () => {
  const elenco = [
    { id: 'p1', nome: 'Ana Prado', apelido: 'Ana' },
    { id: 'p2', nome: 'Ana Lopes', apelido: 'Ana' },
  ];
  const resultado = matchRosterNames(['Ana'], elenco);
  assert.deepEqual(resultado.matchedIds, []);
  assert.deepEqual(resultado.unknownNames, ['Ana']);
});
