# C4 — Architecture Registries Index

> Status: `DRAFT-CANONICAL / C4`
>
> Owner: `Architecture Governance + bounded-context owners`
>
> Parent: [`EAP-MASTER.md`](../EAP-MASTER.md)
>
> Governing sources: [`PRINCIPLES.md`](../PRINCIPLES.md), [`GLOSSARY.md`](../GLOSSARY.md), [`ADR-CATALOG.md`](../adr/ADR-CATALOG.md), [`N2.23-architecture-governance.md`](../governance/N2.23-architecture-governance.md)

---

# 0. Purpose

C4 converts the C2/C3 architecture corpus into three explicit registries without deleting, summarizing away or silently replacing the owning source material:

```text
INVARIANT
= rule that must remain true

OPEN DECISION
= unresolved question that implementation must not answer accidentally

HYPOTHESIS
= testable claim awaiting evidence
```

Files produced by C4:

```text
docs/architecture/catalogs/C4-INDEX.md

docs/architecture/catalogs/INVARIANT-CATALOG.md

docs/architecture/catalogs/OPEN-DECISIONS.md

docs/architecture/catalogs/HYPOTHESES.md
```

The source-of-truth rule is:

```text
GLOBAL INVARIANT ID / severity / cross-context ownership
→ INVARIANT-CATALOG.md

FULL LOCAL INVARIANT DEFINITION
→ owning N2 canonical chapter

OPEN status / canonical owner / merge aliases
→ OPEN-DECISIONS.md

FULL ORIGINAL OPEN wording/context
→ owning N2 canonical chapter

HYPOTHESIS identity / owner / evidence expectation
→ HYPOTHESES.md

FULL ORIGINAL HYPOTHESIS reasoning
→ owning N2 canonical chapter
```

Therefore:

```text
C4 REGISTRY
≠
REPLACEMENT FOR C2
```

---

# 1. Corpus coverage

The 23 C2 chapters contain the following local invariant ranges:

| N2 | Prefix | Count |
|---|---|---:|
| N2.01 Product Experience | `PX-INV` | 12 |
| N2.02 Identity / Players | `ID-INV` | 25 |
| N2.03 Communities | `COM-INV` | 35 |
| N2.04 Sessions | `SES-INV` | 35 |
| N2.05 Registration | `REG-INV` | 40 |
| N2.06 Team Formation | `BAL-INV` | 40 |
| N2.07 Live Match | `MATCH-INV` | 40 |
| N2.08 Competitions | `COMP-INV` | 40 |
| N2.09 History / Statistics | `STAT-INV` | 40 |
| N2.10 Notifications | `NOTIF-INV` | 50 |
| N2.11 Media | `MEDIA-INV` | 50 |
| N2.12 Online / Offline | `OFFLINE-INV` | 55 |
| N2.13 Realtime | `RT-INV` | 50 |
| N2.14 Data Architecture | `DATA-INV` | 50 |
| N2.15 API / Application | `API-INV` | 50 |
| N2.16 Security / Privacy / LGPD | `SEC-INV` | 55 |
| N2.17 Reliability | `REL-INV` | 60 |
| N2.18 Performance / Scalability | `PERF-INV` | 65 |
| N2.19 Observability | `OBS-INV` | 60 |
| N2.20 Testing / QA | `QA-INV` | 70 |
| N2.21 Operations / Deploy | `OPS-INV` | 70 |
| N2.22 Migration / Strangler | `MIG-INV` | 80 |
| N2.23 Architecture Governance | `GOV-INV` | 80 |
| **Total** |  | **1,152** |

The local IDs remain stable and owned by their N2 chapter. C4 adds a smaller cross-context `GINV-*` layer only where the same architectural truth is repeated across contexts or must be governed globally.

C2 also materialized:

```text
232 source-origin OPEN concerns
75 source-origin hypotheses
```

These counts intentionally refer to **origin records**, before cross-context merge/alias resolution. C4 does not pretend that repeated concerns such as minors, spectator visibility, command-receipt retention or Match-offline scope are independent decisions merely because they appeared in multiple chapters.

---

# 2. Invariant severity

C4 adopts the N2.23 severity model:

```text
I0 — Security / privacy / irreversible data-integrity boundary
I1 — Core domain correctness / fairness / historical truth
I2 — Contract / reliability / operational correctness
I3 — Maintainability / performance / architecture guardrail
```

Severity is about the impact of violating the rule, not how difficult the implementation is.

Examples:

```text
cross-Community BOLA prevention
→ I0

Match score sequence / Registration FIFO
→ I1

Realtime gap recovery contract
→ I2

no premature Redis adoption
→ I3
```

A local invariant may have a higher severity than the dominant range of its context. The owning N2 + global catalog decide the actual rule; context-level severity labels are not a substitute for per-invariant review.

---

# 3. Evidence vocabulary

Global invariants reference one or more enforcement/evidence classes:

```text
TYPE
compile-time/domain type boundary

DOMAIN
pure domain/property/state-machine test

DB
constraint/FK/index/transaction/lock test

RLS
real authorization/RLS/RPC integration test

CONCURRENCY
real concurrent transaction/race test

CONTRACT
runtime schema/API/realtime compatibility test

E2E
thin critical user-journey evidence

PROPERTY
property-based/determinism test

INTEGRITY
production/rebuild/integrity check

OBS
operational telemetry/alert

FAILURE
failure injection/reconciliation test

RESTORE
backup/restore/privacy-replay drill

MIGRATION
backfill/cohort/provenance/contract verification

SECURITY
negative-first/BOLA/mass-assignment/secret test

REVIEW
architecture/security/privacy/operations review gate
```

`EXECUTABLE EVIDENCE` does not mean every invariant needs E2E. It means the evidence must live at the lowest layer that can actually prove the rule without mocking its owner away.

---

# 4. Open Decision lifecycle

Canonical statuses:

```text
OPEN
BLOCKING
DEFERRED_FUTURE_SCOPE
RESOLVED_C3
RESOLVED_C4
RESOLVED_BY_ADR
REJECTED
SUPERSEDED
```

Rules:

1. An `OPEN` item is not permission for implementation to choose arbitrarily.
2. `BLOCKING` means an irreversible or security/correctness-sensitive dependent change must wait.
3. `DEFERRED_FUTURE_SCOPE` means current safe behavior is to keep the feature/capability absent or governed by the already-accepted narrower ADR.
4. Resolution requires an ADR, accepted canonical source update, or explicit phase decision with durable traceability.
5. If several N2 chapters ask the same question, C4 names one primary owner and retains every source concern as an alias/origin.

---

# 5. Hypothesis lifecycle

Canonical statuses:

```text
UNVALIDATED
VALIDATING
SUPPORTED
REFUTED
SUPERSEDED
CONVERTED_TO_ADR
```

Rules:

```text
HYPOTHESIS
≠
DECISION
```

and:

```text
UNVALIDATED HYPOTHESIS
CANNOT BE THE ONLY CONTROL
PROTECTING I0/I1
```

A hypothesis record must state what observation could support/refute it. “We think this is enough” without a measurement/review trigger is not useful architecture evidence.

---

# 6. Canonical ID schemes introduced by C4

## 6.1 Global invariant IDs

C4 resolves N2.23 Open Decision “exact global invariant ID namespace” as:

```text
GINV-<FAMILY>-###
```

Examples:

```text
GINV-AUTH-001
GINV-REG-001
GINV-MATCH-003
GINV-SEC-004
GINV-MIG-002
```

A Global Invariant ID is never reused after retirement.

## 6.2 Open Decision IDs

```text
OPEN-<OWNER/FAMILY>-###
```

Existing useful source IDs remain aliases:

```text
OD-NOTIF-001
→ alias of OPEN-NOTIF-001

OPEN-REL-001
→ preserved as OPEN-REL-001
```

## 6.3 Hypothesis IDs

```text
HYP-<OWNER/FAMILY>-###
```

Existing IDs such as `HYP-OPS-*`, `HYP-MIG-*` and `HYP-GOV-*` are preserved.

---

# 7. Cross-context ownership resolutions

These repeated concerns have one primary owner in C4.

| Concern repeated in | Canonical owner |
|---|---|
| minors / onboarding / privacy | Security / Privacy (`OPEN-SEC-003`) |
| public Match/Competition spectator visibility | Security/Privacy + owning product context; primary cross-context decision `OPEN-SEC-007` |
| Match offline scope / lease grace | Live Match, with Offline/Reliability constraints (`OPEN-MATCH-001`, `OPEN-MATCH-002`) |
| command-receipt retention | API/Data, constrained by Reliability/Privacy (`OPEN-API-002`) |
| RPO/RTO | Reliability/Operations (`OPEN-REL-001`) |
| numeric SLOs | Reliability/Observability/Performance (`OPEN-REL-002`) |
| provider worker runtime | Operations, with Notifications as consumer (`OPEN-OPS-012`) |
| broker/queue trigger | Performance/Operations evidence; Notifications source concern aliases it |
| Realtime spectator distribution scale | Realtime/Performance (`OPEN-RT-006`) |
| rating aggregation / skill rubric / missing-data resolver | Team Formation input + evaluation/skill-profile model; source concerns remain explicit until C5/C7 confirms final bounded owner |
| historical display name vs current identity | Identity/Statistics (`OPEN-ID-003`) |
| data retention | Security/Privacy is policy owner; context-specific storage retention remains context input |
| old-client compatibility window | Migration/Operations (`OPEN-MIG-004`) |
| local Quick/Match recovery export | Offline/Reliability (`OPEN-OFF-010`) |
| partitioning threshold/strategy | Performance/Data (`OPEN-PERF-005`) |

This table does not erase narrower questions. It prevents two teams from independently “closing” the same cross-context policy with incompatible answers.

---

# 8. Governance Open Decisions closed by C3/C4

Some N2.23 questions were intentionally open only until these phases existed.

| N2.23 source question | Resolution |
|---|---|
| preserve working ADR numbers vs renumber after dedupe | **RESOLVED_C3** — stable context-prefixed ADR IDs; working numeric anchors remain aliases |
| exact global invariant ID namespace | **RESOLVED_C4** — `GINV-<FAMILY>-###` |
| exact Open Decision/Hypothesis registry location | **RESOLVED_C4** — this `docs/architecture/catalogs/` set |

The following remain open because C3/C4 did not actually answer them merely by existing:

- exact future standalone ADR file layout beyond the current canonical catalog;
- machine-readable traceability format;
- CODEOWNERS use;
- dependency-rule tooling;
- machine-readable docs metadata;
- exception/deprecation/debt registry location;
- review cadence;
- PR risk metadata;
- architecture-fitness CI gating;
- legacy `domain-model.md` final archive/rewrite;
- old-client compatibility representation;
- deprecation telemetry source;
- RFC-before-ADR policy;
- automated link/ID validation;
- Architecture Audit artifact form and cadence;
- terminology localization catalog;
- asynchronous review workflow.

---

# 9. No-loss rule for C5–C7

C5–C7 may reorganize references but must not collapse distinctions established here:

```text
ADR
≠ INVARIANT
≠ OPEN DECISION
≠ HYPOTHESIS
≠ DEPRECATION
≠ EXCEPTION
```

When C5 needs a matrix cell, it references stable IDs.

When C6 needs a migration gate, it references the invariant/open/ADR rather than copying an ad-hoc sentence.

When C7 finds a contradiction, it records which canonical artifacts disagree and which owner must resolve them.

---

# 10. C4 completion criteria

C4 is complete when:

- [x] all 23 local invariant ranges are indexed;
- [x] all 1,152 local invariant definitions remain owned by their N2 chapters;
- [x] cross-context architectural truths have canonical `GINV-*` records;
- [x] Global Invariants include owner, severity, affected contexts, evidence and ADR/Principle links;
- [x] all source-origin OPEN concerns are represented or explicitly merged/aliased;
- [x] existing useful OPEN aliases are preserved;
- [x] no OPEN concern is silently promoted to a decision;
- [x] all source-origin hypotheses are represented;
- [x] existing `HYP-OPS`, `HYP-MIG`, `HYP-GOV` IDs are preserved;
- [x] hypotheses have evidence/review expectations;
- [x] no hypothesis is used as the sole I0/I1 control;
- [x] C3 ADR identities are used instead of obsolete working numeric IDs where canonical links are known;
- [x] process questions genuinely answered by C3/C4 are marked resolved instead of remaining stale OPEN records.

---

# 11. Handoff to C5

C5 now receives stable IDs for the transverse matrices.

At minimum C5 will be able to express:

```text
Entity
→ owner
→ source-of-truth nature
→ canonical ADRs
→ GINV
→ lifecycle
→ offline class
→ data classification

Command
→ actor/context
→ capability
→ transaction
→ idempotency
→ concurrency token
→ offline class
→ Realtime effect
→ error contract
→ GINV

Projection
→ source
→ rebuild rule
→ freshness
→ writer
→ consumer
→ GINV

Capability
→ role/responsibility/assignment source
→ resource context
→ RLS/RPC enforcement
→ security severity
→ GINV
```

C5 must not invent answers for OPEN items. A matrix cell whose policy is unresolved references the corresponding `OPEN-*` ID.