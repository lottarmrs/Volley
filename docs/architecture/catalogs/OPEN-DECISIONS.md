# Open Decision Catalog — Volley

> Status: `DRAFT-CANONICAL / C4`
>
> Owner: `Architecture Governance + listed decision owners`
>
> Index: [`C4-INDEX.md`](./C4-INDEX.md)
>
> Rule: an Open Decision is **not** an implementation default. The owning N2 chapter preserves the full original reasoning.

---

# 0. Record semantics

Each row records:

```text
ID
Question
Current safe behavior
Evidence / decision trigger
```

The section owner is the primary decision owner unless the row explicitly aliases a cross-context owner.

`Current safe behavior` is deliberately conservative. When C2 did not define a safe default, this catalog says so instead of inventing one.

Canonical statuses used here:

- **OPEN** — unresolved and active;
- **BLOCKING** — unresolved and must close before a named irreversible/security/correctness-sensitive dependency;
- **DEFERRED** — current architecture intentionally keeps the broader feature absent;
- **RESOLVED_C3/C4** — process question actually answered by consolidation.

---

# 1. Product Experience source concerns

Primary source: `N2.01-product-experience.md`.

| Source ID | Question | Current safe behavior | Evidence / trigger |
|---|---|---|---|
| `OPEN-PX-001 → OPEN-SEC-003` | Final policy for minors and onboarding/privacy impact | Do not knowingly expand minors-specific onboarding/processing without Security/Privacy decision | Product/legal/privacy decision before minors-targeted release |
| `OPEN-PX-002 → OPEN-RATING-001` | Final robust statistical policy for aggregation of evaluations | Preserve versioned source evaluations; do not invent mean/median/Bayesian policy silently | Real evaluation distribution + sports/fairness analysis |
| `OPEN-PX-003 → OPEN-RATING-002` | Future credibility criteria for a Community in Global Skill Profile | Equal Community-level contribution remains the architectural baseline; do not add hidden credibility weight | Evidence of abuse/quality differences + fairness analysis |
| `OPEN-PX-004 → OPEN-SEC-007` | Which Match/Competition surfaces are public vs Community-only | Protected/private-by-default DTO/channel posture | Explicit product/privacy spectator decision |

---

# 2. Identity / Player Open Decisions

Primary owner: Identity / Player, with Security/Privacy where noted.

| ID | Question | Current safe behavior | Evidence / trigger |
|---|---|---|---|
| `OPEN-ID-001` | Exact approval policy for PlayerAccountLink claim when Player was created by third parties/legacy | Conflict/unclear provenance routes to explicit review; UUID/username never sufficient | Inventory claim scenarios + abuse/security review before broad claim flow |
| `OPEN-ID-002` | Whether Player can become completely undiscoverable by username | Discovery remains minimal/purpose-limited; do not expose directory | Product/privacy decision before discovery expansion |
| `OPEN-ID-003` | Historical display name vs current Player name by UI surface | Preserve historical snapshot/provenance; presentation may use current identity only where policy explicitly chooses it | UX/privacy/history requirements per surface |
| `OPEN-ID-004` | Future support for multiple sports profiles per one account | V1 remains one explicit active Player link per account as hypothesis; no multi-profile UI/schema assumption | Real use case requiring multiple identities/profiles |
| `OPEN-ID-005` | Detailed treatment of physical/health data and minors | Health/physical limitation data is not generic public Player data and is not automatically consumed by balancer; minors portion aliases `OPEN-SEC-003` | Privacy/legal/product purpose before collection/use |

---

# 3. Community Open Decisions

Primary owner: Community.

| ID | Question | Current safe behavior | Evidence / trigger |
|---|---|---|---|
| `OPEN-COM-001` | Exact enum/model for visibility, discoverability and join-policy combinations | Keep these concepts separate; no implicit coupling | Product discovery/join requirements before schema/API freeze |
| `OPEN-COM-002` | Whether V1 supports `OPEN_JOIN` or only approval/invite flows | Approval/request flow is the known safe path; do not infer open join | Product requirement for frictionless join |
| `OPEN-COM-003` | Exact migration/treatment of legacy `moderator` memberships | Do not promote all moderators to Admin automatically | Real usage/data inventory + capability audit |
| `OPEN-COM-004` | Whether Admin may Archive Community or only Owner | No permission by hierarchy assumption; capability must be explicit | Governance product policy before command grant |
| `OPEN-COM-005` | Exact administrative recovery override for Owner/Admin over Organizer-owned Sessions | Override only through explicit capability/semantic recovery command; no silent inheritance | Operational recovery scenarios + security review |
| `OPEN-COM-006` | First-class `CommunityInvitation` in V1 or later | Do not encode invitation as fake Membership state | Product invitation requirement |
| `OPEN-COM-007` | Retention period/details for rejected/withdrawn JoinRequests | Preserve only as required by audit/product/privacy policy; no arbitrary forever/delete-now default | Privacy/operations retention decision |

---

# 4. Session Open Decisions

Primary owner: Session.

| ID | Question | Current safe behavior | Evidence / trigger |
|---|---|---|---|
| `OPEN-SES-001` | Final names/enums for Session context and play mode | Preserve semantic separation Quick/Community and free-play/structured without coupling to `tournament` | C5 Entity/State catalog naming review |
| `OPEN-SES-002` | Exact unpublish policy after registrations exist | Do not silently unpublish in a way that erases Registration truth; require explicit domain rule | Product workflow before implementing Unpublish command |
| `OPEN-SES-003` | One principal Organizer + auxiliaries versus equivalent SessionOrganizerAssignments | Assignments remain explicit; no principal hierarchy assumed | Real multi-organizer workflow requirements |
| `OPEN-SES-004` | Detailed roster-change policy after Session `IN_PROGRESS` | Use explicit `SessionRosterAdjustment`; do not mutate historical pre-start roster | Match/substitution/product requirements |
| `OPEN-SES-005` | Final runtime Court Rotation model for multiple courts | Keep rotation config distinct from Match/court runtime state | Multi-court product prototype |
| `OPEN-SES-006` | Whether one Session can host Competition Fixtures and free-play simultaneously | Do not infer cross-mode behavior; Fixture/Match identity stays separate | Concrete mixed-event requirement |

---

# 5. Registration Open Decisions

Primary owner: Registration.

| ID | Question | Current safe behavior | Evidence / trigger |
|---|---|---|---|
| `OPEN-REG-001` | Unlimited-capacity RegistrationWindow vs omit Registration when capacity irrelevant | Do not invent a magic “infinite” number; choose explicit product semantics | Product flow needing sign-up without capacity |
| `OPEN-REG-002` | State/policy for waitlisted entry becoming temporarily ineligible | Promotion must revalidate and skip/block safely; no silent confirmation | Membership/link eligibility scenarios + audit UX |
| `OPEN-REG-003` | Exact numeric waitlist position visible to member vs coarser status | Return minimum necessary status; do not expose full queue identities | Product/privacy validation |
| `OPEN-REG-004` | Future protected/reserved slot categories | **DEFERRED** — not V1; strict FIFO remains baseline | New quota/category requirement requires fairness ADR |
| `OPEN-REG-005` | Future cancellation/refund/payment concepts attached to Registration | **DEFERRED** — payment out of current scope | Product/business/payment scope decision |
| `OPEN-REG-006` | Exact Reopen semantics after a roster revision exists | Reopen cannot silently preserve downstream artifacts as current; stale/revision behavior required | Product need for reopen + concurrency/design review |

---

# 6. Team Formation / Rating / Voting Open Decisions

Primary owner: Team Formation, except cross-context Rating questions that C5/C7 must assign to an explicit Skill Profile owner.

| ID | Question | Current safe behavior | Evidence / trigger |
|---|---|---|---|
| `OPEN-BAL-001` | Final canonical skill dimensions/rubric | Use only explicitly versioned available attributes; Overall remains excluded | Sports/product rubric workshop + historical data analysis |
| `OPEN-BAL-002` | Exact objective aggregation formula and per-dimension weights | No formula is “obvious”; version any temporary experimental configuration | Simulation/benchmark/fairness review |
| `OPEN-BAL-003` | Weighted sum vs minimax vs lexicographic vs hybrid fairness objective | Compare alternatives; hard constraints remain non-negotiable | Candidate-quality benchmark + organizer evaluation |
| `OPEN-BAL-004` | Portfolio diversity metric and threshold | Deduplicate equivalent assignments; do not invent arbitrary threshold | Solver experiment across realistic rosters |
| `OPEN-BAL-005` | Voting quorum policy | No hidden quorum; finalization follows only explicitly configured policy | Product validation of participant voting |
| `OPEN-BAL-006` | Whether voters can change vote until close globally or configurable | Do not assume per-Community configurability until modeled; one effective ballot invariant remains | Product policy before VotingRound contract freeze |
| `OPEN-BAL-007` | Exact tie/no-vote policy after product validation | Current candidate best-objective fallback remains hypothesis, not guarantee | User testing + fairness analysis |
| `OPEN-BAL-008` | Which position/composition rules are hard vs soft defaults | Treat as hard only when policy explicitly says so | Sports rules/product configuration review |
| `OPEN-BAL-009` | Whether gender/physical dimensions participate | Absent from canonical optimization unless explicit legitimate product/privacy policy exists | Product + Security/Privacy decision |
| `OPEN-BAL-010` | Final cold-start/missing-attribute resolver | Missing never becomes zero; resolver must be versioned | Historical-data distribution + fairness benchmark |
| `OPEN-BAL-011` | Future use of confidence in optimization | Confidence remains diagnostic unless explicit versioned policy | Evidence that confidence-aware objective improves fairness |
| `OPEN-BAL-012` | Conditions for server-side full search instead of client Worker | Client Worker remains baseline while measured envelope is adequate | Device/runtime/scale benchmarks |
| `OPEN-RATING-001` | Robust within-Community and global aggregation estimator | Preserve hierarchical per-Community/per-attribute architecture; estimator unresolved | Real evaluator distribution, outlier/abuse simulations, sports validation |
| `OPEN-RATING-002` | Community credibility weighting in Global Skill Profile | No hidden credibility weighting; Community-level aggregation prevents evaluator-count dominance | Evidence of quality/abuse requiring explicit policy |

---

# 7. Live Match Open Decisions

Primary owner: Live Match.

| ID | Question | Current safe behavior | Evidence / trigger |
|---|---|---|---|
| `OPEN-MATCH-001` | Community offline live scoring in V1 vs feature-gated later | Online path is prerequisite; offline continuation may remain feature-gated | Prototype + reconciliation/failure tests before broad rollout |
| `OPEN-MATCH-002` | Lease TTL / heartbeat / offline grace duration | No permanent 10min/2min magic values; current epoch semantics remain | Real court/network telemetry + takeover UX testing |
| `OPEN-MATCH-003` | Post-finish correction capabilities: technical vs winner/result-changing | Do not give broad correction power through Organizer role; Competition official result remains separate | Security/governance correction workflow design |
| `OPEN-MATCH-004` | CaptureMode ownership/default inheritance | Rules/capture choice freezes before Match; exact Community→Session→Match source unresolved | Product/statistics capture requirements |
| `OPEN-MATCH-005` | V1 lineup depth: serve order/rotation/libero/substitution | Stage advanced lineup features without contaminating basic score engine | Volleyball rules/product scope |
| `OPEN-MATCH-006 → OPEN-SEC-007` | Spectator visibility public vs Community-only/private | Private/contextual by default; public needs separate DTO/channel | Product/privacy decision |
| `OPEN-MATCH-007` | Legitimate manual finish cases outside Rules Engine | Normal finish remains rule-engine governed; exceptions require semantic reason/policy | Real operational exception cases |
| `OPEN-MATCH-008` | Final MatchEvent taxonomy | Keep minimal; add event only for rule/audit/stat/recovery need | Domain requirements as capture features expand |

---

# 8. Competition Open Decisions

Primary owner: Competition.

| ID | Question | Current safe behavior | Evidence / trigger |
|---|---|---|---|
| `OPEN-COMP-001` | Exact Stage type catalog for first release | Implement only formats required by selected release; avoid speculative hierarchy | Product competition formats |
| `OPEN-COMP-002` | Which formats/conditions allow auto-officialization | Formal path uses explicit officialization unless policy deliberately says otherwise | Product/governance risk analysis |
| `OPEN-COMP-003` | Transfer/roster-change policy during Competition | Historical MatchRoster never rewrites; future changes require new roster revision/policy | Competition rules requirement |
| `OPEN-COMP-004` | Multi-leg Fixture vs separate Fixture per leg | No implicit representation; each execution remains distinct Match | Concrete two-leg format design |
| `OPEN-COMP-005` | Captain-negotiated reschedule policy | Captain is not admin; request/approval path remains explicit | Product workflow for negotiated schedule |
| `OPEN-COMP-006` | Which awards are official source facts vs presentation projections | Derived awards remain projections unless product explicitly officializes them | Product/reporting requirement |
| `OPEN-COMP-007` | Future public/intercommunity Competition requirements | V1 Community scope remains; do not weaken isolation in advance | Product requirement for public/intercommunity competitions |

---

# 9. History / Statistics Open Decisions

Primary owner: History / Statistics.

| ID | Question | Current safe behavior | Evidence / trigger |
|---|---|---|---|
| `OPEN-STAT-001` | Exact stat taxonomy for BASIC_STATS vs DETAILED | Publish only metrics whose capture coverage supports them | MatchEvent/CaptureMode design |
| `OPEN-STAT-002` | `gamesPlayed` when rostered but never enters court | Do not infer effective participation from current Team; preserve participation semantics explicitly | Lineup/substitution capture scope |
| `OPEN-STAT-003` | Abandoned Match eligibility by reason/scope | Do not count as normal finished Match automatically | Product/statistical policy per abandon reason |
| `OPEN-STAT-004` | Which Player stats become public profile fields | None become public automatically because Player is global | Product/privacy public-profile decision |
| `OPEN-STAT-005` | Minimum sample/coverage rules per ranking | No hidden denominator/sample threshold | Metric-specific statistical/product review |
| `OPEN-STAT-006 → OPEN-ID-003` | Historical display current Player identity vs snapshot name | Preserve snapshot semantics; presentation decision per surface | UX/privacy/history decision |
| `OPEN-STAT-007` | Cryptographic/signature/export immutability for official reports beyond DB revisioning | Database revision/supersession remains baseline | Legal/competition document authenticity requirement |

---

# 10. Notifications Open Decisions

Primary owner: Notifications unless aliased.

Existing `OD-NOTIF-*` source IDs are preserved as aliases.

| Canonical ID | Source alias | Question | Current safe behavior / trigger |
|---|---|---|---|
| `OPEN-NOTIF-001` | `OD-NOTIF-001` | Push provider choice | Provider adapter boundary remains vendor-neutral; decide on operational/product requirements |
| `OPEN-NOTIF-002` | `OD-NOTIF-002` | Email provider and whether Email is V1 | Persistent Inbox does not depend on Email; add only if product needs it |
| `OPEN-NOTIF-003` | `OD-NOTIF-003` | Inbox retention period | Retention must be category/privacy/product justified |
| `OPEN-NOTIF-004` | `OD-NOTIF-004` | DeliveryAttempt retention period | Technical delivery history has independent bounded retention |
| `OPEN-NOTIF-005` | `OD-NOTIF-005` | Whether MarkUnread is permitted offline | Do not queue arbitrary shared commands; implement only if read-state semantics are proven safe/idempotent |
| `OPEN-NOTIF-006` | `OD-NOTIF-006` | Quiet-hours defaults/timezone semantics | No hidden quiet-hour schedule; server time/timezone policy required |
| `OPEN-NOTIF-007` | `OD-NOTIF-007` | Which urgent categories bypass quiet hours | No category bypass without explicit urgency policy |
| `OPEN-NOTIF-008` | `OD-NOTIF-008` | Whether all operational notifications remain in Inbox when external channels disabled | Inbox/provider separation remains; materialization policy decides |
| `OPEN-NOTIF-009` | `OD-NOTIF-009` | Read/open telemetry beyond `read_at` | Minimize telemetry until product need/privacy basis exists |
| `OPEN-NOTIF-010` | `OD-NOTIF-010` | Provider webhook needs per channel | Treat webhook input untrusted; choose after provider selection |
| `OPEN-NOTIF-011 → OPEN-OPS-012` | `OD-NOTIF-011` | Worker runtime | Operations owns runtime choice; Notifications owns handler semantics |
| `OPEN-NOTIF-012` | `OD-NOTIF-012` | Measured scale that justifies dedicated broker/queue | Postgres/outbox worker baseline until backlog/throughput/operations evidence triggers ADR |
| `OPEN-NOTIF-013` | `OD-NOTIF-013` | WhatsAppShareDraft remains Session-owned vs generic ShareArtifact | Keep separate from automated NotificationDelivery; ownership can evolve later |
| `OPEN-NOTIF-014` | `OD-NOTIF-014` | Legal basis/consent per communication purpose | Security/Privacy processing inventory must decide per purpose; no blanket consent |

---

# 11. Media Open Decisions

Primary owner: Media with Privacy/Security input where applicable.

| ID | Question | Current safe behavior | Evidence / trigger |
|---|---|---|---|
| `OPEN-MEDIA-001` | Max upload bytes per purpose | Enforce bounded limits, but do not invent final numbers | Device/network/provider benchmark + abuse/cost analysis |
| `OPEN-MEDIA-002` | Max decoded pixel budget | Processor must have a bound; number chosen from codec/memory benchmark/security review | Media processor benchmark |
| `OPEN-MEDIA-003` | Source dimension limits | Keep bounded; exact thresholds measured | Processor/device/product requirements |
| `OPEN-MEDIA-004` | Canonical output image dimensions | Purpose-specific variants; no one-size magic value | UI/product quality + bandwidth benchmark |
| `OPEN-MEDIA-005` | WebP/AVIF/JPEG quality settings | Versioned processing policy; measure quality/size/compatibility | Visual/bandwidth tests |
| `OPEN-MEDIA-006` | Orphan grace period | GC always reference-checks and uses grace; period unresolved | Upload abandonment/processing telemetry |
| `OPEN-MEDIA-007` | Raw incoming deletion delay | Raw not retained indefinitely; exact delay privacy/ops driven | Processing/recovery requirements |
| `OPEN-MEDIA-008` | Moderation retention | Separate moderation from processing; retention purpose-specific | Product/privacy moderation policy |
| `OPEN-MEDIA-009` | Upload rate limits | Abuse protection mandatory; exact thresholds measured | Production abuse/cost baseline |
| `OPEN-MEDIA-010` | AVIF/HEIC support | V1 raster allowlist remains; new formats need processing/security review | Device/product demand + codec safety |
| `OPEN-MEDIA-011` | CommunityPlayer contextual avatar | Do not duplicate media attachment concepts without real use case | Product requirement |
| `OPEN-MEDIA-012` | Who may propose avatar for accountless Player | No implicit Community Admin authority over global Player media | Capability/privacy workflow design |

---

# 12. Online / Offline Open Decisions

Primary owner: Platform Offline, with Live Match owner for Match timing.

| ID | Question | Current safe behavior | Evidence / trigger |
|---|---|---|---|
| `OPEN-OFF-001` | IndexedDB library/wrapper | Architecture depends on IndexedDB semantics, not a library; choose by maintenance/test needs | implementation spike |
| `OPEN-OFF-002` | Physical DB per account vs scoped records in one DB | Account isolation is invariant regardless of topology | security/storage implementation analysis |
| `OPEN-OFF-003` | Cache retention limits | Recreateable cache can be pruned independently; protect irreplaceable stores first | real device quota distribution |
| `OPEN-OFF-004` | Local storage warning thresholds | Fail closed for critical durable writes; thresholds measured | device quota/usage telemetry |
| `OPEN-OFF-005 → OPEN-MATCH-002` | Offline Match lease/grace duration | No magic duration; Match protocol owner decides from field evidence | court/network telemetry |
| `OPEN-OFF-006` | When to request `navigator.storage.persist()` | Do not assume persistence guarantee; decide from UX/browser support | browser/device testing |
| `OPEN-OFF-007` | Quick publish safe-boundary UX | Handoff remains explicit; HANDOFF_UNKNOWN blocks ambiguous continued authority | usability/failure testing |
| `OPEN-OFF-008` | Specialized live handoff for already-active Quick later | **DEFERRED**; generic publish does not migrate live Match mid-protocol | concrete product need + Match protocol ADR |
| `OPEN-OFF-009` | Anonymous-mode product exposure | Anonymous local data remains unclaimed until explicit policy | product/auth/privacy decision |
| `OPEN-OFF-010` | Local recovery/export UX for irreplaceable Quick/Match data | Do not discard irreplaceable data as cache | scale/support evidence before production offline expansion |
| `OPEN-OFF-011` | Cloud-backed non-critical drafts in future | Device-local V1; no multi-device merge assumption | product need for cross-device drafts |

---

# 13. Realtime Open Decisions

Primary owner: Realtime.

| ID | Question | Current safe behavior | Evidence / trigger |
|---|---|---|---|
| `OPEN-RT-001` | Final topic naming grammar and authorization helper | Resource-scoped private topics; names not domain authority | C5 channel matrix + implementation spike |
| `OPEN-RT-002` | Disable public channels globally from first release vs reserve public Match namespace | Private by default | `OPEN-SEC-007` product visibility decision |
| `OPEN-RT-003` | Immediate confidentiality revocation for already-connected private channel | Commands/queries reauthorize; payload minimized; do not promise instant socket revocation without tested provider mechanism | confidentiality requirement + Supabase behavior test |
| `OPEN-RT-004 → OPEN-SEC-007` | Public Match spectator surfaces in V1 | No public spectator surface by default | product/privacy decision |
| `OPEN-RT-005` | Resync/poll fallback intervals during provider outage | Reconcile by authoritative snapshot; interval not hard-coded as architecture | load/UX benchmark |
| `OPEN-RT-006` | When Match spectator scale requires dedicated distribution layer | Supabase resource Broadcast baseline while measured fan-out is adequate | spectator/egress/latency threshold evidence |

---

# 14. Data Architecture Open Decisions

Primary owner: Data.

| ID | Question | Current safe behavior | Evidence / trigger |
|---|---|---|---|
| `OPEN-DATA-001 → OPEN-API-002` | Retention window for command receipts; plus outbox/audit classes | Retention remains class-specific; API/Security/Privacy constraints apply | production idempotency/backlog/audit/privacy needs |
| `OPEN-DATA-002` | Whether some internal tables live in provider-specific schema rather than `app_private` | `public + app_private` remains target hypothesis; no browser grants for internals | Supabase/platform constraints |
| `OPEN-DATA-003 → OPEN-PERF-005` | Exact MatchEvent partitioning strategy after trigger | No partitioning by default | measured vacuum/index/restore/table-size pain |
| `OPEN-DATA-004` | Shared generic revision metadata helpers vs context-specific snapshot metadata | Prefer context semantics over abstraction unless repeated pattern is proven | schema implementation experience |
| `OPEN-DATA-005` | Materialized views vs ordinary projection tables/jobs for specific reads | Choose per freshness/write/rebuild/query needs; no universal projection technology | query/operational benchmark per projection |

---

# 15. API / Application Open Decisions

Primary owner: Application.

| ID | Question | Current safe behavior | Evidence / trigger |
|---|---|---|---|
| `OPEN-API-001` | Runtime validation library/convention | External boundaries require runtime validation; library is replaceable | implementation/maintenance evaluation |
| `OPEN-API-002` | Command receipt retention per command class | Finite retention; no claim of infinite idempotency | retry window, storage, privacy/audit requirements |
| `OPEN-API-003` | Which simple reads stay direct PostgREST SELECT vs Query RPC/view | Explicit safe/purpose DTO + RLS may use direct SELECT; aggregate/sensitive reads use deliberate read models | query/RLS/performance complexity |
| `OPEN-API-004` | External rate-limit provider/implementation if DB/provider mechanisms insufficient | Rate limiting supplements authorization; no bypass | abuse/traffic evidence |
| `OPEN-API-005` | Public API explicit version namespace beyond internal compatibility | No public API version hierarchy before product requirement | external integration/public API roadmap |

---

# 16. Security / Privacy / LGPD Open Decisions

Primary owner: Security / Privacy.

| ID | Question | Current safe behavior | Evidence / trigger |
|---|---|---|---|
| `OPEN-SEC-001` | Exact commands requiring mandatory AAL2 beyond initial high-risk set | Initial high-impact operations require/strongly target step-up; no UI-only enforcement | formal threat/risk review per command |
| `OPEN-SEC-002` | Session duration/password policy configuration | Use Auth provider secure baseline; do not encode secrets/policy in client | threat/product/support requirements |
| `OPEN-SEC-003` | Whether V1 accepts minors and under what policy | **BLOCKING before knowingly targeting minors**; do not drift into minors-specific product without deliberate policy | legal/privacy/product assessment |
| `OPEN-SEC-004` | Exact privacy retention periods per data category | Category-specific, purpose-limited; no universal forever/delete-now | processing inventory/legal/product requirements |
| `OPEN-SEC-005` | Controller/operator mapping for each provider | Inventory provider roles; do not assume | contracts/provider processing review |
| `OPEN-SEC-006` | Legal basis for each processing activity | Must be recorded per purpose; architecture does not invent it | Privacy/legal review |
| `OPEN-SEC-007` | Public spectator visibility policy for Match/Competition | Private/contextual by default; public uses separate minimized DTO/channel | product/privacy decision |
| `OPEN-SEC-008` | Whether evaluated Player can see evaluations and at what granularity | Raw evaluator notes/scores not exposed by default | product/privacy/fairness policy |
| `OPEN-SEC-009` | Internal support tooling / impersonation | **DEFERRED** — no ordinary impersonation in V1 by default | support-scale requirement + strong audit/step-up ADR |
| `OPEN-SEC-010` | External security-test cadence/trigger | Internal negative tests mandatory; external cadence evidence/risk driven | exposure/scale/risk change |
| `OPEN-SEC-011` | Exact rate limits/abuse thresholds | Rate-limit where needed but measure values; never substitute auth | traffic/abuse baseline |
| `OPEN-SEC-012` | Detailed physical/health-data collection/use policy | Do not collect/use as generic global field or balancer input without explicit purpose/privacy policy | concrete feature requirement + legal/privacy review |

---

# 17. Reliability Open Decisions

Primary owner: Reliability; existing source IDs are preserved.

| ID | Question | Current safe behavior | Evidence / trigger |
|---|---|---|---|
| `OPEN-REL-001` | Numerical RPO/RTO | No numeric claim without business requirement + tested infrastructure | backup/topology/business criticality evidence |
| `OPEN-REL-002` | Numeric SLO targets | Instrument/baseline first; no invented targets | production traffic/latency/product expectation |
| `OPEN-REL-003 → OPEN-API-002` | Command receipt retention | Finite class-specific retention | idempotency/storage/privacy evidence |
| `OPEN-REL-004 → OPEN-MATCH-001` | Broad Community Match offline availability scope | Online Match path first; constrained offline must pass reconciliation prototype/tests | field prototype/failure suite |
| `OPEN-REL-005 → OPEN-OFF-010` | Explicit local Quick/Match backup/export in V1 | Protect irreplaceable local data; export UX unresolved | offline usage/support risk |
| `OPEN-REL-006` | Provider-specific notification reconciliation | Provider-neutral semantics until provider capabilities known | provider idempotency/status API selection |
| `OPEN-REL-007` | Backup topology and regions | Never assume provider plan; verify actual deployed DB/Storage configuration | production plan selection/restore drill |
| `OPEN-REL-008` | Which integrity repairs are automatic vs manual | Auto-repair only where source + algorithm are unambiguous | per-integrity-rule design/recovery test |

---

# 18. Performance / Scalability Open Decisions

Primary owner: Performance + affected owner.

| ID | Question | Current safe behavior | Evidence / trigger |
|---|---|---|---|
| `OPEN-PERF-001` | Quantitative latency budgets by flow | Structural bounded-work rules apply; numeric target waits for baseline | production-like benchmark/product expectation |
| `OPEN-PERF-002` | Initial/route bundle budgets | Measure baseline first | constrained-mobile profiling |
| `OPEN-PERF-003` | Solver roster-size benchmark classes | Keep fixed-work policies versioned; define classes from real product envelope | roster distribution/product limits |
| `OPEN-PERF-004` | Max simultaneous spectators before architecture addition | Resource-scoped Realtime baseline | fan-out/egress/latency tests |
| `OPEN-PERF-005` | MatchEvent size/maintenance trigger for partitioning | No partitioning V1 by default | measured index/vacuum/restore/maintenance pain |
| `OPEN-PERF-006` | Projection lag targets | Freshness must be observable; numbers await usage requirements | production baseline + UX tolerance |
| `OPEN-PERF-007` | Worker backlog/oldest-age alert thresholds | Backlog age is mandatory signal; threshold measured | provider/queue baseline |
| `OPEN-PERF-008` | IndexedDB quota/pruning thresholds | Prune recreateable cache before irreplaceable data; exact values device-driven | device quota telemetry |
| `OPEN-PERF-009` | Media processing concurrency limits | Bounded concurrency/backpressure | processor CPU/memory/provider benchmark |
| `OPEN-PERF-010` | Performance tests in PR CI vs scheduled environment | Correctness tests remain gates; heavy load cadence unresolved | runtime/cost/flakiness data |
| `OPEN-PERF-011` | Official mobile hardware/device performance matrix | Do not claim universal device performance from developer machine | product audience/device analytics |
| `OPEN-PERF-012` | Cost guardrails per active user/session/match | Cost is observable dimension; numeric guardrails need production economics | billing/usage baseline |

---

# 19. Observability Open Decisions

Primary owner: Observability.

| ID | Question | Current safe behavior | Evidence / trigger |
|---|---|---|---|
| `OPEN-OBS-001` | Final logs/metrics/traces/frontend error-tracking vendor/stack | Instrumentation contracts remain vendor-neutral; use simplest adequate provider/platform signals | production diagnostic needs/cost |
| `OPEN-OBS-002` | Sampling rates | Never sample away required audit/critical rare failures; numeric rates measured | telemetry volume/cost/signal analysis |
| `OPEN-OBS-003` | Retention windows per signal | Purpose/signal-specific retention | incident/support/privacy requirements |
| `OPEN-OBS-004 → OPEN-REL-002` | Numeric SLO targets | Baseline first | production SLIs/product requirements |
| `OPEN-OBS-005` | Alert thresholds / burn-rate windows | Alerts need owner/runbook; values measured | baseline/incident history |
| `OPEN-OBS-006` | Browser tracing globally vs selected flows | Prefer selected high-value boundaries initially | overhead/privacy/diagnostic value |
| `OPEN-OBS-007` | Support diagnostic export format | No raw IndexedDB dump; explicit sanitized export only if needed | support/recovery workflow |
| `OPEN-OBS-008` | Platform Admin access model for observability backend | Least privilege + audit; no implicit Community role mapping | chosen vendor/internal ops model |

---

# 20. Testing / QA Open Decisions

Primary owner: Quality Engineering.

| ID | Question | Current safe behavior | Evidence / trigger |
|---|---|---|---|
| `OPEN-QA-001` | Property-based framework (`fast-check` or equivalent) | Property testing requirement remains tool-independent | spike/maintainability/CI integration |
| `OPEN-QA-002` | PostgreSQL/Supabase orchestration in CI | Faithful DB/RLS/RPC tests mandatory; in-memory mock insufficient | CI fidelity/runtime/cost spike |
| `OPEN-QA-003` | Accessibility automation tool | Accessibility requirement stays independent of vendor | frontend tooling evaluation |
| `OPEN-QA-004` | Load-testing tool | Load tests must assert domain invariants | performance environment/tool evaluation |
| `OPEN-QA-005` | Line/branch coverage baseline/threshold, if any | Coverage is diagnostic, not architecture proof | historical baseline + usefulness |
| `OPEN-QA-006` | Critical Playwright E2E cadence (PR/merge/release) | Thin critical journeys must run as a deliberate gate somewhere | runtime/flakiness/release risk |
| `OPEN-QA-007` | Future browser/device matrix beyond Chromium | Chromium remains current baseline; expand from product/support evidence | audience/browser usage |
| `OPEN-QA-008` | Restore-drill cadence | Restore must actually be tested; cadence risk/business driven | infrastructure/change cadence |
| `OPEN-QA-009` | Mutation testing adoption/cost threshold | Not required until value demonstrated | escaped-defect/coverage quality evidence |
| `OPEN-QA-010` | Quarantine SLA by quality tier | Flaky tests require owner/remediation; exact SLA not invented | CI reliability baseline |

---

# 21. Operations / Deploy Open Decisions

Primary owner: Operations.

| ID | Question | Current safe behavior | Evidence / trigger |
|---|---|---|---|
| `OPEN-OPS-001` | Production frontend host | Keep deployment contract portable; select by TLS/CDN/logging/rollback needs | hosting evaluation |
| `OPEN-OPS-002` | Docker/nginx as canonical artifact vs portable fallback | Existing Docker path remains usable; architecture does not require one host | chosen host/runtime model |
| `OPEN-OPS-003` | Exact Node patch / image digest pinning policy | Major/runtime family stays controlled; exact pin strategy supply-chain/ops driven | release/security maintenance cost |
| `OPEN-OPS-004` | Exact npm version pinning | Reproducible install required; exact pin mechanism implementation choice | CI reproducibility |
| `OPEN-OPS-005` | Persistent staging vs on-demand rehearsal | Isolated rehearsal capability required; persistent environment not mandatory | rehearsal frequency/setup cost |
| `OPEN-OPS-006` | Future Supabase Branching economics | Branching is optional implementation, not architecture dependency | plan/cost/productivity evidence |
| `OPEN-OPS-007` | CI strategy for provider features not faithfully local | Local DB is baseline; provider-specific gaps require deliberate isolated tests | discovered Auth/Realtime/Storage fidelity gaps |
| `OPEN-OPS-008` | CD automation technology | Deployment ordering/verification is invariant; tool replaceable | chosen hosting/provider integration |
| `OPEN-OPS-009` | Infrastructure-as-Code need/technology | Do not adopt IaC solely for ceremony; document manual config meanwhile | environment count/change risk/drift evidence |
| `OPEN-OPS-010` | Feature-flag storage/provider | Flag is not authority/auth; choose simplest auditable control plane | rollout requirements |
| `OPEN-OPS-011` | Kill-switch control plane | Kill switch cannot corrupt live Match; exact mechanism operational | incident response needs |
| `OPEN-OPS-012` | Worker runtime | Handler/outbox semantics remain portable | queue duration/cold-start/provider limits |
| `OPEN-OPS-013` | Scheduler adapter/runtime | Schedule uses server-authoritative time/revalidation | chosen worker/provider architecture |
| `OPEN-OPS-014` | Load tooling | Alias/coordination with `OPEN-QA-004` | performance test program |
| `OPEN-OPS-015 → OPEN-REL-007` | Actual managed backup/PITR capability | Verify real production plan, never assume | provider plan selection |
| `OPEN-OPS-016` | Storage/blob backup strategy | DB backup alone is not complete Media recovery | Media retention/RPO requirements |
| `OPEN-OPS-017 → OPEN-REL-001` | Numerical RPO/RTO | No numeric promise until tested/business-defined | production backup/restore evidence |
| `OPEN-OPS-018` | CDN/host cache implementation | Immutable assets can cache; auth/private responses follow policy | selected host/CDN |
| `OPEN-OPS-019` | Exact CSP allowlist | Start minimal; expand only for actual dependencies | deployed provider/asset endpoints |
| `OPEN-OPS-020` | DNS provider/custom domain | Deployment portability remains | product branding/host decision |
| `OPEN-OPS-021` | Public status page need | No status-page obligation before user/ops value | external usage/support maturity |
| `OPEN-OPS-022` | Release/version cadence | Release ID/correlation mandatory; cadence team/product driven | product delivery pattern |
| `OPEN-OPS-023` | Canary/percentage rollout support | Cohort/flags can gate high-risk rollout; percentage technology only if useful | traffic scale/provider capability |
| `OPEN-OPS-024` | Operator tooling to reduce direct SQL | Prefer semantic repair/admin tooling; scope grows from operational incidents | recurring manual SQL/support burden |

---

# 22. Migration / Strangler Open Decisions

Primary owner: Migration + affected context.

| ID | Question | Current safe behavior | Evidence / trigger |
|---|---|---|---|
| `OPEN-MIG-001` | Exact persistent migration registry schema | Persist authority/run/provenance where needed; schema can evolve | W0 implementation design |
| `OPEN-MIG-002` | Authority marker generic migration table vs selected aggregate columns | Feature flag alone insufficient; avoid scattering generic sync metadata | W0/C5 source-of-truth matrix |
| `OPEN-MIG-003` | Cohort percentage/internal Community mechanism | New-resource/internal cohorts first; exact percentage not assumed | rollout tooling/traffic |
| `OPEN-MIG-004` | Minimum old-client support window | Additive compatibility first; measure active old-client usage before contract | release/version telemetry |
| `OPEN-MIG-005` | Existing DRAFT Sessions eligible for V2 conversion | No implicit conversion; active/live never mid-engine | inventory/product migration command design |
| `OPEN-MIG-006` | Existing upcoming Sessions wishing to introduce Registration | No fabricated FIFO/history; explicit conversion/import policy required | real upcoming Session inventory |
| `OPEN-MIG-007` | Legacy roster import as confirmed Registration entries vs direct RosterRevision | Do not invent historical FIFO; preserve provenance | selected migration UX/policy |
| `OPEN-MIG-008` | Legacy evaluation attribution/manual-review UX | Unknown Community/evaluator scope remains legacy evidence | data inventory/anomaly volume |
| `OPEN-MIG-009` | Historical PointEvent ordering confidence threshold | Duplicate/ambiguous sequence cannot be reordered by timestamp silently | historical event-quality analysis |
| `OPEN-MIG-010` | Creating OfficialCompetitionResult from historical Championship result | Do not officialize ambiguous technical result | legacy Championship semantics/inventory |
| `OPEN-MIG-011` | Default Competition Stage mapping by current championship type | Map only supported evidence; no product-label inference beyond known semantics | legacy format inventory |
| `OPEN-MIG-012` | Local-only legacy Community Sessions with no cloud authority | Do not declare them shared truth automatically | user/recovery/import policy |
| `OPEN-MIG-013` | localStorage importer grace period before deletion | Verify import and preserve recovery window | real local data size/support risk |
| `OPEN-MIG-014 → OPEN-OFF-010` | User-facing local recovery/export before import | Do not destroy irreplaceable data | migration/support UX decision |
| `OPEN-MIG-015` | Generated schema/type contract tooling | Migration chain remains source; generated artifact must be verified | implementation tooling choice |
| `OPEN-MIG-016` | Compatibility adapter retirement telemetry implementation | Remove only after usage evidence; telemetry mechanism unresolved | C6 rollout instrumentation |
| `OPEN-MIG-017` | Data provenance retention period | Preserve as long as needed for historical/migration/audit purpose; exact period privacy/ops driven | processing/audit requirement |
| `OPEN-MIG-018` | Migration anomaly operator UI vs SQL/report tooling | Anomalies must be visible/repairable; UI only if scale warrants | measured anomaly/operator workload |
| `OPEN-MIG-019` | Whether some history remains permanently `LEGACY_EVIDENCE` | Prefer truthful incomplete evidence over invented normalization | data quality/cost/value assessment |
| `OPEN-MIG-020` | Whether any production dataset warrants a one-time reset despite strangler default | **BLOCKING/exceptional** — reset requires explicit product/compliance/backup decision | only if concrete dataset economics justify destructive exception |

---

# 23. Architecture Governance Open Decisions

Primary owner: Architecture Governance.

Three source questions were actually resolved by C3/C4 and are listed separately below.

## 23.1 Active governance decisions

| ID | Question | Current safe behavior | Evidence / trigger |
|---|---|---|---|
| `OPEN-GOV-001` | Exact future standalone ADR file layout/naming beyond current catalog | `ADR-CATALOG.md` is current canonical index; new proposal template uses stable context prefix | volume/parallel ownership need for standalone ADR files |
| `OPEN-GOV-004` | Exact traceability artifact format | Structured Markdown is canonical now; avoid speculative generator | C5/C7 complexity/automation need |
| `OPEN-GOV-005` | Architecture ownership in CODEOWNERS vs conceptual | Owners remain explicit in docs/review; CODEOWNERS only if enforcement value exists | team size/review workflow |
| `OPEN-GOV-006` | Dependency rules via ESLint/custom tests/dependency-cruiser/etc. | Preserve target boundaries; evolve existing fitness tests without freezing legacy | implementation spike |
| `OPEN-GOV-007` | Immediate automated import restrictions for `shared` | `shared` cannot become ownerless domain bucket; exact rule tooling open | C7 dependency audit |
| `OPEN-GOV-008` | Machine-readable front matter for docs status | Markdown text status remains authoritative | generator/automation need |
| `OPEN-GOV-010` | Registry location for Exception/Deprecation/Technical Debt | Keep records versioned; do not create informal private lists | C5/C6 deprecation workload |
| `OPEN-GOV-011` | Review cadence after C7 | Risk-triggered review remains baseline; calendar cadence only if useful | drift/incidents/team growth |
| `OPEN-GOV-012` | Change-risk classification in PR template | AR0–AR3 model exists; PR-template integration optional | review consistency evidence |
| `OPEN-GOV-013` | Dedicated architecture-fitness npm script/gate | Existing tests can evolve; exact CI surface open | number/value/runtime of fitness functions |
| `OPEN-GOV-014` | All architecture-test failures blocking vs staged by migration wave | New target invariant regressions must block; legacy-transition checks may need staged gates | C6 wave plan |
| `OPEN-GOV-015` | Rewrite `domain-model.md` into current-state/generated view vs archive | Treat as transitional/legacy evidence until explicit action | C7 stale-doc audit |
| `OPEN-GOV-016` | Representation of temporary old-client compatibility contracts | Compatibility must be explicit/time-bounded; representation open | C6 contract matrix |
| `OPEN-GOV-017` | Exact usage telemetry source for deprecation removal | Removal requires evidence beyond text search | C5/C6 observability matrix |
| `OPEN-GOV-018` | Technology adoption via ADR only vs lightweight RFC before ADR | Material accepted choice ends in ADR; pre-decision collaboration format open | team/decision complexity |
| `OPEN-GOV-019` | Whether CODEOWNERS is useful at current team size | Same concern as `OPEN-GOV-005`; retain as source alias, do not duplicate closure | team growth |
| `OPEN-GOV-020` | Automated consistency validation for docs links/invariant IDs | Manual review remains; automation justified as corpus grows | C7 findings/maintenance burden |
| `OPEN-GOV-021` | Architecture Audit output as versioned report, issue set, or both | C7 findings must be durable/actionable; exact presentation open | C7 execution |
| `OPEN-GOV-022` | Refresh cadence for dependency/security architecture inventory | Risk/change-triggered baseline | dependency/provider change rate |
| `OPEN-GOV-023` | Dedicated terminology localization mapping catalog | Canonical internal domain language remains Glossary; localized labels cannot redefine core terms | product localization scope |
| `OPEN-GOV-024` | Fully asynchronous Architecture Review via PR/ADR | Risk-based review model remains; synchronous meeting not mandatory | team coordination needs |

## 23.2 Governance source questions resolved during consolidation

| Source item | Status | Resolution |
|---|---|---|
| N2.23 #2 — preserve working ADR anchors vs renumber | `RESOLVED_C3` | Stable `ADR-<OWNER>-###`; numeric working anchors remain aliases |
| N2.23 #3 — exact global invariant namespace | `RESOLVED_C4` | `GINV-<FAMILY>-###` |
| N2.23 #9 — Open/Hypothesis registry location | `RESOLVED_C4` | `docs/architecture/catalogs/OPEN-DECISIONS.md` + `HYPOTHESES.md` |

---

# 24. Cross-context merge / alias map

The following source concerns are intentionally not independent decisions:

```text
PX minors
ID minors concern
SEC minors
→ OPEN-SEC-003

PX public Match/Competition surface
MATCH spectator visibility
RT public Match surface
SEC public spectator policy
→ OPEN-SEC-007

MATCH offline scope
REL Match offline availability
→ OPEN-MATCH-001

MATCH/OFF lease-grace duration
→ OPEN-MATCH-002

OFF local recovery export
REL local recovery export
MIG local recovery export
→ OPEN-OFF-010

DATA command-receipt retention
API command-receipt retention
REL command-receipt retention
→ OPEN-API-002

REL numeric SLO
OBS numeric SLO
→ OPEN-REL-002

REL RPO/RTO
OPS RPO/RTO
→ OPEN-REL-001

OPS provider backup capability
REL backup topology
→ OPEN-REL-007

NOTIF worker runtime
OPS worker runtime
→ OPEN-OPS-012

STAT historical display identity
ID historical display identity
→ OPEN-ID-003

RT public spectator surface
PERF spectator capacity
→ visibility OPEN-SEC-007
  capacity OPEN-PERF-004 / OPEN-RT-006
```

A merge means one primary policy decision, not loss of the narrower source requirement.

---

# 25. Blocking-decision shortlist for early implementation

The complete catalog remains authoritative, but these are especially likely to block irreversible/security-sensitive work early:

- `OPEN-SEC-003` minors policy before knowingly targeting minors;
- `OPEN-SEC-006` legal basis per processing activity before final privacy inventory sign-off;
- `OPEN-SEC-007` before public spectator exposure;
- `OPEN-MATCH-001/002` before broad Community offline Match rollout;
- `OPEN-BAL-001/002/003/010` before claiming a final canonical balancing policy;
- `OPEN-RATING-001` before freezing aggregation algorithm as permanent;
- `OPEN-REG-006` before implementing reopen after finalized roster;
- `OPEN-MIG-009/010/011` before lossy historical Match/Competition auto-normalization;
- `OPEN-MIG-020` before any destructive reset exception;
- `OPEN-REL-001/007` before publishing numerical DR guarantees;
- `OPEN-OPS-016` before treating DB backup as full Media recovery;
- `OPEN-MEDIA-002` before production image processor accepts arbitrary uploads.

This shortlist does not turn other OPEN decisions into defaults.

---

# 26. Closure rule

When closing an item:

```text
OPEN-* question
↓
evidence / product / legal / operational input
↓
ADR or canonical owning-source decision
↓
status update here
↓
related GINV / C5 matrices / tests updated
```

Do not delete the old question after closure. Keep its ID/status and point to the resolving ADR/source so the reason remains discoverable.