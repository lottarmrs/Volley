# Community skill profile computed on demand

Status: accepted for the experimental XS-W5-03 read surface, 2026-09-06.

Owner: N2.02 / Player Skill Profile. Context: C6.02 W5-03 and OPEN-RATING-001.

The user requested judging implementation cost against the usable product and approved continuing
the on-demand direction. The estimator selected explicitly is the legacy mean after median/MAD
outlier filtering, with missing source dimensions preserved as missing.

For this slice, a stable database query produces the Community profile from effective versioned
source evaluations. We do not persist another mutable projection or build a refresh protocol before
observing a need. The response carries policy/rubric version, source checkpoint and coverage.

The experimental exit gate compares that response to independently calculated fixtures, verifies
deterministic reconstruction and proves source facts unchanged by reads. It replaces comparison to a
stored profile for this slice. Future durable balance snapshots remain distinct and are not removed.

The price is recomputation on each read. Measure representative query latency before introducing
materialization, and retain exactly the same source/provenance semantics if it becomes necessary.
The read is initially limited to contextual evaluators; wider visibility needs its own purpose policy.
No permanent sports estimator is declared and no legacy writer is cut over by this read integration.

Design: [XS-W5-03](../../superpowers/specs/2026-09-06-xs-w5-03-community-skill-profile-design.md).
