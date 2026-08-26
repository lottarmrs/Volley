# C7 — Corrections Required Before Canonical Promotion

> Status: `REMEDIATION-PLAN / C7`
>
> Owner: `Architecture Governance + finding owners`
>
> Parent: [`C7-FINDINGS-LEDGER.md`](./C7-FINDINGS-LEDGER.md)

---

# 0. Rule

This plan corrects **the architecture corpus and governance ambiguity first**.

It does not use C7 as an excuse for a big-bang product rewrite.

```text
C7 REMEDIATION
≠
IMPLEMENT ALL OF C6 NOW
```

The order is designed to remove source-of-truth ambiguity before implementation begins freezing target schema/API contracts.

---

# 1. Remediation order

```text
R0  freeze canonical promotion only
R1  reconcile EAP decomposition
R2  classify legacy/transitional documents
R3  correct operational source-of-truth conflicts
R4  repair links + add reference checker
R5  resolve owner/status/naming blockers
R6  run post-C6 ADR delta review
R7  align evidence/severity/fitness-function governance
R8  clarify mixed truth classes before schema freeze
R9  materialize C6 execution tracking before first cutover
R10 rerun machine + semantic audit
R11 promote to CANONICAL only if gates pass
```

---

# 2. R0 — Do not promote yet; do not freeze all engineering

Until AP0 closes:

```text
DO NOT
bulk-change all architecture statuses to CANONICAL
freeze affected schema names
freeze affected API names
claim C7 passed
```

Allowed:

```text
C7 remediation
W0 safety/test/tooling
pure W1 algorithm correction
non-conflicting implementation spikes
shadow/prototype work that does not silently close OPEN decisions
```

---

# 3. R1 — Reconcile EAP against all 23 N2 chapters

**Findings:** `C7-F-001`

## Required mechanical check

For every canonical N2:

1. read actual headings matching `N3.<context>.*`;
2. compare ID + title + order against EAP;
3. report:

```text
MATCH
TITLE_DRIFT
MISSING_IN_EAP
MISSING_IN_N2
ID_SHIFT
DUPLICATE_ID
```

## Decision required

Architecture Governance must choose one model:

### Option A — EAP retains detailed N3 authority

Then EAP must be updated after every N2 decomposition change and CI should detect drift.

### Option B — EAP owns N2 scope/owner only; N2 owns detailed N3 decomposition

Then remove/demote duplicated detailed N3 lists from EAP or clearly mark them generated.

### Audit preference

Do not keep two manually editable authorities for the same heading tree.

## Exit criteria

```text
23/23 contexts mechanically reconciled
0 duplicate N3 IDs
0 unexplained title/ID drift
chosen authority rule documented
```

---

# 4. R2 — Classify legacy / current / historical documents visibly

**Findings:** `C7-F-002`, `C7-F-003`, `C7-F-020`, `C7-F-021`

## Minimum status header convention

Every non-canonical architecture/operations document that could influence design or production behavior should declare one of:

```text
CURRENT-OPERATIONAL
TRANSITIONAL
HISTORICAL
SUPERSEDED
BREAK-GLASS
ARCHIVED
```

and include:

```text
Owner
Last reviewed
Canonical replacement / governing target
Removal/review trigger where applicable
```

## Immediate files

### `docs/architecture/domain-model.md`

Must be:

```text
TRANSITIONAL / LEGACY CURRENT-MODEL REFERENCE
NOT TARGET SOURCE OF TRUTH
```

or moved to archive.

Point readers to:

```text
PRINCIPLES
GLOSSARY
owner N2s
ADR-CATALOG
C6
```

### `docs/operations/reset-cutover-runbook.md`

Must state whether it is:

```text
historical completed plan
still-authorized exceptional reset
or superseded
```

It must not look like the default path for C6 migration.

### platform/global role documents

Clarify:

```text
master/programmer/etc.
= platform/staff implementation vocabulary if retained

NOT
Community OWNER/ADMIN/MEMBER hierarchy
NOT
ORGANIZER responsibility
```

## Exit criteria

No document outside canonical architecture can plausibly be read as a competing target source without an explicit status banner.

---

# 5. R3 — Correct operational source-of-truth conflicts

**Findings:** `C7-F-004`, `C7-F-005`, `C7-F-022`

## 5.1 Schema reconstruction

Data + Operations must publish one current reconstruction contract aligned with P-036/N2.21.

Required answers:

```text
What is the canonical baseline?
How is a fresh DB built?
Are all migrations replayable from that baseline?
How is a consolidated schema generated?
How is generated drift checked?
Is schema.sql consumed by provisioning or diagnostic only?
```

### Constraint

A manually maintained `schema.sql` and a migration chain cannot both be independent authorities.

## 5.2 `schema.sql` placement/status

If retained:

- make generated/derived status obvious;
- do not position it as a numbered migration;
- add generation/verification metadata;
- CI should fail if a required generated artifact is stale when generation is deterministic.

## 5.3 SECURITY DEFINER hardening

For privileged functions that remain reachable:

```text
inventory function
owner
who can EXECUTE
security invoker/definer
search_path posture
fully-qualified references
actor derivation
authorization predicate
AAL2 requirement if applicable
RLS interaction
test evidence
migration/removal status
```

Update operational docs so `search_path = public` is never presented as the target hardening pattern.

## Exit criteria

```text
one schema authority path
one documented fresh-build path
privileged-function inventory
operational docs aligned with target security policy
```

---

# 6. R4 — Repair references and make reference integrity executable

**Findings:** `C7-F-007`, `C7-F-008`, `C7-F-019`

## Immediate corrections

Fix known incorrect links in:

```text
docs/architecture/contexts/N2.10-notifications.md
docs/architecture/contexts/N2.11-media.md
```

including platform/security directory traversal and canonical N2.15 filename.

## Add CI architecture-reference fitness check

At minimum validate:

```text
Markdown relative file links
Markdown section anchors where practical
ADR-ID existence
GINV/local invariant reference syntax
OPEN-ID existence
HYP-ID existence
C5/C6 artifact links
canonical N2 file paths from EAP
```

### Important

The checker must understand lifecycle:

```text
legacy alias intentionally retained
≠ broken reference
```

but intentional aliasing must be explicit.

## Exit criteria

```text
0 broken canonical file links
0 dangling ADR references
0 dangling OPEN/HYP references
CI guard installed
```

---

# 7. R5 — Resolve ownership / status / naming blockers through owning contexts

**Findings:** `C7-F-006`, `C7-F-009`, `C7-F-010`, `C7-F-011`, `C7-F-012`, `C7-F-017`

C7 does not pick these answers; it routes them.

## 7.1 Rating / Skill Profile ownership

Required output:

```text
one explicit canonical owner
```

for:

```text
PlayerEvaluation semantics
CommunityPlayerSkillProfile
GlobalPlayerSkillProfile
aggregation versions
Derived Overall formula ownership
rating projection rebuild
```

Then update:

```text
EAP
C5 owner cells
ADR ownership where needed
C4 Open/Hyp owner
N2 cross-links
```

## 7.2 Statistical contribution name

Close or preserve open status intentionally.

If closed:

```text
chosen entity term
→ GLOSSARY
→ N2.09
→ C5.01
→ Data/API schema
→ HYP-STAT-001 status transition
```

If still open:

```text
GLOSSARY must not falsely canonicalize a competing term
```

## 7.3 Standings projection term

Normalize:

```text
StandingProjection
vs
StandingsProjection
```

before DB/type/API names are frozen.

## 7.4 Observability correlation taxonomy

Publish explicit definitions for:

```text
command_id
request_id
trace_id
correlation/reference id
job_id
release_id
```

Specify cardinality/retry relationship, for example:

```text
one command_id
→ many request_id attempts possible
→ one or more trace relationships according to instrumentation
```

without using a single word `correlation` for multiple IDs.

## 7.5 Match correction command

N2.07 owns final command vocabulary.

Normalize Principles/Glossary/C5 after selection.

## Exit criteria

Every item has one owner and one registry state:

```text
ACCEPTED
OPEN
HYPOTHESIS
```

not two simultaneously.

---

# 8. R6 — Run post-C6 ADR delta review

**Finding:** `C7-F-013`

C3 canonicalized decisions available through C2.

C6 later introduced execution-governance constructs.

Review:

```text
Execution Slice XS-*
Slice lifecycle
Authority Ledger
G0..G7 gates
authority cutover status vocabulary
legacy removal gates
```

For each item record:

```text
PROCESS_MECHANISM
or
MATERIAL_ARCHITECTURE_DECISION
```

If `PROCESS_MECHANISM`:

- keep in C6;
- name owner;
- state that no ADR identity is expected.

If `MATERIAL_ARCHITECTURE_DECISION`:

- create/extend canonical ADR under `ADR-MIG-*`, `ADR-OPS-*` or `ADR-GOV-*` as appropriate;
- cross-link C6.

## Exit criteria

No normative post-C3 construct has undefined decision status.

---

# 9. R7 — Align severity and fitness-function governance

**Findings:** `C7-F-014`, `C7-F-015`

## 9.1 Severity

Canonical invariant severity remains:

```text
I0..I3
```

Audit priority remains:

```text
AP0..AP3
```

If QA needs another taxonomy, define it with a different semantic purpose and mapping.

Remove undefined `Q0/Q1` usage otherwise.

## 9.2 Fitness function metadata

For architecture tests/fitness functions, record at least in code comments/manifest/doc:

```text
ID
owner
protected principle/invariant
status: TARGET | TRANSITIONAL | LEGACY
removal/replacement trigger
```

### Immediate test

`src/architecture/importAliases.test.ts` must be split conceptually into:

```text
TARGET boundary tests
TRANSITIONAL legacy-contract tests
```

so W13/W14 can delete transitional assertions deliberately.

## Exit criteria

No architecture test protects a deprecated contract without an explicit removal trigger.

---

# 10. R8 — Clarify mixed truth classes before schema freeze

**Finding:** `C7-F-016`

For every C5.01 row whose `Truth class` contains more than one data role, Data + owner should produce an implementation classification.

Template:

```text
Concept: RegistrationEntry
Current authoritative row: CURRENT_STATE
Historical transition/source record: <separate entity or intentionally absent>
Audit: <separate audit record?>
Snapshot: <if any>
Projection: <if any>
```

Do this before table design for affected contexts.

Examples to review:

```text
Community Defaults / Settings Version
RegistrationEntry
TeamFormationRequest
other rows containing SOURCE/CURRENT or CURRENT+history wording
```

The correction may simply document that one conceptual concept maps to multiple storage artifacts.

## Exit criteria

Each physical persisted artifact planned for W2–W11 has one primary truth class.

---

# 11. R9 — Materialize C6 execution tracking before first cutover

**Finding:** `C7-F-018`

Before any `XS-*` reaches `CUTOVER_ACTIVE`, create a concrete operational representation for:

```text
slice status
authority before/after
cohort selector
legacy writer status
target writer status
legacy read status
target read status
release/cutover marker
verification evidence
contract gate
```

Possible representations include repository-controlled manifest + telemetry, database-backed migration metadata or another reviewed mechanism.

C7 does not select technology.

### Constraint

The representation must answer during an incident:

> Which engine is authoritative for aggregate X right now?

without relying on tribal memory.

---

# 12. R10 — Machine audit + semantic rerun

After R1–R9:

## Mechanical

```text
all relative links
all canonical file paths
N3 IDs
ADR IDs
GINV/local invariant IDs
OPEN IDs
HYP IDs
C5 references
C6 references
status headers
```

## Semantic spot checks

Re-run at minimum:

```text
identity separation
Organizer/governance
Registration FIFO
Rating hierarchy
Balancer no Overall
Session/Match/Competition boundaries
Match sequence/epoch/reconciliation
Stats vs Rating
Offline authority
Realtime role
schema authority
Security Definer policy
account deletion/history
strangler authority transfer
```

## Current→Target classification

For each runtime mismatch found, confirm it is either:

```text
mapped to C6 slice
or
new migration finding
```

No unexplained mismatch.

---

# 13. R11 — Canonical promotion

Only after rerun:

```text
AP0 = 0
AP1 = 0 or explicitly scoped/non-freezing
mechanical reference check = PASS
ADR delta review = PASS
Open/Hyp registry status = coherent
legacy documents = visibly classified
```

may Architecture Governance promote the corpus.

Recommended promotion sequence:

```text
1 PRINCIPLES / GLOSSARY
2 EAP
3 owner N2 chapters
4 ADR catalog
5 C4 registries
6 C5 matrices
7 C6 execution program
8 C7 verdict
```

A promotion should be one reviewable change/set, not silent piecemeal status edits.

---

# 14. What must not happen during remediation

```text
DO NOT
rename production tables just to match prose before migration slice exists
rewrite applied migrations
invent Rating owner by whichever developer touches it first
close Open Decisions because a default is convenient
remove legacy sync before W13 consumers are cut over
move active Match/Game between engines
use reset to avoid designing migration provenance
turn schema.sql into another manual source
weaken RLS/security to simplify cutover
```

C7 repairs **clarity and authority** first; C6 moves runtime authority afterward.
