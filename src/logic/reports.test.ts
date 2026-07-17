import test from 'node:test';
import assert from 'node:assert/strict';
import { generateGameReport } from './reports';
import { Game, Player, PointEvent, Team } from '../types';

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
