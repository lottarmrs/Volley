-- ----------------------------------------------------------------------------
-- 1. Alter players table to add user_id reference
-- ----------------------------------------------------------------------------
alter table public.players add column if not exists user_id uuid references auth.users(id) on delete set null;
create unique index if not exists players_user_id_active_unique_idx on public.players (user_id) where deleted_at is null;

-- ----------------------------------------------------------------------------
-- 2. Create player_link_proposals table
-- ----------------------------------------------------------------------------
create table if not exists public.player_link_proposals (
  id          uuid primary key default gen_random_uuid(),
  player_id   uuid not null references public.players(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  status      text not null default 'pending'
              check (status in ('pending', 'approved', 'rejected', 'superseded')),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at  timestamptz not null default now()
);

create unique index if not exists pending_link_proposal_idx on public.player_link_proposals (player_id, user_id) where status = 'pending';
create index if not exists player_link_proposals_player_id_idx on public.player_link_proposals (player_id);
create index if not exists player_link_proposals_user_id_idx on public.player_link_proposals (user_id);
create index if not exists player_link_proposals_status_idx on public.player_link_proposals (status);

alter table public.player_link_proposals enable row level security;

-- ----------------------------------------------------------------------------
-- 3. RLS Policies for player_link_proposals
-- ----------------------------------------------------------------------------
drop policy if exists "Users can read their own link proposals" on public.player_link_proposals;
create policy "Users can read their own link proposals" on public.player_link_proposals
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Admins can read proposals for their players" on public.player_link_proposals;
create policy "Admins can read proposals for their players" on public.player_link_proposals
  for select to authenticated
  using (public.current_user_is_player_admin(player_id));

drop policy if exists "Users can create their own link proposals" on public.player_link_proposals;
create policy "Users can create their own link proposals" on public.player_link_proposals
  for insert to authenticated
  with check (user_id = (select auth.uid()));

grant select on public.player_link_proposals to authenticated;

-- ----------------------------------------------------------------------------
-- 4. Triggers to guard user_id on players table & unlink on soft delete
-- ----------------------------------------------------------------------------
create or replace function public.guard_player_user_id()
returns trigger
language plpgsql
as $$
begin
  if new.user_id is distinct from old.user_id
     and coalesce(current_setting('app.allow_user_link_promotion', true), '') <> 'on'
     and not (new.deleted_at is not null and old.deleted_at is null) then
    raise exception 'user_id can only be changed through the player link approval flow'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_player_user_id on public.players;
create trigger trg_guard_player_user_id
  before update on public.players
  for each row execute function public.guard_player_user_id();


create or replace function public.handle_player_soft_delete_user_unlink()
returns trigger
language plpgsql
as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    new.user_id := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_player_soft_delete_user_unlink on public.players;
create trigger trg_player_soft_delete_user_unlink
  before update on public.players
  for each row execute function public.handle_player_soft_delete_user_unlink();

-- ----------------------------------------------------------------------------
-- 5. RPC Functions for player linking
-- ----------------------------------------------------------------------------
create or replace function public.propose_player_link(
  p_player_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid        uuid := (select auth.uid());
  v_owner_id   uuid;
  v_proposal   uuid;
  v_is_creator boolean;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select owner_id into v_owner_id from public.players where id = p_player_id;
  if v_owner_id is null then
    raise exception 'Athlete not found' using errcode = '22023';
  end if;

  v_is_creator := (v_owner_id = v_uid);

  insert into public.player_link_proposals (
    player_id, user_id, status, reviewed_by, reviewed_at
  )
  values (
    p_player_id, v_uid,
    case when v_is_creator then 'approved' else 'pending' end,
    case when v_is_creator then v_uid else null end,
    case when v_is_creator then now() else null end
  )
  returning id into v_proposal;

  if v_is_creator then
    perform set_config('app.allow_user_link_promotion', 'on', true);
    update public.players
       set user_id = v_uid,
           updated_at = now()
     where id = p_player_id;

    update public.player_link_proposals
       set status = 'superseded', reviewed_by = v_uid, reviewed_at = now()
     where (player_id = p_player_id or user_id = v_uid)
       and status = 'pending'
       and id <> v_proposal;
  end if;

  return v_proposal;
end;
$$;

revoke execute on function public.propose_player_link(uuid) from public, anon;
grant execute on function public.propose_player_link(uuid) to authenticated;


create or replace function public.approve_player_link(
  p_proposal_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid      uuid := (select auth.uid());
  v_player   uuid;
  v_user     uuid;
  v_owner_id uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select player_id, user_id
    into v_player, v_user
  from public.player_link_proposals
  where id = p_proposal_id
    and status = 'pending';

  if v_player is null then
    raise exception 'Proposal not found or not pending' using errcode = '22023';
  end if;

  if not public.current_user_is_player_admin(v_player) then
    raise exception 'Only the athlete creator or community admins can approve a link proposal'
      using errcode = '42501';
  end if;

  perform set_config('app.allow_user_link_promotion', 'on', true);
  update public.players
     set user_id = v_user,
         updated_at = now()
   where id = v_player;

  update public.player_link_proposals
     set status = 'approved',
         reviewed_by = v_uid,
         reviewed_at = now()
   where id = p_proposal_id;

  update public.player_link_proposals
     set status = 'superseded',
         reviewed_by = v_uid,
         reviewed_at = now()
   where (player_id = v_player or user_id = v_user)
     and status = 'pending'
     and id <> p_proposal_id;
end;
$$;

revoke execute on function public.approve_player_link(uuid) from public, anon;
grant execute on function public.approve_player_link(uuid) to authenticated;


create or replace function public.reject_player_link(
  p_proposal_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid      uuid := (select auth.uid());
  v_player   uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select player_id into v_player
  from public.player_link_proposals
  where id = p_proposal_id
    and status = 'pending';

  if v_player is null then
    raise exception 'Proposal not found or not pending' using errcode = '22023';
  end if;

  if not public.current_user_is_player_admin(v_player) then
    raise exception 'Only the athlete creator or community admins can reject a link proposal'
      using errcode = '42501';
  end if;

  update public.player_link_proposals
     set status = 'rejected',
         reviewed_by = v_uid,
         reviewed_at = now()
   where id = p_proposal_id;
end;
$$;

revoke execute on function public.reject_player_link(uuid) from public, anon;
grant execute on function public.reject_player_link(uuid) to authenticated;


create or replace function public.cancel_my_link_proposal(
  p_proposal_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid      uuid := (select auth.uid());
  v_proposer uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select user_id into v_proposer
  from public.player_link_proposals
  where id = p_proposal_id
    and status = 'pending';

  if v_proposer is null then
    raise exception 'Proposal not found or not pending' using errcode = '22023';
  end if;

  if v_proposer is distinct from v_uid then
    raise exception 'You can only cancel your own proposal' using errcode = '42501';
  end if;

  update public.player_link_proposals
     set status = 'rejected',
         reviewed_by = v_uid,
         reviewed_at = now()
   where id = p_proposal_id;
end;
$$;

revoke execute on function public.cancel_my_link_proposal(uuid) from public, anon;
grant execute on function public.cancel_my_link_proposal(uuid) to authenticated;
