# C7 — Remediation Status

> Status: `R10-PASS / READY-FOR-R11`
>
> Owner: `Architecture Governance + finding owners`
>
> Last updated: `2026-08-27`
>
> Audit source: [`C7-FINDINGS-LEDGER.md`](./C7-FINDINGS-LEDGER.md)
>
> Plan: [`C7-CORRECTIONS-REQUIRED.md`](./C7-CORRECTIONS-REQUIRED.md)
>
> R10 evidence: [`C7-R10-RERUN.md`](./C7-R10-RERUN.md)

---

# 0. Reading rule

The findings ledger preserves what the original C7 audit found. This file tracks the **current remediation state**.

```text
ORIGINAL FINDING
≠
CURRENT REMEDIATION STATUS
```

Likewise:

```text
TARGET ARCHITECTURE READY FOR PROMOTION
≠
PRODUCTION RUNTIME ALREADY MIGRATED
```

Runtime Current→Target work remains owned by C6 W0→W14.

---

# 1. Remediation summary

| Step | Current status | Result |
|---|---|---|
| R0 promotion freeze | DONE | no premature piecemeal canonical promotion occurred |
| R1 EAP decomposition authority | DONE | EAP owns N2 identity/scope/owner; owner N2 owns detailed N3 decomposition |
| R2 legacy/current classification | DONE for audited scope | domain model + operations documents have explicit lifecycle/authority banners |
| R3 operational schema/security authority | DONE-DOC / RUNTIME-W0 | reconstruction authority and privileged-function posture clarified; runtime hardening remains C6 W0 |
| R4 references + checker | DONE | physical links repaired; permanent CI architecture check passes on clean HEAD |
| R5 ownership/status/naming blockers | DONE | Skill Profile owner, stat contribution, standings, observability IDs and Match reversal vocabulary normalized |
| R6 post-C6 ADR delta | DONE | C6 execution mechanisms classified; no unowned material post-C3 decision remains |
| R7 severity/fitness governance | DONE | `I0..I3`, `Q0..Q3`, `AP0..AP3` separated; transitional fitness lifecycle explicit |
| R8 truth-class normalization | DONE-ARCHITECTURE | one persisted artifact has one primary truth class before physical schema freeze |
| R9 execution tracking | SATISFIED-AS-PREREQUISITE | concrete Authority Ledger implementation still required before first `CUTOVER_ACTIVE`; no cutover claimed yet |
| R10 machine + semantic rerun | DONE / PASS-WITH-NON-BLOCKING-FINDING | mechanical CI green; 20/20 semantic anchors pass; one AP2 repository-hygiene finding added |
| R11 canonical promotion | NEXT | promotion may proceed as a deliberate reviewable change |

---

# 2. Mechanical R10 evidence

Permanent command:

```text
npm run check:architecture
```

Clean-HEAD proof:

```text
workflow: Architecture Reference Check
run:      33037151307
job:      98402233360
commit:   529b7081841af7e212964f359293b547c2497c88
result:   SUCCESS
```

Reported checks:

```text
64 Markdown files
canonical IDs and N3 headings validated
46 target architecture docs
5 operational docs
1,152 local invariant IDs
101 C6 slice IDs
```

Therefore:

```text
R4 = CLOSED
R10 MECHANICAL = PASS
```

---

# 3. AP0 finding status

| Finding | Current status | Resolution |
|---|---|---|
| C7-F-001 EAP N3 drift | `REMEDIATED` | EAP N2 authority + owner-N2 detailed decomposition rule, mechanically checked |
| C7-F-002 legacy domain-model authority | `REMEDIATED` | explicitly transitional / not target source of truth |
| C7-F-003 reset runbook authority | `REMEDIATED` | historical/completed; C6/N2.22 are current migration authority |
| C7-F-004 schema authority collision | `REMEDIATED-DOC / W0-RUNTIME` | migration/reconstruction contract clarified; `schema.sql` legacy-baseline semantics explicit |
| C7-F-005 SECURITY DEFINER operational collision | `REMEDIATED-DOC / W0-RUNTIME` | target hardening guidance corrected; privileged-function inventory owns runtime work |
| C7-F-006 Rating/Skill ownership | `REMEDIATED` | Player Skill Profile is explicit N2.02 sub-owner |

```text
UNRESOLVED AP0
= 0
```

---

# 4. AP1 finding status

| Finding | Current status | Resolution |
|---|---|---|
| C7-F-007 Notifications links | `REMEDIATED` | physical canonical links repaired and CI checked |
| C7-F-008 Media links | `REMEDIATED` | physical canonical links repaired and CI checked |
| C7-F-009 statistical contribution naming | `REMEDIATED` | canonical `PlayerMatchStatContribution` |
| C7-F-010 standings naming | `REMEDIATED` | canonical `StandingsProjection` |
| C7-F-011 observability correlation taxonomy | `REMEDIATED` | command/request/trace/reference/job/release IDs separated by purpose |
| C7-F-012 Match correction command | `REMEDIATED` | canonical `RevertMatchEvent` |
| C7-F-013 post-C6 ADR delta | `REMEDIATED` | C6 process mechanisms vs material ADR decisions explicitly classified |
| C7-F-015 legacy fitness lifecycle | `REMEDIATED` | TARGET vs TRANSITIONAL tests + owner/removal metadata |
| C7-F-016 mixed truth classes | `REMEDIATED-ARCHITECTURE` | physical artifacts must each have one primary truth class |
| C7-F-017 HYP-STAT-001 lifecycle | `REMEDIATED` | naming review outcome propagated to registry |
| C7-F-018 Authority Ledger live artifact | `PREREQUISITE-BEFORE-CUTOVER` | not overdue; must materialize before first `CUTOVER_ACTIVE` |

`C7-F-018` is no longer a promotion/freezing blocker because no authority cutover is being claimed by C1–C7 documentation work.

```text
UNRESOLVED AP1 FREEZING BLOCKERS
= 0
```

---

# 5. AP2/AP3 status

## C7-F-014 — Q/I severity ambiguity

```text
REMEDIATED
```

Canonical separation:

```text
I0..I3
→ invariant criticality

Q0..Q3
→ QA risk / evidence depth

AP0..AP3
→ audit remediation priority
```

These dimensions are orthogonal and the R10 checker rejects ambiguous fusion language in target sources.

## C7-F-019 — executable reference integrity

```text
REMEDIATED
```

Architecture reference/R10 checks are permanent CI behavior and passed on clean HEAD.

## C7-F-020 — platform-role vocabulary ambiguity

```text
REMEDIATED-DOC / LEGACY-RUNTIME-MAY-REMAIN
```

`master`/`programmer` vocabulary is explicitly platform/staff authorization where retained and is never Community OWNER/ADMIN/MEMBER/ORGANIZER inheritance.

## C7-F-021 — legacy status banner convention

```text
REMEDIATED FOR AUDITED ARCHITECTURE/OPERATIONS SCOPE
```

The permanent R10 checker verifies required operational metadata for the audited operations corpus.

## C7-F-022 — `schema.sql` location/source ambiguity

```text
REMEDIATED-DOC / W0-RUNTIME-NORMALIZATION
```

The colocated migrations README makes the frozen legacy-baseline status explicit. Physical normalization/tooling remains Data+Operations W0 work.

## C7-F-023 — orphan `9router` gitlink

```text
NEW IN R10
AP2
NON-BLOCKING / CORRECTION_REQUIRED
```

Repository tree evidence:

```text
9router
mode = 160000
type = commit
.gitmodules = absent
```

Impact:

- standard checkout/submodule-aware tooling can fail;
- CI portability is reduced;
- the architecture workflow currently uses manual checkout with submodule recursion disabled.

Required correction:

```text
remove stale/accidental gitlink
OR
restore a valid intentional submodule declaration
```

Then return CI to ordinary checkout semantics where possible.

This is repository/CI hygiene, not a target-domain architecture contradiction, so it does not freeze R11.

---

# 6. Current → Target runtime mismatches

The runtime still contains expected transition mechanisms. R10 verified that they are not unexplained architecture drift.

| Current mismatch | Classification | C6 owner |
|---|---|---|
| broad `syncService` / LocalSyncPayload reconciliation | `EXPECTED_TRANSITION` | W13 entity-by-entity retirement + W14 contract removal |
| broad domain persistence in localStorage | `EXPECTED_TRANSITION` | W12 IndexedDB/local authority + W13/W14 retirement |
| generic/direct CRUD cloud adapters | `EXPECTED_TRANSITION` | bounded-context target waves W2–W11, then W13/W14 removal |
| legacy Session/Game/Point schema and control | `EXPECTED_TRANSITION` | W3/W6/W7, then W13/W14 |
| `schema.sql` legacy baseline segment | `EXPECTED_TRANSITION` | W0 Data/Operations normalization |
| privileged functions needing runtime hardening | `EXPECTED_TRANSITION` | W0 Security/Data/Operations |
| Authority Ledger not yet live | `EXECUTION_PREREQUISITE` | before first `CUTOVER_ACTIVE` |

```text
UNEXPLAINED CURRENT→TARGET MISMATCH
= 0
```

---

# 7. Semantic R10 result

The full semantic evidence is in [`C7-R10-RERUN.md`](./C7-R10-RERUN.md).

Result:

```text
20/20 HIGH-RISK SEMANTIC ANCHORS
= PASS
```

This includes identity separation, Organizer/governance, Registration FIFO, hierarchical Rating, no Overall in balancing, Session/Match/Competition boundaries, Match sequence/epoch/reconciliation, Stats vs Rating, offline authority, Realtime role, schema/data authority, security posture, history retention and strangler authority transfer.

No R1–R9 remediation introduced a new target contradiction.

---

# 8. Promotion state

```text
AP0 OPEN
= 0

AP1 FREEZING BLOCKERS
= 0

MECHANICAL REFERENCE / LEXICAL CHECK
= PASS

SEMANTIC R10
= PASS

OPEN/HYP LIFECYCLE
= COHERENT / INTENTIONALLY UNRESOLVED ITEMS REMAIN OPEN

NEW AP2 NON-FREEZING FINDING
= C7-F-023
```

Therefore:

```text
R10
= DONE / PASS_WITH_NON_BLOCKING_FINDING

R11
= READY TO BEGIN
```

The corpus remains `DRAFT-CANONICAL` until R11 performs one deliberate promotion review/change.

---

# 9. Next action

R11 should promote the corpus in a reviewable sequence:

```text
1 PRINCIPLES / GLOSSARY
2 EAP
3 owner N2 chapters
4 ADR catalog
5 C4 registries
6 C5 matrices
7 C6 execution program
8 C7 verdict/status
```

R11 must preserve:

- all intentional OPEN/HYPOTHESIS states;
- transitional/current evidence labels;
- C6 runtime-migration obligations;
- `C7-F-023` as tracked AP2 repository hygiene;
- the rule that canonical target status does not assert production parity.