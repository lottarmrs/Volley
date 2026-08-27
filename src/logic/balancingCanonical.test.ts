import test from 'node:test';
import assert from 'node:assert/strict';
import type { FreePlayConfig, PlayerBalanceSnapshot } from '../types';
import { balanceSnapshots } from './balancing';

const config: FreePlayConfig = {
  type: 'free_play',
  teamCount: 2,
  maxPoints: 15,
  tieBreakMethod: 'win_by_2',
  rotationSystem: 'winner_stays',
  initialCourtTeams: ['', ''],
  initialQueue: [],
  queuePolicy: 'fifo',
  balanceSpeed: 'fast',
  balanceSeed: 77,
};

function snapshot(participantId: string, attack: number): PlayerBalanceSnapshot {
  return {
    participantId,
    attack,
    defense: 10 - attack,
    serve: 5,
    reception: 5,
    setting: 5,
    block: 5,
    speed: 5,
    stamina: 5,
    gameVision: 5,
    consistency: 5,
    emotionalControl: 5,
    heightCm: 175,
    gender: 'M',
    position: 'ponteiro',
    secondaryPositions: [],
    isInjured: false,
    isEstimated: false,
  };
}

function fingerprints(candidates: ReturnType<typeof balanceSnapshots>): string[] {
  return candidates.map((candidate) =>
    candidate.solution.teams
      .map((team) =>
        team
          .map((item) => item.participantId)
          .sort()
          .join(','),
      )
      .sort()
      .join('|'),
  );
}

test('balanceSnapshots is deterministic for equal snapshots seed and work profile', () => {
  const snapshots = [snapshot('a', 9), snapshot('b', 8), snapshot('c', 2), snapshot('d', 1)];

  const first = balanceSnapshots(snapshots, 2, config);
  const second = balanceSnapshots(snapshots, 2, config);

  assert.deepEqual(fingerprints(first), fingerprints(second));
  assert.deepEqual(
    first.map(({ score, seed, iterations }) => ({ score, seed, iterations })),
    second.map(({ score, seed, iterations }) => ({ score, seed, iterations })),
  );
});

test('balanceSnapshots never returns a candidate that violates a separated pair', () => {
  const snapshots = [snapshot('a', 9), snapshot('b', 8), snapshot('c', 2), snapshot('d', 1)];
  const candidates = balanceSnapshots(snapshots, 2, {
    ...config,
    balanceConstraints: { pairsSeparated: [['a', 'b']] },
  });

  for (const candidate of candidates) {
    assert.equal(
      candidate.solution.teams.some((team) => {
        const ids = team.map((item) => item.participantId);
        return ids.includes('a') && ids.includes('b');
      }),
      false,
    );
  }
});
