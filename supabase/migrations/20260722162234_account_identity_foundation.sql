create unique index if not exists players_username_lower_idx
  on public.players (lower(username));

create or replace function public.normalize_account_username(value text)
returns text
language sql
immutable
set search_path = public
as $$
  select lower(trim(value));
$$;

create or replace function public.is_valid_account_username(value text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select public.normalize_account_username(value) ~ '^[a-z0-9][a-z0-9_-]{2,29}$';
$$;

alter table public.players
  drop constraint if exists players_username_account_format_check;

alter table public.players
  add constraint players_username_account_format_check
  check (
    username is null
    or (
      username = lower(username)
      and username ~ '^[a-z0-9][a-z0-9_-]{2,29}$'
    )
  ) not valid;

-- Username remediation phase 1: clear invalid values and normalized duplicates.
with username_candidates as (
  select
    id,
    public.normalize_account_username(username) as normalized_username,
    row_number() over (
      partition by public.normalize_account_username(username)
      order by created_at, id
    ) as username_rank
  from public.players
  where username is not null
)
update public.players as p
   set username = null,
       updated_at = now()
  from username_candidates as c
 where p.id = c.id
   and (
     c.normalized_username !~ '^[a-z0-9][a-z0-9_-]{2,29}$'
     or c.username_rank > 1
   );

-- Username remediation phase 2: normalize only the surviving winners.
with username_winners as (
  select
    id,
    public.normalize_account_username(username) as normalized_username
  from public.players
  where username is not null
)
update public.players as p
   set username = w.normalized_username,
       updated_at = now()
  from username_winners as w
 where p.id = w.id
   and p.username is distinct from w.normalized_username;

alter table public.players
  validate constraint players_username_account_format_check;

drop index if exists public.players_user_id_active_unique_idx;
drop index if exists public.players_user_id_unique_idx;

do $$
begin
  perform set_config('app.allow_user_link_promotion', 'on', true);

  with ranked_player_links as (
    select
      id,
      row_number() over (
        partition by user_id
        order by (deleted_at is null) desc, created_at, id
      ) as canonical_rank
    from public.players
    where user_id is not null
  )
  update public.players as p
     set user_id = null,
         updated_at = now()
    from ranked_player_links as r
   where p.id = r.id
     and (r.canonical_rank > 1 or p.deleted_at is not null);
end;
$$;

create unique index if not exists players_user_id_unique_idx
  on public.players (user_id)
  where user_id is not null;

create or replace function public.guard_player_user_id()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.user_id is distinct from old.user_id
     and coalesce(current_setting('app.allow_user_link_promotion', true), '') <> 'on'
     and not (
       new.deleted_at is not null
       and old.deleted_at is null
       and new.user_id is null
     ) then
    raise exception 'user_id can only be changed through the player link approval flow'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function public.handle_player_soft_delete_user_unlink()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    new.user_id := null;
  end if;
  return new;
end;
$$;

revoke execute on function public.guard_player_user_id() from public, anon, authenticated;
revoke execute on function public.handle_player_soft_delete_user_unlink() from public, anon, authenticated;

drop trigger if exists trg_guard_player_user_id on public.players;
drop trigger if exists trg_player_soft_delete_user_unlink on public.players;

-- PostgreSQL fires same-event triggers by name: guard first, then forced unlink.
create trigger trg_guard_player_user_id
  before update on public.players
  for each row execute function public.guard_player_user_id();

create trigger trg_player_soft_delete_user_unlink
  before update on public.players
  for each row execute function public.handle_player_soft_delete_user_unlink();

drop policy if exists "Users can insert own players" on public.players;
drop policy if exists "Users can insert owned players" on public.players;
drop policy if exists "Users can insert unlinked owned players" on public.players;

create policy "Users can insert unlinked owned players" on public.players
  for insert
  to authenticated
  with check (
    owner_id = (select auth.uid())
    and user_id is null
  );

create or replace function public.ensure_account_ready(p_username text default null)
returns table (
  state text,
  profile_id uuid,
  profile_name text,
  profile_email text,
  profile_role text,
  profile_created_at timestamptz,
  profile_updated_at timestamptz,
  player_id uuid,
  username text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  v_email text;
  v_name text;
  v_username text := public.normalize_account_username(p_username);
  v_profile public.profiles%rowtype;
  v_player public.players%rowtype;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select email, coalesce(raw_user_meta_data->>'name', split_part(email, '@', 1))
    into v_email, v_name
    from auth.users
   where id = v_uid;

  insert into public.profiles (id, name, email, role)
  values (v_uid, v_name, v_email, 'user')
  on conflict (id) do update
    set email = excluded.email,
        updated_at = now();

  select * into v_profile from public.profiles where id = v_uid;

  select * into v_player
    from public.players
   where user_id = v_uid and deleted_at is null
   order by created_at
   limit 1
   for update;

  if nullif(v_username, '') is not null
     and not public.is_valid_account_username(v_username) then
    raise exception 'Invalid username' using errcode = '22023';
  end if;

  if v_player.id is null then
    insert into public.players (owner_id, user_id, name, username)
    values (v_uid, v_uid, v_name, nullif(v_username, ''))
    on conflict (user_id) where user_id is not null
    do update set updated_at = now()
    returning * into v_player;
  elsif (
    v_player.username is null
    or v_player.username <> public.normalize_account_username(v_player.username)
    or not public.is_valid_account_username(v_player.username)
  ) and nullif(v_username, '') is not null then
    if not public.is_valid_account_username(v_username) then
      raise exception 'Invalid username' using errcode = '22023';
    end if;
    update public.players
       set username = v_username, updated_at = now()
     where id = v_player.id
     returning * into v_player;
  end if;

  if v_player.username is null
     or v_player.username <> public.normalize_account_username(v_player.username)
     or not public.is_valid_account_username(v_player.username) then
    return query select
      'needs_username'::text,
      v_profile.id,
      v_profile.name,
      v_profile.email,
      v_profile.role,
      v_profile.created_at,
      v_profile.updated_at,
      v_player.id,
      null::text;
  else
    return query select
      'ready'::text,
      v_profile.id,
      v_profile.name,
      v_profile.email,
      v_profile.role,
      v_profile.created_at,
      v_profile.updated_at,
      v_player.id,
      v_player.username;
  end if;
exception
  when unique_violation then
    raise exception 'Username unavailable' using errcode = '23505';
end;
$$;

revoke execute on function public.ensure_account_ready(text) from public, anon;
grant execute on function public.ensure_account_ready(text) to authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1));
  v_username text := public.normalize_account_username(new.raw_user_meta_data->>'username');
begin
  insert into public.profiles (id, name, email, role)
  values (new.id, v_name, new.email, 'user')
  on conflict (id) do nothing;

  insert into public.players (owner_id, user_id, name, username)
  values (new.id, new.id, v_name, null)
  on conflict (user_id) where user_id is not null do nothing;

  if public.is_valid_account_username(v_username) then
    begin
      update public.players
         set username = v_username,
             updated_at = now()
       where user_id = new.id
         and deleted_at is null
         and username is null;
    exception
      when unique_violation then
        null;
    end;
  end if;

  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

create table if not exists public.player_identity_claims (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null unique references public.player_link_proposals(id) on delete restrict,
  idempotency_key uuid not null,
  user_id uuid not null references auth.users(id) on delete restrict,
  canonical_player_id uuid not null references public.players(id) on delete restrict,
  legacy_player_id uuid not null references public.players(id) on delete restrict,
  reviewed_by uuid not null references auth.users(id) on delete restrict,
  status text not null check (status in ('approved', 'conflict')),
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (idempotency_key),
  unique (legacy_player_id),
  check (canonical_player_id <> legacy_player_id)
);

create table if not exists public.player_identity_aliases (
  legacy_player_id uuid primary key references public.players(id) on delete restrict,
  legacy_local_id text,
  canonical_player_id uuid not null references public.players(id) on delete restrict,
  claim_id uuid not null unique references public.player_identity_claims(id) on delete restrict,
  created_at timestamptz not null default now(),
  check (legacy_player_id <> canonical_player_id)
);

create index if not exists player_identity_claims_user_id_idx
  on public.player_identity_claims (user_id);
create index if not exists player_identity_claims_canonical_player_id_idx
  on public.player_identity_claims (canonical_player_id);
create index if not exists player_identity_aliases_canonical_player_id_idx
  on public.player_identity_aliases (canonical_player_id);

alter table public.player_identity_claims enable row level security;
alter table public.player_identity_aliases enable row level security;

drop policy if exists "Authorized users can read player identity claims"
  on public.player_identity_claims;
create policy "Authorized users can read player identity claims"
  on public.player_identity_claims
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1
      from public.players p
      where p.id in (canonical_player_id, legacy_player_id)
        and p.owner_id = (select auth.uid())
    )
    or public.current_user_can_access_player(canonical_player_id)
    or public.current_user_can_access_player(legacy_player_id)
  );

drop policy if exists "Authorized users can read player identity aliases"
  on public.player_identity_aliases;
create policy "Authorized users can read player identity aliases"
  on public.player_identity_aliases
  for select to authenticated
  using (
    exists (
      select 1
      from public.players p
      where p.id in (canonical_player_id, legacy_player_id)
        and (
          p.user_id = (select auth.uid())
          or p.owner_id = (select auth.uid())
        )
    )
    or public.current_user_can_access_player(canonical_player_id)
    or public.current_user_can_access_player(legacy_player_id)
  );

revoke all on table public.player_identity_claims from public, anon, authenticated;
revoke all on table public.player_identity_aliases from public, anon, authenticated;
grant select on public.player_identity_claims to authenticated;
grant select on public.player_identity_aliases to authenticated;

create or replace function public.merge_player_identity_claim(
  p_proposal_id uuid,
  p_reviewer uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := (select auth.uid());
  v_lock_player_id uuid;
  v_lock_user_id uuid;
  v_player_lock bigint;
  v_user_lock bigint;
  v_proposal public.player_link_proposals%rowtype;
  v_legacy public.players%rowtype;
  v_canonical public.players%rowtype;
  v_existing_claim public.player_identity_claims%rowtype;
  v_user_id uuid;
  v_legacy_player_id uuid;
  v_canonical_player_id uuid;
  v_claim_id uuid := gen_random_uuid();
  v_result jsonb;
begin
  if v_actor is null or v_actor is distinct from p_reviewer then
    raise exception 'Reviewer must be the authenticated user' using errcode = '42501';
  end if;

  select player_id, user_id
    into v_lock_player_id, v_lock_user_id
    from public.player_link_proposals
   where id = p_proposal_id;

  if v_lock_player_id is null then
    raise exception 'Proposal not found' using errcode = '22023';
  end if;

  -- Serialize claims that share either the legacy player or the account.
  v_player_lock := hashtextextended('player:' || v_lock_player_id::text, 0);
  v_user_lock := hashtextextended('user:' || v_lock_user_id::text, 0);
  perform pg_advisory_xact_lock(least(v_player_lock, v_user_lock));
  if v_player_lock <> v_user_lock then
    perform pg_advisory_xact_lock(greatest(v_player_lock, v_user_lock));
  end if;

  select *
    into v_proposal
    from public.player_link_proposals
   where id = p_proposal_id
   for update;

  if v_proposal.player_id is distinct from v_lock_player_id
     or v_proposal.user_id is distinct from v_lock_user_id then
    raise exception 'Proposal changed while claim was starting' using errcode = '40001';
  end if;

  v_user_id := v_proposal.user_id;
  v_legacy_player_id := v_proposal.player_id;

  select *
    into v_legacy
    from public.players
   where id = v_legacy_player_id
   for update;

  if v_legacy.id is null then
    raise exception 'Legacy player not found' using errcode = '22023';
  end if;

  select *
    into v_canonical
    from public.players
   where user_id = v_user_id
     and deleted_at is null
   order by created_at, id
   limit 1
   for update;

  if v_canonical.id is null then
    raise exception 'Canonical account player not found' using errcode = '22023';
  end if;

  v_canonical_player_id := v_canonical.id;

  if v_canonical_player_id = v_legacy_player_id then
    raise exception 'Player is already the canonical account player' using errcode = '22023';
  end if;

  if v_proposal.status not in ('pending', 'approved') then
    raise exception 'Proposal not pending or approved' using errcode = '22023';
  end if;

  select *
    into v_existing_claim
    from public.player_identity_claims
   where proposal_id = v_proposal.id;

  if v_existing_claim.id is not null then
    if v_proposal.status <> 'approved'
       or v_proposal.reviewed_by is distinct from p_reviewer then
      raise exception 'Claim reviewer mismatch' using errcode = '42501';
    end if;
    return v_existing_claim.result;
  end if;

  if v_proposal.status <> 'pending' then
    raise exception 'Approved proposal has no completed claim' using errcode = '23505';
  end if;

  if not public.current_user_is_player_admin(v_legacy_player_id) then
    raise exception 'Only the athlete creator or community admins can approve a link proposal'
      using errcode = '42501';
  end if;

  if exists (
    select 1
      from public.player_identity_aliases
     where legacy_player_id = v_legacy_player_id
  ) or exists (
    select 1
      from public.player_identity_claims
     where legacy_player_id = v_legacy_player_id
  ) then
    raise exception 'Player already claimed' using errcode = '23505';
  end if;

  perform 1
    from public.community_players
   where player_id in (v_canonical_player_id, v_legacy_player_id)
   order by id
   for update;
  perform 1
    from public.player_evaluations
   where player_id in (v_canonical_player_id, v_legacy_player_id)
   order by id
   for update;
  perform 1
    from public.player_avatar_proposals
   where player_id in (v_canonical_player_id, v_legacy_player_id)
   order by id
   for update;
  perform 1
    from public.player_link_proposals
   where player_id = v_legacy_player_id
      or user_id = v_user_id
   order by id
   for update;

  -- Canonical identity fields are intentionally absent from this update.
  update public.players as canonical
     set nickname = case
           when nullif(trim(canonical.nickname), '') is null then v_legacy.nickname
           else canonical.nickname
         end,
         gender = coalesce(canonical.gender, v_legacy.gender),
         height = coalesce(canonical.height, v_legacy.height),
         dominant_hand = case
           when nullif(trim(canonical.dominant_hand), '') is null then v_legacy.dominant_hand
           else canonical.dominant_hand
         end,
         primary_position = case
           when nullif(trim(canonical.primary_position), '') is null then v_legacy.primary_position
           else canonical.primary_position
         end,
         secondary_positions = case
           when coalesce(cardinality(canonical.secondary_positions), 0) = 0
             then v_legacy.secondary_positions
           else canonical.secondary_positions
         end,
         attributes = canonical.attributes || coalesce((
           select jsonb_object_agg(entry.key, entry.value)
             from jsonb_each(v_legacy.attributes) as entry
            where not canonical.attributes ? entry.key
         ), '{}'::jsonb),
         profile = canonical.profile || coalesce((
           select jsonb_object_agg(entry.key, entry.value)
             from jsonb_each(v_legacy.profile) as entry
            where not canonical.profile ? entry.key
         ), '{}'::jsonb),
         forma_atual = canonical.forma_atual || coalesce((
           select jsonb_object_agg(entry.key, entry.value)
             from jsonb_each(v_legacy.forma_atual) as entry
            where not canonical.forma_atual ? entry.key
         ), '{}'::jsonb),
         status = canonical.status || coalesce((
           select jsonb_object_agg(entry.key, entry.value)
             from jsonb_each(v_legacy.status) as entry
            where not canonical.status ? entry.key
         ), '{}'::jsonb),
         notes = case
           when nullif(trim(canonical.notes), '') is null then v_legacy.notes
           else canonical.notes
         end,
         avatar_url = case
           when nullif(trim(canonical.avatar_url), '') is null then v_legacy.avatar_url
           else canonical.avatar_url
         end,
         sync_version = greatest(canonical.sync_version, v_legacy.sync_version),
         updated_at = now()
   where canonical.id = v_canonical_player_id;

  -- Membership unique (community_id, player_id): banned wins, then active.
  insert into public.community_players as canonical (
    owner_id,
    community_id,
    player_id,
    active,
    joined_at,
    created_at,
    updated_at,
    status,
    role,
    sync_version,
    deleted_at
  )
  select
    legacy.owner_id,
    legacy.community_id,
    v_canonical_player_id,
    legacy.active,
    legacy.joined_at,
    legacy.created_at,
    legacy.updated_at,
    legacy.status,
    legacy.role,
    legacy.sync_version,
    legacy.deleted_at
  from public.community_players as legacy
  where legacy.player_id = v_legacy_player_id
  on conflict (community_id, player_id) do update
    set active = case
          when canonical.status = 'banned' or excluded.status = 'banned' then false
          when canonical.status = 'active' or excluded.status = 'active' then true
          else false
        end,
        status = case
          when canonical.status = 'banned' or excluded.status = 'banned' then 'banned'
          when canonical.status = 'active' or excluded.status = 'active' then 'active'
          else 'inactive'
        end,
        role = case
          when canonical.role = 'player' then excluded.role
          else canonical.role
        end,
        joined_at = least(canonical.joined_at, excluded.joined_at),
        created_at = least(canonical.created_at, excluded.created_at),
        updated_at = greatest(canonical.updated_at, excluded.updated_at),
        sync_version = greatest(canonical.sync_version, excluded.sync_version),
        deleted_at = case
          when canonical.status <> 'banned'
           and excluded.status <> 'banned'
           and (canonical.status = 'active' or excluded.status = 'active') then null
          else coalesce(canonical.deleted_at, excluded.deleted_at)
        end;

  delete from public.community_players
   where player_id = v_legacy_player_id;

  -- Evaluation unique (owner_id, player_id): newest updated_at wins, then id.
  delete from public.player_evaluations as legacy
  using public.player_evaluations as canonical
   where legacy.player_id = v_legacy_player_id
     and canonical.player_id = v_canonical_player_id
     and canonical.owner_id = legacy.owner_id
     and (
       canonical.updated_at > legacy.updated_at
       or (canonical.updated_at = legacy.updated_at and canonical.id < legacy.id)
     );

  delete from public.player_evaluations as canonical
  using public.player_evaluations as legacy
   where canonical.player_id = v_canonical_player_id
     and legacy.player_id = v_legacy_player_id
     and canonical.owner_id = legacy.owner_id
     and (
       legacy.updated_at > canonical.updated_at
       or (legacy.updated_at = canonical.updated_at and legacy.id < canonical.id)
     );

  update public.player_evaluations
     set player_id = v_canonical_player_id
   where player_id = v_legacy_player_id;

  -- Keep one deterministic pending avatar proposal across both identities.
  with ranked_pending as (
    select
      proposal.id,
      row_number() over (
        order by proposal.created_at desc, proposal.id desc
      ) as pending_rank
    from public.player_avatar_proposals as proposal
    where proposal.player_id in (v_canonical_player_id, v_legacy_player_id)
      and proposal.status = 'pending'
  )
  update public.player_avatar_proposals as proposal
     set status = 'superseded'
    from ranked_pending as ranked
   where proposal.id = ranked.id
     and ranked.pending_rank > 1;

  update public.player_avatar_proposals
     set player_id = v_canonical_player_id
   where player_id = v_legacy_player_id;

  update public.player_link_proposals
     set status = 'approved',
         reviewed_by = p_reviewer,
         reviewed_at = now()
   where id = v_proposal.id;

  update public.player_link_proposals
     set status = 'superseded',
         reviewed_by = p_reviewer,
         reviewed_at = now()
   where (player_id = v_legacy_player_id or user_id = v_user_id)
     and status = 'pending'
     and id <> v_proposal.id;

  v_result := jsonb_build_object(
    'claim_id', v_claim_id,
    'canonical_player_id', v_canonical_player_id,
    'legacy_player_id', v_legacy_player_id,
    'legacy_local_id', v_legacy.local_id
  );

  insert into public.player_identity_claims (
    id,
    proposal_id,
    idempotency_key,
    user_id,
    canonical_player_id,
    legacy_player_id,
    reviewed_by,
    status,
    result,
    completed_at
  )
  values (
    v_claim_id,
    v_proposal.id,
    v_proposal.id,
    v_user_id,
    v_canonical_player_id,
    v_legacy_player_id,
    p_reviewer,
    'approved',
    v_result,
    now()
  );

  insert into public.player_identity_aliases (
    legacy_player_id,
    legacy_local_id,
    canonical_player_id,
    claim_id
  )
  values (
    v_legacy_player_id,
    v_legacy.local_id,
    v_canonical_player_id,
    v_claim_id
  );

  perform set_config('app.allow_user_link_promotion', 'on', true);
  update public.players
     set username = null,
         user_id = null,
         active = false,
         deleted_at = coalesce(deleted_at, now()),
         updated_at = now()
   where id = v_legacy_player_id;

  return v_result;
end;
$$;

revoke execute on function public.merge_player_identity_claim(uuid, uuid) from public, anon, authenticated;

create or replace function public.propose_player_link(
  p_player_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  v_owner_id uuid;
  v_proposal uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select owner_id
    into v_owner_id
    from public.players
   where id = p_player_id
     and deleted_at is null;

  if v_owner_id is null then
    raise exception 'Athlete not found' using errcode = '22023';
  end if;

  insert into public.player_link_proposals (player_id, user_id, status)
  values (p_player_id, v_uid, 'pending')
  on conflict (player_id, user_id) where status = 'pending'
  do update set created_at = public.player_link_proposals.created_at
  returning id into v_proposal;

  if v_owner_id = v_uid then
    perform public.merge_player_identity_claim(v_proposal, v_uid);
  end if;

  return v_proposal;
end;
$$;

revoke execute on function public.propose_player_link(uuid) from public, anon;
grant execute on function public.propose_player_link(uuid) to authenticated;

do $$
begin
  if to_regprocedure('public.approve_player_link(uuid)') is not null then
    execute 'revoke execute on function public.approve_player_link(uuid) from public, anon, authenticated';
  end if;
end;
$$;
drop function if exists public.approve_player_link(uuid);

create or replace function public.approve_player_link(
  p_proposal_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  v_player_id uuid;
  v_status text;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select player_id, status
    into v_player_id, v_status
    from public.player_link_proposals
   where id = p_proposal_id;

  if v_player_id is null or v_status not in ('pending', 'approved') then
    raise exception 'Proposal not found or not claimable' using errcode = '22023';
  end if;

  if not public.current_user_is_player_admin(v_player_id)
     and not exists (
       select 1
         from public.player_identity_claims
        where proposal_id = p_proposal_id
          and reviewed_by = v_uid
     ) then
    raise exception 'Only the athlete creator or community admins can approve a link proposal'
      using errcode = '42501';
  end if;

  return public.merge_player_identity_claim(p_proposal_id, v_uid);
end;
$$;

revoke execute on function public.approve_player_link(uuid) from public, anon;
grant execute on function public.approve_player_link(uuid) to authenticated;
