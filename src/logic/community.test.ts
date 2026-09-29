import test from 'node:test';
import assert from 'node:assert/strict';
import { frequentPlayerIds, getCommunityRanking, isFrequentInCommunity } from './community';
import { makeSession } from '../test/fixtures';
import { Game, Player, PointEvent, Session, Team } from '../types';

const player = {
  id: 'player-1',
  nome: 'Maria Silva',
  apelido: 'Maria',
  ativo: true,
  communityIds: ['community-1'],
  atributos: { regularidade: 7 },
  formaAtual: { valor: 6 },
} as Player;

const session = {
  id: 'session-1',
  communityId: 'community-1',
  name: 'Noite de teste',
  date: '2026-07-17',
  status: 'finished',
  type: 'free_play',
  selectedPlayerIds: ['player-1'],
  teamIds: ['team-1', 'team-2'],
  createdAt: '2026-07-17T00:00:00.000Z',
  updatedAt: '2026-07-17T00:00:00.000Z',
} as Session;

const game = {
  id: 'game-1',
  sessionId: 'session-1',
  type: 'free_play',
  sequenceNumber: 1,
  teamAId: 'team-1',
  teamBId: 'team-2',
  scoreA: 1,
  scoreB: 0,
  winnerTeamId: 'team-1',
  loserTeamId: 'team-2',
  status: 'finished',
  pointIds: ['point-1'],
} as Game;

const team = {
  id: 'team-1',
  sessionId: 'session-1',
  name: 'Time 1',
  playerIds: ['player-1'],
} as Team;

function point(input: Partial<PointEvent>): PointEvent {
  return {
    id: Math.random().toString(36).slice(2),
    sessionId: 'session-1',
    gameId: 'game-1',
    sequenceNumber: 1,
    scoringTeamId: 'team-1',
    concedingTeamId: 'team-2',
    scoreBefore: { teamA: 0, teamB: 0 },
    scoreAfter: { teamA: 1, teamB: 0 },
    timestamp: '2026-07-17T20:00:00.000Z',
    ...input,
  } as PointEvent;
}

test('getCommunityRanking counts modern defense counterattacks as attacks', () => {
  const ranking = getCommunityRanking({
    communityId: 'community-1',
    filter: 'all',
    players: [player],
    sessions: [session],
    games: [game],
    pointEvents: [point({ playerId: 'player-1', pointType: 'winner', skill: 'defesa' })],
    teams: [team],
    sessionReports: [],
  });

  assert.equal(ranking.rows[0].totalPoints, 1);
  assert.equal(ranking.rows[0].attacks, 1);
});

function encerrada(id: string, date: string, ids: string[]) {
  return makeSession(id, { status: 'finished', date, selectedPlayerIds: ids });
}

test('sem pelada encerrada ninguem e frequente', () => {
  assert.equal(isFrequentInCommunity('p1', []), false);
  assert.equal(
    isFrequentInCommunity('p1', [
      makeSession('s', { status: 'active', selectedPlayerIds: ['p1'] }),
    ]),
    false,
  );
});

test('frequente e estar em metade, arredondada para cima, das encerradas', () => {
  const sessoes = [
    encerrada('a', '2026-09-01', ['p1']),
    encerrada('b', '2026-09-08', ['p2']),
    encerrada('c', '2026-09-15', ['p1']),
  ];
  assert.equal(isFrequentInCommunity('p1', sessoes), true);
  assert.equal(isFrequentInCommunity('p2', sessoes), false);
});

test('so as 6 encerradas mais recentes contam', () => {
  const antigas = ['01', '02', '03', '04'].map((d, i) =>
    encerrada(`v${i}`, `2026-08-${d}`, ['p1']),
  );
  const recentes = ['01', '02', '03', '04', '05', '06'].map((d, i) =>
    encerrada(`r${i}`, `2026-09-${d}`, i < 2 ? ['p1'] : ['p2']),
  );
  assert.equal(isFrequentInCommunity('p1', [...antigas, ...recentes]), false);
  assert.equal(isFrequentInCommunity('p2', [...antigas, ...recentes]), true);
});

test('frequentPlayerIds junta quem e frequente', () => {
  const sessoes = [
    encerrada('a', '2026-09-01', ['p1', 'p2']),
    encerrada('b', '2026-09-08', ['p1']),
  ];
  assert.deepEqual([...frequentPlayerIds(sessoes)].sort(), ['p1', 'p2']);
});
