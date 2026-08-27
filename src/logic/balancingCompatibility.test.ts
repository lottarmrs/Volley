import test from 'node:test';
import assert from 'node:assert/strict';
import type { Attributes, FreePlayConfig, Player } from '../types';
import { balanceSnapshots } from './balancing';
import {
  adaptBalanceCandidatesToDivisions,
  balanceTeams,
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
  balanceSeed: 77,
};

function divisionFingerprints(divisions: ReturnType<typeof balanceTeams>): string[] {
  return divisions.map((division) =>
    division.teams
      .map((team) => [...team.playerIds].sort().join(','))
      .sort()
      .join('|'),
  );
}

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

test('mapPlayersToBalanceSnapshots replaces non-finite dimensions with finite fallback values', () => {
  const mixed = {
    ...player,
    id: 'player-2',
    atributos: {
      ...attributes,
      ataque: Number.NaN,
      saque: Number.POSITIVE_INFINITY,
      defesa: Number.NaN,
    },
  } as Player;
  const allNonFinite = {
    ...player,
    id: 'player-3',
    atributos: Object.fromEntries(
      Object.keys(attributes).map((key) => [key, Number.NaN]),
    ) as unknown as Attributes,
  } as Player;

  const fallback = computeAttributeFallback([mixed, allNonFinite]);
  const snapshots = mapPlayersToBalanceSnapshots([mixed, allNonFinite]);

  assert.equal(fallback.ataque, 5);
  assert.equal(fallback.defesa, 5);
  assert.equal(snapshots[0].attack, 5);
  assert.equal(snapshots[0].serve, 5);
  assert.equal(snapshots[0].defense, 5);
  assert.equal(snapshots[0].isEstimated, false);
  assert.equal(snapshots[1].isEstimated, true);
});

test('changing only derived Overall inputs cannot change candidate assignments', () => {
  const roster = ['a', 'b', 'c', 'd'].map((id, index) => ({
    ...player,
    id,
    atributos: { ...attributes, ataque: index + 4 },
    formaAtual: { valor: 0 },
  })) as Player[];
  const changedForm = roster.map((item, index) => ({
    ...item,
    formaAtual: { ...item.formaAtual, valor: index === 0 ? 10 : 0 },
  }));
  const localConfig = { ...compatibilityConfig, teamCount: 2, balanceSeed: 91 };

  const baseline = balanceTeams(roster, 2, 'session-1', localConfig);
  const changed = balanceTeams(changedForm, 2, 'session-1', localConfig);

  assert.deepEqual(divisionFingerprints(changed), divisionFingerprints(baseline));
  assert.notEqual(
    changed[0].teams.find((team) => team.playerIds.includes('a'))?.strengthSnapshot?.overall,
    baseline[0].teams.find((team) => team.playerIds.includes('a'))?.strengthSnapshot?.overall,
  );
});

test('display adaptation preserves assignments and exposes Overall diagnostics afterward', () => {
  const divisions = balanceTeams(
    ['a', 'b', 'c', 'd'].map((id) => ({ ...player, id })) as Player[],
    2,
    'session-1',
    compatibilityConfig,
  );

  assert.equal(typeof divisions[0].diagnostics?.overallSpread, 'number');
  assert.ok(
    divisions[0].teams.every(
      (team) =>
        typeof team.strengthSnapshot?.overall === 'number' &&
        Number.isFinite(team.strengthSnapshot.overall),
    ),
  );
  assert.ok(divisions[0].rawSolution?.teams.flat().every((item) => !('overall' in item)));
});

test('different display projections cannot change fixed candidate assignments or order', () => {
  const roster = ['a', 'b', 'c', 'd'].map((id) => ({ ...player, id })) as Player[];
  const candidates = balanceSnapshots(mapPlayersToBalanceSnapshots(roster), 2, compatibilityConfig);
  const low = adaptBalanceCandidatesToDivisions({
    candidates,
    players: roster,
    sessionId: 'session-1',
    config: compatibilityConfig,
    overallProjection: (item) => (item.id === 'a' ? 10 : 20),
  });
  const high = adaptBalanceCandidatesToDivisions({
    candidates,
    players: roster,
    sessionId: 'session-1',
    config: compatibilityConfig,
    overallProjection: (item) => (item.id === 'a' ? 90 : 20),
  });

  assert.deepEqual(divisionFingerprints(high), divisionFingerprints(low));
  assert.deepEqual(
    high.map(({ score, seed, iterations }) => ({ score, seed, iterations })),
    low.map(({ score, seed, iterations }) => ({ score, seed, iterations })),
  );
  assert.notEqual(
    high[0].teams.find((team) => team.playerIds.includes('a'))?.strengthSnapshot?.overall,
    low[0].teams.find((team) => team.playerIds.includes('a'))?.strengthSnapshot?.overall,
  );
});
