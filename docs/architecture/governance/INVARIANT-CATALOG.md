# Canonical Invariant Catalog — Volley

> Status: `DRAFT-CANONICAL / C4`
>
> Owner: `Architecture + bounded-context owners`
>
> Parent: [`C4-REGISTRY-MASTER.md`](C4-REGISTRY-MASTER.md)
>
> Decision registry: [`ADR-CATALOG.md`](../adr/ADR-CATALOG.md)
>
> Normative local definitions: C2.01–C2.23 owner chapters.

---

# 0. Reading rule

This catalog does **not** replace the 1,152 local invariant definitions.

It answers:

```text
Which rules are globally cross-cutting?
Who owns their meaning?
How critical are they?
Which local invariants instantiate them?
Which ADRs protect them?
What evidence must prove them?
```

The exact local wording and N10 scenarios remain in the owner N2 chapter.

---

# 1. Global invariant record format

Each record contains:

```text
ID
Statement
Criticality
Canonical owner
Related ADRs
Local manifestations
Required evidence
```

`Local manifestations` are not exhaustive quotations. They are trace links to the owner rules whose full definitions remain canonical in C2.

---

# 2. Authority / identity invariants

## GINV-001 — One current authority per mutable aggregate

**Statement:** A mutable aggregate cannot have two independent current authorities. Cache, draft, Realtime delivery, compatibility adapters and legacy representations do not become parallel truth.

**Criticality:** Q0  
**Owner:** Migration / Offline  
**ADRs:** `ADR-MIG-001`, `ADR-OFF-001`, `ADR-DATA-001`  
**Local manifestations:** `PX-INV-002`, `OFFLINE-INV-002..004`, `MIG-INV-*` authority/cutover rules, `DATA-INV-*` source authority rules.  
**Evidence:** `MIG + DB + OFF + QA`.

## GINV-002 — Shared mutable state is server-authoritative unless explicitly excepted

**Statement:** Community governance, Registration, Voting, shared confirmations, Competition administration and analogous shared state commit on the trusted server/database boundary.

**Criticality:** Q0  
**Owner:** Offline / Data  
**ADRs:** `ADR-OFF-002`, `ADR-DATA-001`  
**Local manifestations:** `PX-INV-002`, `COM-INV-019..020`, `SES-INV-009`, `REG-INV-003`, `OFFLINE-INV-004..010`.  
**Evidence:** `DB + RLS + OFF + E2E`.

## GINV-003 — User, Player and Participant remain distinct

**Statement:** Authentication identity, persistent sports identity and event participation are separate concepts and lifecycles.

**Criticality:** Q1  
**Owner:** Identity / Player  
**ADR:** `ADR-ID-001`  
**Local manifestations:** `ID-INV-001..004`, `PX` identity rules, `SES-INV-015`, `STAT` Guest/history rules.  
**Evidence:** `TYPE + DB + MIG + E2E`.

## GINV-004 — CommunityMembership and CommunityPlayer remain independent

**Statement:** Account access/governance never collapses into sports-roster membership.

**Criticality:** Q1  
**Owner:** Community  
**ADRs:** `ADR-ID-005`, `ADR-COM-001`  
**Local manifestations:** `ID-INV-006..008`, `COM-INV-001`, migration rules for `community_players.role`.  
**Evidence:** `DB + RLS + MIG`.

## GINV-005 — Guest participation does not auto-create persistent Player identity

**Criticality:** Q1  
**Owner:** Identity / Player  
**ADR:** `ADR-ID-003`  
**Local manifestations:** `ID-INV-004`, `SES-INV-015`, Stats Guest invariants.  
**Evidence:** `UNIT + DB + E2E + MIG`.

## GINV-006 — Final target identity uses stable UUIDs; local/cloud dual IDs are not domain identity

**Criticality:** Q1  
**Owner:** Data  
**ADRs:** `ADR-DATA-003`, `ADR-OFF-003`  
**Local manifestations:** `ID-INV-022`, `SES-INV-030`, `OFFLINE-INV-017`, target mapping across contexts.  
**Evidence:** `TYPE + DB + MIG`.

---

# 3. Authorization / capability invariants

## GINV-007 — Authentication never implies authorization

**Criticality:** Q0  
**Owner:** Security  
**ADRs:** `ADR-SEC-001`, `ADR-SEC-002`  
**Local manifestations:** `SEC-INV-001..006`, `API-INV-021`, Community/Match/Competition BOLA rules.  
**Evidence:** `RLS + SEC + E2E`.

## GINV-008 — Resource context is resolved from authoritative resource identity

**Statement:** A client-provided `community_id`, role, owner, actor or capability can never redefine the actual resource context.

**Criticality:** Q0  
**Owner:** Security / Application  
**ADRs:** `ADR-SEC-002`, `ADR-API-003`  
**Local manifestations:** `SEC-INV-003..006`, `API-INV-021`, `COM-INV-021..022`, `REG-INV-037`, `MATCH-INV-040`.  
**Evidence:** `RLS + SEC + mass-assignment tests`.

## GINV-009 — Organizer is operational, not governance

**Criticality:** Q0/Q1  
**Owner:** Community  
**ADR:** `ADR-COM-003`  
**Local manifestations:** `PX-INV-003`, `COM-INV-003..006`, `COM-INV-023..025`, `SEC-INV-007..009`, `API-INV-022`.  
**Evidence:** `RLS + capability matrix + negative tests`.

## GINV-010 — MatchController is contextual and does not follow automatically from Organizer/Admin

**Criticality:** Q0  
**Owner:** Match  
**ADRs:** `ADR-MATCH-003`, `ADR-MATCH-004`  
**Local manifestations:** `SES-INV-023`, `MATCH-INV-004..010`, Security capability matrix.  
**Evidence:** `RLS + CONC + MATCH integration`.

## GINV-011 — Competition administration is distinct from Session/Match operational responsibility

**Criticality:** Q0/Q1  
**Owner:** Competition  
**ADR:** `ADR-COMP-002`  
**Local manifestations:** `COM-INV-025`, `COMP-INV-017..018`, Security matrix.  
**Evidence:** `RLS + SEC`.

## GINV-012 — Critical browser writes are semantic commands, not generic table administration

**Criticality:** Q0  
**Owner:** Application / Security  
**ADRs:** `ADR-API-001`, `ADR-SEC-004`  
**Local manifestations:** `API-INV-001..005`, `API-INV-046`, `SEC-INV-011`, `MATCH-INV-039`, Registration direct-write prohibitions.  
**Evidence:** `RLS + RPC integration + contract tests`.

---

# 4. Registration / roster fairness invariants

## GINV-013 — RegistrationEntry is not SessionParticipant

**Criticality:** Q1  
**Owner:** Registration  
**ADR:** `ADR-REG-001`  
**Local manifestations:** `REG-INV-001..002`, `SES-INV-014`.  
**Evidence:** `DB + E2E`.

## GINV-014 — Confirmed capacity never exceeds RegistrationWindow capacity

**Criticality:** Q0  
**Owner:** Registration  
**ADR:** `ADR-REG-003`  
**Local manifestations:** `REG-INV-006`, N10 last-slot/mass-join scenarios.  
**Evidence:** `DB + CONC + LOAD + OBS`.

## GINV-015 — Waitlist order is authoritative FIFO by monotonic sequence, never timestamps

**Criticality:** Q0  
**Owner:** Registration  
**ADRs:** `ADR-REG-003`, `ADR-DATA-004`  
**Local manifestations:** `REG-INV-007..009`, `REG-INV-015..016`, `REL-INV-031`, Offline server-ordering rules.  
**Evidence:** `DB + CONC + property tests`.

## GINV-016 — Leave of a confirmed entry and eligible promotion are atomic before lock

**Criticality:** Q0  
**Owner:** Registration  
**ADR:** `ADR-REG-004`  
**Local manifestations:** `REG-INV-013..014`, Reliability transaction invariants.  
**Evidence:** `DB + CONC + failure injection`.

## GINV-017 — Downstream roster/team artifacts retain exact Registration/Roster provenance

**Criticality:** Q1  
**Owner:** Registration / Session  
**ADRs:** `ADR-REG-006`, `ADR-SES-004`, `ADR-BAL-002`  
**Local manifestations:** `REG-INV-019..023`, `REG-INV-040`, `SES-INV-012..013`, `BAL-INV-005`.  
**Evidence:** `DB + stale-revision tests`.

---

# 5. Team Formation / Rating invariants

## GINV-018 — Team Formation uses attributes, never Player Overall

**Criticality:** Q0/Q1  
**Owner:** Team Formation  
**ADR:** `ADR-BAL-001`  
**Local manifestations:** `PX-INV-006`, `BAL-INV-001..003`, `BAL-INV-016`, `REL-INV-056`, `PERF-INV-035`, QA regression guards.  
**Evidence:** `TYPE + PROP + differential tests`.

## GINV-019 — Missing attribute/evaluation/statistical capture is not numerical zero

**Criticality:** Q1  
**Owner:** Identity/Team Formation/Statistics by scope  
**ADRs:** `ADR-BAL-003`, `ADR-STAT-003`  
**Local manifestations:** `PX-INV-010`, `ID-INV-019`, `BAL-INV-011..012`, `STAT-INV-014..015`, `MATCH-INV-029`.  
**Evidence:** `UNIT + PROP + migration tests`.

## GINV-020 — Canonical Team Formation is deterministic from frozen input/version/seed/fixed work budget

**Criticality:** Q1  
**Owner:** Team Formation  
**ADR:** `ADR-BAL-004`  
**Local manifestations:** `BAL-INV-013..015`, `PERF-INV-033..034`, `OBS-INV-037`, QA determinism invariants.  
**Evidence:** `PROP + cross-runtime deterministic replay`.

## GINV-021 — Hard constraints cannot be traded for a better soft objective

**Criticality:** Q1  
**Owner:** Team Formation  
**ADR:** `ADR-BAL-003`  
**Local manifestations:** `BAL-INV-009..010`, feasibility/confirmation rules.  
**Evidence:** `PROP + validation tests`.

## GINV-022 — Published CandidateSet and historical TeamDraw provenance are immutable/revisioned

**Criticality:** Q1  
**Owner:** Team Formation  
**ADRs:** `ADR-BAL-005`, `ADR-BAL-009`  
**Local manifestations:** `BAL-INV-018..020`, `BAL-INV-028..036`.  
**Evidence:** `DB + stale confirmation + history tests`.

## GINV-023 — Voting ballots are private, actor-authenticated and bound to eligible roster

**Criticality:** Q0  
**Owner:** Team Formation / Voting  
**ADRs:** `ADR-BAL-006`, `ADR-BAL-007`  
**Local manifestations:** `BAL-INV-021..027`, Realtime voting privacy, Security authorization rules.  
**Evidence:** `RLS + CONC + RT + SEC`.

---

# 6. Match invariants

## GINV-024 — Fixture, Match, MatchResult and OfficialCompetitionResult remain distinct

**Criticality:** Q1  
**Owner:** Competition / Match  
**ADRs:** `ADR-MATCH-002`, `ADR-COMP-003`, `ADR-COMP-004`  
**Local manifestations:** `MATCH-INV-002..003`, `COMP-INV-003..006`, `PX-INV-008`.  
**Evidence:** `TYPE + DB + integration`.

## GINV-025 — Match control is per Match and fenced by current control epoch

**Criticality:** Q0  
**Owner:** Match  
**ADRs:** `ADR-MATCH-004`, `ADR-MATCH-005`  
**Local manifestations:** `MATCH-INV-006..010`, `SES-INV-021`, multi-court invariants.  
**Evidence:** `DB + CONC + OFF + takeover tests`.

## GINV-026 — Match ordering is server-authoritative sequence, not client time/updated_at

**Criticality:** Q0  
**Owner:** Match  
**ADR:** `ADR-MATCH-007`  
**Local manifestations:** `MATCH-INV-011..013`, `REL-INV-028`, Offline order invariants.  
**Evidence:** `DB + CONC + property tests`.

## GINV-027 — Client sends sports intent; authoritative score is computed by trusted Match engine

**Criticality:** Q0  
**Owner:** Match  
**ADR:** `ADR-MATCH-006`  
**Local manifestations:** `MATCH-INV-014..015`, API mass-assignment rules.  
**Evidence:** `RPC integration + adversarial DTO tests`.

## GINV-028 — MatchEvent history is append-oriented source truth and projection is rebuildable

**Criticality:** Q0  
**Owner:** Match  
**ADRs:** `ADR-MATCH-007`, `ADR-MATCH-008`  
**Local manifestations:** `MATCH-INV-016..021`, `REL` rebuild rules, `STAT` source rules.  
**Evidence:** `DB + REBUILD + integrity checks`.

## GINV-029 — Match corrections preserve prior facts/revisions; normal correction is not hard delete

**Criticality:** Q0/Q1  
**Owner:** Match  
**ADR:** `ADR-MATCH-009`  
**Local manifestations:** `MATCH-INV-017`, `MATCH-INV-038`, Competition correction separation.  
**Evidence:** `DB + REBUILD + audit tests`.

## GINV-030 — Last-write-wins is forbidden for Match critical state

**Criticality:** Q0  
**Owner:** Match  
**ADR:** `ADR-MATCH-012`  
**Local manifestations:** `PX-INV-012`, `MATCH-INV-024`, `OFFLINE-INV-027/044`, Reliability reconciliation.  
**Evidence:** `CONC + OFF + failure injection`.

## GINV-031 — Offline Match commands from stale epochs never auto-merge after takeover

**Criticality:** Q0  
**Owner:** Match / Offline  
**ADRs:** `ADR-MATCH-010`, `ADR-OFF-005`  
**Local manifestations:** `MATCH-INV-033..035`, `OFFLINE-INV-024..029`, Reliability takeover rules.  
**Evidence:** `OFF + CONC + reconciliation tests`.

---

# 7. Competition / Statistics invariants

## GINV-032 — Official Competition state derives from OfficialCompetitionResult, not merely finished Match

**Criticality:** Q0/Q1  
**Owner:** Competition  
**ADR:** `ADR-COMP-004`  
**Local manifestations:** `COMP-INV-006..010`, Stats official-eligibility rules.  
**Evidence:** `DB + projection tests`.

## GINV-033 — Walkover/BYE/administrative outcomes never fabricate sports events

**Criticality:** Q1  
**Owner:** Competition  
**ADR:** `ADR-COMP-006`  
**Local manifestations:** `COMP-INV-012..013`, `MATCH-INV-037`, `STAT-INV-011`.  
**Evidence:** `UNIT + DB + Stats tests`.

## GINV-034 — Retroactive Competition correction cannot silently rewrite already-executed downstream Match

**Criticality:** Q0/Q1  
**Owner:** Competition  
**ADR:** `ADR-COMP-008`  
**Local manifestations:** `COMP-INV-016/035`, `REL-INV-035`.  
**Evidence:** `dependency-graph tests + manual-impact workflow tests`.

## GINV-035 — Factual statistics are independent of subjective evaluations/skill profile/Overall

**Criticality:** Q1  
**Owner:** Statistics  
**ADR:** `ADR-STAT-001`  
**Local manifestations:** `STAT-INV-001..005`, Product History separation.  
**Evidence:** `UNIT + PROP + regression tests`.

## GINV-036 — Historical participation is sourced from historical participation/roster snapshots, never current Team membership

**Criticality:** Q0/Q1  
**Owner:** Statistics / Match  
**ADRs:** `ADR-STAT-002`, `ADR-MATCH-001`  
**Local manifestations:** `ID-INV-012..015`, `MATCH-INV-026..027`, `STAT-INV-006..009`.  
**Evidence:** `DB + migration + history tests`.

## GINV-037 — Shared statistics/projections are rebuildable and source-version aware

**Criticality:** Q1/Q2  
**Owner:** Statistics  
**ADRs:** `ADR-STAT-004`, `ADR-DATA-009`  
**Local manifestations:** `STAT-INV-007`, `STAT-INV-016..022`, Reliability projection rules.  
**Evidence:** `REBUILD + duplicate worker + correction tests`.

---

# 8. Data / API / reliability invariants

## GINV-038 — Command success means the authoritative transaction committed

**Criticality:** Q0  
**Owner:** API / Reliability  
**ADRs:** `ADR-API-006`, `ADR-REL-002`  
**Local manifestations:** `API-INV-050`, Match/Registration success semantics, Reliability command outcome rules.  
**Evidence:** `DB + response-loss failure injection`.

## GINV-039 — Retry of the same logical mutation reuses the same command_id

**Criticality:** Q0  
**Owner:** API  
**ADR:** `ADR-API-006`  
**Local manifestations:** `API-INV-008..013`, domain idempotency rules, Observability identity rules.  
**Evidence:** `DB + concurrent duplicate + unknown-outcome tests`.

## GINV-040 — Domain uniqueness/constraints protect invariants even when distinct command IDs race

**Criticality:** Q0  
**Owner:** Data  
**ADRs:** `ADR-DATA-006`, `ADR-API-006`  
**Local manifestations:** Registration active uniqueness, one owner, one current official result, vote uniqueness.  
**Evidence:** `DB + CONC`.

## GINV-041 — Critical multi-row invariants execute transactionally with aggregate-local concurrency control

**Criticality:** Q0  
**Owner:** Data  
**ADR:** `ADR-DATA-007`  
**Local manifestations:** `API-INV-014`, Match/Registration/Ownership/Officialization transaction rules.  
**Evidence:** `DB + CONC + failure injection`.

## GINV-042 — External side effects never participate in critical source-domain DB transaction

**Criticality:** Q0/Q1  
**Owner:** Data / Notifications  
**ADR:** `ADR-DATA-008`  
**Local manifestations:** `API-INV-025..027`, `NOTIF-INV-001..002/048`, `REL-INV-021..024`.  
**Evidence:** `DB + worker failure tests`.

## GINV-043 — Workers/outbox are at-least-once tolerant; no unproven distributed exactly-once claim

**Criticality:** Q1/Q2  
**Owner:** Reliability  
**ADR:** `ADR-REL-004`  
**Local manifestations:** `REL-INV-023..026/060`, Notification/Media worker invariants.  
**Evidence:** `duplicate execution + crash-after-effect tests`.

## GINV-044 — Projection is not source truth and must declare source/version/rebuild semantics

**Criticality:** Q1  
**Owner:** Data  
**ADR:** `ADR-DATA-009`  
**Local manifestations:** MatchProjection, SkillProfile, Standings, Stats, Inbox badge/rebuild rules.  
**Evidence:** `REBUILD + corruption integrity tests`.

## GINV-045 — Core relational relationships use normalized relations/FKs rather than serialized ID arrays as authority

**Criticality:** Q1  
**Owner:** Data  
**ADR:** `ADR-DATA-004`  
**Local manifestations:** Session roster, Competition teams, CommunityPlayer, target mapping.  
**Evidence:** `schema review + DB + migration tests`.

## GINV-046 — Account deletion cannot cascade-delete shared sports history

**Criticality:** Q0  
**Owner:** Identity / Security  
**ADRs:** `ADR-ID-007`, `ADR-DATA-005`, `ADR-SEC-011`  
**Local manifestations:** `ID-INV-014`, `SES-INV-032`, `SEC-INV-044..046`, restore/deletion rules.  
**Evidence:** `DB FK tests + privacy workflow + RESTORE`.

---

# 9. Realtime / offline / local durability invariants

## GINV-047 — Realtime transports committed state; it is never source of truth or command authorization

**Criticality:** Q0/Q1  
**Owner:** Realtime  
**ADR:** `ADR-RT-001`  
**Local manifestations:** `PX` realtime rules, `REG-INV-025`, `MATCH-INV-030`, `COMP-INV-029`, `OFFLINE` convergence rules.  
**Evidence:** `RT + provider outage tests`.

## GINV-048 — Realtime gaps/reconnects converge through authoritative snapshot + revision/sequence

**Criticality:** Q1  
**Owner:** Realtime  
**ADR:** `ADR-RT-003`  
**Local manifestations:** `REG-INV-026`, `MATCH-INV-031..032`, `REL-INV-039..040`.  
**Evidence:** `RT loss/duplicate/out-of-order tests`.

## GINV-049 — Protected Realtime channels/payloads are context-authorized and privacy-minimized

**Criticality:** Q0  
**Owner:** Realtime / Security  
**ADRs:** `ADR-RT-002`, `ADR-SEC-009`  
**Local manifestations:** Voting ballot privacy, waitlist privacy, Security realtime rules.  
**Evidence:** `RLS/channel auth + payload contract tests`.

## GINV-050 — Critical offline-owned/local pending facts are durably persisted before UI claims they are safe

**Criticality:** Q0  
**Owner:** Offline  
**ADRs:** `ADR-OFF-006`, `ADR-REL-006`  
**Local manifestations:** `OFFLINE-INV-028..034`, Match irreplaceable local data, Performance local-write invariants.  
**Evidence:** `OFF + quota/failure + browser-restart tests`.

## GINV-051 — Account switch cannot replay/read another user's local pending commands/private scoped data

**Criticality:** Q0  
**Owner:** Offline / Security  
**ADR:** `ADR-OFF-007`  
**Local manifestations:** `OFFLINE-INV-035..039`, `SEC-INV-034..035`, Reliability local data invariants.  
**Evidence:** `OFF + SEC + account-switch E2E`.

## GINV-052 — Generic bidirectional sync and generic mutation queueing are not target architecture

**Criticality:** Q1/Q2  
**Owner:** Offline / Migration  
**ADRs:** `ADR-OFF-004`, `ADR-MIG-007`  
**Local manifestations:** `OFFLINE-INV-011..015/054..055`, API generic-cloud retirement, migration no-new-legacy-use rules.  
**Evidence:** `architecture fitness + migration telemetry`.

---

# 10. Media / notification / privacy invariants

## GINV-053 — Raw media is untrusted/private until server-controlled technical processing succeeds

**Criticality:** Q0  
**Owner:** Media / Security  
**ADRs:** `ADR-MEDIA-001..003`, `ADR-SEC-010`  
**Local manifestations:** `MEDIA-INV-002..014`, Security media trust rules.  
**Evidence:** `SEC + media adversarial decode tests`.

## GINV-054 — Domain references MediaAsset identity, not arbitrary URLs; replacement is READY-before-switch

**Criticality:** Q1  
**Owner:** Media  
**ADRs:** `ADR-MEDIA-001`, `ADR-MEDIA-004`  
**Local manifestations:** `MEDIA-INV-001/016..019`, `REL-INV-036..037`.  
**Evidence:** `DB + worker failure + Storage integrity`.

## GINV-055 — Notification/provider failure cannot roll back source-domain truth

**Criticality:** Q0/Q1  
**Owner:** Notifications  
**ADRs:** `ADR-NOTIF-001`, `ADR-DATA-008`  
**Local manifestations:** `NOTIF-INV-001..002/012/022`, `REL-INV-038`, Registration notification failure rule.  
**Evidence:** `DB + provider failure injection`.

## GINV-056 — Delayed notifications revalidate current source relevance/expiry before delivery

**Criticality:** Q1/Q2  
**Owner:** Notifications  
**ADR:** `ADR-NOTIF-005`  
**Local manifestations:** `NOTIF-INV-013..016/040`, restore stale-job rules.  
**Evidence:** `worker + clock + restore tests`.

## GINV-057 — Security/privacy telemetry and audit minimize secrets/personal payloads

**Criticality:** Q0  
**Owner:** Security / Observability  
**ADRs:** `ADR-SEC-008`, `ADR-OBS-003`, `ADR-OBS-008`  
**Local manifestations:** `SEC-INV-036..039`, `OBS-INV-013..022/043..044`, provider/media log rules.  
**Evidence:** `SEC + redaction contract tests + operational review`.

---

# 11. Migration / operations / performance / governance invariants

## GINV-058 — Migrations are the schema-history source of truth; backfills are idempotent/resumable and semantically verified

**Criticality:** Q1/Q2  
**Owner:** Data / Operations  
**ADRs:** `ADR-DATA-010`, `ADR-OPS-004`, `ADR-MIG-004`  
**Local manifestations:** Data migration invariants, QA fresh-DB/backfill scenarios, Ops deployment rules.  
**Evidence:** `MIG + DB-from-zero + CI`.

## GINV-059 — Active execution cohorts are not switched mid-protocol to an incompatible engine

**Criticality:** Q0  
**Owner:** Migration  
**ADRs:** `ADR-MIG-006`, `ADR-OPS-004`  
**Local manifestations:** `SES-INV-035`, `REL-INV-050`, `PERF-INV-062`, migration cohort rules.  
**Evidence:** `MIG + E2E + deploy verification`.

## GINV-060 — Compatibility expands before destructive contract removal

**Criticality:** Q1/Q2  
**Owner:** Operations / Migration  
**ADRs:** `ADR-OPS-004`, `ADR-MIG-005`  
**Local manifestations:** `API-INV-028..029`, Reliability deploy invariants, migration writer/reader gates.  
**Evidence:** `MIG + compatibility telemetry + old-client tests`.

## GINV-061 — Performance work remains bounded by current context, not total historical dataset

**Criticality:** Q2  
**Owner:** Performance  
**ADR:** `ADR-PERF-001`  
**Local manifestations:** `PERF` bounded query/read model rules, Stats/Match/Competition hot reads.  
**Evidence:** `LOAD + query-plan tests + frontend profiling`.

## GINV-062 — Performance/scaling optimization cannot weaken correctness, security, privacy or auditability

**Criticality:** Q0  
**Owner:** Performance / Security  
**ADRs:** `ADR-PERF-009`, `ADR-GOV-006`  
**Local manifestations:** `PERF-INV-052..065`, Security/RLS rules.  
**Evidence:** `architecture review + LOAD with invariant assertions`.

## GINV-063 — Specialized infrastructure requires measured trigger and exit/ownership model

**Criticality:** Q2/Q3  
**Owner:** Performance / Governance  
**ADRs:** `ADR-PERF-009`, `ADR-GOV-006`  
**Local manifestations:** no-premature Redis/broker/search/partitioning/microservice rules across Data/Media/Notifications/Ops.  
**Evidence:** `benchmark + ADR review`.

## GINV-064 — Domain History, Audit, Telemetry and Logs are separate

**Criticality:** Q1/Q2  
**Owner:** Observability  
**ADR:** `ADR-OBS-001`  
**Local manifestations:** `OBS-INV-001..003`, `DATA` audit/outbox separation, Security audit rules.  
**Evidence:** `schema/retention review + recovery tests`.

## GINV-065 — Critical architecture invariants require executable evidence at the owning layer

**Criticality:** Q0/Q1  
**Owner:** QA / Governance  
**ADRs:** `ADR-QA-001`, `ADR-GOV-004`  
**Local manifestations:** QA invariant/risk model, Security negative-first testing, Migration verification.  
**Evidence:** `CI/release gates + test traceability`.

## GINV-066 — Architecture source-of-truth conflicts are explicit audit items; newest/code does not silently win

**Criticality:** Q2/Q3  
**Owner:** Governance  
**ADR:** `ADR-GOV-001`  
**Local manifestations:** Governance authority matrix and contradiction process.  
**Evidence:** `C7 architecture audit + review tooling`.

## GINV-067 — Once a target replacement is accepted, new code does not expand legacy usage

**Criticality:** Q1/Q2  
**Owner:** Governance / Migration  
**ADRs:** `ADR-GOV-005`, `ADR-MIG-007`  
**Local manifestations:** Offline generic-sync retirement, API generic-cloud retirement, migration no-new-writers rules.  
**Evidence:** `fitness tests + code search + migration telemetry`.

## GINV-068 — Temporary architecture exceptions are bounded, owned and expire/review explicitly

**Criticality:** Q2/Q3  
**Owner:** Governance  
**ADR:** `ADR-GOV-007`  
**Local manifestations:** Governance exception lifecycle.  
**Evidence:** `REVIEW + exception registry`.

---

# 12. Q0 release subset

The following global invariants are the minimum cross-context Q0/Q0-adjacent release subset. Context-specific Q0 rules remain additive.

```text
GINV-001  one authority
GINV-007  auth != authorization
GINV-008  actual resource context
GINV-009  Organizer != governance
GINV-010  MatchController contextual
GINV-012  semantic critical commands
GINV-014  capacity never exceeded
GINV-015  FIFO authoritative
GINV-016  leave+promotion atomic
GINV-018  no Overall in balancing
GINV-023  ballot privacy/eligibility
GINV-025  Match lease/epoch
GINV-026  Match sequence authority
GINV-027  server score
GINV-028  MatchEvent/projection integrity
GINV-030  no LWW Match
GINV-031  stale offline epoch never auto-merge
GINV-032  official result layer
GINV-034  no silent retro downstream rewrite
GINV-038  command success = commit
GINV-039  same logical retry = same command_id
GINV-040  DB/domain uniqueness
GINV-041  critical transaction atomicity
GINV-042  external effects outside critical tx
GINV-046  account deletion no sports-history cascade
GINV-047  realtime not authority
GINV-050  durable local ack
GINV-051  account-local isolation
GINV-053  raw media untrusted/private
GINV-055  notification failure doesn't rollback truth
GINV-057  secrets/PII not generic telemetry
GINV-059  no active-cohort protocol switch
GINV-062  no performance bypass of correctness/security
GINV-065  executable evidence
```

A release process may define stricter subsets per changed context. It may not weaken this list merely to reduce test runtime.

---

# 13. Evidence ownership matrix

| Family | Primary evidence |
|---|---|
| Identity/history | DB/FK + migration/history tests |
| Community/security | RLS/RPC negative authorization + BOLA |
| Registration | real concurrent PostgreSQL transactions + property tests |
| Team Formation | property/differential/deterministic replay |
| Match | DB transaction + event replay + epoch/sequence/offline tests |
| Competition | DB/projection/dependency graph tests |
| Statistics | rebuild/correction/coverage tests |
| Notifications/Media | duplicate worker + provider/storage failure injection |
| Offline | IndexedDB durability/account isolation/restart/reconciliation |
| Realtime | loss/duplicate/out-of-order/gap/reconnect tests |
| Data/API | DB/RPC/constraint/idempotency/contract tests |
| Security | negative-first/RLS/BOLA/mass-assignment/redaction |
| Reliability | failure injection/rebuild/restore |
| Performance | load tests that assert invariants + plans/budgets |
| Operations/Migration | fresh DB, compatibility, cohort, backfill, deploy verification |
| Governance | fitness functions, traceability, architecture audit |

---

# 14. Completeness rule

C4 global deduplication must never be used to delete a local invariant merely because its concept appears here.

The required relationship is:

```text
GINV
= cross-context index

LOCAL INV
= bounded, precise rule

N10
= adversarial/acceptance scenario

TEST / OPS EVIDENCE
= executable proof
```

All four layers may coexist because they answer different questions.

---

# 15. Handoff

C5 must reference both global and local invariants.

Example:

```text
Command: JoinRegistration
Owner: Registration
ADR: ADR-REG-003/004
Global: GINV-014/015/016/038/039/041
Local: REG-INV-006..016, REG-INV-031..032
Evidence: DB + CONC + RLS + E2E
```

This makes the architecture traceable from a matrix row to the exact rules and tests that protect it.