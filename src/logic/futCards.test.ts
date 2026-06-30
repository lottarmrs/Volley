import test from 'node:test';
import assert from 'node:assert/strict';
import { Player, Position, Session, Team, Game, PointEvent } from '../types';
import {
  toFut,
  tierFromOvr,
  generateFutStats,
  resolvePlayerEdition,
  playerChemistry,
  resolveAchievements,
  resolveCardFrame,
  buildVutCard,
  ACHIEVEMENT_CATALOG,
  EditionContext,
  BuildVutCardContext,
} from './futCards';
import { PartnershipMatrix } from './partnershipHistory';

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
