import { COMMAND_OUTCOMES, type CommandOutcome } from '../command/commandOutcome';

/**
 * XS-W0-07 — Release/telemetry identity baseline.
 *
 * Goal: know which path is actually in use before cutting it off. C6 W13/W14 may only
 * remove a legacy path once its usage is measured, and measuring it after the fact is not
 * an option.
 *
 * VENDOR-NEUTRAL BY REQUIREMENT. `OPEN-OBS-001` (logs/metrics/traces vendor) is open, with
 * conservative behaviour "instrumentation contracts remain vendor-neutral". So this defines
 * the contract and a sink interface, and names no provider. `OPEN-OBS-002` (sampling rates)
 * and `OPEN-OBS-003` (retention windows) are also open, so nothing here samples or expires.
 *
 * GINV-OBS-001: this is telemetry, not audit and not domain history. Losing it must never
 * make domain truth unreconstructable, so nothing here is a system of record.
 *
 * GINV-OBS-002: metrics use BOUNDED labels. C6.01 is explicit that "resource/User UUIDs are
 * not normal metric labels" -- an unbounded label multiplies series until the backend falls
 * over, and a user id in a metric is a privacy leak that survives retention policy. Both
 * are enforced at runtime below rather than left to reviewer discipline.
 */

/** Which implementation actually served the operation. The whole point of the slice. */
export const EXECUTION_PATHS = ['legacy', 'target'] as const;
export type ExecutionPath = (typeof EXECUTION_PATHS)[number];

/**
 * Operations worth measuring, as an explicit allowlist.
 *
 * A free-form string here would be the first unbounded label. Registering operations means
 * a new one is a deliberate decision, and the registry doubles as the list of paths C6 is
 * actually tracking toward retirement.
 */
export const TRACKED_OPERATIONS = [
  'account.ensure_ready',
  'community.read',
  'community.membership.mutate',
  'player.read',
  'player.mutate',
  'session.read',
  'session.mutate',
  'sync.generic', // the legacy generic sync path W13 retires
] as const;
export type TrackedOperation = (typeof TRACKED_OPERATIONS)[number];

/** Outcome family reuses the W0-05 command vocabulary, which is bounded by construction. */
export type OutcomeFamily = CommandOutcome;

export interface PathTelemetryEvent {
  /** Build/release identity. Low cardinality: one value per deployed release. */
  readonly releaseId: string;
  readonly operation: TrackedOperation;
  readonly path: ExecutionPath;
  readonly outcome: OutcomeFamily;
  /** Optional bounded rollout labels. Never a user or resource identifier. */
  readonly cohort?: string;
  readonly protocolVersion?: string;
}

/** Vendor-neutral emitter. An adapter for whatever `OPEN-OBS-001` settles on implements it. */
export interface TelemetrySink {
  record(event: PathTelemetryEvent): void;
}

// ── Bounded-label enforcement ──────────────────────────────────────────────

/**
 * Deliberately UNANCHORED.
 *
 * An anchored `^...$` check only catches a label that IS a UUID and happily accepts
 * `user-3f7c1a2e-…` or `3f7c1a2e-…-legacy`, which are exactly as unbounded. That gap was
 * found by probing this module rather than by reading it.
 */
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
/** An unhyphenated UUID or a content hash: same cardinality problem, different shape. */
const LONG_HEX = /[0-9a-f]{32,}/i;
const EMAIL = /@/;
const MAX_LABEL_LENGTH = 64;

/**
 * Default distinct-value ceiling per label.
 *
 * This is a cardinality SAFETY BOUND, not a decided observability policy: `OPEN-OBS-002`
 * and `OPEN-OBS-003` remain open and this number is not one of them. It exists so an
 * accidentally unbounded label fails loudly in a test run instead of quietly in production.
 */
export const DEFAULT_LABEL_CARDINALITY_LIMIT = 50;

export class UnboundedLabelError extends Error {
  constructor(
    readonly label: string,
    readonly value: string,
    reason: string,
  ) {
    super(`Telemetry label "${label}" is not bounded: ${reason} (value: ${value})`);
    this.name = 'UnboundedLabelError';
  }
}

/**
 * Rejects a label value that must never become a metric dimension.
 *
 * UUIDs are called out explicitly by C6.01. Emails are rejected because a personal
 * identifier in telemetry outlives any domain deletion (GINV-PRIV-002 territory), and long
 * values are rejected because they are almost always a payload fragment rather than a label.
 */
export function assertBoundedLabel(label: string, value: string): void {
  if (UUID.test(value)) {
    throw new UnboundedLabelError(label, value, 'contains a resource or user UUID');
  }
  if (LONG_HEX.test(value)) {
    throw new UnboundedLabelError(label, value, 'contains an unhyphenated identifier or hash');
  }
  if (EMAIL.test(value)) {
    throw new UnboundedLabelError(label, value, 'looks like a personal identifier');
  }
  if (value.length > MAX_LABEL_LENGTH) {
    throw new UnboundedLabelError(
      label,
      `${value.slice(0, 24)}…`,
      `exceeds ${MAX_LABEL_LENGTH} characters, so it is a payload not a label`,
    );
  }
}

/** Validates a whole event before it can reach any sink. */
export function assertEmittable(event: PathTelemetryEvent): void {
  if (!TRACKED_OPERATIONS.includes(event.operation)) {
    throw new UnboundedLabelError(
      'operation',
      String(event.operation),
      'is not a registered tracked operation',
    );
  }
  if (!EXECUTION_PATHS.includes(event.path)) {
    throw new UnboundedLabelError('path', String(event.path), 'is not a known execution path');
  }
  if (!COMMAND_OUTCOMES.includes(event.outcome)) {
    throw new UnboundedLabelError(
      'outcome',
      String(event.outcome),
      'is not a known outcome family',
    );
  }

  assertBoundedLabel('releaseId', event.releaseId);
  if (event.cohort !== undefined) assertBoundedLabel('cohort', event.cohort);
  if (event.protocolVersion !== undefined) {
    assertBoundedLabel('protocolVersion', event.protocolVersion);
  }
}
