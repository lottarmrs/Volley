# C7 — Architecture Findings Ledger

> Status: `AUDIT-COMPLETE / OPEN-FINDINGS`
>
> Owner: `Architecture Governance + listed owners`
>
> Parent: [`C7-AUDIT-MASTER.md`](./C7-AUDIT-MASTER.md)

---

# 0. Reading rule

A finding records a contradiction/completeness problem; it does not silently select the answer.

Status vocabulary:

```text
OPEN
CORRECTION_REQUIRED
EXPECTED_TRANSITION
OPEN_BY_DESIGN
PASS
```

Priority:

```text
AP0 canonical-promotion blocker
AP1 affected-boundary blocker
AP2 high-value consistency gap
AP3 hygiene/maintainability
```

---

# 1. AP0 — Canonical promotion blockers

## C7-F-001 — EAP N3 tree has drifted from materialized N2 chapters

**Class:** `STRUCTURAL_DRIFT`  
**Priority:** `AP0`  
**Owner:** Architecture Governance + each affected N2 owner  
**Status:** `CORRECTION_REQUIRED`

### Evidence

`EAP-MASTER.md` declares itself the authority for which N2/N3 exists and who owns it.

But at least these verified examples diverge:

### N2.09

EAP currently lists early nodes as:

```text
N3.09.01 Statistical Facts
N3.09.02 Subjective Evaluations vs Statistics
N3.09.03 Match Participation Source
N3.09.04 Player Match Stats
...
```

The materialized N2.09 chapter instead starts:

```text
N3.09.01 Factual vs Subjective Data
N3.09.02 Match Participation
N3.09.03 Stat Contribution
N3.09.04 Match Stats
...
```

and materially expands the decomposition beyond the EAP tree.

### N2.10

EAP starts:

```text
N3.10.01 Domain Event Input
N3.10.02 Notification Policy
N3.10.03 Notification Intent
...
```

The materialized chapter starts:

```text
N3.10.01 Boundary e responsabilidade
N3.10.02 DomainEvent e Transactional Outbox
...
```

### Why it matters

C1 says the EAP answers:

```text
where a concern belongs
which N3 exists
who owns it
```

If the N3 tree is stale, C1 cannot safely be promoted as the canonical architecture index.

### Required correction

Run a mechanical heading reconciliation for **all 23 N2 chapters** and choose one governance-safe resolution:

```text
A. update EAP N3 trees to match materialized N2 chapters;

or

B. explicitly demote detailed N3 enumeration in EAP and make N2 headings authoritative for decomposition.
```

Do not leave two different N3 trees both marked canonical.

---

## C7-F-002 — `domain-model.md` still presents legacy/local-first rules as source-of-truth

**Class:** `AUTHORITY_COLLISION`  
**Priority:** `AP0`  
**Owner:** Architecture Governance  
**Status:** `CORRECTION_REQUIRED`

### Evidence

N2.23 explicitly classifies:

```text
docs/architecture/domain-model.md
=
LEGACY / TRANSITIONAL REFERENCE
```

But the file itself still opens with:

```text
This document records the product language used by the codebase.
It defines source-of-truth decisions...
```

and contains target-conflicting statements such as:

```text
Sync modules move local/cloud data
Local-only communities keep local-first owner behavior
Player.userId links athlete to account
Commands may update local state even when cloud IO fails
```

### Conflict

These collide with accepted target rules:

```text
shared critical state server-authoritative
PlayerAccountLink explicit relation
offline by operation
no generic sync authority
```

### Required correction

Before canonical promotion, the file must be either:

```text
ARCHIVED
```

or visibly marked at its own top as:

```text
LEGACY / TRANSITIONAL — NOT TARGET SOURCE OF TRUTH
```

with links to the canonical replacements.

---

## C7-F-003 — Reset runbook still looks like an active general migration path

**Class:** `AUTHORITY_COLLISION`  
**Priority:** `AP0`  
**Owner:** Operations + Migration  
**Status:** `CORRECTION_REQUIRED`

### Evidence

`docs/operations/reset-cutover-runbook.md` is titled as a production cutover runbook and describes a destructive reset deleting product tables.

Target Migration/Strangler says:

```text
RESET
≠ default migration strategy

baseline
= strangler preserving IDs/facts/provenance
```

C6 likewise forbids destructive reset as the ordinary migration program.

### Risk

The runbook can be followed later by an operator who sees `docs/operations/` and reasonably treats it as current procedure.

### Required correction

Classify it explicitly as one of:

```text
HISTORICAL COMPLETED RUNBOOK
EXCEPTIONAL BREAK-GLASS RUNBOOK
SUPERSEDED RUNBOOK
```

and state that C6 W0–W14 is the current migration program.

If the reset capability remains installed, its operational status, intended scope and removal/deprecation plan need explicit ownership.

---

## C7-F-004 — `schema.sql` operational authority conflicts with migration-chain authority

**Class:** `CONTRADICTION / AUTHORITY_COLLISION`  
**Priority:** `AP0`  
**Owner:** Data + Operations  
**Status:** `CORRECTION_REQUIRED`

### Accepted target

P-036 and N2.21 define:

```text
VERSIONED MIGRATION CHAIN
= authoritative schema history

schema.sql / consolidated snapshot
= derived + verified artifact only
```

### Legacy operational docs

`docs/operations/reset-cutover-runbook.md` still instructs:

```text
apply schema.sql base
→ apply numbered migrations
```

`docs/operations/schema-drift-check.md` says the consolidated file is trusted by reconstruction and is manually synchronized against production.

### Why this is a real authority conflict

The question:

> How is a fresh database reconstructed?

must have one answer.

Current operational documents still encode a two-source reconstruction model while accepted target architecture rejects that model.

### Required correction

Operations/Data must choose and document one target path consistent with P-036, for example:

```text
fresh database
→ versioned migration history from canonical baseline
```

Any generated consolidated snapshot must be clearly generated/verified and not manually authoritative.

---

## C7-F-005 — `SECURITY DEFINER` operational instructions conflict with target hardening

**Class:** `CONTRADICTION / SECURITY`  
**Priority:** `AP0`  
**Owner:** Security + Operations + Data  
**Status:** `CORRECTION_REQUIRED`

### Accepted target

N2.16 target hardening requires privileged functions to move toward:

```text
SECURITY DEFINER
SET search_path = ''
+
fully-qualified object references
```

with explicit grants/revokes and server-side authorization.

### Current runbook

`reset-cutover-runbook.md` describes the privileged reset function as:

```text
security definer, set search_path = public
```

and presents this operationally as the current function posture.

### Distinction

The existing migration/function may remain an **expected Current→Target implementation gap**.

The AP0 problem is that a current-looking operational runbook presents the weaker posture without a target-migration warning.

### Required correction

Mark the runbook transitional and create/retain an explicit W0 security-hardening slice for every privileged function that remains reachable.

---

## C7-F-006 — Rating / Skill Profile has no unambiguous EAP owner

**Class:** `OWNERSHIP_GAP`  
**Priority:** `AP0` for schema/API ownership freeze  
**Owner:** Architecture Governance + Identity + Team Formation  
**Status:** `CORRECTION_REQUIRED`

### Evidence

EAP owns:

```text
N2.02 Identity / Players
N2.06 Team Formation / Balancing
```

but defines no `Rating` bounded context.

C5.01 nevertheless labels:

```text
PlayerEvaluation                owner = Rating / Identity sports evaluation
CommunityPlayerSkillProfile     owner = Rating projection
GlobalPlayerSkillProfile        owner = Rating projection
Derived Overall                 owner = Rating/display
```

C4 Open Decisions explicitly notes that cross-context Rating questions require an explicit Skill Profile owner assignment.

### Why it matters

Without one owner, future changes to:

```text
evaluation semantics
aggregation versioning
profile rebuild
community/global weighting
overall formula
privacy/read policy
```

can bounce between Identity, Team Formation and Statistics.

### Required correction

Architecture Governance must explicitly choose one of the already-supported ownership patterns, e.g. assign the capability to an existing N2 or create a named sub-owner governed by one N2.

C7 does **not** choose which owner.

---

# 2. AP1 — Boundary / implementation blockers

## C7-F-007 — Broken canonical cross-links in N2.10 Notifications

**Class:** `REFERENCE_BREAK`  
**Priority:** `AP1`  
**Owner:** Notifications + Architecture Governance  
**Status:** `CORRECTION_REQUIRED`

The N2.10 header links from `docs/architecture/contexts/` to paths such as:

```text
./N2.12-online-offline.md
./N2.13-realtime.md
./N2.15-api-application-layer.md
./N2.16-security-privacy-lgpd.md
./N2.17-reliability.md
```

but those canonical documents live in `../platform/` or `../security/`, and the canonical N2.15 filename is:

```text
N2.15-api-application.md
```

not `N2.15-api-application-layer.md`.

### Required correction

Fix links and add mechanical Markdown reference checking before canonical promotion.

---

## C7-F-008 — Broken canonical cross-links in N2.11 Media

**Class:** `REFERENCE_BREAK`  
**Priority:** `AP1`  
**Owner:** Media + Architecture Governance  
**Status:** `CORRECTION_REQUIRED`

N2.11 repeats the same path pattern for platform/security chapters, including the nonexistent `N2.15-api-application-layer.md` name.

This proves link integrity cannot be assumed from manual review.

### Required correction

Fix known links and run a corpus-wide relative-link checker.

---

## C7-F-009 — Statistical contribution entity name is simultaneously canonical-looking and unresolved

**Class:** `STATUS_DRIFT / NAMING_DRIFT`  
**Priority:** `AP1` before stats schema/API freeze  
**Owner:** Statistics + Data + Architecture Governance  
**Status:** `CORRECTION_REQUIRED`

### N2.09

N3.09.03 says the conceptual name may be:

```text
PlayerMatchStatContribution
or
MatchStatContribution
```

and explicitly says the final name will be closed in the Data Catalog.

### Glossary

The vocabulary authority defines:

```text
PlayerMatchStats
```

as the projection/contribution for one Match.

### C5.01

The implementation-facing matrix uses the `PlayerMatchStatContribution` family.

### C4

`HYP-STAT-001` still marks the canonical persisted contribution name/entity as unvalidated and says C5 naming review is the trigger.

### Required correction

The owner must either:

1. close `HYP-STAT-001` and normalize Glossary/N2/C5 to the chosen name; or
2. keep the name open and remove canonical-looking conflicting aliases from the vocabulary authority.

Do not create a table until this is closed.

---

## C7-F-010 — `StandingProjection` vs `StandingsProjection`

**Class:** `NAMING_DRIFT`  
**Priority:** `AP1` before Competition schema/API freeze  
**Owner:** Competition + Glossary  
**Status:** `CORRECTION_REQUIRED`

Glossary defines:

```text
StandingProjection
```

while EAP and N2.08 use:

```text
Standings Projection
StandingsProjection
```

This is small semantically but expensive if allowed into table/type/API names.

### Required correction

Choose one canonical entity term and record the other as a legacy/text alias only if useful.

---

## C7-F-011 — Request / Correlation / Trace terminology is ambiguous across sources

**Class:** `NAMING_DRIFT / TRACEABILITY_GAP`  
**Priority:** `AP1` before observability contract freeze  
**Owner:** Observability + API/Application  
**Status:** `CORRECTION_REQUIRED`

### Glossary

Defines:

```text
Request ID / Correlation ID
= identifier of a technical execution/communication attempt
```

### N2.19

Separates:

```text
request_id
trace_id nullable
```

and explains the current browser `correlationId` should become a user-facing reference tied to real server request/trace context.

### C6

Uses:

```text
command_id
request_id transport correlation
```

### Risk

If these collapse accidentally:

- retry attempts may share/request different IDs incorrectly;
- a trace may be confused with a request;
- support-visible correlation reference may not map reliably to server execution.

### Required correction

Glossary and N2.15/N2.19 must publish a single taxonomy for:

```text
command_id
request_id
trace_id
user-facing correlation/reference id if distinct
job_id
```

---

## C7-F-012 — Match correction command naming is not normalized

**Class:** `NAMING_DRIFT`  
**Priority:** `AP1` before Match command contract freeze  
**Owner:** Live Match + API/Application  
**Status:** `CORRECTION_REQUIRED`

Examples in canonical sources include variants such as:

```text
RevertEvent
RevertMatchEvent
Event Corrections / Reverts
```

The semantics are broadly consistent—append-oriented correction rather than LWW—but the command identity is not.

### Required correction

N2.07 owns the final command vocabulary. Normalize Principles/Glossary/C5 after the command is fixed.

---

## C7-F-013 — C6 introduces material process constructs after C3 without an explicit ADR-vs-process classification

**Class:** `TRACEABILITY_GAP`  
**Priority:** `AP1`  
**Owner:** Architecture Governance + Migration + Operations  
**Status:** `CORRECTION_REQUIRED`

C3 canonicalized ADRs from C2.

C6 later introduces normative execution constructs such as:

```text
Execution Slice XS-*
slice lifecycle
Authority Ledger
G0..G7 release gates
CUTOVER_ACTIVE / VERIFIED / LEGACY_WRITE_DISABLED / CONTRACTED
```

These may legitimately be execution-governance mechanics rather than architecture ADRs.

But the corpus does not yet explicitly classify which are:

```text
process vocabulary only
vs
material accepted architecture decisions requiring ADR identity
```

### Required correction

Run a **post-C6 ADR delta review**.

For each construct:

```text
if material decision → add/relate canonical ADR
if process mechanism → mark as governed execution vocabulary, not ADR
```

Do not let post-C3 rules exist in an undefined status.

---

## C7-F-014 — Undefined `Q0/Q1` vocabulary appears in C6 release gates

**Class:** `NAMING_DRIFT`  
**Priority:** `AP2`  
**Owner:** QA + Architecture Governance  
**Status:** `CORRECTION_REQUIRED`

C4 defines invariant severity:

```text
I0
I1
I2
I3
```

C6.06 says:

```text
Q0/I0/Q1/I1 invariants are not waived...
```

No canonical `Q0/Q1` invariant severity is defined by C4.

### Required correction

Remove or formally define the `Q*` taxonomy. Preferred audit action is to avoid introducing a duplicate severity model unless QA already owns a distinct one.

---

## C7-F-015 — Architecture fitness test protects legacy contracts without lifecycle metadata

**Class:** `IMPLEMENTATION_READINESS_GAP`  
**Priority:** `AP1` for W13/W14  
**Owner:** Architecture Governance + QA + Migration  
**Status:** `CORRECTION_REQUIRED`

`src/architecture/importAliases.test.ts` currently verifies valuable boundaries such as:

```text
Supabase under infra
UI common components under ui
shared type modules
```

but also deliberately imports/asserts:

```text
LocalSyncPayload
src/infra/supabase/syncService.ts exists
Session.selectedPlayerIds
Session.teamIds
```

N2.23 already recognizes that fitness functions can crystallize legacy.

### Risk

W13/W14 could correctly remove the legacy model and make the “architecture test” fail, creating pressure to preserve the wrong contract.

### Required correction

Annotate/structure architecture fitness tests by:

```text
protected invariant
owner
lifecycle
removal trigger
legacy vs target status
```

and create target replacement tests before deleting legacy assertions.

---

## C7-F-016 — C5 truth-class cells sometimes combine multiple classes without physical split guidance

**Class:** `IMPLEMENTATION_READINESS_GAP`  
**Priority:** `AP1` before affected DB schema freeze  
**Owner:** Data + owning contexts  
**Status:** `CORRECTION_REQUIRED`

C2.14 requires explicit classification of persisted data as:

```text
SOURCE FACT
MUTABLE CURRENT STATE
IMMUTABLE SNAPSHOT
DERIVED PROJECTION
```

C5.01 contains useful but implementation-ambiguous combinations such as:

```text
Community Defaults / Settings Version
→ CURRENT_STATE + versioned source

RegistrationEntry
→ CURRENT_STATE + historical intent record

TeamFormationRequest
→ SOURCE/CURRENT request metadata
```

### Interpretation

This may mean one conceptual entity has:

```text
current table + append history
```

which is valid.

But if implemented as one mutable row claimed simultaneously to be source history and current state, the Data rule becomes ambiguous.

### Required correction

Before physical schema freeze, each affected concept must say whether it is:

```text
one CURRENT_STATE row
+
separate SOURCE/AUDIT revisions
```

or another explicit model.

C7 does not choose the table decomposition.

---

## C7-F-017 — C5 naming review trigger did not close `HYP-STAT-001`

**Class:** `STATUS_DRIFT`  
**Priority:** `AP1`  
**Owner:** Statistics + Architecture Governance  
**Status:** `CORRECTION_REQUIRED`

`HYP-STAT-001` says the entity-name review trigger is the C5 Entity Catalog/domain-language review.

C5 has now occurred and uses a concrete name, but the hypothesis remains unvalidated.

This is either:

```text
an intentionally unresolved hypothesis
```

or:

```text
a missed lifecycle transition
```

The registry must say which.

---

## C7-F-018 — Authority Ledger is defined but not yet materialized for live execution

**Class:** `IMPLEMENTATION_READINESS_GAP`  
**Priority:** `AP1` before first authority cutover  
**Owner:** Migration + Operations + Observability  
**Status:** `CORRECTION_REQUIRED BEFORE CUTOVER`

C6 defines an Authority Ledger containing:

```text
cohort selector
legacy writer/read enabled?
target writer/read enabled?
canonical authority
cutover release/time
rollback policy
contract gate
```

and permits it initially to be documentation/config/telemetry.

No concrete live ledger artifact is yet part of the repository because implementation has not begun.

### Required correction

Before the first `CUTOVER_ACTIVE` slice, choose the operational representation and ensure it is testable/queryable by release/migration operations.

This is not a target-design contradiction; it is a C6 execution prerequisite.

---

# 3. AP2/AP3 — Consistency and hygiene findings

## C7-F-019 — Markdown/reference integrity is not yet an executable architecture fitness function

**Class:** `REFERENCE_BREAK / GOVERNANCE_GAP`  
**Priority:** `AP2`  
**Owner:** Architecture Governance + QA  
**Status:** `CORRECTION_REQUIRED`

Known broken links in N2.10/N2.11 were found manually.

The corpus now contains:

```text
23 N2 docs
216 ADR identities
1,152 local invariant IDs
GINV records
OPEN records
HYP records
C5 references
C6 slice/gate references
```

Manual reference checking will not scale reliably.

### Required evidence

Add a CI fitness check for at least:

```text
relative Markdown links
ADR-* target existence
GINV-* target existence
OPEN-* target existence
HYP-* target existence
canonical file path existence
```

---

## C7-F-020 — Legacy operational role vocabulary can be mistaken for target domain roles

**Class:** `NAMING_DRIFT / EXPECTED_TRANSITION`  
**Priority:** `AP2`  
**Owner:** Security + Operations  
**Status:** `EXPECTED_TRANSITION + DOC CLASSIFICATION REQUIRED`

Legacy/current material uses platform/global roles such as:

```text
master
programmer
user
```

while target Community governance uses:

```text
OWNER
ADMIN
MEMBER
```

and operational responsibility uses:

```text
ORGANIZER
```

The two layers can legitimately coexist if platform staff roles remain separate from Community roles.

The problem is documentation ambiguity, not necessarily the existence of global staff roles.

### Required correction

Every retained platform role must be explicitly named/scoped as **platform operational/staff authorization**, never as Community governance inheritance.

---

## C7-F-021 — Legacy documents lack a uniform status banner convention

**Class:** `GOVERNANCE_GAP`  
**Priority:** `AP2`  
**Owner:** Architecture Governance + Operations  
**Status:** `CORRECTION_REQUIRED`

Canonical architecture files consistently carry status headers such as:

```text
DRAFT-CANONICAL / Cx
```

but legacy/current documents such as `domain-model.md` and operational runbooks do not consistently expose:

```text
CURRENT
TRANSITIONAL
HISTORICAL
SUPERSEDED
BREAK-GLASS
```

### Required correction

Adopt a visible document-status convention for non-canonical architecture/operations material.

---

## C7-F-022 — Current schema file location increases source-of-truth ambiguity

**Class:** `GOVERNANCE_GAP`  
**Priority:** `AP2`  
**Owner:** Data + Operations  
**Status:** `CORRECTION_REQUIRED`

A manually maintained `schema.sql` currently lives under:

```text
supabase/migrations/
```

while target architecture says migrations themselves are authoritative and the consolidated schema should be derived/verified.

Even after operational docs are corrected, the location/name can continue implying it is part of the chronological migration authority.

### Required correction

When Data/Operations implement P-036, make generated-vs-authoritative status mechanically obvious by naming/location/tooling.

---

# 4. Expected transition records — NOT canonical contradictions

## C7-X-001 — Generic sync still exists

**Status:** `EXPECTED_TRANSITION`

`syncService.ts` still performs broad merge/remap/reconciliation across domains.

C6 W13 explicitly owns its subtraction entity-by-entity.

No C7 blocker is created solely because the file still exists.

---

## C7-X-002 — Broad localStorage domain persistence still exists

**Status:** `EXPECTED_TRANSITION`

`localStorageRepository.ts` still stores Players, Sessions, Games, Points, Communities, Championships, drafts and other state.

C6 W12 owns migration to IndexedDB/local-authority classes and W13/W14 own retirement.

---

## C7-X-003 — Direct CRUD cloud services still exist

**Status:** `EXPECTED_TRANSITION`

`communityCloudService.ts` still uses `select('*')`, update/upsert and soft delete.

C6 targets this through semantic Application command/query slices.

---

## C7-X-004 — Session/Game/PointEvent legacy schema still exists

**Status:** `EXPECTED_TRANSITION`

Arrays, mutable score, local IDs and Session-level control remain current implementation evidence.

C6 W3/W6/W7/W13/W14 explicitly replace them.

---

# 5. Open by design — NOT audit failures

The following categories remain validly unresolved when represented by C4:

```text
Rating robust estimator
skill rubric / solver objective weights
voting quorum / tie policy
Match offline rollout scope / lease TTL
advanced lineup/rotation
public spectator policy
Competition format/auto-officialization details
Stats detailed taxonomy/sample thresholds
Notification provider choices
Media pixel/byte/retention limits
RPO/RTO/SLO numerical values
partitioning/Redis/broker/read-replica triggers
specific observability/test vendors
```

C7 does not close them.

They become findings only if implementation treats them as permanent defaults without closing the corresponding `OPEN-*`/`HYP-*` record.

---

# 6. Positive audit checks

The following high-risk semantic areas did **not** reveal a material target contradiction in this audit pass:

```text
PASS-001 User ≠ Player ≠ Participant
PASS-002 CommunityMembership ≠ CommunityPlayer
PASS-003 Organizer ≠ governance; Admin ≠ Organizer
PASS-004 Registration FIFO + atomic promotion + online authority
PASS-005 Balancer attribute-only; Overall excluded
PASS-006 hierarchical Community→Global rating architecture
PASS-007 Session ≠ Match ≠ Competition
PASS-008 Fixture ≠ Match ≠ OfficialCompetitionResult
PASS-009 Match epoch + sequence + event/projection + no LWW
PASS-010 factual Statistics ≠ subjective Rating/Overall
PASS-011 missing/not-captured ≠ zero
PASS-012 Realtime transport only + snapshot/gap recovery
PASS-013 Quick local authority + explicit handoff
PASS-014 shared critical state server-authoritative
PASS-015 semantic Commands + server actor + command_id
PASS-016 relational Postgres + source/current/snapshot/projection separation
PASS-017 external provider effects after commit/outbox
PASS-018 account deletion ≠ sports-history deletion
PASS-019 strangler one-authority rule
PASS-020 C6 active-cohort no mid-protocol engine migration
```

These passes mean the **design intent is coherent**, not that production implementation already satisfies it.
