# C7 R10 — Machine + Semantic Audit Rerun

> Status: `PASS-WITH-NON-BLOCKING-FINDING / C7-R10`
>
> Owner: `Architecture Governance`
>
> Date: `2026-08-27`
>
> Parent: [`C7-CORRECTIONS-REQUIRED.md`](./C7-CORRECTIONS-REQUIRED.md)
>
> Findings ledger: [`C7-FINDINGS-LEDGER.md`](./C7-FINDINGS-LEDGER.md)
>
> Remediation status: [`C7-REMEDIATION-STATUS.md`](./C7-REMEDIATION-STATUS.md)
>
> Mechanical baseline commit: `529b7081841af7e212964f359293b547c2497c88`

---

# 0. Verdict

R10 has been rerun after R1–R9 remediation.

```text
MECHANICAL ARCHITECTURE CHECK
= PASS

TARGET SEMANTIC SPOT CHECKS
= PASS

UNEXPLAINED CURRENT→TARGET MISMATCH
= 0

NEW TARGET-ARCHITECTURE CONTRADICTION
= 0

NEW NON-BLOCKING REPOSITORY/CI FINDING
= 1
```

Therefore:

```text
R10
=
PASS_WITH_NON_BLOCKING_FINDING
```

This verdict means the **target architecture corpus is internally coherent enough to enter R11 promotion review**.

It does **not** mean the production/runtime implementation already satisfies the target. Runtime migration remains owned by C6 W0→W14.

---

# 1. Mechanical rerun evidence

The permanent repository command is:

```text
npm run check:architecture
```

which executes:

```text
scripts/check-architecture-references.mjs
+
scripts/check-architecture-r10.mjs
```

The clean-HEAD GitHub Actions execution was:

```text
workflow: Architecture Reference Check
run:      33037151307
job:      98402233360
commit:   529b7081841af7e212964f359293b547c2497c88
result:   SUCCESS
```

The job reported:

```text
Architecture reference check passed:
64 Markdown files,
canonical IDs and N3 headings validated.

C7 R10 architecture audit check passed:
46 target architecture docs,
5 operational docs,
1,152 local invariant IDs,
101 C6 slice IDs.
```

The checks cover the R10 mechanical scope including:

- relative Markdown links;
- canonical file paths;
- N3 heading identity/duplication;
- ADR identities;
- GINV identities;
- OPEN identities;
- HYP identities;
- local invariant identity coverage;
- C6 execution-slice references;
- target lexical aliases resolved during R5/R7;
- operational document status metadata required by R2;
- legacy `domain-model.md` non-target warning.

This closes R4 and the mechanical half of R10 with executable CI evidence rather than manual assertion.

---

# 2. Semantic rerun rule

The semantic rerun intentionally repeats the original C7 high-risk anchors after remediation.

The test is not:

```text
DO ALL FILES USE IDENTICAL WORDING?
```

It is:

```text
DO OWNER SOURCES STILL EXPRESS
ONE COHERENT TARGET SEMANTIC
AFTER R1–R9 NORMALIZATION?
```

Owner sources remain normative for domain semantics. C4/C5/C6 are registries, cross-sections and execution governance; they do not silently override owner N2 semantics.

---

# 3. Semantic spot-check results

| ID | High-risk semantic anchor | R10 result | Governing owner sources |
|---|---|---|---|
| PASS-001 | `User ≠ Player ≠ Participant` | PASS | [`N2.02`](../contexts/N2.02-identity-players.md), [`GLOSSARY`](../GLOSSARY.md) |
| PASS-002 | `CommunityMembership ≠ CommunityPlayer` | PASS | [`N2.02`](../contexts/N2.02-identity-players.md), [`N2.03`](../contexts/N2.03-communities.md) |
| PASS-003 | Organizer is operational; Admin does not imply Organizer | PASS | [`N2.03`](../contexts/N2.03-communities.md), [`N2.16`](../security/N2.16-security-privacy-lgpd.md) |
| PASS-004 | Registration FIFO + atomic promotion + online authority | PASS | [`N2.05`](../contexts/N2.05-registration.md), [`N2.12`](../platform/N2.12-online-offline.md) |
| PASS-005 | Team Balancer consumes attributes, never Overall | PASS | [`N2.06`](../contexts/N2.06-team-formation.md), [`PRINCIPLES`](../PRINCIPLES.md) |
| PASS-006 | Rating aggregates Community profile → Global profile attribute-by-attribute | PASS | [`N2.02`](../contexts/N2.02-identity-players.md), [`Player Skill Profile ownership`](../contexts/N2.02-player-skill-profile-ownership.md) |
| PASS-007 | `Session ≠ Match ≠ Competition` | PASS | [`N2.04`](../contexts/N2.04-sessions.md), [`N2.07`](../contexts/N2.07-live-match.md), [`N2.08`](../contexts/N2.08-competitions.md) |
| PASS-008 | `Fixture ≠ Match ≠ OfficialCompetitionResult` | PASS | [`N2.07`](../contexts/N2.07-live-match.md), [`N2.08`](../contexts/N2.08-competitions.md) |
| PASS-009 | Match epoch + sequence + append event/projection + no LWW | PASS | [`N2.07`](../contexts/N2.07-live-match.md), [`N2.12`](../platform/N2.12-online-offline.md) |
| PASS-010 | factual Statistics ≠ subjective Rating/Overall | PASS | [`N2.09`](../contexts/N2.09-history-statistics.md), [`N2.02`](../contexts/N2.02-identity-players.md) |
| PASS-011 | missing/not-captured ≠ numerical zero | PASS | [`N2.02`](../contexts/N2.02-identity-players.md), [`N2.09`](../contexts/N2.09-history-statistics.md) |
| PASS-012 | Realtime is committed transport; snapshot/checkpoint recovery owns gaps | PASS | [`N2.13`](../platform/N2.13-realtime.md) |
| PASS-013 | Quick is locally authoritative until explicit one-way handoff | PASS | [`N2.12`](../platform/N2.12-online-offline.md), [`C6.05`](../execution/C6.05-W12-W14-QUICK-SYNC-RETIREMENT.md) |
| PASS-014 | shared critical mutable state is server-authoritative unless explicitly excepted | PASS | [`N2.12`](../platform/N2.12-online-offline.md), [`N2.14`](../platform/N2.14-data-architecture.md) |
| PASS-015 | critical writes use semantic Commands, server-derived actor and stable `command_id` | PASS | [`N2.15`](../platform/N2.15-api-application.md), [`N2.16`](../security/N2.16-security-privacy-lgpd.md) |
| PASS-016 | relational Postgres + source/current/snapshot/projection separation | PASS | [`N2.14`](../platform/N2.14-data-architecture.md), [`C7 R8`](../data/C7-R8-TRUTH-CLASS-NORMALIZATION.md) |
| PASS-017 | external provider effects occur after domain commit/outbox | PASS | [`N2.10`](../contexts/N2.10-notifications.md), [`N2.14`](../platform/N2.14-data-architecture.md), [`N2.17`](../platform/N2.17-reliability.md) |
| PASS-018 | account deletion does not cascade-delete justified sports history | PASS | [`N2.02`](../contexts/N2.02-identity-players.md), [`N2.16`](../security/N2.16-security-privacy-lgpd.md) |
| PASS-019 | strangler preserves one current authority per mutable aggregate/cohort | PASS | [`N2.22`](../migration/N2.22-migration-strangler.md), [`C6 Master`](../execution/C6-EXECUTION-MASTER.md) |
| PASS-020 | active execution cohorts are not migrated mid-protocol to an incompatible engine | PASS | [`N2.22`](../migration/N2.22-migration-strangler.md), [`C6 Master`](../execution/C6-EXECUTION-MASTER.md) |

No R1–R9 correction introduced a material contradiction into these anchors.

---

# 4. R5/R7 normalized contracts rechecked

The semantic rerun also verifies that the naming/ownership corrections no longer compete with another target vocabulary.

```text
Player Skill Profile
→ explicit sub-owner under N2.02

PlayerMatchStatContribution
→ canonical statistical contribution entity term

StandingsProjection
→ canonical Competition standings projection term

RevertMatchEvent
→ canonical Match correction command identity
```

Observability identifiers remain separated by purpose:

```text
command_id
→ logical mutation intent, stable across retry

request_id
→ one technical transport/server attempt

trace_id
→ distributed tracing identity

reference_id
→ safe support/user-facing reference

job_id
→ logical async work identity

release_id
→ deployed artifact/version
```

There is no universal target `correlation_id` catch-all.

Quality/governance taxonomies are also orthogonal:

```text
I0..I3
→ invariant criticality

Q0..Q3
→ QA risk / evidence depth

AP0..AP3
→ audit remediation priority
```

---

# 5. Current → Target mismatch classification

R10 requires every observed runtime mismatch to be either mapped to C6 or recorded as a new migration finding.

## 5.1 Generic synchronization still exists

```text
Current:
src/infra/supabase/syncService.ts
broad LocalSyncPayload / merge / remap / timestamp reconciliation

Classification:
EXPECTED_TRANSITION

C6 owner:
W13 generic sync retirement
W14 legacy contract/service removal

Primary slices:
XS-W13-01..07
XS-W14-01..04 and related contract gates
```

C6 explicitly requires entity-by-entity subtraction before global `syncService` deletion.

## 5.2 Broad localStorage domain persistence still exists

```text
Current:
src/storage/localStorageRepository.ts
broad domain collections in localStorage

Classification:
EXPECTED_TRANSITION

C6 owner:
W12 structured IndexedDB/local authority
W13 target sync subtraction
W14 retired localStorage contract removal
```

Primary C6.05 slices include `XS-W12-01..07`, the W13 retirement ledger and W14 key deletion gates.

## 5.3 Direct CRUD cloud services still exist

```text
Current:
legacy cloud adapters include generic select/update/upsert/soft-delete behavior

Classification:
EXPECTED_TRANSITION
```

The replacement is deliberately split rather than assigned to one generic migration slice:

```text
owner target command/query paths
→ W2..W11 according to bounded context

remove migrated entities from generic sync/read-merge paths
→ W13

remove obsolete generic service/module surfaces
→ W14 / XS-W14-02
```

C6.05 explicitly lists generic `communityCloudService` mutation methods and other legacy cloud services as W14 removal candidates only after target writer/read cutover evidence exists.

## 5.4 Legacy Session / Game / PointEvent model still exists

```text
Current:
legacy arrays/local IDs/mutable Game score/Session-level control

Classification:
EXPECTED_TRANSITION

C6 owner:
W3 normalized Session backbone
W6 target Team Formation artifacts
W7 Match V2 event/lease/projection protocol
W13 generic sync subtraction
W14 legacy schema/service contract removal
```

No active Match/Game cohort is migrated to the incompatible target protocol mid-execution.

## 5.5 `schema.sql` remains inside `supabase/migrations/`

```text
Classification:
EXPECTED_TRANSITION / W0 DATA-OPERATIONS NORMALIZATION
```

The colocated [`supabase/migrations/README.md`](../../../supabase/migrations/README.md) now states that `schema.sql` is a frozen legacy baseline segment during transition, not an independently maintained target current-schema authority.

P-036/Data/Operations normalization remains W0 implementation work.

## 5.6 Reachable legacy privileged functions still require runtime hardening review

```text
Classification:
EXPECTED_TRANSITION / W0 SECURITY HARDENING
```

Operational documentation no longer presents legacy `search_path = public` as target policy. The privileged-function inventory and W0 own runtime review/hardening/removal.

## 5.7 Authority Ledger is conceptual but not yet live

```text
Classification:
EXECUTION PREREQUISITE
NOT CURRENT TARGET CONTRADICTION
```

R9 requires a concrete, queryable/testable representation before the first slice reaches `CUTOVER_ACTIVE`.

No actual C6 authority cutover has been claimed by the documentation consolidation, so this prerequisite is not overdue today.

---

# 6. New R10 finding — `C7-F-023`

R10 discovered one repository/CI operability issue outside the target-domain architecture.

```text
path: 9router
git tree mode: 160000
type: commit
.gitmodules: absent
```

A standard checkout path attempted to treat the entry as a submodule/gitlink and failed because no corresponding submodule configuration exists.

The permanent architecture-check workflow currently performs a manual Git checkout with submodule recursion disabled so architecture validation can execute.

Classification:

```text
C7-F-023
Class: REPOSITORY_HYGIENE / CI_OPERABILITY
Priority: AP2
Status: NON_BLOCKING / CORRECTION_REQUIRED
Owner: Repository/CI Operations + Architecture Governance
```

Required repository correction is one of:

```text
A. remove the accidental/stale gitlink if 9router is not an intended submodule;

or

B. restore a valid intentional submodule declaration/configuration if it is intended.
```

After repair, CI should return to an ordinary checkout path where possible.

The current manual-checkout workaround must not become evidence that the repository shape is healthy.

### Why this does not block R11

`C7-F-023`:

- does not create two target domain authorities;
- does not change any accepted ADR/domain invariant;
- does not freeze an incorrect schema/API name;
- does not invalidate C1–C6 architecture semantics;
- is independently correctable as repository/CI hygiene.

It is therefore AP2/non-freezing and remains tracked after promotion review.

---

# 7. Open-by-design items remain open

R10 does not convert intentionally unresolved C4 items into implicit decisions.

Examples remain OPEN/HYPOTHESIS as applicable:

- exact Rating estimator/credibility model;
- exact skill rubric and solver objective weights;
- voting quorum/tie details where still open;
- Match lease TTL and offline rollout scope;
- advanced lineup/rotation/libero scope;
- public spectator policy;
- exact Competition format/auto-officialization policies;
- detailed Statistics taxonomy/sample thresholds;
- notification provider selection;
- Media quotas/retention limits;
- numeric RPO/RTO/SLO budgets;
- Redis/broker/read-replica/partitioning thresholds;
- observability/testing vendor choices.

A successful R10 does not authorize implementation to close these by convenience.

---

# 8. Promotion-gate assessment

The R11 preconditions from C7 remediation are now evaluated as:

| Gate | Result |
|---|---|
| AP0 unresolved architecture/document blockers | `0 / PASS` |
| AP1 unresolved freezing blockers | `0 / PASS` |
| EAP/N2 authority reconciliation | `PASS` |
| canonical reference checker | `PASS / CI` |
| ADR/GINV/OPEN/HYP reference integrity | `PASS / CI` |
| local invariant completeness | `PASS / 1,152 IDs` |
| C6 slice reference integrity | `PASS / 101 IDs` |
| legacy/current document classification | `PASS for audited target/operations scope` |
| schema authority documentation | `PASS`; runtime normalization remains W0 |
| privileged-function target guidance | `PASS`; runtime hardening remains W0 |
| Rating owner / naming blockers | `PASS` |
| post-C6 ADR delta | `PASS` |
| semantic high-risk rerun | `20/20 PASS` |
| unexplained Current→Target mismatch | `0` |
| non-freezing AP2 repository hygiene | `1 — C7-F-023` |

The remaining AP2 finding is compatible with R11 because canonical promotion requires the architecture/blocking ambiguity to be closed, not unrelated repository hygiene to be falsely declared absent.

---

# 9. R10 exit state

```text
R10 MACHINE AUDIT
= PASS

R10 SEMANTIC AUDIT
= PASS

RUNTIME PARITY WITH TARGET
= NOT CLAIMED

AP0
= 0

AP1 FREEZING BLOCKERS
= 0

NEW NON-BLOCKING AP2
= C7-F-023

NEXT
= R11 CANONICAL PROMOTION
```

R11 must be a deliberate promotion change. It should not silently edit statuses piecemeal, and it must preserve C4 Open/Hypothesis lifecycle plus C6 Current→Target execution obligations.