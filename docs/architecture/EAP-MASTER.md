# EAP MASTER — Arquitetura do Volley

> Status: `DRAFT-CANONICAL / C1`
>
> Branch de consolidação: `docs/architecture-consolidation`
>
> Escopo: índice arquitetural canônico da reconstrução do Volley.
>
> Regra fundamental: **este documento não substitui, resume nem elimina o conteúdo integral dos documentos N2.01–N2.23.** Ele organiza, identifica e rastreia esse conteúdo. O C2 será responsável por materializar os capítulos integrais.

---

## 0. Objetivo

Este documento é a árvore mestre da arquitetura do Volley. Ele existe para impedir perda de decisões, mistura de conceitos e divergência entre produto, domínio, banco, API, segurança, offline, Realtime, testes, operação e migração.

A EAP deve permitir responder, para qualquer requisito ou decisão:

1. **onde ele pertence;**
2. **quem é o bounded context responsável;**
3. **qual documento canônico o define;**
4. **quais invariantes o protegem;**
5. **quais ADRs justificam decisões relevantes;**
6. **quais comandos/queries o implementam;**
7. **quais tabelas/projeções o persistem;**
8. **qual política de segurança/offline/realtime se aplica;**
9. **como ele falha, recupera e migra;**
10. **como é testado no nível N10.**

---

# 1. Convenção dos níveis N1 → N10

A numeração não representa apenas profundidade textual. Cada nível possui função semântica fixa.

```text
N1  — Produto / Sistema
N2  — Bounded Context ou preocupação arquitetural principal
N3  — Capability / subdomínio / área de decisão
N4  — Aggregate, entidade, processo ou contrato principal
N5  — Regras, estados, políticas e invariantes do N4
N6  — Commands, Queries, Events e transições
N7  — Persistência, API, autorização, offline e Realtime
N8  — Concorrência, falhas, idempotência, privacidade e recovery
N9  — Observabilidade, performance, operação e migração
N10 — Cenários adversariais, provas, testes e critérios de aceite
```

## 1.1 Regra de materialização N4 → N10

Durante o C2 cada N3 relevante será expandido segundo a seguinte gramática, somente onde aplicável:

```text
N4.x — Modelo / Capability
  ├── N5.x.01 — Definição e responsabilidade
  ├── N5.x.02 — Estados / lifecycle
  ├── N5.x.03 — Regras / policies
  ├── N5.x.04 — Invariantes
  │
  ├── N6.x.01 — Commands
  ├── N6.x.02 — Queries
  ├── N6.x.03 — Domain Events
  ├── N6.x.04 — Erros / resultados
  │
  ├── N7.x.01 — Dados / constraints
  ├── N7.x.02 — API / DTOs
  ├── N7.x.03 — Authorization / RLS
  ├── N7.x.04 — Offline policy
  ├── N7.x.05 — Realtime policy
  │
  ├── N8.x.01 — Concorrência
  ├── N8.x.02 — Idempotência
  ├── N8.x.03 — Failure / recovery
  ├── N8.x.04 — Privacy / abuse
  │
  ├── N9.x.01 — Observability
  ├── N9.x.02 — Performance / scale
  ├── N9.x.03 — Operations
  ├── N9.x.04 — Migration / deprecation
  │
  └── N10.x — Adversarial scenarios / executable acceptance
```

**Importante:** N4–N10 não são preenchidos por repetição mecânica. O C2 deve materializar apenas nós semanticamente válidos e preservar os N8/N10 já definidos na análise original.

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

---

# 3. N2.01 — Product Experience / Product Model

**Owner:** Product / Cross-context

**Canonical document (C2):** `docs/architecture/contexts/N2.01-product-experience.md`

**Purpose:** definir experiências fundamentais, atores, jornadas, contextos Quick/Community e fronteiras de produto antes da implementação técnica.

```text
N2.01 — PRODUCT EXPERIENCE
├── N3.01.01 — Product Vision
├── N3.01.02 — Actors
├── N3.01.03 — User Journeys
├── N3.01.04 — Quick Session Experience
├── N3.01.05 — Community Session Experience
├── N3.01.06 — Registration Experience
├── N3.01.07 — Team Formation Experience
├── N3.01.08 — Voting Experience
├── N3.01.09 — Live Match Experience
├── N3.01.10 — Competition Experience
├── N3.01.11 — History / Career Experience
├── N3.01.12 — Offline Experience
├── N3.01.13 — Error / Recovery Experience
└── N3.01.14 — Accessibility / Mobile Court Experience
```

### Cross-context anchors

- Quick Session existe sem Community.
- Community Session é compartilhada e online-authoritative.
- Organizer é responsabilidade operacional de Session/Match, não governance.
- Participante em waitlist não é SessionParticipant efetivo.
- Candidate voting é opcional por Community/Session.
- Match spectator e Match controller possuem experiências distintas.

---

# 4. N2.02 — Identity / Players

**Owner:** Identity / Player

**Canonical document:** `docs/architecture/contexts/N2.02-identity-players.md`

```text
N2.02 — IDENTITY / PLAYERS
├── N3.02.01 — User Identity
├── N3.02.02 — Player Identity
├── N3.02.03 — Participant Identity
├── N3.02.04 — Guest Participant
├── N3.02.05 — Player Account Link
├── N3.02.06 — Player Claim / Conflict Resolution
├── N3.02.07 — Global Player
├── N3.02.08 — Community Player
├── N3.02.09 — Objective Player Traits
├── N3.02.10 — Player Privacy
├── N3.02.11 — Player Merge
├── N3.02.12 — Account Deletion vs Sports History
└── N3.02.13 — Historical Participant Snapshots
```

### Global invariants anchored here

- `USER ≠ PLAYER ≠ PARTICIPANT`.
- Player pode existir sem account.
- Guest participation não cria Player automaticamente.
- Player global não implica diretório público global.
- `CommunityMembership ≠ CommunityPlayer`.
- Account deletion não executa cascade destrutivo sobre história esportiva.

---

# 5. N2.03 — Communities

**Owner:** Community

**Canonical document:** `docs/architecture/contexts/N2.03-communities.md`

```text
N2.03 — COMMUNITIES
├── N3.03.01 — Community Aggregate
├── N3.03.02 — Community Lifecycle
├── N3.03.03 — Visibility / Discoverability
├── N3.03.04 — Join Policy
├── N3.03.05 — Join Request
├── N3.03.06 — Membership
├── N3.03.07 — Governance Roles
├── N3.03.08 — Operational Responsibilities
├── N3.03.09 — Organizer Responsibility
├── N3.03.10 — Ownership
├── N3.03.11 — Ownership Transfer
├── N3.03.12 — Member Suspension / Removal / Leave
├── N3.03.13 — Community Defaults
├── N3.03.14 — Community Archive
└── N3.03.15 — Community Authorization Boundary
```

### Governance model

```text
CommunityMembership
├── governance_role: OWNER | ADMIN | MEMBER
└── operational_responsibilities
    └── ORGANIZER
```

### Critical invariant

`ORGANIZER ≠ ADMIN`.

---

# 6. N2.04 — Sessions

**Owner:** Session

**Canonical document:** `docs/architecture/contexts/N2.04-sessions.md`

```text
N2.04 — SESSIONS
├── N3.04.01 — Session Aggregate
├── N3.04.02 — Session Context: QUICK / COMMUNITY
├── N3.04.03 — Session Lifecycle
├── N3.04.04 — Session Scheduling
├── N3.04.05 — Session Publication
├── N3.04.06 — Session Organizer Assignment
├── N3.04.07 — Session Courts
├── N3.04.08 — Session Rules Snapshot
├── N3.04.09 — Team Formation Configuration
├── N3.04.10 — Court Rotation Configuration
├── N3.04.11 — SessionParticipant
├── N3.04.12 — Roster Revisions
├── N3.04.13 — Session Readiness
├── N3.04.14 — Start Session
├── N3.04.15 — Finish Session
├── N3.04.16 — Session Cancellation
└── N3.04.17 — Competition / Fixture Association
```

### Critical separations

- `Session ≠ Match`.
- `Session ≠ Competition`.
- `Session ≠ RegistrationWindow`.
- `Session ≠ TeamDraw`.
- Session pode hospedar `0..N Matches` e múltiplas quadras.
- `StartSession ≠ StartMatch`.

---

# 7. N2.05 — Registration / Waitlist

**Owner:** Registration

**Canonical document:** `docs/architecture/contexts/N2.05-registration.md`

```text
N2.05 — REGISTRATION
├── N3.05.01 — Registration Window
├── N3.05.02 — Registration Lifecycle
├── N3.05.03 — Registration Entry
├── N3.05.04 — Eligibility Resolution
├── N3.05.05 — Capacity
├── N3.05.06 — FIFO Queue
├── N3.05.07 — Join Registration
├── N3.05.08 — Leave Registration
├── N3.05.09 — Waitlist Promotion
├── N3.05.10 — Capacity Increase / Reduction
├── N3.05.11 — Close / Reopen / Lock
├── N3.05.12 — Registration Revision
├── N3.05.13 — Finalize Session Roster
├── N3.05.14 — Post-start Roster Adjustments
├── N3.05.15 — Registration Realtime
└── N3.05.16 — Registration Concurrency
```

### Critical invariants

- Confirmed capacity e waitlist são server-authoritative.
- FIFO usa sequência monotônica autoritativa.
- Leave + promotion pertencem à mesma transação.
- Waitlisted `≠` SessionParticipant.
- Registration writes são online-only.
- `updated_at` nunca resolve a fila.

---

# 8. N2.06 — Team Formation / Balancing

**Owner:** Team Formation

**Canonical document:** `docs/architecture/contexts/N2.06-team-formation.md`

```text
N2.06 — TEAM FORMATION
├── N3.06.01 — Balance Input Resolution
├── N3.06.02 — Player Balance Snapshot
├── N3.06.03 — Attribute Vector
├── N3.06.04 — Position / Composition Inputs
├── N3.06.05 — Hard Constraints
├── N3.06.06 — Soft Objectives
├── N3.06.07 — Feasibility Precheck
├── N3.06.08 — Solver Architecture
├── N3.06.09 — Determinism / Seed
├── N3.06.10 — Algorithm Versioning
├── N3.06.11 — Objective Policy Versioning
├── N3.06.12 — Candidate Portfolio
├── N3.06.13 — Candidate Set
├── N3.06.14 — Team Candidate
├── N3.06.15 — Team Selection Policy
├── N3.06.16 — Organizer Choice
├── N3.06.17 — Participant Voting
├── N3.06.18 — TeamDraw
├── N3.06.19 — TeamDraw Revisions
├── N3.06.20 — Manual Adjustment
├── N3.06.21 — Confirm TeamDraw
├── N3.06.22 — Stale Roster Protection
└── N3.06.23 — Solver Performance / Worker
```

### Non-negotiable invariant

```text
TEAM BALANCER INPUT
=
ATTRIBUTE VECTOR + CONSTRAINTS

NEVER OVERALL
```

Overall é derivado para display/ranking/explicação; não participa do optimizer.

---

# 9. N2.07 — Live Match

**Owner:** Live Match

**Canonical document:** `docs/architecture/contexts/N2.07-live-match.md`

```text
N2.07 — LIVE MATCH
├── N3.07.01 — Match Aggregate
├── N3.07.02 — Fixture vs Match
├── N3.07.03 — Match Preparation
├── N3.07.04 — Match Rules Snapshot
├── N3.07.05 — Match Roster
├── N3.07.06 — Match Participation
├── N3.07.07 — Lineup
├── N3.07.08 — Match Lifecycle
├── N3.07.09 — Match Controller
├── N3.07.10 — Match Control Lease
├── N3.07.11 — Control Epoch
├── N3.07.12 — Start Match
├── N3.07.13 — Match Commands
├── N3.07.14 — Award Point
├── N3.07.15 — Match Event Log
├── N3.07.16 — Match Sequence
├── N3.07.17 — Match Projection
├── N3.07.18 — Set Resolution
├── N3.07.19 — Match Finish
├── N3.07.20 — Match Result
├── N3.07.21 — Event Corrections / Reverts
├── N3.07.22 — Capture Modes
├── N3.07.23 — Offline Controller
├── N3.07.24 — Match Outbox
├── N3.07.25 — Reconciliation
├── N3.07.26 — Multiple Courts
└── N3.07.27 — Spectator Realtime
```

### Core invariants

- `Fixture ≠ Match`.
- Client envia intenção; servidor calcula score.
- `MatchEvent` possui sequence autoritativa.
- `replay(effective events) == MatchProjection`.
- `MatchController ≠ Organizer`; Organizer pode obter controle conforme assignment/capability.
- LWW é proibido.
- `control_epoch` antigo não pode escrever após takeover.

---

# 10. N2.08 — Competitions

**Owner:** Competition

**Canonical document:** `docs/architecture/contexts/N2.08-competitions.md`

```text
N2.08 — COMPETITIONS
├── N3.08.01 — Competition Aggregate
├── N3.08.02 — Competition Series / Edition
├── N3.08.03 — Competition Organizer Scope
├── N3.08.04 — Competition Administration
├── N3.08.05 — Competition Entry
├── N3.08.06 — Competition Team
├── N3.08.07 — Competition Roster
├── N3.08.08 — Team Representative / Captain
├── N3.08.09 — Competition Ruleset
├── N3.08.10 — Competition Lifecycle
├── N3.08.11 — Competition Stage
├── N3.08.12 — Groups
├── N3.08.13 — Rounds
├── N3.08.14 — Fixture
├── N3.08.15 — Fixture Slot Source
├── N3.08.16 — Fixture Scheduling
├── N3.08.17 — Fixture Execution
├── N3.08.18 — Match Result vs Official Result
├── N3.08.19 — Official Competition Result
├── N3.08.20 — Walkover / Administrative Result
├── N3.08.21 — Standings Projection
├── N3.08.22 — Tie-break Policies
├── N3.08.23 — Penalties
├── N3.08.24 — Bracket Dependency Graph
├── N3.08.25 — Qualification Rules
├── N3.08.26 — Finalize Stage
├── N3.08.27 — Retroactive Result Correction
├── N3.08.28 — Competition Awards
└── N3.08.29 — Competition Realtime
```

### Critical separations

- Product labels League/Championship/Tournament não exigem engines independentes.
- `Fixture` é planejamento; `Match` é execução.
- MatchResult técnico `≠` OfficialCompetitionResult.
- Standings é projection derivada de resultados oficiais + penalties.
- WO não gera PointEvents fictícios.

---

# 11. N2.09 — History / Statistics / Reports

**Owner:** Statistics / History

**Canonical document:** `docs/architecture/contexts/N2.09-history-statistics.md`

```text
N2.09 — HISTORY / STATISTICS / REPORTS
├── N3.09.01 — Statistical Facts
├── N3.09.02 — Subjective Evaluations vs Statistics
├── N3.09.03 — Match Participation Source
├── N3.09.04 — Player Match Stats
├── N3.09.05 — Statistical Coverage
├── N3.09.06 — Stat Definition Versioning
├── N3.09.07 — Session Statistics
├── N3.09.08 — Community Statistics
├── N3.09.09 — Competition Statistics
├── N3.09.10 — Global Career
├── N3.09.11 — Date Range Statistics
├── N3.09.12 — Invalidated Match Handling
├── N3.09.13 — Corrections / Rebuild
├── N3.09.14 — Rankings
├── N3.09.15 — Skill Ranking vs Stat Ranking
├── N3.09.16 — Reports
├── N3.09.17 — Report Snapshots
└── N3.09.18 — Provisional Local Stats Overlay
```

### Critical invariants

- Statistics factuais `≠` avaliações subjetivas.
- Missing/not-captured `≠ 0`.
- Um Match contribui uma vez para o fato esportivo; scopes são dimensões de consulta, não duplicação.
- History usa MatchParticipation/snapshots, não Team atual.

---

# 12. N2.10 — Notifications

**Owner:** Notifications

**Canonical document:** `docs/architecture/contexts/N2.10-notifications.md`

```text
N2.10 — NOTIFICATIONS
├── N3.10.01 — Domain Event Input
├── N3.10.02 — Notification Policy
├── N3.10.03 — Notification Intent
├── N3.10.04 — Recipient Resolution
├── N3.10.05 — In-app Inbox
├── N3.10.06 — Push Endpoints
├── N3.10.07 — Delivery Attempt
├── N3.10.08 — Templates
├── N3.10.09 — Scheduled Reminder
├── N3.10.10 — Revalidation / TTL
├── N3.10.11 — User Preferences
├── N3.10.12 — Domain Outbox
├── N3.10.13 — Provider Adapters
├── N3.10.14 — WhatsApp Share Draft
└── N3.10.15 — Delivery Reliability
```

### Critical invariant

Domain commit não depende de provider externo. Delivery failure nunca reverte Registration/Match/Competition.

---

# 13. N2.11 — Media

**Owner:** Media

**Canonical document:** `docs/architecture/contexts/N2.11-media.md`

```text
N2.11 — MEDIA
├── N3.11.01 — MediaAsset
├── N3.11.02 — Media Purpose
├── N3.11.03 — Media Upload Intent
├── N3.11.04 — Incoming Asset
├── N3.11.05 — Server Validation
├── N3.11.06 — Decode / Dimension Validation
├── N3.11.07 — Metadata / EXIF Removal
├── N3.11.08 — Normalization / Re-encode
├── N3.11.09 — Media Lifecycle
├── N3.11.10 — Media Variants
├── N3.11.11 — Player Avatar
├── N3.11.12 — Community Media
├── N3.11.13 — Competition Media
├── N3.11.14 — Player Media Proposal
├── N3.11.15 — Visibility / Public Delivery
├── N3.11.16 — Replacement / Detach
├── N3.11.17 — Orphan Cleanup
└── N3.11.18 — Quotas / Abuse
```

### Critical invariants

- Domain armazena `asset_id`, não provider URL como identidade.
- Browser image processing é otimização, não security boundary.
- Path de Storage não é autorização.
- Histórico esportivo não copia avatar por padrão.

---

# 14. N2.12 — Online / Offline Architecture

**Owner:** Platform / Cross-context

**Canonical document:** `docs/architecture/platform/N2.12-online-offline.md`

```text
N2.12 — ONLINE / OFFLINE
├── N3.12.01 — Authority Model
├── N3.12.02 — Online-Authoritative Operations
├── N3.12.03 — Offline-Owned Data
├── N3.12.04 — Cached Reads
├── N3.12.05 — Local Drafts
├── N3.12.06 — Conditional Offline Commands
├── N3.12.07 — Quick Session Authority
├── N3.12.08 — Quick Publication / Authority Handoff
├── N3.12.09 — Command Outbox
├── N3.12.10 — Idempotent Retry
├── N3.12.11 — IndexedDB
├── N3.12.12 — User-scoped Local Data
├── N3.12.13 — Anonymous Device-local Data
├── N3.12.14 — Connectivity State
├── N3.12.15 — Fresh / Stale / Unknown
├── N3.12.16 — Local DB Migration
├── N3.12.17 — Logout / Account Switch
└── N3.12.18 — Legacy Global Sync Retirement
```

### Operation classes

```text
A  — ONLINE AUTHORITATIVE
B  — OFFLINE OWNED
C  — CACHED READ
D  — LOCAL DRAFT
B2 — CONDITIONALLY OFFLINE / LEASED ORDERED COMMANDS
```

### Critical invariant

Não existe algoritmo universal de merge/sync para todo o domínio.

---

# 15. N2.13 — Realtime

**Owner:** Platform Realtime + individual contexts

**Canonical document:** `docs/architecture/platform/N2.13-realtime.md`

```text
N2.13 — REALTIME
├── N3.13.01 — Realtime Role
├── N3.13.02 — Broadcast vs Postgres Changes
├── N3.13.03 — Private Channels
├── N3.13.04 — Channel Authorization
├── N3.13.05 — Channel Boundaries
├── N3.13.06 — Realtime Envelope
├── N3.13.07 — Revision-based State
├── N3.13.08 — Sequence-based State
├── N3.13.09 — Subscription + Snapshot Handshake
├── N3.13.10 — Gap Detection
├── N3.13.11 — Reconnect Reconciliation
├── N3.13.12 — Registration Realtime
├── N3.13.13 — Team Selection Realtime
├── N3.13.14 — Match Realtime
├── N3.13.15 — Competition Realtime
├── N3.13.16 — Notification Realtime
├── N3.13.17 — Presence
├── N3.13.18 — Client Publish Restrictions
├── N3.13.19 — Schema Versioning
└── N3.13.20 — Realtime Observability
```

### Critical invariant

Realtime é **transporte de alterações já commitadas**, nunca source of truth, command bus ou substituto de sync/recovery.

---

# 16. N2.14 — Data Architecture

**Owner:** Data / Cross-context

**Canonical document:** `docs/architecture/platform/N2.14-data-architecture.md`

```text
N2.14 — DATA ARCHITECTURE
├── N3.14.01 — PostgreSQL Authority Model
├── N3.14.02 — Schema Strategy
├── N3.14.03 — Public vs Private Schemas
├── N3.14.04 — Naming Conventions
├── N3.14.05 — Primary Keys / UUID
├── N3.14.06 — Timestamps
├── N3.14.07 — Revisions / Sequences
├── N3.14.08 — Source Facts
├── N3.14.09 — Mutable State
├── N3.14.10 — Immutable Snapshots
├── N3.14.11 — Projections
├── N3.14.12 — Audit / Outbox / Command Receipts
├── N3.14.13 — Relational Modeling
├── N3.14.14 — JSONB Policy
├── N3.14.15 — Array Policy
├── N3.14.16 — Foreign Keys
├── N3.14.17 — Delete Semantics
├── N3.14.18 — Domain Lifecycle vs Soft Delete
├── N3.14.19 — Constraints
├── N3.14.20 — Partial Unique Indexes
├── N3.14.21 — Index Strategy
├── N3.14.22 — Transaction Boundaries
├── N3.14.23 — Row Locks
├── N3.14.24 — Projection Rebuildability
├── N3.14.25 — Migration Strategy
└── N3.14.26 — Partitioning Triggers
```

### Core data rule

Postgres é modelo relacional autoritativo, não clone serializado do estado TypeScript/UI.

---

# 17. N2.15 — API / Application Layer

**Owner:** Application / Cross-context

**Canonical document:** `docs/architecture/platform/N2.15-api-application.md`

```text
N2.15 — API / APPLICATION
├── N3.15.01 — Application Boundary
├── N3.15.02 — Commands
├── N3.15.03 — Queries
├── N3.15.04 — Command Contracts
├── N3.15.05 — Query Contracts
├── N3.15.06 — DTOs
├── N3.15.07 — Domain Models
├── N3.15.08 — Validation
├── N3.15.09 — Authentication
├── N3.15.10 — Authorization
├── N3.15.11 — Capabilities
├── N3.15.12 — Transaction Boundaries
├── N3.15.13 — Idempotency
├── N3.15.14 — Optimistic Concurrency
├── N3.15.15 — Error Contracts
├── N3.15.16 — Retries
├── N3.15.17 — Unknown Outcomes
├── N3.15.18 — Read Models
├── N3.15.19 — Pagination
├── N3.15.20 — Filtering
├── N3.15.21 — Public Views
├── N3.15.22 — Private Views
├── N3.15.23 — RPC
├── N3.15.24 — Edge Functions
├── N3.15.25 — External Integrations
├── N3.15.26 — Background Jobs
├── N3.15.27 — Outbox Integration
├── N3.15.28 — Contract Versioning
├── N3.15.29 — Compatibility
├── N3.15.30 — Rate Limiting
├── N3.15.31 — Observability
├── N3.15.32 — Security
├── N3.15.33 — Testing
└── N3.15.34 — Migration
```

### Core rule

Application API representa intenção de negócio (`JoinRegistration`, `AwardPoint`, `TransferOwnership`), não CRUD genérico de tabela.

---

# 18. N2.16 — Security / Privacy / LGPD

**Owner:** Security / Privacy / Cross-context

**Canonical document:** `docs/architecture/security/N2.16-security-privacy-lgpd.md`

```text
N2.16 — SECURITY / PRIVACY / LGPD
├── N3.16.01 — Security Governance
├── N3.16.02 — Threat Model
├── N3.16.03 — Data Classification
├── N3.16.04 — Authentication
├── N3.16.05 — Session Security
├── N3.16.06 — MFA / Step-up
├── N3.16.07 — Authorization
├── N3.16.08 — Capabilities
├── N3.16.09 — Community Isolation
├── N3.16.10 — RLS
├── N3.16.11 — RPC Security
├── N3.16.12 — SECURITY DEFINER
├── N3.16.13 — Service Roles
├── N3.16.14 — IDOR / BOLA
├── N3.16.15 — Mass Assignment
├── N3.16.16 — Realtime Security
├── N3.16.17 — Storage Security
├── N3.16.18 — Media Security
├── N3.16.19 — Browser Security
├── N3.16.20 — XSS
├── N3.16.21 — CSRF
├── N3.16.22 — Dependency / Supply Chain
├── N3.16.23 — Local Data / IndexedDB
├── N3.16.24 — Secrets
├── N3.16.25 — Abuse / Rate Limiting
├── N3.16.26 — Audit
├── N3.16.27 — Privacy by Design
├── N3.16.28 — Purpose / Legal Basis Mapping
├── N3.16.29 — Transparency
├── N3.16.30 — Data Subject Rights
├── N3.16.31 — Consent Records
├── N3.16.32 — Retention
├── N3.16.33 — Deletion / Anonymization
├── N3.16.34 — International Transfers
├── N3.16.35 — Vendors / Subprocessors
├── N3.16.36 — Security Incidents
├── N3.16.37 — Backup Security
├── N3.16.38 — Internal Administration
├── N3.16.39 — Security Observability
├── N3.16.40 — Security Testing
└── N3.16.41 — Security Migration
```

### Security anchors

- Browser/payload são não confiáveis.
- Conhecer UUID não concede acesso.
- Resource context real determina autorização.
- RLS + Application Authorization + constraints = defense in depth.
- `SECURITY DEFINER` é endpoint privilegiado e exige hardening explícito.
- Service role nunca entra no browser.

---

# 19. N2.17 — Reliability

**Owner:** Platform Reliability + contexts

**Canonical document:** `docs/architecture/platform/N2.17-reliability.md`

```text
N2.17 — RELIABILITY
├── N3.17.01 — Reliability Model
├── N3.17.02 — Criticality Classes
├── N3.17.03 — Failure Domains
├── N3.17.04 — Durability
├── N3.17.05 — Availability
├── N3.17.06 — Correctness
├── N3.17.07 — RPO
├── N3.17.08 — RTO
├── N3.17.09 — SLO / SLI
├── N3.17.10 — Atomicity
├── N3.17.11 — Idempotency
├── N3.17.12 — Retry
├── N3.17.13 — Backoff
├── N3.17.14 — Unknown Outcome
├── N3.17.15 — Deduplication
├── N3.17.16 — Reconciliation
├── N3.17.17 — Outbox Reliability
├── N3.17.18 — Worker Reliability
├── N3.17.19 — Poison Messages
├── N3.17.20 — Dead Letter Handling
├── N3.17.21 — Projection Recovery
├── N3.17.22 — Match Recovery
├── N3.17.23 — Registration Recovery
├── N3.17.24 — Voting Recovery
├── N3.17.25 — Competition Recovery
├── N3.17.26 — Media Recovery
├── N3.17.27 — Notification Recovery
├── N3.17.28 — Realtime Recovery
├── N3.17.29 — Local Data Recovery
├── N3.17.30 — Dependency Failure
├── N3.17.31 — Graceful Degradation
├── N3.17.32 — Backup
├── N3.17.33 — Restore
├── N3.17.34 — Disaster Recovery
├── N3.17.35 — Data Integrity Verification
├── N3.17.36 — Deployment Safety
├── N3.17.37 — Operational Runbooks
├── N3.17.38 — Observability
├── N3.17.39 — Chaos / Failure Testing
└── N3.17.40 — Migration
```

### Reliability principle

Para shared state crítico, correctness prevalece sobre availability irrestrita.

---

# 20. N2.18 — Performance / Scalability

**Owner:** Platform Performance + contexts

**Canonical document:** `docs/architecture/platform/N2.18-performance-scalability.md`

```text
N2.18 — PERFORMANCE / SCALABILITY
├── N3.18.01 — Performance Model
├── N3.18.02 — Capacity Dimensions
├── N3.18.03 — Performance Budgets
├── N3.18.04 — Latency
├── N3.18.05 — Throughput
├── N3.18.06 — Concurrency
├── N3.18.07 — Database Queries
├── N3.18.08 — Index Strategy
├── N3.18.09 — Query Plans
├── N3.18.10 — RLS Performance
├── N3.18.11 — Read Models
├── N3.18.12 — Pagination
├── N3.18.13 — N+1 Prevention
├── N3.18.14 — Payload Size
├── N3.18.15 — Caching
├── N3.18.16 — Projections
├── N3.18.17 — Registration Contention
├── N3.18.18 — Match Throughput
├── N3.18.19 — Match Event Growth
├── N3.18.20 — Realtime Fan-out
├── N3.18.21 — Team Balancer CPU
├── N3.18.22 — Team Balancer Memory
├── N3.18.23 — Statistics
├── N3.18.24 — Competition
├── N3.18.25 — Media
├── N3.18.26 — Frontend Rendering
├── N3.18.27 — Bundle / Loading
├── N3.18.28 — IndexedDB
├── N3.18.29 — Background Processing
├── N3.18.30 — Scaling Triggers
├── N3.18.31 — Cost Efficiency
├── N3.18.32 — Load Testing
└── N3.18.33 — Migration Performance
```

### Performance principle

Operational cost deve ser bounded pelo contexto atual, não pelo histórico total do usuário/sistema.

---

# 21. N2.19 — Observability

**Owner:** Platform Observability

**Canonical document:** `docs/architecture/platform/N2.19-observability.md`

```text
N2.19 — OBSERVABILITY
├── N3.19.01 — Observability Model
├── N3.19.02 — Structured Logging
├── N3.19.03 — Metrics
├── N3.19.04 — Distributed Tracing
├── N3.19.05 — Correlation
├── N3.19.06 — Command Observability
├── N3.19.07 — Query Observability
├── N3.19.08 — Database Observability
├── N3.19.09 — Realtime Observability
├── N3.19.10 — Offline Observability
├── N3.19.11 — Match Observability
├── N3.19.12 — Registration Observability
├── N3.19.13 — Team Balancer Observability
├── N3.19.14 — Competition Observability
├── N3.19.15 — Rating Pipeline Observability
├── N3.19.16 — Worker / Outbox Observability
├── N3.19.17 — Media Observability
├── N3.19.18 — Notification Observability
├── N3.19.19 — Security Telemetry
├── N3.19.20 — Audit vs Telemetry
├── N3.19.21 — Privacy / PII
├── N3.19.22 — Sampling
├── N3.19.23 — Dashboards
├── N3.19.24 — Alerts
├── N3.19.25 — Severity
├── N3.19.26 — SLI
├── N3.19.27 — SLO
├── N3.19.28 — Error Budgets
├── N3.19.29 — Frontend Errors
├── N3.19.30 — Release Correlation
├── N3.19.31 — Operational Diagnostics
├── N3.19.32 — Retention
└── N3.19.33 — Observability Testing
```

### Critical separation

`Domain History ≠ Audit ≠ Telemetry ≠ Application Logs`.

---

# 22. N2.20 — Testing / QA

**Owner:** Quality Engineering / Cross-context

**Canonical document:** `docs/architecture/quality/N2.20-testing-qa.md`

```text
N2.20 — TESTING / QA
├── N3.20.01 — Quality Model
├── N3.20.02 — Test Portfolio
├── N3.20.03 — Static Analysis
├── N3.20.04 — Unit Tests
├── N3.20.05 — Domain Tests
├── N3.20.06 — Property-Based Tests
├── N3.20.07 — Determinism Tests
├── N3.20.08 — Application Tests
├── N3.20.09 — Contract Tests
├── N3.20.10 — Database Integration
├── N3.20.11 — Constraint Tests
├── N3.20.12 — RLS Tests
├── N3.20.13 — RPC Tests
├── N3.20.14 — Authorization Matrix
├── N3.20.15 — BOLA / IDOR Tests
├── N3.20.16 — Concurrency Tests
├── N3.20.17 — Idempotency Tests
├── N3.20.18 — Transaction Failure Tests
├── N3.20.19 — Realtime Tests
├── N3.20.20 — Offline Tests
├── N3.20.21 — IndexedDB Tests
├── N3.20.22 — Match Reconciliation
├── N3.20.23 — Team Balancer Tests
├── N3.20.24 — Ratings Tests
├── N3.20.25 — Competition Tests
├── N3.20.26 — Statistics Tests
├── N3.20.27 — Media Tests
├── N3.20.28 — Notification Tests
├── N3.20.29 — UI Component Tests
├── N3.20.30 — Accessibility Tests
├── N3.20.31 — E2E Tests
├── N3.20.32 — Migration Tests
├── N3.20.33 — Backfill Tests
├── N3.20.34 — Performance Tests
├── N3.20.35 — Load Tests
├── N3.20.36 — Security Tests
├── N3.20.37 — Recovery Tests
├── N3.20.38 — Restore Drills
├── N3.20.39 — Failure Injection
├── N3.20.40 — Test Data
├── N3.20.41 — Environment Isolation
├── N3.20.42 — Flaky Test Policy
├── N3.20.43 — Coverage
├── N3.20.44 — CI Gates
└── N3.20.45 — Release Gates
```

### Test principle

Critical invariants require executable evidence. Coverage percentage alone não é garantia arquitetural.

---

# 23. N2.21 — Operations / Deploy / Environments

**Owner:** Platform Operations

**Canonical document:** `docs/architecture/operations/N2.21-operations-deploy.md`

```text
N2.21 — OPERATIONS
├── N3.21.01 — Environment Model
├── N3.21.02 — Local Environment
├── N3.21.03 — CI Environment
├── N3.21.04 — Preview Environment
├── N3.21.05 — Staging
├── N3.21.06 — Production
├── N3.21.07 — Environment Isolation
├── N3.21.08 — Configuration Management
├── N3.21.09 — Secrets Management
├── N3.21.10 — Runtime Versioning
├── N3.21.11 — Package Manager
├── N3.21.12 — CI
├── N3.21.13 — CD
├── N3.21.14 — Release Process
├── N3.21.15 — Database Migrations
├── N3.21.16 — Backfills
├── N3.21.17 — Deployment Ordering
├── N3.21.18 — Rollback
├── N3.21.19 — Feature Flags
├── N3.21.20 — Kill Switches
├── N3.21.21 — Background Workers
├── N3.21.22 — Scheduled Jobs
├── N3.21.23 — Outbox Processing
├── N3.21.24 — Media Processing
├── N3.21.25 — Provider Operations
├── N3.21.26 — DNS / TLS
├── N3.21.27 — Security Headers
├── N3.21.28 — Auth Redirects / Origins
├── N3.21.29 — CDN / Cache
├── N3.21.30 — PWA Deployment
├── N3.21.31 — Backup
├── N3.21.32 — Restore
├── N3.21.33 — Disaster Recovery
├── N3.21.34 — Production Access
├── N3.21.35 — Break Glass
├── N3.21.36 — Data Repair
├── N3.21.37 — Incident Operations
├── N3.21.38 — Runbooks
├── N3.21.39 — Change Management
├── N3.21.40 — Post-Deploy Verification
└── N3.21.41 — Operational Governance
```

### Operations principle

Production schema changes originate from versioned migrations; deployments de alto risco usam expand → migrate → verify → contract e post-deploy observation.

---

# 24. N2.22 — Migration / Strangler

**Owner:** Architecture Migration / Cross-context

**Canonical document:** `docs/architecture/migration/N2.22-migration-strangler.md`

```text
N2.22 — MIGRATION / STRANGLER
├── N3.22.01 — Migration Principles
├── N3.22.02 — Current-State Inventory
├── N3.22.03 — Target-State Mapping
├── N3.22.04 — Dependency Graph
├── N3.22.05 — Migration Units
├── N3.22.06 — Expand
├── N3.22.07 — Shadow
├── N3.22.08 — Dual Compatibility
├── N3.22.09 — Cohort Cutover
├── N3.22.10 — Backfill
├── N3.22.11 — Verification
├── N3.22.12 — Read Cutover
├── N3.22.13 — Write Cutover
├── N3.22.14 — Contract
├── N3.22.15 — Rollback
├── N3.22.16 — Feature Flags
├── N3.22.17 — Legacy Adapters
├── N3.22.18 — Data Provenance
├── N3.22.19 — Identity Migration
├── N3.22.20 — Community Migration
├── N3.22.21 — Organizer Migration
├── N3.22.22 — Session Migration
├── N3.22.23 — Registration Introduction
├── N3.22.24 — Rating Migration
├── N3.22.25 — Team Formation Migration
├── N3.22.26 — Voting Introduction
├── N3.22.27 — Match Migration
├── N3.22.28 — Offline Migration
├── N3.22.29 — Realtime Migration
├── N3.22.30 — Competition Migration
├── N3.22.31 — Statistics Migration
├── N3.22.32 — Notification Migration
├── N3.22.33 — Media Migration
├── N3.22.34 — Sync Retirement
├── N3.22.35 — LocalStorage Retirement
├── N3.22.36 — Schema Contract
├── N3.22.37 — Legacy Removal
└── N3.22.38 — Migration Completion
```

### Strangler principle

Duas implementações podem coexistir; **duas autoridades para o mesmo aggregate não**.

### Wave map

```text
W0  Safety / Inventory
W1  Pure Domain Corrections
W2  Community + Authorization
W3  Session Backbone
W4  Registration
W5  Rating Pipeline
W6  Team Formation + Voting
W7  Match + Realtime + Offline
W8  Competition
W9  Stats / History
W10 Notifications
W11 Media
W12 Quick / IndexedDB
W13 Global Sync Retirement
W14 Contract / Legacy Removal
```

---

# 25. N2.23 — Architecture Governance

**Owner:** Architecture / Cross-context

**Canonical document:** `docs/architecture/governance/N2.23-architecture-governance.md`

```text
N2.23 — ARCHITECTURE GOVERNANCE
├── N3.23.01 — Architecture Principles
├── N3.23.02 — Architecture Source of Truth
├── N3.23.03 — Bounded Context Ownership
├── N3.23.04 — Module Ownership
├── N3.23.05 — ADR Governance
├── N3.23.06 — ADR Lifecycle
├── N3.23.07 — Open Decisions
├── N3.23.08 — Hypotheses
├── N3.23.09 — Global Invariants
├── N3.23.10 — Context Invariants
├── N3.23.11 — Traceability
├── N3.23.12 — Dependency Rules
├── N3.23.13 — Architecture Fitness Functions
├── N3.23.14 — Domain Language
├── N3.23.15 — Naming Governance
├── N3.23.16 — API Governance
├── N3.23.17 — Data Governance
├── N3.23.18 — Security Governance
├── N3.23.19 — Privacy Governance
├── N3.23.20 — Offline Governance
├── N3.23.21 — Realtime Governance
├── N3.23.22 — Reliability Governance
├── N3.23.23 — Migration Governance
├── N3.23.24 — Test Governance
├── N3.23.25 — Operational Governance
├── N3.23.26 — Technology Adoption
├── N3.23.27 — Dependency Adoption
├── N3.23.28 — Feature Flags
├── N3.23.29 — Deprecation
├── N3.23.30 — Technical Debt
├── N3.23.31 — Exceptions
├── N3.23.32 — Architecture Review
├── N3.23.33 — Risk Classification
├── N3.23.34 — Documentation Lifecycle
├── N3.23.35 — Knowledge Continuity
├── N3.23.36 — Evolution Triggers
└── N3.23.37 — Architecture Audit
```

---

# 26. Matriz de ownership dos bounded contexts

| N2 | Contexto | Ownership principal | Tipo |
|---|---|---|---|
| N2.01 | Product Experience | Product | Cross-context |
| N2.02 | Identity / Player | Identity | Domain |
| N2.03 | Community | Community | Domain |
| N2.04 | Session | Session | Domain |
| N2.05 | Registration | Registration | Domain |
| N2.06 | Team Formation | Team Formation | Domain |
| N2.07 | Live Match | Match | Domain |
| N2.08 | Competition | Competition | Domain |
| N2.09 | History / Stats | Statistics | Domain / Projection |
| N2.10 | Notifications | Notification | Supporting Domain |
| N2.11 | Media | Media | Supporting Domain |
| N2.12 | Online / Offline | Platform | Cross-cutting |
| N2.13 | Realtime | Platform | Cross-cutting |
| N2.14 | Data Architecture | Data | Cross-cutting |
| N2.15 | API / Application | Application | Cross-cutting |
| N2.16 | Security / Privacy | Security | Cross-cutting |
| N2.17 | Reliability | Platform | Cross-cutting |
| N2.18 | Performance | Platform | Cross-cutting |
| N2.19 | Observability | Platform | Cross-cutting |
| N2.20 | Testing / QA | Quality | Cross-cutting |
| N2.21 | Operations | Platform Ops | Cross-cutting |
| N2.22 | Migration | Architecture | Transitional |
| N2.23 | Governance | Architecture | Governance |

---

# 27. Dependências arquiteturais principais

```text
Identity / Player
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

Cross-cutting:

```text
Data
API/Application
Security/Privacy
Online/Offline
Realtime
Reliability
Performance
Observability
Testing
Operations
Governance
```

não são donos dos fatos esportivos; impõem regras e infraestrutura sobre os contexts proprietários.

---

# 28. Dez invariantes arquiteturais âncora

Estes IDs serão formalizados no C4. A lista abaixo é apenas a âncora do EAP.

```text
ANCHOR-01  User ≠ Player ≠ Participant
ANCHOR-02  CommunityMembership ≠ CommunityPlayer
ANCHOR-03  Organizer ≠ Governance Admin
ANCHOR-04  RegistrationEntry ≠ SessionParticipant
ANCHOR-05  Fixture ≠ Match
ANCHOR-06  Overall never drives Team Balancer
ANCHOR-07  Browser/shared local state is not authority
ANCHOR-08  Realtime is not source of truth
ANCHOR-09  Source Fact ≠ Projection
ANCHOR-10  No generic global sync in target architecture
```

Nenhum documento C2 pode contradizer estas âncoras sem criar explicitamente um ADR que proponha supersedi-las.

---

# 29. Tipos de artefatos canônicos que serão ligados ao EAP

O EAP não carregará cópias integrais destes artefatos; ele fará referência a eles.

```text
docs/architecture/
├── EAP-MASTER.md
├── PRINCIPLES.md
├── GLOSSARY.md
├── GLOBAL-INVARIANTS.md
├── OPEN-DECISIONS.md
├── DEPRECATION-REGISTER.md
├── TECH-DEBT-REGISTER.md
├── TRACEABILITY-MATRIX.md
│
├── contexts/
│   ├── N2.01-product-experience.md
│   ├── N2.02-identity-players.md
│   ├── N2.03-communities.md
│   ├── N2.04-sessions.md
│   ├── N2.05-registration.md
│   ├── N2.06-team-formation.md
│   ├── N2.07-live-match.md
│   ├── N2.08-competitions.md
│   ├── N2.09-history-statistics.md
│   ├── N2.10-notifications.md
│   └── N2.11-media.md
│
├── platform/
│   ├── N2.12-online-offline.md
│   ├── N2.13-realtime.md
│   ├── N2.14-data-architecture.md
│   ├── N2.15-api-application.md
│   ├── N2.17-reliability.md
│   ├── N2.18-performance-scalability.md
│   └── N2.19-observability.md
│
├── security/
│   └── N2.16-security-privacy-lgpd.md
│
├── quality/
│   └── N2.20-testing-qa.md
│
├── operations/
│   └── N2.21-operations-deploy.md
│
├── migration/
│   └── N2.22-migration-strangler.md
│
├── governance/
│   └── N2.23-architecture-governance.md
│
└── adr/
    └── ADR-xxxx-*.md
```

---

# 30. Regras para o C2 — materialização integral

Cada documento N2 deverá preservar, sem compressão semântica:

```text
1. Contexto e problema
2. Estado atual observado no repositório
3. Target architecture
4. Alternativas consideradas
5. Decisões firmes
6. Hipóteses
7. Open questions
8. Entities / aggregates / value objects
9. State machines
10. Commands
11. Queries
12. Domain events
13. Data model
14. API contracts
15. Authorization / RLS
16. Offline policy
17. Realtime policy
18. Failure / recovery
19. Performance implications
20. Observability
21. Security / privacy / LGPD
22. Migration / legacy mapping
23. Invariants
24. ADR references
25. N10 scenarios / acceptance tests
```

Se um item não se aplicar, o documento deverá registrar `N/A` ou explicar por quê; ele não deve desaparecer silenciosamente.

---

# 31. Regras para IDs durante C2–C4

Os IDs usados durante a discussão original (`ADR-xxxx`, `SEC-INV-xxx`, `REL-INV-xxx`, etc.) são **provisórios até a auditoria C3/C4**.

O processo de canonicalização será:

```text
1. preservar todo conteúdo original;
2. detectar decisões duplicadas;
3. separar DECISION de HYPOTHESIS/OPEN;
4. atribuir ID canônico único;
5. registrar aliases dos IDs provisórios quando necessário;
6. nunca apagar decisão histórica apenas por renumeração.
```

---

# 32. Critério de conclusão do C1

C1 estará concluído quando:

- [x] N1 definido;
- [x] todos os N2.01–N2.23 presentes;
- [x] ownership de cada N2 definido;
- [x] todos os N3 levantados na primeira varredura representados;
- [x] semântica formal N4→N10 definida;
- [x] caminhos canônicos de documentos definidos;
- [x] invariantes âncora explicitadas;
- [x] dependency map de alto nível definido;
- [x] regras de materialização integral do C2 definidas;
- [ ] N4–N10 específicos materializados dentro de cada capítulo — responsabilidade do C2;
- [ ] IDs finais de ADR/invariantes reconciliados — responsabilidade C3/C4;
- [ ] traceability completa — responsabilidade C5;

---

# 33. Próximo passo

`C2 — DOCUMENTOS CANÔNICOS INTEGRAIS`

Ordem inicial recomendada para C2:

```text
C2.00 — Architecture Principles + Glossary
C2.01 — N2.01 Product Experience
C2.02 — N2.02 Identity / Players
C2.03 — N2.03 Communities
...
C2.23 — N2.23 Architecture Governance
```

Cada capítulo será escrito a partir do conteúdo integral da primeira varredura, não a partir de uma síntese reduzida deste EAP.
