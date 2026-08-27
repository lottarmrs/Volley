-- C6 XS-W2-02 — Split CommunityMembership from CommunityPlayer
--
-- GINV-ID-003: CommunityMembership (User access/governance) and CommunityPlayer (Player
-- sports relationship) are INDEPENDENT. Neither implies the other.
--
-- WHAT THE LEGACY SHAPE CONFLATES.
--
--   community_members has UNIQUE (community_id, user_id) and a status that includes
--   'pending'. A pending join therefore OCCUPIES the same slot as an effective membership:
--   the schema forces exactly the inference C6.01 forbids ("pending join is effective
--   Membership"). It also means a rejected applicant cannot re-apply without overwriting
--   the record of the previous decision.
--
--   community_players.role accepts 'owner' and 'admin', so a sports relation can carry a
--   governance-looking value. C6.01 forbids reading it as governance, and this migration
--   does not.
--
-- EXPAND ONLY. Two new relations are added and backfilled by CLASSIFYING what the legacy
-- rows actually prove. No policy changes, nothing dropped, community_members keeps working
-- unchanged. W2 cutover is a separate step.

-- ── CommunityMembership: governance only ───────────────────────────────────
create table if not exists public.community_memberships (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,

  role text not null default 'member'
    check (role in ('owner', 'admin', 'moderator', 'organizador', 'member')),

  -- EFFECTIVE states only. There is deliberately no 'pending' here: a request to join is
  -- not a membership, and giving it a seat in this table is the legacy defect.
  status text not null default 'active'
    check (status in ('active', 'suspended')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- "Effective Membership uniqueness per Community/User."
  unique (community_id, user_id)
);

create index if not exists community_memberships_community_idx
  on public.community_memberships (community_id, status);
create index if not exists community_memberships_user_idx
  on public.community_memberships (user_id);

-- ── CommunityJoinRequest: intent, with its own history ─────────────────────
create table if not exists public.community_join_requests (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,

  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'withdrawn')),

  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references public.profiles(id) on delete set null,
  decision_reason text,

  -- A decided request must record when. Otherwise "rejected" carries no evidence and the
  -- history the separate table exists to preserve is worthless.
  check (status = 'pending' or decided_at is not null)
);

-- "One pending JoinRequest per Community/User." PARTIAL, so decided requests accumulate as
-- history: a rejected applicant can apply again WITHOUT erasing the earlier decision, which
-- the legacy single-row shape made impossible.
create unique index if not exists community_join_requests_one_pending
  on public.community_join_requests (community_id, user_id)
  where status = 'pending';

create index if not exists community_join_requests_open_idx
  on public.community_join_requests (community_id, requested_at)
  where status = 'pending';

-- ── Backfill by classification ─────────────────────────────────────────────
-- Classify by what the source data actually PROVES. C6.01 forbids inferring that an admin
-- account is a Player, that a Player has an account, that a pending join is a membership,
-- or that a legacy player/guest role is governance. None of those inferences appear below.
do $$
declare
  v_run_id uuid;
begin
  if to_regclass('app_private.migration_runs') is null then
    return;
  end if;

  insert into app_private.migration_runs (name, source_release, status)
  values ('split_membership_from_community_player', 'XS-W2-02', 'RUNNING')
  returning run_id into v_run_id;

  -- ACTIVE membership rows prove effective governance access.
  with effective as (
    insert into public.community_memberships (community_id, user_id, role, status, created_at)
    select m.community_id, m.user_id, m.role, 'active', m.created_at
    from public.community_members m
    where m.status = 'active'
    on conflict (community_id, user_id) do nothing
    returning community_id, user_id
  )
  insert into app_private.migration_entity_map
    (run_id, source_type, source_id, target_type, target_id, mapping_kind, confidence, reason)
  select v_run_id, 'community_members', community_id::text || ':' || user_id::text,
         'CommunityMembership', community_id::text || ':' || user_id::text,
         'SPLIT', 'EXACT', 'status=active proves effective governance access'
  from effective;

  -- PENDING and INVITED prove INTENT, not access. They become join requests and
  -- deliberately produce NO membership row.
  with intent as (
    insert into public.community_join_requests (community_id, user_id, status, requested_at)
    select m.community_id, m.user_id, 'pending', m.created_at
    from public.community_members m
    where m.status in ('pending', 'invited')
    on conflict do nothing
    returning community_id, user_id
  )
  insert into app_private.migration_entity_map
    (run_id, source_type, source_id, target_type, target_id, mapping_kind, confidence, reason)
  select v_run_id, 'community_members', community_id::text || ':' || user_id::text,
         'CommunityJoinRequest', community_id::text || ':' || user_id::text,
         'SPLIT', 'EXACT', 'status=pending/invited proves intent only, never access'
  from intent;

  -- REJECTED is a decided request. The legacy row cannot say WHEN it was decided, so the
  -- decision timestamp is carried from updated_at and the reason records that provenance
  -- rather than inventing one.
  with decided as (
    insert into public.community_join_requests
      (community_id, user_id, status, requested_at, decided_at, decision_reason)
    select m.community_id, m.user_id, 'rejected', m.created_at, m.updated_at,
           'imported from legacy community_members.status=rejected; decision time taken from updated_at'
    from public.community_members m
    where m.status = 'rejected'
    on conflict do nothing
    returning community_id, user_id
  )
  insert into app_private.migration_entity_map
    (run_id, source_type, source_id, target_type, target_id, mapping_kind, confidence, reason)
  select v_run_id, 'community_members', community_id::text || ':' || user_id::text,
         'CommunityJoinRequest', community_id::text || ':' || user_id::text,
         'SPLIT', 'DERIVED', 'decision timestamp derived from updated_at, not recorded at source'
  from decided;

  update app_private.migration_runs
     set status = 'COMPLETED', finished_at = now()
   where run_id = v_run_id;
end $$;

-- ── Access ─────────────────────────────────────────────────────────────────
alter table public.community_memberships enable row level security;
alter table public.community_join_requests enable row level security;

revoke all on public.community_memberships from public, anon;
revoke all on public.community_join_requests from public, anon;
grant select on public.community_memberships to authenticated;
grant select on public.community_join_requests to authenticated;

-- Read-only for now. Governance mutations stay on the existing hardened RPCs
-- (set_community_member_role, approve_join_request, ...) until W2 cutover moves them;
-- adding write policies here would create a second authority for the same aggregate,
-- which GINV-AUTH-001 forbids.
-- A policy on community_memberships MUST NOT query community_memberships directly: the
-- policy would re-enter itself and PostgreSQL raises "infinite recursion detected in policy".
-- A SECURITY DEFINER helper bypasses RLS and breaks the cycle.
--
-- Hardened to the XS-W0-04 target contract: empty search_path, qualified objects, EXECUTE
-- revoked from PUBLIC. Note it deliberately checks ACTIVE membership rather than reusing
-- current_user_has_community_role, whose default role set excludes plain members.
create or replace function public.current_user_is_active_community_member(target_community_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.community_memberships m
     where m.community_id = target_community_id
       and m.user_id = (select auth.uid())
       and m.status = 'active'
  );
$$;

revoke all on function public.current_user_is_active_community_member(uuid) from public;
grant execute on function public.current_user_is_active_community_member(uuid) to authenticated;

create policy "Members can read memberships of their community"
  on public.community_memberships
  for select
  using (
    user_id = (select auth.uid())
    or public.current_user_is_active_community_member(community_id)
  );

-- An applicant sees their own request. Reviewers see their community's queue.
create policy "Applicants and reviewers can read join requests"
  on public.community_join_requests
  for select
  using (
    user_id = (select auth.uid())
    or public.current_user_has_community_role(community_id)
  );

comment on table public.community_memberships is
  'Governance access only (GINV-ID-003). Independent of community_players. Expand-only: community_members remains authoritative until W2 cutover.';
comment on table public.community_join_requests is
  'Pending/decided intent to join. A request is NOT a membership (C6 XS-W2-02).';
