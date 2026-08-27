import test from 'node:test';
import assert from 'node:assert/strict';
import { generateGameReport, generateSessionReport } from './reports';
import { Game, Player, PointEvent, Session, Team } from '../types';

const game: Game = {
  id: 'game-1',
  sessionId: 'session-1',
  type: 'tournament',
  sequenceNumber: 1,
  teamAId: 'team-a',
  teamBId: 'team-b',
  scoreA: 5,
  scoreB: 0,
  winnerTeamId: 'team-a',
  loserTeamId: 'team-b',
  status: 'finished',
  pointIds: [],
};

const teams = [
  {
    id: 'team-a',
    sessionId: 'session-1',
    name: 'Time A',
    playerIds: ['player-1'],
  },
  {
    id: 'team-b',
    sessionId: 'session-1',
    name: 'Time B',
    playerIds: ['player-2'],
  },
] as Team[];

const players = [
  { id: 'player-1', nome: 'Atacante', apelido: 'Atk' },
  { id: 'player-2', nome: 'Defensor', apelido: 'Def' },
] as Player[];

function point(input: Partial<PointEvent>): PointEvent {
  return {
    id: Math.random().toString(36).slice(2),
    sessionId: 'session-1',
    gameId: 'game-1',
    sequenceNumber: 1,
    scoringTeamId: 'team-a',
    concedingTeamId: 'team-b',
    scoreBefore: { teamA: 0, teamB: 0 },
    scoreAfter: { teamA: 0, teamB: 0 },
    timestamp: '2026-01-01',
    ...input,
  } as PointEvent;
}

test('generateGameReport counts modern point taxonomy by skill', () => {
  const report = generateGameReport(
    game,
    [
      point({ playerId: 'player-1', pointType: 'winner', skill: 'ataque' }),
      point({ playerId: 'player-1', pointType: 'winner', skill: 'saque' }),
      point({ playerId: 'player-1', pointType: 'winner', skill: 'bloqueio' }),
      point({ playerId: 'player-1', pointType: 'winner', skill: 'defesa' }),
      point({ playerId: 'player-1', pointType: 'winner', skill: 'largada' }),
    ],
    teams,
    players,
  );

  const playerStats = report.playerStats.find((row) => row.playerId === 'player-1');
  assert.ok(playerStats);
  assert.equal(playerStats.totalPoints, 5);
  assert.equal(playerStats.attacks, 3);
  assert.equal(playerStats.aces, 1);
  assert.equal(playerStats.blocks, 1);
  assert.equal(playerStats.tips, 1);
  assert.equal(playerStats.counterAttacks, 1);
});

const tournamentSession = {
  id: 's1',
  name: 'Torneio',
  date: '2026-08-10',
  status: 'finished',
  type: 'tournament',
  selectedPlayerIds: [],
  teamIds: ['t1', 't2'],
} as unknown as Session;
const tournamentTeams = [
  { id: 't1', sessionId: 's1', name: 'Time 1', playerIds: [] },
  { id: 't2', sessionId: 's1', name: 'Time 2', playerIds: [] },
] as unknown as Team[];
const noPlayers: Player[] = [];

const tournamentGames = [
  {
    id: 'g1',
    sessionId: 's1',
    status: 'finished',
    teamAId: 't1',
    teamBId: 't2',
    scoreA: 2,
    scoreB: 1,
    winnerTeamId: 't1',
    sequenceNumber: 1,
  },
  {
    id: 'g2',
    sessionId: 's1',
    status: 'walkover',
    teamAId: 't1',
    teamBId: 't2',
    scoreA: 12,
    scoreB: 0,
    winnerTeamId: 't1',
    finishReason: 'walkover',
    sequenceNumber: 2,
  },
  {
    id: 'g3',
    sessionId: 's1',
    status: 'walkover',
    teamAId: 't1',
    teamBId: 't2',
    scoreA: 0,
    scoreB: 12,
    winnerTeamId: 't2',
    finishReason: 'walkover',
    sequenceNumber: 3,
  },
] as unknown as Game[];

test('relatorio conta os tres jogos, inclusive os decididos por W.O.', () => {
  const r = generateSessionReport(
    tournamentSession,
    tournamentGames,
    [],
    tournamentTeams,
    noPlayers,
  );
  assert.equal(r.totalGames, 3);
});

test('relatorio soma os pontos dos jogos, nao os eventos registrados', () => {
  const r = generateSessionReport(
    tournamentSession,
    tournamentGames,
    [],
    tournamentTeams,
    noPlayers,
  );
  assert.equal(r.totalPoints, 27);
});

test('relatorio informa quantos jogos foram por W.O.', () => {
  const r = generateSessionReport(
    tournamentSession,
    tournamentGames,
    [],
    tournamentTeams,
    noPlayers,
  );
  assert.equal(r.gamesByWalkover, 2);
});

test('jogo cancelado nao entra na contagem', () => {
  const comCancelado = [
    ...tournamentGames,
    {
      id: 'g4',
      sessionId: 's1',
      status: 'cancelled',
      teamAId: 't1',
      teamBId: 't2',
      scoreA: 0,
      scoreB: 0,
      sequenceNumber: 4,
    },
  ] as unknown as Game[];
  const r = generateSessionReport(tournamentSession, comCancelado, [], tournamentTeams, noPlayers);
  assert.equal(r.totalGames, 3);
});
