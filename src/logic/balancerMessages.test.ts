import test from 'node:test';
import assert from 'node:assert/strict';
import type { FreePlayConfig, PlayerBalanceSnapshot } from '../types';
import { balanceSnapshots } from './balancing';
import {
  buildBalanceErrorResponse,
  INFEASIBLE_CONSTRAINTS,
  TECHNICAL_ERROR,
} from './balancerMessages';

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
  balanceConstraints: {
    lockedPlayerIdxs: { a: 0, b: 1 },
    pairsTogether: [['a', 'b']],
  },
};

function snapshot(participantId: string): PlayerBalanceSnapshot {
  return {
    participantId,
    attack: 5,
    defense: 5,
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

test('buildBalanceErrorResponse preserves the typed infeasible code from the real solver', () => {
  let response;

  try {
    balanceSnapshots(['a', 'b', 'c', 'd'].map(snapshot), 2, config);
    assert.fail('Expected infeasible constraints to throw.');
  } catch (error) {
    response = buildBalanceErrorResponse(error);
  }

  assert.equal(response.code, INFEASIBLE_CONSTRAINTS);
  assert.match(response.message, /solução viável/i);
});

test('buildBalanceErrorResponse classifies untyped failures as technical', () => {
  assert.deepEqual(buildBalanceErrorResponse(new Error('Worker indisponível.')), {
    type: 'error',
    code: TECHNICAL_ERROR,
    message: 'Worker indisponível.',
  });
});
