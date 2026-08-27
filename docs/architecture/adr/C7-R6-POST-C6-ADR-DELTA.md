# C7 R6 — Post-C6 ADR Delta Review

> Status: `REVIEW-COMPLETE / NO-NEW-ADR-IDENTITY-REQUIRED`
>
> Owner: `Architecture Governance + Migration + Operations`
>
> Finding addressed: `C7-F-013`
>
> Sources: [`ADR-CATALOG.md`](./ADR-CATALOG.md), [`C6-EXECUTION-MASTER.md`](../execution/C6-EXECUTION-MASTER.md), [`C6.06-RELEASE-GATES-TRACEABILITY.md`](../execution/C6.06-RELEASE-GATES-TRACEABILITY.md).

---

# 0. Review rule

C3 canonicalized material architecture decisions available through C2. C6 was written later and introduced additional execution vocabulary.

C7 therefore asks, for each post-C3 construct:

```text
Is this a new material architecture decision?

or

Is it an execution/governance mechanism implementing an ADR already accepted?
```

A process mechanism does not receive a new ADR number merely because it is normative for execution.

---

# 1. Result

```text
NEW MATERIAL DECISION REQUIRING A NEW ADR ID
=
NONE IDENTIFIED IN THE REVIEWED C6 CONSTRUCTS
```

C6 introduces important normative process vocabulary, but its material semantics were already accepted by the C3 Migration/Operations/Governance ADR families.

This review therefore **does not create ADR-MIG-010 merely to mirror C6 terminology**.

---

# 2. Execution Slice `XS-*`

Classification:

```text
PROCESS_MECHANISM
```

Purpose:

- stable execution/tracking unit;
- groups schema/application/client/telemetry/evidence for one bounded migration slice;
- creates traceability from implementation to architecture.

Material decision already governing it:

```text
ADR-MIG-002
Migration cuts vertical capabilities/cohorts and persists authority state.
```

Supporting governance:

```text
ADR-GOV-008
architecture-relevant changes are reviewable/versioned repository knowledge
```

Therefore:

```text
XS-W4-03
```

is an execution identity, not an architecture-decision identity.

---

# 3. Slice lifecycle

C6 lifecycle:

```text
PLANNED
→ EXPANDED
→ SHADOWING
→ CUTOVER_READY
→ CUTOVER_ACTIVE
→ VERIFIED
→ LEGACY_WRITE_DISABLED
→ LEGACY_READ_DISABLED
→ CONTRACT_ELIGIBLE
→ CONTRACTED
```

Classification:

```text
PROCESS_MECHANISM
```

The material semantics behind the lifecycle are already accepted by:

```text
ADR-MIG-003
expand/shadow/compatibility around one authority

ADR-MIG-009
contract/removal is a separate verified phase

ADR-OPS-010
operational rigor scales with risk and includes verification
```

The exact names of the execution states may evolve without superseding those ADRs, provided their semantics remain intact.

---

# 4. Authority Ledger

Classification:

```text
IMPLEMENTATION / OPERATIONS MECHANISM
OF AN ALREADY-ACCEPTED MATERIAL DECISION
```

The material architecture decision is not “use a table called Authority Ledger”.

The material decision is:

```text
one aggregate/cohort has one current authority
+
authority transfer is explicit/persisted/testable
+
flag rollback cannot silently resurrect stale legacy authority
```

This is already accepted by:

```text
ADR-MIG-001
ADR-MIG-002
ADR-MIG-009
GINV-AUTH-001
```

Therefore C6 is free to implement the ledger as reviewed repository manifest, DB-backed migration metadata, configuration + telemetry, or another mechanism that satisfies the invariant.

Choosing the concrete representation later does not require a new ADR unless it introduces a material platform/authority/security trade-off.

---

# 5. `G0..G7` release/cutover gates

Classification:

```text
PROCESS_MECHANISM / GOVERNANCE FITNESS MODEL
```

They operationalize existing architecture requirements:

```text
G0 architecture/open-decision readiness
G1 additive schema/contract
G2 owner-layer correctness
G3 compatibility/migration
G4 cutover readiness
G5 post-cutover verification
G6 legacy retirement
G7 destructive contract/removal
```

Material sources already accepted:

```text
ADR-MIG-001..009
ADR-OPS-003..010
ADR-GOV-004
ADR-GOV-008
ADR-GOV-009
```

The gate numbering itself is not a product architecture decision.

A later refinement such as splitting G2 into security and concurrency sub-gates does not need ADR supersession unless it weakens/changes the underlying accepted constraint.

---

# 6. `CUTOVER_ACTIVE` semantics

C6 says that after authority cutover:

```text
feature flag OFF
≠
automatic return to legacy authority
```

Classification:

```text
MATERIAL SEMANTIC
ALREADY ACCEPTED
```

Canonical owner:

```text
ADR-MIG-009
```

Therefore C6 did not create an untracked new decision here; it concretized an existing Migration ADR.

---

# 7. New-resource-first cohort preference

C6 recommends:

```text
1 new resources
2 eligible inactive/draft resources
3 historical import
4 ambiguous data after review
```

Classification:

```text
EXECUTION STRATEGY DEFAULT
```

Material protections already accepted:

```text
ADR-MIG-002 vertical/cohort migration
ADR-MIG-004 preserve provenance / never guess
ADR-MIG-005 no active Match protocol migration initially
```

The preference can be adapted per owner context when evidence requires, without changing those ADRs.

A future architecture proposal that mandates cross-context live in-place migration would conflict with accepted decisions and require ADR review.

---

# 8. PR traceability block

Classification:

```text
PROCESS TEMPLATE
```

Suggested fields such as:

```text
C6 Slice
Authority change
Schema phase
ADRs
GINVs
Open Decisions
Evidence
Telemetry
Rollback/forward-fix
```

implement `ADR-GOV-004/008` traceability and do not constitute independent architecture decisions.

---

# 9. Decision threshold for future C6 changes

A future C6 edit **does require ADR review** when it proposes, for example:

```text
allow two authoritative writers during migration
restore legacy authority automatically on flag rollback
migrate active Match between incompatible protocols in-place
remove legacy contract before read/write dependency evidence
replace provenance/anomaly handling with silent guessing
allow destructive reset as default migration strategy
```

A future C6 edit usually **does not require a new ADR** when it only changes:

```text
slice numbering
execution-state labels
template/checklist layout
manifest representation
batch grouping
which PR carries a non-semantic step
```

provided accepted invariants/ADRs remain unchanged.

---

# 10. Traceability matrix

| C6 construct | Classification | Canonical material decision |
|---|---|---|
| `XS-*` Execution Slice | PROCESS_MECHANISM | `ADR-MIG-002`, `ADR-GOV-008` |
| slice lifecycle | PROCESS_MECHANISM | `ADR-MIG-003`, `ADR-MIG-009`, `ADR-OPS-010` |
| Authority Ledger | IMPLEMENTATION MECHANISM | `ADR-MIG-001`, `ADR-MIG-002`, `ADR-MIG-009`, `GINV-AUTH-001` |
| `G0..G7` | GOVERNANCE/RELEASE MECHANISM | `ADR-MIG-*`, `ADR-OPS-*`, `ADR-GOV-004/008/009` |
| cutover does not auto-revert authority | MATERIAL / ALREADY ACCEPTED | `ADR-MIG-009` |
| new-resource-first cohort preference | EXECUTION DEFAULT | `ADR-MIG-002/004/005` |
| PR traceability block | PROCESS TEMPLATE | `ADR-GOV-004/008` |

---

# 11. C7-F-013 exit criteria

```text
post-C3 constructs reviewed                = YES
process vs material classification         = YES
material semantics mapped to accepted ADR  = YES
untracked material decision discovered     = NO
new ADR identity required                  = NO
```

`C7-F-013` is therefore remediated.
