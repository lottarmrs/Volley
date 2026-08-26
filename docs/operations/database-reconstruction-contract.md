# Database Reconstruction Contract

> Status: `CURRENT-OPERATIONAL / TRANSITIONAL-TO-TARGET`
>
> Owner: `Data + Platform Operations`
>
> Last reviewed: `2026-08-26 / C7-R3`
>
> Governing target: [`N2.14-data-architecture.md`](../architecture/platform/N2.14-data-architecture.md), [`N2.21-operations-deploy.md`](../architecture/operations/N2.21-operations-deploy.md), Principle P-036 and C6 W0.

---

# 0. Purpose

This document answers one operational question unambiguously:

> How is a fresh database reconstructed, and which artifacts are authoritative?

The rule is:

```text
ONE ORDERED RECONSTRUCTION HISTORY
NOT TWO INDEPENDENT SCHEMA AUTHORITIES
```

---

# 1. Target authority

The target architecture is:

```text
VERSIONED BASELINE / MIGRATION HISTORY
        ↓
FORWARD VERSIONED MIGRATIONS
        ↓
FRESH DATABASE
```

A consolidated schema dump, when retained, is:

```text
DERIVED / GENERATED / VERIFIED
```

and never an independently edited second source of truth.

Applied production migrations are not rewritten retroactively.

---

# 2. Current repository reality

Historical repository provisioning used:

```text
supabase/migrations/schema.sql
        ↓
numbered migrations
```

and some current tests still read `schema.sql` directly.

The historical documents sometimes called `schema.sql` a **consolidated snapshot** while also using it as the **bootstrap baseline** for later migrations.

Those are different roles and created the C7 authority collision.

C7 resolves the ambiguity as follows.

---

# 3. Current transitional reconstruction contract

Until W0 completes baseline normalization:

```text
supabase/migrations/schema.sql
=
LEGACY BASELINE SEGMENT
FROZEN FOR RECONSTRUCTION COMPATIBILITY

numbered migrations after that baseline
=
FORWARD DELTA SEGMENTS
```

Therefore the current reconstruction order is one sequence:

```text
1. exact repository revision
2. apply the frozen legacy baseline segment
3. apply every required numbered forward migration in canonical order
4. run structural/security verification
5. run DB integration tests
```

`schema.sql` must **not** continue being manually edited to imitate production while simultaneously acting as the baseline.

From C7-R3 forward:

```text
DO NOT
"sync schema.sql to production" as an independent authority
```

Any change to current schema belongs in a new versioned migration.

---

# 4. Why the file is not deleted immediately

Deleting/renaming `schema.sql` now would be an implementation migration, not merely a documentation correction, because:

- existing tests read that path;
- historical provisioning assumes that baseline;
- numbered migrations have not yet been proven to replay from an empty database without it;
- a careless rename could create a false green architecture while breaking actual reconstruction.

Therefore:

```text
C7 remediation
→ remove authority ambiguity

C6 W0
→ normalize the executable baseline safely
```

---

# 5. W0 target normalization

W0 must choose and execute one reviewed implementation path.

Preferred shape:

```text
immutable versioned baseline artifact
+ forward migrations
```

with any current-state snapshot generated separately.

A likely repository layout is conceptually:

```text
supabase/
├── migrations/
│   ├── <versioned-baseline>.sql
│   ├── <forward-migration>.sql
│   └── ...
└── generated/
    └── schema.generated.sql   # optional derived artifact
```

The exact baseline timestamp/name is an implementation detail to be chosen by W0 after replay testing; C7 does not invent a filename that has not been proven.

---

# 6. Fresh-build gate

A fresh build is considered valid only if an automated or reproducible isolated-environment procedure proves:

```text
empty database
→ canonical baseline/history
→ all forward migrations
→ expected schema
→ expected RLS/grants/functions/triggers/indexes
→ DB integration suite passes
```

Required evidence includes at least:

- migration application success;
- required tables/types/functions;
- RLS enablement and policies;
- grants/revokes;
- constraints/FKs/unique indexes;
- triggers/event triggers where required;
- SECURITY DEFINER posture;
- representative semantic RPC tests.

A successful application of SQL files alone is insufficient.

---

# 7. Generated snapshot policy

If a consolidated current schema artifact is introduced after W0:

```text
source
=
reconstructed database from authoritative history

output
=
generated snapshot
```

The generated artifact must carry enough metadata to identify:

```text
source commit/release
schema generation method
generation time/tool version where relevant
```

If deterministic generation is adopted, CI should fail on stale generated output.

The generated snapshot must not be edited as the primary way to change schema.

---

# 8. Production drift policy

Production drift is a defect unless explicitly approved as an emergency action with a follow-up migration.

Normal flow:

```text
repository migration
→ reviewed deployment
→ production
```

Not:

```text
manual production SQL
→ later copy whatever changed into schema.sql
```

If emergency SQL is unavoidable:

```text
incident/change record
→ capture exact mutation
→ create forward migration immediately
→ verify repository rebuild
→ close drift finding
```

---

# 9. `schema-drift-check.md`

`docs/operations/schema-drift-check.md` is retained as historical diagnostic knowledge about comparing function bodies and discovering missing event-trigger/RLS details.

It is **not** a schema-authority synchronization procedure after C7-R3.

Its useful lesson survives:

```text
checking only function bodies
≠
checking schema integrity
```

---

# 10. Deployment ordering

For target migrations:

```text
EXPAND
→ compatible server/RPC/worker
→ compatible client/read path
→ BACKFILL / MIGRATE
→ VERIFY
→ CUTOVER
→ OBSERVE
→ CONTRACT later
```

Destructive contract steps never ride in the same assumption as an unverified client rollout.

---

# 11. Reconstruction checklist

Before any production-like rehearsal or disaster-recovery exercise:

```text
[ ] exact repository revision recorded
[ ] baseline/history source identified
[ ] no undocumented manual schema source
[ ] isolated environment created
[ ] migration sequence applied
[ ] DB/RLS/RPC verification executed
[ ] privileged-function inventory checked
[ ] expected seed/test fixtures loaded if required
[ ] semantic smoke tests pass
[ ] result/limitations recorded
```

---

# 12. Exit from transitional state

This document may change from `TRANSITIONAL-TO-TARGET` to `CURRENT-OPERATIONAL / TARGET` only after W0 proves:

```text
migration/bootstrap path from empty is automated/reproducible
legacy schema.sql bootstrap role is removed or explicitly converted into versioned baseline
no test/runbook depends on a second manual schema authority
generated snapshot, if any, is derived only
```
