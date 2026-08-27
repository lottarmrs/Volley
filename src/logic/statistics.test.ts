import test from 'node:test';
import assert from 'node:assert/strict';
import { calculatePlayerStats } from './statistics';
import { calculateAttributeProgression } from './progression';
import { calculateSessionRecognition } from './match';
import { Game, Player, PointEvent, Session, Team } from '../types';

const player = (id: string): Player =>
  ({
    id,
    nome: id,
    apelido: id,
    genero: 'M',
    ativo: true,
    posicaoPrincipal: 'ponteiro',
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

const session: Session = {
  id: 's1',
  name: 'Test',
  date: '2026-01-01',
  status: 'finished',
  selectedPlayerIds: [],
  teamIds: [],
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
};

const teamA = { id: 'teamA', playerIds: ['p1', 'p2'] } as unknown as Team;
const teamB = { id: 'teamB', playerIds: ['p3'] } as unknown as Team;

const game = {
  id: 'g1',
  sessionId: 's1',
  teamAId: 'teamA',
  teamBId: 'teamB',
  winnerTeamId: 'teamA',
  status: 'finished',
} as unknown as Game;

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

const points: PointEvent[] = [
  // p1 — ace (taxonomia nova)
  pt({ playerId: 'p1', pointType: 'winner', skill: 'saque', playerTeamId: 'teamA' }),
  // p1 — cortada (legado, sem pointType)
  pt({ playerId: 'p1', reason: 'attack' }),
  // p2 — bloqueio (taxonomia nova)
  pt({ playerId: 'p2', pointType: 'winner', skill: 'bloqueio', playerTeamId: 'teamA' }),
  // p1 — erro (taxonomia nova): teamB pontua por falta do p1
  pt({
    scoringTeamId: 'teamB',
    concedingTeamId: 'teamA',
    playerId: 'p1',
    pointType: 'error',
    fault: 'saque_fora',
    playerTeamId: 'teamA',
  }),
];

test('aggregates skills by both new taxonomy and legacy reason', () => {
  const stats = calculatePlayerStats(player('p1'), [game], points, [teamA, teamB], [session]);
  assert.equal(stats.aces, 1);
  assert.equal(stats.cortadas, 1);
  assert.equal(stats.totalPoints, 2); // ace + cortada
  assert.equal(stats.blocks, 0);
});

test('attributes faults by type and computes individual balance', () => {
  const stats = calculatePlayerStats(player('p1'), [game], points, [teamA, teamB], [session]);
  assert.equal(stats.errors, 1);
  assert.equal(stats.errorsByType.saque_fora, 1);
  assert.equal(stats.balance, 1); // 2 pontos − 1 erro
});

test('pointsContribution is player credited points over team credited points', () => {
  // teamA conquistou 3 pontos (ace, cortada, bloqueio); p1 fez 2 deles.
  const p1 = calculatePlayerStats(player('p1'), [game], points, [teamA, teamB], [session]);
  const p2 = calculatePlayerStats(player('p2'), [game], points, [teamA, teamB], [session]);
  assert.ok(Math.abs(p1.pointsContribution - (2 / 3) * 100) < 0.001);
  assert.ok(Math.abs(p2.pointsContribution - (1 / 3) * 100) < 0.001);
});

test('points from unfinished sessions are ignored', () => {
  const draftSession: Session = { ...session, status: 'active' };
  const stats = calculatePlayerStats(player('p1'), [game], points, [teamA, teamB], [draftSession]);
  assert.equal(stats.totalPoints, 0);
  assert.equal(stats.gamesPlayed, 0);
});

test('calculateAttributeProgression applies point rewards and fault penalties correctly based on position', () => {
  const p1 = player('p1');
  p1.posicaoPrincipal = 'ponteiro'; // critical attributes: ataque, recepcao, defesa
  p1.atributos.ataque = 5;
  p1.atributos.saque = 5;

  const sessionPoints: PointEvent[] = [
    // Winner on critical attribute (ataque) -> delta = +0.1
    pt({ playerId: 'p1', pointType: 'winner', skill: 'ataque' }),
    // Winner on non-critical attribute (saque) -> delta = +0.05
    pt({ playerId: 'p1', pointType: 'winner', skill: 'saque' }),
    // Fault on non-critical attribute (saque_fora) -> delta = -0.05
    pt({ playerId: 'p1', pointType: 'error', fault: 'saque_fora' }),
    // Fault on critical attribute (ataque_fora) -> delta = -0.1
    pt({ playerId: 'p1', pointType: 'error', fault: 'ataque_fora' }),
  ];

  const updated = calculateAttributeProgression([p1], sessionPoints);
  const updatedP1 = updated.find((x) => x.id === 'p1')!;

  // ataque: 5 + 0.1 (winner) - 0.1 (fault) = 5
  assert.equal(updatedP1.atributos.ataque, 5);
  // saque: 5 + 0.05 (winner) - 0.05 (fault) = 5
  assert.equal(updatedP1.atributos.saque, 5);
});

test('calculateAttributeProgression applies deltas and clamps correctly', () => {
  const p1 = player('p1');
  p1.posicaoPrincipal = 'ponteiro';
  p1.atributos.ataque = 5;
  p1.atributos.saque = 9.98; // Close to max

  const sessionPoints: PointEvent[] = [
    pt({ playerId: 'p1', pointType: 'winner', skill: 'ataque' }), // +0.1
    pt({ playerId: 'p1', pointType: 'winner', skill: 'saque' }), // +0.05 -> should clamp to 10
  ];

  const updated = calculateAttributeProgression([p1], sessionPoints);
  const updatedP1 = updated.find((x) => x.id === 'p1')!;

  assert.equal(updatedP1.atributos.ataque, 5.1);
  assert.equal(updatedP1.atributos.saque, 10);
});

test('aggregates new error taxonomy categories and updates statistics and progression correctly', () => {
  const p1 = player('p1');
  p1.posicaoPrincipal = 'ponteiro';
  p1.atributos.recepcao = 5;
  p1.atributos.levantamento = 5;

  const newPoints = [
    // p1 makes a reception error (reception_floor)
    pt({
      scoringTeamId: 'teamB',
      concedingTeamId: 'teamA',
      playerId: 'p1',
      pointType: 'error',
      fault: 'reception_floor',
      playerTeamId: 'teamA',
    }),
    // p1 makes a setting error (setting_double)
    pt({
      scoringTeamId: 'teamB',
      concedingTeamId: 'teamA',
      playerId: 'p1',
      pointType: 'error',
      fault: 'setting_double',
      playerTeamId: 'teamA',
    }),
  ];

  // Verify statistics
  const stats = calculatePlayerStats(p1, [game], newPoints, [teamA, teamB], [session]);
  assert.equal(stats.errors, 2);
  assert.equal(stats.errorsByType.reception_floor, 1);
  assert.equal(stats.errorsByType.setting_double, 1);

  // Verify progression (reception is critical for pointer, setting is not)
  const updated = calculateAttributeProgression([p1], newPoints);
  const updatedP1 = updated.find((x) => x.id === 'p1')!;

  // recepcao: 5 - 0.1 = 4.9 (critical for pointer)
  assert.equal(updatedP1.atributos.recepcao, 4.9);
  // levantamento: 5 - 0.05 = 4.95 (non-critical for pointer)
  assert.equal(updatedP1.atributos.levantamento, 4.95);
});

test('highlight events never count as points, errors or ranking', () => {
  const p1 = player('p1');
  const highlightPoints: PointEvent[] = [
    pt({ playerId: 'p1', eventKind: 'highlight', skill: 'defesa', scoringTeamId: 'teamA' }),
  ];
  const stats = calculatePlayerStats(p1, [game], highlightPoints, [teamA, teamB], [session]);
  assert.equal(stats.totalPoints, 0);
  assert.equal(stats.errors, 0);
  assert.equal(stats.highlights, 1);
});

test('consistency engine rewards a low-error setter with high exposure', () => {
  const setter = player('sx');
  setter.posicaoPrincipal = 'levantador';
  setter.atributos.levantamento = 5;

  const setterTeam = { id: 'teamA', playerIds: ['sx'] } as unknown as Team;
  const finishedGames = [
    {
      id: 'g1',
      sessionId: 's1',
      teamAId: 'teamA',
      teamBId: 'teamB',
      scoreA: 25,
      scoreB: 20,
      status: 'finished',
    },
    {
      id: 'g2',
      sessionId: 's1',
      teamAId: 'teamA',
      teamBId: 'teamB',
      scoreA: 25,
      scoreB: 18,
      status: 'finished',
    },
  ] as unknown as Game[];

  // Zero setting errors across high exposure (88 rallies).
  const updated = calculateAttributeProgression([setter], [], finishedGames, [setterTeam]);
  const u = updated.find((x) => x.id === 'sx')!;
  // taxaOk=1, baseline=0.88, confidence=1 -> +0.12, freado pelo teto (current 5) = 0.12
  assert.equal(u.atributos.levantamento, 5.12);
});

test('consistency engine credits explicit assists on top of consistency', () => {
  const setter = player('sx');
  setter.posicaoPrincipal = 'levantador';
  setter.atributos.levantamento = 5;

  const setterTeam = { id: 'teamA', playerIds: ['sx'] } as unknown as Team;
  const finishedGames = [
    {
      id: 'g1',
      sessionId: 's1',
      teamAId: 'teamA',
      teamBId: 'teamB',
      scoreA: 25,
      scoreB: 20,
      status: 'finished',
    },
  ] as unknown as Game[];

  // 2 ataques assistidos pelo levantador (assistPlayerId = sx).
  const assistPoints: PointEvent[] = [
    pt({
      gameId: 'g1',
      playerId: 'atk',
      pointType: 'winner',
      skill: 'ataque',
      assistPlayerId: 'sx',
    }),
    pt({
      gameId: 'g1',
      playerId: 'atk',
      pointType: 'winner',
      skill: 'ataque',
      assistPlayerId: 'sx',
    }),
  ];

  const updated = calculateAttributeProgression([setter], assistPoints, finishedGames, [
    setterTeam,
  ]);
  const u = updated.find((x) => x.id === 'sx')!;
  // exposure=45, confidence=min(1,45/20)=1, taxaOk=1 -> consist=0.12; feats=2*0.1=0.2 -> 0.32
  assert.equal(u.atributos.levantamento, 5.32);
});

test('consistency engine falls back to per-event below exposure gate', () => {
  const setter = player('sx');
  setter.posicaoPrincipal = 'levantador'; // levantamento é crítico -> peso 0.1
  setter.atributos.levantamento = 5;

  const setterTeam = { id: 'teamA', playerIds: ['sx'] } as unknown as Team;
  // Exposição = 3 < eMin(6) -> usa per-evento.
  const tinyGame = [
    {
      id: 'g1',
      sessionId: 's1',
      teamAId: 'teamA',
      teamBId: 'teamB',
      scoreA: 2,
      scoreB: 1,
      status: 'finished',
    },
  ] as unknown as Game[];

  const errPoints: PointEvent[] = [
    pt({
      gameId: 'g1',
      scoringTeamId: 'teamB',
      concedingTeamId: 'teamA',
      playerId: 'sx',
      pointType: 'error',
      fault: 'setting_double',
      playerTeamId: 'teamA',
    }),
  ];

  const updated = calculateAttributeProgression([setter], errPoints, tinyGame, [setterTeam]);
  const u = updated.find((x) => x.id === 'sx')!;
  // per-evento: setting_double -> levantamento crítico -> -0.1
  assert.equal(u.atributos.levantamento, 4.9);
});

test('session recognition surfaces top setter (maestro) and top defender (muralha)', () => {
  const recPoints: PointEvent[] = [
    pt({ playerId: 'atk', pointType: 'winner', skill: 'ataque', assistPlayerId: 'set1' }),
    pt({ playerId: 'atk', pointType: 'winner', skill: 'ataque', assistPlayerId: 'set1' }),
    pt({ playerId: 'atk2', pointType: 'winner', skill: 'ataque', assistPlayerId: 'set2' }),
    pt({ playerId: 'lib', eventKind: 'highlight', skill: 'defesa' }),
    pt({ playerId: 'lib', eventKind: 'highlight', skill: 'recepcao' }),
  ];
  const rec = calculateSessionRecognition(recPoints);
  assert.equal(rec.maestro?.playerId, 'set1');
  assert.equal(rec.maestro?.count, 2);
  assert.equal(rec.muralha?.playerId, 'lib');
  assert.equal(rec.muralha?.count, 2);
});
