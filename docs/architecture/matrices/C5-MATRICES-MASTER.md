# C5 — Cross-cutting Architecture Matrices Master

> Status: `CANONICAL / C5`
>
> Owner: `Architecture Governance + bounded-context owners`
>
> Parent: [`EAP-MASTER.md`](../EAP-MASTER.md)
>
> Governing sources: [`PRINCIPLES.md`](../PRINCIPLES.md), [`GLOSSARY.md`](../GLOSSARY.md), [`ADR-CATALOG.md`](../adr/ADR-CATALOG.md), [`C4-INDEX.md`](../catalogs/C4-INDEX.md), [`INVARIANT-CATALOG.md`](../catalogs/INVARIANT-CATALOG.md), [`OPEN-DECISIONS.md`](../catalogs/OPEN-DECISIONS.md), [`HYPOTHESES.md`](../catalogs/HYPOTHESES.md).

---

# 0. Purpose

C5 makes the architecture navigable for implementation without replacing its normative sources.

C1 answered:

```text
where does a concern belong?
```

C2 answered:

```text
what is the complete architecture of each context?
```

C3 answered:

```text
what material decisions were accepted and who owns them?
```

C4 answered:

```text
what must remain true, what is still open, and what is only a hypothesis?
```

C5 answers:

```text
HOW DO THOSE THINGS CROSS EACH OTHER?
```

The implementation-oriented question is not only “what does Registration say?” but:

```text
JoinRegistration
├── owner?
├── aggregate?
├── authority?
├── capability?
├── transaction/lock?
├── idempotency?
├── offline policy?
├── realtime consequence?
├── source/snapshot/projection impact?
├── privacy exposure?
├── errors/recovery?
├── observability?
├── migration wave?
├── test evidence?
├── ADR / invariant?
└── unresolved dependencies?
```

C5 provides that traversal.

---

# 1. Non-loss / non-invention rule

The matrices are indexes and cross-sections.

```text
MATRIX ROW
≠
NEW DOMAIN DECISION
```

If a matrix appears to require a fact that C2/C3/C4 did not settle:

```text
DO NOT invent a value
→ mark OPEN-*
→ link owning Open Decision
→ use only the conservative behavior already supported by architecture
```

Similarly:

```text
MATRIX SUMMARY
NEVER OVERRIDES
OWNER N2 DETAIL
```

Authority order remains:

```text
Vocabulary                 → GLOSSARY
High-stability constraint  → PRINCIPLES
Material decision          → ADR-CATALOG
Global invariant identity  → C4 INVARIANT-CATALOG
Full local invariant       → owner N2
Open status                → C4 OPEN-DECISIONS
Hypothesis status          → C4 HYPOTHESES
Cross-context navigation   → C5 matrices
Executable deployed truth  → migrations/contracts/code/tests + telemetry
```

Contradictions are recorded for C7; they are not resolved silently by whichever table is easiest to edit.

---

# 2. C5 artifact set

```text
docs/architecture/matrices/
├── C5-MATRICES-MASTER.md
├── C5.01-ENTITY-DATA-STATE-MATRIX.md
├── C5.02-COMMAND-QUERY-TRANSACTION-MATRIX.md
├── C5.03-CAPABILITY-SECURITY-PRIVACY-MATRIX.md
├── C5.04-OFFLINE-REALTIME-RELIABILITY-MATRIX.md
├── C5.05-PERFORMANCE-OBSERVABILITY-TEST-MATRIX.md
└── C5.06-MIGRATION-DEPRECATION-DEPENDENCY-MATRIX.md
```

## C5.01 — Entity / Data / State

Answers:

- canonical entity owner;
- nature of truth;
- lifecycle/mutability;
- historical snapshot boundaries;
- source→projection relationships;
- major aggregate state machines;
- primary identity/relationship rules.

## C5.02 — Command / Query / Transaction

Answers:

- semantic command/query owner;
- aggregate/lock boundary;
- idempotency/concurrency token;
- capability;
- offline classification;
- authoritative response;
- outbox/realtime consequences;
- errors/recovery behavior.

## C5.03 — Capability / Security / Privacy

Answers:

- actor/capability matrix;
- explicit non-authorities;
- RLS/RPC/Storage/Realtime enforcement path;
- data visibility/classification;
- public/private DTO boundaries;
- step-up/MFA candidates;
- privacy/retention ownership.

## C5.04 — Offline / Realtime / Reliability

Answers:

- operation-level offline authority;
- local durability class;
- realtime topic/checkpoint/payload/recovery;
- dependency degradation;
- source recovery/rebuild strategy;
- unknown outcomes and retry classes.

## C5.05 — Performance / Observability / Test Evidence

Answers:

- hot-path bounded-work expectation;
- performance trigger rather than invented budget;
- required operational signals;
- invariant/evidence classes;
- release/test gates for critical paths.

## C5.06 — Migration / Deprecation / Dependency

Answers:

- current legacy representation;
- target replacement;
- migration wave;
- cutover unit and authority transfer;
- compatibility path;
- removal evidence;
- dependency ordering between target capabilities.

---

# 3. Shared matrix vocabulary

## 3.1 Owner

The owner is the bounded context or platform concern that controls semantic change.

```text
Identity
Community
Session
Registration
Team Formation
Match
Competition
Statistics
Notifications
Media
Offline
Realtime
Data
Application
Security
Reliability
Performance
Observability
QA
Operations
Migration
Governance
```

Owner does not necessarily mean physical database schema/module location.

## 3.2 Truth class

C5 uses the N2.14 classification:

```text
SOURCE_FACT
= durable fact that happened / accepted source input

CURRENT_STATE
= authoritative mutable current state

IMMUTABLE_SNAPSHOT
= frozen context/input/revision for history/reproducibility

DERIVED_PROJECTION
= rebuildable/read-optimized result

INFRA_OPERATIONAL
= command receipt/outbox/lease/checkpoint/delivery-attempt/etc.

EPHEMERAL
= presence/socket/cache/process-local observation
```

An entity may contain multiple conceptual components, but each persisted table/record should have one dominant classification or explicitly separated records.

## 3.3 Authority class

```text
SERVER
LOCAL_DEVICE
HANDOFF
DERIVED
PROVIDER
NONE/EPHEMERAL
```

`PROVIDER` means an external provider may authoritatively report its own delivery/processing status, never that it owns sports-domain truth.

## 3.4 Offline class

From N2.12:

```text
ONLINE_AUTHORITATIVE
OFFLINE_OWNED
CACHED_READ
LOCAL_DRAFT
CONDITIONALLY_OFFLINE_COMMAND
LOCAL_COMPUTATION
NOT_APPLICABLE
```

## 3.5 Realtime mode

```text
NONE
INVALIDATE_REFETCH
REVISION_EVENT
SEQUENCE_EVENT
USER_INBOX_ACCELERATION
EPHEMERAL_PRESENCE
```

Realtime never creates a source fact by itself.

## 3.6 Concurrency token

```text
NONE
REVISION
EXPECTED_REVISION
QUEUE_SEQUENCE
EXPECTED_LAST_SEQUENCE
CONTROL_EPOCH
UNIQUE_CONSTRAINT
ROW_LOCK
COMMAND_ID
PROVIDER_IDEMPOTENCY
```

Multiple may apply.

## 3.7 Security exposure

```text
PUBLIC_EXPLICIT
AUTHENTICATED
CONTEXTUAL
RECIPIENT_ONLY
PRIVILEGED
INTERNAL_ONLY
PRIVATE_BLOB
EPHEMERAL_CHANNEL
```

Default is not public merely because a global UUID exists.

## 3.8 Evidence class

C5 reuses C4 vocabulary:

```text
TYPE
DOMAIN
DB
RLS
CONCURRENCY
CONTRACT
E2E
PROPERTY
INTEGRITY
OBS
FAILURE
RESTORE
MIGRATION
SECURITY
REVIEW
```

---

# 4. Canonical bounded-context dependency spine

The architecture is not a strict linear pipeline, but several dependencies are foundational.

```text
Identity
  ↓
Community / capabilities
  ↓
Session
  ↓
Registration
  ↓
RosterRevision
  ↓
Rating / Skill Profile snapshots
  ↓
Team Formation / Voting / Confirmed TeamDraw
  ↓
Match preparation / MatchRoster
  ↓
Live Match
  ↓
MatchResult
  ├── Statistics
  └── Competition OfficialResult
          ↓
       Standings / qualification
```

Cross-cutting services wrap rather than own those facts:

```text
Data / Application / Security
Offline / Realtime
Reliability / Performance / Observability / QA / Operations
Migration / Governance
```

Notifications and Media are side bounded contexts with explicit references:

```text
Domain committed fact → outbox → Notification
Domain entity → MediaAsset attachment
```

---

# 5. Source / snapshot / projection spine

The most important truth chains used across matrices are:

```text
PlayerEvaluation revisions
→ CommunityPlayerSkillProfile
→ GlobalPlayerSkillProfile
→ Derived Overall (display only)
→ PlayerBalanceSnapshot
→ TeamFormation CandidateSet / TeamDraw
```

```text
RegistrationEntry current/order
→ RegistrationWindow revision
→ RosterRevision snapshot
→ TeamFormation snapshot
→ Confirmed TeamDraw
→ MatchRoster snapshot
```

```text
MatchEvent source log
→ MatchProjection synchronous current projection
→ MatchResult
→ PlayerMatchStatContribution
→ Career / scoped Stats projections
```

```text
MatchResult
→ OfficialCompetitionResult
→ StandingsProjection
→ Qualification / future Fixture slot resolution
```

```text
Committed domain mutation
→ domain_outbox
→ NotificationIntent
→ Delivery / DeliveryAttempt
```

No projection arrow may be reversed as an ordinary mutation path.

---

# 6. Matrix conflict rule

When C5 exposes a conflict, classify it:

```text
M5-CONFLICT-SEMANTIC
entity/command/state meaning differs

M5-CONFLICT-AUTHORITY
two paths appear able to mutate the same aggregate

M5-CONFLICT-SECURITY
capability/visibility/enforcement mismatch

M5-CONFLICT-OFFLINE
offline behavior contradicts authority semantics

M5-CONFLICT-ORDERING
revision/sequence/FIFO/clock mismatch

M5-CONFLICT-HISTORY
mutable current state could rewrite historical fact/snapshot

M5-CONFLICT-MIGRATION
legacy adapter/write path survives after target cutover

M5-CONFLICT-EVIDENCE
I0/I1 invariant or Q0/Q1 QA-risk family has no adequate executable evidence
```

Do not resolve the conflict inside a matrix cell. Register it for C7 and fix the owning normative source/ADR.

---

# 7. Open Decision / Hypothesis rendering

A row with unresolved behavior must use explicit references.

Example:

```text
Match offline Community rollout
Authority: conditional
Offline: CONDITIONALLY_OFFLINE_COMMAND
Open: OPEN-MATCH-001
Hypothesis: HYP-PX-001
```

The row must not say:

```text
"offline enabled"
```

until the Open Decision closes.

Similarly:

```text
Team objective formula
Open: OPEN-BAL-002 / OPEN-BAL-003
Hypothesis: HYP-BAL-005
```

The solver architecture is accepted, while the exact objective remains unresolved.

---

# 8. C5 implementation-readiness labels

For C6/C7 handoff, matrix rows may be labeled:

```text
READY_TARGET
= architectural boundary sufficiently closed for implementation planning

READY_WITH_OPEN_PARAMETER
= structure is closed; a parameter/policy can remain OPEN until the feature that needs it

BLOCKED_BY_OPEN
= implementing the feature would force an unresolved material decision

MIGRATION_ONLY
= target is clear; primary remaining work is legacy transition

EVIDENCE_REQUIRED
= architecture accepted but rollout depends on prototype/load/security/restore evidence
```

These labels do not indicate code completion.

---

# 9. High-risk cross-context guardrails

Any implementation review should be able to locate the following directly in C5:

1. `Organizer ≠ Admin/Governance`.
2. `Registration WAITLISTED ≠ SessionParticipant`.
3. FIFO uses authoritative monotonic queue sequence.
4. Leave + promotion is one transaction.
5. Team Formation never consumes Overall.
6. Missing attribute/stat detail never silently becomes zero.
7. `Fixture ≠ Match`.
8. Match control is per Match with lease + epoch.
9. Match ordering is sequence, never `updated_at`.
10. Match score is server/rules derived from commands/events.
11. Realtime is committed transport only.
12. Quick local authority handoff is explicit and one-way.
13. shared governance/Registration/Voting never uses generic offline queue.
14. account deletion never cascades sports history.
15. raw media is private/untrusted until processing.
16. external provider failure never rolls back domain truth.
17. command retry after unknown outcome reuses `command_id`.
18. projection is never directly mutated as source truth.
19. active execution cohort never changes protocol mid-flight.
20. new target capabilities never expand legacy generic sync/CRUD.

These are not the complete invariant catalog; they are the cross-cutting implementation tripwires.

---

# 10. C5 completeness contract

C5 is complete when:

- [x] matrix vocabulary is stable and references C2/C3/C4 rather than replacing them;
- [x] entity/data/state relationships can be navigated cross-context;
- [x] critical commands expose transaction/concurrency/authority semantics;
- [x] query/read boundaries expose purpose and visibility;
- [x] capability/security/privacy boundaries are explicit;
- [x] offline and Realtime behavior are operation-specific;
- [x] reliability/rebuild/degradation semantics are cross-linked;
- [x] performance/observability/testing evidence is mapped to critical paths;
- [x] legacy→target migration and deprecation dependencies are mapped;
- [x] Open Decisions/Hypotheses appear explicitly where they constrain a row;
- [x] no new unowned domain decision is introduced merely to make a table look complete.

---

# 11. Handoff

## C6

C6 consumes C5 to build the executable Current→Target program:

```text
matrix row
→ implementation slice
→ dependency
→ migration cohort
→ database/API/client changes
→ evidence gate
→ cutover
→ removal
```

## C7

C7 audits:

- contradictions across matrices;
- matrix↔ADR/N2 mismatch;
- missing owner/source;
- stale Open/Hypothesis portrayed as accepted behavior;
- unsupported legacy writers;
- I0/I1 invariant-evidence gaps or under-tested Q0/Q1 QA-risk families;
- cross-context circular dependency;
- incorrect public/offline/realtime exposure;
- missing deprecation/removal gate.

C5 therefore sits between architecture definition and migration execution: it is the **cross-context implementation map**, not a second architecture source of truth.
