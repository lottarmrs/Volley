import {
  assertEmittable,
  DEFAULT_LABEL_CARDINALITY_LIMIT,
  UnboundedLabelError,
  type ExecutionPath,
  type PathTelemetryEvent,
  type TelemetrySink,
  type TrackedOperation,
} from './pathTelemetry';

/**
 * XS-W0-07 exit gate support:
 *
 *   "A mixed legacy/target rehearsal can quantify path usage without inspecting raw
 *    production data manually."
 *
 * So the sink AGGREGATES rather than storing a log. Counters keyed by bounded labels are
 * the answer to "how much traffic still uses the legacy path", and they are also the only
 * shape that keeps GINV-OBS-002 satisfiable: there is no per-event row to leak, because no
 * per-event row is retained.
 *
 * This is not the production backend. `OPEN-OBS-001` is open, so the real emitter is
 * whatever that decision selects; this implements the same `TelemetrySink` interface so
 * swapping it changes no call site.
 */

export interface PathUsageRow {
  readonly operation: TrackedOperation;
  readonly path: ExecutionPath;
  readonly outcome: string;
  readonly count: number;
}

export interface OperationUsage {
  readonly operation: TrackedOperation;
  readonly legacy: number;
  readonly target: number;
  readonly total: number;
  /** Share of this operation still served by the legacy path, 0..1. */
  readonly legacyShare: number;
}

export interface PathUsageReport {
  readonly releases: readonly string[];
  readonly rows: readonly PathUsageRow[];
  readonly byOperation: readonly OperationUsage[];
  readonly totals: { readonly legacy: number; readonly target: number };
  /** Operations with zero legacy traffic observed: the W13/W14 removal candidates. */
  readonly retirementCandidates: readonly TrackedOperation[];
  /** Operations still carrying legacy traffic: removal would break users. */
  readonly stillLegacy: readonly TrackedOperation[];
}

export class InMemoryPathTelemetry implements TelemetrySink {
  private readonly counters = new Map<string, number>();
  private readonly distinctByLabel = new Map<string, Set<string>>();

  constructor(private readonly cardinalityLimit: number = DEFAULT_LABEL_CARDINALITY_LIMIT) {}

  record(event: PathTelemetryEvent): void {
    assertEmittable(event);

    // Empirical cardinality guard. Pattern checks catch a UUID; only counting distinct
    // values catches a label that is bounded in theory and unbounded in practice.
    this.track('releaseId', event.releaseId);
    if (event.cohort !== undefined) this.track('cohort', event.cohort);
    if (event.protocolVersion !== undefined) this.track('protocolVersion', event.protocolVersion);

    const key = `${event.operation}|${event.path}|${event.outcome}|${event.releaseId}`;
    this.counters.set(key, (this.counters.get(key) ?? 0) + 1);
  }

  private track(label: string, value: string): void {
    let seen = this.distinctByLabel.get(label);
    if (!seen) {
      seen = new Set();
      this.distinctByLabel.set(label, seen);
    }
    if (!seen.has(value) && seen.size >= this.cardinalityLimit) {
      throw new UnboundedLabelError(
        label,
        value,
        `exceeded ${this.cardinalityLimit} distinct values, so it is unbounded in practice`,
      );
    }
    seen.add(value);
  }

  /** Distinct values seen per label. Lets a test assert cardinality stayed sane. */
  cardinality(label: string): number {
    return this.distinctByLabel.get(label)?.size ?? 0;
  }

  /**
   * Quantifies path usage. This is what makes the exit gate reachable without anyone
   * reading raw production data.
   */
  report(): PathUsageReport {
    const rows: PathUsageRow[] = [];
    const releases = new Set<string>();
    const perOperation = new Map<TrackedOperation, { legacy: number; target: number }>();

    for (const [key, count] of this.counters) {
      const [operation, path, outcome, releaseId] = key.split('|') as [
        TrackedOperation,
        ExecutionPath,
        string,
        string,
      ];
      releases.add(releaseId);
      rows.push({ operation, path, outcome, count });

      const bucket = perOperation.get(operation) ?? { legacy: 0, target: 0 };
      bucket[path] += count;
      perOperation.set(operation, bucket);
    }

    const byOperation: OperationUsage[] = [...perOperation.entries()]
      .map(([operation, bucket]) => {
        const total = bucket.legacy + bucket.target;
        return {
          operation,
          legacy: bucket.legacy,
          target: bucket.target,
          total,
          legacyShare: total === 0 ? 0 : bucket.legacy / total,
        };
      })
      .sort((a, b) => b.legacyShare - a.legacyShare || a.operation.localeCompare(b.operation));

    return {
      releases: [...releases].sort(),
      rows: rows.sort(
        (a, b) => a.operation.localeCompare(b.operation) || a.path.localeCompare(b.path),
      ),
      byOperation,
      totals: {
        legacy: byOperation.reduce((sum, row) => sum + row.legacy, 0),
        target: byOperation.reduce((sum, row) => sum + row.target, 0),
      },
      // Zero OBSERVED legacy traffic is not proof of zero legacy traffic; it is the
      // precondition for asking the question. C6 W13/W14 still require the removal gates.
      retirementCandidates: byOperation
        .filter((row) => row.legacy === 0)
        .map((row) => row.operation),
      stillLegacy: byOperation.filter((row) => row.legacy > 0).map((row) => row.operation),
    };
  }
}

/** Renders the report as text an operator can read without querying anything. */
export function formatPathUsageReport(report: PathUsageReport): string {
  const lines = [
    `releases observed: ${report.releases.join(', ') || 'none'}`,
    `totals: legacy=${report.totals.legacy} target=${report.totals.target}`,
    '',
    'operation                          legacy  target  legacy share',
  ];

  for (const row of report.byOperation) {
    lines.push(
      `${row.operation.padEnd(34)}${String(row.legacy).padStart(6)}${String(row.target).padStart(8)}` +
        `${`${(row.legacyShare * 100).toFixed(1)}%`.padStart(14)}`,
    );
  }

  lines.push(
    '',
    `no legacy traffic observed: ${report.retirementCandidates.join(', ') || 'none'}`,
    `still on legacy: ${report.stillLegacy.join(', ') || 'none'}`,
  );

  return lines.join('\n');
}
