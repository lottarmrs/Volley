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

The findings ledger is the immutable-ish audit record of what C7 found.

This file tracks remediation state.

```text
FOUNDING FINDING
≠
CURRENT REMEDIATION STATUS
```

Promotion remains blocked until the rerun gates in R10/R11 pass.

---

# 1. Remediation summary

| Step | Status | Result |
|---|---|---|
| R0 promotion freeze | DONE | corpus remains DRAFT-CANONICAL / promotion blocked |
| R1 EAP decomposition authority | DONE | EAP now owns N2/scope/owner only; owner N2 owns detailed N3 tree |
| R2 legacy/current document classification | PARTIAL-DONE | `domain-model.md` and destructive reset runbook visibly classified; wider corpus banner sweep still belongs to R10 hygiene check |
| R3 operational schema/security authority | DONE-DOC / RUNTIME-W0 | reconstruction contract published; schema drift doc demoted to diagnostics; reset security posture marked historical; privileged-function inventory seed created |
| R4 references + checker | NEXT | not started in this remediation batch |
| R5 ownership/status/naming blockers | OPEN | Rating owner and naming/taxonomy findings remain |
| R6 post-C6 ADR delta | OPEN | pending |
| R7 severity/fitness governance | OPEN | pending |
| R8 truth-class normalization | OPEN | pending |
| R9 live execution tracking | NOT-YET-REQUIRED | required before first CUTOVER_ACTIVE |
| R10 rerun | BLOCKED | after R4–R9 |
| R11 canonical promotion | BLOCKED | after successful rerun |

---

# 2. Finding status

## C7-F-001 — EAP N3 drift

```text
REMEDIATED
```

Resolution:

```text
EAP = sole N2 identity/scope/owner index
owner N2 = sole detailed N3 authority
```

The duplicated manually edited N3 trees were removed from EAP rather than synchronized one more time.

Evidence:

- `docs/architecture/EAP-MASTER.md`

Remaining executable guard belongs to R4: duplicate N3 IDs inside owner N2 files should be caught mechanically.

---

## C7-F-002 — `domain-model.md` authority collision

```text
REMEDIATED
```

The document now declares:

```text
TRANSITIONAL / LEGACY CURRENT-MODEL REFERENCE
NOT TARGET SOURCE OF TRUTH
```

and preserves legacy statements only as Current→Target evidence.

---

## C7-F-003 — reset runbook looked like current default migration

```text
REMEDIATED
```

The runbook now declares:

```text
HISTORICAL / COMPLETED RUNBOOK
SUPERSEDED AS GENERAL MIGRATION PATH
```

and points to N2.22 + C6 W0–W14 as the current migration authority.

A future destructive reset requires a new explicit exception/break-glass review.

---

## C7-F-004 — `schema.sql` vs migration-chain authority

```text
REMEDIATED AT DOCUMENT/AUTHORITY LEVEL
RUNTIME NORMALIZATION OWNED BY W0
```

Resolution:

```text
schema.sql
=
frozen legacy baseline segment during transition
NOT manually maintained current-schema authority

forward numbered migrations
=
delta history
```

Target W0 will normalize this into an explicit versioned baseline/history with any consolidated snapshot generated separately.

Evidence:

- `docs/operations/database-reconstruction-contract.md`
- `docs/operations/schema-drift-check.md`

No claim is made that the numbered migrations already replay from an empty DB without the legacy baseline; that must be proven by W0.

---

## C7-F-005 — SECURITY DEFINER operational target collision

```text
REMEDIATED AT DOCUMENT/POLICY LEVEL
RUNTIME HARDENING OWNED BY W0/WAVES
```

The historical `search_path = public` posture is no longer presented as target policy.

Target remains:

```text
SECURITY DEFINER
SET search_path = ''
fully-qualified references
explicit grants/revokes
trusted actor/capability checks
```

An inventory seed now records known privileged/security-sensitive functions and requires mechanical W0 enumeration before high-risk cutover.

Evidence:

- `docs/operations/privileged-function-inventory.md`
- historical reset runbook C7 banner

---

## C7-F-006 — Rating / Skill Profile ownership

```text
OPEN — NEXT AP0
```

Do not freeze Rating/Skill Profile schema/API ownership yet.

The next remediation step must choose one explicit owner/sub-owner and update EAP/C5/C4/ADR relationships consistently.

---

# 3. Current promotion gate

```text
AP0 remediation progress
=
F001..F005 addressed
F006 open
```

Therefore:

```text
CANONICAL PROMOTION
=
STILL BLOCKED
```

Implementation work allowed remains limited by C7 R0:

```text
W0 safety/test/tooling
pure non-conflicting W1 corrections
prototypes/shadow work that do not silently close OPEN decisions
```

---

# 4. Next action

```text
R5/AP0 first:
resolve C7-F-006 Rating / Skill Profile owner

then R4/R5 AP1 consistency:
broken links
stat contribution naming
StandingsProjection naming
observability ID taxonomy
Match correction command name
```

R4 reference checker should be implemented before final rerun so the same class of link/index drift becomes executable evidence rather than another manual audit.
