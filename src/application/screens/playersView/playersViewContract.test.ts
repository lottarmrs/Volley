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

test('back chama onBack', async () => {
  const onBack = spy() as unknown as Spy;
  const c = buildPlayersViewContract(makeInput({ onBack: onBack.fn as never }));
  await c.dispatch({ kind: 'back' });
  assert.equal(onBack.calls.length, 1);
});
