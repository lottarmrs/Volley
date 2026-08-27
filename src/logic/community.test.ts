import test from 'node:test';
import assert from 'node:assert/strict';
import { getCommunityRanking } from './community';
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
