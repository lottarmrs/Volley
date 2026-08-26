# Global + Context Invariant Catalog — Volley

> Status: `DRAFT-CANONICAL / C4`
>
> Owner: `Architecture Governance + invariant owners`
>
> Index: [`C4-INDEX.md`](./C4-INDEX.md)
>
> Canonical decisions: [`ADR-CATALOG.md`](../adr/ADR-CATALOG.md)

---

# 0. Reading rule

This catalog has two layers:

```text
GLOBAL INVARIANT (`GINV-*`)
= cross-context rule / deduplicated architectural truth

LOCAL INVARIANT (`<CONTEXT>-INV-*`)
= detailed context-owned rule in the owning N2 chapter
```

The local N2 text remains the full definition. A `GINV-*` record does not erase narrower local constraints; it points to them.

If a global statement and a local invariant appear to conflict:

```text
DO NOT pick one silently
→ record contradiction
→ owner review
→ ADR/N2/catalog correction
→ executable evidence update
```

---

# 1. Context invariant registry

| Context | Canonical range | Count | Primary owner | Typical severity |
|---|---|---:|---|---|
| Product Experience | `PX-INV-001..012` | 12 | Product Experience | I1–I2 |
| Identity / Players | `ID-INV-001..025` | 25 | Identity / Player | I0–I1 |
| Communities | `COM-INV-001..035` | 35 | Community | I0–I1 |
| Sessions | `SES-INV-001..035` | 35 | Session | I1–I2 |
| Registration | `REG-INV-001..040` | 40 | Registration | I1 |
| Team Formation | `BAL-INV-001..040` | 40 | Team Formation | I1–I2 |
| Live Match | `MATCH-INV-001..040` | 40 | Live Match | I0–I1 |
| Competitions | `COMP-INV-001..040` | 40 | Competition | I1 |
| History / Statistics | `STAT-INV-001..040` | 40 | History / Statistics | I1–I2 |
| Notifications | `NOTIF-INV-001..050` | 50 | Notifications | I1–I2 |
| Media | `MEDIA-INV-001..050` | 50 | Media | I0–I2 |
| Online / Offline | `OFFLINE-INV-001..055` | 55 | Platform Offline + domain owners | I0–I2 |
| Realtime | `RT-INV-001..050` | 50 | Platform Realtime + domain owners | I0–I2 |
| Data Architecture | `DATA-INV-001..050` | 50 | Data | I0–I2 |
| API / Application | `API-INV-001..050` | 50 | Application | I0–I2 |
| Security / Privacy / LGPD | `SEC-INV-001..055` | 55 | Security / Privacy | I0 |
| Reliability | `REL-INV-001..060` | 60 | Reliability + domain owners | I0–I2 |
| Performance / Scalability | `PERF-INV-001..065` | 65 | Performance + domain owners | I1–I3 |
| Observability | `OBS-INV-001..060` | 60 | Observability + domain owners | I0–I3 |
| Testing / QA | `QA-INV-001..070` | 70 | Quality Engineering + domain owners | I0–I3 |
| Operations / Deploy | `OPS-INV-001..070` | 70 | Operations | I0–I3 |
| Migration / Strangler | `MIG-INV-001..080` | 80 | Migration + domain owners | I0–I2 |
| Architecture Governance | `GOV-INV-001..080` | 80 | Architecture Governance | I0–I3 |
| **Total** |  | **1,152** |  |  |

No local invariant ID is renumbered by C4.

---

# 2. Global authority / identity / ownership invariants

## GINV-AUTH-001 — One current authority per mutable aggregate

**Statement:** at any instant, a mutable aggregate has one effective authority for accepting the next authoritative mutation. Cached/shadow/compatibility copies never create competing truth.

**Severity:** I0  
**Owner:** Architecture Migration / Data Authority  
**Affected:** all shared contexts + Quick handoff  
**Local anchors:** `OFFLINE-INV-002..004`, `MIG-INV-001..003`, `DATA-INV` authority rules, `GOV-INV-051..052`  
**Principles:** P-001, P-003, P-037  
**ADRs:** `ADR-MIG-001`, `ADR-OFF-*`, `ADR-DATA-*`  
**Evidence:** MIGRATION + DB + FAILURE; cohort authority ledger; tests rejecting old writer after cutover.

## GINV-AUTH-002 — Shared critical mutable state is server-authoritative

**Statement:** Community governance, Membership, Registration, shared voting/TeamDraw confirmation, Competition administration/results, Player-account linking and other shared critical state require authoritative server commit. Local cache/draft cannot claim committed success.

**Severity:** I0/I1  
**Owner:** Data / owning context  
**Local anchors:** `PX-INV-002`, `COM-INV-019..020`, `REG-INV-003/027`, `OFFLINE-INV-004..015`  
**Principles:** P-003, P-004  
**ADRs:** `ADR-COM-006`, `ADR-REG-002`, `ADR-OFF-*`  
**Evidence:** CONTRACT + DB/RLS + offline negative tests.

## GINV-AUTH-003 — Client actor, role, scope and timestamps are never authority evidence

**Statement:** actor identity comes from authenticated server context; actual resource context is resolved from the authoritative resource; client role/capability/community/time fields cannot grant access, ordering or ownership.

**Severity:** I0  
**Owner:** Security / Application  
**Local anchors:** `COM-INV-021..022`, `REG-INV-004..005/037`, `API-INV-001..005/021`, `SEC-INV-003..006/024`  
**Principles:** P-002, P-008, P-021, P-023  
**ADRs:** `ADR-API-*`, `ADR-SEC-*`  
**Evidence:** SECURITY + RLS + mass-assignment/BOLA tests.

## GINV-ID-001 — User, Player and Participant are different identities

**Statement:** authentication identity, persistent sports identity and event participation are separate. None is created merely because another exists.

**Severity:** I1  
**Owner:** Identity / Player  
**Local anchors:** `ID-INV-001..004`, `PX` identity rules  
**Principles:** P-005  
**ADR:** `ADR-ID-001`, `ADR-ID-003`  
**Evidence:** TYPE + DOMAIN + migration tests for Guests/non-player admins.

## GINV-ID-002 — Player is global but visibility is contextual

**Statement:** the same Player may participate across Communities; global identity never implies a globally public directory, ratings, memberships or private history.

**Severity:** I0/I1  
**Owner:** Identity / Privacy  
**Local anchors:** `ID-INV-005/016`, `SEC-INV-040`  
**Principles:** P-027, P-028  
**ADRs:** `ADR-ID-002`, `ADR-ID-008`  
**Evidence:** SECURITY + read DTO tests + privacy review.

## GINV-ID-003 — CommunityMembership and CommunityPlayer are independent

**Statement:** User access/governance and Player sports membership are different relations and never imply each other automatically.

**Severity:** I1  
**Owner:** Community  
**Local anchors:** `ID-INV-006..008`, `COM-INV-001`  
**Principles:** P-006  
**ADR:** `ADR-COM-001`  
**Evidence:** DOMAIN + DB FK/uniqueness + authorization tests.

## GINV-ID-004 — Current identity/profile changes never rewrite historical participation

**Statement:** historical rosters/participants use purpose-minimal snapshots/provenance; current Player name, Team membership, Community status, account link or evaluation changes cannot rewrite what happened.

**Severity:** I1  
**Owner:** Identity + Session/Match/Statistics  
**Local anchors:** `ID-INV-012..015`, `SES-INV-012`, `MATCH-INV-025..027`, `STAT-INV-006/028`  
**Principles:** P-013  
**ADRs:** `ADR-ID-005`, `ADR-SES-004`, Match roster ADRs  
**Evidence:** DOMAIN + projection/history regression tests.

## GINV-ID-005 — Account deletion is not sports-history deletion

**Statement:** deleting/unlinking an Auth account cannot cascade-delete shared Sessions, Matches, points, official results or other justified sports history. Retention/anonymization remains category-specific and privacy-governed.

**Severity:** I0  
**Owner:** Identity + Security/Privacy + Data  
**Local anchors:** `ID-INV-014/025`, `SES-INV-032`, `SEC-INV-044..047`, `MIG-INV-026`  
**Principles:** P-028  
**ADRs:** `ADR-ID-007`, `ADR-DATA-005`, `ADR-SEC-011`, `ADR-REL-007`  
**Evidence:** DB FK tests + privacy workflow + RESTORE deletion replay.

---

# 3. Global capability / Community invariants

## GINV-CAP-001 — Organizer is operational, not a governance role

**Statement:** Organizer responsibility enables Session/Match-related operational capabilities according to assignment/policy and never silently grants Community governance.

**Severity:** I0/I1  
**Owner:** Community  
**Local anchors:** `PX-INV-003`, `COM-INV-003..006/023..025`, `SEC-INV-007..009`  
**Principles:** P-007, P-008  
**ADR:** `ADR-COM-003`  
**Evidence:** SECURITY negative matrix + capability derivation tests.

## GINV-CAP-002 — Admin/Owner does not silently inherit operational or Match/Competition authority

**Statement:** Community governance roles do not automatically evaluate Players, manage another Organizer's Session, control a Match or administer Competition unless an explicit capability/override/assignment says so.

**Severity:** I0/I1  
**Owner:** Community + affected context  
**Local anchors:** `COM-INV-023..025`, `SES-INV-022..023`, `MATCH-INV-004..006`, `COMP-INV-017..018`  
**Principles:** P-008  
**ADRs:** `ADR-COM-003`, `ADR-COM-005`, Match/Competition capability ADRs  
**Evidence:** SECURITY/BOLA + command authorization tests.

## GINV-COM-001 — Every active Community has exactly one active Owner

**Statement:** Community creation and ownership transfer preserve exactly one active Owner after every commit; Owner cannot leave/remove/suspend through an unsafe transition.

**Severity:** I1  
**Owner:** Community  
**Local anchors:** `COM-INV-007..010`  
**ADR:** `ADR-COM-004`  
**Evidence:** DB constraints where representable + transaction/concurrency tests.

## GINV-COM-002 — JoinRequest is not Membership

**Statement:** pending/rejected/withdrawn entry intent lives separately from effective Membership; approval atomically creates/reactivates Membership.

**Severity:** I1  
**Owner:** Community  
**Local anchors:** `COM-INV-002/014..016`  
**ADR:** `ADR-COM-002`  
**Evidence:** DB/state-machine/concurrency tests.

## GINV-COM-003 — Community defaults never rewrite existing Session history

**Statement:** defaults are inputs for future context snapshots; changes do not mutate rules/config already frozen for existing Sessions/Matches.

**Severity:** I1  
**Owner:** Community + Session  
**Local anchors:** `COM-INV-027..028`, `SES-INV-016..017`  
**ADR:** `ADR-COM-008`, `ADR-SES-005`  
**Evidence:** snapshot immutability tests.

---

# 4. Registration invariants

## GINV-REG-001 — RegistrationEntry / WAITLISTED is not SessionParticipant

**Statement:** intent/queue state and effective roster participation remain distinct. A waitlisted person cannot reach solver/Match roster until valid promotion/materialization.

**Severity:** I1  
**Owner:** Registration  
**Local anchors:** `PX-INV-004`, `SES-INV-014`, `REG-INV-001..002/022`  
**Principles:** P-009  
**ADR:** `ADR-REG-001`  
**Evidence:** DOMAIN + FinalizeRoster integration/property tests.

## GINV-REG-002 — Confirmed capacity never exceeds authoritative capacity

**Statement:** capacity is decided under authoritative transaction/serialization; cached counts never decide the last slot.

**Severity:** I1  
**Owner:** Registration  
**Local anchors:** `REG-INV-006/030`  
**Principles:** P-010  
**ADRs:** `ADR-REG-003`, `ADR-REG-004`  
**Evidence:** DB + CONCURRENCY last-slot/mass-join tests.

## GINV-REG-003 — FIFO uses monotonic server sequence, never timestamps

**Statement:** queue priority uses an authoritative monotonic sequence; `created_at`, `updated_at`, client clock or communication-list order never decide FIFO.

**Severity:** I1  
**Owner:** Registration  
**Local anchors:** `REG-INV-007..009/015..016`, `REL-INV-031`, `MIG-INV-021`  
**Principles:** P-010, P-023  
**ADR:** `ADR-REG-003`  
**Evidence:** DB sequence constraints + concurrent property tests.

## GINV-REG-004 — Confirmed Leave + first eligible promotion are atomic before LOCKED

**Statement:** no asynchronous gap may allow a new Join to bypass an existing eligible waiter. Promotion revalidates eligibility in the same authoritative transition.

**Severity:** I1  
**Owner:** Registration  
**Local anchors:** `REG-INV-013..016/039`, `REL-INV-032`  
**ADR:** `ADR-REG-004`  
**Evidence:** failure injection inside transaction + concurrency tests.

## GINV-REG-005 — Registration provenance is revisioned end-to-end

**Statement:** authoritative changes increment Registration revision; finalized roster records exact source revision; downstream Team Formation can identify exact source roster/registration version.

**Severity:** I1  
**Owner:** Registration + Session  
**Local anchors:** `REG-INV-019..023/040`, `SES-INV-012..013`  
**ADR:** `ADR-REG-006`, `ADR-SES-004`  
**Evidence:** stale-finalize tests + provenance integrity queries.

---

# 5. Rating / Team Formation / Voting invariants

## GINV-RATING-001 — Evaluation aggregation is hierarchical and per attribute

**Statement:** evaluator observations consolidate within a Community first; Community profiles then contribute to global skill per attribute. A Community with many evaluators cannot gain multiple global-community weights merely by evaluator count.

**Severity:** I1  
**Owner:** Player evaluation / Skill Profile pipeline (cross-context owner to be made explicit in C5/C7)  
**Local anchors:** Product/Identity/Team Formation rating rules; QA rating scenarios  
**Principles:** P-012  
**Evidence:** PROPERTY tests: many evaluators one Community, one effective revision per evaluator, deterministic rebuild.

## GINV-RATING-002 — Missing evaluation/coverage is never silently zero

**Statement:** absent skill/trait/stat capture remains unknown/provisional/missing according to versioned policy. Zero is a real observed/resolved value, not the universal default for absence.

**Severity:** I1  
**Owner:** Skill Profile + Statistics  
**Local anchors:** `ID-INV-019`, `BAL-INV-011..012`, `STAT-INV-014..015`, `MATCH-INV-029`  
**Principles:** P-012  
**Evidence:** PROPERTY + migration coverage tests.

## GINV-BAL-001 — Team Balancer never uses Player Overall

**Statement:** canonical solver input, initialization, objective, candidate ranking, tie fallback and diagnostics used to select a solution are attribute/constraint driven; `Overall` is display/derived only.

**Severity:** I1  
**Owner:** Team Formation  
**Local anchors:** `PX-INV-006`, `BAL-INV-001..003/016/027/036`, `PERF-INV-035`, `REL-INV-056`  
**Principles:** P-011  
**ADR:** `ADR-BAL-001`  
**Evidence:** TYPE contract excludes Overall + PROPERTY test “change only Overall → identical candidates”.

## GINV-BAL-002 — Canonical balance input is immutable and tied to exact roster/source versions

**Statement:** solver consumes `PlayerBalanceSnapshot`/equivalent immutable participant-centric input, not mutable Player aggregate; historical TeamDraw remains reproducible.

**Severity:** I1  
**Owner:** Team Formation  
**Local anchors:** `BAL-INV-004..006/028/035`  
**ADR:** `ADR-BAL-002`  
**Evidence:** snapshot/provenance integrity + deterministic replay tests.

## GINV-BAL-003 — Hard constraints cannot be traded for objective quality

**Statement:** an assignment violating a hard constraint is invalid no matter its score. Soft objective only compares valid candidates.

**Severity:** I1  
**Owner:** Team Formation  
**Local anchors:** `BAL-INV-009..010/017/030..033`  
**ADR:** `ADR-BAL-003`  
**Evidence:** PROPERTY + server confirmation validation tests.

## GINV-BAL-004 — Canonical Team Formation is seeded/versioned/fixed-work deterministic

**Statement:** same canonical input/config/version/seed/iteration budget produces the same result independent of CPU speed/wall clock.

**Severity:** I2  
**Owner:** Team Formation  
**Local anchors:** `BAL-INV-013..015/035`, `PERF-INV-033..034`, `OBS-INV-037`  
**ADR:** `ADR-BAL-004`  
**Evidence:** PROPERTY deterministic fingerprints across Worker/direct/CPU runtime variation.

## GINV-VOTE-001 — Voting is roster-eligible, actor-authenticated and ballot-private

**Statement:** only eligible authenticated roster participants vote; waitlisted/accountless participants do not receive fabricated digital votes; Organizer cannot proxy ordinary ballots; one User has at most one effective ballot per round.

**Severity:** I1/I0 privacy  
**Owner:** Team Formation / Voting  
**Local anchors:** `BAL-INV-021..026`  
**Evidence:** RLS/RPC authorization + uniqueness + privacy contract tests.

## GINV-VOTE-002 — Roster/Candidate staleness invalidates voting rather than rebinding ballots

**Statement:** roster change stales CandidateSet and invalidates/requires explicit policy for VotingRound; old ballots are never silently mapped to regenerated options.

**Severity:** I1  
**Owner:** Team Formation / Voting  
**Local anchors:** `BAL-INV-018..020`, `REL-INV-033`  
**Evidence:** concurrency/staleness tests.

---

# 6. Match invariants

## GINV-MATCH-001 — Match is execution; Fixture/Session/OfficialResult remain separate

**Statement:** Session organizes an event, Fixture plans pairing, Match executes, MatchResult is technical, OfficialCompetitionResult is Competition authority.

**Severity:** I1  
**Owner:** Live Match + Competition  
**Local anchors:** `SES-INV-001..006/029`, `MATCH-INV-001..003`, `COMP-INV-001..006`  
**Principles:** P-014  
**ADRs:** `ADR-SES-001`, Match Fixture separation ADRs, `ADR-COMP-004`  
**Evidence:** domain/entity/FK tests.

## GINV-MATCH-002 — Client submits semantic scoring intent; server computes authoritative score

**Statement:** browser cannot author official score, winner or sequence through direct row writes; semantic Match command validates rules and appends trusted event(s).

**Severity:** I0/I1  
**Owner:** Live Match  
**Local anchors:** `MATCH-INV-014..016/039..040`, `API` mass-assignment rules  
**Principles:** P-015, P-020  
**ADR:** Match semantic command/server-score ADRs  
**Evidence:** RPC integration + direct-write denial + mass-assignment tests.

## GINV-MATCH-003 — Match ordering is per-Match server sequence, never LWW/client time

**Statement:** effective event order is unique authoritative sequence. `updated_at`/client timestamps/LWW never decide score/event order.

**Severity:** I1  
**Owner:** Live Match  
**Local anchors:** `MATCH-INV-011..013/024`, `REL-INV-028`, `OFFLINE-INV-043..044`  
**Principles:** P-016, P-023  
**ADRs:** `ADR-MATCH-007`, `ADR-MATCH-012`  
**Evidence:** DB uniqueness + stale-sequence concurrency tests.

## GINV-MATCH-004 — Match control is fenced by current lease + epoch

**Statement:** Match control is scoped per Match; device ID is not authorization; takeover/reacquisition creates newer epoch and old-epoch commands never autoapply.

**Severity:** I0/I1  
**Owner:** Live Match  
**Local anchors:** `MATCH-INV-006..010/034/036/040`, `REL-INV-029..030`  
**Principles:** P-016  
**ADRs:** `ADR-MATCH-004`, `ADR-MATCH-005`  
**Evidence:** concurrency + offline takeover/reconciliation failure tests.

## GINV-MATCH-005 — MatchEvent facts and synchronous projection commit consistently

**Statement:** MatchEvent log is append-oriented technical source; critical `MatchProjection` updates atomically and replay of effective events must reproduce projection.

**Severity:** I0/I1  
**Owner:** Live Match  
**Local anchors:** `MATCH-INV-016..021`, `OBS-INV-034`  
**Principles:** P-013, P-032  
**ADR:** `ADR-MATCH-007`  
**Evidence:** DB transaction failure injection + replay/integrity check.

## GINV-MATCH-006 — Corrections preserve history

**Statement:** ordinary score/attribution corrections are append/version oriented; they do not hard-delete source events or silently rewrite an already-official Competition result.

**Severity:** I1  
**Owner:** Live Match + Competition  
**Local anchors:** `MATCH-INV-017/038`, `COMP-INV-011/016`  
**Evidence:** correction revision tests + impact review integration.

## GINV-MATCH-007 — Offline Match continuation never uses generic merge/LWW

**Statement:** when enabled, controller continuity uses durable ordered command outbox carrying control epoch/base sequence and explicit reconciliation. Divergent old-epoch history is preserved for review, not auto-merged.

**Severity:** I0/I1  
**Owner:** Live Match + Offline  
**Local anchors:** `MATCH-INV-033..035`, `OFFLINE-INV-024..029`, `REL-INV-030`  
**ADRs:** `ADR-MATCH-010`, Offline Match ADR  
**Evidence:** IndexedDB durability + takeover/replay failure tests.

---

# 7. Competition / Statistics invariants

## GINV-COMP-001 — Official Competition Result is a separate, versioned authority

**Statement:** finished Match does not automatically equal official Competition result unless explicit policy says so; one current result per Fixture; correction is versioned.

**Severity:** I1  
**Owner:** Competition  
**Local anchors:** `COMP-INV-006/010..011/027/033`, `STAT-INV-012`  
**ADR:** `ADR-COMP-004`  
**Evidence:** DB current-result uniqueness + officialization/concurrency tests.

## GINV-COMP-002 — Standings/brackets are projections from official facts and penalties

**Statement:** clients never edit standings directly; same OfficialResults + Penalties + rules/calculation versions rebuild deterministically.

**Severity:** I1/I2  
**Owner:** Competition  
**Local anchors:** `COMP-INV-007..009/015/026/032`, `REL-INV-034`  
**Evidence:** projection rebuild/property tests + direct-write denial.

## GINV-COMP-003 — WO/BYE/administrative result never fabricates sports events

**Statement:** walkover, forfeit or BYE may influence official Competition state but never synthesize fake Match/PointEvents/player stats merely to satisfy standings.

**Severity:** I1  
**Owner:** Competition + Statistics  
**Local anchors:** `COMP-INV-012..013`, `MATCH-INV-037`, `STAT-INV-011`, `MIG-INV-035`  
**Evidence:** Competition/Stats regression tests.

## GINV-COMP-004 — Retroactive official correction never silently rewrites executed downstream Match

**Statement:** correction rebuilds safe projections/unresolved dependencies but already-started/executed downstream effects require explicit impact review/correction workflow.

**Severity:** I1  
**Owner:** Competition  
**Local anchors:** `COMP-INV-016/035`, `REL-INV-035`  
**Evidence:** dependency-graph correction tests.

## GINV-STAT-001 — Factual Statistics and subjective Rating/Evaluation are separate pipelines

**Statement:** stats never mutate PlayerEvaluation automatically; evaluation/Overall never becomes factual stat input; future inference requires explicit new policy/ADR.

**Severity:** I1  
**Owner:** History / Statistics + Skill Profile owner  
**Local anchors:** `STAT-INV-001..005/031`, Product history rule  
**Evidence:** property/regression tests changing evaluation/Overall with factual stats unchanged.

## GINV-STAT-002 — MatchParticipation/snapshots determine historical participation

**Statement:** current Team membership never retroactively adds/removes historical participation or stats.

**Severity:** I1  
**Owner:** Live Match + Statistics  
**Local anchors:** `STAT-INV-006..009/028`, `MATCH-INV-027`  
**Evidence:** historical mutation regression tests.

## GINV-STAT-003 — Shared statistics projections are server-derived and rebuildable

**Statement:** browser cannot author Career/standings/stat totals; source sequence/revision/calculation version determine freshness and rebuild.

**Severity:** I1/I2  
**Owner:** History / Statistics  
**Local anchors:** `STAT-INV-007/016..022/032..034`, `PERF-INV-039`  
**Principles:** P-013, P-032  
**Evidence:** projection deletion/rebuild + duplicate worker tests.

## GINV-STAT-004 — Quick provisional history never double counts after publish

**Statement:** local Quick may provide a clearly provisional overlay; successful authority handoff replaces/dedupes it with confirmed server contribution exactly once.

**Severity:** I1  
**Owner:** Statistics + Offline  
**Local anchors:** `STAT-INV-023..024`, `OFFLINE-INV-049..050`  
**Evidence:** publish response-loss/idempotency/double-count tests.

---

# 8. Offline / Realtime invariants

## GINV-OFF-001 — Offline support is classified per operation

**Statement:** no application-wide “offline mode” may queue arbitrary mutations. Each command/query is explicitly ONLINE_AUTHORITATIVE, OFFLINE_OWNED, CACHED_READ, LOCAL_DRAFT or CONDITIONALLY_OFFLINE_COMMAND.

**Severity:** I1/I2  
**Owner:** Offline + context owner  
**Local anchors:** `PX-INV-011`, `OFFLINE-INV-001/011..015`  
**Principles:** P-004  
**Evidence:** operation-policy matrix + offline negative tests.

## GINV-OFF-002 — Quick is local-owned until explicit one-way handoff

**Statement:** unpublished Quick may be fully local/offline; reconnection does not publish it; successful `PublishQuickSession` transfers authority using final UUID; unknown outcome freezes ambiguous authority until resolved.

**Severity:** I1  
**Owner:** Offline + Session  
**Local anchors:** `SES-INV-007/034`, `OFFLINE-INV-016..023`, `MIG-INV-046..047`  
**ADR:** Quick/offline authority ADRs  
**Evidence:** IndexedDB + publish idempotency/response-loss tests.

## GINV-OFF-003 — Critical local facts are durable before UI success

**Statement:** offline Quick/Match fact or pending command is committed to structured durable storage before UI claims it is safely persisted; durable-storage failure fails closed.

**Severity:** I0/I1  
**Owner:** Offline / Reliability  
**Local anchors:** `OFFLINE-INV-028..034`, `PERF-INV-048`, `REL` local durability rules  
**Evidence:** IndexedDB crash/quota/restart tests.

## GINV-OFF-004 — Local data is account-scoped; actor switching cannot replay prior user's commands

**Statement:** pending/cache/private local state is scoped/sealed by account; User A command cannot execute under User B; anonymous data is not silently claimed on login.

**Severity:** I0  
**Owner:** Offline + Security  
**Local anchors:** `OFFLINE-INV-035..039`, `SEC-INV-034..035`, `REL-INV-042`  
**Evidence:** account switch/security tests.

## GINV-RT-001 — Realtime is committed transport, not source of truth or command bus

**Statement:** domain correctness survives Realtime outage; authoritative mutation commits first; trusted server/database path emits events; ordinary clients cannot create authoritative domain facts by Broadcast.

**Severity:** I0/I1  
**Owner:** Realtime  
**Local anchors:** `PX-INV`, `REG-INV-025`, `MATCH-INV-030`, `COMP-INV-029`, `RT-INV` role/client-publish rules  
**Principles:** P-017  
**ADR:** `ADR-RT-001`  
**Evidence:** fake-publish security tests + outage/refetch tests.

## GINV-RT-002 — Realtime convergence uses authoritative revision/sequence + snapshot reconciliation

**Statement:** subscribe/buffer/snapshot protocol removes initial race; duplicate/stale messages are ignored; gaps and reconnects refetch/reconcile; delivery order alone never decides domain order.

**Severity:** I2  
**Owner:** Realtime + context owner  
**Local anchors:** `REG-INV-026`, `MATCH-INV-031..032`, `RT` revision/sequence/handshake/gap invariants, `REL-INV-040`  
**Principles:** P-018  
**ADRs:** `ADR-RT-003` and related convergence ADRs  
**Evidence:** lossy/duplicate/out-of-order contract tests.

## GINV-RT-003 — Realtime Presence is ephemeral and never participation/attendance/history authority

**Statement:** socket presence may disappear without data loss and must not be confused with persisted Community attendance, Registration or MatchParticipation.

**Severity:** I1/I2  
**Owner:** Realtime + owning attendance concept  
**Local anchors:** Realtime Presence invariants; `REG-INV-033`  
**Principles:** P-019  
**Evidence:** domain separation tests + naming/deprecation review.

---

# 9. Data / Application invariants

## GINV-DATA-001 — PostgreSQL is the authoritative relational model for shared state

**Statement:** target shared domain persistence is modeled relationally with final UUIDs, FKs/constraints and owned state, not as a cloud serialization of React/localStorage.

**Severity:** I1/I2  
**Owner:** Data  
**Local anchors:** Data authority/UUID/normalization invariants; `SES-INV-030`  
**Principles:** P-024  
**ADRs:** `ADR-DATA-*`, including final UUID `ADR-DATA-003`  
**Evidence:** schema/migration/constraint tests.

## GINV-DATA-002 — Source fact, mutable state, immutable snapshot and projection are explicit categories

**Statement:** every durable table/read model has declared truth nature. Projection never silently replaces source; snapshots are not mutated in place.

**Severity:** I1  
**Owner:** Data + context owner  
**Local anchors:** Data classification/projection invariants across Match/Stats/Competition/Rating  
**Principles:** P-013, P-032, P-042  
**Evidence:** schema catalog + rebuild/immutability tests.

## GINV-DATA-003 — Domain relations do not use serialized ID arrays as canonical authority

**Statement:** participant/team/match/member relationships use normalized relation/snapshot tables with FKs/provenance; arrays may exist only as bounded non-authoritative payload/snapshot where explicitly justified.

**Severity:** I1/I3  
**Owner:** Data  
**Local anchors:** `SES-INV-011`, migration normalization invariants  
**Principles:** P-024, P-038  
**Evidence:** schema fitness tests + migration parity.

## GINV-LIFE-001 — Lifecycle is semantic; universal soft-delete is not a domain model

**Statement:** LEFT/REMOVED/CANCELLED/ARCHIVED/INVALIDATED etc. express owned semantics; `deleted_at` is not a universal substitute for lifecycle.

**Severity:** I1  
**Owner:** context owner + Data  
**Local anchors:** Community/Session/Competition/Migration lifecycle invariants  
**Principles:** P-025  
**Evidence:** state-machine/schema tests.

## GINV-API-001 — Critical mutations are semantic Commands, not generic browser CRUD

**Statement:** UI requests domain intent; critical multi-row/lifecycle writes execute in trusted transactional boundary. Generic table upsert/patch/delete cannot bypass invariant logic.

**Severity:** I0/I1  
**Owner:** Application + context owner  
**Local anchors:** `MATCH-INV-039`, API command invariants, `SEC-INV-011`, `MIG-INV-012..015`  
**Principles:** P-020  
**ADR:** `ADR-API-001` family  
**Evidence:** direct-write denial + RPC/command integration tests.

## GINV-API-002 — Critical logical command identity is stable across retries

**Statement:** retry of the same logical mutation reuses `command_id`; response-loss/unknown outcome recovers prior committed result. Request/trace IDs remain separate.

**Severity:** I1/I2  
**Owner:** Application  
**Local anchors:** `API-INV-008..013`, `OBS-INV-004..006/025`, `REL` unknown outcome rules  
**Principles:** P-022  
**ADR:** `ADR-API-006`  
**Evidence:** commit-success/response-loss failure injection.

## GINV-API-003 — Domain uniqueness remains a second defense to command receipts

**Statement:** distinct command IDs from double clicks cannot create impossible duplicate active membership/registration/vote/current result/sequence merely because idempotency keys differ.

**Severity:** I1  
**Owner:** context owner + Data  
**Local anchors:** `API-INV-011`, context unique invariants  
**Evidence:** DB unique/partial constraints + concurrency tests.

## GINV-API-004 — Optimistic concurrency uses semantic revision/sequence, never updated_at

**Statement:** stale writers are detected by domain revision/sequence/epoch; newer wall-clock timestamp cannot overwrite critical shared state.

**Severity:** I1  
**Owner:** Application + Data + context  
**Local anchors:** `SES-INV-031`, `API-INV-012`, `OFFLINE-INV-043..045`, `MIG-INV-011`  
**Principles:** P-023  
**Evidence:** stale-client/concurrency tests.

## GINV-API-005 — DTO, DB row, Domain Model and ViewModel are different contracts

**Statement:** public/client contracts expose purpose-required fields only; generated DB row type is infrastructure; mass-assignment fields outside command contract cannot elevate state/privilege.

**Severity:** I0/I2  
**Owner:** Application + Security  
**Local anchors:** `API-INV-016..019/039/049`, `SEC-INV-023`  
**Evidence:** runtime schema + contract/privacy/mass-assignment tests.

---

# 10. Security / Privacy / Media invariants

## GINV-SEC-001 — Authentication never implies authorization; UUID knowledge grants nothing

**Statement:** every protected resource operation resolves actual resource context and current capability/assignment; same-user or same-Community assumptions are never inferred from caller-supplied IDs.

**Severity:** I0  
**Owner:** Security  
**Local anchors:** `SEC-INV-001..006`, BOLA invariants across contexts  
**Principles:** P-002, P-008, P-026  
**Evidence:** RLS + BOLA negative matrix.

## GINV-SEC-002 — Defense in depth combines Application authorization, RLS/grants and DB constraints

**Statement:** no single layer substitutes for the others on critical exposed data. RLS is not removed for convenience/performance; semantic command auth is not replaced by hidden UI.

**Severity:** I0  
**Owner:** Security + Data/Application  
**Local anchors:** `API-INV-020`, `SEC-INV-011..016`, `PERF-INV` RLS rules  
**Principles:** P-026, P-034  
**Evidence:** RLS/RPC integration + query-plan tests.

## GINV-SEC-003 — Privileged credentials and sensitive auth material never enter browser/logs

**Statement:** service-role/provider secrets, access/refresh tokens, MFA codes/secrets and passwords are server-only/redacted; `VITE_*` values are treated as public.

**Severity:** I0  
**Owner:** Security + Operations/Observability  
**Local anchors:** `SEC-INV-017..018/036`, `OBS-INV-013..020`, `OPS` secret invariants  
**Evidence:** bundle/secret scan + redaction tests.

## GINV-SEC-004 — SECURITY DEFINER is a privileged API surface

**Statement:** target privileged functions use hardened search path/qualified references, explicit auth/resource checks and minimal EXECUTE grants.

**Severity:** I0  
**Owner:** Security + Data  
**Local anchors:** `API-INV-045`, `SEC-INV-014..016`  
**Evidence:** static migration lint + anonymous/foreign-resource RPC integration tests.

## GINV-SEC-005 — High-impact step-up is enforced server-side when policy requires it

**Statement:** UI MFA prompt is never the control. AAL2/step-up checks happen at the trusted command/RLS/RPC boundary for selected high-risk operations.

**Severity:** I0  
**Owner:** Security  
**Local anchors:** `SEC-INV-021..022`  
**Evidence:** AAL1 bypass negative tests.

## GINV-PRIV-001 — Personal-data processing is purpose-minimized and retention-specific

**Statement:** public/context/private read models expose only needed data; retention/legal basis/vendor/transfer are recorded per processing activity; consent is not a blanket platform flag.

**Severity:** I0  
**Owner:** Privacy / Security  
**Local anchors:** `SEC-INV-041..049`, `OBS` minimization rules  
**Principles:** P-028  
**Evidence:** processing inventory + DTO/privacy tests + review.

## GINV-PRIV-002 — Privacy deletion remains effective after backup restore

**Statement:** restoring an older backup cannot permanently resurrect completed deletion/anonymization/link revocation; replay/repair happens before ordinary service where policy requires.

**Severity:** I0  
**Owner:** Privacy + Reliability/Operations  
**Local anchors:** `ID-INV-025`, `SEC-INV-046`, `REL-INV-045`, `OPS` restore invariants  
**ADR:** `ADR-REL-007`  
**Evidence:** RESTORE drill with deletion ledger/replay.

## GINV-MEDIA-001 — MediaAsset ID is domain identity; URL/path is infrastructure

**Statement:** domain entities attach known MediaAsset IDs; signed/public URLs are derived delivery artifacts and can expire/change without changing domain identity.

**Severity:** I1/I2  
**Owner:** Media  
**Local anchors:** `MEDIA-INV-001/018..019`  
**Evidence:** domain/schema contract + provider replacement tests.

## GINV-MEDIA-002 — Raw upload is private/untrusted until server-controlled processing reaches READY

**Statement:** client MIME/extension/resize is not security authority; raw incoming is not publicly deliverable; decode/limits/metadata stripping/normalization happen before READY/attachment.

**Severity:** I0  
**Owner:** Media + Security  
**Local anchors:** `MEDIA-INV-002..014/020..022/031..035`, `SEC-INV-028..030`  
**Evidence:** malicious-format/pixel-bomb/EXIF/storage authorization tests.

## GINV-MEDIA-003 — Replacement is READY-before-switch and failure preserves previous attachment

**Statement:** replacement creates new immutable asset/variant identity; current pointer changes only after new asset is READY; processor/provider failure never invalidates existing attachment.

**Severity:** I1/I2  
**Owner:** Media  
**Local anchors:** `MEDIA-INV-015..017/036..041`, `REL-INV-036..037`  
**ADR:** `ADR-MEDIA-004`  
**Evidence:** worker failure/idempotency/concurrent replacement tests.

---

# 11. Notifications / asynchronous effects invariants

## GINV-EFFECT-001 — External/provider effects never define source-domain success

**Statement:** Push/Email/WhatsApp/Storage-side external delivery failure cannot roll back a valid Registration/Session/Match/Competition fact.

**Severity:** I1  
**Owner:** source context + Notifications/Media  
**Local anchors:** `REG-INV-028`, `NOTIF-INV-001/012/022/048`, `REL-INV-021/038`  
**Principles:** P-030  
**Evidence:** provider outage/failure injection.

## GINV-EFFECT-002 — Transactional outbox is atomic with originating fact when async effect durability is required

**Statement:** if source commit requires future async processing, the durable outbox record is committed in the same DB transaction; provider call occurs after commit.

**Severity:** I1/I2  
**Owner:** Data / source context  
**Local anchors:** `NOTIF-INV-002`, `REL-INV-022`, `API-INV-026`  
**Principles:** P-030  
**ADR:** `ADR-DATA-008`  
**Evidence:** transaction rollback/commit tests.

## GINV-WORK-001 — Workers are at-least-once and effects are idempotent/deduplicated

**Statement:** duplicate invocation/crash-after-effect is expected; handler/semantic key/provider idempotency prevents uncontrolled duplicates; architecture never claims distributed exactly-once without proof.

**Severity:** I1/I2  
**Owner:** Reliability + consumer context  
**Local anchors:** `NOTIF-INV-023`, `REL-INV-023..025/060`, `API-INV-027`  
**Principles:** P-031  
**Evidence:** worker duplicate/crash tests.

## GINV-WORK-002 — Poison work is isolated and operationally visible

**Statement:** bounded retry/quarantine prevents one bad item/recipient/asset from blocking unrelated work indefinitely; terminal failure remains diagnosable.

**Severity:** I2  
**Owner:** Reliability / Operations  
**Local anchors:** `NOTIF-INV-024/045..047`, `REL-INV-026..027`, `OBS-INV-040..041`  
**Evidence:** worker poison/backpressure tests + alerts.

## GINV-NOTIF-001 — Durable Inbox is independent of provider delivery

**Statement:** notification intent/read state and delivery attempts are distinct; Realtime/Push permission/provider failure cannot erase persistent in-app communication history where policy materializes an Inbox item.

**Severity:** I2  
**Owner:** Notifications  
**Local anchors:** `NOTIF-INV-004..007/021`, Realtime Notification rules  
**Evidence:** provider/Realtime outage tests.

## GINV-NOTIF-002 — Delayed notification revalidates source relevance before send

**Statement:** scheduled/retried work evaluates current source state/expiry/preferences/context before external delivery; stale reminders are suppressed with explicit reason.

**Severity:** I1/I2  
**Owner:** Notifications  
**Local anchors:** `NOTIF-INV-013..016/040`  
**Evidence:** Session-cancel/Registration-withdraw/restore stale-job tests.

---

# 12. Reliability / Performance / Observability invariants

## GINV-REL-001 — Command success means authoritative transaction committed

**Statement:** request sent, optimistic UI, Realtime event, worker scheduling or provider acceptance is never equivalent to source command success.

**Severity:** I1  
**Owner:** Reliability / Application  
**Local anchors:** `API-INV-050`, Reliability success invariant  
**Principles:** P-022, P-030  
**Evidence:** response-loss/failure-injection tests.

## GINV-REL-002 — Unknown mutation outcome recovers with same command identity

**Statement:** timeout after possible commit is `UNKNOWN_OUTCOME`; retry/query receipt uses the same command ID rather than assuming failure or creating a second logical mutation.

**Severity:** I1  
**Owner:** Reliability / Application  
**Local anchors:** `API-INV-013`, `REL` unknown outcome invariants, `OBS-INV-025`  
**ADR:** `ADR-API-006`  
**Evidence:** commit then drop response chaos test.

## GINV-REL-003 — Rebuildable means source/version/rebuild procedure actually exists

**Statement:** no projection is labeled rebuildable without documented authoritative sources, version/calculation semantics, staleness rule and executable rebuild/integrity evidence.

**Severity:** I1/I2  
**Owner:** Data + projection owner  
**Local anchors:** `STAT-INV-020`, `REL-INV-058`, `GOV-INV-040`  
**Principles:** P-032  
**Evidence:** projection deletion/rebuild tests.

## GINV-REL-004 — Recovery never weakens authorization or domain invariants

**Statement:** degraded dependencies, retries, offline path, repair tooling or emergency operation cannot bypass current authorization, FIFO, epoch, officialization or privacy constraints merely to improve availability.

**Severity:** I0  
**Owner:** Reliability + Security + domain owner  
**Local anchors:** `REL-INV-043`, `PERF-INV-064`  
**Principles:** P-034  
**Evidence:** failure/degradation security tests.

## GINV-PERF-001 — Hot operational work is bounded by current context, not total history

**Statement:** common operation touches bounded page/aggregate/projection/batch; opening current Session or awarding a point never requires scanning/downloading global history.

**Severity:** I2/I3  
**Owner:** Performance + context owner  
**Local anchors:** Performance bounded-work/list/query invariants  
**Principles:** P-033  
**ADR:** Performance bounded-work ADRs  
**Evidence:** query-plan/load/bundle tests.

## GINV-PERF-002 — Correctness/security/privacy/auditability are not performance trade currency

**Statement:** optimization cannot remove Registration serialization, Match epoch/sequence, RLS, ballot privacy, media trust zones or source facts just to reduce latency/cost.

**Severity:** I0/I1  
**Owner:** Architecture + Performance  
**Local anchors:** `PERF-INV-064`, `REL-INV-056`  
**Principles:** P-034  
**Evidence:** architecture/security/performance review + load tests asserting invariants.

## GINV-PERF-003 — Specialized scaling technology requires measured trigger

**Statement:** Redis, read replica, broker, search engine, partitioning, microservice/server solver farm or similar infrastructure is not adopted before measured bottleneck and simpler query/index/boundary/algorithm options are evaluated.

**Severity:** I3  
**Owner:** Performance + Architecture/Operations  
**Local anchors:** `PERF-INV-052..056/065`  
**Principles:** P-039, P-040  
**ADR:** `ADR-PERF-009`  
**Evidence:** benchmark/decision record/revisit trigger.

## GINV-OBS-001 — Domain History, Audit, Telemetry and Logs are separate

**Statement:** telemetry/log retention is never required to reconstruct domain truth; required audit is not sampled away as debug telemetry.

**Severity:** I0/I2  
**Owner:** Observability + Audit owner  
**Local anchors:** `OBS-INV-001..003/043..045/053`  
**Principles:** P-029  
**ADR:** `ADR-OBS-001`  
**Evidence:** schema/retention review + sampling tests.

## GINV-OBS-002 — Telemetry is correlatable but cardinality/privacy bounded

**Statement:** request/command/trace/job/release identities remain distinct; metrics use bounded labels; raw secrets, ballots, evaluations, media bytes and payload dumps are not generic telemetry.

**Severity:** I0/I2  
**Owner:** Observability + Privacy  
**Local anchors:** `OBS-INV-004..021/059`  
**Evidence:** instrumentation/redaction/cardinality tests.

## GINV-OBS-003 — Observability failure does not normally fail domain commit

**Statement:** exporter/metrics/logging outage degrades diagnosis, not the authoritative domain command, except where a specific required atomic audit policy explicitly says otherwise.

**Severity:** I2  
**Owner:** Observability + Reliability  
**Local anchors:** `OBS-INV-054`  
**Evidence:** exporter outage failure test.

---

# 13. QA / Operations / Migration / Governance invariants

## GINV-QA-001 — Critical invariant requires executable evidence at its owning layer

**Statement:** architecture prose/coverage percentage is insufficient for critical correctness. Tests must exercise the layer that enforces the rule; mocks cannot certify RLS/locks/real transaction races.

**Severity:** I0/I1  
**Owner:** Quality Engineering + invariant owner  
**Local anchors:** QA quality/DB/concurrency/security invariants; `GOV-INV-026/053`  
**Principles:** P-035  
**ADR:** `ADR-QA-001`, `ADR-QA-002`  
**Evidence:** test traceability catalog in C5.

## GINV-QA-002 — Test/recovery evidence uses synthetic/isolated environments, not production mutation

**Statement:** ordinary CI/load/failure tests cannot target production or use production PII; cleanup is scoped and environment guards fail closed.

**Severity:** I0  
**Owner:** QA + Operations/Security  
**Local anchors:** QA environment/data invariants; Operations environment invariants  
**Evidence:** CI configuration guards + negative test.

## GINV-SCHEMA-001 — Versioned migrations are authoritative schema history

**Statement:** Git migration chain builds schema from zero; consolidated `schema.sql`/generated snapshot is derived/verified, never independent authority.

**Severity:** I1/I2  
**Owner:** Data + Operations  
**Local anchors:** Data migration invariants, Ops migration-chain invariants, `MIG-INV-055..056`  
**Principles:** P-036  
**ADR:** `ADR-DATA-010`, `ADR-OPS-004`  
**Evidence:** migration-from-zero CI + drift check.

## GINV-OPS-001 — Deployment uses expand/verify/contract; rollback does not assume reversible DB down migration

**Statement:** backward-compatible schema/server/client ordering protects long-lived clients; destructive contract happens only after usage/compatibility proof; forward-fix is preferred when target writes already exist.

**Severity:** I1/I2  
**Owner:** Operations + Migration/Data  
**Local anchors:** `REL-INV-049..050`, performance migration invariants, `MIG-INV-051..052/075..076`  
**ADR:** `ADR-OPS-004`  
**Evidence:** staging/rehearsal + old-client compatibility + migration tests.

## GINV-OPS-002 — Backup exists is not restore proven

**Statement:** recovery claims require restore drill, integrity checks, projection rebuild where needed, Storage/media verification and privacy-deletion replay. RPO/RTO numbers require business/infra evidence.

**Severity:** I0/I2  
**Owner:** Reliability + Operations  
**Local anchors:** `REL-INV-044..046/054`, Operations backup/DR invariants  
**Evidence:** RESTORE drills.

## GINV-MIG-001 — Strangler migrates vertical capabilities with one authority at a time

**Statement:** two implementations/readers/adapters may coexist, but legacy and target writers never independently own the same aggregate. Reset is exceptional product policy, not the default migration strategy.

**Severity:** I0/I1  
**Owner:** Migration  
**Local anchors:** `MIG-INV-001..004/061..063`, `GOV-INV-051..052`  
**Principles:** P-037  
**ADR:** `ADR-MIG-001`  
**Evidence:** authority ledger/cohort tests/legacy-writer rejection.

## GINV-MIG-002 — Ambiguous legacy data is preserved as anomaly/evidence, never guessed

**Statement:** migration does not fabricate Community scope, FIFO, votes, MatchEvents, officialization, rating meaning, Player identity or other semantics absent from source evidence.

**Severity:** I1  
**Owner:** Migration + data owner  
**Local anchors:** `MIG-INV-005..008/017..021/029..038/065..067`  
**Principles:** P-038  
**Evidence:** representative anomaly fixtures + provenance verification.

## GINV-MIG-003 — Legacy compatibility responsibility decreases monotonically after target replacement

**Statement:** once target equivalent is accepted/cut over, new features cannot expand generic sync/cloud CRUD/local ID/legacy adapter contracts except through explicit temporary exception.

**Severity:** I2/I3  
**Owner:** Migration + Governance  
**Local anchors:** `MIG-INV-077..079`, `GOV-INV-031..033/059..060`  
**Principles:** P-038  
**Evidence:** dependency/architecture fitness tests + usage telemetry.

## GINV-MIG-004 — Active execution cohorts are not switched mid-protocol

**Statement:** an active legacy Match/critical workflow remains on its compatible execution cohort until safe terminal/reconciliation boundary; rollout flag cannot change engine underneath it.

**Severity:** I0/I1  
**Owner:** Migration + Live Match/Operations  
**Local anchors:** `SES-INV-035`, `MIG-INV-016`, `PERF-INV-062`, `REL-INV-050`  
**Evidence:** cohort/feature-flag integration tests.

## GINV-GOV-001 — Material architecture knowledge has versioned durable source

**Statement:** accepted decision/invariant/open/hypothesis cannot exist only in chat memory or undocumented implementation convention.

**Severity:** I2/I3  
**Owner:** Architecture Governance  
**Local anchors:** `GOV-INV-001..008`  
**Principles:** P-041, P-042  
**Evidence:** repository artifact/traceability audit.

## GINV-GOV-002 — Principle/ADR/Invariant/Open/Hypothesis are distinct record types

**Statement:** open question is not an accepted decision; hypothesis is not a guarantee; invariant is not merely rationale. Material ADR changes are superseded/revised explicitly rather than silently rewritten.

**Severity:** I1/I3  
**Owner:** Architecture Governance  
**Local anchors:** `GOV-INV-015..023`  
**Evidence:** catalog consistency validation + review.

## GINV-GOV-003 — An unvalidated hypothesis cannot be the only protection for I0/I1

**Statement:** critical security/data/domain integrity needs an accepted rule and executable control even while implementation/scale hypotheses are being tested.

**Severity:** I0/I1  
**Owner:** Architecture Governance + invariant owner  
**Local anchor:** `GOV-INV-023`  
**Evidence:** architecture/QA traceability review.

## GINV-GOV-004 — Every duplicated/material state has an explicit source of truth

**Statement:** when data appears in DB, cache, snapshot, projection, Realtime, report or legacy adapter, the architecture can answer which representation wins and how others recover.

**Severity:** I1/I2  
**Owner:** Data + context owner  
**Principles:** P-042  
**Evidence:** C5 source/projection/authority matrices + C7 audit.

## GINV-GOV-005 — Architecture evolves by evidence with reversibility/exit strategy

**Statement:** major technology/boundary adoption names problem, alternatives, operational/security cost, lock-in and revisit/exit trigger; novelty is not sufficient reason.

**Severity:** I3  
**Owner:** Architecture Governance  
**Local anchors:** `GOV-INV-055..056`, performance scaling invariants  
**Principles:** P-039, P-040  
**ADR:** `ADR-GOV-*`, `ADR-PERF-009`  
**Evidence:** ADR/review record.

## GINV-GOV-006 — Docs, tests, schema and code contradictions are surfaced, never silently normalized

**Statement:** canonical artifacts may temporarily disagree during migration, but contradiction must be visible, owned and resolved; “newest wins”, “code wins” and undocumented manual production drift are forbidden fallback rules.

**Severity:** I1/I2  
**Owner:** Architecture Governance + affected owners  
**Local anchors:** Governance source-of-truth/traceability invariants  
**Principles:** P-041, P-042  
**Evidence:** C7 contradiction audit + fitness/link checks.

---

# 14. Critical cross-context traceability set

The following Global Invariants are mandatory inputs to C5 Test/Capability/Authority matrices and cannot remain prose-only:

```text
GINV-AUTH-001
GINV-AUTH-002
GINV-AUTH-003
GINV-ID-005
GINV-CAP-001
GINV-CAP-002
GINV-COM-001
GINV-REG-001..005
GINV-RATING-001..002
GINV-BAL-001..004
GINV-VOTE-001..002
GINV-MATCH-002..007
GINV-COMP-001..004
GINV-STAT-001..004
GINV-OFF-002..004
GINV-RT-001..003
GINV-DATA-001..003
GINV-API-001..004
GINV-SEC-001..005
GINV-PRIV-001..002
GINV-MEDIA-002..003
GINV-EFFECT-001..002
GINV-WORK-001..002
GINV-REL-001..004
GINV-SCHEMA-001
GINV-OPS-001..002
GINV-MIG-001..004
GINV-GOV-001..006
```

C5 must map each applicable I0/I1 item to an enforcement layer and executable evidence owner.

---

# 15. Change rule

A material change to a `GINV-*` requires:

```text
identify affected local invariants
→ identify Principles/ADRs
→ owner review
→ new/superseding ADR when decision changes
→ update local N2 definitions when semantics change
→ update executable evidence
→ update this registry
```

A local invariant may be refined without changing the global rule when its scope is genuinely local. If the refinement weakens or contradicts the global statement, it is an architecture decision, not editorial cleanup.