# C7 R11 — Canonical Promotion Record

> Status: `R11-COMPLETE / PROMOTION-RECORD`
>
> Owner: `Architecture Governance`
>
> Promotion date: `2026-08-27`
>
> R10 evidence: [`C7-R10-RERUN.md`](./C7-R10-RERUN.md)
>
> Governing manifest: [`CANONICAL-MANIFEST.md`](../CANONICAL-MANIFEST.md)

---

# 0. Promotion decision

R10 satisfied the promotion gates: AP0 unresolved = 0, AP1 freezing blockers = 0, mechanical audit PASS, semantic audit 20/20 PASS, unexplained Current→Target mismatch = 0.

Therefore R11 deliberately promotes the audited target corpus from `DRAFT-CANONICAL` to `CANONICAL`.

This promotion means:

```text
THE PROMOTED CORPUS
IS THE GOVERNING TARGET ARCHITECTURE
```

It does not mean:

```text
PRODUCTION RUNTIME PARITY
C6 W0→W14 COMPLETE
OPEN-* CLOSED
HYP-* VALIDATED
LEGACY REMOVED
```

# 1. Promotion order

The promotion follows the audited sequence:

```text
PRINCIPLES + GLOSSARY
→ EAP
→ owner N2 chapters
→ ADR Catalog
→ C4 registries
→ C5 matrices
→ C6 execution program
→ C7 final verdict/status
```

The document-level C4 registries become canonical registries while each internal `OPEN-*` / `HYP-*` record preserves its own lifecycle state.

# 2. Explicit exclusions

R11 does not promote material explicitly classified as `TRANSITIONAL`, `HISTORICAL`, `SUPERSEDED`, audit evidence, or `NOT TARGET SOURCE OF TRUTH`.

In particular, `docs/architecture/domain-model.md` remains transitional legacy/current-model evidence.

# 3. Runtime boundary

Current runtime mismatches remain governed by C6 W0→W14. The Authority Ledger must be materialized before any real slice reaches `CUTOVER_ACTIVE`.

# 4. Non-blocking repository finding

`C7-F-023` remains AP2 / non-freezing: the orphan `9router` gitlink must be removed or restored as a valid submodule. The temporary/manual checkout workaround is not target repository health.

# 5. Evidence

Promotion baseline R10 HEAD:

```text
b275ef9ea7dfc2acf4ebac6985f38ca674f2c083
```

Promotion commit:

```text
PENDING_RECORD_AFTER_PROMOTION
```

The exact promotion commit is recorded after the promotion commit exists; the permanent R11 checker rejects the placeholder on the final branch state.
