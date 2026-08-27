-- C6 XS-W0-06 — Migration provenance substrate
--
-- Makes historical/data normalization explainable: which run produced a mapping, from
-- which source, with what confidence, and what it refused to guess.
--
-- ADR-MIG-004: stable identity/provenance are preserved and ambiguous source data is never
-- guessed silently. The substrate exists so a migration can record "I could not decide"
-- as a first-class, reviewable fact instead of inventing a value.
--
-- ADR-DATA-002 places internal support tables in `app_private`, deliberately outside the
-- browser CRUD surface. Nothing here is granted to anon or authenticated: this metadata is
-- for operators and migration jobs, never for the client.
--
-- OPEN DECISIONS RESPECTED, NOT CLOSED:
--   OPEN-MIG-001  exact registry schema is still open; its trigger is "W0 implementation
--                 design" and its conservative behaviour is "persist authority/run/
--                 provenance where needed; schema can evolve". This is a working substrate,
--                 not a frozen contract.
--   OPEN-MIG-017  provenance retention period is open, so NO ttl, NO auto-prune and NO
--                 cleanup job is defined here. Rows persist until a retention decision
--                 exists.
--   OPEN-MIG-018  anomaly operator UI vs SQL/report tooling is open, so no UI surface and
--                 no API is added. Anomalies are visible and repairable through SQL.

create schema if not exists app_private;

revoke all on schema app_private from public;
revoke all on schema app_private from anon, authenticated;

-- ── migration_runs ─────────────────────────────────────────────────────────
-- One row per execution of a named migration/import job.
create table if not exists app_private.migration_runs (
  run_id uuid primary key default gen_random_uuid(),
  name text not null,
  -- Lets a re-run be recognised rather than silently duplicating a previous one.
  source_release text,
  status text not null default 'RUNNING'
    check (status in ('RUNNING', 'COMPLETED', 'FAILED', 'ABORTED')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  notes text,
  check (finished_at is null or finished_at >= started_at)
);

create index if not exists migration_runs_name_started_idx
  on app_private.migration_runs (name, started_at desc);

-- ── migration_entity_map ───────────────────────────────────────────────────
-- Source→target identity mapping. This is what makes a migrated row traceable back to the
-- legacy artifact it came from (ADR-MIG-004).
create table if not exists app_private.migration_entity_map (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references app_private.migration_runs(run_id) on delete cascade,
  source_type text not null,
  source_id text not null,
  target_type text not null,
  target_id text not null,
  -- SPLIT is the case the exit gate cares about: one legacy artifact conflating two target
  -- concepts produces more than one mapping row, each recorded explicitly.
  mapping_kind text not null
    check (mapping_kind in ('ONE_TO_ONE', 'SPLIT', 'MERGE', 'DERIVED', 'LEGACY_EVIDENCE')),
  -- Hash of the source payload as read. Lets a later run detect that the source changed
  -- underneath a mapping instead of assuming it is still valid.
  source_hash text,
  -- Confidence is NOT a skill-style score; it records how the mapping was decided.
  confidence text not null default 'EXACT'
    check (confidence in ('EXACT', 'DERIVED', 'ASSUMED')),
  reason text,
  created_at timestamptz not null default now(),
  -- Re-running the same job must not duplicate mappings.
  unique (run_id, source_type, source_id, target_type, target_id)
);

create index if not exists migration_entity_map_source_idx
  on app_private.migration_entity_map (source_type, source_id);
create index if not exists migration_entity_map_target_idx
  on app_private.migration_entity_map (target_type, target_id);

-- ── migration_anomalies ────────────────────────────────────────────────────
-- Quarantine. A source the migration refused to interpret lands here instead of being
-- guessed into the target model.
create table if not exists app_private.migration_anomalies (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references app_private.migration_runs(run_id) on delete cascade,
  source_type text not null,
  source_id text not null,
  -- What could not be decided, in operator-readable terms.
  reason text not null,
  -- Structured evidence: the candidate interpretations that were rejected, so a reviewer
  -- can see the ambiguity rather than re-deriving it.
  details jsonb not null default '{}'::jsonb,
  status text not null default 'QUARANTINED'
    check (status in ('QUARANTINED', 'UNDER_REVIEW', 'RESOLVED', 'ACCEPTED_AS_LEGACY')),
  resolution text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  -- A resolved anomaly must say how it was resolved; otherwise "resolved" means nothing.
  check (
    status in ('QUARANTINED', 'UNDER_REVIEW')
    or (resolution is not null and reviewed_at is not null)
  ),
  unique (run_id, source_type, source_id, reason)
);

create index if not exists migration_anomalies_open_idx
  on app_private.migration_anomalies (status, created_at)
  where status in ('QUARANTINED', 'UNDER_REVIEW');

-- ── migration_checkpoints ──────────────────────────────────────────────────
-- Resumable progress, so an interrupted job restarts from where it stopped rather than
-- re-processing (and re-deciding) everything.
create table if not exists app_private.migration_checkpoints (
  run_id uuid not null references app_private.migration_runs(run_id) on delete cascade,
  checkpoint_key text not null,
  position text not null,
  processed_count bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (run_id, checkpoint_key)
);

-- ── Access ─────────────────────────────────────────────────────────────────
-- Internal only. The browser roles get nothing: no select, no insert, no rpc surface.
-- GINV-SEC-001 -- knowing a UUID must grant nothing, and this metadata is not part of the
-- product API at all.
revoke all on all tables in schema app_private from public;
revoke all on all tables in schema app_private from anon, authenticated;

-- RLS is belt-and-braces here. The tables are unreachable by browser roles because the
-- schema itself is not granted, but ADR-SEC-002 treats RLS as mandatory defence in depth,
-- and a future accidental grant should still find the door locked.
alter table app_private.migration_runs enable row level security;
alter table app_private.migration_entity_map enable row level security;
alter table app_private.migration_anomalies enable row level security;
alter table app_private.migration_checkpoints enable row level security;

comment on schema app_private is
  'Internal support surface (ADR-DATA-002). Never exposed to browser roles.';
comment on table app_private.migration_entity_map is
  'Source to target identity provenance (ADR-MIG-004). Traceability for migrated rows.';
comment on table app_private.migration_anomalies is
  'Quarantine for source data a migration refused to guess (ADR-MIG-004).';
