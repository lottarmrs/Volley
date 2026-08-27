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
| R4 references + checker | NEXT | known broken links + executable checker pending |
| R5 ownership/status/naming blockers | IN-PROGRESS | Player Skill Profile owner resolved; stats/standings/observability/Match-command naming remain |
| R6 post-C6 ADR delta | OPEN | pending |
| R7 severity/fitness governance | OPEN | pending |
| R8 truth-class normalization | OPEN | pending |
| R9 live execution tracking | NOT-YET-REQUIRED | required before first CUTOVER_ACTIVE |
| R10 rerun | BLOCKED | after R4–R9 |
| R11 canonical promotion | BLOCKED | after successful rerun |

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

Duplicate N3 IDs inside one owner N2 remain a future executable reference/structure check.

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

C5 visible labels `Rating`, `Rating projection` and `Rating/display` are now interpreted as aliases for this sub-owner and should be normalized during C5 cleanup, but they no longer create an ownership ambiguity.

---

# 3. AP0 promotion state

```text
C7-F-001..C7-F-006
=
ARCHITECTURE/DOCUMENT AUTHORITY BLOCKERS ADDRESSED
```

This does **not** mean canonical promotion is allowed yet. AP1/reference/lifecycle/evidence findings remain and R10 has not rerun.

---

# 4. Next remediation batch — R4 + R5 AP1

The next batch must address:

```text
C7-F-007  broken Notifications links
C7-F-008  broken Media links
C7-F-009  PlayerMatchStatContribution naming/status
C7-F-010  StandingsProjection naming
C7-F-011  command_id/request_id/trace_id/reference taxonomy
C7-F-012  Match correction command vocabulary
C7-F-017  HYP-STAT-001 lifecycle
C7-F-019  executable reference integrity
```

After that, proceed to:

```text
R6 post-C6 ADR delta
R7 severity + fitness-function lifecycle
R8 mixed truth-class normalization
R9 execution ledger before first cutover
R10 full rerun
```
