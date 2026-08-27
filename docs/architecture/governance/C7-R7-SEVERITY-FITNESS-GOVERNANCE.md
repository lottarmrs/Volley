# C7 R7 — Invariant Severity + Architecture Fitness Governance

> Status: `DRAFT-CANONICAL / C7-R7`
>
> Owner: `Architecture Governance + QA + Migration`
>
> Findings addressed: `C7-F-014`, `C7-F-015`

---

# 0. Decisions

## Invariant severity

Canonical invariant criticality remains exclusively:

```text
I0
I1
I2
I3
```

Meaning and ownership remain in C4.

The accidental `Q0/Q1` notation found in C6 is **not** a synonym and must not survive as an architecture-severity vocabulary.

Audit priority remains independently:

```text
AP0
AP1
AP2
AP3
```

These taxonomies answer different questions:

```text
I0..I3
→ how critical is preserving an invariant?

AP0..AP3
→ how urgently must an audit finding be remediated?
```

Do not infer a numerical mapping such as `AP0 = I0`.

---

# 1. Fitness function lifecycle

Architecture fitness functions are executable constraints with lifecycle, not timeless truths merely because they are tests.

Every architecture fitness function must expose or be traceable to:

```text
ID
owner
protected intent / invariant
lifecycle
removal or replacement trigger
```

Canonical lifecycle classes:

```text
TARGET
TRANSITIONAL
LEGACY
```

## TARGET

Protects a target architecture boundary expected to survive the current migration.

Removing it requires:

```text
replacement evidence
or
architecture change review
```

## TRANSITIONAL

Protects/records a Current→Target migration assumption while the legacy artifact still legitimately exists.

A passing transitional test means:

```text
the legacy dependency is still explicit
```

not:

```text
the legacy dependency should survive forever
```

It requires a C6 removal/replacement trigger.

## LEGACY

Historical-only test/contract not needed by supported runtime or migration safety.

It should not remain a permanent CI gate; archive/remove according to governance.

---

# 2. Current implementation split

C7 identified `src/architecture/importAliases.test.ts` as mixing two categories.

It has now been decomposed conceptually into:

```text
src/architecture/importAliases.test.ts
→ TARGET boundary fitness tests

src/architecture/legacyContracts.transitional.test.ts
→ TRANSITIONAL Current→Target assertions

src/architecture/fitnessManifest.ts
→ owner / lifecycle / protected intent / removal trigger
```

Target tests no longer need `LocalSyncPayload` or `Session.selectedPlayerIds/teamIds` merely to prove module boundaries.

The legacy contracts remain explicitly asserted only because C6 W3/W6/W13/W14 still needs them to exist during the current migration window.

---

# 3. Current fitness records

Initial manifest records:

```text
AF-TARGET-001  TypeScript architecture alias boundary
AF-TARGET-002  shared UI boundary
AF-TARGET-003  Supabase/provider infra boundary
AF-TARGET-004  domain-oriented shared contract modules

AF-TRANS-001   generic sync exists until W13/W14 retirement
AF-TRANS-002   Session selectedPlayerIds/teamIds exist until W3/W6/W14 retirement
```

The manifest is intentionally small now. Future architecture tests should add metadata when they become normative fitness functions rather than creating unowned one-off architecture assertions.

---

# 4. Removal rule

A transitional fitness assertion is removed **because its removal condition became true**, never merely because it started failing during target implementation.

Example:

```text
AF-TRANS-001 fails because syncService was deleted
```

Correct response is not automatically “fix the test”.

Check:

```text
W13 target writes removed from generic sync?
W13 target reads removed?
telemetry proves no supported dependency?
W14 contract gate passed?
```

If yes:

```text
remove transitional fitness record/test
+
record contract evidence
```

If no:

```text
syncService deletion was premature
```

---

# 5. No legacy expansion

Transitional tests must never be used as justification for new legacy dependencies.

```text
LEGACY ARTIFACT EXISTS
+
TRANSITIONAL TEST PASSES
≠
NEW CODE MAY USE IT
```

Once target replacement exists/has accepted migration direction:

```text
new target code
MUST NOT expand
syncService / global LocalSyncPayload / selectedPlayerIds / teamIds authority
```

This remains governed by `ADR-MIG-007`, `ADR-GOV-007` and the legacy-isolation principles.

---

# 6. CI behavior

TARGET and TRANSITIONAL fitness tests may both be blocking in CI during migration, but their failure semantics differ.

```text
TARGET fails
→ likely target architecture erosion

TRANSITIONAL fails
→ inspect whether planned migration removal gate was reached
```

A future fitness-test reporter may surface lifecycle metadata explicitly, but no specialized tool is required now.

---

# 7. C7 exit assessment

```text
C7-F-014 undefined Q0/Q1 severity
→ canonical decision resolved; C6 gate source normalized to I0/I1

C7-F-015 fitness test freezes legacy without lifecycle
→ architecture test split + executable manifest + removal triggers added
```

A final R10 lexical/reference rerun must still confirm no stray architecture-critical `Q0/Q1` use remains elsewhere before promotion.
