import test from 'node:test';
import assert from 'node:assert/strict';
import { Player, Position, Session, Team, Game, PointEvent } from '../types';
import {
  toFut,
  tierFromOvr,
  generateFutStats,
  resolvePlayerEdition,
  playerChemistry,
  resolveCardFrame,
  buildVutCard,
  applySkillValues,
  formHistoryFromSessions,
  EditionContext,
  BuildVutCardContext,
  editionHistory,
} from './futCards';
import { PartnershipMatrix } from './partnershipHistory';
import { calculateSessionRating } from './rating';

const createPlayer = (
  id: string,
  mainPos: Position,
  overAtributos: Partial<Player['atributos']> = {},
): Player =>
  ({
    id,
    nome: `Player ${id}`,
    apelido: id,
    genero: 'M',
    ativo: true,
    posicaoPrincipal: mainPos,
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
      ...overAtributos,
    },
    perfil: { nivel: 5, classe: '', arquetipo: '', especialidade: '', fraqueza: '' },
    formaAtual: { valor: 6.0, observacao: '', ultimasPartidas: [] },
    status: { lesionado: false, limitacaoFisica: null, presencaFrequente: true },
    metadata: { criadoEm: '2026-01-01', atualizadoEm: '2026-01-01' },
  }) as Player;

test('toFut maps attribute ranges to FUT scale 1-99', () => {
  assert.equal(toFut(0), 20); // offset
  assert.equal(toFut(5), 60); // 20 + 5*8
  assert.equal(toFut(10), 99); // max out at 99 (20 + 80 = 100 -> clamped to 99)
});

test('toFut never returns NaN for a player with no attributes', () => {
  // Jogador criado junto com a conta tem atributos {} (default jsonb), entao
  // atributos.ataque chega undefined e o NaN vazava para o DOM como texto da carta.
  // As seis macro-stats passam por aqui, entao a guarda cobre todas.
  assert.equal(toFut(undefined as unknown as number), 20);
  assert.equal(toFut(NaN), 20);
  assert.ok(Number.isFinite(toFut((undefined as unknown as number) + 1)));
  // Valores reais seguem intactos.
  assert.equal(toFut(5), 60);
});

test('generateFutStats produces finite stats for an account-created player', () => {
  // Exatamente o que chega do banco: ensure_account_ready insere so
  // owner_id/user_id/name/username, entao attributes/forma_atual ficam '{}'::jsonb e
  // primary_position nulo, e o mapper repassa como esta.
  const player = {
    id: 'p-empty',
    nome: 'TESTEADM',
    apelido: '',
    ativo: true,
    posicaoPrincipal: null,
    posicoesSecundarias: [],
    atributos: {},
    perfil: {},
    formaAtual: {},
    status: {},
  } as unknown as Player;

  const stats = generateFutStats(player);

  for (const [key, value] of Object.entries(stats)) {
    if (typeof value === 'number') {
      assert.ok(Number.isFinite(value), `${key} veio ${value}`);
    }
  }
});

test('tierFromOvr maps OVR to correct VUT tier', () => {
  assert.equal(tierFromOvr(59), 'bronze');
  assert.equal(tierFromOvr(60), 'silver');
  assert.equal(tierFromOvr(74), 'silver');
  assert.equal(tierFromOvr(75), 'gold');
  assert.equal(tierFromOvr(84), 'gold');
  assert.equal(tierFromOvr(85), 'elite');
});

test('generateFutStats computes OVR, macro stats and versatility', () => {
  const player = createPlayer('p1', 'levantador', {
    levantamento: 8,
    velocidade: 6,
    resistencia: 8,
  });
  const stats = generateFutStats(player);

  assert.equal(stats.lev, toFut(8));
  assert.equal(stats.fis, toFut(7)); // average of 6 and 8
  assert.ok(stats.ovr > 0 && stats.ovr <= 99);
  assert.ok(['bronze', 'silver', 'gold', 'elite'].includes(stats.tier));
});

test('playerChemistry extracts top partners correctly', () => {
  const matrix: PartnershipMatrix = {
    'p1|p2': 3.5,
    'p1|p3': 5.0,
    'p4|p1': 2.0,
    'p2|p3': 1.0,
  };
  const players = [
    createPlayer('p1', 'levantador'),
    createPlayer('p2', 'oposto'),
    createPlayer('p3', 'central'),
    createPlayer('p4', 'libero'),
  ];

  const chemistry = playerChemistry('p1', matrix, players, 2);
  assert.equal(chemistry.length, 2);
  assert.equal(chemistry[0].playerId, 'p3'); // weight 5.0
  assert.equal(chemistry[1].playerId, 'p2'); // weight 3.5
});

test('resolveCardFrame returns default frame if no achievements unlocked', () => {
  const frame = resolveCardFrame([]);
  assert.equal(frame.id, 'default');
  assert.equal(frame.rarity, 'common');
});

test('resolvePlayerEdition resolves MVP, Maestro, Muralha, In-Form, and Base priorities', () => {
  const player = createPlayer('p1', 'levantador');
  const other = createPlayer('p2', 'oposto');

  // Case 1: base case (no context)
  const baseEdition = resolvePlayerEdition(player, null);
  assert.equal(baseEdition.kind, 'base');

  // Setup mock games and events
  const game1 = {
    id: 'g1',
    sessionId: 's1',
    teamAId: 't1',
    teamBId: 't2',
    scoreA: 25,
    scoreB: 23,
    winnerTeamId: 't1',
    status: 'finished',
  } as unknown as Game;

  const points: PointEvent[] = [
    {
      id: 'pt1',
      sessionId: 's1',
      gameId: 'g1',
      sequenceNumber: 1,
      pointType: 'winner',
      skill: 'ataque',
      playerId: 'p1',
      scoringTeamId: 't1',
      concedingTeamId: 't2',
      scoreBefore: { teamA: 0, teamB: 0 },
      scoreAfter: { teamA: 1, teamB: 0 },
      timestamp: '2026-01-01T00:00:00.000Z',
    } as PointEvent,
  ];

  const teams: Team[] = [
    {
      id: 't1',
      sessionId: 's1',
      name: 'Team A',
      playerIds: ['p1'],
    } as unknown as Team,
    {
      id: 't2',
      sessionId: 's1',
      name: 'Team B',
      playerIds: ['p2'],
    } as unknown as Team,
  ];

  const ctx: EditionContext = {
    lastSessionPoints: points,
    lastSessionGames: [game1],
    lastSessionTeams: teams,
    participants: [player, other],
  };

  // p1 won the game, had 1 attack. p2 had no points.
  // p1 should be MVP
  const p1Edition = resolvePlayerEdition(player, ctx);
  assert.equal(p1Edition.kind, 'mvp');

  // Test In-Form
  const inFormPlayer = createPlayer('p3', 'ponteiro');
  inFormPlayer.formaAtual = {
    valor: 8.5,
    observacao: 'Very good',
    ultimasPartidas: [7.5, 8.0, 8.5], // streak of 3 >= 7.0
  };
  const informEdition = resolvePlayerEdition(inFormPlayer, null);
  assert.equal(informEdition.kind, 'in_form');
});

test('buildVutCard runs end-to-end and returns complete structure', () => {
  const player = createPlayer('p1', 'levantador');
  const session = {
    id: 's1',
    name: 'Session 1',
    date: '2026-06-19',
    status: 'finished',
    config: {
      maxGames: 5,
      pointsToWin: 25,
      balanceMode: 'social',
      qualityCheck: false,
      isTournament: false,
    },
  } as unknown as Session;

  const team = {
    id: 't1',
    sessionId: 's1',
    name: 'Team A',
    playerIds: ['p1'],
  } as unknown as Team;

  const game = {
    id: 'g1',
    sessionId: 's1',
    teamAId: 't1',
    teamBId: 't2',
    scoreA: 25,
    scoreB: 20,
    winnerTeamId: 't1',
    status: 'finished',
  } as unknown as Game;

  const buildCtx: BuildVutCardContext = {
    sessions: [session],
    teams: [team],
    games: [game],
    pointEvents: [],
    players: [player],
    sessionReports: [],
  };

  const card = buildVutCard(player, buildCtx);
  assert.equal(card.player.id, 'p1');
  assert.equal(card.posLabel, 'LEV');
  assert.ok(card.stats.ovr > 0);
  assert.ok(Array.isArray(card.achievements));
  assert.ok(card.activeFrame);
});

test('applySkillValues: fundamento faltante usa a media dos avaliados do proprio atleta', () => {
  const base = createPlayer('p1', 'ponteiro');
  const { player, rated } = applySkillValues(base, { ataque: 9, saque: 7 });
  assert.equal(rated, true);
  assert.equal(player.atributos.ataque, 9);
  assert.equal(player.atributos.saque, 7);
  assert.equal(player.atributos.defesa, 8);
  assert.equal(player.atributos.controleEmocional, 8);
});

test('applySkillValues: sem nenhum fundamento, nao avaliado e atributos intactos', () => {
  const base = createPlayer('p1', 'ponteiro');
  const { player, rated } = applySkillValues(base, {});
  assert.equal(rated, false);
  assert.equal(player, base);
});

test('generateFutStats usa a avaliacao quando passada', () => {
  const base = createPlayer('p1', 'ponteiro');
  const comAvaliacao = generateFutStats(base, {
    saque: 9,
    recepcao: 9,
    levantamento: 9,
    ataque: 9,
    bloqueio: 9,
    defesa: 9,
    velocidade: 9,
    resistencia: 9,
    leituraDeJogo: 9,
    regularidade: 9,
    controleEmocional: 9,
  });
  const semAvaliacao = generateFutStats(base);
  assert.equal(comAvaliacao.atq, toFut(9));
  assert.equal(comAvaliacao.rated, true);
  assert.ok(comAvaliacao.ovr > semAvaliacao.ovr);
  assert.equal(semAvaliacao.rated, true);
  assert.equal(semAvaliacao.atq, toFut(5));
});

test('generateFutStats com null: aguardando avaliacao', () => {
  const stats = generateFutStats(createPlayer('p1', 'ponteiro'), null);
  assert.equal(stats.rated, false);
});

test('buildVutCard: atleta fora do mapa de avaliacao fica aguardando avaliacao', () => {
  const ctx: BuildVutCardContext = {
    sessions: [],
    teams: [],
    games: [],
    pointEvents: [],
    players: [],
    sessionReports: [],
    skillValues: new Map([['outro', { ataque: 8 }]]),
  };
  const card = buildVutCard(createPlayer('p1', 'ponteiro'), ctx);
  assert.equal(card.stats.rated, false);
});

test('formHistoryFromSessions: notas das peladas encerradas, em ordem, no maximo 10', () => {
  const player = createPlayer('p1', 'ponteiro');
  const sessions: Session[] = [];
  const teams: Team[] = [];
  const games: Game[] = [];
  const pointEvents: PointEvent[] = [];
  const jogo = (i: number | string, scoreA: number, scoreB: number) =>
    ({
      id: `g${i}`,
      sessionId: `s${i}`,
      teamAId: `ta${i}`,
      teamBId: `tb${i}`,
      scoreA,
      scoreB,
      winnerTeamId: scoreA > scoreB ? `ta${i}` : `tb${i}`,
      status: 'finished',
    }) as unknown as Game;
  for (let i = 11; i >= 0; i--) {
    const sid = `s${i}`;
    sessions.push({
      id: sid,
      name: sid,
      date: `2026-06-${String(i + 1).padStart(2, '0')}`,
      status: 'finished',
    } as unknown as Session);
    teams.push({ id: `ta${i}`, sessionId: sid, name: 'A', playerIds: ['p1'] } as unknown as Team);
    teams.push({ id: `tb${i}`, sessionId: sid, name: 'B', playerIds: ['p2'] } as unknown as Team);
    games.push(i % 2 === 0 ? jogo(i, 25, 10 + i) : jogo(i, 15 + i, 25));
    for (let k = 0; k < i; k++) {
      pointEvents.push({
        id: `pt${i}-${k}`,
        sessionId: sid,
        gameId: `g${i}`,
        playerId: 'p1',
        pointType: 'winner',
      } as unknown as PointEvent);
    }
  }
  sessions.push({
    id: 'saberta',
    name: 'aberta',
    date: '2026-07-01',
    status: 'active',
  } as unknown as Session);
  teams.push({ id: 'taaberta', sessionId: 'saberta', name: 'A', playerIds: ['p1'] } as never);
  teams.push({ id: 'tbaberta', sessionId: 'saberta', name: 'B', playerIds: ['p2'] } as never);
  games.push(jogo('aberta', 25, 0));

  const notaDa = (i: number | string) =>
    calculateSessionRating({
      player,
      sessionGames: games.filter((game) => game.sessionId === `s${i}`),
      sessionPoints: pointEvents.filter((point) => point.sessionId === `s${i}`),
      teams: teams.filter((team) => team.sessionId === `s${i}`),
    });
  const esperado = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((i) => notaDa(i));
  assert.ok(new Set(esperado).size > 2);
  assert.notEqual(notaDa('aberta'), null);
  assert.notEqual(notaDa('aberta'), notaDa(11));

  const hist = formHistoryFromSessions(player, { sessions, teams, games, pointEvents });
  assert.deepEqual(hist, esperado);
  assert.equal(hist[hist.length - 1], notaDa(11));
});

test('buildVutCard: atleta com conta tem a forma reconstruida pelo historico', () => {
  const player = { ...createPlayer('p1', 'ponteiro'), userId: 'conta-1' } as Player;
  const session = {
    id: 's1',
    name: 's1',
    date: '2026-06-01',
    status: 'finished',
  } as unknown as Session;
  const teams = [
    { id: 't1', sessionId: 's1', name: 'A', playerIds: ['p1'] },
    { id: 't2', sessionId: 's1', name: 'B', playerIds: ['p2'] },
  ] as unknown as Team[];
  const games = [
    {
      id: 'g1',
      sessionId: 's1',
      teamAId: 't1',
      teamBId: 't2',
      scoreA: 25,
      scoreB: 20,
      winnerTeamId: 't1',
      status: 'finished',
    },
  ] as unknown as Game[];
  const card = buildVutCard(player, {
    sessions: [session],
    teams,
    games,
    pointEvents: [],
    players: [player],
    sessionReports: [],
  });
  assert.notEqual(card.formBadge.value, null);
  assert.equal(card.player.formaAtual.ultimasPartidas.length, 1);
});

function noite(
  sid: string,
  date: string,
  status: 'finished' | 'active',
  pontosDaAna: number,
  pontosDaBia: number,
) {
  const session = {
    id: sid,
    name: sid,
    date,
    status,
    createdAt: `${date}T20:00:00Z`,
  } as unknown as Session;
  const teams = [
    { id: `${sid}-a`, sessionId: sid, name: 'A', playerIds: ['ana'] },
    { id: `${sid}-b`, sessionId: sid, name: 'B', playerIds: ['bia'] },
  ] as unknown as Team[];
  const vencedor = pontosDaAna >= pontosDaBia ? `${sid}-a` : `${sid}-b`;
  const games = [
    {
      id: `${sid}-g`,
      sessionId: sid,
      teamAId: `${sid}-a`,
      teamBId: `${sid}-b`,
      scoreA: pontosDaAna,
      scoreB: pontosDaBia,
      winnerTeamId: vencedor,
      status: 'finished',
    },
  ] as unknown as Game[];
  const ponto = (playerId: string, time: string, outro: string, n: number) =>
    ({
      id: `${sid}-${playerId}-${n}`,
      sessionId: sid,
      gameId: `${sid}-g`,
      sequenceNumber: n,
      pointType: 'winner',
      skill: 'ataque',
      playerId,
      scoringTeamId: time,
      concedingTeamId: outro,
      scoreBefore: { teamA: 0, teamB: 0 },
      scoreAfter: { teamA: 0, teamB: 0 },
      timestamp: `${date}T20:00:00.000Z`,
    }) as unknown as PointEvent;
  const pointEvents = [
    ...Array.from({ length: pontosDaAna }, (_, i) => ponto('ana', `${sid}-a`, `${sid}-b`, i + 1)),
    ...Array.from({ length: pontosDaBia }, (_, i) => ponto('bia', `${sid}-b`, `${sid}-a`, 100 + i)),
  ];
  return { session, teams, games, pointEvents };
}

function historicoDe(noites: ReturnType<typeof noite>[]): BuildVutCardContext {
  return {
    sessions: noites.map((n) => n.session),
    teams: noites.flatMap((n) => n.teams),
    games: noites.flatMap((n) => n.games),
    pointEvents: noites.flatMap((n) => n.pointEvents),
    players: [createPlayer('ana', 'ponteiro'), createPlayer('bia', 'ponteiro')],
    sessionReports: [],
  };
}

test('editionHistory: uma entrada por noite de edicao especial, mais recente primeiro', () => {
  const ana = createPlayer('ana', 'ponteiro');
  const ctx = historicoDe([
    noite('s1', '2026-06-01', 'finished', 15, 5),
    noite('s2', '2026-06-08', 'finished', 15, 5),
  ]);
  const hist = editionHistory(ana, ctx);
  assert.deepEqual(
    hist.map((e) => [e.sessionId, e.date]),
    [
      ['s2', '2026-06-08'],
      ['s1', '2026-06-01'],
    ],
  );
  assert.ok(hist.every((e) => ['mvp', 'maestro', 'muralha'].includes(e.edition.kind)));
});

test('editionHistory: noite sem edicao, pelada nao encerrada e in_form nao entram', () => {
  const ana = {
    ...createPlayer('ana', 'ponteiro'),
    formaAtual: { valor: 0, observacao: '', ultimasPartidas: [9, 9, 9, 9, 9] },
  } as Player;
  const ctx = historicoDe([
    noite('s1', '2026-06-01', 'finished', 2, 15),
    noite('s2', '2026-06-08', 'active', 15, 2),
  ]);
  assert.deepEqual(editionHistory(ana, ctx), []);
});
