import test from 'node:test';
import assert from 'node:assert/strict';
import type { Attributes, FreePlayConfig, Player } from '../types';
import {
  computeAttributeFallback,
  mapPlayerToBalanceSnapshot,
  mapPlayersToBalanceSnapshots,
} from './balancingCompatibility';

const attributes: Attributes = {
  saque: 6,
  recepcao: 7,
  levantamento: 8,
  ataque: 9,
  bloqueio: 5,
  defesa: 4,
  velocidade: 6,
  resistencia: 7,
  leituraDeJogo: 8,
  regularidade: 9,
  controleEmocional: 5,
};

const player = {
  id: 'player-1',
  nome: 'Ana',
  apelido: 'Aninha',
  genero: 'F',
  posicaoPrincipal: 'ponteiro',
  posicoesSecundarias: ['oposto'],
  alturaCm: 181,
  atributos: attributes,
  formaAtual: { valor: 10 },
  status: { lesionado: true },
} as Player;

const compatibilityConfig: FreePlayConfig = {
  type: 'free_play',
  teamCount: 2,
  maxPoints: 15,
  tieBreakMethod: 'win_by_2',
  rotationSystem: 'winner_stays',
  initialCourtTeams: ['', ''],
  initialQueue: [],
  queuePolicy: 'fifo',
  balanceSpeed: 'fast',
  balanceSeed: 91,
};

void compatibilityConfig;

test('mapPlayerToBalanceSnapshot emits only canonical participant facts', () => {
  const snapshot = mapPlayerToBalanceSnapshot(player, 'levantador');

  assert.deepEqual(snapshot, {
    participantId: 'player-1',
    attack: 9,
    defense: 4,
    serve: 6,
    reception: 7,
    setting: 8,
    block: 5,
    speed: 6,
    stamina: 7,
    gameVision: 8,
    consistency: 9,
    emotionalControl: 5,
    heightCm: 181,
    gender: 'F',
    position: 'levantador',
    secondaryPositions: ['oposto'],
    isInjured: true,
    isEstimated: false,
  });
  assert.equal('overall' in snapshot, false);
  assert.equal('name' in snapshot, false);
  assert.equal('currentForm' in snapshot, false);
});

test('mapPlayersToBalanceSnapshots resolves missing dimensions before the boundary', () => {
  const unrated = {
    ...player,
    id: 'player-2',
    atributos: {},
    status: {},
  } as Player;

  const fallback = computeAttributeFallback([player, unrated]);
  const snapshots = mapPlayersToBalanceSnapshots([player, unrated], {
    'player-2': 'central',
  });

  assert.equal(fallback.ataque, 9);
  assert.equal(snapshots[1].attack, 9);
  assert.equal(snapshots[1].serve, 6);
  assert.equal(snapshots[1].position, 'central');
  assert.equal(snapshots[1].isEstimated, true);
});
