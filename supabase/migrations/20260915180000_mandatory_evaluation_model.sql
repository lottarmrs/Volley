-- XS-W6-08a: the versioned evaluation model is mandatory for every Community, and the legacy
-- roles that already carry manage_sessions (owner, admin, moderator, organizador) hold ORGANIZER.
-- Target-model Communities keep GINV-CAP-002: no operational duty from governance rank.

insert into app_private.community_evaluation_cutovers (community_id, activated_by)
select c.id, null
  from public.communities c
on conflict (community_id) do nothing;

create or replace function app_private.activate_evaluation_model_for_new_community()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into app_private.community_evaluation_cutovers (community_id, activated_by)
  values (new.id, (select auth.uid()))
  on conflict (community_id) do nothing;
  return null;
end;
$$;

revoke all on function app_private.activate_evaluation_model_for_new_community()
  from public, anon, authenticated;

drop trigger if exists activate_evaluation_model_on_community_insert on public.communities;
create trigger activate_evaluation_model_on_community_insert
  after insert on public.communities
  for each row execute function app_private.activate_evaluation_model_for_new_community();

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
    v_was_organizer := old.role in ('owner', 'admin', 'moderator', 'organizador')
      and old.status = 'active';
    perform app_private.project_legacy_community_membership(old.community_id, old.user_id);
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    v_is_organizer := new.role in ('owner', 'admin', 'moderator', 'organizador')
      and new.status = 'active';
    perform app_private.project_legacy_community_membership(new.community_id, new.user_id);

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

revoke all on function app_private.mirror_community_member_to_target()
  from public, anon, authenticated;

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
   where l.role in ('owner', 'admin', 'moderator', 'organizador')
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

revoke all on function app_private.community_membership_drift() from public, anon, authenticated;

insert into public.community_responsibilities (community_id, user_id, responsibility)
select m.community_id, m.user_id, 'ORGANIZER'
  from public.community_members m
 where m.role in ('owner', 'admin', 'moderator', 'organizador')
   and m.status = 'active'
   and app_private.legacy_membership_mirrored(m.community_id)
on conflict (community_id, user_id, responsibility) do update
  set revoked_at = null, assigned_at = pg_catalog.now()
  where public.community_responsibilities.revoked_at is not null;
