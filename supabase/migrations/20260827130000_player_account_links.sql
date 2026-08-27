-- C6 XS-W2-01 — Safe account <-> Player relation expansion
--
-- Introduces an explicit PlayerAccountLink relation so account<->Player identity stops
-- being an implicit consequence of the `players.user_id` column.
--
-- WHY THE COLUMN IS NOT ENOUGH. `players.user_id` conflates four different things: that a
-- link exists, that it is currently active, where it came from, and that it may be trusted
-- as authorization. RLS reads it directly today ("Linked users can read their own player"),
-- so a stray UPDATE on that column is a privilege grant. The relation separates the fact
-- from the authority and gives every link a provenance and a status.
--
-- EXPAND ONLY. This migration adds a table and backfills it. It does NOT change any policy,
-- does NOT drop players.user_id, and does NOT move authority. The legacy column keeps
-- working exactly as before; W2 cutover is a later, separate step.
--
-- OPEN DECISIONS AND HYPOTHESES RESPECTED, NOT CLOSED:
--   HYP-ID-001 is a HYPOTHESIS, not an accepted decision: "V1 can enforce at most one
--     ACTIVE link per User and per Player". C6.01 permits initial constraints reflecting
--     the V1 assumption ONLY if documented as such, so the partial unique indexes below are
--     labelled as encoding that hypothesis. If a legitimate multi-profile requirement
--     appears (OPEN-ID-004), these indexes are what must be revisited first.
--   OPEN-ID-001 blocks the broad claim flow: the exact approval policy for a Player created
--     by a third party is undecided. So NO approve/claim RPC is created here. The status
--     model can express a link awaiting review, but nothing can promote one to ACTIVE
--     except this migration's own trustworthy backfill.
--   OPEN-ID-004 forbids multi-profile schema assumptions, so nothing here models more than
--     the single-active-link shape.

create table if not exists public.player_account_links (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,

  -- PROPOSED       a link was requested and awaits a decision
  -- ACTIVE         the link currently represents this account's sports identity
  -- NEEDS_REVIEW   provenance is ambiguous; an operator must decide (ADR-MIG-004)
  -- REJECTED       a decision was made against the link
  -- REVOKED        an ACTIVE link was deliberately ended
  status text not null default 'PROPOSED'
    check (status in ('PROPOSED', 'ACTIVE', 'NEEDS_REVIEW', 'REJECTED', 'REVOKED')),

  -- Where the link came from. Never inferred: an unknown source stays unknown.
  provenance text not null
    check (provenance in ('LEGACY_DIRECT_FIELD', 'SELF_CLAIM', 'ORGANIZER_ASSIGNED', 'MIGRATION_REVIEW')),

  -- Free-text reason accompanying a review decision, so a status change is explainable.
  review_reason text,

  created_at timestamptz not null default now(),
  activated_at timestamptz,
  reviewed_at timestamptz,

  -- An ACTIVE link must say when it became active; a decided link must say when it was
  -- decided. Otherwise "active" and "reviewed" carry no evidence.
  check (status <> 'ACTIVE' or activated_at is not null),
  check (status not in ('REJECTED', 'REVOKED') or reviewed_at is not null)
);

-- HYP-ID-001, encoded as PARTIAL uniqueness so it constrains only ACTIVE links.
--
-- Non-active rows are deliberately unconstrained: several people may each propose a claim
-- on the same Player, and recording those competing claims is the point of the review
-- workflow. Only one may win.
--
-- These two indexes are the concrete artifact to revisit if HYP-ID-001 is refuted.
create unique index if not exists player_account_links_one_active_per_user
  on public.player_account_links (user_id)
  where status = 'ACTIVE';

create unique index if not exists player_account_links_one_active_per_player
  on public.player_account_links (player_id)
  where status = 'ACTIVE';

create index if not exists player_account_links_player_idx
  on public.player_account_links (player_id, status);
create index if not exists player_account_links_review_idx
  on public.player_account_links (status, created_at)
  where status in ('PROPOSED', 'NEEDS_REVIEW');

-- ── Backfill ───────────────────────────────────────────────────────────────
-- Only an unambiguous existing link becomes ACTIVE. Ambiguity is recorded, never guessed
-- (ADR-MIG-004), and an ambiguous row lands as NEEDS_REVIEW rather than as authority.
do $$
declare
  v_run_id uuid;
begin
  if to_regclass('app_private.migration_runs') is null then
    return;
  end if;

  insert into app_private.migration_runs (name, source_release, status, started_at)
  values ('player_account_links_backfill', 'XS-W2-01', 'RUNNING', now())
  returning run_id into v_run_id;

  -- WHAT AMBIGUITY ACTUALLY EXISTS HERE.
  --
  -- `players_user_id_unique_idx` is UNIQUE on user_id where it is not null, so one account
  -- can never hold two Players. The obvious "two live players for one account" conflict is
  -- therefore unreachable, and a backfill guarding against it would be theatre.
  --
  -- The reachable ambiguity is a legacy link pointing at a SOFT-DELETED Player. The unique
  -- index covers deleted rows too, so the account is still bound to a Player it arguably no
  -- longer has. Whether that deleted Player is still the person's sports identity is not
  -- something a migration can decide, so it is quarantined rather than activated -- and,
  -- importantly, rather than silently skipped, which is what an earlier draft of this
  -- backfill did.

  -- Trustworthy: the linked Player is live.
  with trustworthy as (
    select p.id as player_id, p.user_id
    from public.players p
    where p.user_id is not null
      and p.deleted_at is null
  ),
  inserted as (
    insert into public.player_account_links
      (player_id, user_id, status, provenance, activated_at)
    select player_id, user_id, 'ACTIVE', 'LEGACY_DIRECT_FIELD', now()
    from trustworthy
    on conflict do nothing
    returning player_id, user_id
  )
  insert into app_private.migration_entity_map
    (run_id, source_type, source_id, target_type, target_id, mapping_kind, confidence, reason)
  select v_run_id, 'players.user_id', player_id::text, 'PlayerAccountLink',
         player_id::text || ':' || user_id::text, 'DERIVED', 'EXACT',
         'single live player for this account and single account for this player'
  from inserted;

  -- Ambiguous: the account is still bound to a soft-deleted Player.
  with ambiguous as (
    select p.id as player_id, p.user_id
    from public.players p
    where p.user_id is not null
      and p.deleted_at is not null
  ),
  parked as (
    insert into public.player_account_links (player_id, user_id, status, provenance, review_reason)
    select player_id, user_id, 'NEEDS_REVIEW', 'LEGACY_DIRECT_FIELD',
           'legacy link points at a soft-deleted Player; whether it is still this account''s sports identity is undecidable'
    from ambiguous
    on conflict do nothing
    returning player_id, user_id
  )
  insert into app_private.migration_anomalies (run_id, source_type, source_id, reason, details)
  select v_run_id, 'players.user_id', player_id::text,
         'legacy link points at a soft-deleted Player; active link not guessed',
         jsonb_build_object('user_id', user_id, 'player_id', player_id,
                            'open_decision', 'OPEN-ID-001')
  from parked
  on conflict do nothing;

  update app_private.migration_runs
     set status = 'COMPLETED', finished_at = now()
   where run_id = v_run_id;
end $$;

-- ── Target identity lookup ─────────────────────────────────────────────────
-- The exit gate: authorization/identity lookup for a MIGRATED player resolves through the
-- relation and never needs players.user_id.
--
-- Hardened to the XS-W0-04 target contract rather than the legacy pattern: empty
-- search_path, fully qualified objects, EXECUTE revoked from PUBLIC (ADR-SEC-003).
create or replace function public.current_user_active_player_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select l.player_id
    from public.player_account_links l
   where l.user_id = (select auth.uid())
     and l.status = 'ACTIVE'
   limit 1;
$$;

revoke all on function public.current_user_active_player_id() from public;
grant execute on function public.current_user_active_player_id() to authenticated;

-- Compatibility resolver. Prefers the target relation and falls back to the legacy column
-- only for a player that has NOT been migrated, so a not-yet-migrated row keeps working
-- while a migrated one is answered without consulting players.user_id at all.
create or replace function public.player_is_linked_to_current_user(target_player_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when exists (
      select 1 from public.player_account_links l
       where l.player_id = target_player_id and l.status = 'ACTIVE'
    )
    then exists (
      select 1 from public.player_account_links l
       where l.player_id = target_player_id
         and l.status = 'ACTIVE'
         and l.user_id = (select auth.uid())
    )
    else exists (
      select 1 from public.players p
       where p.id = target_player_id
         and p.user_id = (select auth.uid())
         and p.deleted_at is null
    )
  end;
$$;

revoke all on function public.player_is_linked_to_current_user(uuid) from public;
grant execute on function public.player_is_linked_to_current_user(uuid) to authenticated;

-- ── Access ─────────────────────────────────────────────────────────────────
alter table public.player_account_links enable row level security;

revoke all on public.player_account_links from public, anon;
grant select on public.player_account_links to authenticated;

-- A person may see their own links. Nothing here grants the ability to CREATE or promote
-- one: OPEN-ID-001 has not decided the approval policy, so no write policy is added and
-- the table stays operator/migration-writable only.
create policy "Users can read their own account links"
  on public.player_account_links
  for select
  using (user_id = (select auth.uid()));

comment on table public.player_account_links is
  'Explicit account<->Player relation (C6 XS-W2-01). Expand-only: players.user_id remains authoritative until W2 cutover.';
comment on index public.player_account_links_one_active_per_user is
  'Encodes HYP-ID-001 (one active link per account) as a V1 assumption, not a settled decision.';
