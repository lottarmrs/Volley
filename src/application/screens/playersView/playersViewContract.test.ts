import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPlayersViewContract } from './playersViewContract';
import type { PlayersViewContractInput } from './playersViewContract';
import type { Player } from '@shared/types';

function spy() {
  const calls: unknown[][] = [];
  const fn = (...a: unknown[]) => {
    calls.push(a);
  };
  return { fn, calls };
}

type Spy = ReturnType<typeof spy>;

function makePlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: 'p1',
    nome: '_TEST_',
    apelido: null,
    posicaoPrincipal: 'ponteiro',
    posicoesSecundarias: [],
    genero: 'M',
    alturaCm: 180,
    maoDominante: 'direita',
    ativo: true,
    status: { lesionado: false, presencaFrequente: false, limitacaoFisica: null },
    userId: null,
    isGuest: false,
    atributos: {
      ataque: 5,
      defesa: 5,
      saque: 5,
      resistencia: 5,
      recepcao: 5,
      levantamento: 5,
      bloqueio: 5,
      velocidade: 5,
      leituraDeJogo: 5,
      regularidade: 5,
      controleEmocional: 5,
    },
    formaAtual: { valor: 0, observacao: null, ultimasPartidas: [] },
    communityIds: [],
    selfEvaluation: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as Player;
}

function makeInput(overrides: Partial<PlayersViewContractInput> = {}): PlayersViewContractInput {
  return {
    players: [],
    communities: [],
    games: [],
    pointEvents: [],
    teams: [],
    sessions: [],
    onBack: () => {},
    onAddPlayer: () => {},
    onEditPlayer: () => {},
    onRestoreDemoPlayers: () => {},
    onAddGuestPlayer: () => {},
    ...overrides,
  };
}

test('buildModel projeta os 6 campos read-only', () => {
  const player = makePlayer({ nome: 'A' });
  const c = buildPlayersViewContract(
    makeInput({
      players: [player],
      communities: [{ id: 'c1', name: 'Comunidade' } as never],
      games: [{ id: 'g1' } as never],
      pointEvents: [{ id: 'pe1' } as never],
      teams: [{ id: 't1' } as never],
      sessions: [{ id: 's1' } as never],
    }),
  );
  assert.equal(c.model.players.length, 1);
  assert.equal(c.model.communities.length, 1);
  assert.equal(c.model.games.length, 1);
  assert.equal(c.model.pointEvents.length, 1);
  assert.equal(c.model.teams.length, 1);
  assert.equal(c.model.sessions.length, 1);
});

test('back chama onBack (mutual exclusion)', async () => {
  const onBack = spy() as unknown as Spy;
  const onAddPlayer = spy() as unknown as Spy;
  const c = buildPlayersViewContract(
    makeInput({ onBack: onBack.fn as never, onAddPlayer: onAddPlayer.fn as never }),
  );
  await c.dispatch({ kind: 'back' });
  assert.equal(onBack.calls.length, 1);
  assert.equal(onAddPlayer.calls.length, 0);
});

test('addPlayer chama onAddPlayer', async () => {
  const onAddPlayer = spy() as unknown as Spy;
  const c = buildPlayersViewContract(makeInput({ onAddPlayer: onAddPlayer.fn as never }));
  await c.dispatch({ kind: 'addPlayer' });
  assert.equal(onAddPlayer.calls.length, 1);
});

test('editPlayer repassa o player ao callback', async () => {
  const onEditPlayer = spy() as unknown as Spy;
  const c = buildPlayersViewContract(makeInput({ onEditPlayer: onEditPlayer.fn as never }));
  const player = makePlayer({ nome: 'B' });
  await c.dispatch({ kind: 'editPlayer', player });
  assert.equal(onEditPlayer.calls.length, 1);
  assert.deepEqual(onEditPlayer.calls[0], [player]);
});

test('restoreDemoPlayers chama onRestoreDemoPlayers', async () => {
  const onRestoreDemoPlayers = spy() as unknown as Spy;
  const c = buildPlayersViewContract(
    makeInput({ onRestoreDemoPlayers: onRestoreDemoPlayers.fn as never }),
  );
  await c.dispatch({ kind: 'restoreDemoPlayers' });
  assert.equal(onRestoreDemoPlayers.calls.length, 1);
});

test('addGuestPlayer repassa player e editDetails ao callback', async () => {
  const onAddGuestPlayer = spy() as unknown as Spy;
  const c = buildPlayersViewContract(makeInput({ onAddGuestPlayer: onAddGuestPlayer.fn as never }));
  const player = makePlayer({ nome: 'Guest' });
  await c.dispatch({ kind: 'addGuestPlayer', player, editDetails: true });
  assert.equal(onAddGuestPlayer.calls.length, 1);
  assert.deepEqual(onAddGuestPlayer.calls[0], [player, true]);
});
