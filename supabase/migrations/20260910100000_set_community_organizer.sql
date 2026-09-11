create function public.set_community_organizer(
  p_community_id uuid,
  p_user_id uuid,
  p_enabled boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_enabled is null then
    raise exception 'enabled is required' using errcode = '23514';
  end if;
  if p_community_id is null or p_user_id is null
     or not public.current_user_has_community_capability(p_community_id, 'community.members.manage')
  then
    raise exception 'Not authorized to manage organizers in this Community' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.community_memberships
     where community_id = p_community_id and user_id = p_user_id and status = 'active'
  ) then
    raise exception 'Organizer must be an active Community member' using errcode = '23514';
  end if;

  if not p_enabled then
    update public.community_responsibilities
       set revoked_at = pg_catalog.now()
     where community_id = p_community_id
       and user_id = p_user_id
       and responsibility = 'ORGANIZER'
       and revoked_at is null;
    return;
  end if;

  insert into public.community_responsibilities (
    community_id, user_id, responsibility, assigned_by
  )
  values (p_community_id, p_user_id, 'ORGANIZER', (select auth.uid()))
  on conflict (community_id, user_id, responsibility) do update
    set revoked_at = null,
        assigned_at = pg_catalog.now(),
        assigned_by = (select auth.uid());
end;
$$;

revoke all on function public.set_community_organizer(uuid, uuid, boolean) from public, anon;
grant execute on function public.set_community_organizer(uuid, uuid, boolean) to authenticated;
