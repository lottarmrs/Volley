-- C6 XS-W2-06 — Replace critical Community CRUD writes
--
-- THE FIRST REAL AUTHORITY CUTOVER, and it is deliberately COHORT-SCOPED.
--
-- communities.authority_model marks which model owns a row:
--   'legacy'  communityCloudService keeps writing it exactly as today
--   'target'  the generic mutation path is DISABLED and semantic commands are the only
--             writer, which is precisely the slice exit gate
--
-- A community created through create_community_with_owner is born 'target'. Existing rows
-- stay 'legacy' until something migrates them, so nothing in production changes behaviour
-- the moment this ships. Two implementations coexist, but each row has exactly one writer,
-- so there is still one authority per aggregate (GINV-AUTH-001).
--
-- OPEN DECISIONS RESPECTED, NOT CLOSED:
--   OPEN-COM-004 (may an Admin archive, or only the Owner) is open, and its conservative
--     behaviour is "no permission by hierarchy assumption; capability must be explicit".
--     So community.archive is granted to OWNER alone -- the narrowest safe reading -- and
--     an Admin does NOT receive it by rank. Widening it later is a decision, not a bugfix.
--   RestoreCommunity is described by C6.01 as "if/when policy accepted". The policy is not
--     accepted, so no restore command exists here. Archiving is reversible only by an
--     operator until that policy lands.

alter table public.communities
  add column if not exists authority_model text not null default 'legacy'
    check (authority_model in ('legacy', 'target'));

comment on column public.communities.authority_model is
  'Which model owns writes for this row (C6 XS-W2-06). target => generic CRUD is refused.';

-- ── The cutover guard ──────────────────────────────────────────────────────
-- Refuses any direct write to a target-cohort community unless a semantic command
-- announced itself. The transaction-local flag follows the pattern already used elsewhere
-- in this schema (app.allow_user_link_promotion), so the mechanism is not novel here.
create or replace function public.guard_target_community_writes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(old.authority_model, 'legacy') <> 'target' then
    return coalesce(new, old);
  end if;

  if coalesce(current_setting('app.community_semantic_write', true), '') = 'on' then
    return coalesce(new, old);
  end if;

  raise exception
    'Community % is target-cohort: use the semantic commands, not a generic write',
    old.id
    using errcode = '42501';
end;
$$;

revoke all on function public.guard_target_community_writes() from public, anon, authenticated;

drop trigger if exists guard_target_community_writes_upd on public.communities;
create trigger guard_target_community_writes_upd
  before update on public.communities
  for each row execute function public.guard_target_community_writes();

drop trigger if exists guard_target_community_writes_del on public.communities;
create trigger guard_target_community_writes_del
  before delete on public.communities
  for each row execute function public.guard_target_community_writes();

-- ── Capability additions ───────────────────────────────────────────────────
-- Extends the XS-W2-03 resolver. Profile editing is governance (it changes what the
-- community IS), so OWNER and ADMIN both hold it -- which also preserves the capability the
-- legacy mapping already granted an admin. Archiving stays with the OWNER alone.
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
  select c.capability
    from public.community_memberships m
    cross join lateral (
      select unnest(
        case m.role
          when 'owner' then array[
            'community.members.manage',
            'community.ownership.transfer',
            'community.profile.update',
            'community.archive'
          ]
          when 'admin' then array[
            'community.members.manage',
            'community.profile.update'
          ]
          else array[]::text[]
        end
      ) as capability
    ) c
   where m.community_id = target_community_id
     and m.user_id = target_user_id
     and m.status = 'active'

  union

  select 'session.manage'
    from public.community_responsibilities r
   where r.community_id = target_community_id
     and r.user_id = target_user_id
     and r.responsibility = 'ORGANIZER'
     and r.revoked_at is null;

  -- Still deliberately absent: player.evaluate, match.control, competition.admin.
$$;

-- ── CreateCommunity is now born into the target cohort ─────────────────────
create or replace function public.create_community_with_owner(p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_community_id uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if coalesce(btrim(p_name), '') = '' then
    raise exception 'Community name is required' using errcode = '23514';
  end if;

  insert into public.communities (name, owner_id, authority_model)
  values (btrim(p_name), v_uid, 'target')
  returning id into v_community_id;

  insert into public.community_memberships (community_id, user_id, role, status)
  values (v_community_id, v_uid, 'owner', 'active');

  return v_community_id;
end;
$$;

-- ── UpdateCommunityProfile ─────────────────────────────────────────────────
-- Named columns only. A generic patch is exactly the shape this slice removes: it lets a
-- caller reach owner_id or authority_model and quietly change who owns the row.
create or replace function public.update_community_profile(
  p_community_id uuid,
  p_name text default null,
  p_description text default null,
  p_default_location text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if not public.current_user_has_community_capability(p_community_id, 'community.profile.update') then
    raise exception 'Missing capability community.profile.update' using errcode = '42501';
  end if;

  if p_name is not null and btrim(p_name) = '' then
    raise exception 'Community name cannot be blank' using errcode = '23514';
  end if;

  perform set_config('app.community_semantic_write', 'on', true);

  update public.communities
     set name = coalesce(nullif(btrim(p_name), ''), name),
         description = coalesce(p_description, description),
         default_location = coalesce(p_default_location, default_location)
   where id = p_community_id;

  perform set_config('app.community_semantic_write', 'off', true);
end;
$$;

revoke all on function public.update_community_profile(uuid, text, text, text) from public, anon;
grant execute on function public.update_community_profile(uuid, text, text, text) to authenticated;

-- ── ArchiveCommunity ───────────────────────────────────────────────────────
create or replace function public.archive_community(p_community_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  -- OWNER only, per the conservative reading of OPEN-COM-004.
  if not public.current_user_has_community_capability(p_community_id, 'community.archive') then
    raise exception 'Missing capability community.archive' using errcode = '42501';
  end if;

  perform set_config('app.community_semantic_write', 'on', true);
  update public.communities set archived = true where id = p_community_id;
  perform set_config('app.community_semantic_write', 'off', true);
end;
$$;

revoke all on function public.archive_community(uuid) from public, anon;
grant execute on function public.archive_community(uuid) to authenticated;

-- ── TransferOwnership must announce itself too ─────────────────────────────
-- It writes communities.owner_id, so without the flag the new guard would refuse the very
-- command that is supposed to be allowed. This is the integration point the guard forces.
create or replace function public.transfer_community_ownership_v2(
  p_community_id uuid,
  p_new_owner_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_current_owner_id uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_new_owner_user_id = v_uid then
    raise exception 'Ownership is already held by this account' using errcode = '23514';
  end if;

  select m.id into v_current_owner_id
    from public.community_memberships m
   where m.community_id = p_community_id
     and m.role = 'owner'
     and m.status = 'active'
   for update;

  if v_current_owner_id is null then
    raise exception 'Community % has no active owner', p_community_id using errcode = '23514';
  end if;

  if not exists (
    select 1 from public.community_memberships m
     where m.id = v_current_owner_id and m.user_id = v_uid
  ) then
    raise exception 'Only the current owner may transfer ownership' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.community_memberships m
     where m.community_id = p_community_id
       and m.user_id = p_new_owner_user_id
       and m.status = 'active'
  ) then
    raise exception 'The new owner must already be an active member' using errcode = '23514';
  end if;

  update public.community_memberships
     set role = 'admin', updated_at = now()
   where id = v_current_owner_id;

  update public.community_memberships
     set role = 'owner', updated_at = now()
   where community_id = p_community_id
     and user_id = p_new_owner_user_id;

  perform set_config('app.community_semantic_write', 'on', true);
  update public.communities
     set owner_id = p_new_owner_user_id
   where id = p_community_id;
  perform set_config('app.community_semantic_write', 'off', true);
end;
$$;
