# Canonical Architecture Decision Record Catalog — Volley

> Status: `CANONICAL / C3`
>
> Owner: `Architecture + bounded-context owners`
>
> Parent: [`EAP-MASTER.md`](../EAP-MASTER.md)
>
> Governing documents: [`PRINCIPLES.md`](../PRINCIPLES.md), [`GLOSSARY.md`](../GLOSSARY.md), [`N2.23-architecture-governance.md`](../governance/N2.23-architecture-governance.md)
>
> Source corpus: canonical C2.01–C2.23 chapters. This catalog **does not replace their detailed reasoning**. It canonicalizes decision identity, ownership, scope, lifecycle, overlap and traceability.

---

# 0. Purpose and non-loss rule

C2 deliberately preserved decisions close to the context where their reasoning lives. That produced three kinds of decision markers:

```text
1. semantic DECIDED lists / C3 trace anchors
2. working ADR-0000 numeric anchors
3. DEC-OPS / DEC-MIG / DEC-GOV anchors
```

Those markers are useful historical coordinates but they are not yet a coherent ADR namespace.

C3 therefore applies the following rule:

```text
CANONICALIZE IDENTITY
WITHOUT ERASING SOURCE DETAIL
```

For every material decision we preserve:

- canonical ADR ID;
- canonical owner/context;
- decision statement;
- major consequences/trade-offs;
- source C2 chapter;
- source working aliases when one exists;
- relevant Principles;
- overlap/alias relationships;
- migration/deprecation implications;
- revisit trigger where the C2 material identifies one.

The source C2 chapter remains the detailed normative explanation for the decision. This file is the canonical cross-context decision registry and deduplication map.

---

# 1. Canonical ADR identity scheme

## 1.1 Decision

Canonical ADR IDs are **context-prefixed and stable**:

```text
ADR-ID-###      Identity / Player
ADR-COM-###     Community
ADR-SES-###     Session
ADR-REG-###     Registration
ADR-BAL-###     Team Formation / Voting
ADR-MATCH-###   Live Match
ADR-COMP-###    Competition
ADR-STAT-###    History / Statistics
ADR-NOTIF-###   Notifications
ADR-MEDIA-###   Media
ADR-OFF-###     Online / Offline
ADR-RT-###      Realtime
ADR-DATA-###    Data Architecture
ADR-API-###     API / Application
ADR-SEC-###     Security / Privacy / LGPD
ADR-REL-###     Reliability
ADR-PERF-###    Performance / Scalability
ADR-OBS-###     Observability
ADR-QA-###      Testing / QA
ADR-OPS-###     Operations / Deploy
ADR-MIG-###     Migration / Strangler
ADR-GOV-###     Architecture Governance
```

The prefix identifies **decision ownership**, not implementation location.

## 1.2 Why not preserve the global working numeric sequence?

Alternative:

```text
ADR-0001
ADR-0002
...
ADR-0362
```

Rejected as the canonical namespace because:

- the numbers were assigned during analysis, before cross-context deduplication;
- later contexts intentionally switched to `DEC-OPS-*`, `DEC-MIG-*`, `DEC-GOV-*`;
- the same material decision appears under several working numbers from different perspectives;
- a global counter creates an unnecessary coordination bottleneck between bounded contexts;
- the number says nothing about decision ownership;
- preserving it as canonical would turn overlap into apparent contradiction.

## 1.3 Why not renumber everything globally from zero now?

Rejected because it would:

- invalidate useful C2 working references;
- require rewriting every C2 source merely to satisfy numbering aesthetics;
- create future global numbering coordination with no product benefit.

## 1.4 Alias rule

Working markers remain discoverable:

```text
ADR-0083
  → WORKING_ALIAS_OF ADR-MATCH-004

DEC-MIG-001
  → WORKING_ALIAS_OF ADR-MIG-001
```

They are **not** marked `SUPERSEDED`, because they were never accepted standalone canonical ADRs.

## 1.5 Material duplication rule

When several C2 anchors describe the same decision:

```text
one canonical owner ADR
+
zero or more aliases/references from other contexts
```

A context may still own a separate ADR when the scope is materially different.

Example:

```text
ADR-SEC-001
Security policy: browser untrusted; authorization contextual.

ADR-API-003
Application contract: actor is server-derived and capability/context is resolved before command execution.
```

These are related but not duplicates: one owns security policy, the other owns application-contract shape.

---

# 2. ADR lifecycle

Canonical lifecycle follows N2.23:

```text
PROPOSED
  ├── ACCEPTED
  │      ├── SUPERSEDED
  │      └── DEPRECATED
  └── REJECTED
```

All ADRs listed in the canonical sections below are `ACCEPTED` at the architecture-target level unless explicitly marked otherwise.

`ACCEPTED` here means:

```text
accepted target architecture decision
```

It does **not** mean:

```text
already implemented on main
already migrated in production
already proven by C7 audit
```

Implementation state is tracked separately in C6/migration and operational artifacts.

Material changes to an accepted ADR create a successor ADR or explicit revision/supersession record rather than silently rewriting historical rationale.

---

# 3. Global decision ownership rules

Before the detailed catalog, several ownership resolutions eliminate recurring duplication.

| Decision family | Canonical owner | Other contexts reference it |
|---|---|---|
| Organizer vs governance | `ADR-COM-003` | Session, Match, API, Security |
| One authority per aggregate / strangler | `ADR-MIG-001` | Offline, Data, Ops, Governance |
| Realtime is not source of truth | `ADR-RT-001` | Match, Registration, Notifications, Offline |
| Generic command idempotency | `ADR-API-006` | Reliability, Testing, every domain command |
| Transactional outbox + external effects after commit | `ADR-DATA-008` | Notifications, Reliability, API, Operations |
| Account deletion vs sports history | `ADR-ID-007` | Data, Security, Reliability |
| Final UUID / no local-cloud dual identity | `ADR-DATA-003` | Offline, Migration, Session, Media |
| IndexedDB/local authority model | `ADR-OFF-006` / `ADR-OFF-007` | Reliability, Security, Performance, QA |
| Match epoch/sequence/control protocol | `ADR-MATCH-004..007` | Offline, Realtime, Reliability, QA |
| Registration FIFO/serialization | `ADR-REG-003..004` | Reliability, Performance, QA |
| Deterministic attribute-only balancer | `ADR-BAL-001..004` | Performance, Observability, QA |
| Official competition result layer | `ADR-COMP-004` | Match, Stats, Realtime |
| Media READY-before-switch | `ADR-MEDIA-004` | Reliability, Operations |
| Schema authority = migrations | `ADR-DATA-010` | Operations, Migration, Governance |
| Expand/migrate/verify/contract deployment | `ADR-OPS-004` | Data, Reliability, Migration |

---

# 4. Identity / Player ADRs

Source: `N2.02 — Identity / Players`, with cross-context constraints in Principles, Security, Community and Statistics.

## ADR-ID-001 — User, Player and Participant are separate identities

**Status:** ACCEPTED  
**Owner:** Identity / Player  
**Decision:** `User ≠ Player ≠ Participant`. Authentication identity, persistent sports identity and event participation are modeled separately.

Consequences:

- a User may exist without a Player;
- a Player may exist without a User;
- participation is historical/contextual and may reference a Player optionally;
- Auth account lifecycle cannot be used as sports-history lifecycle.

**Source anchors:** N2.02 DECIDED / C3 trace.  
**Principles:** P-005, P-042.

## ADR-ID-002 — Player is a global sports identity, not a Community-owned clone

**Status:** ACCEPTED  
**Decision:** one Player can participate in multiple Communities through contextual relations.

Consequences:

- `CommunityPlayer` references global Player;
- no `Player per Community` duplication as the default model;
- global identity does not imply global visibility.

**Principles:** P-005, P-027.

## ADR-ID-003 — Guest participation does not create Player automatically

**Status:** ACCEPTED  
**Decision:** a Guest may participate through Participant/SessionParticipant without persistent Player creation. Promotion is explicit.

Consequences:

- Quick Sessions do not pollute the Player catalog;
- name equality never performs identity merge;
- later promotion/claim preserves explicit provenance.

**Principles:** P-005.

## ADR-ID-004 — User↔Player linking is an explicit controlled relation

**Status:** ACCEPTED  
**Decision:** target uses `PlayerAccountLink`/controlled link workflow instead of making `Player.user_id` the permanent identity model.

Consequences:

- anti-hijack checks and conflicts are first-class;
- account linking is online/server-authoritative;
- UUID/username knowledge never proves ownership;
- link lifecycle can survive schema evolution independently of Player.

## ADR-ID-005 — Historical participant identity uses immutable/minimal snapshots

**Status:** ACCEPTED  
**Decision:** historical views use Participant/MatchParticipation/roster snapshots appropriate to the event, not mutable current Player or Team state.

Consequences:

- current profile edits do not rewrite the past;
- snapshots are purpose-minimal;
- avatars are not frozen by default;
- Player merge can resolve current canonical identity while retaining original provenance.

**Principles:** P-013, P-032.

## ADR-ID-006 — Player merge is explicit, privileged and provenance-preserving

**Status:** ACCEPTED  
**Decision:** duplicate Players are reconciled through `PreviewPlayerMerge` / `MergePlayers` semantics, not generic dedupe/LWW.

Consequences:

- account-link conflicts can block merge;
- references/history/evaluations/community relations remain traceable;
- source UUID is never silently reused for another person;
- command is transactional/idempotent/audited.

## ADR-ID-007 — Account deletion is separate from sports-history deletion

**Status:** ACCEPTED  
**Decision:** removing Auth/account access does not cascade-delete shared sports facts. Retention/anonymization remains data-category and legal-purpose specific.

Consequences:

- shared history avoids `auth.users ON DELETE CASCADE` as lifecycle;
- account link/access can be removed while Match/Competition facts survive;
- backup restore must reapply privacy deletion/anonymization obligations where applicable.

**Working aliases absorbed:** ADR-0211, ADR-0267.  
**Principles:** P-005, P-028.

## ADR-ID-008 — Global Player does not imply a public global profile

**Status:** ACCEPTED  
**Decision:** visibility/discovery are purpose-specific read policies; existence of global Player row is not public-directory authorization.

Consequences:

- username discovery DTOs are minimal;
- raw evaluations, memberships and private statistics do not become public automatically;
- future public profile surface requires explicit policy.

---

# 5. Community ADRs

Source: `N2.03 — Communities`.

## ADR-COM-001 — CommunityMembership and CommunityPlayer are independent relations

**Status:** ACCEPTED  
**Decision:** Membership represents User access/governance; CommunityPlayer represents Player sports relation.

Consequences:

- Admin may be non-player;
- accountless Player may be in sports roster;
- removing Membership does not automatically delete Player relation/history.

**Principles:** P-006.

## ADR-COM-002 — CommunityJoinRequest is separate from effective Membership

**Status:** ACCEPTED  
**Decision:** PENDING/REJECTED/WITHDRAWN join intent lives in `CommunityJoinRequest`; effective Membership has its own lifecycle.

Consequences:

- no target `Membership(PENDING)` or `Membership(REJECTED)`;
- approval creates/reactivates effective Membership atomically;
- one pending request can be constrained independently.

## ADR-COM-003 — Governance roles and operational responsibilities are separate

**Status:** ACCEPTED  
**Decision:** governance roles are `OWNER | ADMIN | MEMBER`; `ORGANIZER` is an operational responsibility/capability source, not a governance level.

Consequences:

- Organizer does not gain member administration/ownership transfer;
- Admin/Owner do not automatically evaluate Players or control Matches;
- legacy `organizador` maps to operational responsibility, not automatic Admin.

**Working aliases absorbed:** ADR-0250; DEC/GOV security references.  
**Principles:** P-007, P-008.

## ADR-COM-004 — Every active Community has exactly one active Owner

**Status:** ACCEPTED  
**Decision:** Community creation atomically creates Owner Membership; ownership transfer is a dedicated transaction preserving exactly-one-owner invariant.

Consequences:

- Owner cannot leave/remove/suspend without safe transfer;
- creator provenance is not parallel permanent authority;
- transfer retry is idempotent and concurrency-safe.

## ADR-COM-005 — Community Organizer eligibility is refined by Session-specific assignment

**Status:** ACCEPTED  
**Decision:** Community `ORGANIZER` responsibility grants eligibility, while `SessionOrganizerAssignment` scopes responsibility to a particular Session; Match control remains separate.

Consequences:

- not every Organizer can mutate every other Organizer's Session by default;
- controlled admin recovery override can exist as explicit capability;
- assignment is not MatchControlLease.

## ADR-COM-006 — Community shared governance is online/server-authoritative

**Status:** ACCEPTED  
**Decision:** join approval, role/responsibility changes, remove/suspend/leave/ownership and Community lifecycle are server-authoritative commands, not generic offline mutations.

**References:** ADR-OFF-001, ADR-OFF-004.

## ADR-COM-007 — Community archive preserves history

**Status:** ACCEPTED  
**Decision:** archive/lifecycle deactivates organizational use without deleting sports/history facts.

## ADR-COM-008 — Community defaults are copied into context snapshots

**Status:** ACCEPTED  
**Decision:** defaults influence future Sessions but historical Session rules/config are snapshots; changing Community defaults does not rewrite existing Sessions.

**Principles:** P-013.

## ADR-COM-009 — V1 uses contextual static capability derivation, not arbitrary ACL builder

**Status:** ACCEPTED  
**Decision:** capabilities are derived from governance role, operational responsibilities and assignments by explicit policy. Legacy per-Community role-capability override builder is not the V1 target.

Consequences:

- simpler authorization surface;
- fewer privilege-escalation/configuration states;
- future configurable ACL requires new ADR and migration path.

---

# 6. Session ADRs

Source: `N2.04 — Sessions`.

## ADR-SES-001 — Session is an operational event distinct from Match, Competition, Fixture, RegistrationWindow and TeamDraw

**Status:** ACCEPTED

Consequences:

- Competition structure is not encoded as `Session.type=tournament`;
- Registration and Team Formation evolve independently;
- one Session may host multiple Matches/Fixtures/courts.

**References:** ADR-COMP-003, ADR-MATCH-001.

## ADR-SES-002 — Quick and Community use the same Session concept with different authority policies

**Status:** ACCEPTED  
**Decision:** Quick does not require Community and may be local-authoritative before publish; shared Community Session is server-authoritative.

**References:** ADR-OFF-001, ADR-OFF-002.

## ADR-SES-003 — Session has a small lifecycle separate from sub-workflow states

**Status:** ACCEPTED  
**Decision:** lifecycle does not encode players-selected/configured/teams-generated/voting/registration phases. Publication, Registration, Team Formation and Match have their own states.

**Current strong hypothesis:** initial lifecycle equivalent to `DRAFT → SCHEDULED → IN_PROGRESS → COMPLETED`, `CANCELLED` alternate exit. Exact enum naming remains open.

## ADR-SES-004 — Session roster is revisioned and normalized

**Status:** ACCEPTED  
**Decision:** `RosterRevision` + participants/entries replace authoritative selected-player ID arrays. Downstream artifacts reference exact roster revision/provenance.

Consequences:

- roster change stales dependent CandidateSet/TeamDraw;
- MatchRoster remains historical;
- waitlisted RegistrationEntry is never participant merely by existing.

## ADR-SES-005 — Session rules/configuration are frozen snapshots where history requires stability

**Status:** ACCEPTED  
**Decision:** Community defaults are copied into `SessionRulesSnapshot`/versioned configs rather than live-linked mutable defaults.

## ADR-SES-006 — Session readiness is derived and StartSession is distinct from StartMatch

**Status:** ACCEPTED  
**Decision:** readiness is a query/derived blocker set and is revalidated by semantic `StartSession`; starting a Session does not automatically mean starting every Match.

## ADR-SES-007 — Session cancellation is lifecycle, not deletion

**Status:** ACCEPTED  
**Decision:** cancellation preserves historical registrations/matches/facts and requires explicit handling of already-live Match activity.

---

# 7. Registration ADRs

Source: `N2.05 — Registration / Waitlist`.

## ADR-REG-001 — Registration is a bounded aggregate separate from Session participation

**Status:** ACCEPTED  
**Decision:** `RegistrationWindow`/`RegistrationEntry` model intent/current registration state; `SessionParticipant` is effective roster participation.

Consequences:

- WAITLISTED is never a participant;
- FinalizeRoster explicitly materializes roster from an exact Registration revision.

**Principles:** P-009.

## ADR-REG-002 — Shared Registration writes are server-authoritative and self-join resolves identity/eligibility server-side

**Status:** ACCEPTED  
**Decision:** client cannot claim another Player or establish eligibility by payload. Join/Leave/capacity/admin mutations are online-only.

**References:** ADR-OFF-004, ADR-SEC-001.

## ADR-REG-003 — FIFO uses authoritative monotonic sequence and per-Window serialization

**Status:** ACCEPTED  
**Decision:** queue order is not `created_at`, `updated_at` or client clock. Join serializes the relevant Window/aggregate.

Consequences:

- last-slot race yields one confirmed and next waiter deterministically;
- current hot contention is intentionally localized to a RegistrationWindow.

**Principles:** P-010.

## ADR-REG-004 — Confirmed Leave and waitlist promotion are one atomic transition

**Status:** ACCEPTED  
**Decision:** before LOCKED, leaving a confirmed slot and promoting the first eligible waiter happen in the same authoritative transaction. Promotion revalidates eligibility.

Consequences:

- no temporary free-slot race that new joiner can bypass;
- notification is downstream after commit.

## ADR-REG-005 — Registration lifecycle distinguishes CLOSED from LOCKED and preserves FIFO on capacity changes

**Status:** ACCEPTED  
**Decision:** V1 CLOSED rejects new Join but allows existing Leave/auto-promotion until LOCKED; capacity increase promotes FIFO; reduction below confirmed count is blocked by default rather than silently demoting.

**Revisit trigger:** new quota/ticket/priority semantics require dedicated policy ADR.

## ADR-REG-006 — Registration has monotonic domain revision and exact roster provenance

**Status:** ACCEPTED  
**Decision:** every authoritative visible state change advances revision; FinalizeSessionRoster records `source_registration_revision` and rejects stale expected revision.

## ADR-REG-007 — Post-start roster changes use explicit SessionRosterAdjustment

**Status:** ACCEPTED  
**Decision:** after execution starts, replacements do not mutate historical Registration as though pre-start queue were still active.

## ADR-REG-008 — Registration Realtime is minimal and revision-reconciled

**Status:** ACCEPTED  
**Decision:** realtime carries safe revision/count/status invalidation data; queue truth is obtained from authoritative snapshots/queries and gaps cause resync.

**References:** ADR-RT-003, ADR-RT-004.

---

# 8. Team Formation / Voting ADRs

Source: `N2.06 — Team Formation`.

## ADR-BAL-001 — Team Balancer is attribute-driven; Overall is display-only

**Status:** ACCEPTED  
**Decision:** canonical optimization input contains individual skill dimensions + positions/constraints/objectives, never Player Overall.

Consequences:

- Overall is absent from solver contract, not merely given weight zero;
- changing only Overall/formula cannot change canonical candidates;
- no performance fallback may reintroduce Overall.

**Principles:** P-011, P-034.

## ADR-BAL-002 — Team formation consumes immutable participant-centric balance snapshots

**Status:** ACCEPTED  
**Decision:** solver receives `PlayerBalanceSnapshot[]` tied to exact roster/source profile version, not mutable `Player[]` aggregates.

Consequences:

- historical draws remain reproducible;
- missing values are resolved with explicit versioned policy before solver;
- participant ID is the roster identity.

## ADR-BAL-003 — Hard constraints and soft objectives are separate, with feasibility precheck

**Status:** ACCEPTED  
**Decision:** hard invalidity can never be traded for a better score. Soft objectives rank valid candidates. Contradictory hard constraints are detected before expensive search where feasible.

## ADR-BAL-004 — Canonical Team Formation is seeded, versioned and fixed-work deterministic

**Status:** ACCEPTED  
**Decision:** same canonical snapshot/config/algorithm/objective-policy/seed/iteration budget yields same canonical result. Wall-clock may govern UX cancellation but not canonical result identity.

Consequences:

- algorithm upgrades are explicit versions;
- performance telemetry cannot alter result;
- CPU speed differences do not change candidate fingerprints.

## ADR-BAL-005 — Published CandidateSet is immutable and tied to roster revision

**Status:** ACCEPTED  
**Decision:** search output becomes authoritative only when a CandidateSet is published; roster change makes dependent set stale rather than mutating options in place.

## ADR-BAL-006 — Team selection supports Organizer Choice or Participant Vote over immutable candidates

**Status:** ACCEPTED  
**Decision:** `TeamSelectionPolicy` supports at least `ORGANIZER_CHOICE | PARTICIPANT_VOTE`; voting is optional rather than a mandatory Team Formation phase.

## ADR-BAL-007 — Voting eligibility/privacy are authoritative and stale candidates invalidate the round

**Status:** ACCEPTED  
**Decision:** eligible authenticated roster participants cast at most one effective vote; accountless/waitlisted participants do not get fabricated digital votes; ballots/tally obey visibility policy; roster/candidate staleness invalidates rather than rebinding ballots.

**Open:** exact quorum, plurality/tie/no-vote policy remain product decisions.

## ADR-BAL-008 — Shared client-side search is allowed; server revalidates authoritative inputs and candidate validity

**Status:** ACCEPTED  
**Decision:** Web Worker/client may perform expensive optimization over trusted frozen input, but shared publication/confirmation re-resolves authority and verifies roster/hard constraints/trusted objective diagnostics as needed.

Consequences:

- browser compute does not become security authority;
- server need not rerun entire heuristic search merely to validate a candidate.

## ADR-BAL-009 — TeamDraw is revisioned and preserves selection provenance

**Status:** ACCEPTED  
**Decision:** confirmed draw records roster revision, CandidateSet/selection path, versions, seed/input fingerprints and relevant diagnostics. Manual edit creates new revision rather than mutating history.

## ADR-BAL-010 — Reference scorer is the correctness baseline for optimized scorers

**Status:** ACCEPTED  
**Decision:** future incremental/optimized scoring must be differential/property equivalent to canonical reference semantics before adoption.

---

# 9. Live Match ADRs

Source: `N2.07 — Live Match`.

## ADR-MATCH-001 — Quick, Community and Competition use a universal Match engine

**Status:** ACCEPTED  
**Decision:** contexts differ in authority/policy/Fixture relationship, not in separate scoring engines.

**Working alias:** ADR-0078.

## ADR-MATCH-002 — MatchRoster and MatchRulesSnapshot freeze execution inputs

**Status:** ACCEPTED  
**Decision:** Match does not reconstruct historical participation/rules from mutable current Team/Community defaults.

**Working aliases:** ADR-0080, ADR-0081.

## ADR-MATCH-003 — MatchController is separate from Organizer

**Status:** ACCEPTED  
**Decision:** Organizer provides operational eligibility/assignment; MatchController is the actor/device currently authorized to control one Match.

**Working alias:** ADR-0082.  
**References:** ADR-COM-003, ADR-COM-005.

## ADR-MATCH-004 — Control lease is scoped per Match; courts are independent control domains

**Status:** ACCEPTED  
**Decision:** scoring/control authority is not one Session-wide lock. Each Match has its own lease and can run concurrently with other courts.

**Working aliases:** ADR-0083, ADR-0094.

## ADR-MATCH-005 — Control epoch fences stale controllers after takeover/reacquisition

**Status:** ACCEPTED  
**Decision:** every mutating command validates current `control_epoch`; old epoch commands cannot autoapply after authority changes.

**Working alias:** ADR-0084.

## ADR-MATCH-006 — MatchEvent log is the authoritative source for technical live facts

**Status:** ACCEPTED  
**Decision:** append-oriented events are authoritative; mutable score row is projection, not an independent source.

**Working alias:** ADR-0085.  
**Principles:** P-013, P-015, P-016.

## ADR-MATCH-007 — Server computes score with authoritative per-Match sequence and synchronous critical projection

**Status:** ACCEPTED  
**Decision:** client sends semantic intent such as AwardPoint; server validates rules/lease/epoch/expected sequence, appends event(s), advances unique sequence and updates MatchProjection in the same transaction.

**Working aliases:** ADR-0086, ADR-0087, ADR-0088.

Consequences:

- client score/winner fields are not authoritative;
- concurrent expected sequence commands serialize;
- projection can be rebuilt from event log but is kept synchronous because next command depends on it.

## ADR-MATCH-008 — Match corrections are append-oriented

**Status:** ACCEPTED  
**Decision:** correction/undo preserves original event/result revision and appends compensating/correction semantics instead of normal hard delete.

**Working alias:** ADR-0089.

## ADR-MATCH-009 — Capture mode changes statistical coverage, not scoring semantics

**Status:** ACCEPTED  
**Decision:** SCORE_ONLY/BASIC/DETAILED may change attribution/detail coverage but cannot alter point/set/match outcome for the same scoring sequence/rules.

**Working alias:** ADR-0090.

## ADR-MATCH-010 — Community Match offline continuity uses constrained ordered outbox + reconciliation

**Status:** ACCEPTED  
**Decision:** when enabled, offline controller commands carry command ID, epoch and base/expected sequence; reconnect either replays a compatible chain or enters `RECONCILIATION_REQUIRED`.

**Working aliases:** ADR-0091, ADR-0171, ADR-0283, ADR-0351.

**Important:** exact V1 rollout/lease TTL remain open; generic protocol shape is accepted.

## ADR-MATCH-011 — MatchResult is distinct from OfficialCompetitionResult

**Status:** ACCEPTED  
**Decision:** technical execution result does not directly own competition officialization/standings.

**Working alias:** ADR-0095.  
**Canonical competition owner:** ADR-COMP-004.

## ADR-MATCH-012 — Last-write-wins is forbidden for Match

**Status:** ACCEPTED  
**Decision:** conflicts use command identity, authoritative sequence, epoch and explicit reconciliation, never timestamp-based `keep mine / keep theirs`.

**Working alias:** ADR-0096.

## Working anchor absorbed by Competition

`ADR-0079 — Fixture is not Match` is canonicalized under `ADR-COMP-003`, because Fixture belongs to Competition planning semantics while Match owns execution.

`ADR-0093 — Realtime committed transport` is canonicalized under `ADR-RT-001/003` rather than duplicated in Match.

---

# 10. Competition ADRs

Source: `N2.08 — Competitions`.

## ADR-COMP-001 — League, championship and tournament share Competition + Stage engine

**Status:** ACCEPTED  
**Decision:** product labels/formats compose one Competition model; separate engines are not created merely because labels differ. `CompetitionSeries` remains optional until recurrence across editions requires it.

## ADR-COMP-002 — Competition teams/rosters/rules are persistent/versioned competitive state distinct from Session teams

**Status:** ACCEPTED  
**Decision:** CompetitionTeam and roster revisions persist across Sessions; ruleset freezes/versioning govern an edition/stage as policy requires.

## ADR-COMP-003 — Round, Fixture and Match are separate concepts; Fixture can have multiple executions

**Status:** ACCEPTED  
**Decision:** Round groups Fixtures; Fixture plans pairing/schedule/slot dependency; Match executes sport. A Fixture may have 0..N Match executions for replay/invalidation/administrative outcomes.

**Working alias:** ADR-0079.

## ADR-COMP-004 — OfficialCompetitionResult is a layer above technical MatchResult

**Status:** ACCEPTED  
**Decision:** Competition officializes/version-controls current result per Fixture; technical finish alone does not necessarily affect standings.

**Working alias:** ADR-0095.

## ADR-COMP-005 — Standings is a rebuildable projection from official results, penalties and versioned rules

**Status:** ACCEPTED  
**Decision:** standings is not directly editable and can be rebuilt deterministically from authoritative competitive facts.

## ADR-COMP-006 — Walkover/BYE/administrative outcomes do not fabricate sports events

**Status:** ACCEPTED  
**Decision:** regulatory score can exist as OfficialResult without inventing Match or PointEvents/player points; BYE is dependency/scheduling semantics, not fake Match.

## ADR-COMP-007 — Bracket progression uses explicit deterministic slot-dependency graph

**Status:** ACCEPTED  
**Decision:** slot sources explicitly represent direct entry, group/stage position, fixture winner/loser, seed or BYE; downstream resolves only from official source state.

## ADR-COMP-008 — Retroactive official corrections are versioned and require downstream impact analysis

**Status:** ACCEPTED  
**Decision:** correction can rebuild unresolved projections/dependencies but never silently swaps participants in already-started downstream Matches.

## ADR-COMP-009 — Competition administration is a separate capability domain

**Status:** ACCEPTED  
**Decision:** Session Organizer/MatchController/Captain do not automatically gain rules, penalties, structure or result-officialization authority.

---

# 11. History / Statistics ADRs

Source: `N2.09 — History / Statistics`.

## ADR-STAT-001 — Factual Statistics are separate from Evaluation, SkillProfile and Overall

**Status:** ACCEPTED  
**Decision:** sports facts do not automatically update subjective ratings; rating changes do not rewrite factual statistics.

Consequences:

- legacy Career rating is not imported as factual metric;
- ranking declares explicit metric/eligibility rather than hidden Overall.

## ADR-STAT-002 — MatchParticipation / historical roster is the source of who played

**Status:** ACCEPTED  
**Decision:** current Team membership is never used to retroactively decide participation.

**References:** ADR-ID-005, ADR-MATCH-002.

## ADR-STAT-003 — Statistics use per-Match contributions with first-class capture coverage

**Status:** ACCEPTED  
**Decision:** Match is the primary contribution unit; projection records source sequence/version and capture coverage. `UNKNOWN ≠ 0`.

Consequences:

- SCORE_ONLY cannot claim zero aces simply because detail was not captured;
- partial legacy history remains partial.

## ADR-STAT-004 — Shared stats/career are server-derived rebuildable, versioned projections

**Status:** ACCEPTED  
**Decision:** source Match/participation/results remain authoritative; projections declare stat-definition/calculation versions and rebuild path.

## ADR-STAT-005 — StatisticalEligibility separates technical facts from scope-specific official contribution

**Status:** ACCEPTED  
**Decision:** invalidation, official Competition result, replay and abandonment policies determine which Match contribution belongs in each statistical scope without deleting technical source facts.

## ADR-STAT-006 — Quick offline statistics are provisional overlay until authority handoff

**Status:** ACCEPTED  
**Decision:** local Quick can display deterministic provisional stats; successful publish causes server recomputation and replacement/dedupe so history is counted once.

**Working alias:** ADR-0182.

## ADR-STAT-007 — Official reports are revisioned/superseded rather than silently overwritten

**Status:** ACCEPTED  
**Decision:** source correction produces new report revision while prior issued artifact remains attributable/auditable according to policy.

## ADR-STAT-008 — PostgreSQL is the initial statistics/projection platform

**Status:** ACCEPTED  
**Decision:** contributions/projections remain in Postgres until measured workload demonstrates need for warehouse/search/OLAP specialization.

**Revisit trigger:** measured scale/query/cost requirements beyond Postgres design.

---

# 12. Notifications ADRs

Source: `N2.10 — Notifications`.

## ADR-NOTIF-001 — Notifications are downstream of committed domain facts

**Status:** ACCEPTED  
**Decision:** domain success does not depend on notification provider. Source transaction writes durable fact and transactional outbox when asynchronous communication is required.

**Working aliases:** ADR-0132, ADR-0133.  
**References:** ADR-DATA-008.

## ADR-NOTIF-002 — NotificationPolicy creates recipient-specific semantically deduplicated intents

**Status:** ACCEPTED  
**Decision:** not every DomainEvent notifies; typed policy resolves recipient/category/urgency/template/channel eligibility. One logical communication is not recreated per device/retry.

**Working aliases:** ADR-0134, ADR-0135.

## ADR-NOTIF-003 — Persistent Inbox is independent of transport; read and delivery states are separate

**Status:** ACCEPTED  
**Decision:** Push/Email success is distinct from Inbox existence and user read/archive state.

**Working aliases:** ADR-0136, ADR-0137.

## ADR-NOTIF-004 — Scheduled delivery revalidates source relevance, preferences and expiry

**Status:** ACCEPTED  
**Decision:** delayed work does not blindly send stale reminders after Session/Registration/Membership state changes.

**Working alias:** ADR-0138.

## ADR-NOTIF-005 — Templates are versioned and rendered historical content is frozen

**Status:** ACCEPTED  
**Decision:** template/locale version and rendered snapshot remain attributable; later copy change does not rewrite message history.

**Working alias:** ADR-0139.

## ADR-NOTIF-006 — Provider adapters run through at-least-once idempotent poison-isolating workers

**Status:** ACCEPTED  
**Decision:** Postgres/outbox + worker is initial infrastructure; no dedicated broker is required before evidence. Retries/leases/dedupe/terminal failure are explicit.

**Working aliases:** ADR-0140, ADR-0141.

## ADR-NOTIF-007 — Push endpoints are User/installation scoped and delivery data is privacy-minimized

**Status:** ACCEPTED  
**Decision:** endpoint ownership is server-derived; provider secrets stay server-side; provider/lock-screen payload contains only necessary data.

**Working aliases:** ADR-0142, ADR-0144.

## ADR-NOTIF-008 — Realtime only accelerates durable Inbox visibility

**Status:** ACCEPTED  
**Decision:** loss of realtime cannot lose NotificationIntent/Inbox state.

**Working aliases:** ADR-0143, ADR-0199.

## ADR-NOTIF-009 — WhatsAppShareDraft is separate from automated WhatsApp delivery

**Status:** ACCEPTED  
**Decision:** current/manual share artifact is not DeliveryAttempt/evidence; future WhatsApp adapter joins notification provider architecture without redefining the draft.

**Working alias:** ADR-0145.

## ADR-NOTIF-010 — Preferences/category/urgency are delivery policy, not source-domain state

**Status:** ACCEPTED  
**Decision:** suppressing/delaying communication never rewrites Registration/Session/Match/Competition truth.

**Working alias:** ADR-0146.

---

# 13. Media ADRs

Source: `N2.11 — Media`.

## ADR-MEDIA-001 — MediaAsset ID is canonical media identity; URL/path is infrastructure

**Status:** ACCEPTED  
**Decision:** domain entities reference `asset_id`; provider bucket/path/CDN/signed URL are delivery descriptors.

**Working aliases:** ADR-0147, ADR-0148, ADR-0157.

## ADR-MEDIA-002 — Raw upload enters private trust zone and mandatory server-controlled processing precedes READY

**Status:** ACCEPTED  
**Decision:** client validation/resize/compression is UX/bandwidth optimization only. Server decodes/validates dimensions/pixel budget, strips metadata and normalizes/re-encodes before asset can become READY.

**Working aliases:** ADR-0149, ADR-0150, ADR-0151.

## ADR-MEDIA-003 — V1 uses a restricted raster allowlist and separates technical processing from moderation

**Status:** ACCEPTED  
**Decision:** baseline JPEG/PNG/WebP; SVG/animation are rejected unless future ADR. Technical READY and content approval are independent lifecycles.

**Working aliases:** ADR-0152, ADR-0153.

## ADR-MEDIA-004 — Core attachments are typed and replacement is immutable READY-before-switch

**Status:** ACCEPTED  
**Decision:** central entities use explicit asset FKs; replacement produces new asset/key and switches pointer only after READY, leaving old attachment intact on failure.

**Working aliases:** ADR-0154, ADR-0155, ADR-0287.

## ADR-MEDIA-005 — Delivery is visibility-aware; public keys are immutable and signed URLs are ephemeral

**Status:** ACCEPTED  
**Decision:** approved PUBLIC variant may use public/CDN cache; PRIVATE/CONTEXTUAL uses authorized/signed delivery. Signed URL is never persisted identity.

**Working aliases:** ADR-0156, ADR-0157.

## ADR-MEDIA-006 — No cross-user binary dedupe V1; raw and sanitized retention have separate policies

**Status:** ACCEPTED  
**Decision:** checksum helps integrity/idempotency but does not create cross-user ownership; raw incoming is short-lived, sanitized master may be retained privately to regenerate variants.

**Working aliases:** ADR-0158, ADR-0159.

## ADR-MEDIA-007 — Orphan cleanup is eventual/idempotent; quotas/rate-limits protect storage and processing

**Status:** ACCEPTED  
**Decision:** GC observes grace/reference/proposal protection and runs outside critical replacement transaction; upload lifecycle has abuse/cost controls.

**Working aliases:** ADR-0160, ADR-0161.

## ADR-MEDIA-008 — Media starts with Storage adapter + server processing, not mandatory microservice

**Status:** ACCEPTED  
**Decision:** logical boundary does not require distributed service/Kafka/image CDN before measured scale.

**Working alias:** ADR-0162.

## ADR-MEDIA-009 — Presentation media is independent from sports history

**Status:** ACCEPTED  
**Decision:** Match/Session history does not freeze avatar by default; identity/history persists even if media attachment changes or is removed according to privacy policy.

**Working alias:** ADR-0163.

---

# 14. Online / Offline ADRs

Source: `N2.12 — Online / Offline Architecture`.

## ADR-OFF-001 — Offline policy is defined per operation; shared mutable state is server-authoritative by default

**Status:** ACCEPTED  
**Decision:** every operation is classified as `ONLINE_AUTHORITATIVE`, `OFFLINE_OWNED`, `CACHED_READ`, `LOCAL_DRAFT` or `CONDITIONALLY_OFFLINE_COMMAND`.

**Working aliases:** ADR-0164, ADR-0165.  
**Principles:** P-003, P-004.

## ADR-OFF-002 — Quick Session is local-authoritative until explicit one-way handoff using final IDs

**Status:** ACCEPTED  
**Decision:** Quick works fully offline, uses final UUIDs, and `PublishQuickSession` explicitly transfers authority. Reconnection alone never publishes or changes authority.

**Working aliases:** ADR-0166, ADR-0167.

Consequences:

- no permanent localId→cloudId remap;
- unknown publish outcome freezes authority-sensitive edits until same-command recovery;
- SERVER_OWNED does not revert to local authority on network loss.

## ADR-OFF-003 — Generic bidirectional domain sync is retired; offline command outbox is allowlist-only

**Status:** ACCEPTED  
**Decision:** there is no universal successor to `LocalSyncPayload + merge`; only explicitly offline-capable semantic commands can enter an outbox.

**Working aliases:** ADR-0168, ADR-0169.

## ADR-OFF-004 — Registration, Voting and Governance are never generic offline-queued

**Status:** ACCEPTED  
**Decision:** capacity/order/deadline/capability semantics require fresh server authority; offline UI may hold draft intent/cache but cannot claim accepted domain mutation.

**Working alias:** ADR-0170.

## ADR-OFF-005 — Match offline uses its dedicated epoch/sequence/reconciliation protocol

**Status:** ACCEPTED  
**Canonical owner:** ADR-MATCH-010.  
**Working alias:** ADR-0171.

This ADR exists as Offline classification/reference; Match owns detailed protocol.

## ADR-OFF-006 — IndexedDB is structured local storage; localStorage is limited to small preferences/metadata

**Status:** ACCEPTED  
**Decision:** Quick facts, Match outbox, structured drafts and remote cache move to IndexedDB; `localStorage` is not a domain-event database.

**Working aliases:** ADR-0172, ADR-0173, ADR-0310.

## ADR-OFF-007 — Local data is account-scoped; anonymous data requires explicit import/claim

**Status:** ACCEPTED  
**Decision:** account switch stops replay and isolates/seals prior account data; anonymous device-local data is not silently attributed to first login.

**Working aliases:** ADR-0174, ADR-0175, ADR-0262.

## ADR-OFF-008 — Connectivity and data freshness are independent multidimensional states

**Status:** ACCEPTED  
**Decision:** `navigator.onLine` is a hint; backend/Auth/Realtime/Storage reachability are separable. Cache carries FRESH/STALE/UNKNOWN metadata independently.

**Working aliases:** ADR-0176, ADR-0177.

## ADR-OFF-009 — LWW is limited to explicitly low-risk local-only data; server primitives govern shared ordering/time

**Status:** ACCEPTED  
**Decision:** critical shared conflicts use revision, queue sequence, Match sequence/epoch or server deadline, never client timestamp recency.

**Working aliases:** ADR-0178, ADR-0179.

## ADR-OFF-010 — V1 has no multi-device local-draft merge; Service Worker is not domain mutation authority

**Status:** ACCEPTED  
**Decision:** local drafts remain device-scoped; Service Worker handles app shell/static assets and does not replay arbitrary critical domain mutations.

**Working aliases:** ADR-0180, ADR-0181; DEC-OPS-013.

## Decisions owned elsewhere

- `ADR-0182` → canonical `ADR-STAT-006`.
- `ADR-0183` → canonical `ADR-MIG-001/007`.

---

# 15. Realtime ADRs

Source: `N2.13 — Realtime`.

## ADR-RT-001 — Realtime transports committed semantic state; Broadcast/private receive-only channels are the default

**Status:** ACCEPTED  
**Decision:** Realtime is neither source of truth, command bus, offline sync nor notification durability. Supabase Broadcast is preferred to exposing raw row changes; authoritative clients receive rather than publish domain facts by default.

**Working aliases:** ADR-0093, ADR-0184, ADR-0185, ADR-0186, ADR-0188.

## ADR-RT-002 — Realtime contracts are semantic/versioned; administrative state uses revision and Match uses sequence

**Status:** ACCEPTED  
**Decision:** envelope is independent of physical DB row contract. Version/revision/sequence supply convergence semantics; timestamps are descriptive only.

**Working aliases:** ADR-0189, ADR-0190, ADR-0191.

## ADR-RT-003 — Clients subscribe+buffer before snapshot; gaps/reconnect always reconcile authoritatively

**Status:** ACCEPTED  
**Decision:** handshake is subscribe/buffer → fetch snapshot/checkpoint → discard old → apply contiguous new. Gap or reconnect triggers range/snapshot recovery.

**Working aliases:** ADR-0192, ADR-0193, ADR-0194, ADR-0289.

## ADR-RT-004 — Registration/Voting realtime payloads are privacy-minimized

**Status:** ACCEPTED  
**Decision:** Registration broadcasts revision/count/status rather than raw queue identities; Voting never exposes ballots and obeys tally visibility policy.

**Working aliases:** ADR-0195, ADR-0196.

## ADR-RT-005 — Realtime fan-out is resource-scoped and context-specific

**Status:** ACCEPTED  
**Decision:** Match uses per-Match topics/contiguous sequence; Competition favors low-frequency invalidation; Notifications use user-scoped Inbox acceleration.

**Working aliases:** ADR-0197, ADR-0198, ADR-0199.

## ADR-RT-006 — Presence is ephemeral and distinct from persisted attendance/availability

**Status:** ACCEPTED  
**Decision:** socket Presence never determines Membership, Registration, attendance history, Match authority or participation.

**Working alias:** ADR-0200.

## ADR-RT-007 — Unknown event schema fails safe through refetch/incompatibility; convergence is observable

**Status:** ACCEPTED  
**Decision:** clients do not guess unsupported payload semantics; telemetry measures gaps/reconnect/fan-out without sensitive raw payload.

**Working aliases:** ADR-0201, ADR-0202.

## Related security rule

`ADR-0187` channel authorization is absorbed by `ADR-SEC-001` + `ADR-RT-001`: channel access is contextual but never substitutes command authorization.

---

# 16. Data Architecture ADRs

Source: `N2.14 — Data Architecture`.

## ADR-DATA-001 — PostgreSQL is the authoritative relational shared-state model; every table declares truth class

**Status:** ACCEPTED  
**Decision:** Postgres models relationships/invariants rather than mirroring serialized TypeScript state. Data is classified as Source Fact, Mutable Current State, Immutable Snapshot or Derived Projection.

**Working aliases:** ADR-0203, ADR-0207.

## ADR-DATA-002 — Initial schema strategy is public + app_private, not schema-per-context

**Status:** ACCEPTED  
**Decision:** exposed domain/query surfaces live where RLS/API can protect them; command receipts/outbox/worker checkpoints/internal support reside in private schema. Per-context schemas are deferred until need.

**Working alias:** ADR-0204.

## ADR-DATA-003 — Target uses final UUID identities and domain revision/sequence, not local/cloud dual IDs or generic sync_version

**Status:** ACCEPTED

**Working aliases:** ADR-0205, ADR-0206.

Consequences:

- `cloudId/local_id` are migration-only legacy concerns;
- revisions/sequences exist only with domain semantics.

## ADR-DATA-004 — Core relations are normalized; JSONB is bounded to genuinely flexible/versioned payloads

**Status:** ACCEPTED  
**Decision:** Memberships, rosters, votes, participants, official results and other relationships use relational FKs/tables, not authoritative ID arrays/opaque JSON. JSONB remains useful for event payloads, snapshots and diagnostics where appropriate.

**Working aliases:** ADR-0208, ADR-0209.

## ADR-DATA-005 — FK/delete semantics and lifecycle are explicit; generic soft-delete is not universal

**Status:** ACCEPTED  
**Decision:** RESTRICT/SET NULL/CASCADE is chosen by semantics; historical shared facts do not cascade from Auth deletion; domain lifecycle uses ACTIVE/ARCHIVED/REMOVED/CANCELLED/etc. rather than a universal `deleted_at` state machine.

**Working aliases:** ADR-0210, ADR-0211, ADR-0212.  
**Primary account/history owner:** ADR-ID-007.

## ADR-DATA-006 — Constraints, partial uniqueness and indexes are derived from invariants and access paths

**Status:** ACCEPTED  
**Decision:** DB constraints are defense-in-depth for structural/domain uniqueness; indexes serve real queries/RLS/order invariants and are plan-verified rather than added indiscriminately.

**Working aliases:** ADR-0213, ADR-0214, ADR-0215.

## ADR-DATA-007 — Critical commands own explicit transactions and aggregate-local locks

**Status:** ACCEPTED  
**Decision:** multi-row critical invariants commit atomically; hot locks are scoped to roots such as RegistrationWindow, Match, VotingRound, ownership/Fixture as needed rather than global application locks.

**Working aliases:** ADR-0216, ADR-0217.

## ADR-DATA-008 — Audit, domain outbox and command receipts are separate; outbox is atomic with source and providers run post-commit

**Status:** ACCEPTED  
**Decision:** source transaction may create command receipt/outbox atomically; external provider call is never held inside critical domain transaction. Audit serves semantic privileged history, not delivery dedupe or event queue.

**Working aliases:** ADR-0219, ADR-0220, ADR-0221, ADR-0245, ADR-0279; DEC-OPS-011.

## ADR-DATA-009 — A projection is called rebuildable only with explicit source/version/rebuild contract

**Status:** ACCEPTED  
**Decision:** projection must identify source facts/checkpoint/calculation version/rebuild procedure/integrity evidence. Source wins on divergence.

**Working aliases:** ADR-0218, ADR-0282.

## ADR-DATA-010 — Versioned migrations are schema authority; backfills are resumable and semantically verified

**Status:** ACCEPTED  
**Decision:** Git migration chain is source of truth; consolidated schema snapshots are generated/verified artifacts. Backfills checkpoint after durable batches and verify meaning/references, not only row counts.

**Working aliases:** ADR-0222, ADR-0223, ADR-0224; DEC-OPS-002, DEC-MIG-018, DEC-GOV-006.

## ADR-DATA-011 — Partitioning is deferred until measured operational trigger

**Status:** ACCEPTED  
**Decision:** MatchEvents and other tables begin unpartitioned unless measured index/vacuum/query/backup/restore pain justifies change.

**Working alias:** ADR-0225.

## ADR-DATA-012 — Context data ownership is explicit

**Status:** ACCEPTED  
**Decision:** every durable dataset/source/projection has conceptual owner; a global `community_id` is not added mechanically to every table merely as pseudo-tenancy.

**Working alias:** ADR-0226.

---

# 17. API / Application ADRs

Source: `N2.15 — API / Application Layer`.

## ADR-API-001 — Application API expresses semantic Commands/Queries, not generic critical CRUD

**Status:** ACCEPTED  
**Decision:** UI → Application Use Case → Command/Query Port → Infrastructure. Critical mutation names express intent (`JoinRegistration`, `AwardPoint`, `TransferOwnership`) rather than `updateRow/upsert`.

**Working aliases:** ADR-0227, ADR-0228.

## ADR-API-002 — DTO, DB Row, Domain Model and ViewModel are distinct contracts with runtime validation at untrusted boundaries

**Status:** ACCEPTED  
**Decision:** generated DB types remain infrastructure concerns; external DTOs are allowlisted/validated and cannot mass-assign protected fields.

**Working aliases:** ADR-0229, ADR-0240.

## ADR-API-003 — Actor is server-derived and authorization resolves actual resource context + capability

**Status:** ACCEPTED  
**Decision:** payload actor/role/community labels do not grant privilege; server resolves target resource context and current capability.

**Working aliases:** ADR-0230, ADR-0231.  
**References:** ADR-SEC-001.

## ADR-API-004 — Choose direct reads, Postgres RPC and Edge/server functions by responsibility

**Status:** ACCEPTED  
**Decision:** deliberate simple reads may use SELECT/PostgREST; DB-local transactional/lock-sensitive commands prefer hardened RPC; external secrets/providers/processes use Edge/server function. No universal Edge proxy and no all-business-logic-in-PL/pgSQL rule.

**Working aliases:** ADR-0232, ADR-0233, ADR-0234.

## ADR-API-005 — Critical command responses are authoritative and errors have stable domain codes

**Status:** ACCEPTED  
**Decision:** command response returns accepted state/revision/sequence needed by caller; SQLSTATE/raw messages are internal and mapped to stable product errors/recovery actions.

**Working aliases:** ADR-0235, ADR-0236.

## ADR-API-006 — Idempotent Commands use stable command_id distinct from request_id; receipts support unknown-outcome recovery

**Status:** ACCEPTED  
**Decision:** retries of same logical command reuse command ID; each transport attempt gets request ID. Internal command receipt dedupes same intention while domain uniqueness still protects different-ID double clicks.

**Working aliases:** ADR-0237, ADR-0238, ADR-0276, ADR-0344.

## ADR-API-007 — Optimistic concurrency uses domain revision/sequence, not updated_at

**Status:** ACCEPTED  
**Decision:** Registration/Voting/Session use revisions where appropriate; Match uses expected sequence/epoch; timestamps never become generic conflict authority.

**Working alias:** ADR-0239.

## ADR-API-008 — Query contracts/read models are explicit and large feeds use keyset/cursor where appropriate

**Status:** ACCEPTED  
**Decision:** no generic arbitrary-table/filter API; public/private DTOs and pagination are purpose-specific.

**Working aliases:** ADR-0241, ADR-0242.

## ADR-API-009 — Contract evolution is additive before removal

**Status:** ACCEPTED  
**Decision:** server/client compatibility uses expand/additive changes and explicit old-client retirement before destructive contract.

**Working alias:** ADR-0243.

## ADR-API-010 — Background jobs are only for asynchronous work; generic cloud services are retired by vertical slice

**Status:** ACCEPTED  
**Decision:** synchronous capacity/order invariants stay in command transaction. Outbox/jobs handle post-commit effects. New target modules do not add generic cloud upsert/softDelete paths.

**Working aliases:** ADR-0244, ADR-0245, ADR-0246.

---

# 18. Security / Privacy / LGPD ADRs

Source: `N2.16 — Security / Privacy / LGPD`.

## ADR-SEC-001 — Browser is untrusted; authentication is distinct from resource-context capability authorization

**Status:** ACCEPTED  
**Decision:** JWT identifies actor but access is resolved against actual target resource, current memberships/responsibilities/assignments/capabilities. UUID knowledge is never access proof.

**Working aliases:** ADR-0247, ADR-0248, ADR-0249.  
**Principles:** P-002, P-008, P-021, P-026.

## ADR-SEC-002 — RLS is mandatory defense in depth; critical mutations use semantic server commands

**Status:** ACCEPTED  
**Decision:** application/RPC authorization does not replace RLS on exposed protected data; ordinary browser cannot directly administer critical rows.

**Working aliases:** ADR-0251, ADR-0252.

## ADR-SEC-003 — SECURITY DEFINER functions are privileged endpoints with empty search_path and qualified objects

**Status:** ACCEPTED  
**Decision:** target functions minimize EXECUTE grants, explicitly authenticate/authorize and use `search_path=''` + fully qualified names.

**Working alias:** ADR-0253.

## ADR-SEC-004 — Service/provider secrets are server-only and user-editable metadata never authorizes

**Status:** ACCEPTED  
**Decision:** service-role/provider secrets never ship in browser; `VITE_*` assumed public; `raw_user_meta_data` cannot grant role/capability.

**Working aliases:** ADR-0254, ADR-0255, ADR-0263.

## ADR-SEC-005 — Selected high-impact operations require server-enforced MFA/AAL2 step-up

**Status:** ACCEPTED  
**Decision:** ownership transfer, high-risk identity/admin operations and other policy-selected commands can require current AAL2; UI gating alone is insufficient.

**Working alias:** ADR-0256.

**Open:** exact command set remains configurable by security policy.

## ADR-SEC-006 — BOLA/IDOR and mass-assignment protections are mandatory design/test requirements

**Status:** ACCEPTED  
**Decision:** every resource class/privileged command has negative cross-context tests; command DTOs allowlist mutable fields.

**Working aliases:** ADR-0257, ADR-0258.

## ADR-SEC-007 — Protected Realtime and Storage/Media follow private trust-zone/minimal-delivery rules

**Status:** ACCEPTED  
**Decision:** clients cannot publish authoritative protected realtime; private object path knowledge grants nothing; raw media is private until sanitized.

**Working aliases:** ADR-0259, ADR-0260.  
**Primary owners:** ADR-RT-001/004, ADR-MEDIA-002/005.

## ADR-SEC-008 — XSS is the primary authenticated-browser threat; local browser storage is not a secret vault

**Status:** ACCEPTED  
**Decision:** user content renders inert by default, dangerous URLs/HTML are constrained, secrets are minimized, IndexedDB/localStorage are treated as accessible to compromised browser context.

**Working aliases:** ADR-0261, ADR-0262.

## ADR-SEC-009 — Security audit is semantic and privacy-minimized

**Status:** ACCEPTED  
**Decision:** privileged actions record actor/target/action/outcome/reason where needed, not generic full-row/payload dumps.

**Working alias:** ADR-0264.

## ADR-SEC-010 — Privacy processing inventory governs purpose, legal basis, retention, vendors and transfers

**Status:** ACCEPTED  
**Decision:** personal-data processing activities are explicit; consent is only used where it is actual legal basis; vendors/subprocessors/international-transfer mechanisms are inventoried; retention is category-specific.

**Working aliases:** ADR-0265, ADR-0266, ADR-0268, ADR-0269.

## ADR-SEC-011 — Account/privacy deletion does not equate to destructive sports-history cascade

**Status:** ACCEPTED  
**Canonical owner:** ADR-ID-007.  
**Working alias:** ADR-0267.

Security owns privacy workflow/enforcement; Identity owns domain separation.

## ADR-SEC-012 — Security/privacy incident response is predesigned and operationally recordable

**Status:** ACCEPTED  
**Decision:** detection/triage/risk assessment/notification/record processes exist before incident; affected data categories/subjects can be identified without unsafe ad-hoc logs.

**Working alias:** ADR-0270.

## ADR-SEC-013 — Platform administration is separate from Community roles

**Status:** ACCEPTED  
**Decision:** internal support/admin/break-glass capability uses strong controls/audit and is not implicit Community Owner/Admin/Organizer/MatchController.

**Working alias:** ADR-0271.

## ADR-SEC-014 — Security migration uses P0/P1/P2 risk gates

**Status:** ACCEPTED  
**Decision:** dangerous cascades/privileged function hardening/critical command authorization/secret exposure and other P0 issues are not deferred merely because domain migration wave has not finished.

**Working alias:** ADR-0272.

---

# 19. Reliability ADRs

Source: `N2.17 — Reliability`.

## ADR-REL-001 — Correctness dominates unrestricted availability for critical shared state; data has criticality classes

**Status:** ACCEPTED  
**Decision:** C0 source facts/C1 snapshots/C2 projections/C3 ephemeral data receive different recovery treatment. Shared Registration/ownership/Match correctness fails closed rather than accepting semantically unsafe offline guesses.

**Working aliases:** ADR-0273, ADR-0274.

## ADR-REL-002 — Command success means committed authoritative transaction; unknown outcome is recovered idempotently

**Status:** ACCEPTED  
**Decision:** timeout is not proof of failure; same logical command ID is retried/recovered.

**Working aliases:** ADR-0275, ADR-0276.  
**Primary API owner:** ADR-API-006.

## ADR-REL-003 — Retry is failure-class aware, bounded and jittered

**Status:** ACCEPTED  
**Decision:** safe/transient failures may retry with bounded backoff; validation/auth/conflict generally require different recovery, not blind retry loops.

**Working alias:** ADR-0277.

## ADR-REL-004 — Async workers are at-least-once with leases/idempotency and poison isolation

**Status:** ACCEPTED  
**Decision:** no distributed exactly-once claim; duplicate delivery is expected and bounded by semantic idempotency/dedupe. Permanent poison becomes visible/quarantined without blocking unrelated work.

**Working aliases:** ADR-0278, ADR-0280, ADR-0281.

## ADR-REL-005 — Projection recovery requires documented rebuild semantics

**Status:** ACCEPTED  
**Decision:** projection recovery is deterministic only when source/version/rebuild contract exists; ambiguous source-fact repair is not auto-repair.

**Working alias:** ADR-0282.  
**Primary data owner:** ADR-DATA-009.

## ADR-REL-006 — Dependency degradation never weakens authorization or domain invariants

**Status:** ACCEPTED  
**Decision:** Realtime/Storage/provider/Auth/Postgres failures degrade only capabilities whose dependencies are truly unavailable; no fallback trusts stale local role or invalid source.

**Working alias:** ADR-0291.

## ADR-REL-007 — Backup reliability requires tested isolated restore including privacy-deletion replay and stale-side-effect controls

**Status:** ACCEPTED  
**Decision:** backup existence is not proof of recovery. Restore drills verify DB/Storage/invariants/projections and prevent blind replay of stale outbox/notifications; deletion/anonymization obligations are reapplied.

**Working alias:** ADR-0292.

## ADR-REL-008 — Deployment reliability uses compatible expansion and active-cohort protection

**Status:** ACCEPTED  
**Decision:** additive/expand/verify/contract is preferred; active Match/protocol cohorts are not destructively migrated mid-execution.

**Working alias:** ADR-0293.  
**Primary ops/migration owners:** ADR-OPS-004, ADR-MIG-005.

## ADR-REL-009 — Numerical RPO/RTO/SLO targets require business requirement and measured evidence

**Status:** ACCEPTED  
**Decision:** architecture defines mechanisms/SLIs first and does not fabricate operational promises.

**Working alias:** ADR-0294.

## Context recovery aliases, not duplicate ADRs

```text
ADR-0283 → ADR-MATCH-010
ADR-0284 → ADR-REG-003/004
ADR-0285 → ADR-BAL-007
ADR-0286 → ADR-COMP-005/008
ADR-0287 → ADR-MEDIA-004
ADR-0288 → ADR-NOTIF-001
ADR-0289 → ADR-RT-003
ADR-0290 → ADR-OFF-006/007
```

---

# 20. Performance / Scalability ADRs

Source: `N2.18 — Performance / Scalability`.

## ADR-PERF-001 — Operational work is bounded by current context, not total history

**Status:** ACCEPTED  
**Decision:** hot commands/queries operate on current aggregate/page/projection rather than downloading/scanning global history.

**Working alias:** ADR-0295.

## ADR-PERF-002 — Growing reads use server pagination/keyset, deliberate read models and query-driven indexes without bypassing RLS

**Status:** ACCEPTED  
**Decision:** query shape → plan → index/read model is optimized before specialized cache. Keyset/cursor is preferred for deep mutable history where appropriate.

**Working aliases:** ADR-0296, ADR-0297, ADR-0298, ADR-0299, ADR-0300.

## ADR-PERF-003 — Registration and Match preserve aggregate-local serialization while scaling across independent roots

**Status:** ACCEPTED  
**Decision:** optimize duration/query/index of per-Window/per-Match critical section; do not remove FIFO/sequence correctness merely to increase apparent throughput.

**Working aliases:** ADR-0301, ADR-0302.

## ADR-PERF-004 — MatchEvent remains unpartitioned until measured operational trigger

**Status:** ACCEPTED  
**Working alias:** ADR-0303.  
**Primary data owner:** ADR-DATA-011.

## ADR-PERF-005 — Realtime fan-out is resource-scoped with minimal semantic payload

**Status:** ACCEPTED  
**Working alias:** ADR-0304.  
**Primary realtime owner:** ADR-RT-005.

## ADR-PERF-006 — Browser Team Balancer baseline uses compact snapshots + Web Worker and deterministic iteration budget

**Status:** ACCEPTED  
**Decision:** heavy compute leaves main thread; canonical result remains fixed-work deterministic and multidimensional.

**Working aliases:** ADR-0305, ADR-0306.  
**Primary Team owner:** ADR-BAL-002, ADR-BAL-004.

## ADR-PERF-007 — Statistics, Media and IndexedDB use bounded purpose-specific representations

**Status:** ACCEPTED  
**Decision:** stats use contributions/projections; media uses appropriately sized immutable variants; one local event does not stringify the entire domain database.

**Working aliases:** ADR-0307, ADR-0308, ADR-0310.

## ADR-PERF-008 — Background workers use bounded batches, backpressure and checkpointed long work

**Status:** ACCEPTED  
**Decision:** queue/rebuild/backfill concurrency is bounded and restartable rather than unbounded parallel retry.

**Working aliases:** ADR-0311, ADR-0314.

## ADR-PERF-009 — Specialized scaling infrastructure requires explicit measured trigger

**Status:** ACCEPTED  
**Decision:** Redis/read replica/broker/search engine/partitioning/new service is adopted only after simpler boundary/query/index/algorithm optimizations and measured need.

**Working alias:** ADR-0312.  
**Principles:** P-033, P-039.

## ADR-PERF-010 — Load/performance tests assert correctness together with latency/throughput; migrations are load-aware

**Status:** ACCEPTED

**Working aliases:** ADR-0313, ADR-0314, ADR-0315.

## ADR-PERF-011 — Quantitative performance budgets require measured baseline/product requirement

**Status:** ACCEPTED  
**Working alias:** ADR-0316.

## Measurement-only decision

`ADR-0309 — route/code splitting follows bundle measurement` is absorbed here as a local performance policy under ADR-PERF-001/011 rather than maintained as a high-cost standalone architecture decision.

---

# 21. Observability ADRs

Source: `N2.19 — Observability`.

## ADR-OBS-001 — Domain History, Audit, Telemetry and Application Logs are separate

**Status:** ACCEPTED  
**Decision:** observability retention is never required to reconstruct sport/domain truth; audit has independent semantic/retention policy.

**Working alias:** ADR-0317.  
**Principles:** P-029.

## ADR-OBS-002 — Structured telemetry uses semantic names and distinct request/command/trace/job/release correlation identities

**Status:** ACCEPTED  
**Decision:** one logical command can have multiple requests; async jobs/provider attempts maintain causal trace without becoming new domain facts.

**Working aliases:** ADR-0318, ADR-0320.

## ADR-OBS-003 — Metrics use bounded-cardinality dimensions and telemetry is privacy-minimized/redacted

**Status:** ACCEPTED  
**Decision:** user/resource UUIDs/raw exception text/payloads are not normal metric labels; secrets, ballots, evaluations and media bytes are never generic telemetry payload.

**Working aliases:** ADR-0319, ADR-0330.

## ADR-OBS-004 — Distributed tracing is adopted incrementally at high-value remote/async boundaries

**Status:** ACCEPTED  
**Decision:** trace complexity is added where causal diagnostics justify it rather than instrumenting every pure local call first.

**Working alias:** ADR-0322.

## ADR-OBS-005 — DB, Realtime, Offline, Match and Registration expose convergence/correctness signals, not only HTTP errors

**Status:** ACCEPTED  
**Decision:** lock wait, sequence/epoch conflicts, projection mismatch, FIFO integrity, realtime gaps/reconnect and durable local-write failures are observable.

**Working aliases:** ADR-0323, ADR-0324, ADR-0325, ADR-0326.

## ADR-OBS-006 — Balancer runtime/iterations are telemetry and cannot influence canonical result

**Status:** ACCEPTED  
**Working alias:** ADR-0327.  
**Primary Team owner:** ADR-BAL-004.

## ADR-OBS-007 — Worker/outbox health is measured by backlog age/depth, retry and quarantine

**Status:** ACCEPTED  
**Working alias:** ADR-0328.

## ADR-OBS-008 — Security telemetry and semantic security audit remain separate

**Status:** ACCEPTED  
**Working alias:** ADR-0329.

## ADR-OBS-009 — Sampling/retention are signal-specific and never remove required audit or blindly drop rare critical failures

**Status:** ACCEPTED

**Working aliases:** ADR-0331, ADR-0337.

## ADR-OBS-010 — Instrument SLIs before numeric SLOs; error budgets never waive correctness/security

**Status:** ACCEPTED

**Working aliases:** ADR-0332, ADR-0333.

## ADR-OBS-011 — Frontend diagnostics distinguish crashes/product/offline/storage states and every central release is correlatable

**Status:** ACCEPTED  
**Decision:** support diagnostics are sanitized summaries, not raw local DB exports.

**Working aliases:** ADR-0334, ADR-0335, ADR-0336.

## ADR-OBS-012 — Instrumentation, redaction and correlation are testable contracts

**Status:** ACCEPTED  
**Working alias:** ADR-0338.

---

# 22. Testing / QA ADRs

Source: `N2.20 — Testing / QA`.

## ADR-QA-001 — Quality evidence is invariant/risk driven and tests run at the lowest layer that can prove the rule

**Status:** ACCEPTED  
**Decision:** coverage/test count is not architecture proof; do not mock away the layer that owns the invariant.

**Working aliases:** ADR-0339, ADR-0340.

## ADR-QA-002 — PostgreSQL/RLS/RPC and critical concurrency require a faithful real DB integration harness

**Status:** ACCEPTED  
**Decision:** transaction/lock/RLS/constraint races are not certified by TypeScript mocks.

**Working aliases:** ADR-0341, ADR-0343.

## ADR-QA-003 — Privileged authorization is tested negative-first, including BOLA/IDOR matrix

**Status:** ACCEPTED  
**Working aliases:** ADR-0342, ADR-0355.

## ADR-QA-004 — Property/determinism suites protect combinatorial invariants and explicit Overall non-influence

**Status:** ACCEPTED  
**Decision:** property-based testing is required where state space is large; Team Balancer has permanent guards that changing only Overall cannot affect canonical result.

**Working aliases:** ADR-0345, ADR-0346, ADR-0347.

## ADR-QA-005 — Realtime/offline/IndexedDB/Match tests assume loss, duplication, reordering and reconciliation

**Status:** ACCEPTED  
**Decision:** tests provoke transport gaps, storage failures, account isolation and epoch/sequence divergence; no LWW recovery.

**Working aliases:** ADR-0348, ADR-0349, ADR-0350, ADR-0351.

## ADR-QA-006 — E2E remains a thin critical-journey layer

**Status:** ACCEPTED  
**Decision:** E2E proves integration/UX of selected journeys; domain/DB/security invariants are proven lower where possible.

**Working alias:** ADR-0352.

## ADR-QA-007 — Migration/backfill tests prove semantics, idempotency and representative legacy anomalies

**Status:** ACCEPTED  
**Working alias:** ADR-0353.

## ADR-QA-008 — Performance/load tests preserve correctness/security invariants

**Status:** ACCEPTED  
**Decision:** a fast benchmark that violates capacity/sequence/idempotency fails.

**Working alias:** ADR-0354.

## ADR-QA-009 — Security denial evidence is a release gate for privileged changes

**Status:** ACCEPTED  
**Working alias:** ADR-0355.

## ADR-QA-010 — Recovery claims require rebuild tests; backup claims require restore drills; failure injection is first-class

**Status:** ACCEPTED

**Working aliases:** ADR-0356, ADR-0357.

## ADR-QA-011 — Routine test data/environments are synthetic, isolated and cannot target production

**Status:** ACCEPTED  
**Working aliases:** ADR-0358, ADR-0359.

## ADR-QA-012 — Retry is diagnostic, flaky tests require owned remediation, and coverage is multidimensional

**Status:** ACCEPTED  
**Decision:** retries do not normalize permanent flakiness; no arbitrary global line-coverage percentage is architecture proof.

**Working aliases:** ADR-0360, ADR-0361.

## ADR-QA-013 — CI/release gates are risk-tiered by required evidence

**Status:** ACCEPTED  
**Working alias:** ADR-0362.

## Working anchor absorbed by API

`ADR-0344 — commit-success/response-loss idempotency test` is test evidence for canonical `ADR-API-006`, referenced by QA rather than a separate architecture decision.

---

# 23. Operations / Deploy ADRs

Source: `N2.21 — Operations / Deploy / Environments`.

## ADR-OPS-001 — Environments are capability/isolation concepts, not a paid provider primitive

**Status:** ACCEPTED  
**Decision:** Local/CI/Preview/Staging-Rehearsal/Production requirements are provider-independent. Supabase Branching may be used when useful but is not architecture prerequisite.

**Working alias:** DEC-OPS-001.

## ADR-OPS-002 — Runtime/package builds are reproducible around the current Node 22 + npm lockfile baseline

**Status:** ACCEPTED  
**Decision:** local/CI/build align runtime major; `npm ci`/lockfile is deterministic package source. Exact image digest/patch pinning remains operational OPEN.

**Working aliases:** DEC-OPS-003, DEC-OPS-004.

## ADR-OPS-003 — CI/CD distinguishes frontend, database, server/edge, worker and configuration deployment semantics

**Status:** ACCEPTED  
**Decision:** a source push/build success is not the same as complete safe release; each component has ordering/verification/credential scope.

**Working aliases:** DEC-OPS-005, DEC-OPS-006.

## ADR-OPS-004 — High-risk DB evolution uses expand → migrate/backfill → verify → contract

**Status:** ACCEPTED  
**Decision:** migration chain is authority; old-client compatibility and observation gates precede destructive contract.

**Working aliases:** DEC-OPS-002, DEC-OPS-007; ADR-0293.  
**References:** ADR-DATA-010, ADR-MIG-003.

## ADR-OPS-005 — Database recovery prefers forward-fix/compatible code rollback over blind reverse migration

**Status:** ACCEPTED  
**Decision:** committed writes make automatic down migration unsafe by default.

**Working alias:** DEC-OPS-008.

## ADR-OPS-006 — Feature flags and kill switches are rollout/safety controls, never authorization or invariant bypass

**Status:** ACCEPTED  
**Decision:** server-side authorization remains authoritative; kill-switch actions are explicit/auditable and preserve existing LIVE/recovery paths.

**Working aliases:** DEC-OPS-009, DEC-OPS-010.

## ADR-OPS-007 — Production async/scheduled work uses outbox/worker semantics with at-least-once idempotency

**Status:** ACCEPTED  
**Decision:** provider/scheduler/runtime choice is adapter-level; domain facts do not depend on external call.

**Working aliases:** DEC-OPS-011, DEC-OPS-012.  
**Primary owners:** ADR-DATA-008, ADR-REL-004.

## ADR-OPS-008 — Restore is rehearsed in isolation and architecture avoids premature active-active multi-region DB

**Status:** ACCEPTED  
**Decision:** recovery uses isolated environment/provider effects disabled/integrity verification; multi-region active-active is deferred until RTO/RPO evidence justifies cost/conflict complexity.

**Working aliases:** DEC-OPS-014, DEC-OPS-015.

## ADR-OPS-009 — Privileged production access, break-glass and data repair are exceptional, strongly controlled and versioned where possible

**Status:** ACCEPTED  
**Decision:** normal debugging favors telemetry/scoped tools; repair hierarchy is semantic command → versioned repair job/script → scoped migration → emergency SQL.

**Working aliases:** DEC-OPS-016, DEC-OPS-017.

## ADR-OPS-010 — Operational ceremony scales with change risk and includes post-deploy verification

**Status:** ACCEPTED  
**Decision:** destructive/high-risk change receives rehearsal/backup/owner/observation/runbook rigor; low-risk UI/refactor does not inherit unnecessary ceremony.

**Working alias:** DEC-OPS-018.

## Service Worker alias

`DEC-OPS-013` is owned canonically by `ADR-OFF-010`.

---

# 24. Migration / Strangler ADRs

Source: `N2.22 — Migration / Strangler`.

## ADR-MIG-001 — Strangler is the default migration strategy; one aggregate has one authority; destructive reset is exceptional

**Status:** ACCEPTED  
**Decision:** two implementations/readers may coexist, but the same aggregate cannot have two authoritative writers. Reset is an extraordinary product decision, not normal migration architecture.

**Working aliases:** DEC-MIG-001, DEC-MIG-002; ADR-0183.  
**Principles:** P-001, P-037, P-038.

## ADR-MIG-002 — Migration cuts vertical capabilities/cohorts and persists authority state

**Status:** ACCEPTED  
**Decision:** migrate usable vertical slice/aggregate cohort rather than all DB, then all API, then all UI. A feature flag may select future cohorts but cannot erase persisted target authority after cutover.

**Working aliases:** DEC-MIG-003, DEC-MIG-008.

## ADR-MIG-003 — Expand/shadow/dual compatibility is allowed only around a single authoritative model

**Status:** ACCEPTED  
**Decision:** shadow execution has no authoritative/provider effects; compatibility normally projects from authority to legacy reader/DTO, not bidirectional dual CRUD.

**Working aliases:** DEC-MIG-006, DEC-MIG-007.

## ADR-MIG-004 — Stable identity/provenance are preserved and ambiguous source data is never guessed silently

**Status:** ACCEPTED  
**Decision:** preserve UUID when semantics match; split/merge/derived/legacy-evidence mappings retain provenance; ambiguous records become anomalies/quarantine/manual review.

**Working aliases:** DEC-MIG-004, DEC-MIG-005.

## ADR-MIG-005 — Active legacy Match/protocol execution is not migrated mid-execution initially

**Status:** ACCEPTED  
**Decision:** active/live execution completes/reconciles under its cohort; new Match protocol applies to eligible new resources/cohorts.

**Working alias:** DEC-MIG-009; ADR-0315.

## ADR-MIG-006 — Legacy artifacts never receive invented target semantics during import

**Status:** ACCEPTED  
**Decision:** CommunityPresence/WhatsApp drafts do not become Registration; unscoped evaluations do not gain invented Community; final score does not fabricate events; historical Overall does not become solver input; ambiguous legacy aggregates remain evidence with coverage/provenance.

**Working aliases:** DEC-MIG-010, DEC-MIG-011, DEC-MIG-012, DEC-MIG-013, DEC-MIG-014.

## ADR-MIG-007 — Generic sync retires context-by-context before global removal

**Status:** ACCEPTED  
**Decision:** stop target writes/reads through generic sync per bounded context, then remove payload/merge/remap path. No new target feature expands deprecated generic sync.

**Working alias:** DEC-MIG-016; ADR-0168/0183.

## ADR-MIG-008 — localStorage retires key-by-key while irreplaceable local data is preserved/verified

**Status:** ACCEPTED  
**Decision:** migrate Quick/outbox/drafts/cache to structured stores with idempotent verification and recovery window before deleting old source; account/anonymous ownership is preserved.

**Working alias:** DEC-MIG-017.

## ADR-MIG-009 — Contract/removal is a separate verified phase and rollback cannot silently recreate dual authority

**Status:** ACCEPTED  
**Decision:** after target-only writes, “flag off” does not restore stale legacy writer. Legacy column/table/path is removed only when dependencies/old clients/jobs/RLS/functions are proven absent.

**Working aliases:** DEC-MIG-019, DEC-MIG-020.

## Media migration alias

`DEC-MIG-015 — pointer switch only after READY` is owned by `ADR-MEDIA-004`.

## Schema authority alias

`DEC-MIG-018` is owned by `ADR-DATA-010`.

---

# 25. Architecture Governance ADRs

Source: `N2.23 — Architecture Governance`.

## ADR-GOV-001 — Governance is federated and architecture source-of-truth is authority-by-question

**Status:** ACCEPTED  
**Decision:** bounded-context owners decide local semantics within global Principles/invariants/contracts; terminology/Principles/EAP/N2/ADR/migrations/runtime each have explicit authority scope rather than “newest file wins”.

**Working aliases:** DEC-GOV-001, DEC-GOV-002, DEC-GOV-003, DEC-GOV-004, DEC-GOV-005, DEC-GOV-006, DEC-GOV-007.

## ADR-GOV-002 — Accepted ADRs have explicit lifecycle/supersession; C2 working anchors are aliases, not accepted ADRs

**Status:** ACCEPTED  
**Decision:** accepted decision is never silently rewritten; successors declare supersession. C2 numeric/DEC anchors remain source aliases in this catalog.

**Working aliases:** DEC-GOV-008, DEC-GOV-009.

## ADR-GOV-003 — Open Decision, Hypothesis and ADR are different governance objects

**Status:** ACCEPTED  
**Decision:** every blocking Open Decision has owner/evidence/trigger/safe default where applicable; hypothesis is testable claim and never alone protects critical invariant.

**Working aliases:** DEC-GOV-010, DEC-GOV-011.

## ADR-GOV-004 — Critical invariants and architecture fitness functions require traceable evidence and lifecycle

**Status:** ACCEPTED  
**Decision:** high-risk invariant maps decision→owner→enforcement→tests/telemetry. Fitness functions have protected intent/removal trigger so they do not freeze legacy accidentally.

**Working aliases:** DEC-GOV-012, DEC-GOV-013, DEC-GOV-014.

## ADR-GOV-005 — Canonical terminology follows Glossary and naming changes are architectural when they change meaning

**Status:** ACCEPTED  
**Decision:** legacy terms that conflict with canonical semantics are explicitly marked/mapped; labels do not silently create new domain engines.

**Working alias:** DEC-GOV-004 plus N2.23 naming governance.

## ADR-GOV-006 — Technology/dependency adoption is evidence-driven and includes operational/security/lock-in/exit analysis

**Status:** ACCEPTED  
**Decision:** major platform/dependency adoption requires concrete problem, alternatives, failure modes, cost, migration, observability and revisit/exit strategy.

**Working alias:** DEC-GOV-016.

## ADR-GOV-007 — Deprecation, technical debt and exceptions have explicit owned lifecycles

**Status:** ACCEPTED  
**Decision:** deprecated artifact has replacement/new-use-forbidden/removal evidence; debt has repayment trigger; exception is scoped/temporary/compensated/owned/reviewed.

**Working aliases:** DEC-GOV-018, DEC-GOV-019.

## ADR-GOV-008 — Architecture review/document lifecycle is risk-triggered and durable knowledge lives in versioned repository artifacts

**Status:** ACCEPTED  
**Decision:** material cross-context/security/durable/authority changes trigger review; routine local changes do not. Architecture decisions cannot live only in chat/memory; docs move DRAFT→DRAFT-CANONICAL→CANONICAL→SUPERSEDED/ARCHIVED.

**Working aliases:** DEC-GOV-015, DEC-GOV-020.

## ADR-GOV-009 — Architecture evolves through explicit evidence triggers and formal audits

**Status:** ACCEPTED  
**Decision:** scale/correctness/security/reliability/product/team-cost evidence can reopen decisions; trigger never automatically dictates technology. C7 is the first formal contradiction/completeness audit of this consolidation.

**Working alias:** DEC-GOV-021.

## Legacy-document classification

`DEC-GOV-022` classifies `docs/architecture/domain-model.md` as transitional/legacy evidence until rewritten or archived. It is an application of ADR-GOV-001/008 rather than a permanent product architecture decision.

---

# 26. Working-anchor alias map — numeric C2 anchors

The table below preserves every explicit numeric working range that exists in the C2 canonical corpus used by C3. Multiple aliases may resolve to one canonical ADR.

## 26.1 Live Match `ADR-0078..0096`

| Working | Canonical |
|---|---|
| 0078 | ADR-MATCH-001 |
| 0079 | ADR-COMP-003 |
| 0080 | ADR-MATCH-002 |
| 0081 | ADR-MATCH-002 |
| 0082 | ADR-MATCH-003 |
| 0083 | ADR-MATCH-004 |
| 0084 | ADR-MATCH-005 |
| 0085 | ADR-MATCH-006 |
| 0086 | ADR-MATCH-007 |
| 0087 | ADR-MATCH-007 |
| 0088 | ADR-MATCH-007 |
| 0089 | ADR-MATCH-008 |
| 0090 | ADR-MATCH-009 |
| 0091 | ADR-MATCH-010 |
| 0092 | ADR-OFF-002 / ADR-MATCH-001 |
| 0093 | ADR-RT-001 / ADR-RT-003 |
| 0094 | ADR-MATCH-004 |
| 0095 | ADR-COMP-004 / ADR-MATCH-011 |
| 0096 | ADR-MATCH-012 |

## 26.2 Notifications `ADR-0132..0146`

| Working | Canonical |
|---|---|
| 0132 | ADR-NOTIF-001 |
| 0133 | ADR-NOTIF-001 / ADR-DATA-008 |
| 0134 | ADR-NOTIF-002 |
| 0135 | ADR-NOTIF-002 |
| 0136 | ADR-NOTIF-003 |
| 0137 | ADR-NOTIF-003 |
| 0138 | ADR-NOTIF-004 |
| 0139 | ADR-NOTIF-005 |
| 0140 | ADR-NOTIF-006 |
| 0141 | ADR-NOTIF-006 / ADR-REL-004 |
| 0142 | ADR-NOTIF-007 |
| 0143 | ADR-NOTIF-008 |
| 0144 | ADR-NOTIF-007 |
| 0145 | ADR-NOTIF-009 |
| 0146 | ADR-NOTIF-010 |

## 26.3 Media `ADR-0147..0163`

| Working | Canonical |
|---|---|
| 0147 | ADR-MEDIA-001 |
| 0148 | ADR-MEDIA-001 |
| 0149 | ADR-MEDIA-002 |
| 0150 | ADR-MEDIA-002 |
| 0151 | ADR-MEDIA-002 |
| 0152 | ADR-MEDIA-003 |
| 0153 | ADR-MEDIA-003 |
| 0154 | ADR-MEDIA-004 |
| 0155 | ADR-MEDIA-004 |
| 0156 | ADR-MEDIA-005 |
| 0157 | ADR-MEDIA-001 / ADR-MEDIA-005 |
| 0158 | ADR-MEDIA-006 |
| 0159 | ADR-MEDIA-006 |
| 0160 | ADR-MEDIA-007 |
| 0161 | ADR-MEDIA-007 |
| 0162 | ADR-MEDIA-008 |
| 0163 | ADR-MEDIA-009 |

## 26.4 Online/Offline `ADR-0164..0183`

| Working | Canonical |
|---|---|
| 0164 | ADR-OFF-001 |
| 0165 | ADR-OFF-001 |
| 0166 | ADR-OFF-002 |
| 0167 | ADR-OFF-002 / ADR-DATA-003 |
| 0168 | ADR-OFF-003 / ADR-MIG-007 |
| 0169 | ADR-OFF-003 |
| 0170 | ADR-OFF-004 |
| 0171 | ADR-MATCH-010 / ADR-OFF-005 |
| 0172 | ADR-OFF-006 |
| 0173 | ADR-OFF-006 |
| 0174 | ADR-OFF-007 |
| 0175 | ADR-OFF-007 |
| 0176 | ADR-OFF-008 |
| 0177 | ADR-OFF-008 |
| 0178 | ADR-OFF-009 |
| 0179 | ADR-OFF-009 |
| 0180 | ADR-OFF-010 |
| 0181 | ADR-OFF-010 |
| 0182 | ADR-STAT-006 |
| 0183 | ADR-MIG-001 / ADR-MIG-007 |

## 26.5 Realtime `ADR-0184..0202`

| Working | Canonical |
|---|---|
| 0184 | ADR-RT-001 |
| 0185 | ADR-RT-001 |
| 0186 | ADR-RT-001 |
| 0187 | ADR-SEC-001 / ADR-RT-001 |
| 0188 | ADR-RT-001 |
| 0189 | ADR-RT-002 |
| 0190 | ADR-RT-002 |
| 0191 | ADR-RT-002 / ADR-MATCH-007 |
| 0192 | ADR-RT-003 |
| 0193 | ADR-RT-003 |
| 0194 | ADR-RT-003 |
| 0195 | ADR-RT-004 |
| 0196 | ADR-RT-004 / ADR-BAL-007 |
| 0197 | ADR-RT-005 |
| 0198 | ADR-RT-005 |
| 0199 | ADR-NOTIF-008 / ADR-RT-005 |
| 0200 | ADR-RT-006 |
| 0201 | ADR-RT-007 |
| 0202 | ADR-RT-007 / ADR-OBS-005 |

## 26.6 Data `ADR-0203..0226`

| Working | Canonical |
|---|---|
| 0203 | ADR-DATA-001 |
| 0204 | ADR-DATA-002 |
| 0205 | ADR-DATA-003 |
| 0206 | ADR-DATA-003 |
| 0207 | ADR-DATA-001 |
| 0208 | ADR-DATA-004 |
| 0209 | ADR-DATA-004 |
| 0210 | ADR-DATA-005 |
| 0211 | ADR-ID-007 / ADR-DATA-005 |
| 0212 | ADR-DATA-005 |
| 0213 | ADR-DATA-006 |
| 0214 | ADR-DATA-006 |
| 0215 | ADR-DATA-006 |
| 0216 | ADR-DATA-007 |
| 0217 | ADR-DATA-007 |
| 0218 | ADR-DATA-009 |
| 0219 | ADR-DATA-008 |
| 0220 | ADR-DATA-008 |
| 0221 | ADR-DATA-008 |
| 0222 | ADR-DATA-010 |
| 0223 | ADR-DATA-010 |
| 0224 | ADR-DATA-010 |
| 0225 | ADR-DATA-011 |
| 0226 | ADR-DATA-012 |

## 26.7 API `ADR-0227..0246`

| Working | Canonical |
|---|---|
| 0227 | ADR-API-001 |
| 0228 | ADR-API-001 |
| 0229 | ADR-API-002 |
| 0230 | ADR-API-003 |
| 0231 | ADR-API-003 / ADR-SEC-001 |
| 0232 | ADR-API-004 |
| 0233 | ADR-API-004 |
| 0234 | ADR-API-004 |
| 0235 | ADR-API-005 |
| 0236 | ADR-API-005 |
| 0237 | ADR-API-006 |
| 0238 | ADR-API-006 |
| 0239 | ADR-API-007 |
| 0240 | ADR-API-002 |
| 0241 | ADR-API-008 |
| 0242 | ADR-API-008 |
| 0243 | ADR-API-009 |
| 0244 | ADR-API-010 |
| 0245 | ADR-DATA-008 / ADR-API-010 |
| 0246 | ADR-API-010 |

## 26.8 Security `ADR-0247..0272`

| Working | Canonical |
|---|---|
| 0247 | ADR-SEC-001 |
| 0248 | ADR-SEC-001 |
| 0249 | ADR-SEC-001 |
| 0250 | ADR-COM-003 / ADR-SEC-001 |
| 0251 | ADR-SEC-002 |
| 0252 | ADR-SEC-002 |
| 0253 | ADR-SEC-003 |
| 0254 | ADR-SEC-004 |
| 0255 | ADR-SEC-004 |
| 0256 | ADR-SEC-005 |
| 0257 | ADR-SEC-006 |
| 0258 | ADR-SEC-006 / ADR-API-002 |
| 0259 | ADR-SEC-007 / ADR-RT-001 |
| 0260 | ADR-SEC-007 / ADR-MEDIA-002 |
| 0261 | ADR-SEC-008 |
| 0262 | ADR-OFF-007 / ADR-SEC-008 |
| 0263 | ADR-SEC-004 |
| 0264 | ADR-SEC-009 |
| 0265 | ADR-SEC-010 |
| 0266 | ADR-SEC-010 |
| 0267 | ADR-ID-007 / ADR-SEC-011 |
| 0268 | ADR-SEC-010 |
| 0269 | ADR-SEC-010 |
| 0270 | ADR-SEC-012 |
| 0271 | ADR-SEC-013 |
| 0272 | ADR-SEC-014 |

## 26.9 Reliability `ADR-0273..0294`

| Working | Canonical |
|---|---|
| 0273 | ADR-REL-001 |
| 0274 | ADR-REL-001 |
| 0275 | ADR-REL-002 |
| 0276 | ADR-API-006 / ADR-REL-002 |
| 0277 | ADR-REL-003 |
| 0278 | ADR-REL-004 |
| 0279 | ADR-DATA-008 / ADR-REL-004 |
| 0280 | ADR-REL-004 |
| 0281 | ADR-REL-004 |
| 0282 | ADR-DATA-009 / ADR-REL-005 |
| 0283 | ADR-MATCH-010 |
| 0284 | ADR-REG-003 / ADR-REG-004 |
| 0285 | ADR-BAL-007 |
| 0286 | ADR-COMP-005 / ADR-COMP-008 |
| 0287 | ADR-MEDIA-004 |
| 0288 | ADR-NOTIF-001 |
| 0289 | ADR-RT-003 |
| 0290 | ADR-OFF-006 / ADR-OFF-007 |
| 0291 | ADR-REL-006 |
| 0292 | ADR-REL-007 |
| 0293 | ADR-OPS-004 / ADR-REL-008 |
| 0294 | ADR-REL-009 |

## 26.10 Performance `ADR-0295..0316`

| Working | Canonical |
|---|---|
| 0295 | ADR-PERF-001 |
| 0296 | ADR-PERF-002 |
| 0297 | ADR-PERF-002 |
| 0298 | ADR-PERF-002 |
| 0299 | ADR-PERF-002 |
| 0300 | ADR-PERF-002 |
| 0301 | ADR-PERF-003 / ADR-REG-003 |
| 0302 | ADR-PERF-003 / ADR-MATCH-007 |
| 0303 | ADR-PERF-004 / ADR-DATA-011 |
| 0304 | ADR-PERF-005 / ADR-RT-005 |
| 0305 | ADR-PERF-006 / ADR-BAL-004 |
| 0306 | ADR-PERF-006 / ADR-BAL-002 |
| 0307 | ADR-PERF-007 / ADR-STAT-004 |
| 0308 | ADR-PERF-007 / ADR-MEDIA-005 |
| 0309 | ADR-PERF-001 / local measured implementation policy |
| 0310 | ADR-OFF-006 / ADR-PERF-007 |
| 0311 | ADR-PERF-008 |
| 0312 | ADR-PERF-009 |
| 0313 | ADR-PERF-010 / ADR-QA-008 |
| 0314 | ADR-PERF-008 / ADR-PERF-010 |
| 0315 | ADR-MIG-005 / ADR-PERF-010 |
| 0316 | ADR-PERF-011 |

## 26.11 Observability `ADR-0317..0338`

| Working | Canonical |
|---|---|
| 0317 | ADR-OBS-001 |
| 0318 | ADR-OBS-002 |
| 0319 | ADR-OBS-003 |
| 0320 | ADR-OBS-002 |
| 0321 | ADR-OBS-002 / ADR-API-005 |
| 0322 | ADR-OBS-004 |
| 0323 | ADR-OBS-005 |
| 0324 | ADR-OBS-005 |
| 0325 | ADR-OBS-005 |
| 0326 | ADR-OBS-005 |
| 0327 | ADR-OBS-006 / ADR-BAL-004 |
| 0328 | ADR-OBS-007 |
| 0329 | ADR-OBS-008 |
| 0330 | ADR-OBS-003 |
| 0331 | ADR-OBS-009 |
| 0332 | ADR-OBS-010 |
| 0333 | ADR-OBS-010 |
| 0334 | ADR-OBS-011 |
| 0335 | ADR-OBS-011 |
| 0336 | ADR-OBS-011 |
| 0337 | ADR-OBS-009 |
| 0338 | ADR-OBS-012 |

## 26.12 Testing `ADR-0339..0362`

| Working | Canonical |
|---|---|
| 0339 | ADR-QA-001 |
| 0340 | ADR-QA-001 |
| 0341 | ADR-QA-002 |
| 0342 | ADR-QA-003 |
| 0343 | ADR-QA-002 |
| 0344 | ADR-API-006 / QA evidence |
| 0345 | ADR-QA-004 |
| 0346 | ADR-QA-004 / ADR-BAL-004 |
| 0347 | ADR-QA-004 / ADR-BAL-001 |
| 0348 | ADR-QA-005 |
| 0349 | ADR-QA-005 |
| 0350 | ADR-QA-005 |
| 0351 | ADR-QA-005 / ADR-MATCH-010 |
| 0352 | ADR-QA-006 |
| 0353 | ADR-QA-007 |
| 0354 | ADR-QA-008 |
| 0355 | ADR-QA-003 / ADR-QA-009 |
| 0356 | ADR-QA-010 |
| 0357 | ADR-QA-010 |
| 0358 | ADR-QA-011 |
| 0359 | ADR-QA-011 |
| 0360 | ADR-QA-012 |
| 0361 | ADR-QA-012 |
| 0362 | ADR-QA-013 |

---

# 27. `DEC-OPS-*`, `DEC-MIG-*`, `DEC-GOV-*` alias map

## Operations

| Working | Canonical |
|---|---|
| DEC-OPS-001 | ADR-OPS-001 |
| DEC-OPS-002 | ADR-DATA-010 / ADR-OPS-004 |
| DEC-OPS-003 | ADR-OPS-002 |
| DEC-OPS-004 | ADR-OPS-002 |
| DEC-OPS-005 | ADR-OPS-003 / ADR-QA-002 |
| DEC-OPS-006 | ADR-OPS-003 |
| DEC-OPS-007 | ADR-OPS-004 |
| DEC-OPS-008 | ADR-OPS-005 |
| DEC-OPS-009 | ADR-OPS-006 |
| DEC-OPS-010 | ADR-OPS-006 |
| DEC-OPS-011 | ADR-DATA-008 / ADR-OPS-007 |
| DEC-OPS-012 | ADR-REL-004 / ADR-OPS-007 |
| DEC-OPS-013 | ADR-OFF-010 |
| DEC-OPS-014 | ADR-OPS-008 |
| DEC-OPS-015 | ADR-OPS-008 |
| DEC-OPS-016 | ADR-OPS-009 |
| DEC-OPS-017 | ADR-OPS-009 |
| DEC-OPS-018 | ADR-OPS-010 |

## Migration

| Working | Canonical |
|---|---|
| DEC-MIG-001 | ADR-MIG-001 |
| DEC-MIG-002 | ADR-MIG-001 |
| DEC-MIG-003 | ADR-MIG-002 |
| DEC-MIG-004 | ADR-MIG-004 |
| DEC-MIG-005 | ADR-MIG-004 |
| DEC-MIG-006 | ADR-MIG-003 |
| DEC-MIG-007 | ADR-MIG-003 |
| DEC-MIG-008 | ADR-MIG-002 |
| DEC-MIG-009 | ADR-MIG-005 |
| DEC-MIG-010 | ADR-MIG-006 |
| DEC-MIG-011 | ADR-MIG-006 |
| DEC-MIG-012 | ADR-MIG-006 |
| DEC-MIG-013 | ADR-MIG-006 / ADR-BAL-001 |
| DEC-MIG-014 | ADR-MIG-006 / ADR-STAT-004 |
| DEC-MIG-015 | ADR-MEDIA-004 |
| DEC-MIG-016 | ADR-MIG-007 |
| DEC-MIG-017 | ADR-MIG-008 |
| DEC-MIG-018 | ADR-DATA-010 |
| DEC-MIG-019 | ADR-MIG-009 |
| DEC-MIG-020 | ADR-MIG-009 |

## Governance

| Working | Canonical |
|---|---|
| DEC-GOV-001 | ADR-GOV-001 |
| DEC-GOV-002 | ADR-GOV-001 |
| DEC-GOV-003 | ADR-GOV-001 |
| DEC-GOV-004 | ADR-GOV-001 / ADR-GOV-005 |
| DEC-GOV-005 | ADR-GOV-001 |
| DEC-GOV-006 | ADR-DATA-010 / ADR-GOV-001 |
| DEC-GOV-007 | ADR-GOV-001 |
| DEC-GOV-008 | ADR-GOV-002 |
| DEC-GOV-009 | ADR-GOV-002 |
| DEC-GOV-010 | ADR-GOV-003 |
| DEC-GOV-011 | ADR-GOV-003 |
| DEC-GOV-012 | ADR-GOV-004 |
| DEC-GOV-013 | ADR-GOV-004 |
| DEC-GOV-014 | ADR-GOV-004 / ADR-MIG-007 |
| DEC-GOV-015 | ADR-GOV-008 |
| DEC-GOV-016 | ADR-GOV-006 |
| DEC-GOV-017 | ADR-OPS-006 / ADR-MIG-002 |
| DEC-GOV-018 | ADR-GOV-007 |
| DEC-GOV-019 | ADR-GOV-007 |
| DEC-GOV-020 | ADR-GOV-008 |
| DEC-GOV-021 | ADR-GOV-009 |
| DEC-GOV-022 | ADR-GOV-001 / ADR-GOV-008 legacy-document classification |

---

# 28. Semantic C2 decisions without explicit numeric working anchors

Early C2 chapters intentionally used semantic `DECIDED`/trace lists instead of freezing numeric IDs. Their canonical mappings are:

## Product Experience

| Semantic source decision | Canonical owner |
|---|---|
| Quick without Community | ADR-SES-002 / ADR-OFF-002 |
| Shared mutable state server-authoritative | ADR-OFF-001 |
| Offline by operation | ADR-OFF-001 |
| Organizer operational not governance | ADR-COM-003 |
| Registration FIFO authoritative | ADR-REG-003/004 |
| Balancer attribute-only | ADR-BAL-001 |
| Voting optional | ADR-BAL-006 |
| MatchController != Organizer | ADR-MATCH-003 |
| Fixture != Match | ADR-COMP-003 |
| Factual history != subjective rating | ADR-STAT-001 |
| Realtime not source of truth | ADR-RT-001 |
| Mobile/PWA update safety | ADR-OFF-010 / ADR-OPS-004 compatibility policy |

## Identity

Semantic decisions map to `ADR-ID-001..008` and `ADR-COM-001` as listed above.

## Community

Semantic decisions map to `ADR-COM-001..009`.

## Session

Semantic decisions map to `ADR-SES-001..007`, with Match control delegated to `ADR-MATCH-003..005`.

## Registration

Semantic decisions map to `ADR-REG-001..008`.

## Team Formation

Semantic decisions map to `ADR-BAL-001..010`.

## Competition / Statistics

Semantic decisions map to `ADR-COMP-001..009` and `ADR-STAT-001..008`.

No arbitrary working number is invented for a source that did not already provide one.

---

# 29. Major overlap resolutions

This section records the C3 decisions that would otherwise look like contradictory duplicate ADRs.

## 29.1 Organizer semantics

Repeated in:

- Product Experience;
- Community;
- Session;
- Match;
- API;
- Security.

Canonical split:

```text
ADR-COM-003
= role/responsibility semantics

ADR-COM-005
= Session assignment refinement

ADR-MATCH-003
= current Match control is separate

ADR-API-003 / ADR-SEC-001
= enforcement boundary
```

No competing “Admin hierarchy” ADR remains.

## 29.2 Realtime source of truth

Repeated working anchors:

```text
ADR-0093
ADR-0143
ADR-0184
ADR-0289
plus Reliability/Testing references
```

Canonical ownership:

```text
ADR-RT-001 = role/authority
ADR-RT-003 = recovery protocol
ADR-NOTIF-008 = Inbox-specific consequence
```

## 29.3 Outbox / external effects

Repeated in Notifications, Data, API, Reliability and Operations.

Canonical ownership:

```text
ADR-DATA-008
= transaction/storage separation and atomic outbox rule

ADR-NOTIF-001
= notification-domain consumption semantics

ADR-REL-004
= worker delivery semantics

ADR-OPS-007
= production worker/scheduler operation
```

## 29.4 Command idempotency

Canonical ownership:

```text
ADR-API-006
```

Reliability/Testing refer to it; every domain command may specialize conflict/invariant rules without redefining command identity.

## 29.5 Account deletion / sports history

Canonical domain owner:

```text
ADR-ID-007
```

Data controls FK consequences (`ADR-DATA-005`); Security controls privacy workflow (`ADR-SEC-011`); Reliability controls restore replay (`ADR-REL-007`).

## 29.6 Match ordering/control

Canonical owner is Match:

```text
ADR-MATCH-004 lease
ADR-MATCH-005 epoch
ADR-MATCH-007 sequence/projection
ADR-MATCH-010 offline reconcile
ADR-MATCH-012 no LWW
```

Realtime/Offline/Reliability/QA do not own parallel implementations.

## 29.7 Registration fairness

Canonical owner is Registration:

```text
ADR-REG-003 FIFO/serialization
ADR-REG-004 atomic promotion
ADR-REG-005 lifecycle/capacity policy
```

Performance may optimize lock/query shape; Reliability/QA test recovery. None may alter FIFO semantics implicitly.

## 29.8 Team Balancer determinism

Canonical owner:

```text
ADR-BAL-001 attribute-only
ADR-BAL-004 deterministic fixed-work solver
```

Performance defines execution placement, Observability records runtime, QA proves determinism. None may make wall-clock/Overall part of canonical result.

## 29.9 Official result and factual statistics

Canonical Competition owns officialization:

```text
ADR-COMP-004 OfficialCompetitionResult
```

Match owns technical result; Stats owns eligibility/projection. WO never fabricates Match/Player events.

## 29.10 IndexedDB/local authority

Canonical Offline owner:

```text
ADR-OFF-006 storage technology role
ADR-OFF-007 account/anonymous scope
```

Security, Reliability, Performance and QA define constraints/evidence, not alternative local databases.

## 29.11 Schema migration authority

Canonical ownership:

```text
ADR-DATA-010
```

Operations applies deployment ordering (`ADR-OPS-004`); Migration applies strangler/cohort (`ADR-MIG-*`); Governance names migration chain as schema source.

---

# 30. Legacy architecture supersession / deprecation graph

Working anchors are aliases, but **legacy accepted/current implementation patterns** are genuinely being superseded/deprecated by target ADRs.

```text
LEGACY: localStorage as broad domain DB
        + LocalSyncPayload
        + cloudId/local_id
        + syncStatus/sync_version
        + merge-by-updated_at/LWW
        ↓
ADR-OFF-001/002/003/006/009
ADR-DATA-003
ADR-MIG-007/008
```

```text
LEGACY: generic cloud CRUD/upsert/softDelete
        ↓
ADR-API-001
ADR-API-010
ADR-DATA-005/007
```

```text
LEGACY: Session-level scoring ownership/control
        ↓
ADR-MATCH-003/004/005
```

```text
LEGACY: Community role `organizador`
        + arbitrary role-capability override builder
        ↓
ADR-COM-003
ADR-COM-009
```

```text
LEGACY: Membership PENDING/REJECTED semantics
        ↓
ADR-COM-002
```

```text
LEGACY: Session.selectedPlayerIds[] / teamIds[] authority
        ↓
ADR-SES-004
ADR-REG-006
ADR-BAL-009
```

```text
LEGACY: Session.type = tournament/free_play
        as competition/play-state authority
        ↓
ADR-SES-001/003
ADR-COMP-001
```

```text
LEGACY: ChampionshipRound row acts as confrontation
        ↓
ADR-COMP-003
```

```text
LEGACY: finished Game directly drives standings
        ↓
ADR-COMP-004/005
```

```text
LEGACY: current Team membership determines historical stats
        + Career rating mixed into factual pipeline
        ↓
ADR-STAT-001/002/003
```

```text
LEGACY: avatar_url / public proposal URL is media identity
        + pending raw candidate publicly deliverable
        ↓
ADR-MEDIA-001/002/004/005
```

```text
LEGACY: schema.sql/manual consolidated snapshot treated as parallel authority
        ↓
ADR-DATA-010
ADR-OPS-004
```

```text
LEGACY: reset as normal migration answer
        ↓
ADR-MIG-001
```

```text
LEGACY DOCUMENT: docs/architecture/domain-model.md
still describes local-first/generic-sync target semantics
        ↓
classified as TRANSITIONAL / LEGACY EVIDENCE
by ADR-GOV-001/008 until rewrite/archive
```

No legacy artifact is deleted by C3. Removal is governed by C6 migration + deprecation evidence + C7 audit.

---

# 31. Decisions deliberately NOT promoted to ADRs

C3 must not convert hypotheses/open values into facts.

Examples remaining outside accepted ADR set include:

- exact robust Rating aggregation formula (median/trimmed/Bayesian/etc.);
- exact Team Formation objective weights/minimax/lexicographic policy;
- default candidate count and final voting quorum/tie/no-vote method;
- exact Match lease TTL/heartbeat cadence;
- whether broad Community offline Match ships in first release;
- exact public spectator policy;
- exact media pixel/byte/quality/grace limits;
- exact Notification providers/retention/quiet-hour policy;
- exact IndexedDB wrapper/library;
- exact numerical RPO/RTO/SLO/latency/bundle budgets;
- exact property/load/accessibility tooling;
- exact production host/CD/feature-flag provider;
- exact persistent migration registry schema;
- exact minors policy/legal-basis conclusions.

These become C4 Open Decision/Hypothesis catalog entries, not implementation free choice.

---

# 32. Principle vs ADR classification

Some C2 material is better classified as a high-stability Principle rather than duplicated ADR.

Examples:

```text
P-001 one authority per aggregate
→ implemented operationally by ADR-MIG-001

P-011 balancer never uses Overall
→ concrete solver contract ADR-BAL-001

P-017 realtime transports changes
→ provider/protocol ADR-RT-001

P-021 actor never comes from payload
→ enforcement ADR-API-003 / ADR-SEC-001

P-030 provider outside critical domain transaction
→ persistence ADR-DATA-008

P-039 technology by evidence
→ governance ADR-GOV-006 / performance ADR-PERF-009
```

The Principle remains the higher-stability constitutional constraint. The ADR records the chosen architecture that realizes it in a specific scope.

---

# 33. Canonical ADR index

This is the quick index after deduplication.

| Prefix | ADRs | Owner |
|---|---:|---|
| ID | 8 | Identity / Player |
| COM | 9 | Community |
| SES | 7 | Session |
| REG | 8 | Registration |
| BAL | 10 | Team Formation / Voting |
| MATCH | 12 | Live Match |
| COMP | 9 | Competition |
| STAT | 8 | History / Statistics |
| NOTIF | 10 | Notifications |
| MEDIA | 9 | Media |
| OFF | 10 | Online / Offline |
| RT | 7 | Realtime |
| DATA | 12 | Data Architecture |
| API | 10 | Application/API |
| SEC | 14 | Security / Privacy |
| REL | 9 | Reliability |
| PERF | 11 | Performance |
| OBS | 12 | Observability |
| QA | 13 | Testing / QA |
| OPS | 10 | Operations |
| MIG | 9 | Migration |
| GOV | 9 | Governance |

Total canonical ADR identities in C3:

```text
216
```

The number is intentionally lower than the raw working-anchor count because C3 merges duplicate angles into owned decisions while preserving every source alias.

---

# 34. ADR status matrix

At this consolidation stage:

```text
216 ACCEPTED TARGET ADRs
0 PROPOSED canonical ADRs
0 REJECTED canonical ADRs
0 SUPERSEDED canonical ADRs
```

This does **not** mean there is no supersession in the system. It means:

- C2 working anchors were never accepted canonical ADRs, so they are aliases;
- legacy current implementation patterns are tracked as deprecations/supersession targets, not as historical canonical ADR records that existed before this catalog;
- future material changes will produce actual SUPERSEDED relationships between canonical ADR IDs.

---

# 35. Revisit-trigger examples

Not every ADR needs a calendar expiration. Revisit occurs when evidence changes.

| ADR family | Trigger examples |
|---|---|
| BAL | solver scale/quality evidence; new skill rubric; fairness policy change |
| MATCH | scoring-rule complexity; offline reconciliation incidents; public spectator scale |
| COMP | new competition formats; intercommunity/public competition requirements |
| MEDIA | new codec/product requirement; sanitizer vulnerability; processing scale |
| OFF | new reliable background/native runtime; multi-device draft requirement |
| RT | fan-out/egress/channel auth limitations; provider change |
| DATA | table operational pain; need for partitioning/new storage |
| SEC | incident/regulatory/provider threat change |
| REL/OPS | restore/RPO evidence; dependency failure patterns |
| PERF | measured bottleneck/cost threshold |
| GOV | recurring architecture drift or team/ownership change |

A trigger reopens the decision; it does not imply a predetermined technology.

---

# 36. ADR authoring template after C3

New standalone decision proposals should use:

```text
ADR-<OWNER>-### — Title
Status: PROPOSED | ACCEPTED | REJECTED | SUPERSEDED | DEPRECATED
Owner:
Contexts:
Principles:
Problem:
Decision:
Alternatives Considered:
Consequences / Trade-offs:
Security / Privacy:
Reliability / Operations:
Migration / Compatibility:
Testing / Fitness Evidence:
Reversibility / Exit Strategy:
Open Dependencies:
Revisit Trigger:
Supersedes:
Superseded By:
Source / Related ADRs:
```

A new ADR number is allocated within its owner prefix. It is not reused after rejection/supersession.

---

# 37. C3 completeness checks

C3 is complete when:

- [x] canonical ADR namespace exists;
- [x] ownership is explicit;
- [x] all semantic C2 decisions are mapped to canonical ADR families;
- [x] all explicit numeric working ranges available in C2 are aliased;
- [x] `DEC-OPS-*`, `DEC-MIG-*`, `DEC-GOV-*` are aliased;
- [x] duplicated cross-context decisions have one canonical owner or explicitly separate scopes;
- [x] working anchors are not falsely marked superseded;
- [x] legacy implementation supersession/deprecation graph exists;
- [x] Principles vs ADR distinction is explicit;
- [x] Open/Hypothesis values remain unpromoted;
- [x] ADR lifecycle is defined;
- [x] source C2 documents remain detailed normative rationale and are not deleted/summarized away.

---

# 38. Handoff to C4–C7

## C4 — Invariant / Open Decision / Hypothesis catalogs

C4 will now use canonical ADR IDs to cross-link:

```text
Global Invariant
→ owner context
→ canonical ADR(s)
→ executable evidence

Open Decision
→ owner
→ blocking scope
→ safe default/evidence needed
→ decision trigger

Hypothesis
→ metric/evidence
→ review trigger
→ resulting ADR or rejection
```

C4 must not duplicate full local invariant definitions unnecessarily; it creates the global registry/index while preserving each N2 definition.

## C5 — Cross-cutting matrices

Canonical ADR IDs become stable references for Entity, Command, Query, Capability, Offline, Realtime, Data, Projection, Transaction, Privacy, Error and Deprecation matrices.

## C6 — Current → Target program

Migration waves reference canonical ADRs instead of ambiguous working numbers.

## C7 — Contradiction/completeness audit

C7 validates:

- ADR ↔ Principle consistency;
- ADR ↔ N2 consistency;
- duplicate/overlap resolution correctness;
- ownership gaps;
- open decision accidentally implemented as fact;
- legacy/current implementation still contradicting target;
- missing executable evidence for critical decisions;
- stale working references or legacy documents that still appear authoritative.

---

# 39. Canonical statement

The architecture decision model after C3 is:

```text
PRINCIPLE
= high-stability constitutional constraint

ADR
= material architecture choice + rationale + owner

INVARIANT
= rule that must remain true

OPEN DECISION
= unresolved question with owner/evidence/trigger

HYPOTHESIS
= testable claim awaiting evidence

DEPRECATION
= artifact/path being retired with replacement and removal evidence

EXCEPTION
= temporary bounded deviation
```

And:

```text
C2 WORKING ANCHOR
IS NOT
A SECOND ADR
```

Every material target decision now has one stable canonical home while the exhaustive context reasoning remains preserved in its originating C2 document.
