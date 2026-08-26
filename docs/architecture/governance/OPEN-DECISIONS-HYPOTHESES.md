# Canonical Open Decision / Hypothesis Registry — Volley

> Status: `DRAFT-CANONICAL / C4`
>
> Owner: `Architecture + bounded-context owners`
>
> Parent: [`C4-REGISTRY-MASTER.md`](C4-REGISTRY-MASTER.md)
>
> Decision registry: [`ADR-CATALOG.md`](../adr/ADR-CATALOG.md)
>
> Normative detail: C2.01–C2.23 `OPEN`, `STRONG HYPOTHESIS`, `HYPOTHESES`, and equivalent sections.

---

# 0. Rule

```text
OPEN DECISION
≠ accepted ADR

HYPOTHESIS
≠ invariant

code default
≠ architecture decision
```

This registry gives stable ownership to unresolved material. The owning C2 chapter remains the exact detailed source. Where several closely related local questions are listed under one registry family, **none of the local questions disappears**; the family is an index/ownership grouping, not a summary that replaces the source wording.

---

# 1. Status and blocking semantics

Open Decision status:

```text
OPEN
DECIDING
DECIDED → ADR / policy record
DEFERRED
RETIRED
```

Blocking:

```text
BLOCKING
BOUNDARY-BLOCKING
NON-BLOCKING
EVIDENCE-TRIGGERED
```

Hypothesis status:

```text
REGISTERED
TESTING
VALIDATED
FALSIFIED
RETIRED
```

---

# 2. Product Experience

## Open Decisions

### OD-PX-001 — Minors / age policy
**Blocking:** BOUNDARY-BLOCKING  
Whether V1 permits minors and the onboarding/privacy consequences. Security/LGPD owns the legal/privacy closure.

### OD-PX-002 — Rating aggregation policy exposed to product
**Blocking:** BOUNDARY-BLOCKING  
Exact robust statistical aggregation is not a Product Experience decision; it must be closed in the Rating pipeline before UX presents confidence/meaning as settled.

### OD-PX-003 — Community credibility in Global Skill Profile
**Blocking:** NON-BLOCKING initially  
Future credibility/weighting of Community profiles requires explicit Rating policy.

### OD-PX-004 — Public Match/Competition surfaces
**Blocking:** BOUNDARY-BLOCKING  
Which Match/Competition views are public versus Community-only/private by default.

## Hypotheses

### HYP-PX-001 — Court-first offline Match controller is preferable to strict-online universal scoring
**Evidence:** Match prototype/failure/reconciliation testing.  
**Status:** REGISTERED.

### HYP-PX-002 — Tie/no-vote can initially fall back to trusted multidimensional candidate objective
**Evidence:** product/fairness validation.  
**Status:** REGISTERED.

### HYP-PX-003 — Fresh/stale UX thresholds vary by screen
**Evidence:** product usability/operational usage.  
**Status:** REGISTERED.

---

# 3. Identity / Players

## Open Decisions

### OD-ID-001 — PlayerAccountLink approval authority
Who can approve a claim when Player was created by third parties/legacy.  
**Blocking:** BLOCKING before broad claim flow.

### OD-ID-002 — Player username discoverability
Whether Player may opt out of username discovery.  
**Blocking:** BOUNDARY-BLOCKING.

### OD-ID-003 — Historical display-name policy
When UI uses historical snapshot name versus current Player name.  
**Blocking:** NON-BLOCKING to data model; required per public/report UI.

### OD-ID-004 — Multiple sports profiles per User
Whether future one-account→multiple Player profiles are needed.  
**Blocking:** NON-BLOCKING; V1 assumes simpler relation until product evidence.

### OD-ID-005 — Health/physical/minors data policy
Detailed handling of physical/health-related traits and minors.  
**Blocking:** BOUNDARY-BLOCKING for any such processing.

## Hypotheses

### HYP-ID-001 — At most one ACTIVE PlayerAccountLink per User and per Player in V1
**Evidence:** product identity requirements and conflict cases.

### HYP-ID-002 — Username remains globally unique discovery handle
**Evidence:** privacy/discovery product validation and abuse testing.

### HYP-ID-003 — Player Merge requires privileged step-up/MFA
**Evidence:** Security risk review; likely to become enforcement policy.

---

# 4. Communities

## Open Decisions

### OD-COM-001 — Visibility/discoverability/join-policy enum combinations
**Blocking:** BOUNDARY-BLOCKING for discovery/join launch.

### OD-COM-002 — OPEN_JOIN in V1
Whether V1 supports open join or only approval/invite flows.  
**Blocking:** NON-BLOCKING if approval-only ships.

### OD-COM-003 — Legacy `moderator` migration
Exact mapping based on actual usage; never auto-promote blindly.  
**Blocking:** BLOCKING for affected migration cohort.

### OD-COM-004 — Admin archive capability
Whether Admin may Archive Community or only Owner.  
**Blocking:** BOUNDARY-BLOCKING.

### OD-COM-005 — Owner/Admin administrative override over Organizer-owned Sessions
Exact recovery override capability/policy.  
**Blocking:** BLOCKING before relying on recovery path.

### OD-COM-006 — First-class CommunityInvitation
Whether invitation deserves a V1 entity or later.  
**Blocking:** NON-BLOCKING if invitations are omitted.

### OD-COM-007 — JoinRequest retention
Retention details for rejected/withdrawn requests.  
**Blocking:** BOUNDARY-BLOCKING for compliance/operations, not core join semantics.

## Hypotheses

### HYP-COM-001 — Former Owner becomes ADMIN after transfer by default
### HYP-COM-002 — Owner/Admin can approve JoinRequests; Moderator role unnecessary initially
### HYP-COM-003 — Static capability mapping is preferable to persisted role-capability overrides V1
### HYP-COM-004 — Archived Community can be restored unless future compliance/product constraints prevent it

---

# 5. Sessions

## Open Decisions

### OD-SES-001 — Final `SessionContext` / `PlayMode` names
**Blocking:** NON-BLOCKING to semantics; required before stable public contracts.

### OD-SES-002 — Unpublish after registrations exist
Exact policy and downstream invalidation.  
**Blocking:** BLOCKING before Unpublish command exists.

### OD-SES-003 — Organizer assignment cardinality
Principal Organizer + assistants versus equivalent assignments.  
**Blocking:** NON-BLOCKING if equivalent assignments are initially sufficient.

### OD-SES-004 — Roster mutation after IN_PROGRESS
Detailed post-start adjustment/replacement policy.  
**Blocking:** BLOCKING before feature exposure.

### OD-SES-005 — Multi-court rotation runtime model
**Blocking:** BOUNDARY-BLOCKING for advanced rotation automation.

### OD-SES-006 — Mixed competition + free-play in one Session
Whether one Session can host both simultaneously.  
**Blocking:** NON-BLOCKING; may be forbidden initially.

## Hypotheses

### HYP-SES-001 — Small lifecycle `DRAFT → SCHEDULED → IN_PROGRESS → COMPLETED`, with CANCELLED alternative
### HYP-SES-002 — Play mode equivalent to `FREE_PLAY | STRUCTURED_MATCHES`
### HYP-SES-003 — At most one primary RegistrationWindow per Session in V1
### HYP-SES-004 — Admin recovery override is explicit capability, not implicit governance inheritance

---

# 6. Registration

## Open Decisions

### OD-REG-001 — Unlimited-capacity RegistrationWindow
Whether unlimited capacity is modeled explicitly or Registration is omitted when capacity is irrelevant.  
**Blocking:** NON-BLOCKING.

### OD-REG-002 — Temporarily ineligible waitlisted state
`REMOVED`, dedicated `INELIGIBLE`, or preserved WAITLISTED+skip reason/event.  
**Blocking:** BLOCKING before that condition is supported in production promotion logic.

### OD-REG-003 — Waitlist position visibility
Exact numeric position versus coarser privacy-preserving status.  
**Blocking:** BOUNDARY-BLOCKING to UX/query contract.

### OD-REG-004 — Protected/reserved slot categories
Not V1; any future quota/category changes FIFO fairness and requires ADR.  
**Blocking:** DEFERRED.

### OD-REG-005 — Payment/refund/cancellation attachment
Out of current scope.  
**Blocking:** DEFERRED.

### OD-REG-006 — Reopen semantics after roster revision
**Blocking:** BLOCKING before Reopen command exists.

## Hypotheses

### HYP-REG-001 — Rejoin creates a new RegistrationEntry row
### HYP-REG-002 — WAITLISTED requires queue_sequence; confirmed join-order storage is an audit/schema choice
### HYP-REG-003 — Reopen only before Session start and explicitly stales roster/TeamDraw
### HYP-REG-004 — Organizer-added Player uses distinct semantic command rather than self-join overload

---

# 7. Team Formation / Voting

## Open Decisions

### OD-BAL-001 — Canonical skill dimensions/rubric
**Blocking:** BLOCKING before final Rating→Balancer contract freezes.

### OD-BAL-002 — Objective formula and weights
**Blocking:** BLOCKING before algorithm version is considered production-stable.

### OD-BAL-003 — Weighted-sum vs minimax vs lexicographic vs hybrid fairness objective
**Blocking:** BLOCKING with OD-BAL-002.

### OD-BAL-004 — Candidate portfolio diversity metric/threshold
**Blocking:** NON-BLOCKING if a deterministic simple policy ships first.

### OD-BAL-005 — Voting quorum
**Blocking:** BLOCKING only for quorum feature.

### OD-BAL-006 — Vote-change policy while OPEN
**Blocking:** BOUNDARY-BLOCKING.

### OD-BAL-007 — Final tie/no-vote rule
**Blocking:** BLOCKING before participant voting launch.

### OD-BAL-008 — Which composition rules are hard vs soft defaults
**Blocking:** BLOCKING for relevant constraints.

### OD-BAL-009 — Gender/physical dimensions in optimization
Requires explicit product/privacy policy.  
**Blocking:** BLOCKING before use.

### OD-BAL-010 — Cold-start/missing-attribute resolver
**Blocking:** BLOCKING before authoritative shared balancing with incomplete profiles.

### OD-BAL-011 — Confidence in optimization
Whether confidence remains diagnostic or affects objective.  
**Blocking:** NON-BLOCKING if diagnostic-only.

### OD-BAL-012 — Server-side full search trigger
Conditions that justify moving canonical search from client Worker.  
**Blocking:** EVIDENCE-TRIGGERED.

## Hypotheses

### HYP-BAL-001 — Simulated Annealing remains initial default search algorithm
### HYP-BAL-002 — Default portfolio contains three candidate options
### HYP-BAL-003 — Plurality is initial voting method
### HYP-BAL-004 — Tie/no-vote initially chooses best trusted multidimensional objective
### HYP-BAL-005 — Weighted normalized objective is plausible baseline pending comparison
### HYP-BAL-006 — Confidence begins as diagnostic, not hidden objective weight

---

# 8. Live Match

## Open Decisions

### OD-MATCH-001 — Community offline live scoring in first release
Strict feature-gated rollout versus first-release support.  
**Blocking:** BOUNDARY-BLOCKING.

### OD-MATCH-002 — Lease TTL / heartbeat cadence
**Blocking:** NON-BLOCKING architecture; production tuning required before broad rollout.

### OD-MATCH-003 — Post-finish correction authority
Separate capability for ordinary technical correction versus winner/result-changing correction.  
**Blocking:** BLOCKING before post-finish corrections.

### OD-MATCH-004 — CaptureMode ownership/default
Community→Session→Match frozen default versus Match choice before Start.  
**Blocking:** BOUNDARY-BLOCKING.

### OD-MATCH-005 — Lineup depth V1
Serving order/rotation/libero/substitution scope.  
**Blocking:** NON-BLOCKING for score-only/basic engine.

### OD-MATCH-006 — Spectator visibility
Public/community/private policy and DTO.  
**Blocking:** BOUNDARY-BLOCKING for spectator launch.

### OD-MATCH-007 — Manual finish exceptions
Legitimate cases outside normal Rules Engine.  
**Blocking:** BLOCKING before manual finish exists.

### OD-MATCH-008 — Event taxonomy expansion
Keep minimal; additions require rule/audit/stats/recovery justification.  
**Blocking:** NON-BLOCKING.

## Hypotheses

### HYP-MATCH-001 — Short row-lock transaction per Match is sufficient for expected volleyball command frequency
### HYP-MATCH-002 — Community offline continuity can be safely delivered with lease/epoch/sequence reconciliation after online path stabilizes

---

# 9. Competitions

## Open Decisions

### OD-COMP-001 — Initial Stage type catalog
### OD-COMP-002 — Auto-officialization eligibility and conditions
### OD-COMP-003 — Competition roster transfer/change policy
### OD-COMP-004 — Multi-leg Fixture modeling
One Fixture with legs versus separate Fixtures.
### OD-COMP-005 — Captain reschedule negotiation policy
### OD-COMP-006 — Official awards as source facts versus presentation projections
### OD-COMP-007 — Future public/intercommunity Competition requirements

Blocking is capability-specific; all are BOUNDARY-BLOCKING except future intercommunity/public scope, which is NON-BLOCKING until introduced.

## Hypotheses

### HYP-COMP-001 — Explicit officialization is default for formal competitions; controlled auto-officialize may serve social formats
### HYP-COMP-002 — Standings may update eventually after durable OfficialResult
### HYP-COMP-003 — Relational PostgreSQL is sufficient for foreseeable bracket/standings needs

---

# 10. History / Statistics

## Open Decisions

### OD-STAT-001 — BASIC_STATS vs DETAILED taxonomy
### OD-STAT-002 — Definition of gamesPlayed when rostered but never enters court
### OD-STAT-003 — Abandoned Match eligibility by reason/scope
### OD-STAT-004 — Public Player statistics defaults
### OD-STAT-005 — Ranking minimum sample/coverage rules
### OD-STAT-006 — Current identity versus snapshot display per history surface
### OD-STAT-007 — Stronger cryptographic/export immutability for official reports

## Hypotheses

### HYP-STAT-001 — `PlayerMatchStatContribution` is canonical persisted contribution entity/name
### HYP-STAT-002 — V1 uses typed core metric columns + versioned metadata, not universal EAV
### HYP-STAT-003 — Hot Player/global career scopes are materialized; uncommon filters may query contributions
### HYP-STAT-004 — StatisticalEligibility is deterministic and may have materialized checkpoint/current result

---

# 11. Notifications

The C2 owner already uses `OD-NOTIF-*`; preserve these identities.

## Open Decisions

- `OD-NOTIF-001` Push provider choice — NON-BLOCKING until Push channel implementation.
- `OD-NOTIF-002` Email provider and whether Email is V1.
- `OD-NOTIF-003` Inbox retention period.
- `OD-NOTIF-004` DeliveryAttempt retention period.
- `OD-NOTIF-005` Whether users may MarkUnread offline.
- `OD-NOTIF-006` Quiet-hours defaults/timezone semantics.
- `OD-NOTIF-007` Categories that bypass quiet hours.
- `OD-NOTIF-008` Whether operational notifications remain in Inbox when external channels disabled.
- `OD-NOTIF-009` Read/open telemetry beyond `read_at`.
- `OD-NOTIF-010` Provider webhook needs per channel.
- `OD-NOTIF-011` Worker runtime.
- `OD-NOTIF-012` Measured scale trigger for broker/queue service.
- `OD-NOTIF-013` Ownership/future of `WhatsAppShareDraft`.
- `OD-NOTIF-014` Legal basis/consent details per communication purpose.

Most are BOUNDARY-BLOCKING only for the relevant channel/policy. Broker choice is EVIDENCE-TRIGGERED. Legal basis is BLOCKING for processing whose legal basis is unresolved.

## Hypothesis family

### HYP-NOTIF-001 — Postgres transactional outbox + managed/serverless worker is sufficient initial infrastructure
Evidence: backlog age, throughput, provider latency, retry behavior.

---

# 12. Media

## Open Decisions

### OD-MEDIA-001 — Max upload bytes per purpose
### OD-MEDIA-002 — Max decoded pixel budget
### OD-MEDIA-003 — Source dimension limits
### OD-MEDIA-004 — Canonical output dimensions
### OD-MEDIA-005 — Encoder/quality policy
### OD-MEDIA-006 — Orphan grace period
### OD-MEDIA-007 — Raw deletion delay
### OD-MEDIA-008 — Moderation retention
### OD-MEDIA-009 — Upload rate limits/quotas
### OD-MEDIA-010 — AVIF/HEIC support
### OD-MEDIA-011 — CommunityPlayer contextual avatar need
### OD-MEDIA-012 — Who may propose media for accountless Player

Thresholds are EVIDENCE-TRIGGERED/BOUNDARY-BLOCKING before production hardening; codec/product scope questions are NON-BLOCKING until introduced.

## Hypotheses

### HYP-MEDIA-001 — Supabase Storage + server-controlled processing + Postgres metadata is sufficient initial platform
### HYP-MEDIA-002 — Client downscale materially reduces bandwidth without becoming a security boundary

---

# 13. Online / Offline

## Open Decisions

### OD-OFF-001 — IndexedDB wrapper/library
### OD-OFF-002 — Physical one-DB-per-account versus scoped records
### OD-OFF-003 — Cache retention limits
### OD-OFF-004 — Local storage warning/quota thresholds
### OD-OFF-005 — Offline Match lease/grace duration
### OD-OFF-006 — `navigator.storage.persist()` policy
### OD-OFF-007 — Quick publish safe-boundary UX
### OD-OFF-008 — Specialized active-Quick live handoff in future
### OD-OFF-009 — Anonymous-mode product exposure
### OD-OFF-010 — Recovery/export UX for irreplaceable local data
### OD-OFF-011 — Whether selected non-critical drafts become cloud-backed later

Architecture remains valid without fixing most exact technologies/thresholds. OD-OFF-005/007/010 become BOUNDARY-BLOCKING for their production features.

## Hypotheses

### HYP-OFF-001 — IndexedDB is sufficient for structured local Quick/MatchOutbox scale on target devices
### HYP-OFF-002 — No multi-device draft merge is needed in V1

---

# 14. Realtime

## Open Decisions

### OD-RT-001 — Topic naming grammar and authorization helper design
### OD-RT-002 — Globally disable public channels versus reserve explicit public Match namespace
### OD-RT-003 — Immediate confidentiality revocation semantics for already-connected private channels
### OD-RT-004 — Public Match spectator surfaces in V1
### OD-RT-005 — Resync/poll fallback intervals during provider outage
### OD-RT-006 — Dedicated distribution layer trigger for spectator scale

OD-RT-006 is EVIDENCE-TRIGGERED; public/confidentiality decisions are BOUNDARY-BLOCKING for those surfaces.

## Hypotheses

### HYP-RT-001 — Supabase private Broadcast is sufficient V1/V2 without separate realtime broker
### HYP-RT-002 — Most Session/Competition updates should use invalidation+refetch rather than complex client delta replication
### HYP-RT-003 — Match spectator events may include small projection delta/summary if measured UX justifies it

---

# 15. Data Architecture

## Open Decisions

### OD-DATA-001 — Retention windows for command receipts/outbox/audit classes
### OD-DATA-002 — Internal table placement outside/inside `app_private`
### OD-DATA-003 — MatchEvent partitioning strategy if measured trigger occurs
### OD-DATA-004 — Generic revision metadata helper versus context-specific snapshots
### OD-DATA-005 — Materialized views versus ordinary projection tables/jobs per read model

## Hypotheses

### HYP-DATA-001 — Initial schema split `public + app_private` is sufficient
### HYP-DATA-002 — `app_private` hosts receipts/outbox/checkpoints/internal support
### HYP-DATA-003 — MatchEvent remains unpartitioned at initial scale
### HYP-DATA-004 — Historical source tables generally use semantic lifecycle rather than hard delete

---

# 16. API / Application

## Open Decisions

### OD-API-001 — Runtime validation library/convention
### OD-API-002 — Command receipt retention per command class
### OD-API-003 — Which simple reads remain direct PostgREST SELECT versus Query RPC/view
### OD-API-004 — External rate-limit provider/implementation when DB mechanisms insufficient
### OD-API-005 — Future public API version namespace

## Hypotheses

### HYP-API-001 — Stable errors use bounded-context prefixes rather than giant enum
### HYP-API-002 — `command_receipts` lives in `app_private` with finite retention
### HYP-API-003 — Keyset pagination becomes default for large user-facing feeds
### HYP-API-004 — Runtime schemas are centralized at contract boundaries

---

# 17. Security / Privacy / LGPD

## Open Decisions

### OD-SEC-001 — Exact commands requiring mandatory AAL2
### OD-SEC-002 — Session duration/password policy configuration
### OD-SEC-003 — Whether V1 accepts minors and under what policy
### OD-SEC-004 — Retention periods per data category beyond externally mandated minima
### OD-SEC-005 — Controller/operator mapping for providers
### OD-SEC-006 — Legal basis per processing activity
### OD-SEC-007 — Public spectator visibility policy
### OD-SEC-008 — Evaluation visibility to evaluated Player and granularity
### OD-SEC-009 — Internal support tooling/impersonation
Not V1 by default.
### OD-SEC-010 — External security-test cadence/trigger
### OD-SEC-011 — Exact abuse/rate-limit thresholds

Relevant processing is BLOCKING where legal basis/minor policy/visibility must be defined before launch; numerical limits/cadence are BOUNDARY-BLOCKING or EVIDENCE-TRIGGERED.

## Hypotheses

### HYP-SEC-001 — Selected high-impact actions benefit from mandatory AAL2 step-up
### HYP-SEC-002 — SPA XSS remains the dominant authenticated-browser threat model

---

# 18. Reliability

Preserve owner identifiers where already defined.

## Open Decisions

- `OPEN-REL-001` Numerical RPO/RTO.
- `OPEN-REL-002` Numerical SLO targets.
- `OPEN-REL-003` Command receipt retention.
- `OPEN-REL-004` Exact Community Match offline availability scope.
- `OPEN-REL-005` Local irreplaceable backup/export product need.
- `OPEN-REL-006` Provider-specific notification reconciliation.
- `OPEN-REL-007` Backup topology/regions.
- `OPEN-REL-008` Automated repair scope per integrity rule.

Numeric targets/topology are EVIDENCE-TRIGGERED. Offline scope and auto-repair classification are BOUNDARY-BLOCKING before broad production use.

## Hypotheses

### HYP-REL-001 — Most projection repairs can be deterministic when explicit source/version contracts exist
### HYP-REL-002 — Short bounded DB transactions + at-least-once workers provide sufficient correctness/operability at initial scale

---

# 19. Performance / Scalability

## Open Decisions

### OD-PERF-001 — Quantitative latency budgets
### OD-PERF-002 — Initial/route bundle budgets
### OD-PERF-003 — Solver roster-size benchmark classes
### OD-PERF-004 — Simultaneous spectator threshold for architectural review
### OD-PERF-005 — MatchEvent table threshold for partitioning review
### OD-PERF-006 — Projection lag targets
### OD-PERF-007 — Worker backlog/oldest-age alert thresholds
### OD-PERF-008 — IndexedDB quota/pruning thresholds
### OD-PERF-009 — Media processing concurrency limits
### OD-PERF-010 — CI versus scheduled performance-test execution
### OD-PERF-011 — Official mobile hardware/device matrix
### OD-PERF-012 — Cost guardrails per active user/session/match

All are EVIDENCE-TRIGGERED unless a product/release requirement makes one immediately blocking.

## Hypotheses

### HYP-PERF-001 — Client Worker is sufficient for real Team Formation envelope
### HYP-PERF-002 — Single PostgreSQL with correct indexes/read models covers initial growth
### HYP-PERF-003 — Broadcast/resource channels cover initial spectator fan-out
### HYP-PERF-004 — Registration hot-row contention is acceptable with short indexed transaction
### HYP-PERF-005 — Route-level lazy loading materially improves measured initial loading

---

# 20. Observability

## Open Decisions

### OD-OBS-001 — Telemetry/tracing backend/provider
Vendor choice remains replaceable; instrumentation semantics stay canonical.
### OD-OBS-002 — Exact trace sampling rates
### OD-OBS-003 — Per-signal telemetry retention durations
### OD-OBS-004 — Numeric SLI/SLO/error-budget targets
### OD-OBS-005 — Alert thresholds/severity routing per signal
### OD-OBS-006 — Central export policy for offline/local diagnostics

All are EVIDENCE-TRIGGERED/BOUNDARY-BLOCKING after baseline; no numeric value is invented by architecture.

## Hypotheses

### HYP-OBS-001 — OpenTelemetry-compatible/vendor-neutral instrumentation reduces provider lock-in when distributed tracing is needed
### HYP-OBS-002 — High-value command/DB/worker boundaries provide most early observability value before ubiquitous tracing

---

# 21. Testing / QA

## Open Decisions

### OD-QA-001 — Property-based testing framework
### OD-QA-002 — PostgreSQL/Supabase orchestration approach in CI
### OD-QA-003 — Accessibility automation tool
### OD-QA-004 — Load-testing tool
### OD-QA-005 — Line/branch coverage baseline/threshold if any
### OD-QA-006 — Critical Playwright cadence/gating location
### OD-QA-007 — Future browser/device matrix beyond Chromium
### OD-QA-008 — Restore-drill cadence
### OD-QA-009 — Mutation-testing adoption/threshold
### OD-QA-010 — Flaky-test quarantine SLA by quality tier

Tool choices are generally NON-BLOCKING as long as required evidence exists. DB harness capability is BLOCKING before claiming authoritative DB/RLS/concurrency coverage.

## Hypotheses

### HYP-QA-001 — Local Supabase/Postgres harness gives best initial fidelity/cost trade-off
### HYP-QA-002 — Property-based testing materially improves Registration/Balancer/Match/Rating confidence
### HYP-QA-003 — DB integration/concurrency suites can run in PR/merge feedback time after parallelization

---

# 22. Operations / Deploy

The owner chapter defines 24 Open Decisions and six hypotheses. Preserve them explicitly.

## Open Decisions

- `OD-OPS-001` production frontend host;
- `OD-OPS-002` Docker/nginx canonical deployment versus portable fallback;
- `OD-OPS-003` exact Node patch/image digest policy;
- `OD-OPS-004` exact npm version pinning;
- `OD-OPS-005` persistent staging versus on-demand;
- `OD-OPS-006` future Supabase Branching economics;
- `OD-OPS-007` CI strategy for provider features not faithfully local;
- `OD-OPS-008` CD automation technology;
- `OD-OPS-009` IaC need/technology;
- `OD-OPS-010` feature-flag storage/provider;
- `OD-OPS-011` kill-switch control plane;
- `OD-OPS-012` worker runtime;
- `OD-OPS-013` scheduler adapter;
- `OD-OPS-014` load tooling;
- `OD-OPS-015` actual managed backup/PITR capability;
- `OD-OPS-016` Storage backup strategy;
- `OD-OPS-017` RPO/RTO values after business classification;
- `OD-OPS-018` CDN/host cache implementation;
- `OD-OPS-019` CSP exact allowlist;
- `OD-OPS-020` DNS provider/custom domain;
- `OD-OPS-021` public status page need;
- `OD-OPS-022` release/version cadence;
- `OD-OPS-023` canary/percentage rollout support;
- `OD-OPS-024` operator tooling needed to reduce direct SQL further.

## Hypotheses

- `HYP-OPS-001` Supabase local stack is sufficient for most CI DB fidelity; validate provider deltas.
- `HYP-OPS-002` on-demand staging/rehearsal is sufficient initially.
- `HYP-OPS-003` managed/serverless workers suffice initially.
- `HYP-OPS-004` static hosting + Supabase remains simpler than a dedicated app server at current scale.
- `HYP-OPS-005` provider backup features meet initial RPO/RTO; verify actual plan.
- `HYP-OPS-006` supported old-client window can remain short; measure long-lived browser/PWA behavior.

---

# 23. Migration / Strangler

C2.22 owns the detailed list. The following registry families preserve its unresolved material without changing any migration rule.

## Open Decisions

### OD-MIG-001 — Legacy data disposition policy by anomaly class
Which anomalies can auto-map, require manual review, remain evidence-only, or are excluded.

### OD-MIG-002 — Cohort selection criteria per bounded context
Exact thresholds/readiness gates for moving a new or legacy draft cohort.

### OD-MIG-003 — Historical backfill depth and prioritization
How much legacy history is normalized immediately versus lazily/reported as legacy evidence.

### OD-MIG-004 — Legacy `moderator`/ambiguous role handling
Delegated to Community evidence audit; cannot be guessed.

### OD-MIG-005 — Legacy unscoped Evaluation attribution
Manual attribution workflow versus evidence-only exclusion from official aggregate.

### OD-MIG-006 — Legacy Session roster import policy when no FIFO evidence exists
Explicit organizer import semantics only; no fabricated history.

### OD-MIG-007 — Legacy Match event import confidence thresholds
When detailed events are trustworthy enough for ordered import versus score-only/partial coverage.

### OD-MIG-008 — Competition migration officialization policy
When legacy finished technical Games are eligible to seed Current OfficialCompetitionResult.

### OD-MIG-009 — Residual local shared-data recovery UX
How users/operators resolve `LEGACY_UNRESOLVED_SHARED_LOCAL` data.

### OD-MIG-010 — LocalStorage deletion grace/recovery window
When old keys can be physically removed after verified import.

### OD-MIG-011 — Compatibility window / old-client retirement evidence
Exact usage threshold and duration before contract.

### OD-MIG-012 — Per-context shadow/dual-read duration
Bounded by verification evidence; not permanent dual authority.

### OD-MIG-013 — Migration provenance physical schema details
Exact mapping/anomaly table design while preserving required provenance semantics.

### OD-MIG-014 — Reset eligibility
If any future reset is proposed, it requires exceptional product decision and explicit scope; never default migration strategy.

### OD-MIG-015 — Media external URL import policy/allowlists
Inventory-dependent and SSRF-safe.

### OD-MIG-016 — Stats legacy aggregate preservation UX
Whether/how `LEGACY_EVIDENCE` is presented after canonical target projection exists.

### OD-MIG-017 — Sync retirement final gate telemetry
Exact zero-reader/zero-writer/compatibility evidence thresholds.

### OD-MIG-018 — Legacy schema physical-removal sequencing
Indexes/functions/policies/columns removal order after consumers reach zero.

### OD-MIG-019 — User communication/support around irreversible migration anomalies
Required when automatic mapping is impossible.

### OD-MIG-020 — Final cutover sequencing among remaining tightly coupled contexts
To be resolved by C6 dependency graph and implementation readiness.

Most are BOUNDARY-BLOCKING for affected cohorts. Reset is exceptional, not a normal open implementation option.

## Hypotheses

### HYP-MIG-001 — Vertical capability strangler is safer than entity-by-entity generic sync replacement
### HYP-MIG-002 — Registration is an effective early target vertical slice after Session backbone
### HYP-MIG-003 — Team solver semantics can be corrected before all persistence migration completes
### HYP-MIG-004 — Active legacy Match/Session cohorts should finish on legacy engine in first cutover
### HYP-MIG-005 — Most legacy IDs can be preserved when semantic identity is clear
### HYP-MIG-006 — Shadow reads/projections can expose semantic mismatches before authority cutover
### HYP-MIG-007 — Key-by-key localStorage retirement lowers risk versus one global clear/import
### HYP-MIG-008 — Generic sync can be retired monotonically by removing one bounded capability at a time

---

# 24. Architecture Governance

C2.23 owns detailed governance questions. Registry families:

## Open Decisions

### OD-GOV-001 — Named human/code-owner mapping for each bounded context
### OD-GOV-002 — Architecture review workflow/tooling integration with PRs
### OD-GOV-003 — Exact AR0/AR1/AR2/AR3 trigger automation
### OD-GOV-004 — Fitness-function implementation inventory and ownership format
### OD-GOV-005 — Exception registry storage/workflow
### OD-GOV-006 — ADR storage granularity: catalog-only versus individual ADR files as decisions evolve
### OD-GOV-007 — Required review cadence for high-risk accepted ADRs
### OD-GOV-008 — Technical debt registry tooling
### OD-GOV-009 — Deprecation telemetry minimum before removal
### OD-GOV-010 — Architecture dashboard/reporting automation
### OD-GOV-011 — Automated dependency-boundary tooling/linter choice
### OD-GOV-012 — Generated architecture documentation policy
### OD-GOV-013 — Change-log/release linkage to ADR/invariant identifiers
### OD-GOV-014 — Exact ownership when a decision spans two bounded contexts equally
### OD-GOV-015 — Escalation path when context owners disagree
### OD-GOV-016 — Review policy for emergency/break-glass architectural deviation
### OD-GOV-017 — Documentation stale-age signals/cadence
### OD-GOV-018 — Whether architecture metadata becomes machine-readable YAML/JSON in addition to Markdown
### OD-GOV-019 — How C7 audit findings are tracked to closure
### OD-GOV-020 — Architecture onboarding/knowledge-transfer format
### OD-GOV-021 — Threshold for splitting a bounded context or introducing a service boundary
### OD-GOV-022 — Provider lock-in review triggers
### OD-GOV-023 — When external architecture/security review becomes justified
### OD-GOV-024 — Formal post-C7 canonical promotion process from DRAFT-CANONICAL to CANONICAL

## Hypotheses

### HYP-GOV-001 — Federated bounded-context ownership is sufficient without central approval on every PR
### HYP-GOV-002 — Risk-triggered architecture review reduces ceremony while protecting material boundaries
### HYP-GOV-003 — Stable context-prefixed ADR IDs scale better than global sequential numbering
### HYP-GOV-004 — Fitness functions provide better drift control than documentation review alone for mechanically testable rules
### HYP-GOV-005 — Machine-readable traceability may become valuable after C5 matrices stabilize
### HYP-GOV-006 — Explicit deprecation gates prevent legacy re-expansion during strangler
### HYP-GOV-007 — Periodic architecture audit is more useful than permanent review of low-risk local changes
### HYP-GOV-008 — Technology-adoption ADRs with exit strategy reduce unnecessary lock-in/operational complexity

---

# 25. Cross-owner duplicate/open relationships

Some Open Decisions intentionally appear in several contexts. C4 does not create duplicate authority.

| Subject | Canonical owner | Related queues |
|---|---|---|
| Minors | Security | Product, Identity |
| Public Match visibility | Match/Security policy jointly, Security owns privacy constraint | Product, Realtime, Security |
| Match offline scope/TTL | Match | Offline, Reliability |
| Rating missing-data/skill rubric | Team Formation/Rating semantics | Product, Identity |
| RPO/RTO/SLO | Reliability/Operations | Performance, Observability |
| Worker runtime | Operations | Notifications, Media, API |
| Command receipt retention | Data/API | Reliability |
| Broker adoption | Performance/Operations | Notifications |
| MatchEvent partitioning | Data | Performance |
| Old-client compatibility window | Operations/Migration | API, Realtime |
| Backup topology/Storage backup | Operations/Reliability | Security privacy restore |

When one is closed, related registry items are updated to point to the same ADR/policy rather than independently choosing different answers.

---

# 26. Closure protocol

For each Open Decision:

```text
1. owner confirms scope
2. blocking classification confirmed
3. alternatives documented
4. evidence/product/legal input gathered
5. decision made
6. material choice → ADR
7. affected invariants/matrices/tests updated
8. migration/compatibility impact updated
9. Open Decision marked DECIDED with canonical reference
```

For each Hypothesis:

```text
1. define measurable falsification/validation evidence
2. collect evidence
3. VALIDATED or FALSIFIED
4. update architecture if falsified
5. create/revisit ADR only when material architecture choice follows
```

---

# 27. C5 blocking queue

C5 may build matrices without closing every Open Decision. It must expose unresolved cells instead of inventing answers.

Highest-priority unresolved families for C5 include:

```text
capability/admin override details
public/private read surfaces
PlayerAccountLink approval
Registration reopen/ineligible state
skill rubric + missing resolver + objective/tie policy
Match correction/control/capture/spectator policies
Competition officialization/roster policies
Stats capture/eligibility/public ranking policies
notification privacy/retention/channel choices
media limits/attachment authority
local account/storage/recovery policy details
Realtime public/private revocation details
retention/backup/RPO/RTO
AAL2 and privacy/legal processing decisions
DB/RLS test harness and release gates
migration anomaly/cohort policies
```

Each unresolved C5 matrix cell links back to one of these IDs rather than using `TBD` with no owner.

---

# 28. Non-loss assertion

The registry intentionally does not rewrite every paragraph from every C2 `OPEN`/`HYPOTHESIS` section. The complete local text remains normative in those chapters.

The preservation model is:

```text
C2 owner chapter
= exact local unresolved detail

C4 registry
= stable global ID + owner + blocking/evidence relationship

C3 ADR
= only after decision is actually accepted
```

Therefore C4 consolidation removes ambiguity of ownership without converting unresolved material into false certainty.