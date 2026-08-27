# EAP MASTER — Arquitetura do Volley

> Status: `DRAFT-CANONICAL / C1 / C7-R1-R5-RECONCILED`
>
> Branch de consolidação: `docs/architecture-consolidation`
>
> Owner: `Architecture Governance + bounded-context owners`
>
> Escopo: índice arquitetural canônico da reconstrução do Volley.
>
> Última reconciliação: `C7 / R1 structural authority + R5 Player Skill Profile ownership`.

---

# 0. Regra de autoridade do EAP

Este documento é a árvore mestre **N1/N2** da arquitetura do Volley.

Após o audit C7, a autoridade foi separada para eliminar duas árvores N3 manualmente editáveis:

```text
EAP-MASTER.md
=
N1 / N2 identity
+ N2 owner
+ N2 scope
+ canonical document path
+ named sub-owner where needed
+ cross-context anchors
+ dependency / wave navigation

OWNER N2 DOCUMENT
=
canonical detailed N3 decomposition
+ N4..N10 materialization
```

Portanto:

```text
EAP DOES NOT DUPLICATE THE N3 TREE
```

Se um capítulo N2 alterar, adicionar, dividir ou renomear um N3, a mudança ocorre no documento N2 proprietário. O EAP muda quando houver alteração material de:

- identidade/scope de N2;
- ownership principal ou sub-owner arquitetural;
- canonical path;
- dependency/wave architecture;
- cross-context anchor.

O EAP não substitui, resume nem elimina o conteúdo integral dos documentos N2.01–N2.23.

---

# 1. Convenção N1 → N10

```text
N1  — Produto / Sistema
N2  — Bounded Context ou preocupação arquitetural principal
N3  — Capability / subdomínio / área de decisão
N4  — Aggregate, entidade, processo ou contrato principal
N5  — Regras, estados, policies e invariantes
N6  — Commands, Queries, Events e transições
N7  — Persistência, API, autorização, offline e Realtime
N8  — Concorrência, falhas, idempotência, privacidade e recovery
N9  — Observabilidade, performance, operação e migração
N10 — Cenários adversariais, provas, testes e critérios de aceite
```

A decomposição N3+ é lida no N2 proprietário. A gramática N4→N10 é aplicada somente onde semanticamente válida.

---

# 2. N1 — VOLLEY

```text
N1 — VOLLEY
│
├── N2.01 — Product Experience / Product Model
├── N2.02 — Identity / Players
├── N2.03 — Communities
├── N2.04 — Sessions
├── N2.05 — Registration / Waitlist
├── N2.06 — Team Formation / Balancing
├── N2.07 — Live Match
├── N2.08 — Competitions
├── N2.09 — History / Statistics / Reports
├── N2.10 — Notifications
├── N2.11 — Media
├── N2.12 — Online / Offline Architecture
├── N2.13 — Realtime
├── N2.14 — Data Architecture
├── N2.15 — API / Application Layer
├── N2.16 — Security / Privacy / LGPD
├── N2.17 — Reliability
├── N2.18 — Performance / Scalability
├── N2.19 — Observability
├── N2.20 — Testing / QA
├── N2.21 — Operations / Deploy / Environments
├── N2.22 — Migration / Strangler
└── N2.23 — Architecture Governance
```

`Rating` is **not** an additional N2. The evaluation/skill-profile pipeline is owned as a named subdomain of N2.02.

---

# 3. Canonical N2 registry

| N2 | Contexto | Owner principal | Tipo | Documento canônico |
|---|---|---|---|---|
| N2.01 | Product Experience / Product Model | Product / Cross-context | Cross-context | `docs/architecture/contexts/N2.01-product-experience.md` |
| N2.02 | Identity / Players | Identity / Player | Domain | `docs/architecture/contexts/N2.02-identity-players.md` |
| N2.03 | Communities | Community | Domain | `docs/architecture/contexts/N2.03-communities.md` |
| N2.04 | Sessions | Session | Domain | `docs/architecture/contexts/N2.04-sessions.md` |
| N2.05 | Registration / Waitlist | Registration | Domain | `docs/architecture/contexts/N2.05-registration.md` |
| N2.06 | Team Formation / Balancing | Team Formation | Domain | `docs/architecture/contexts/N2.06-team-formation.md` |
| N2.07 | Live Match | Match | Domain | `docs/architecture/contexts/N2.07-live-match.md` |
| N2.08 | Competitions | Competition | Domain | `docs/architecture/contexts/N2.08-competitions.md` |
| N2.09 | History / Statistics / Reports | Statistics / History | Domain / Projection | `docs/architecture/contexts/N2.09-history-statistics.md` |
| N2.10 | Notifications | Notifications | Supporting Domain | `docs/architecture/contexts/N2.10-notifications.md` |
| N2.11 | Media | Media | Supporting Domain | `docs/architecture/contexts/N2.11-media.md` |
| N2.12 | Online / Offline Architecture | Platform / Cross-context | Cross-cutting | `docs/architecture/platform/N2.12-online-offline.md` |
| N2.13 | Realtime | Platform Realtime + contexts | Cross-cutting | `docs/architecture/platform/N2.13-realtime.md` |
| N2.14 | Data Architecture | Data / Cross-context | Cross-cutting | `docs/architecture/platform/N2.14-data-architecture.md` |
| N2.15 | API / Application Layer | Application / Cross-context | Cross-cutting | `docs/architecture/platform/N2.15-api-application.md` |
| N2.16 | Security / Privacy / LGPD | Security / Privacy | Cross-cutting | `docs/architecture/security/N2.16-security-privacy-lgpd.md` |
| N2.17 | Reliability | Platform Reliability + contexts | Cross-cutting | `docs/architecture/platform/N2.17-reliability.md` |
| N2.18 | Performance / Scalability | Platform Performance + contexts | Cross-cutting | `docs/architecture/platform/N2.18-performance-scalability.md` |
| N2.19 | Observability | Platform Observability + contexts | Cross-cutting | `docs/architecture/platform/N2.19-observability.md` |
| N2.20 | Testing / QA | Quality Engineering / Cross-context | Cross-cutting | `docs/architecture/quality/N2.20-testing-qa.md` |
| N2.21 | Operations / Deploy / Environments | Platform Operations + contexts | Cross-cutting | `docs/architecture/operations/N2.21-operations-deploy.md` |
| N2.22 | Migration / Strangler | Architecture Migration / Cross-context | Transitional | `docs/architecture/migration/N2.22-migration-strangler.md` |
| N2.23 | Architecture Governance | Architecture / Cross-context | Governance | `docs/architecture/governance/N2.23-architecture-governance.md` |

## 3.1 Player Skill Profile sub-owner — resolution of `C7-F-006`

Canonical ownership:

```text
N2.02 — Identity / Player
└── Player Skill Profile
```

Detailed ownership addendum:

`docs/architecture/contexts/N2.02-player-skill-profile-ownership.md`

The sub-owner owns:

```text
PlayerEvaluation semantics/revisions
CommunityPlayerSkillProfile
GlobalPlayerSkillProfile
aggregation/profile versioning
confidence / missing-state semantics
Derived Overall formula/version
profile rebuild semantics
```

The existing shorthand `Rating`, `Player Skill Profile projection` or `Player Skill Profile/display` in C2/C4/C5 means this sub-owner; it is not a separate authority.

Boundary split:

```text
Community
→ evaluator authorization / Community context

N2.02 / Player Skill Profile
→ evaluation + profile semantics

N2.06 / Team Formation
→ PlayerBalanceSnapshot + solver + candidates + TeamDraw

N2.09 / Statistics
→ factual Match-derived statistics
```

`OPEN-RATING-001` and `OPEN-RATING-002` remain open parameters under the now-resolved owner. Ownership is closed; estimator policy is not.

---

# 4. Scope e anchors por N2

## N2.01 — Product Experience / Product Model

Purpose: jornadas Quick/Community, atores, experiência de Registration/Team Formation/Match/Competition/History, recovery UX, accessibility/mobile court.

Anchors:

- Quick Session existe sem Community.
- Community shared state segue autoridade do bounded context servidor.
- spectator e MatchController são experiências diferentes.

## N2.02 — Identity / Players

Purpose: User, Player, Participant, Guest, account link, global Player, CommunityPlayer, merge, privacy, historical identity e ownership do Player Skill Profile.

Anchors:

```text
USER ≠ PLAYER ≠ PARTICIPANT
CommunityMembership ≠ CommunityPlayer
Guest participation ≠ automatic Player creation
Account deletion ≠ sports-history deletion
Global Player ≠ public global directory
Player Skill Profile ≠ factual Statistics
Player Skill Profile ≠ Team Formation solver
```

## N2.03 — Communities

Purpose: Community aggregate, join requests, Membership, governance roles, operational responsibilities, ownership/transfer/archive e authorization boundary.

Anchor:

```text
OWNER | ADMIN | MEMBER
≠
ORGANIZER operational responsibility
```

## N2.04 — Sessions

Purpose: Quick/Community Session, lifecycle, scheduling/publication, organizer assignment, courts, rules/config snapshots, SessionParticipant, RosterRevision e readiness.

Anchors:

```text
Session ≠ Match
Session ≠ Competition
Session ≠ RegistrationWindow
Session ≠ TeamDraw
StartSession ≠ StartMatch
```

## N2.05 — Registration / Waitlist

Purpose: RegistrationWindow, Entry, eligibility, capacity, FIFO, join/leave/promotion, revision, roster finalization, realtime e concurrency.

Anchors:

- confirmed/waitlist authority é server-side;
- queue ordering usa sequência monotônica autoritativa;
- Leave + promotion pertencem à mesma transação;
- waitlisted `≠` SessionParticipant;
- writes são online-authoritative.

## N2.06 — Team Formation / Balancing

Purpose: balance input snapshot, constraints/objectives, solver determinístico, candidates, voting, TeamDraw, manual revisions, validation e performance.

Non-negotiable:

```text
TEAM BALANCER INPUT
=
ATTRIBUTE VECTOR + EXPLICIT CONSTRAINTS

NEVER OVERALL
```

Ownership boundary:

```text
N2.06 consumes skill-profile-derived snapshots
N2.06 does not own PlayerEvaluation / profile aggregation semantics
```

## N2.07 — Live Match

Purpose: Match aggregate, preparation, roster/rules snapshot, controller/lease/epoch, semantic commands, MatchEvent sequence, projection/result, corrections, offline reconciliation e multi-court.

Anchors:

```text
Fixture ≠ Match
Organizer ≠ MatchController
client intent ≠ official score authority
MatchEvent ≠ MatchProjection
LWW forbidden for Match
old control_epoch cannot write after takeover
```

## N2.08 — Competitions

Purpose: Competition edition, entries/teams/rosters, stages/groups/rounds/fixtures, rulesets, official result, standings, penalties, dependencies e corrections.

Anchors:

```text
Competition ≠ Session
CompetitionTeam ≠ Session Team
Round ≠ Fixture
Fixture ≠ Match
MatchResult ≠ OfficialCompetitionResult
OfficialCompetitionResult ≠ StandingsProjection
WO ≠ fake PointEvents
```

## N2.09 — History / Statistics / Reports

Purpose: factual sports history, participation, per-Match statistical contributions, coverage/versioning, scopes, corrections/rebuild, rankings e reports.

Anchors:

```text
factual Statistics ≠ subjective PlayerEvaluation
missing / not captured ≠ 0
history uses MatchParticipation/snapshots, not current Team
one sports fact is not duplicated by query scope
```

## N2.10 — Notifications

Purpose: DomainEvent/outbox input, notification policy/intent, recipient resolution, Inbox, templates, reminders, preferences, provider delivery/retry.

Anchor:

```text
DOMAIN COMMIT
DOES NOT DEPEND ON
EXTERNAL NOTIFICATION PROVIDER SUCCESS
```

## N2.11 — Media

Purpose: MediaAsset identity, upload intent, private incoming zone, server validation/decode/re-encode, variants, attachment/moderation, delivery, GC, quotas e abuse.

Anchors:

- domain stores `asset_id`, not provider URL as identity;
- browser preprocessing is optimization, not security boundary;
- raw incoming object is untrusted/private;
- attachment switches only after accepted/READY state.

## N2.12 — Online / Offline Architecture

Purpose: operation-level authority classes, Quick local authority/handoff, cached reads/drafts, constrained Match commands, IndexedDB e global-sync retirement.

Anchor:

```text
NO UNIVERSAL MERGE/SYNC ALGORITHM
```

## N2.13 — Realtime

Purpose: committed-change transport, private channels/auth, revision/sequence envelopes, snapshot handshake, gap detection/reconnect e Presence.

Anchor:

```text
Realtime ≠ source of truth
Realtime ≠ command bus
Realtime ≠ Notification
Realtime ≠ offline reconciliation
```

## N2.14 — Data Architecture

Purpose: PostgreSQL authority, schema/private schemas, keys/revisions/sequences, fact/state/snapshot/projection classes, relational modeling, constraints/indexes/locks, rebuildability e migrations.

Anchor:

```text
POSTGRES
=
AUTHORITATIVE RELATIONAL MODEL
NOT SERIALIZED TYPESCRIPT STATE
```

## N2.15 — API / Application Layer

Purpose: semantic Commands/Queries, DTOs/models, validation/authz/capabilities, transaction/idempotency/errors, read models, RPC/Edge/jobs/outbox/versioning.

Anchor:

```text
business intent API
≠ generic table CRUD
```

## N2.16 — Security / Privacy / LGPD

Purpose: threat/data classification, authentication/step-up, capabilities/RLS/RPC, SECURITY DEFINER, BOLA/mass assignment, browser/Storage/Media security, secrets, abuse e LGPD lifecycle.

Anchors:

- browser/client payload is untrusted;
- auth `≠` authorization;
- actor derives server-side;
- service role never goes to browser;
- privacy/deletion semantics depend on data purpose, not one generic cascade.

## N2.17 — Reliability

Purpose: failure model, atomicity/idempotency/retry, unknown outcome, workers/outbox, poison messages, rebuild/replay, backup/restore/DR e graceful degradation.

Anchor:

```text
shared critical correctness
>
unrestricted availability
```

## N2.18 — Performance / Scalability

Purpose: bounded operational work, query/index/read model strategy, contention/fan-out, solver CPU/memory, frontend/IndexedDB/background processing, cost e load tests.

Anchor:

```text
OPERATIONAL WORK
MUST BE BOUNDED BY CURRENT OPERATIONAL CONTEXT
NOT TOTAL HISTORICAL SYSTEM SIZE
```

## N2.19 — Observability

Purpose: structured logs, metrics/traces/correlation, context telemetry, privacy/cardinality, dashboards/alerts/SLI/SLO/error budget, release diagnostics.

Anchor:

```text
Domain History ≠ Audit ≠ Telemetry ≠ Application Logs
```

## N2.20 — Testing / QA

Purpose: invariant/risk-oriented portfolio, DB/RLS/RPC/concurrency/idempotency, offline/realtime, security/migration/load/recovery/restore/failure injection e CI gates.

Anchor:

```text
CRITICAL INVARIANT
REQUIRES
EXECUTABLE EVIDENCE
```

## N2.21 — Operations / Deploy / Environments

Purpose: environment/config/secrets, CI/CD/release, migrations/backfills/deploy ordering, flags/kill switches, workers/providers, security headers, backup/restore, production access/runbooks/incidents.

Anchor:

```text
VERSIONED MIGRATIONS
=
AUTHORITATIVE SCHEMA HISTORY

CONSOLIDATED SNAPSHOT
=
DERIVED / VERIFIED ARTIFACT
```

Current transitional reconstruction details are governed by `docs/operations/database-reconstruction-contract.md` until W0 baseline normalization completes.

## N2.22 — Migration / Strangler

Purpose: Current→Target mapping, expand/shadow/cutover/backfill/verification/contract, provenance, domain waves, legacy adapters and sync/localStorage retirement.

Anchor:

```text
TWO IMPLEMENTATIONS MAY COEXIST
BUT
TWO AUTHORITIES FOR THE SAME AGGREGATE MAY NOT
```

## N2.23 — Architecture Governance

Purpose: source-of-truth governance, ADR/Open/Hyp/Invariant lifecycle, ownership/dependencies/fitness functions, technology adoption/deprecation/exceptions/reviews e architecture audit.

Anchor:

```text
Architecture
=
Decisions + Constraints + Evidence + Ownership + Evolution Rules
```

---

# 5. Cross-context dependency map

```text
Identity / Player
      │
      ├──── Player Skill Profile ─────► Team Formation input resolution
      │
      ├──────────────► Community
      │                   │
      │                   ▼
      │                Session
      │                   │
      │        ┌──────────┴───────────┐
      │        ▼                      ▼
      │   Registration           Team Formation
      │        │                      │
      │        └──────────┬───────────┘
      │                   ▼
      │                 Match
      │                   │
      │                   ▼
      │              Competition
      │                   │
      └───────────────────┼──────────► Stats / History
                          │
                          ├──────────► Notifications
                          └──────────► Reports
```

The skill-profile arrow means data consumption, not Team Formation ownership.

Cross-cutting contexts:

```text
Data
API / Application
Security / Privacy
Online / Offline
Realtime
Reliability
Performance
Observability
Testing / QA
Operations
Migration
Governance
```

They impose architecture/contracts on owner contexts but do not become owners of sports facts merely because they persist, transport, observe or test them.

---

# 6. Ten global anchors

The detailed global invariant catalog lives in C4. These are navigation anchors only:

```text
ANCHOR-01  User ≠ Player ≠ Participant
ANCHOR-02  CommunityMembership ≠ CommunityPlayer
ANCHOR-03  Organizer ≠ Governance Admin
ANCHOR-04  RegistrationEntry ≠ SessionParticipant
ANCHOR-05  Fixture ≠ Match
ANCHOR-06  Overall never drives Team Balancer
ANCHOR-07  Browser/shared local state is not authority by default
ANCHOR-08  Realtime is not source of truth
ANCHOR-09  Source Fact ≠ Projection
ANCHOR-10  No generic global sync in target architecture
```

Normative invariant identity and severity come from `docs/architecture/catalogs/INVARIANT-CATALOG.md`.

---

# 7. Migration wave map

The authoritative migration semantics live in N2.22 and C6. The EAP provides navigation:

```text
W0  Safety / Inventory / Foundations
W1  Pure Domain Corrections
W2  Community + Authorization
W3  Session Backbone
W4  Registration
W5  Player Skill Profile / Rating Pipeline
W6  Team Formation + Voting
W7  Match + Realtime + required Offline protocol
W8  Competition
W9  Stats / History
W10 Notifications
W11 Media
W12 Quick / IndexedDB
W13 Global Sync Retirement
W14 Contract / Legacy Removal
```

`W5 Rating Pipeline` means the N2.02 Player Skill Profile capability; it does not introduce a Rating bounded context.

Wave number is dependency guidance, not a license for big-bang cutover. C6 execution packs are authoritative for slice/gate order.

---

# 8. Canonical artifact map

```text
docs/architecture/
├── EAP-MASTER.md
├── PRINCIPLES.md
├── GLOSSARY.md
├── adr/ADR-CATALOG.md
├── catalogs/
│   ├── C4-INDEX.md
│   ├── INVARIANT-CATALOG.md
│   ├── OPEN-DECISIONS.md
│   └── HYPOTHESES.md
├── contexts/
│   ├── N2.01..N2.11 owner chapters
│   └── N2.02-player-skill-profile-ownership.md  # C7 ownership addendum
├── platform/
├── security/
├── quality/
├── operations/
├── migration/
├── governance/
├── matrices/
├── execution/
└── audit/
```

Documents under `docs/operations/`, `docs/superpowers/` and legacy architecture files remain historical/current implementation evidence unless explicitly classified by the architecture authority matrix.

---

# 9. Authority by question

| Pergunta | Autoridade |
|---|---|
| Termo significa o quê? | `GLOSSARY.md` |
| Quais constraints globais governam design? | `PRINCIPLES.md` |
| Qual N2 existe, qual scope e quem é owner? | `EAP-MASTER.md` |
| Qual sub-owner explicitamente resolvido por governança? | `EAP-MASTER.md` + linked ownership addendum |
| Qual decomposição N3/N4..N10 de um contexto? | owner N2 document |
| Por que uma decisão target foi tomada e qual seu status? | `ADR-CATALOG.md` + owner N2 rationale |
| Qual invariant é obrigatório? | C4 invariant catalog + owner N2 |
| Qual pergunta ainda está aberta? | C4 `OPEN-DECISIONS.md` |
| Qual hipótese ainda precisa evidência? | C4 `HYPOTHESES.md` |
| Como contexts se cruzam para implementação? | C5 matrices |
| Como Current vira Target? | N2.22 + C6 execution program |
| Qual schema é aplicado? | current reconstruction contract → target versioned migration authority |
| Qual comportamento está realmente implantado? | deployed code/schema + telemetry |
| Qual operação/runbook é atual? | documento explicitamente marcado `CURRENT-OPERATIONAL` ou `BREAK-GLASS`, subordinado ao target architecture |

Se duas fontes canônicas divergem:

```text
DO NOT choose newest file automatically
DO NOT choose code automatically
DO NOT choose operator habit automatically

record contradiction
→ identify owner
→ resolve explicitly
→ update evidence/references
```

---

# 10. C1 → C7 consolidation status

```text
C1  EAP master / N2 ownership                ✓  R1 + R5 reconciled
C2  23 owner chapters                        ✓  DRAFT-CANONICAL
C3  ADR canonicalization                     ✓  post-C6 delta review pending C7 R6
C4  invariants / open / hypotheses           ✓  lifecycle cleanup pending findings
C5  cross-cutting matrices                   ✓  visible-label normalization remains
C6  Current → Target execution program       ✓
C7  contradiction / completeness audit       ✓  promotion blocked until remaining remediation
```

Current promotion state:

```text
TARGET CONTENT
=
SUBSTANTIALLY COMPLETE

CANONICAL PROMOTION
=
BLOCKED UNTIL C7 REMEDIATION PASSES
```

---

# 11. R1 reconciliation record

C7 resolved N3 drift structurally:

```text
23 / 23 N2 documents
→ sole detailed N3 authorities

EAP
→ no second detailed N3 tree
```

Duplicate N3 IDs inside one owner N2 remain invalid and belong to architecture structure/reference fitness checks.

---

# 12. R5 ownership record

`C7-F-006` is resolved without creating a new bounded context:

```text
Rating / Skill Profile
→ N2.02 / Player Skill Profile
```

Team Formation remains owner of optimization, not evaluation meaning. Statistics remains owner of factual Match-derived statistics, not skill evaluation. Community remains owner of contextual authorization, not the aggregation semantics.

---

# 13. Non-loss rule

Removing duplicated N3 trees or normalizing owner labels does **not** remove architecture detail.

Navigate as:

```text
EAP
→ choose N2 / owner
→ owner N2 + explicit ownership addendum where present
→ N3..N10 detail
→ ADR / C4 / C5 / C6 as needed
```
