import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateMatchRating, calculateSessionRating, gameExposure } from './rating';
import { Game, Player, PointEvent, Team, Position } from '../types';

const player = (id: string, posicaoPrincipal: Position): Player =>
  ({
    id,
    nome: id,
    apelido: id,
    genero: 'M',
    ativo: true,
    posicaoPrincipal,
    posicoesSecundarias: [],
    maoDominante: 'direita',
    atributos: {
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
    },
    perfil: { nivel: 5, classe: '', arquetipo: '', especialidade: '', fraqueza: '' },
    formaAtual: { valor: 0, observacao: '', ultimasPartidas: [] },
    status: { lesionado: false, limitacaoFisica: null, presencaFrequente: true },
    metadata: { criadoEm: '2026-01-01', atualizadoEm: '2026-01-01' },
  }) as Player;

// Jogo padrão dos exemplos: E = 18 (12+6). Vencedor parametrizável.
const game = (over: Partial<Game> = {}): Game =>
  ({
    id: 'g1',
    sessionId: 's1',
    teamAId: 'teamA',
    teamBId: 'teamB',
    scoreA: 12,
    scoreB: 6,
    winnerTeamId: 'teamA',
    status: 'finished',
    ...over,
  }) as unknown as Game;

const pt = (over: Partial<PointEvent>): PointEvent =>
  ({
    id: Math.random().toString(36).slice(2),
    sessionId: 's1',
    gameId: 'g1',
    sequenceNumber: 1,
    scoringTeamId: 'teamA',
    concedingTeamId: 'teamB',
    scoreBefore: { teamA: 0, teamB: 0 },
    scoreAfter: { teamA: 0, teamB: 0 },
    timestamp: '2026-01-01T00:00:00.000Z',
    ...over,
  }) as PointEvent;

const winner = (n: number, over: Partial<PointEvent>) =>
  Array.from({ length: n }, () => pt({ pointType: 'winner', ...over }));
const error = (n: number, over: Partial<PointEvent>) =>
  Array.from({ length: n }, () =>
    pt({ pointType: 'error', scoringTeamId: 'teamB', concedingTeamId: 'teamA', ...over }),
  );

test('setter rating: assists + consistency on a winning night ≈ 7.12', () => {
  const setter = player('setter', 'levantador');
  const points = winner(5, { playerId: 'atk', skill: 'ataque', assistPlayerId: 'setter' });
  const r = calculateMatchRating({
    player: setter,
    game: game(),
    gamePoints: points,
    playerTeamId: 'teamA',
  });
  assert.equal(r, 7.12);
});

test('outside hitter rating: kills + ace − critical errors ≈ 6.56', () => {
  const pont = player('pont', 'ponteiro');
  const points = [
    ...winner(6, { playerId: 'pont', skill: 'ataque' }),
    ...winner(1, { playerId: 'pont', skill: 'saque' }),
    ...error(3, { playerId: 'pont', fault: 'attack_out' }),
  ];
  const r = calculateMatchRating({
    player: pont,
    game: game(),
    gamePoints: points,
    playerTeamId: 'teamA',
  });
  assert.equal(r, 6.56);
});

test('libero rating: digs + highlights + consistency ≈ 7.26', () => {
  const lib = player('lib', 'libero');
  const points = [
    ...winner(2, { playerId: 'lib', skill: 'defesa' }),
    pt({ playerId: 'lib', eventKind: 'highlight', skill: 'defesa' }),
    pt({ playerId: 'lib', eventKind: 'highlight', skill: 'defesa' }),
    ...error(1, { playerId: 'lib', fault: 'reception_floor' }),
  ];
  const r = calculateMatchRating({
    player: lib,
    game: game(),
    gamePoints: points,
    playerTeamId: 'teamA',
  });
  assert.equal(r, 7.26);
});

test('bad attacker rating: many critical errors on a loss ≈ 4.43', () => {
  const op = player('op', 'oposto');
  const points = [
    ...winner(1, { playerId: 'op', skill: 'ataque' }),
    ...error(5, { playerId: 'op', fault: 'attack_out' }),
  ];
  const r = calculateMatchRating({
    player: op,
    game: game({ winnerTeamId: 'teamB' }),
    gamePoints: points,
    playerTeamId: 'teamA',
  });
  // 6 + 0.18 − 5×0.325 − 0.12 = 4.435 (arredonda p/ 4.43 por ponto flutuante)
  assert.equal(r, 4.43);
});

test('catastrophic rating stays near the floor ≈ 3.28', () => {
  const op = player('op', 'oposto');
  const points = error(8, { playerId: 'op', fault: 'attack_out' });
  const r = calculateMatchRating({
    player: op,
    game: game({ winnerTeamId: 'teamB' }),
    gamePoints: points,
    playerTeamId: 'teamA',
  });
  assert.equal(r, 3.28);
});

test('rating never leaves [floor, ceiling]', () => {
  const op = player('op', 'oposto');
  const monster = winner(40, { playerId: 'op', skill: 'saque' });
  const r = calculateMatchRating({
    player: op,
    game: game(),
    gamePoints: monster,
    playerTeamId: 'teamA',
  });
  assert.ok(r <= 10 && r >= 3, `rating ${r} out of bounds`);
});

test('low exposure shrinks the rating toward the baseline', () => {
  const op = player('op', 'oposto');
  // E = 8 -> confiança 0.5. netRaw = 6 + 0.25(ace) + 0.20(win) = 6.45 -> 6 + 0.45*0.5 = 6.23
  const points = winner(1, { playerId: 'op', skill: 'saque' });
  const r = calculateMatchRating({
    player: op,
    game: game({ scoreA: 5, scoreB: 3 }),
    gamePoints: points,
    playerTeamId: 'teamA',
  });
  assert.equal(r, 6.23);
});

test('game exposure uses closed sets without duplicating the final score', () => {
  const finishedMultiSet = game({
    scoreA: 7,
    scoreB: 5,
    sets: [
      { scoreA: 12, scoreB: 10 },
      { scoreA: 10, scoreB: 12 },
      { scoreA: 7, scoreB: 5 },
    ],
  });
  assert.equal(gameExposure(finishedMultiSet), 56);

  const inProgressMultiSet = game({
    status: 'active',
    winnerTeamId: undefined,
    scoreA: 4,
    scoreB: 3,
    sets: [{ scoreA: 12, scoreB: 10 }],
  });
  assert.equal(gameExposure(inProgressMultiSet), 29);
});

test('session rating is the exposure-weighted mean of game ratings', () => {
  const op = player('op', 'oposto');
  const teams = [{ id: 'teamA', playerIds: ['op'] }] as unknown as Team[];
  const g1 = game({ id: 'g1', scoreA: 12, scoreB: 6 }); // E=18, ace+win
  const g2 = game({ id: 'g2', scoreA: 12, scoreB: 4, winnerTeamId: 'teamB' }); // E=16, loss
  const points = [
    pt({ gameId: 'g1', playerId: 'op', pointType: 'winner', skill: 'saque' }),
    pt({
      gameId: 'g2',
      playerId: 'op',
      pointType: 'error',
      fault: 'attack_out',
      scoringTeamId: 'teamB',
      concedingTeamId: 'teamA',
    }),
  ];
  const r1 = calculateMatchRating({
    player: op,
    game: g1,
    gamePoints: [points[0]],
    playerTeamId: 'teamA',
  });
  const r2 = calculateMatchRating({
    player: op,
    game: g2,
    gamePoints: [points[1]],
    playerTeamId: 'teamA',
  });
  const expected = Math.round(((r1 * 18 + r2 * 16) / 34) * 100) / 100;

  const session = calculateSessionRating({
    player: op,
    sessionGames: [g1, g2],
    sessionPoints: points,
    teams,
  });
  assert.equal(session, expected);
});

test('session rating weights multi-set matches by total set exposure', () => {
  const op = player('op', 'oposto');
  const teams = [{ id: 'teamA', playerIds: ['op'] }] as unknown as Team[];
  const multiSet = game({
    id: 'g1',
    scoreA: 7,
    scoreB: 5,
    sets: [
      { scoreA: 12, scoreB: 10 },
      { scoreA: 10, scoreB: 12 },
      { scoreA: 7, scoreB: 5 },
    ],
  });
  const singleSet = game({ id: 'g2', scoreA: 12, scoreB: 6 });
  const points = [
    pt({ gameId: 'g1', playerId: 'op', pointType: 'winner', skill: 'saque' }),
    pt({
      gameId: 'g2',
      playerId: 'op',
      pointType: 'error',
      fault: 'attack_out',
      scoringTeamId: 'teamB',
      concedingTeamId: 'teamA',
    }),
  ];
  const r1 = calculateMatchRating({
    player: op,
    game: multiSet,
    gamePoints: [points[0]],
    playerTeamId: 'teamA',
  });
  const r2 = calculateMatchRating({
    player: op,
    game: singleSet,
    gamePoints: [points[1]],
    playerTeamId: 'teamA',
  });
  const expected = Math.round(((r1 * 56 + r2 * 18) / 74) * 100) / 100;

  const session = calculateSessionRating({
    player: op,
    sessionGames: [multiSet, singleSet],
    sessionPoints: points,
    teams,
  });
  assert.equal(session, expected);
});

test('session rating is null when the player has no team/exposure', () => {
  const op = player('op', 'oposto');
  const session = calculateSessionRating({
    player: op,
    sessionGames: [game()],
    sessionPoints: [],
    teams: [],
  });
  assert.equal(session, null);
});
