# Superseded C4 — Architecture Registries Master (Pre-Catalog)

> Status: `SUPERSEDED / PRE-CATALOG C4`
>
> Canonical-ID namespace: `HISTORICAL-SOURCE-ALIASES`
>
> Current registry authority: [`C4-INDEX.md`](../catalogs/C4-INDEX.md), [`INVARIANT-CATALOG.md`](../catalogs/INVARIANT-CATALOG.md), [`OPEN-DECISIONS.md`](../catalogs/OPEN-DECISIONS.md), [`HYPOTHESES.md`](../catalogs/HYPOTHESES.md).
>
> This file is retained only as consolidation provenance and must not be used as the current C4 source of truth.
>
> Owner: `Architecture + bounded-context owners`
>
> Parent: [`EAP-MASTER.md`](../EAP-MASTER.md)
>
> Governing documents: [`PRINCIPLES.md`](../PRINCIPLES.md), [`GLOSSARY.md`](../GLOSSARY.md), [`ADR-CATALOG.md`](../adr/ADR-CATALOG.md), [`N2.23-architecture-governance.md`](N2.23-architecture-governance.md)
>
> Registries: [`INVARIANT-CATALOG.md`](INVARIANT-CATALOG.md), [`OPEN-DECISIONS-HYPOTHESES.md`](OPEN-DECISIONS-HYPOTHESES.md)

---

# 0. Purpose

C4 turns the materialized architecture into registries that answer four different questions without conflating them:

```text
INVARIANT
What must remain true?

ADR
What material architecture choice has been accepted and why?

OPEN DECISION
What question is intentionally unresolved?

HYPOTHESIS
What claim is plausible but still requires evidence?
```

A fifth concept is tracked when relevant:

```text
DEPRECATION
What current/legacy path is being retired, by what replacement, and under what removal evidence?
```

The governing rule is:

```text
UNRESOLVED
MUST NOT
BECOME AN IMPLEMENTATION DEFAULT SILENTLY
```

and:

```text
REGISTRY
MUST NOT
ERASE OWNER-CONTEXT DETAIL
```

The C2 chapter remains the full definition of each local invariant/open question/hypothesis. C4 provides stable indexing, ownership, cross-context relationships, severity, evidence expectations and decision status.

---

# 1. Non-loss model

C4 uses two levels.

## 1.1 Global invariant

A global invariant is a deduplicated rule that crosses contexts.

Example:

```text
GLOBAL:
A browser-provided actor/role is never authoritative.

LOCAL manifestations:
SEC-INV-003/004
API-INV-001/002
COM-INV-022
MATCH-INV-040
...
```

The global record does not replace those local rules.

## 1.2 Local invariant range

Every local invariant remains canonically defined in its owning N2 chapter.

C4 records the complete ranges and counts so omission is detectable.

## 1.3 Open decisions and hypotheses

Open/hypothesis records are indexed globally but retain the owning context as normative source.

When one is decided:

```text
OPEN/HYPOTHESIS
→ evidence / product / legal / operational input
→ ADR proposal
→ ACCEPTED or REJECTED
→ registry status update
```

No implementation pull request can close an architecture Open Decision merely by choosing a value in code.

---

# 2. Registry item identity

## 2.1 Global invariants

```text
GINV-001
GINV-002
...
```

`GINV` identifiers are stable registry identities. They do not renumber local invariants.

## 2.2 Open Decisions

```text
OD-<OWNER>-###
```

Examples:

```text
OD-REG-001
OD-MATCH-003
OD-SEC-002
OD-OPS-005
```

If a C2 chapter already supplied a stable `OD-*` name, preserve it as an alias or canonical ID when collision-free.

## 2.3 Hypotheses

```text
HYP-<OWNER>-###
```

A hypothesis requires an evidence/test trigger, not merely an opinion.

---

# 3. Invariant criticality

C4 uses criticality to prioritize executable evidence and incident response. It does not imply that low-tier invariants are optional.

```text
Q0 — Integrity / Security / Irreplaceable History
Breaking it may corrupt authoritative sports facts, violate authorization/privacy, destroy history, break fairness, duplicate irreversible effects or lose irreplaceable local data.

Q1 — Shared Domain Correctness
Breaking it produces wrong shared lifecycle, eligibility, roster, projection, officialization, identity or authority semantics.

Q2 — Recoverability / Compatibility / Operability
Breaking it may not immediately corrupt source truth but undermines recovery, migration, convergence, diagnostics, performance isolation or safe operations.

Q3 — Architecture Maintainability / Product Consistency
Breaking it creates drift, unnecessary coupling, misleading terminology/UX or future operational cost while source facts may remain intact.
```

### Rule

A Q0 invariant normally needs at least one executable or operational proof at the layer that owns it.

Examples:

```text
DB constraint/integration test
concurrency test
negative authorization test
property test
replay/rebuild test
restore drill
failure-injection test
```

Documentation review alone is not sufficient evidence for a Q0 invariant that is mechanically testable.

---

# 4. Evidence taxonomy

Registry entries use the following evidence classes.

| Code | Evidence |
|---|---|
| `TYPE` | compile/static/schema type evidence |
| `UNIT` | pure unit/domain test |
| `PROP` | property-based/differential/determinism test |
| `DB` | real/faithful PostgreSQL constraint/transaction test |
| `RLS` | authorization/RLS/RPC adversarial test |
| `CONC` | real concurrent transaction/race test |
| `E2E` | critical journey browser/application proof |
| `RT` | realtime loss/gap/reconnect test |
| `OFF` | IndexedDB/offline/reconciliation test |
| `REBUILD` | projection/event replay/rebuild proof |
| `MIG` | migration/backfill semantic verification |
| `LOAD` | load/performance test with invariants asserted |
| `SEC` | security/privacy negative/adversarial test |
| `OPS` | runbook/deployment/operational verification |
| `RESTORE` | backup/restore/disaster drill |
| `OBS` | operational integrity signal/alert |
| `REVIEW` | architecture/product/legal/manual review where mechanics alone cannot decide |

Evidence can be composite.

---

# 5. Complete local invariant coverage

The following ranges remain fully defined in C2. C4 must never be considered complete if a range disappears from its owner chapter or is omitted here without explicit supersession.

| Context | Owner chapter | Local invariant range | Count |
|---|---|---:|---:|
| N2.01 Product Experience | `contexts/N2.01-product-experience.md` | `PX-INV-001..012` | 12 |
| N2.02 Identity / Players | `contexts/N2.02-identity-players.md` | `ID-INV-001..025` | 25 |
| N2.03 Communities | `contexts/N2.03-communities.md` | `COM-INV-001..035` | 35 |
| N2.04 Sessions | `contexts/N2.04-sessions.md` | `SES-INV-001..035` | 35 |
| N2.05 Registration | `contexts/N2.05-registration.md` | `REG-INV-001..040` | 40 |
| N2.06 Team Formation / Voting | `contexts/N2.06-team-formation.md` | `BAL-INV-001..040` | 40 |
| N2.07 Live Match | `contexts/N2.07-live-match.md` | `MATCH-INV-001..040` | 40 |
| N2.08 Competitions | `contexts/N2.08-competitions.md` | `COMP-INV-001..040` | 40 |
| N2.09 History / Statistics | `contexts/N2.09-history-statistics.md` | `STAT-INV-001..040` | 40 |
| N2.10 Notifications | `contexts/N2.10-notifications.md` | `NOTIF-INV-001..050` | 50 |
| N2.11 Media | `contexts/N2.11-media.md` | `MEDIA-INV-001..050` | 50 |
| N2.12 Online / Offline | `platform/N2.12-online-offline.md` | `OFFLINE-INV-001..055` | 55 |
| N2.13 Realtime | `platform/N2.13-realtime.md` | `RT-INV-001..050` | 50 |
| N2.14 Data Architecture | `platform/N2.14-data-architecture.md` | `DATA-INV-001..050` | 50 |
| N2.15 API / Application | `platform/N2.15-api-application.md` | `API-INV-001..050` | 50 |
| N2.16 Security / Privacy / LGPD | `security/N2.16-security-privacy-lgpd.md` | `SEC-INV-001..055` | 55 |
| N2.17 Reliability | `platform/N2.17-reliability.md` | `REL-INV-001..060` | 60 |
| N2.18 Performance / Scalability | `platform/N2.18-performance-scalability.md` | `PERF-INV-001..065` | 65 |
| N2.19 Observability | `platform/N2.19-observability.md` | `OBS-INV-001..060` | 60 |
| N2.20 Testing / QA | `quality/N2.20-testing-qa.md` | `QA-INV-001..070` | 70 |
| N2.21 Operations / Deploy | `operations/N2.21-operations-deploy.md` | `OPS-INV-001..070` | 70 |
| N2.22 Migration / Strangler | `migration/N2.22-migration-strangler.md` | `MIG-INV-001..080` | 80 |
| N2.23 Architecture Governance | `governance/N2.23-architecture-governance.md` | `GOV-INV-001..080` | 80 |

Total local invariant identities indexed by C4:

```text
1,152
```

This number is a completeness checksum, not a claim that the system has 1,152 unrelated global rules. Cross-context duplication is intentionally resolved in `INVARIANT-CATALOG.md`.

---

# 6. Registry authority

When asking whether an invariant exists or what it means:

```text
GLOBAL relationship / severity / evidence owner
→ INVARIANT-CATALOG.md

exact local wording / local N10 / local rationale
→ owning N2 chapter
```

When asking whether a choice is accepted:

```text
→ ADR-CATALOG.md
```

When asking whether a value/policy remains unresolved:

```text
→ OPEN-DECISIONS-HYPOTHESES.md
```

If the registries and an N2 chapter disagree, it is a C7 contradiction until explicitly resolved. Registry freshness never silently overrides owner-context semantics.

---

# 7. No implementation-by-accident policy

The following are prohibited:

```text
OPEN question
→ developer chooses a convenient default
→ code ships
→ architecture later calls it decided
```

Instead:

```text
OPEN
→ identify whether implementation is blocked
→ collect required evidence
→ ADR/owner decision when material
→ implement under accepted decision
```

A reversible experiment may use a bounded feature flag when the registry explicitly permits experimentation, but the experiment does not become canonical architecture automatically.

---

# 8. Blocking classification for Open Decisions

Each Open Decision is classified:

```text
BLOCKING
Cannot safely implement/launch the affected capability without closure.

BOUNDARY-BLOCKING
Core can proceed, but a specific boundary/surface/phase cannot.

NON-BLOCKING
A safe architecture path exists and the exact policy/threshold/provider can remain undecided.

EVIDENCE-TRIGGERED
No decision should be made until measured scale/usage/incident/product evidence exists.
```

Examples:

```text
final minors policy before knowingly onboarding minors
→ BLOCKING for that population

exact Match lease TTL
→ NON-BLOCKING for architecture, but BLOCKING before production tuning is finalized

Redis adoption threshold
→ EVIDENCE-TRIGGERED
```

---

# 9. Hypothesis lifecycle

```text
REGISTERED
→ TESTING
→ VALIDATED
   └→ may support ADR acceptance / remain empirical assumption
→ FALSIFIED
   └→ architecture adapts; no silent workaround
→ RETIRED
```

A validated hypothesis is not automatically an ADR. A hypothesis such as “Postgres is sufficient for current bracket scale” can remain an empirical operating assumption while the ADR states the evidence-triggered technology policy.

---

# 10. Deprecation handoff

C3 already records the high-level legacy supersession graph. C4 treats deprecation as a registry status attached to invariants/decisions when needed; C6 owns executable removal sequencing.

Key deprecated target-incompatible families include:

```text
broad localStorage domain persistence
LocalSyncPayload / generic bidirectional sync
cloudId/local_id dual identity
syncStatus/sync_version generic authority
updated_at/LWW conflict resolution for critical shared state
generic cloud CRUD/softDelete for critical aggregates
Session-level scoring ownership
organizador as governance role
pending/rejected Membership as join workflow
selectedPlayerIds[] / teamIds[] authority
Session.type=tournament as Competition authority
finished Game as direct standings authority
current Team membership as historical stats source
Career rating mixed into factual stats
avatar_url / raw public proposal as media identity
schema.sql as independent schema authority
ordinary reset as migration strategy
```

C6 must attach concrete readers/writers/metrics/removal gates before physical contract/removal.

---

# 11. C4 quality gates

C4 is complete when:

- [x] invariant, ADR, Open Decision and Hypothesis are unambiguously different;
- [x] local invariant ranges for all 23 N2 contexts are indexed;
- [x] the 1,152 local invariant completeness checksum is recorded;
- [x] global cross-context invariants have stable IDs and owners;
- [x] Q0/Q1/Q2/Q3 criticality exists;
- [x] evidence taxonomy exists;
- [x] every global invariant links to owner-context manifestations and ADRs where applicable;
- [x] Open Decisions are owner-scoped and classified by blocking behavior;
- [x] Hypotheses have evidence/review triggers;
- [x] Open/Hypothesis items are not silently promoted to decisions;
- [x] legacy deprecation is connected to C3 and handed to C6;
- [x] source C2 detail is preserved rather than rewritten away.

---

# 12. Handoff to C5

C5 consumes C3+C4 as stable references.

```text
Entity Matrix
Command / Query Matrix
Capability Matrix
State Machine Matrix
Authority / Offline Matrix
Realtime / Event Matrix
Source Fact / Snapshot / Projection Matrix
Transaction / Lock / Concurrency Matrix
RLS / Security Matrix
Privacy / Retention Matrix
Error / Recovery Matrix
Reliability / Rebuild Matrix
Performance / Scaling Matrix
Observability Matrix
Test Traceability Matrix
Deprecation Matrix
```

Every matrix row should be able to link back to:

```text
owner context
+ canonical ADR
+ global/local invariant
+ Open Decision when unresolved
+ migration wave
+ executable evidence
```

This is the bridge from architecture prose to an implementation-governance model that can be mechanically checked.