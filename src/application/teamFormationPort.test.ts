import assert from 'node:assert/strict';
import test from 'node:test';
import { fromLocalSnapshots } from './teamFormationAdapters';
import { solveTeamFormationDirect } from './teamFormationPort';

function snapshots(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    participantId: `p${index}`,
    attack: 5 + (index % 3),
    defense: 5,
    serve: 4,
    reception: 6,
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
  }));
}

const request = fromLocalSnapshots({
  snapshots: snapshots(8),
  teamCount: 2,
  config: { balanceSpeed: 'fast', balanceSeed: 11 } as never,
  algorithmVersion: 'simulated-annealing-v1',
});

test('a mesma entrada produz a mesma impressao digital duas vezes', () => {
  const first = solveTeamFormationDirect(request);
  const second = solveTeamFormationDirect(request);
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  if (first.ok && second.ok) assert.equal(first.fingerprint, second.fingerprint);
});

test('o driver direto e o codigo do worker concordam na impressao digital', async () => {
  const direct = solveTeamFormationDirect(request);

  const posted: unknown[] = [];
  const fakeSelf = {
    onmessage: null as ((event: { data: unknown }) => void) | null,
    postMessage: (message: unknown) => posted.push(message),
  };
  const globalWithSelf = globalThis as { self?: unknown };
  const previous = globalWithSelf.self;
  globalWithSelf.self = fakeSelf;
  try {
    await import('../logic/balancer.worker');
    fakeSelf.onmessage?.({ data: { type: 'balance', request } });
  } finally {
    globalWithSelf.self = previous;
  }

  const done = posted.find((message) => (message as { type?: string }).type === 'done') as
    | { fingerprint: string }
    | undefined;

  assert.ok(done, 'o worker precisa responder done');
  assert.equal(direct.ok, true);
  if (direct.ok) assert.equal(done!.fingerprint, direct.fingerprint);
});

test('o precheck recusa antes de qualquer busca', () => {
  const empty = fromLocalSnapshots({
    snapshots: [],
    teamCount: 2,
    config: { balanceSpeed: 'fast' } as never,
    algorithmVersion: 'simulated-annealing-v1',
  });
  const outcome = solveTeamFormationDirect(empty);
  assert.equal(outcome.ok, false);
  if (!outcome.ok) assert.equal(outcome.refusal.code, 'EMPTY_ROSTER');
});
