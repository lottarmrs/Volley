# Canonical Architecture Manifest — Volley

> Status: `CANONICAL / R11`
>
> Owner: `Architecture Governance`
>
> Promotion date: `2026-08-27`
>
> Promotion record: [`C7-R11-CANONICAL-PROMOTION.md`](./audit/C7-R11-CANONICAL-PROMOTION.md)

---

# 0. Meaning of CANONICAL

The promoted corpus is the default governing **target architecture** for product/domain/platform decisions.

`CANONICAL` does not assert that the current production/runtime implementation already conforms. Current→Target execution remains C6 W0→W14.

# 1. Authority order

```text
PRINCIPLES / GLOSSARY
→ EAP N2 ownership and scope
→ owner N2 detailed semantics
→ ADR decision identities
→ C4 invariants / Open Decisions / Hypotheses
→ C5 cross-cutting implementation matrices
→ C6 Current→Target execution program
→ C7 audit/promotion evidence
```

When sources appear to conflict, follow the ownership/governance rules in N2.23 and reopen the contradiction rather than silently choosing an implementation-friendly interpretation.

# 2. Lifecycle preservation

Canonicalization of a registry document does not alter the lifecycle of its records.

```text
OPEN-* remains OPEN until its trigger/owner closes it.
HYP-* remains a hypothesis until validated/rejected/superseded.
TRANSITIONAL/HISTORICAL/SUPERSEDED material remains non-target evidence.
```

# 3. Runtime boundary

The following are not implied by promotion:

- C6 waves completed;
- production parity achieved;
- legacy sync/localStorage/CRUD/schema removed;
- Authority Ledger already live;
- quantitative SLO/RPO/RTO or provider choices silently decided.

# 4. Promotion evidence

R10 baseline:

```text
commit b275ef9ea7dfc2acf4ebac6985f38ca674f2c083
workflow Architecture Reference Check
run 33038116019
R10 machine PASS
R10 semantic 20/20 PASS
AP0 = 0
AP1 freezing blockers = 0
```

Promotion commit:

```text
PENDING_RECORD_AFTER_PROMOTION
```

# 5. Known non-freezing debt

`C7-F-023` (orphan `9router` gitlink) remains AP2 repository/CI hygiene and is not reclassified as solved by R11.
