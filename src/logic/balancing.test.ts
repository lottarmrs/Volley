import test from 'node:test';
import assert from 'node:assert/strict';
import { players } from '../data/players';
import { balanceTeams, getQualityLabel, resolveComposition, mapPlayerToAthleteVector } from './balancing';
import { QUALITY } from './balancingConstants';
import { Attributes, FreePlayConfig, Player, Position } from '../types';

const selectedPlayers = players.slice(0, 12) as Player[];

const FLAT_ATTRS: Attributes = {
  saque: 5,
  recepcao: 5,
  levantamento: 5,
  ataque: 5,
  bloqueio: 5,
  defesa: 5,
  velocidade: 5,
  resistencia: 5,
  leituraDeJogo: 5,
  regularidade: 5,
  controleEmocional: 5,
};

function makePlayer(
  id: string,
  overrides: { atributos?: Partial<Attributes>; genero?: 'M' | 'F'; posicao?: Position } = {},
): Player {
  return {
    id,
    nome: id,
    apelido: id,
    genero: overrides.genero ?? 'M',
    ativo: true,
    posicaoPrincipal: overrides.posicao ?? 'ponteiro',
    posicoesSecundarias: [],
    maoDominante: 'direita',
    atributos: { ...FLAT_ATTRS, ...(overrides.atributos ?? {}) },
    perfil: { nivel: 5, classe: '', arquetipo: '', especialidade: '', fraqueza: '' },
    formaAtual: { valor: 0, observacao: '', ultimasPartidas: [] },
    status: { lesionado: false, limitacaoFisica: null, presencaFrequente: true },
    metadata: { criadoEm: '2026-01-01', atualizadoEm: '2026-01-01' },
  };
}

function divisionFingerprint(division: { teams: { playerIds: string[] }[] }): string {
  return division.teams
    .map((t) => [...t.playerIds].sort().join(','))
    .sort()
    .join('|');
}

function teamIndexOf(division: { teams: { playerIds: string[] }[] }, playerId: string): number {
  return division.teams.findIndex((t) => t.playerIds.includes(playerId));
}

const baseConfig: FreePlayConfig = {
  type: 'free_play',
  teamCount: 3,
  maxPoints: 15,
  tieBreakMethod: 'win_by_2',
  rotationSystem: 'winner_stays',
  initialCourtTeams: ['', ''],
  initialQueue: [],
  queuePolicy: 'fifo',
  balanceSpeed: 'fast',
};

test('balanceTeams creates complete balanced options with each player exactly once', () => {
  const divisions = balanceTeams(selectedPlayers, 3, 'session-test', baseConfig);

  assert.equal(divisions.length, 3);

  for (const division of divisions) {
    assert.equal(division.teams.length, 3);
    assert.ok(division.diagnostics);
    assert.ok(Number.isFinite(division.score));

    const assignedIds = division.teams.flatMap((team) => team.playerIds);
    assert.deepEqual(new Set(assignedIds), new Set(selectedPlayers.map((player) => player.id)));
    assert.equal(assignedIds.length, selectedPlayers.length);

    const teamSizes = division.teams.map((team) => team.playerIds.length);
    assert.ok(Math.max(...teamSizes) - Math.min(...teamSizes) <= 1);
  }
});

test('balanceTeams respects locked player constraints', () => {
  const lockedPlayer = selectedPlayers[0];
  const divisions = balanceTeams(selectedPlayers, 3, 'locked-session-test', {
    ...baseConfig,
    balanceConstraints: {
      lockedPlayerIdxs: {
        [lockedPlayer.id]: 0,
      },
    },
  });

  assert.equal(divisions.length, 3);

  for (const division of divisions) {
    assert.ok(division.teams[0].playerIds.includes(lockedPlayer.id));
  }
});

// ─── Phase A: scale normalization proves fundamentals matter ──────────────────

test('competitive mode separates equal-overall players by fundamentals', () => {
  // Four players with identical overall (every attribute averages to 5), but two
  // are pure attackers (atk 10 / def 0) and two are pure defenders (atk 0 / def 10).
  // The only balanced split keeps one attacker per team, so A and C must split up.
  const fundamentalPlayers: Player[] = [
    makePlayer('A', { atributos: { ataque: 10, defesa: 0 } }),
    makePlayer('B', { atributos: { ataque: 0, defesa: 10 } }),
    makePlayer('C', { atributos: { ataque: 10, defesa: 0 } }),
    makePlayer('D', { atributos: { ataque: 0, defesa: 10 } }),
  ];

  const divisions = balanceTeams(fundamentalPlayers, 2, 'fundamentals-test', {
    ...baseConfig,
    teamCount: 2,
    balanceMode: 'competitive',
  });

  const best = divisions[0];
  assert.equal(best.teams.length, 2);
  // Equal overall means an overall-only scorer would be indifferent; only a
  // scorer that actually weighs fundamentals separates the two attackers.
  assert.notEqual(teamIndexOf(best, 'A'), teamIndexOf(best, 'C'));
  assert.notEqual(teamIndexOf(best, 'B'), teamIndexOf(best, 'D'));
});

test('changing balanceMode from social to competitive changes the division', () => {
  // With normalized scales the weight profiles have real, divergent effects:
  // social leans on gender/injury/size while competitive leans on fundamentals.
  const pool = players.slice(0, 10) as Player[];
  const social = balanceTeams(pool, 3, 'mode-test', {
    ...baseConfig,
    balanceMode: 'social',
  });
  const competitive = balanceTeams(pool, 3, 'mode-test', {
    ...baseConfig,
    balanceMode: 'competitive',
  });

  assert.notEqual(divisionFingerprint(social[0]), divisionFingerprint(competitive[0]));
});

// ─── Phase B: rotation 6x0 / 5x1 and composition ──────────────────────────────

test('resolveComposition uses 1 libero per team when enough liberos exist', () => {
  const athletes = [
    makePlayer('l1', { posicao: 'libero' }),
    makePlayer('l2', { posicao: 'libero' }),
    makePlayer('p1', { posicao: 'ponteiro' }),
    makePlayer('p2', { posicao: 'ponteiro' }),
  ].map(mapPlayerToAthleteVector);

  const { perTeam, warnings } = resolveComposition(athletes, 2);
  assert.equal(perTeam.libero, 1);
  assert.equal(perTeam.central, 1);
  assert.equal(perTeam.levantador, 1);
  assert.equal(perTeam.ponteiro, 2);
  assert.equal(perTeam.oposto, 1);
  assert.equal(warnings.length, 0);
});

test('resolveComposition falls back to 2 centrals / 0 libero with a warning', () => {
  const athletes = [
    makePlayer('l1', { posicao: 'libero' }),
    makePlayer('p1', { posicao: 'ponteiro' }),
  ].map(mapPlayerToAthleteVector);

  const { perTeam, warnings } = resolveComposition(athletes, 2);
  assert.equal(perTeam.libero, 0);
  assert.equal(perTeam.central, 2);
  assert.ok(warnings.some((w) => w.includes('Líberos insuficientes')));
});

test('5x1 rotation distributes one setter and one libero per team', () => {
  const roster: Player[] = [
    makePlayer('lev1', { posicao: 'levantador' }),
    makePlayer('lev2', { posicao: 'levantador' }),
    makePlayer('pon1', { posicao: 'ponteiro' }),
    makePlayer('pon2', { posicao: 'ponteiro' }),
    makePlayer('pon3', { posicao: 'ponteiro' }),
    makePlayer('pon4', { posicao: 'ponteiro' }),
    makePlayer('opo1', { posicao: 'oposto' }),
    makePlayer('opo2', { posicao: 'oposto' }),
    makePlayer('cen1', { posicao: 'central' }),
    makePlayer('cen2', { posicao: 'central' }),
    makePlayer('lib1', { posicao: 'libero' }),
    makePlayer('lib2', { posicao: 'libero' }),
  ];

  const divisions = balanceTeams(roster, 2, 'rotation-5x1', {
    ...baseConfig,
    teamCount: 2,
    rotationType: '5x1',
  });

  const best = divisions[0];
  for (const team of best.teams) {
    const positions = team.playerIds.map(
      (id) => roster.find((p) => p.id === id)!.posicaoPrincipal,
    );
    assert.equal(positions.filter((p) => p === 'levantador').length, 1);
    assert.equal(positions.filter((p) => p === 'libero').length, 1);
  }
});

test('getQualityLabel maps scores to labels per QUALITY thresholds', () => {
  assert.equal(getQualityLabel(0), 'EXCELLENT');
  assert.equal(getQualityLabel(QUALITY.excellent - 0.1), 'EXCELLENT');
  assert.equal(getQualityLabel(QUALITY.excellent), 'GOOD');
  assert.equal(getQualityLabel(QUALITY.good - 0.1), 'GOOD');
  assert.equal(getQualityLabel(QUALITY.good), 'ACCEPTABLE');
  assert.equal(getQualityLabel(QUALITY.acceptable - 0.1), 'ACCEPTABLE');
  assert.equal(getQualityLabel(QUALITY.acceptable), 'UNBALANCED');
});
