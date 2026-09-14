-- C6 XS-W3-09 — Mirror legacy community_members into the target membership model
--
-- The split of 20260827140000 was expand-only: community_members stayed authoritative, and every
-- RPC the members panel calls still writes only there. Everything C6 reads -- community_capabilities,
-- set_community_organizer, set_community_evaluator, create_target_session -- requires an active row
-- in community_memberships. A member added after the split had none, a removed member kept theirs,
-- and a promotion to organizador never became an ORGANIZER responsibility.
--
-- DUAL WRITE, C6 master §10.4. community_members is canonical for legacy Communities; one trigger
-- owns the second write for every legacy writer, in the same transaction; drift is measured by
-- app_private.community_membership_drift(); the trigger is removed by the W2 membership cutover.
-- Target-cohort Communities are not mirrored: their semantic commands write memberships directly.

-- ── Legacy last-owner guard: a non-owner DELETE was silently cancelled ──────
-- This BEFORE trigger ended every path with `return new`. On DELETE, new is NULL, and a BEFORE
-- trigger returning NULL skips the row without an error -- so remove_community_member and
-- leave_community reported success and removed nobody who was not an owner, since 20260610161203.
-- The mirror below would have faithfully reproduced that: a removed member kept their legacy row,
-- so they kept their membership and their ORGANIZER.
create or replace function public.prevent_last_community_owner_change()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  owner_count integer;
begin
  -- Reset autorizado (master + AAL2) desativa o guard dentro da transacao.
  if coalesce(current_setting('app.allow_reset_bypass', true), '') = 'on' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'DELETE' and old.role = 'owner' then
    select count(*) into owner_count
    from public.community_members
    where community_id = old.community_id and role = 'owner';

    if owner_count <= 1 then
      raise exception 'Cannot remove the last owner from a community'
        using errcode = '23514';
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' and old.role = 'owner' and new.role <> 'owner' then
    select count(*) into owner_count
    from public.community_members
    where community_id = old.community_id and role = 'owner';

    if owner_count <= 1 then
      raise exception 'Cannot demote the last owner from a community'
        using errcode = '23514';
    end if;
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke execute on function public.prevent_last_community_owner_change() from public, anon, authenticated;

create or replace function app_private.legacy_membership_mirrored(p_community_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.communities c
     where c.id = p_community_id
       and c.authority_model = 'legacy'
       and exists (
         select 1 from public.community_members m
          where m.community_id = c.id and m.role = 'owner' and m.status = 'active'
       )
  );
$$;

-- Idempotent: derives the target rows for one (community, user) from the current legacy row, so the
-- trigger and the reconciliation share one definition of "what the projection should be".
create or replace function app_private.project_legacy_community_membership(
  p_community_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_legacy_role text;
  v_target_role text;
begin
  if not app_private.legacy_membership_mirrored(p_community_id) then
    return;
  end if;

  select m.role into v_legacy_role
    from public.community_members m
   where m.community_id = p_community_id and m.user_id = p_user_id and m.status = 'active';

  if v_legacy_role is null then
    -- Losing the membership ends every duty tied to it; otherwise rejoining would silently
    -- restore them.
    delete from public.community_memberships
     where community_id = p_community_id and user_id = p_user_id;
    update public.community_responsibilities
       set revoked_at = pg_catalog.now()
     where community_id = p_community_id and user_id = p_user_id and revoked_at is null;
    return;
  end if;

  v_target_role := case v_legacy_role
    when 'owner' then 'owner'
    when 'admin' then 'admin'
    else 'member'
  end;

  -- The legacy transfer promotes the new owner before demoting the old one, and
  -- community_memberships_one_active_owner is immediate. Demoting first matches the legacy
  -- transfer's next statement; the deferred owner invariant judges the final state.
  if v_target_role = 'owner' then
    update public.community_memberships
       set role = 'admin', updated_at = pg_catalog.now()
     where community_id = p_community_id
       and user_id <> p_user_id
       and role = 'owner'
       and status = 'active';
  end if;

  insert into public.community_memberships (community_id, user_id, role, status)
  values (p_community_id, p_user_id, v_target_role, 'active')
  on conflict (community_id, user_id) do update
    set role = excluded.role, status = 'active', updated_at = pg_catalog.now()
    where public.community_memberships.role is distinct from excluded.role
       or public.community_memberships.status <> 'active';
end;
$$;

create or replace function app_private.mirror_community_member_to_target()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_was_organizer boolean := false;
  v_is_organizer boolean := false;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    v_was_organizer := old.role = 'organizador' and old.status = 'active';
    perform app_private.project_legacy_community_membership(old.community_id, old.user_id);
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    v_is_organizer := new.role = 'organizador' and new.status = 'active';
    perform app_private.project_legacy_community_membership(new.community_id, new.user_id);

    -- Only the organizador transition touches ORGANIZER, so a responsibility granted through
    -- set_community_organizer survives an unrelated change such as member -> admin.
    if v_is_organizer and not v_was_organizer
       and app_private.legacy_membership_mirrored(new.community_id) then
      insert into public.community_responsibilities (
        community_id, user_id, responsibility, assigned_by
      )
      values (new.community_id, new.user_id, 'ORGANIZER', (select auth.uid()))
      on conflict (community_id, user_id, responsibility) do update
        set revoked_at = null,
            assigned_at = pg_catalog.now(),
            assigned_by = (select auth.uid())
        where public.community_responsibilities.revoked_at is not null;
    end if;
  end if;

  if tg_op = 'UPDATE' and v_was_organizer and not v_is_organizer
     and new.status = 'active'
     and app_private.legacy_membership_mirrored(old.community_id) then
    update public.community_responsibilities
       set revoked_at = pg_catalog.now()
     where community_id = old.community_id
       and user_id = old.user_id
       and responsibility = 'ORGANIZER'
       and revoked_at is null;
  end if;

  return null;
end;
$$;

drop trigger if exists mirror_community_member_to_target on public.community_members;
create trigger mirror_community_member_to_target
  after insert or update or delete on public.community_members
  for each row execute function app_private.mirror_community_member_to_target();

-- Measures the dual write: every row is a place where the target model differs from what the
-- projection of community_members says it should be.
create or replace function app_private.community_membership_drift()
returns table (community_id uuid, user_id uuid, issue text)
language sql
stable
security definer
set search_path = ''
as $$
  with mirrored as (
    select c.id
      from public.communities c
     where app_private.legacy_membership_mirrored(c.id)
  ),
  legacy as (
    select m.community_id, m.user_id, m.role,
           case m.role when 'owner' then 'owner' when 'admin' then 'admin' else 'member' end
             as target_role
      from public.community_members m
      join mirrored on mirrored.id = m.community_id
     where m.status = 'active'
  )
  select l.community_id, l.user_id, 'MISSING_MEMBERSHIP'
    from legacy l
   where not exists (
     select 1 from public.community_memberships t
      where t.community_id = l.community_id and t.user_id = l.user_id and t.status = 'active'
   )
  union all
  select l.community_id, l.user_id, 'ROLE_MISMATCH'
    from legacy l
    join public.community_memberships t
      on t.community_id = l.community_id and t.user_id = l.user_id and t.status = 'active'
   where t.role <> l.target_role
  union all
  select t.community_id, t.user_id, 'ORPHAN_MEMBERSHIP'
    from public.community_memberships t
    join mirrored on mirrored.id = t.community_id
   where not exists (
     select 1 from legacy l where l.community_id = t.community_id and l.user_id = t.user_id
   )
  union all
  select l.community_id, l.user_id, 'MISSING_ORGANIZER'
    from legacy l
   where l.role = 'organizador'
     and not exists (
       select 1 from public.community_responsibilities r
        where r.community_id = l.community_id and r.user_id = l.user_id
          and r.responsibility = 'ORGANIZER' and r.revoked_at is null
     )
  union all
  select r.community_id, r.user_id, 'ORPHAN_RESPONSIBILITY'
    from public.community_responsibilities r
    join mirrored on mirrored.id = r.community_id
   where r.revoked_at is null
     and not exists (
       select 1 from legacy l where l.community_id = r.community_id and l.user_id = r.user_id
     )
  union all
  select c.id, null::uuid, 'OWNERLESS_COMMUNITY'
    from public.communities c
   where c.authority_model = 'legacy'
     and not exists (
       select 1 from public.community_members m
        where m.community_id = c.id and m.role = 'owner' and m.status = 'active'
     );
$$;

revoke all on function app_private.legacy_membership_mirrored(uuid) from public, anon, authenticated;
revoke all on function app_private.project_legacy_community_membership(uuid, uuid)
  from public, anon, authenticated;
revoke all on function app_private.mirror_community_member_to_target() from public, anon, authenticated;
revoke all on function app_private.community_membership_drift() from public, anon, authenticated;
