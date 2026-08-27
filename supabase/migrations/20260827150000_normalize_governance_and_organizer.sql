-- C6 XS-W2-03 — Normalize governance roles and Organizer responsibility
--
-- GINV-CAP-001: Organizer is an OPERATIONAL responsibility, not a governance rank.
-- GINV-CAP-002: Admin/Owner does not silently inherit operational or Match/Competition
-- authority.
--
-- WHAT THE LEGACY MODEL GETS WRONG. community_role_capabilities today maps:
--
--   organizador -> manage_sessions          (an operational duty modelled as a rank)
--   admin       -> manage_evaluations       (governance silently granting an operational
--                                            capability, which GINV-CAP-002 forbids)
--
-- The target separates the two axes: a governance_role says what you may decide ABOUT the
-- community, a responsibility says what you may DO in it. Neither implies the other.
--
-- EXPAND ONLY for the legacy tables: community_role_capabilities and community_members are
-- untouched and keep working. This narrows community_memberships, which XS-W2-02 created
-- days ago and which nothing reads yet.

-- ── Governance is three ranks, nothing more ────────────────────────────────
-- moderator and organizador leave the governance axis entirely.
alter table public.community_memberships
  drop constraint if exists community_memberships_role_check;

alter table public.community_memberships
  add constraint community_memberships_role_check
  check (role in ('owner', 'admin', 'member'));

comment on column public.community_memberships.role is
  'Governance rank only: OWNER | ADMIN | MEMBER. Operational duties live in community_responsibilities (GINV-CAP-001).';

-- ── Operational responsibilities ───────────────────────────────────────────
create table if not exists public.community_responsibilities (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,

  -- Only ORGANIZER is assigned by this slice. Match control eligibility and competition
  -- administration are named by C6.01 as capabilities but are owned by W7/W8; inventing
  -- assignments for them here would be guessing at policy those waves have not set.
  responsibility text not null check (responsibility in ('ORGANIZER')),

  assigned_at timestamptz not null default now(),
  assigned_by uuid references public.profiles(id) on delete set null,
  revoked_at timestamptz,

  unique (community_id, user_id, responsibility)
);

create index if not exists community_responsibilities_active_idx
  on public.community_responsibilities (community_id, responsibility)
  where revoked_at is null;

-- ── Migration of legacy roles ──────────────────────────────────────────────
do $$
declare
  v_run_id uuid;
begin
  if to_regclass('app_private.migration_runs') is null then
    return;
  end if;

  insert into app_private.migration_runs (name, source_release, status)
  values ('normalize_governance_and_organizer', 'XS-W2-03', 'RUNNING')
  returning run_id into v_run_id;

  -- `organizador` is an EXPLICIT operational organizer. It becomes a MEMBER on the
  -- governance axis plus an ORGANIZER responsibility. No privilege is added: the duty it
  -- already had (manage_sessions) is preserved through the responsibility, and nothing
  -- about community governance is granted.
  with legacy_organizers as (
    select m.community_id, m.user_id
    from public.community_members m
    where m.role = 'organizador' and m.status = 'active'
  ),
  assigned as (
    insert into public.community_responsibilities (community_id, user_id, responsibility)
    select community_id, user_id, 'ORGANIZER' from legacy_organizers
    on conflict do nothing
    returning community_id, user_id
  )
  insert into app_private.migration_entity_map
    (run_id, source_type, source_id, target_type, target_id, mapping_kind, confidence, reason)
  select v_run_id, 'community_members.role', community_id::text || ':' || user_id::text,
         'CommunityResponsibility', community_id::text || ':' || user_id::text || ':ORGANIZER',
         'SPLIT', 'EXACT',
         'legacy organizador is an explicit operational duty, mapped without any governance increase'
  from assigned;

  -- Any membership already written with a now-invalid governance rank is demoted to MEMBER.
  -- DEMOTED, never promoted: C6.01 forbids an automatic Admin privilege increase.
  update public.community_memberships
     set role = 'member', updated_at = now()
   where role not in ('owner', 'admin', 'member');

  -- `moderator` is NOT resolved here. OPEN-COM-003 owns its treatment and its conservative
  -- behaviour is "do not promote all moderators to Admin automatically". Promoting them
  -- would be a silent privilege grant; demoting them silently would drop a duty someone is
  -- relying on. So each one is quarantined for review, and its capabilities remain served
  -- by the untouched legacy tables meanwhile.
  with legacy_moderators as (
    select m.community_id, m.user_id
    from public.community_members m
    where m.role = 'moderator' and m.status = 'active'
  )
  insert into app_private.migration_anomalies (run_id, source_type, source_id, reason, details)
  select v_run_id, 'community_members.role', community_id::text || ':' || user_id::text,
         'legacy moderator has no target governance rank; promotion and demotion are both decisions',
         jsonb_build_object('community_id', community_id, 'user_id', user_id,
                            'open_decision', 'OPEN-COM-003')
  from legacy_moderators
  on conflict do nothing;

  update app_private.migration_runs
     set status = 'COMPLETED', finished_at = now()
   where run_id = v_run_id;
end $$;

-- ── Capability resolver ────────────────────────────────────────────────────
-- Derives SEMANTIC capabilities from the two axes. Callers ask "may this actor do X here",
-- never "is this actor an admin" -- the role comparison is what let operational authority
-- leak out of a governance rank in the first place.
--
-- Hardened to the XS-W0-04 target contract: empty search_path, qualified objects, EXECUTE
-- revoked from PUBLIC.
create or replace function public.community_capabilities(
  target_community_id uuid,
  target_user_id uuid
)
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  -- Governance rank grants governance capabilities only.
  select c.capability
    from public.community_memberships m
    cross join lateral (
      select unnest(
        case m.role
          when 'owner' then array['community.members.manage', 'community.ownership.transfer']
          when 'admin' then array['community.members.manage']
          else array[]::text[]
        end
      ) as capability
    ) c
   where m.community_id = target_community_id
     and m.user_id = target_user_id
     and m.status = 'active'

  union

  -- Operational responsibility grants operational capabilities only.
  select 'session.manage'
    from public.community_responsibilities r
   where r.community_id = target_community_id
     and r.user_id = target_user_id
     and r.responsibility = 'ORGANIZER'
     and r.revoked_at is null;

  -- Deliberately absent, and each absence is asserted by the negative matrix:
  --   player.evaluate    requires an explicit operational capability; ADMIN does not
  --                      confer it (GINV-CAP-002)
  --   match.control      per-Match control is leased at Match time (GINV-MATCH-004),
  --                      never derived from a Community rank -- W7 owns it
  --   competition.admin  W8 owns it; an ORGANIZER is not a CompetitionAdmin
$$;

revoke all on function public.community_capabilities(uuid, uuid) from public;
grant execute on function public.community_capabilities(uuid, uuid) to authenticated;

create or replace function public.current_user_has_community_capability(
  target_community_id uuid,
  target_capability text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.community_capabilities(target_community_id, (select auth.uid())) as c
     where c = target_capability
  );
$$;

revoke all on function public.current_user_has_community_capability(uuid, text) from public;
grant execute on function public.current_user_has_community_capability(uuid, text) to authenticated;

-- ── Access ─────────────────────────────────────────────────────────────────
alter table public.community_responsibilities enable row level security;
revoke all on public.community_responsibilities from public, anon;
grant select on public.community_responsibilities to authenticated;

create policy "Members can read responsibilities of their community"
  on public.community_responsibilities
  for select
  using (
    user_id = (select auth.uid())
    or public.current_user_is_active_community_member(community_id)
  );

comment on table public.community_responsibilities is
  'Operational duties, independent of governance rank (GINV-CAP-001). ORGANIZER only in W2.';
