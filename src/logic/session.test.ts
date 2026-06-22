import test from 'node:test';
import assert from 'node:assert/strict';
import { getGameWinner, rotateTeams, evaluateMatchState } from './session';

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

const matchRules = { setTargets: [12, 12, 7], tieBreakMethod: 'direct_3' };

test('evaluateMatchState - set único (best-of-1) decide o confronto', () => {
  const r = evaluateMatchState([], 12, 10, { setTargets: [12], tieBreakMethod: 'direct_3' });
  assert.equal(r.matchWinner, 'A');
  assert.equal(r.setClosed, true);
  assert.equal(r.sets.length, 1);
});

test('evaluateMatchState - ponto no meio do set não fecha nada', () => {
  const r = evaluateMatchState([], 8, 6, matchRules);
  assert.equal(r.matchWinner, null);
  assert.equal(r.setClosed, false);
  assert.deepEqual(r.sets, []);
  assert.equal(r.scoreA, 8);
});

test('evaluateMatchState - 1º set fecha e o 2º começa zerado', () => {
  const r = evaluateMatchState([], 12, 9, matchRules);
  assert.equal(r.setClosed, true);
  assert.equal(r.matchWinner, null); // 1x0, precisa de 2 sets
  assert.deepEqual(r.sets, [{ scoreA: 12, scoreB: 9 }]);
  assert.equal(r.scoreA, 0);
  assert.equal(r.scoreB, 0);
});

test('evaluateMatchState - 2 sets a 0 decide o confronto', () => {
  const r = evaluateMatchState([{ scoreA: 12, scoreB: 9 }], 12, 7, matchRules);
  assert.equal(r.matchWinner, 'A');
  assert.equal(r.sets.length, 2);
});

test('evaluateMatchState - tiebreak de 7 decide o 3º set', () => {
  // 1x1: A venceu set1, B venceu set2. Set 3 (target 7) vai a 7-5 para B.
  const sets = [
    { scoreA: 12, scoreB: 9 },
    { scoreA: 8, scoreB: 12 },
  ];
  const r = evaluateMatchState(sets, 5, 7, matchRules);
  assert.equal(r.matchWinner, 'B');
  assert.equal(r.sets.length, 3);
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
