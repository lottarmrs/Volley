import test from 'node:test';
import assert from 'node:assert/strict';
import { players } from '../data/players';
import { balanceTeams } from './balancing';
import { FreePlayConfig, Player } from '../types';

const selectedPlayers = players.slice(0, 12) as Player[];

const baseConfig: FreePlayConfig = {
  type: 'free_play',
  teamCount: 3,
  maxPoints: 15,
  tieBreakMethod: 'win_by_2',
  rotationSystem: 'winner_stays',
  initialCourtTeams: ['', ''],
  initialQueue: [],
  queuePolicy: 'fifo',
  balanceSpeed: 'fast',
};

test('balanceTeams creates complete balanced options with each player exactly once', () => {
  const divisions = balanceTeams(selectedPlayers, 3, 'session-test', baseConfig);

  assert.equal(divisions.length, 3);

  for (const division of divisions) {
    assert.equal(division.teams.length, 3);
    assert.ok(division.diagnostics);
    assert.ok(Number.isFinite(division.score));

    const assignedIds = division.teams.flatMap((team) => team.playerIds);
    assert.deepEqual(new Set(assignedIds), new Set(selectedPlayers.map((player) => player.id)));
    assert.equal(assignedIds.length, selectedPlayers.length);

    const teamSizes = division.teams.map((team) => team.playerIds.length);
    assert.ok(Math.max(...teamSizes) - Math.min(...teamSizes) <= 1);
  }
});

test('balanceTeams respects locked player constraints', () => {
  const lockedPlayer = selectedPlayers[0];
  const divisions = balanceTeams(selectedPlayers, 3, 'locked-session-test', {
    ...baseConfig,
    balanceConstraints: {
      lockedPlayerIdxs: {
        [lockedPlayer.id]: 0,
      },
    },
  });

  assert.equal(divisions.length, 3);

  for (const division of divisions) {
    assert.ok(division.teams[0].playerIds.includes(lockedPlayer.id));
  }
});
