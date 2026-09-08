# Global Skill Profile: internal computation on demand

Date: 2026-09-08. Scope: C6.02 XS-W5-04, N2.02 Player Skill Profile ownership.

## Decision

Build the GlobalPlayerSkillProfile as a private PostgreSQL calculation over the existing versioned
evaluation source. First compute each Community profile with `v0-legacy-mad-mean`; then average
available Community values equally per dimension under `v0-equal-community-mean`. Both policies
are explicit and experimental. Missing stays null and zero remains a real score.

Use the already rounded Community values; round the resulting global mean to one decimal with
numeric arithmetic. Do not weight by evaluator count, inferred credibility or source coverage.
Retain exact ordered Community source revisions and both policy versions in global provenance.

This extends the scoped W5-03 on-demand approach. There is no stored projection, invalidation queue
or background refresh job. Reuse the Community calculation through a private helper while preserving
the existing public Community RPC's checks and output.

The global calculation has no browser execution grant or public wrapper. Global identity alone does
not permit reading evaluations across Communities. A later purpose-specific authorized resolver
will decide who may consume the projection and which fields that consumer may receive.

## Rationale and alternatives

The hierarchy is useful now because it enforces equal Community contribution before Team Formation
consumes the values. Combining raw individual evaluations would privilege larger Communities;
omitting this stage would leave the canonical source contract incomplete.

A materialized profile would introduce write amplification and stale-state reconciliation without
measured demand. On-demand computation is sufficient for fixture validation and the future trusted
resolver boundary. Immutable balance snapshots remain necessary for reproducing a past formation;
a current profile and a past snapshot solve different problems.

Current evaluation permissions and roster membership govern new actions and exposure. They do not
implicitly retract retained accepted evaluations. The shadow calculation therefore uses effective
versioned source contributions independent of activation, membership revocation or live standing.
Explicit source supersession changes the result. This grants no access to inactive Player data.

## Verification and revisit triggers

Independently expected PostgreSQL fixtures must demonstrate unequal evaluator counts but equal
Community weights, Community filtering, missing/zero semantics, reconstruction and revision changes,
private function isolation and unchanged Community access. Reads must leave source and receipts
untouched. Overall and legacy attributes are neither source nor solver input.

Reconsider materialization after measuring latency and invocation load for the actual consumer.
Resolve profile visibility in a purpose-specific access contract before adding a public RPC or UI.
Any credibility weighting, cross-Community outlier filtering or different rounding must introduce
an explicit policy revision; OPEN-RATING-001 and OPEN-RATING-002 stay open. W5-05 owns downstream
shadow comparison and target read cutover; W6 owns durable balance snapshots and their authorization.
