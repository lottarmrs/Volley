# C7 — Architecture Contradiction / Completeness Audit Master

> Status: `AUDIT-COMPLETE / CANONICAL-PROMOTION-BLOCKED`
>
> Owner: `Architecture Governance + bounded-context owners`
>
> Parent: [`EAP-MASTER.md`](../EAP-MASTER.md)
>
> Audited corpus: C1–C6 canonicalization artifacts, canonical N2 chapters, architecture governance material, selected current/legacy operational documents and executable architecture anchors.

---

# 0. Purpose

C7 is the first formal architecture audit defined by N2.23.

It does **not** add a new bounded context, invent domain behavior, close Open Decisions, validate hypotheses by opinion or rewrite conflicting material silently.

It asks:

```text
DO THE ARCHITECTURE SOURCES
AGREE ABOUT

meaning?
ownership?
authority?
decision status?
invariants?
state ownership?
offline/realtime rules?
data truth class?
security?
migration?
operational source of truth?
required evidence?
```

and separately:

```text
IS THE CORPUS COMPLETE ENOUGH
TO GUIDE IMPLEMENTATION
WITHOUT SILENTLY INVENTING ARCHITECTURE?
```

C7 outputs:

```text
docs/architecture/audit/
├── C7-AUDIT-MASTER.md
├── C7-FINDINGS-LEDGER.md
├── C7-CORRECTIONS-REQUIRED.md
└── C7-COMPLETENESS-VERDICT.md
```

---

# 1. Non-correction rule

A contradiction is recorded before it is fixed.

```text
AUDIT FINDING
≠
SILENT RESOLUTION
```

If two sources disagree, C7 records:

```text
what disagrees
why it matters
which source owns the question
what must be corrected
what must NOT be inferred meanwhile
```

The owning artifact/ADR/Open Decision remains responsible for the actual correction.

---

# 2. Audit classification

## 2.1 Finding classes

```text
CONTRADICTION
Two normative/canonical-looking sources cannot both govern the same question.

AUTHORITY_COLLISION
A legacy/transitional document or executable artifact appears current enough to override the target accidentally.

STRUCTURAL_DRIFT
Index/tree/catalog no longer matches the canonical artifact it claims to index.

OWNERSHIP_GAP
A concept has no unambiguous bounded-context owner or introduces an owner label absent from EAP governance.

STATUS_DRIFT
OPEN/HYPOTHESIS/ACCEPTED state is inconsistent across registries/artifacts.

NAMING_DRIFT
Canonical vocabulary and implementation-facing matrices use different names for the same concept without explicit alias policy.

REFERENCE_BREAK
A canonical cross-link/path/ID does not resolve to the intended artifact.

TRACEABILITY_GAP
A material post-canonicalization rule exists but is not tied to the expected ADR/invariant/open/evidence chain.

IMPLEMENTATION_READINESS_GAP
Target semantics are coherent but an implementation-critical classification/gate/artifact is still incomplete.

EXPECTED_TRANSITION
Current implementation intentionally differs from target and C6 already owns the migration path.

OPEN_BY_DESIGN
A question is deliberately unresolved and correctly represented as OPEN/HYPOTHESIS.
```

## 2.2 Audit priority

Audit priority is deliberately separate from invariant severity `I0..I3`.

```text
AP0 — CANONICAL PROMOTION BLOCKER
A source-of-truth/ownership/security/structural conflict must be corrected before the corpus can become CANONICAL.

AP1 — BOUNDARY / IMPLEMENTATION BLOCKER
Affected schema/API/security/authority boundary must not freeze until corrected.

AP2 — HIGH-VALUE CONSISTENCY GAP
Does not invalidate the target, but can cause wrong implementation or governance drift.

AP3 — HYGIENE / MAINTAINABILITY
Should be corrected, but does not block a bounded implementation slice by itself.
```

This taxonomy must not be confused with `I0..I3` from C4.

---

# 3. Audited authority chain

C7 used the N2.23 source-of-truth model:

```text
Vocabulary
→ GLOSSARY.md

Global constraints
→ PRINCIPLES.md

Decision identity/status
→ ADR-CATALOG.md

Bounded-context target
→ owning N2

N2/N3 scope + ownership tree
→ EAP-MASTER.md

Global/local invariant identity
→ C4 catalogs + owning N2

Open/Hypothesis status
→ C4 catalogs

Cross-context navigation
→ C5 matrices

Execution ordering / authority transfer
→ C6 execution program

Applied schema
→ versioned migrations

Deployed behavior
→ deployed code/schema + telemetry
```

C7 does not use:

```text
newest timestamp
old spec
current code
runbook proximity
```

as automatic override rules.

---

# 4. Corpus coverage audited

## 4.1 Canonicalization corpus

Reviewed structurally and/or semantically:

```text
EAP-MASTER.md
PRINCIPLES.md
GLOSSARY.md
23 N2 chapters
ADR-CATALOG.md
C4-INDEX.md
INVARIANT-CATALOG.md
OPEN-DECISIONS.md
HYPOTHESES.md
C5 master + six matrices
C6 master + six execution packs
N2.23 Architecture Governance
```

## 4.2 Current/transitional evidence sampled against target

High-risk evidence inspected:

```text
docs/architecture/domain-model.md
docs/operations/reset-cutover-runbook.md
docs/operations/schema-drift-check.md
.github/workflows/ci.yml
src/architecture/importAliases.test.ts
src/infra/supabase/syncService.ts
src/infra/supabase/operationalCloudService.ts
src/infra/supabase/communityCloudService.ts
src/infra/supabase/sessionOwnershipCloudService.ts
src/storage/localStorageRepository.ts
supabase/migrations/* inventory
```

The purpose of current-code inspection was **not** to demand that migration is already complete. It was to verify whether C6 identifies the divergence and whether legacy artifacts can still be mistaken for target authority.

---

# 5. What C7 explicitly does not call a contradiction

The following are known Current→Target differences with an explicit C6 strangler path:

```text
broad LocalSyncPayload / syncService
localStorage domain persistence
cloudId/local_id/sync metadata
direct Community CRUD/upsert
Session selected_player_ids[] / team_ids[]
Team player_ids[]
Game mutable score / point_ids[]
Session-level control ownership
legacy Championship model
legacy CareerEvent
public/raw-ish avatar proposal flow
```

These remain important migration debt, but their existence does not mean the **target architecture documents contradict each other**.

C7 records a problem only when:

- the migration path is missing or incompatible;
- the legacy artifact still presents itself as normative without a transition marker;
- a target source itself conflicts with another target source;
- an OPEN/HYPOTHESIS is accidentally frozen as architecture fact.

---

# 6. Audit dimensions

C7 evaluated the corpus across these dimensions:

```text
A. scope / N2-N3 tree integrity
B. ubiquitous language
C. owner identity
D. ADR identity/status
E. invariant identity/severity/evidence
F. Open Decision / Hypothesis status
G. entity truth classification
H. authority / offline / realtime
I. command / transaction / idempotency
J. capability / security / privacy
K. reliability / recovery
L. performance / observability / QA
M. migration / deployment / rollback
N. legacy document authority
O. link / ID / registry integrity
P. implementation cutover readiness
```

---

# 7. Audit summary

C7 found that the **core target semantics are substantially coherent**:

- User/Player/Participant separation is consistent;
- Organizer/governance separation is consistent;
- Registration FIFO/atomic promotion is consistent;
- attribute-only Team Balancer is consistent;
- Fixture/Match/OfficialResult separation is consistent;
- Match sequence/epoch/no-LWW model is consistent;
- factual Statistics vs subjective Rating is consistent;
- shared-state/offline authority model is consistent;
- Realtime-as-transport is consistent;
- relational/Postgres/source-vs-projection model is consistent;
- semantic Commands/idempotency model is consistent;
- outbox/provider separation is consistent;
- privacy/history deletion separation is consistent;
- strangler/one-authority migration rule is consistent.

However, **the corpus is not yet eligible for `CANONICAL` promotion** because structural and authority-document conflicts remain.

Headline blockers:

```text
1. EAP N3 decomposition has drifted from materialized N2 chapters.
2. legacy/transitional docs still present target-conflicting rules as current source-of-truth material.
3. operational runbooks still prescribe schema/reset/SECURITY DEFINER behavior that conflicts with accepted target policy.
4. Rating/Skill Profile ownership is not represented as an unambiguous EAP owner even though C5 uses a new Rating owner label.
5. canonical terminology/status has several unresolved naming/correlation mismatches.
6. some canonical cross-links are broken.
7. C6 introduced normative execution constructs after C3 without an explicit ADR-vs-process classification pass.
```

The detailed records are in [`C7-FINDINGS-LEDGER.md`](./C7-FINDINGS-LEDGER.md).

---

# 8. Promotion rule

The current architecture corpus remains:

```text
DRAFT-CANONICAL
```

The C7 audit itself is complete, but promotion is blocked.

Promotion to:

```text
CANONICAL
```

requires all `AP0` findings closed and all `AP1` findings either closed or explicitly scoped so they cannot contaminate a frozen implementation boundary.

No `AP0` can be waived by:

```text
"the code already works"
"we know what we meant"
"the newer file is probably right"
"we will fix docs later"
```

---

# 9. Safe work while promotion is blocked

C7 does not imply a total engineering freeze.

Safe categories include:

```text
C7 remediation itself
W0 safety/inventory/testing foundations
mechanical reference/link checks
legacy-document classification
DB/RLS/concurrency harness
pure W1 Team Balancer removal of Overall influence
other slices whose owner semantics are already unambiguous and which do not freeze an affected OPEN/AP0 boundary
```

Do not freeze schema/API naming for an affected AP0/AP1 finding before its owner closes the record.

---

# 10. Required follow-up

Follow [`C7-CORRECTIONS-REQUIRED.md`](./C7-CORRECTIONS-REQUIRED.md), then rerun C7.

Final state after corrections should be:

```text
C1 EAP                         reconciled
C2 N2 corpus                   canonical
C3 ADR catalog                 delta-reviewed
C4 registries                  reference-clean
C5 matrices                    aligned
C6 execution program          traceable
C7 audit                       PASS
legacy docs                    explicitly archived/transitional
reference checker              green
canonical promotion            approved
```
