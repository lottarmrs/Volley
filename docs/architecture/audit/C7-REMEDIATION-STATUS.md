# C7 — Remediation Status

> Status: `REMEDIATION-IN-PROGRESS`
>
> Owner: `Architecture Governance + finding owners`
>
> Last updated: `2026-08-26`
>
> Audit source: [`C7-FINDINGS-LEDGER.md`](./C7-FINDINGS-LEDGER.md)
>
> Plan: [`C7-CORRECTIONS-REQUIRED.md`](./C7-CORRECTIONS-REQUIRED.md)

---

# 0. Reading rule

The findings ledger preserves what C7 found. This file tracks what has since been remediated.

```text
ORIGINAL FINDING
≠
CURRENT REMEDIATION STATUS
```

Promotion remains blocked until the rerun gates in R10/R11 pass.

---

# 1. Remediation summary

| Step | Status | Result |
|---|---|---|
| R0 promotion freeze | DONE | corpus remains DRAFT-CANONICAL / promotion blocked |
| R1 EAP decomposition authority | DONE | EAP owns N2/scope/owner; owner N2 owns detailed N3 tree |
| R2 legacy/current document classification | PARTIAL-DONE | `domain-model.md` and destructive reset runbook visibly classified; broader banner sweep remains R10 hygiene |
| R3 operational schema/security authority | DONE-DOC / RUNTIME-W0 | reconstruction contract published; schema drift demoted to diagnostics; privileged-function inventory seed created |
| R4 references + checker | IN-PROGRESS / NOT-YET-CI-GATED | strict checker + npm command created; known N2.10/N2.11 physical link corrections and a proved clean execution remain |
| R5 ownership/status/naming blockers | DECISIONS-DONE / PROPAGATION-CLEANUP | Skill Profile owner, stat contribution, standings, correlation IDs and Match reversal command resolved; owner docs/C5 visible aliases still need mechanical cleanup where present |
| R6 post-C6 ADR delta | DONE | C6 execution constructs classified; no new ADR identity required |
| R7 severity/fitness governance | DONE / R10-LEXICAL-CHECK | I0..I3 is sole invariant severity; target vs transitional fitness lifecycle implemented |
| R8 truth-class normalization | DONE-ARCHITECTURE | one persisted artifact = one primary truth class; mixed conceptual rows decomposed before schema freeze |
| R9 live execution tracking | NOT-YET-REQUIRED | concrete Authority Ledger representation required before first CUTOVER_ACTIVE |
| R10 rerun | BLOCKED | needs R4 completion + propagation/lexical/reference execution + R9 only if cutover is approaching |
| R11 canonical promotion | BLOCKED | only after successful rerun |

---

# 2. AP0 finding status

## C7-F-001 — EAP N3 drift

```text
REMEDIATED
```

Resolution:

```text
EAP = sole N2 identity/scope/owner index
owner N2 = sole detailed N3 authority
```

Duplicate N3 IDs inside one owner N2 are checked by the new architecture reference checker once it is executed/gated.

---

## C7-F-002 — `domain-model.md` authority collision

```text
REMEDIATED
```

The document now declares itself transitional/legacy and not target source of truth.

---

## C7-F-003 — reset runbook looked like current default migration

```text
REMEDIATED
```

The runbook is historical/completed and superseded as a general migration path. N2.22 + C6 govern Current→Target migration.

---

## C7-F-004 — `schema.sql` vs migration-chain authority

```text
REMEDIATED AT DOCUMENT/AUTHORITY LEVEL
RUNTIME NORMALIZATION OWNED BY W0
```

During transition:

```text
schema.sql
=
frozen legacy baseline segment

numbered migrations
=
forward delta segments
```

It is no longer a manually synchronized second current-schema authority.

---

## C7-F-005 — SECURITY DEFINER operational target collision

```text
REMEDIATED AT DOCUMENT/POLICY LEVEL
RUNTIME HARDENING OWNED BY W0/WAVES
```

Historical `search_path = public` remains evidence only. Target hardening remains `search_path=''` + qualified references + explicit grants/revokes + trusted authorization.

---

## C7-F-006 — Rating / Skill Profile ownership

```text
REMEDIATED
```

Resolution:

```text
N2.02 — Identity / Player
└── Player Skill Profile sub-owner
```

Owned semantics:

```text
PlayerEvaluation
CommunityPlayerSkillProfile
GlobalPlayerSkillProfile
aggregation/profile versions
confidence/missing semantics
Derived Overall formula/version
profile rebuild
```

Boundaries:

```text
Community
→ evaluator authorization/context

N2.02 / Player Skill Profile
→ evaluation/profile meaning

N2.06 Team Formation
→ PlayerBalanceSnapshot + solver/candidates/TeamDraw

N2.09 Statistics
→ factual Match-derived statistics
```

`OPEN-RATING-001/002` remain open under the resolved owner; ownership resolution did not invent an estimator or credibility policy.

Evidence:

- `docs/architecture/EAP-MASTER.md`
- `docs/architecture/contexts/N2.02-player-skill-profile-ownership.md`

---

# 3. AP1 / AP2 remediation status

## C7-F-007 / C7-F-008 — broken Notifications/Media links

```text
OPEN — PHYSICAL SOURCE CORRECTION STILL REQUIRED
```

A strict checker now detects broken relative Markdown links, but the known header links in N2.10/N2.11 still need direct source correction before R4 can close.

Do not add redirect stub files merely to make the checker green; canonical links must point to the real owner documents.

---

## C7-F-009 — statistical contribution naming

```text
REMEDIATED DECISION
```

Canonical term:

```text
PlayerMatchStatContribution
```

`PlayerMatchStats` and generic `MatchStatContribution` are non-canonical aliases.

Evidence:

- `docs/architecture/governance/C7-R5-NAMING-RESOLUTIONS.md`
- `docs/architecture/GLOSSARY.md`
- `HYP-STAT-001` supported/resolved naming state

N2.09/C5 physical wording must converge during propagation cleanup before schema/API freeze.

---

## C7-F-010 — StandingsProjection naming

```text
REMEDIATED DECISION
```

Canonical term:

```text
StandingsProjection
```

Singular `StandingProjection` is a legacy/text alias only.

---

## C7-F-011 — correlation terminology

```text
REMEDIATED DECISION / OWNER-DOC PROPAGATION PENDING
```

Canonical taxonomy:

```text
command_id   logical mutating intent / stable across retry
request_id   one transport attempt
trace_id     tracing identity
reference_id safe user/support reference
job_id       logical async unit
release_id   deployed artifact/version
```

`correlation` is the relationship among signals; there is no universal target `correlation_id` catch-all.

---

## C7-F-012 — Match correction command name

```text
REMEDIATED DECISION
```

Canonical target command:

```text
RevertMatchEvent
```

`OPEN-MATCH-003` still controls broader post-finish/result-changing correction authority; naming does not grant that capability.

---

## C7-F-013 — post-C6 ADR delta

```text
REMEDIATED
```

Review artifact:

`docs/architecture/adr/C7-R6-POST-C6-ADR-DELTA.md`

Result:

```text
XS-*                 process mechanism
slice lifecycle      process mechanism
Authority Ledger     implementation mechanism of accepted authority ADRs
G0..G7               governance/release mechanism
cutover no auto-back → material semantic already owned by ADR-MIG-009
```

No new ADR identity was required.

---

## C7-F-014 — undefined Q0/Q1 invariant severity

```text
REMEDIATED AT GOVERNING SOURCE
```

Canonical invariant severity is only:

```text
I0 I1 I2 I3
```

`C6.06` has been normalized. R10 must still search the wider corpus for stray `Q0/Q1` wording and distinguish unrelated terminology if any.

---

## C7-F-015 — architecture fitness functions crystallize legacy

```text
REMEDIATED
```

Current structure:

```text
src/architecture/fitnessManifest.ts
src/architecture/importAliases.test.ts
src/architecture/legacyContracts.transitional.test.ts
```

Target and transitional assertions now have owner, protected intent, lifecycle and removal/replacement trigger.

---

## C7-F-016 — mixed truth classes

```text
REMEDIATED AT ARCHITECTURE/DATA-PLANNING LEVEL
```

Artifact:

`docs/architecture/data/C7-R8-TRUTH-CLASS-NORMALIZATION.md`

Rule:

```text
ONE PERSISTED ARTIFACT
HAS ONE PRIMARY TRUTH CLASS
```

Current/history or source/projection concepts must map to separate physical artifacts/pointers/revisions rather than one ambiguous mutable row.

---

## C7-F-017 — HYP-STAT-001 lifecycle

```text
REMEDIATED
```

The C5/C7 naming review supported `PlayerMatchStatContribution`; the hypothesis registry now records the outcome rather than leaving the trigger consumed but status unvalidated.

---

## C7-F-018 — Authority Ledger not yet materialized

```text
OPEN BEFORE FIRST CUTOVER — NOT A DESIGN BLOCKER TODAY
```

R9 remains mandatory before the first slice reaches `CUTOVER_ACTIVE`.

---

## C7-F-019 — executable reference integrity

```text
PARTIALLY REMEDIATED
```

Created:

```text
scripts/check-architecture-references.mjs
npm run check:architecture
```

Checks include:

```text
relative Markdown file links
canonical ADR refs
GINV refs
OPEN refs
HYP refs
EAP canonical file paths
duplicate N3 heading IDs per N2
```

It is deliberately **not yet wired into CI** because this session could not execute a repository checkout/networked validation and known physical links remain unfixed. R4 closes only after a clean run and CI gate installation.

---

# 4. Promotion state

AP0 architecture/document authority blockers have been addressed.

However:

```text
CANONICAL PROMOTION
=
STILL BLOCKED
```

because at minimum the following remain before R10/R11:

```text
1. physically repair N2.10/N2.11 known canonical links;
2. execute strict architecture checker and fix all reported issues;
3. wire clean checker into CI;
4. propagate R5 normalized vocabulary into remaining owner docs/C5 cells;
5. run wider lexical check for undefined Q0/Q1/correlation aliases;
6. perform R10 semantic rerun;
7. materialize R9 Authority Ledger before any actual CUTOVER_ACTIVE slice (if implementation reaches that point before promotion rerun).
```

R9 is a cutover prerequisite, not a reason to block W0 safety/tooling work.

---

# 5. Next action

The next remediation batch should finish **R4 physical reference repair + execution**, then perform the remaining **R5 propagation cleanup**. After that the corpus is ready for a focused R10 machine/semantic audit rerun, except for R9 which is tied to first real authority cutover.
