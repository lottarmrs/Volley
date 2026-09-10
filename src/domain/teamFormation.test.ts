import assert from 'node:assert/strict';
import test from 'node:test';
import type { BalanceCandidate, TeamFormationRequest } from '@shared/types';
import { canonicalizeCandidates, fingerprintFormation, precheckFormation } from './teamFormation';

function participant(id: string, overrides: Record<string, unknown> = {}) {
  return {
    participantId: id,
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
    heightCm: null,
    gender: null,
    position: null,
    secondaryPositions: [],
    isInjured: false,
    isEstimated: false,
    ...overrides,
  };
}

function request(overrides: Partial<TeamFormationRequest> = {}): TeamFormationRequest {
  return {
    contractVersion: 'v1',
    algorithmVersion: 'simulated-annealing-v1',
    participants: [participant('a'), participant('b')],
    teamCount: 2,
    objective: {
      policyVersion: 'v0-legacy-weights',
      mode: 'balanced',
      rotationType: '6x0',
      repetitionWeight: 0.8,
      weights: { gender: 1, repetition: 0.8 } as never,
    },
    hardConstraints: {},
    budget: { seeds: 3, maxIterations: 2000 },
    seed: 42,
    provenance: { kind: 'LOCAL' },
    ...overrides,
  } as TeamFormationRequest;
}

function candidate(overrides: Partial<BalanceCandidate> = {}): BalanceCandidate {
  return {
    solution: { teams: [['a'], ['b']] },
    score: 1.5,
    diagnostics: {},
    algorithm: 'simulated-annealing-v1',
    seed: 42,
    iterations: 100,
    runtimeMillis: 7,
    ...overrides,
  } as unknown as BalanceCandidate;
}

test('a impressao digital ignora runtimeMillis', () => {
  const fast = fingerprintFormation(request(), [candidate({ runtimeMillis: 1 })], null);
  const slow = fingerprintFormation(request(), [candidate({ runtimeMillis: 999 })], null);
  assert.equal(fast, slow);
});

test('a projecao canonica nao carrega runtimeMillis', () => {
  const projected = JSON.stringify(canonicalizeCandidates([candidate()]));
  assert.equal(projected.includes('runtimeMillis'), false);
  assert.equal(projected.includes('"iterations":100'), true);
});

test('a ordem dos participantes muda a impressao digital', () => {
  const forward = request();
  const reversed = request({ participants: [...forward.participants].reverse() });
  assert.notEqual(
    fingerprintFormation(forward, [candidate()], null),
    fingerprintFormation(reversed, [candidate()], null),
  );
});

test('a proveniencia entra na impressao digital', () => {
  const local = fingerprintFormation(request(), [candidate()], null);
  const authorized = fingerprintFormation(
    request({
      provenance: { kind: 'AUTHORIZED_SNAPSHOT', snapshotId: 's1', inputFingerprint: 'abc' },
    }),
    [candidate()],
    null,
  );
  assert.notEqual(local, authorized);
});

test('o precheck recusa contradicao mecanica, nao dificuldade', () => {
  assert.equal(precheckFormation(request()), null);

  assert.equal(precheckFormation(request({ participants: [] }))?.code, 'EMPTY_ROSTER');
  assert.equal(precheckFormation(request({ teamCount: 0 }))?.code, 'INVALID_TEAM_COUNT');
  assert.equal(
    precheckFormation(request({ participants: [participant('a')], teamCount: 2 }))?.code,
    'NOT_ENOUGH_PARTICIPANTS',
  );
  assert.equal(
    precheckFormation(
      request({
        hardConstraints: { pairsTogether: [['a', 'b']], pairsSeparated: [['b', 'a']] },
      }),
    )?.code,
    'CONTRADICTORY_PAIR',
  );
  assert.equal(
    precheckFormation(request({ hardConstraints: { lockedPlayerIdxs: { a: 5 } } }))?.code,
    'LOCKED_TEAM_OUT_OF_RANGE',
  );
  assert.equal(
    precheckFormation(request({ hardConstraints: { lockedPlayerIdxs: { zz: 0 } } }))?.code,
    'UNKNOWN_PARTICIPANT_IN_CONSTRAINTS',
  );
});
