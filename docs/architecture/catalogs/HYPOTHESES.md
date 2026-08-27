# Hypothesis Catalog — Volley

> Status: `DRAFT-CANONICAL / C4 / C7-R5-UPDATED`
>
> Owner: `Architecture Governance + listed hypothesis owners`
>
> Index: [`C4-INDEX.md`](./C4-INDEX.md)

---

# 0. Rule

A hypothesis is a testable claim, not an accepted architecture guarantee.

```text
HYPOTHESIS
→ observe / measure / prototype
→ SUPPORTED or REFUTED
→ if a material choice follows, create/update ADR
```

Every record starts as `UNVALIDATED` unless the row explicitly says otherwise.

For I0/I1 safety/correctness boundaries, an unvalidated hypothesis may influence optimization/rollout choices but cannot be the only protection of the invariant.

---

# 1. Product Experience hypotheses

| ID | Claim | Evidence expected | Review trigger |
|---|---|---|---|
| `HYP-PX-001` | Court-first offline Match controller using lease/sequence/epoch/reconciliation may provide better product availability than strict-online universal control | Field prototype, disconnect/takeover/reconnect failure tests, recovery UX results | Before broad Community offline Match rollout; coordinates with `OPEN-MATCH-001` |
| `HYP-PX-002` | Tie/no-vote Team Voting can initially fall back to the best candidate by trusted multidimensional objective | Voting simulations/user feedback/fairness comparison | Before freezing `OPEN-BAL-007` |
| `HYP-PX-003` | Stale/freshness UX thresholds can vary by screen without confusing users if authority/freshness states are explicit | Usability testing and reconnect/offline telemetry | When C5 screen/query freshness matrix is implemented |

---

# 2. Identity / Player hypotheses

| ID | Claim | Evidence expected | Review trigger |
|---|---|---|---|
| `HYP-ID-001` | V1 can enforce at most one ACTIVE PlayerAccountLink per User and per Player | Product account-link scenarios, duplicate/claim data inventory | Before schema constraints are frozen; refute if legitimate multi-profile requirement appears |
| `HYP-ID-002` | Globally unique username can remain the primary controlled discovery handle | Collision/rename/support/privacy usage evidence | Before public discovery expansion or username policy change |
| `HYP-ID-003` | Player Merge should be treated as high-security operation with MFA/step-up for privileged actors | Threat model, merge incident/blast-radius analysis | Before MergePlayers production enablement |

---

# 3. Community hypotheses

| ID | Claim | Evidence expected | Review trigger |
|---|---|---|---|
| `HYP-COM-001` | Previous Owner can become ADMIN after ownership transfer as a reasonable default | Product governance scenarios/user expectations | Before ownership-transfer policy is frozen |
| `HYP-COM-002` | OWNER/ADMIN approval is sufficient for JoinRequests; a Moderator governance role is unnecessary initially | Existing moderator usage inventory + product needs | C6 legacy moderator migration / if delegated moderation becomes common |
| `HYP-COM-003` | A small static contextual capability map is preferable to persisted per-Community role-capability overrides in V1 | Number of real exceptions, authorization maintenance complexity | When a genuine per-Community permission customization requirement appears |
| `HYP-COM-004` | Archived Communities can be restored unless compliance/product policy later forbids it | Restore/archive product cases + retention/privacy requirements | Before RestoreCommunity feature ships |

---

# 4. Session hypotheses

| ID | Claim | Evidence expected | Review trigger |
|---|---|---|---|
| `HYP-SES-001` | Initial lifecycle can remain `DRAFT → SCHEDULED → IN_PROGRESS → COMPLETED` with `CANCELLED` alternate | State-machine validation against actual Session journeys | Before target Session schema/lifecycle enum freeze |
| `HYP-SES-002` | A play-mode dimension equivalent to `FREE_PLAY | STRUCTURED_MATCHES` covers initial operational needs | Product journey inventory, Competition separation review | Before final enum naming (`OPEN-SES-001`) |
| `HYP-SES-003` | One primary RegistrationWindow per Session is enough in V1 | Product registration use cases | Refute when multiple windows/slot pools are required |
| `HYP-SES-004` | Owner/Admin recovery can be modeled as explicit administrative override capability without making them permanent Organizers | Recovery scenarios + authorization negative tests | Before Session recovery tooling ships |

---

# 5. Registration hypotheses

| ID | Claim | Evidence expected | Review trigger |
|---|---|---|---|
| `HYP-REG-001` | Rejoin after withdrawal should create a new RegistrationEntry rather than revive the previous row | Audit/query simplicity + product history UX | Before physical schema/command contract freeze |
| `HYP-REG-002` | WAITLISTED requires `queue_sequence`; confirmed entry may keep original sequence separately for audit without affecting queue authority | Schema/query tests and historical reporting needs | During Data/C5 model design |
| `HYP-REG-003` | Reopen should exist only before Session start and explicitly stale downstream roster/TeamDraw | Product reopen scenarios + staleness tests | Before `OPEN-REG-006` closes |
| `HYP-REG-004` | Organizer-added participant should use a dedicated semantic command rather than overloading self-join | Authorization/audit clarity in organizer workflows | Before organizer-managed Registration UI/API |

---

# 6. Team Formation / Voting hypotheses

| ID | Claim | Evidence expected | Review trigger |
|---|---|---|---|
| `HYP-BAL-001` | Simulated Annealing remains a useful initial default search algorithm | Solution-quality/runtime benchmark across realistic rosters | Before final algorithm version is frozen; replace if simpler/better approach wins |
| `HYP-BAL-002` | Three candidate options provide a useful default portfolio | Organizer/user choice behavior and diversity measurements | Product voting/choice validation |
| `HYP-BAL-003` | Plurality is an adequate first voting method | User comprehension, tie frequency, fairness/product feedback | Before broader voting rollout |
| `HYP-BAL-004` | Tie/no-vote fallback can select highest trusted multidimensional objective candidate | Simulated/real tie cases and organizer acceptance | Before `OPEN-BAL-007` resolution |
| `HYP-BAL-005` | Weighted normalized objective is a plausible baseline, but must be compared to minimax/lexicographic/hybrid | Differential solver benchmarks and fairness review | Before `OPEN-BAL-002/003` resolution |
| `HYP-BAL-006` | Confidence should initially remain diagnostic rather than a hidden optimization weight | Compare candidate quality/stability under confidence-aware experiments | If enough confidence data exists to test `OPEN-BAL-011` |

---

# 7. Competition hypotheses

| ID | Claim | Evidence expected | Review trigger |
|---|---|---|---|
| `HYP-COMP-001` | Explicit officialization should be default for formal Competition; selected social formats may support controlled auto-officialize | Product format classification, correction/risk analysis | Before `OPEN-COMP-002` closes |
| `HYP-COMP-002` | Standings projection may be eventually consistent after durable OfficialResult if UX converges quickly | Projection-lag benchmarks/user expectations | Before defining projection SLOs |
| `HYP-COMP-003` | Relational Postgres is sufficient for bracket/dependency/standings at foreseeable scale | Query/load/maintenance measurements | If graph complexity/query load crosses measured threshold |

---

# 8. History / Statistics hypotheses

| ID | Claim | Evidence expected | Review trigger |
|---|---|---|---|
| `HYP-STAT-001` | **SUPPORTED / RESOLVED-NAMING (C7-R5):** `PlayerMatchStatContribution` is the canonical architecture term for the per-Player, per-Match rebuildable statistical contribution | C5 Entity Catalog + C7 domain-language review completed; Glossary normalized | Resolved 2026-08-26; reopen only if implementation evidence reveals a materially misleading boundary before physical schema freeze |
| `HYP-STAT-002` | Typed core stat columns plus versioned metadata is more practical than pure EAV | Query evolution/performance/schema-change analysis | Before stats projection schema freeze |
| `HYP-STAT-003` | Hot global/player Career projections should be materialized; rarer filters may query contributions on demand | Query frequency/latency measurements | After first production stats usage baseline |
| `HYP-STAT-004` | StatisticalEligibility can be deterministic with materialized current result/checkpoint where useful | Eligibility policy complexity and rebuild tests | Before official ranking/report eligibility implementation |

---

# 9. Realtime hypotheses

| ID | Claim | Evidence expected | Review trigger |
|---|---|---|---|
| `HYP-RT-001` | Supabase private Broadcast from trusted DB/server path is sufficient for V1/V2 without separate realtime broker | Fan-out/egress/latency/reconnect tests under expected spectator load | `OPEN-RT-006` threshold reached or provider limitations observed |
| `HYP-RT-002` | Most Session/Competition updates are simpler/safer as invalidation + authoritative refetch than rich delta replication | Payload/query/UX measurements and implementation complexity | If refetch volume/latency becomes material |
| `HYP-RT-003` | Match spectator event may include a small projection delta/summary if measured UX benefit justifies it | Payload/latency/client complexity benchmark | Before adding projection delta to public/private event contract |

---

# 10. Data Architecture hypotheses

| ID | Claim | Evidence expected | Review trigger |
|---|---|---|---|
| `HYP-DATA-001` | `public + app_private` is sufficient initial schema split; schema-per-context is unnecessary | Migration/grant/generated-type/cross-FK experience | If namespace/security/operational pain grows materially |
| `HYP-DATA-002` | `app_private` can hold command receipts, outbox, worker/checkpoint/internal support coherently | Implementation/grant/RPC ergonomics | If provider constraints or ownership become problematic (`OPEN-DATA-002`) |
| `HYP-DATA-003` | MatchEvent can remain unpartitioned at initial scale | Table/index/vacuum/restore measurements | `OPEN-PERF-005` trigger |
| `HYP-DATA-004` | Historical source tables will usually prefer semantic invalidation/archive over hard delete | Retention/privacy/domain lifecycle experience | When specific data class requires deletion semantics |

---

# 11. API / Application hypotheses

| ID | Claim | Evidence expected | Review trigger |
|---|---|---|---|
| `HYP-API-001` | Stable product error codes are easier to govern by bounded-context prefixes than one giant enum | Error catalog growth/consumer ergonomics | C5 Error Catalog implementation |
| `HYP-API-002` | `command_receipts` should live in `app_private` with finite retention | DB/security/idempotency implementation experience | Before `OPEN-API-002` retention/schema freeze |
| `HYP-API-003` | Keyset pagination should be default for large user-facing feeds | Feed mutation/deep-page performance tests | When actual feed/list shapes are known |
| `HYP-API-004` | Runtime schemas should be centralized at contract boundaries rather than hand-validated field by field | Tooling/maintenance/error-rate comparison | `OPEN-API-001` implementation choice |

---

# 12. Performance / Scalability hypotheses

| ID | Claim | Evidence expected | Review trigger |
|---|---|---|---|
| `HYP-PERF-001` | Client Web Worker is sufficient for the real Team Formation envelope | Runtime/memory/quality benchmark on official device/roster classes | `OPEN-BAL-012` / `OPEN-PERF-003` |
| `HYP-PERF-002` | Single Postgres with correct indexes/read models covers expected initial growth | DB CPU/query/lock/load tests and production baseline | Saturation or cost trigger before adding replicas/specialized infra |
| `HYP-PERF-003` | Resource-scoped Broadcast handles initial spectator fan-out without extra distribution layer | spectator fan-out/egress/reconnect load test | `OPEN-PERF-004` / `OPEN-RT-006` |
| `HYP-PERF-004` | Registration hot-row contention remains acceptable with short per-Window transaction and correct indexes | burst concurrency benchmarks including invariant checks | Lock-wait/latency budget violation |
| `HYP-PERF-005` | Route-level lazy loading yields material initial-load benefit after bundle baseline | bundle analyzer + constrained mobile measurements | After baseline; reject if waterfall/complexity cost outweighs gain |

---

# 13. Observability hypotheses

| ID | Claim | Evidence expected | Review trigger |
|---|---|---|---|
| `HYP-OBS-001` | Vendor-neutral/OpenTelemetry-compatible propagation reduces future tracing lock-in | Integration cost/vendor portability assessment | When distributed tracing is adopted materially |
| `HYP-OBS-002` | Initially, structured logs + essential metrics + provider/platform observability may be sufficient without a dedicated collector | Incident/debug capability and signal gaps | When causal/debug gaps or scale justify collector/tracing stack |
| `HYP-OBS-003` | Specialized frontend error tracking becomes worthwhile as external production usage grows | Crash volume/support cost/browser diagnostic quality | Production usage/error-support threshold |

---

# 14. Testing / QA hypotheses

| ID | Claim | Evidence expected | Review trigger |
|---|---|---|---|
| `HYP-QA-001` | Local Supabase/PostgreSQL harness integrated into CI offers best DB/RLS/RPC fidelity/cost trade-off | Fidelity comparison, CI runtime, provider delta list | `OPEN-QA-002` implementation spike |
| `HYP-QA-002` | TypeScript property-based testing materially improves confidence in Registration/Balancer/Match/Rating | Defects/counterexamples found, maintenance/runtime cost | After pilot on I0/I1 invariants in Q0/Q1 QA-risk families |
| `HYP-QA-003` | DB integration/concurrency gates can run on PR/merge without unacceptable feedback time if tests isolate aggregate data/parallelize safely | CI duration/flakiness/resource metrics | Before making all such suites blocking |

---

# 15. Operations hypotheses

Existing source IDs are preserved.

| ID | Claim | Evidence expected | Review trigger |
|---|---|---|---|
| `HYP-OPS-001` | Supabase local stack is sufficient for most CI DB fidelity; Realtime/Auth/Storage deltas can be handled separately | CI/provider comparison and escaped integration gaps | `OPEN-OPS-007` |
| `HYP-OPS-002` | On-demand staging/rehearsal is sufficient initially | Frequency, setup time, missed environment-specific issues | `OPEN-OPS-005`; consider persistent staging if rehearsal burden grows |
| `HYP-OPS-003` | Serverless/managed workers suffice initially | queue depth/age, job duration, cold starts, execution limits | `OPEN-OPS-012`; dedicated worker if limits become structural |
| `HYP-OPS-004` | Static hosting + Supabase remains simpler than dedicated app server at current scale | deployment/ops/security/cost comparison | If server-side application responsibilities materially expand |
| `HYP-OPS-005` | Provider backup features can meet initial RPO/RTO needs | actual plan capabilities + successful restore drills | Before any numerical RPO/RTO promise |
| `HYP-OPS-006` | Supported old-client window can remain short | long-lived browser/PWA version telemetry | Before `OPEN-MIG-004` contract-window decision |

---

# 16. Migration / Strangler hypotheses

Existing source IDs are preserved.

| ID | Claim | Evidence expected | Review trigger |
|---|---|---|---|
| `HYP-MIG-001` | Most new shared aggregates can cut over by “new resources only” cohorts before historical backfill | First W2–W7 rollout experience | If cross-cohort UX/data dependencies make new-only impractical |
| `HYP-MIG-002` | Finished legacy Games contain enough score/result evidence for useful historical Match import even with partial detailed events | Data inventory/parity sample | Before historical Game→Match backfill |
| `HYP-MIG-003` | Only a small number of ambiguous Player/evaluation/community records require manual review | Production anomaly inventory/count | Before building expensive self-service resolution tooling |
| `HYP-MIG-004` | Temporary one-way legacy read adapters are cheaper/safer than synchronized UI rewrite | Adapter count/defect/latency/removal effort | If compatibility burden exceeds coordinated rewrite cost |
| `HYP-MIG-005` | Browser local data volume is small enough for key-by-key one-time IndexedDB import without native tooling | Real localStorage size/entity distribution on devices | Before W12 importer implementation |
| `HYP-MIG-006` | Old-client compatibility window can remain bounded once release observability exists | version-family telemetry | Before contract/removal waves |
| `HYP-MIG-007` | Global sync can be decomposed incrementally without building a second universal sync framework | Vertical-slice rollout through multiple contexts | If a real common protocol need emerges rather than generic convenience |
| `HYP-MIG-008` | Most historical Championship structures map to one target Stage + Fixtures | Real Championship data/schema/format inventory | Before Competition historical backfill |

---

# 17. Architecture Governance hypotheses

Existing source IDs are preserved.

| ID | Claim | Evidence expected | Review trigger |
|---|---|---|---|
| `HYP-GOV-001` | Markdown + CI fitness functions are sufficient governance tooling at current team size | Searchability/drift/review overhead | Team/corpus growth or recurring governance failures |
| `HYP-GOV-002` | Targeted dependency/schema/security fitness functions + context-owner review catch most architecture drift | C7 findings and post-C7 regression history | Repeated drift escaping current controls |
| `HYP-GOV-003` | Generated traceability/index artifact becomes useful after C3/C4, but structured Markdown may suffice initially | C5/C6/C7 manual maintenance effort | If manual cross-links become error-prone |
| `HYP-GOV-004` | Risk-triggered Architecture Review keeps review load manageable | number/duration of AR2/AR3 reviews and escaped issues | Team/process growth |
| `HYP-GOV-005` | Legacy-adapter deprecation telemetry can be implemented with current observability capabilities | C6 removal evidence quality/cost | If usage cannot be measured reliably |
| `HYP-GOV-006` | Current directory/layer model can evolve incrementally without package-per-context monorepo split | dependency/circularity/build/team-ownership metrics | If boundaries cannot be enforced pragmatically |
| `HYP-GOV-007` | C7 will find a manageable number of true contradictions because C2 shares Principles/Glossary | Actual C7 issue count/severity | C7 completion |
| `HYP-GOV-008` | Most current `src/architecture` tests can evolve into useful target fitness functions instead of wholesale replacement | Classification of each test: protected target invariant vs legacy lock-in | C5/C7 architecture-test audit |

---

# 18. Cross-context hypothesis convergence

Some hypotheses describe the same uncertainty from different layers and should be validated together rather than independently:

```text
HYP-PX-001
HYP-MATCH/OFF concern embodied by OPEN-MATCH-001
HYP-PERF/REL offline constraints
→ one Community-offline-Match validation program
```

```text
HYP-PX-002
HYP-BAL-004
→ same tie/no-vote experiment
```

```text
HYP-RT-001
HYP-PERF-003
→ same Realtime spectator capacity evidence
```

```text
HYP-DATA-003
OPEN-PERF-005
→ same MatchEvent partitioning trigger evidence
```

```text
HYP-QA-001
HYP-OPS-001
→ same local-vs-provider integration-fidelity evidence
```

```text
HYP-OPS-006
HYP-MIG-006
→ same old-client telemetry/compatibility evidence
```

No hypothesis is considered supported merely because another document repeats it.

---

# 19. Evidence outcome rule

When evidence arrives, update this catalog explicitly:

```text
UNVALIDATED
→ SUPPORTED
or
→ REFUTED
```

Then:

- if the material architecture remains unchanged, preserve the hypothesis outcome as evidence;
- if evidence changes a material choice, create/supersede the owning ADR;
- if evidence affects only a numeric operational parameter, update the relevant OPEN decision/config/runbook without pretending the hypothesis itself is an ADR.

Refuted hypotheses remain discoverable. They are useful evidence against repeating the same assumption later.
