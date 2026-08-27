import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertBoundedLabel,
  assertEmittable,
  TRACKED_OPERATIONS,
  UnboundedLabelError,
  type PathTelemetryEvent,
} from './pathTelemetry';
import { formatPathUsageReport, InMemoryPathTelemetry } from './pathUsageReport';

const RELEASE = '2026.08.27-1';

function event(over: Partial<PathTelemetryEvent> = {}): PathTelemetryEvent {
  return {
    releaseId: RELEASE,
    operation: 'community.read',
    path: 'legacy',
    outcome: 'ACCEPTED',
    ...over,
  };
}

// ── Bounded labels (GINV-OBS-002) ──────────────────────────────────────────

test('a resource or user UUID is refused as a label', () => {
  // C6.01 states it outright: "Resource/User UUIDs are not normal metric labels."
  assert.throws(
    () => assertBoundedLabel('cohort', '3f7c1a2e-9b4d-4c8e-8a1f-2d5b6e7c9a10'),
    UnboundedLabelError,
  );
  assert.throws(
    () => assertEmittable(event({ cohort: '3f7c1a2e-9b4d-4c8e-8a1f-2d5b6e7c9a10' })),
    UnboundedLabelError,
  );
});

test('a UUID is refused wherever it appears in the value', () => {
  // Regression: an anchored check accepted `user-<uuid>` and `<uuid>-legacy`, which are
  // exactly as unbounded as a bare UUID. Found by probing, not by reading.
  for (const value of [
    'user-3f7c1a2e-9b4d-4c8e-8a1f-2d5b6e7c9a10',
    '3f7c1a2e-9b4d-4c8e-8a1f-2d5b6e7c9a10-legacy',
    '3F7C1A2E-9B4D-4C8E-8A1F-2D5B6E7C9A10',
    '3f7c1a2e9b4d4c8e8a1f2d5b6e7c9a10',
  ]) {
    assert.throws(() => assertBoundedLabel('cohort', value), UnboundedLabelError, value);
  }
});

test('legitimate rollout labels are not false positives', () => {
  // A guard that rejects everything is as useless as one that rejects nothing.
  for (const value of [
    'internal',
    'v2',
    'beta',
    '2026.08.27-1',
    'cohort-a',
    'canary',
    'deadbeef',
  ]) {
    assert.doesNotThrow(() => assertBoundedLabel('cohort', value), value);
  }
});

test('a personal identifier is refused as a label', () => {
  // Telemetry outlives domain deletion, so an email in a metric is a leak with no owner.
  assert.throws(() => assertBoundedLabel('cohort', 'user@example.com'), UnboundedLabelError);
});

test('a payload fragment is refused as a label', () => {
  assert.throws(() => assertBoundedLabel('cohort', 'x'.repeat(200)), UnboundedLabelError);
});

test('an unregistered operation is refused', () => {
  assert.throws(
    () => assertEmittable(event({ operation: 'something.new' as never })),
    UnboundedLabelError,
  );
});

test('bounded rollout labels are accepted', () => {
  assert.doesNotThrow(() => assertEmittable(event({ cohort: 'internal', protocolVersion: 'v2' })));
});

test('a label that is bounded in theory but unbounded in practice is caught', () => {
  // Pattern checks cannot catch this: every value is short, non-UUID and non-personal.
  // Only counting distinct values reveals that the label is a per-request identifier.
  const sink = new InMemoryPathTelemetry(10);

  assert.throws(() => {
    for (let index = 0; index < 50; index += 1) {
      sink.record(event({ cohort: `batch-${index}` }));
    }
  }, UnboundedLabelError);

  assert.ok(sink.cardinality('cohort') <= 10, 'the sink must stop before the series explodes');
});

test('release identity stays low cardinality across many events', () => {
  const sink = new InMemoryPathTelemetry();
  for (let index = 0; index < 500; index += 1) sink.record(event());

  assert.equal(sink.cardinality('releaseId'), 1);
});

// ── Exit gate ──────────────────────────────────────────────────────────────

test('EXIT GATE: a mixed legacy/target rehearsal quantifies path usage', () => {
  const sink = new InMemoryPathTelemetry();

  // A rehearsal standing in for mixed production traffic: some operations fully cut over,
  // some partially, one still entirely legacy.
  const rehearsal: Array<[PathTelemetryEvent['operation'], 'legacy' | 'target', number]> = [
    ['account.ensure_ready', 'target', 40], // fully cut over
    ['community.read', 'legacy', 30],
    ['community.read', 'target', 70], // partially cut over
    ['player.mutate', 'legacy', 12],
    ['player.mutate', 'target', 3],
    ['sync.generic', 'legacy', 25], // untouched legacy
  ];

  for (const [operation, path, count] of rehearsal) {
    for (let index = 0; index < count; index += 1) {
      sink.record(event({ operation, path, outcome: 'ACCEPTED' }));
    }
  }
  // A few failures, so outcome families are exercised rather than assumed.
  sink.record(event({ operation: 'community.read', path: 'target', outcome: 'CONFLICT' }));
  sink.record(event({ operation: 'sync.generic', path: 'legacy', outcome: 'TECHNICAL_FAILURE' }));

  const report = sink.report();

  // Quantified, without reading a single raw event.
  assert.equal(report.totals.legacy, 68);
  assert.equal(report.totals.target, 114);

  const communityRead = report.byOperation.find((row) => row.operation === 'community.read');
  assert.ok(communityRead);
  assert.equal(communityRead.legacy, 30);
  assert.equal(communityRead.target, 71);
  assert.ok(Math.abs(communityRead.legacyShare - 30 / 101) < 1e-9);

  // The question W13/W14 actually need answered: what still uses legacy?
  assert.deepEqual([...report.retirementCandidates], ['account.ensure_ready']);
  assert.deepEqual([...report.stillLegacy].sort(), [
    'community.read',
    'player.mutate',
    'sync.generic',
  ]);

  // Ordered worst-first, so the operator sees what is furthest from retirement.
  assert.equal(report.byOperation[0].operation, 'sync.generic');
  assert.equal(report.byOperation[0].legacyShare, 1);
});

test('EXIT GATE: the report is readable without querying anything', () => {
  const sink = new InMemoryPathTelemetry();
  sink.record(event({ operation: 'sync.generic', path: 'legacy' }));
  sink.record(event({ operation: 'account.ensure_ready', path: 'target' }));

  const text = formatPathUsageReport(sink.report());

  assert.match(text, /releases observed: 2026\.08\.27-1/);
  assert.match(text, /sync\.generic\s+1\s+0\s+100\.0%/);
  assert.match(text, /no legacy traffic observed: account\.ensure_ready/);
});

test('zero observed legacy traffic is a candidate, not a clearance', () => {
  // Guards against the tempting misread. The report says "nothing was observed", which is
  // a precondition for asking about removal, not a removal approval. C6 W13/W14 gates and
  // the W0-02 ledger still apply.
  const sink = new InMemoryPathTelemetry();
  sink.record(event({ operation: 'player.read', path: 'target' }));

  const report = sink.report();
  assert.deepEqual([...report.retirementCandidates], ['player.read']);
  assert.equal(report.byOperation[0].legacy, 0);
  assert.equal(report.byOperation[0].total, 1, 'one sample is not evidence of absence');
});

test('every tracked operation is a bounded, registered label', () => {
  assert.equal(new Set(TRACKED_OPERATIONS).size, TRACKED_OPERATIONS.length, 'no duplicates');
  for (const operation of TRACKED_OPERATIONS) {
    assert.doesNotThrow(() => assertEmittable(event({ operation })));
    assert.ok(operation.length <= 64);
  }
});
