-- ============================================================================
-- Player avatars with creator-approval workflow.
--
-- Model:
--   * The "live" avatar lives in public.players.avatar_url and is readable by
--     everyone who can already read the (global) athlete row.
--   * Any admin (community owner/admin) of an athlete may PROPOSE a new photo.
--   * Only the athlete's creator (players.owner_id) may APPROVE/REJECT a
--     proposal. When the creator proposes, it is auto-approved (no queue).
--
-- Security note (the important part):
--   The existing players UPDATE policy lets any community member update the
--   row. RLS is row-level, not column-level, so a member could PATCH avatar_url
--   directly and bypass approval. We therefore LOCK the column with a trigger
--   (guard_avatar_url): avatar_url can only change while a transaction-local
--   flag is set, and that flag is only ever set inside the SECURITY DEFINER
--   approval functions below. Storage writes are guarded independently by RLS
--   on storage.objects keyed to current_user_is_player_admin().
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Storage bucket
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 5242880,
        array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ----------------------------------------------------------------------------
-- 2. players.avatar_url column
-- ----------------------------------------------------------------------------
alter table public.players add column if not exists avatar_url text;

-- ----------------------------------------------------------------------------
-- 3. Helper: is the current user an ADMIN of this athlete?
--    (creator, or owner/admin of a community that has the athlete active)
-- ----------------------------------------------------------------------------
create or replace function public.current_user_is_player_admin(target_player_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.players p
    where p.id = target_player_id
      and p.owner_id = (select auth.uid())
  )
  or exists (
    select 1
    from public.community_players cp
    join public.community_members cm on cm.community_id = cp.community_id
    where cp.player_id = target_player_id
      and cp.active = true
      and cm.user_id = (select auth.uid())
      and cm.role = any(array['owner', 'admin'])
  );
$$;

revoke execute on function public.current_user_is_player_admin(uuid) from public, anon;
grant execute on function public.current_user_is_player_admin(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 4. Column lock: avatar_url may only change inside the approval flow
-- ----------------------------------------------------------------------------
create or replace function public.guard_avatar_url()
returns trigger
language plpgsql
as $$
begin
  if new.avatar_url is distinct from old.avatar_url
     and coalesce(current_setting('app.allow_avatar_promotion', true), '') <> 'on' then
    raise exception 'avatar_url can only be changed through the avatar approval flow'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_avatar_url on public.players;
create trigger trg_guard_avatar_url
  before update on public.players
  for each row execute function public.guard_avatar_url();

-- ----------------------------------------------------------------------------
-- 5. Proposals table
-- ----------------------------------------------------------------------------
create table if not exists public.player_avatar_proposals (
  id          uuid primary key default gen_random_uuid(),
  player_id   uuid not null references public.players(id) on delete cascade,
  proposed_by uuid not null references auth.users(id) on delete cascade,
  image_url   text not null,
  status      text not null default 'pending'
              check (status in ('pending', 'approved', 'rejected', 'superseded')),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists player_avatar_proposals_player_status_idx
  on public.player_avatar_proposals (player_id, status);
create index if not exists player_avatar_proposals_pending_idx
  on public.player_avatar_proposals (player_id) where status = 'pending';

alter table public.player_avatar_proposals enable row level security;

-- Read: any admin of the athlete (which includes the creator) sees its proposals.
-- Writes happen exclusively through the SECURITY DEFINER RPCs below, so there is
-- deliberately no INSERT/UPDATE/DELETE policy for the API roles.
drop policy if exists "Admins can read avatar proposals" on public.player_avatar_proposals;
create policy "Admins can read avatar proposals" on public.player_avatar_proposals
  for select to authenticated
  using (public.current_user_is_player_admin(player_id));

grant select on public.player_avatar_proposals to authenticated;

-- ----------------------------------------------------------------------------
-- 6. RPC: propose a new avatar
--    - any admin of the athlete may propose
--    - if the proposer IS the creator, it is auto-approved and promoted now
-- ----------------------------------------------------------------------------
create or replace function public.propose_player_avatar(
  p_player_id uuid,
  p_image_url text
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
  if not public.current_user_is_player_admin(p_player_id) then
    raise exception 'Only owners/admins of this athlete can propose a photo'
      using errcode = '42501';
  end if;

  select owner_id into v_owner_id from public.players where id = p_player_id;
  if v_owner_id is null then
    raise exception 'Athlete not found' using errcode = '22023';
  end if;
  v_is_creator := (v_owner_id = v_uid);

  insert into public.player_avatar_proposals (
    player_id, proposed_by, image_url, status, reviewed_by, reviewed_at
  )
  values (
    p_player_id, v_uid, p_image_url,
    case when v_is_creator then 'approved' else 'pending' end,
    case when v_is_creator then v_uid else null end,
    case when v_is_creator then now() else null end
  )
  returning id into v_proposal;

  -- Creator changes take effect immediately.
  if v_is_creator then
    perform set_config('app.allow_avatar_promotion', 'on', true);
    update public.players
       set avatar_url = p_image_url,
           updated_at = now()
     where id = p_player_id;
    -- Any older pending proposals are now stale.
    update public.player_avatar_proposals
       set status = 'superseded'
     where player_id = p_player_id
       and status = 'pending'
       and id <> v_proposal;
  end if;

  return v_proposal;
end;
$$;

revoke execute on function public.propose_player_avatar(uuid, text) from public, anon;
grant execute on function public.propose_player_avatar(uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 7. RPC: approve a pending proposal (creator only)
-- ----------------------------------------------------------------------------
create or replace function public.approve_player_avatar(p_proposal_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid      uuid := (select auth.uid());
  v_player   uuid;
  v_image    text;
  v_owner_id uuid;
begin
  select pr.player_id, pr.image_url
    into v_player, v_image
  from public.player_avatar_proposals pr
  where pr.id = p_proposal_id
    and pr.status = 'pending';

  if v_player is null then
    raise exception 'Proposal not found or not pending' using errcode = '22023';
  end if;

  select owner_id into v_owner_id from public.players where id = v_player;
  if v_owner_id is distinct from v_uid then
    raise exception 'Only the athlete creator can approve a photo'
      using errcode = '42501';
  end if;

  perform set_config('app.allow_avatar_promotion', 'on', true);
  update public.players
     set avatar_url = v_image,
         updated_at = now()
   where id = v_player;

  update public.player_avatar_proposals
     set status = 'approved', reviewed_by = v_uid, reviewed_at = now()
   where id = p_proposal_id;

  update public.player_avatar_proposals
     set status = 'superseded'
   where player_id = v_player
     and status = 'pending'
     and id <> p_proposal_id;
end;
$$;

revoke execute on function public.approve_player_avatar(uuid) from public, anon;
grant execute on function public.approve_player_avatar(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 8. RPC: reject a pending proposal (creator only)
-- ----------------------------------------------------------------------------
create or replace function public.reject_player_avatar(p_proposal_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid      uuid := (select auth.uid());
  v_player   uuid;
  v_owner_id uuid;
begin
  select pr.player_id into v_player
  from public.player_avatar_proposals pr
  where pr.id = p_proposal_id
    and pr.status = 'pending';

  if v_player is null then
    raise exception 'Proposal not found or not pending' using errcode = '22023';
  end if;

  select owner_id into v_owner_id from public.players where id = v_player;
  if v_owner_id is distinct from v_uid then
    raise exception 'Only the athlete creator can reject a photo'
      using errcode = '42501';
  end if;

  update public.player_avatar_proposals
     set status = 'rejected', reviewed_by = v_uid, reviewed_at = now()
   where id = p_proposal_id;
end;
$$;

revoke execute on function public.reject_player_avatar(uuid) from public, anon;
grant execute on function public.reject_player_avatar(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 9. Storage RLS — file writes mirror the proposal permission.
--    Candidate files are uploaded to: avatars/proposals/{playerId}/{uuid}.webp
--    storage.foldername(name) => {proposals, <playerId>}  (index 2 = playerId)
-- ----------------------------------------------------------------------------
drop policy if exists "Avatars are publicly readable" on storage.objects;
create policy "Avatars are publicly readable" on storage.objects
  for select
  using (bucket_id = 'avatars');

drop policy if exists "Player admins can upload avatar candidates" on storage.objects;
create policy "Player admins can upload avatar candidates" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = 'proposals'
    and public.current_user_is_player_admin(
          ((storage.foldername(name))[2])::uuid)
  );

drop policy if exists "Player admins can replace avatar candidates" on storage.objects;
create policy "Player admins can replace avatar candidates" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = 'proposals'
    and public.current_user_is_player_admin(
          ((storage.foldername(name))[2])::uuid)
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = 'proposals'
    and public.current_user_is_player_admin(
          ((storage.foldername(name))[2])::uuid)
  );

drop policy if exists "Player admins can delete avatar candidates" on storage.objects;
create policy "Player admins can delete avatar candidates" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = 'proposals'
    and public.current_user_is_player_admin(
          ((storage.foldername(name))[2])::uuid)
  );
