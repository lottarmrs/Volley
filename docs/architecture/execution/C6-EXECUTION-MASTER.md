# C6 — Current → Target Execution Program Master

> Status: `DRAFT-CANONICAL / C6`
>
> Owner: `Migration + Architecture Governance + bounded-context owners`
>
> Parent: [`EAP-MASTER.md`](../EAP-MASTER.md)
>
> Governing sources: [`C5.06-MIGRATION-DEPRECATION-DEPENDENCY-MATRIX.md`](../matrices/C5.06-MIGRATION-DEPRECATION-DEPENDENCY-MATRIX.md), [`N2.22-migration-strangler.md`](../migration/N2.22-migration-strangler.md), [`N2.21-operations-deploy.md`](../operations/N2.21-operations-deploy.md), [`ADR-CATALOG.md`](../adr/ADR-CATALOG.md), C4 catalogs and all owner N2 chapters.

---

# 0. Purpose

C1–C5 define the target architecture, decisions, invariants and cross-cutting contracts.

C6 defines **how the repository that exists today reaches that target without losing authority, history or operability**.

The unit of completion is not:

```text
new table exists
new service exists
new screen exists
legacy code still works
```

The unit of completion is:

```text
A BOUNDED CAPABILITY HAS

1. target model deployed;
2. target command/query path deployed;
3. one explicit authority for each migrated aggregate;
4. compatibility path bounded and one-way where required;
5. semantic verification passed;
6. telemetry proves target use;
7. rollback/forward-fix path known;
8. legacy writer disabled for the migrated cohort;
9. removal criteria recorded.
```

Therefore:

```text
C6
=
AUTHORITY TRANSFER PROGRAM
```

not merely a refactor backlog.

---

# 1. Non-loss / non-invention rule

C6 does not reopen accepted architecture for implementation convenience.

```text
IMPLEMENTATION DIFFICULTY
≠
PERMISSION TO WEAKEN INVARIANT
```

If a slice encounters an unresolved architecture question:

```text
lookup OPEN-* / HYP-*
→ use the documented conservative behavior
→ close the Open Decision through governance if required
→ do not invent a permanent default in code
```

C6 also does not claim exact schedules, effort estimates, RPO/RTO values, load thresholds or provider choices where C4 keeps them OPEN.

---

# 2. Current repository anchors

The current implementation has several strong assets that C6 preserves:

```text
src/application/
→ use cases, gateways/view models, AppResult foundation

src/logic/
→ substantial pure domain logic and tests, including Team Balancer

supabase/migrations/
→ versioned migration chain

src/infra/supabase/
→ provider adapters and current Supabase integration knowledge

.github/workflows/ci.yml
→ typecheck/lint/format/test/build baseline
```

But several current mechanisms are explicit strangler targets:

```text
src/infra/supabase/syncService.ts
→ broad LocalSyncPayload + merge/remap/timestamp reconciliation

src/infra/supabase/operationalCloudService.ts
→ Session/Team/Game/PointEvent/report/presence/draft generic operational sync

src/infra/supabase/communityCloudService.ts
→ direct select('*') / upsert / generic softDelete

src/storage/localStorageRepository.ts
→ broad domain collections serialized into localStorage

legacy schema fields
→ local_id / sync_status semantics / deleted_at generic lifecycle / ID arrays / mutable Game score
```

C6 treats these as **current implementation evidence**, not target abstractions to preserve indefinitely.

---

# 3. Execution artifact set

```text
docs/architecture/execution/
├── C6-EXECUTION-MASTER.md
├── C6.01-W0-W2-FOUNDATIONS-COMMUNITY.md
├── C6.02-W3-W6-SESSION-REGISTRATION-RATING-TEAM.md
├── C6.03-W7-MATCH-REALTIME-OFFLINE.md
├── C6.04-W8-W11-COMP-STATS-NOTIF-MEDIA.md
├── C6.05-W12-W14-QUICK-SYNC-RETIREMENT.md
└── C6.06-RELEASE-GATES-TRACEABILITY.md
```

Each execution pack is normative for **sequence and gates**, while the owner N2 remains normative for domain semantics.

---

# 4. Execution Slice model

Every implementation slice receives an ID:

```text
XS-<WAVE>-<NUMBER>
```

Example:

```text
XS-W4-03  JoinRegistration authoritative transaction
```

A slice record contains:

```text
ID
Owner
Goal
Prerequisites
Current paths touched
Target artifacts
Schema expand
Application/API
Client/read changes
Compatibility behavior
Authority before
Authority after
Backfill/import
Feature/cohort switch
Required evidence
Telemetry
Failure/rollback/forward-fix
Open Decisions
Exit gate
Legacy removal implication
```

A PR may implement part of one slice, but a slice is not `CUTOVER_COMPLETE` until all exit gates pass.

---

# 5. Slice lifecycle

```text
PLANNED
→ EXPANDED
→ SHADOWING
→ CUTOVER_READY
→ CUTOVER_ACTIVE
→ VERIFIED
→ LEGACY_WRITE_DISABLED
→ LEGACY_READ_DISABLED
→ CONTRACT_ELIGIBLE
→ CONTRACTED
```

Optional states:

```text
BLOCKED_OPEN_DECISION
BLOCKED_DATA_ANOMALY
BLOCKED_RELIABILITY_EVIDENCE
PAUSED
ROLLED_FORWARD
ABORTED_BEFORE_CUTOVER
```

## 5.1 Important distinction

After `CUTOVER_ACTIVE` for an aggregate/cohort:

```text
frontend rollback
or
feature flag disable
```

may stop new exposure, but **does not automatically restore legacy authority**.

A migrated aggregate returns to legacy authority only through an explicit reverse-migration/recovery protocol, which is not the default.

---

# 6. Program waves

| Wave | Target | Initial cutover unit | Primary execution pack |
|---|---|---|---|
| W0 | Safety / Inventory / foundations | environment/process/repository | C6.01 |
| W1 | Pure domain corrections | algorithm/code path | C6.01 |
| W2 | Identity / Community / authorization | new/eligible Communities and identity links | C6.01 |
| W3 | Session normalized backbone | new Sessions first | C6.02 |
| W4 | Registration / RosterRevision | new/upcoming explicitly transitioned Session | C6.02 |
| W5 | Rating hierarchy | Player+Community evaluation cohort | C6.02 |
| W6 | Team Formation / Voting | target RosterRevision / CandidateSet | C6.02 |
| W7 | Match V2 + Realtime + required offline protocol | **new Match only initially** | C6.03 |
| W8 | Competition | new Competition edition / explicit import | C6.04 |
| W9 | Statistics / History | target Match contributions / player read cohort | C6.04 |
| W10 | Notifications | selected source-domain event families | C6.04 |
| W11 | Media | new upload flow, then legacy asset inventory | C6.04 |
| W12 | Quick / IndexedDB | local device/account dataset | C6.05 |
| W13 | Generic sync retirement | entity/service subtraction | C6.05 |
| W14 | Contract / legacy removal | old fields/services/docs/tests | C6.05 |

The wave number is dependency guidance, not a prohibition on parallel preparatory work.

Example:

```text
W10 notification tables/worker skeleton
may be prepared before W8

but

NotificationIntent for Registration promotion
cannot become authoritative before W4 source event/outbox exists.
```

---

# 7. Program-level prerequisites

The following foundations can be built early and reused by later waves.

## 7.1 Real DB integration harness

Required before high-risk authority cutovers:

```text
fresh migration chain
RLS/RPC tests
transaction rollback tests
concurrency races
SECURITY DEFINER tests
representative migration/backfill fixtures
```

The current CI runs typecheck, ESLint, format, `npm test` and build; C6 adds the DB integration gate rather than pretending current unit/UI tests prove PostgreSQL concurrency/RLS.

## 7.2 Command infrastructure

Target shared commands need a common minimal contract:

```text
command_id
request_id transport correlation
server-derived actor
runtime-validated payload
expected revision/sequence/epoch where relevant
stable domain result/error
```

`command_receipts` may be introduced incrementally but must preserve same-logical-command retry semantics for critical commands.

## 7.3 Capability resolver

Before target Community/Session/Match commands depend on it:

```text
JWT/User
→ authoritative resource context
→ active Membership/assignment/lease
→ contextual capability
→ allow/deny
```

No legacy role string from client payload can be an authorization shortcut.

## 7.4 Migration provenance

C6 requires migration provenance before ambiguous historical normalization becomes large-scale.

Minimum concepts:

```text
migration_run
migration_entity_map
migration_anomaly
source hash / source identity
mapping kind
confidence / review status
```

## 7.5 Observability and release identity

Every cutover-capable remote command/read path should expose enough signal to know:

```text
legacy path used?
target path used?
cohort?
release?
outcome/error family?
revision/sequence conflict?
```

without placing user/resource UUIDs into high-cardinality metric labels.

---

# 8. Authority ledger

C6 introduces an explicit conceptual **Authority Ledger**.

For each capability/aggregate family record:

```text
scope / cohort selector
legacy writer enabled?
target writer enabled?
legacy reader enabled?
target reader enabled?
canonical authority
cutover timestamp/release
rollback policy
contract gate
```

Example:

```text
Match protocol = V2
created_at >= rollout boundary

legacy writer: NO
target writer: YES
legacy reader: compatibility only
target reader: YES
authority: MATCH_V2
```

The ledger may initially be documentation/config/telemetry rather than a database table, but the **fact of authority must be explicit and testable**.

---

# 9. Cohort strategy

Preferred cohort order:

```text
1. new resources only
2. explicitly eligible inactive/draft resources
3. completed historical import
4. ambiguous legacy resources after review
```

Avoid:

```text
active execution in-place protocol migration
```

especially for:

```text
active Session
active Game/Match
open voting with incompatible candidate identity
ongoing Competition dependency chain without explicit compatibility plan
```

---

# 10. Compatibility patterns allowed

## 10.1 One-way read adapter

Allowed:

```text
target source
→ legacy-shaped DTO/view
→ old screen
```

because authority remains target.

## 10.2 Legacy reader over target compatibility view

Allowed temporarily when removal trigger is explicit.

## 10.3 Shadow computation

Allowed:

```text
legacy remains authority
+ target computes in shadow
+ parity/invariant comparison
```

No target side effect may escape while shadow-only.

## 10.4 Dual write

Avoid by default.

If unavoidable during a narrow schema transition:

- one semantic command owns both writes;
- writes are atomic when same DB boundary permits;
- one representation is designated canonical;
- drift is measured;
- end date/removal gate exists.

## 10.5 Forbidden compatibility

```text
legacy mutation
+
target mutation
+
merge later by updated_at
```

That recreates the architecture being retired.

---

# 11. Backfill classes

Every backfill is classified:

```text
IDENTITY_PRESERVING
SPLIT
MERGE
DERIVED_REBUILD
LEGACY_EVIDENCE_IMPORT
AMBIGUITY_QUARANTINE
```

Backfills are:

- idempotent;
- restartable/checkpointed when large;
- source-preserving until verified;
- semantically verified;
- observable;
- incapable of inventing missing domain history.

Examples of forbidden fabrication:

```text
selected_player_ids[] → invented FIFO chronology
finished score → invented PointEvents
three old divisions → invented ballots
rating overall → invented factual stats
legacy role title → invented privileged capability
```

---

# 12. Verification model

A slice needs multiple forms of proof.

## 12.1 Structural

```text
schema constraints
FKs/delete semantics
RLS/grants
runtime DTO schemas
import boundaries
```

## 12.2 Semantic

```text
invariant tests
property tests
concurrency tests
replay/rebuild parity
migration provenance/anomaly counts
```

## 12.3 Operational

```text
legacy vs target traffic telemetry
error/conflict rates
queue/backlog age
projection integrity
cutover cohort counts
old-client usage
```

## 12.4 User journey

Thin E2E for critical paths after lower-level proof.

---

# 13. Rollback / forward-fix taxonomy

## Before authority cutover

Safe to disable/rollback target feature normally if no target authoritative writes escaped.

## After authority cutover

Preferred responses:

```text
1. disable new cohort enrollment
2. preserve target authority for already-cut-over aggregates
3. roll frontend/server code to compatible version
4. forward-fix schema/command implementation
5. use semantic repair/reconciliation if facts affected
```

Do not perform automatic destructive down migration.

## Unknown command outcome

```text
retry SAME command_id
```

not a new logical command.

---

# 14. Branch / PR strategy

C6 does not require one giant implementation branch.

Preferred:

```text
small reviewable PRs
+ additive migrations
+ explicit slice ID in PR description
+ evidence links
+ compatibility maintained until cutover gate
```

Suggested PR metadata:

```text
Execution Slice: XS-Wx-yy
Authority change: NONE | PREPARES | CUTS_OVER | RETIRES
Schema phase: NONE | EXPAND | BACKFILL | CONTRACT
Open Decisions touched:
GINV/Q0/Q1 protected:
Tests added:
Telemetry added:
Rollback/forward-fix:
Legacy removal impact:
```

---

# 15. Program kill criteria

A rollout is paused when any of these occur:

```text
Q0/I0 invariant violation
sports source-fact corruption
cross-Community authorization leak
registration capacity/FIFO violation
Match sequence/epoch integrity failure
irrecoverable local-data loss
migration mapping ambiguity above accepted/manual-review policy
projection divergence without understood repair
unexpected second authority detected
```

Performance degradation alone can pause rollout, but never justifies bypassing correctness/security to continue.

---

# 16. Program success metrics — qualitative baseline

Before numeric budgets exist, C6 can still verify direction:

```text
number of target aggregates still entering generic sync decreases
number of localStorage domain keys decreases
number of generic cloud CRUD writers decreases
number of target semantic commands increases
number of Q0/Q1 invariants with executable evidence increases
number of legacy fields with active readers/writers decreases
old-client/cohort legacy traffic trends to zero before contract
migration anomaly queue is owned and bounded
```

C4/C5 keep quantitative thresholds OPEN where baseline is not yet available.

---

# 17. C6 execution packs

## Pack 1 — C6.01 W0–W2

Focus:

```text
safety/inventory
DB harness
security hardening
command/capability foundations
Overall removal from solver path
Identity/Player link foundations
Community Membership/Organizer split
```

## Pack 2 — C6.02 W3–W6

Focus:

```text
Session normalization
Registration/RosterRevision
Rating hierarchy
PlayerBalanceSnapshot
TeamCandidateSet/TeamDraw
Voting
```

## Pack 3 — C6.03 W7

Focus:

```text
Match V2
MatchControlLease / epoch
MatchEvent / sequence
MatchProjection
Realtime convergence
typed offline outbox/reconciliation
```

## Pack 4 — C6.04 W8–W11

Focus:

```text
Competition normalization/officialization
Statistics projections
Notifications/outbox/inbox
MediaAsset/private processing
```

## Pack 5 — C6.05 W12–W14

Focus:

```text
IndexedDB
Quick authority handoff
localStorage importer
syncService subtraction
legacy schema/service removal
```

## Pack 6 — C6.06 Release Gates / Traceability

Focus:

```text
evidence gates
authority/cutover checklist
Open Decision blocking map
migration/release order
contract/removal proof
C7 preflight
```

---

# 18. C6 invariants

```text
C6-INV-001  Every migrated mutable aggregate has one effective authority.
C6-INV-002  A compatibility adapter never becomes a second writer unless explicitly modeled and bounded.
C6-INV-003  Active Match is not protocol-migrated in place during initial V2 rollout.
C6-INV-004  Active Session is not silently moved between incompatible authority models.
C6-INV-005  Legacy data ambiguity is recorded, not guessed away.
C6-INV-006  Backfill never fabricates domain history that source data cannot support.
C6-INV-007  Same logical command retry preserves command_id.
C6-INV-008  Q0/I0 authority/security/fairness cutovers require executable owner-layer evidence.
C6-INV-009  Feature flag is not authorization and does not reverse already-transferred authority.
C6-INV-010  Contract/destructive removal waits for legacy writer/reader/old-client evidence.
C6-INV-011  Generic sync loses entities by subtraction; no second universal sync framework is introduced.
C6-INV-012  localStorage retirement is key/category based; irreplaceable local data is preserved until verified import.
C6-INV-013  Target shared commands derive actor/context server-side.
C6-INV-014  External providers never become part of critical source-domain commit.
C6-INV-015  Migration chain remains schema authority throughout C6.
C6-INV-016  Historical source/snapshot/projection distinctions survive migration.
C6-INV-017  No Overall value can re-enter canonical Team Formation through compatibility adapters.
C6-INV-018  Registration migration never invents FIFO from timestamps/presence/selected roster.
C6-INV-019  Match historical import never fabricates PointEvents from final score.
C6-INV-020  C6 completion does not imply production rollout until operational release gates pass.
```

---

# 19. Handoff to C7

C6 is architecturally complete when the execution packs define:

- concrete repository touchpoints;
- dependency order;
- target schema/application/client surfaces;
- authority cutover units;
- compatibility paths;
- migration/backfill behavior;
- evidence and telemetry gates;
- rollback/forward-fix semantics;
- legacy removal proof.

C7 then audits the **entire corpus** for contradiction/completeness before these plans are treated as final architecture baseline.

C7 may find defects in C1–C6. It does not silently patch them: findings must point to owner artifacts and required corrections.