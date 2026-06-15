import test from 'node:test';
import assert from 'node:assert/strict';
import { getGameWinner, rotateTeams } from './session';

test('getGameWinner - win_by_2 method', () => {
  const rules = { maxPoints: 15, tieBreakMethod: 'win_by_2' };

  // Simple win
  assert.equal(getGameWinner(15, 10, rules), 'A');
  assert.equal(getGameWinner(10, 15, rules), 'B');

  // Not finished yet
  assert.equal(getGameWinner(14, 13, rules), null);

  // Tie break scenario (must win by 2)
  assert.equal(getGameWinner(15, 14, rules), null);
  assert.equal(getGameWinner(16, 14, rules), 'A');

  // Hard point cap scenario
  const rulesWithCap = { maxPoints: 15, tieBreakMethod: 'win_by_2', hardPointCap: 17 };
  assert.equal(getGameWinner(17, 16, rulesWithCap), 'A');
});

test('getGameWinner - direct_3 method', () => {
  const rules = { maxPoints: 15, tieBreakMethod: 'direct_3' };

  // Simple win (at least 15 points and diff >= 2)
  assert.equal(getGameWinner(15, 10, rules), 'A');

  // Score at maxPoints + 2 (direct cap) instantly wins
  assert.equal(getGameWinner(17, 16, rules), 'A');

  // Not finished yet (e.g. 15-14)
  assert.equal(getGameWinner(15, 14, rules), null);
});

test('rotateTeams - winner stays', () => {
  const input = {
    courtTeams: ['team-a', 'team-b'] as [string, string],
    queue: ['team-c', 'team-d'],
    winnerId: 'team-a',
    loserId: 'team-b',
    rotationSystem: 'winner_stays' as const,
    consecutiveGamesByTeam: { 'team-a': 1, 'team-b': 2 },
  };

  const output = rotateTeams(input);

  // Winner stays, next in queue enters
  assert.deepEqual(output.nextCourtTeams, ['team-a', 'team-c']);
  // Loser goes to the end of queue
  assert.deepEqual(output.nextQueue, ['team-d', 'team-b']);
  // Winner streak increments, loser streak resets
  assert.equal(output.nextConsecutiveGamesByTeam['team-a'], 2);
  assert.equal(output.nextConsecutiveGamesByTeam['team-b'], 0);
  assert.equal(output.nextConsecutiveGamesByTeam['team-c'], 0);
});

test('rotateTeams - max consecutive wins, winner does not reach limit', () => {
  const input = {
    courtTeams: ['team-a', 'team-b'] as [string, string],
    queue: ['team-c', 'team-d'],
    winnerId: 'team-a',
    loserId: 'team-b',
    rotationSystem: 'max_consecutive_games' as const,
    consecutiveGamesByTeam: { 'team-a': 1, 'team-b': 2 },
    maxConsecutiveGames: 3,
  };

  const output = rotateTeams(input);

  // Winner (streak goes to 2, limit is 3) stays
  assert.deepEqual(output.nextCourtTeams, ['team-a', 'team-c']);
  assert.deepEqual(output.nextQueue, ['team-d', 'team-b']);
  assert.equal(output.nextConsecutiveGamesByTeam['team-a'], 2);
  assert.equal(output.nextConsecutiveGamesByTeam['team-b'], 0);
});

test('rotateTeams - max consecutive wins, winner reaches limit and leaves', () => {
  const input = {
    courtTeams: ['team-a', 'team-b'] as [string, string],
    queue: ['team-c', 'team-d'],
    winnerId: 'team-a',
    loserId: 'team-b',
    rotationSystem: 'max_consecutive_games' as const,
    consecutiveGamesByTeam: { 'team-a': 2, 'team-b': 0 },
    maxConsecutiveGames: 3,
  };

  const output = rotateTeams(input);

  // Winner reaches 3 (2 + 1) wins, so they must leave.
  // Loser (team-b) stays on the court. Next in queue (team-c) enters.
  assert.deepEqual(output.nextCourtTeams, ['team-b', 'team-c']);
  // Winner goes to queue
  assert.deepEqual(output.nextQueue, ['team-d', 'team-a']);
  // Winner streak resets
  assert.equal(output.nextConsecutiveGamesByTeam['team-a'], 0);
  // Loser streak MUST reset to 0 because they lost, even though they stay on the court
  assert.equal(output.nextConsecutiveGamesByTeam['team-b'], 0);
  assert.equal(output.nextConsecutiveGamesByTeam['team-c'], 0);
});
