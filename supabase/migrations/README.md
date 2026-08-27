# Supabase schema history — authority notice

> Status: `CURRENT-OPERATIONAL / TRANSITIONAL-W0`
>
> Owner: `Data + Platform Operations`
>
> Last reviewed: `2026-08-27 / C7-R10`
>
> Governing target: [`docs/operations/database-reconstruction-contract.md`](../../docs/operations/database-reconstruction-contract.md), [`N2.14-data-architecture.md`](../../docs/architecture/platform/N2.14-data-architecture.md), [`N2.21-operations-deploy.md`](../../docs/architecture/operations/N2.21-operations-deploy.md), C6 W0.

This directory currently contains two historical segments that must be interpreted as **one ordered reconstruction history**, not two independently editable schema authorities.

```text
schema.sql
=
FROZEN LEGACY BASELINE SEGMENT

numbered migration files
=
FORWARD DELTA SEGMENTS
```

Rules during the transition:

1. Do not edit `schema.sql` merely to make it resemble production or a newer migration state.
2. New schema changes use reviewed versioned migrations.
3. Do not claim that numbered migrations already replay from an empty database without the legacy baseline until W0 proves and normalizes that path.
4. A future consolidated schema snapshot, if retained, is generated/verified and never a second manually maintained authority.
5. Applied migration history is not rewritten to improve documentation aesthetics.

W0 exit target:

```text
explicit versioned baseline/history
→ forward migrations
→ fresh database reconstruction proof
→ RLS / grants / RPC / trigger verification
→ generated snapshot only if operationally useful
```

Until that exit gate passes, the filename/location `supabase/migrations/schema.sql` is legacy structure retained for compatibility; this README and the reconstruction contract define how it must be interpreted.
