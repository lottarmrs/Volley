create table public.session_organizer_assignments (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  community_membership_id uuid references public.community_memberships(id) on delete set null,
  organizer_user_id uuid references auth.users(id) on delete set null,
  assigned_at timestamptz not null default now(),
  assigned_by_user_id uuid references auth.users(id) on delete set null,
  revoked_at timestamptz,
  revoked_by_user_id uuid references auth.users(id) on delete set null
);

create index session_organizer_assignments_active_session_idx
  on public.session_organizer_assignments (session_id)
  where revoked_at is null;

create unique index session_organizer_assignments_active_session_user_idx
  on public.session_organizer_assignments (session_id, organizer_user_id)
  where revoked_at is null and organizer_user_id is not null;

alter table public.session_organizer_assignments enable row level security;
revoke all on public.session_organizer_assignments from public, anon, authenticated;
grant select on public.session_organizer_assignments to authenticated;

create policy "Organizers and active Community members can read session organizer assignments"
  on public.session_organizer_assignments
  for select to authenticated
  using (
    organizer_user_id = (select auth.uid())
    or exists (
      select 1
        from public.sessions s
        join public.community_memberships m
          on m.community_id = s.community_id
       where s.id = session_organizer_assignments.session_id
         and s.session_context = 'COMMUNITY'
         and m.user_id = (select auth.uid())
         and m.status = 'active'
    )
  );

create schema if not exists app_private;

create or replace function app_private.current_user_has_valid_target_session_organizer_assignment(
  p_session_id uuid
)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1
      from public.sessions s
      join public.session_organizer_assignments a on a.session_id = s.id
     where s.id = p_session_id
       and s.authority_model = 'target'
       and a.revoked_at is null
       and a.organizer_user_id = (select auth.uid())
       and (
         (s.session_context = 'QUICK' and a.community_membership_id is null)
         or (
           s.session_context = 'COMMUNITY'
           and exists (
             select 1
               from public.community_memberships m
              where m.id = a.community_membership_id
                and m.community_id = s.community_id
                and m.user_id = (select auth.uid())
                and m.status = 'active'
           )
           and exists (
             select 1
               from public.community_responsibilities r
              where r.community_id = s.community_id
                and r.user_id = (select auth.uid())
                and r.responsibility = 'ORGANIZER'
                and r.revoked_at is null
           )
         )
       )
  );
$$;

revoke all on function app_private.current_user_has_valid_target_session_organizer_assignment(uuid)
  from public, anon, authenticated;

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
    join public.community_memberships m
      on m.community_id = r.community_id
     and m.user_id = r.user_id
     and m.status = 'active'
   where r.community_id = target_community_id
     and r.user_id = target_user_id
     and r.responsibility = 'ORGANIZER'
     and r.revoked_at is null;
$$;

revoke all on function public.community_capabilities(uuid, uuid) from public;
grant execute on function public.community_capabilities(uuid, uuid) to authenticated;

create or replace function public.assert_target_session_write_authorized(p_session public.sessions)
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

  if not app_private.current_user_has_valid_target_session_organizer_assignment(p_session.id) then
    raise exception 'Missing valid Session organizer assignment' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.assert_target_session_write_authorized(public.sessions)
  from public, anon, authenticated;

create or replace function public.create_target_session(
  p_session_id uuid,
  p_community_id uuid,
  p_session_context text,
  p_play_mode text,
  p_name text,
  p_planned_start_at timestamptz default null,
  p_planned_end_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_membership_id uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_session_id is null then
    raise exception 'Session id is required and final' using errcode = '23514';
  end if;
  if p_session_context is null or p_session_context not in ('QUICK', 'COMMUNITY') then
    raise exception 'Invalid Session context' using errcode = '23514';
  end if;
  if p_play_mode is null or p_play_mode not in ('FREE_PLAY', 'STRUCTURED_MATCHES') then
    raise exception 'Invalid Session play mode' using errcode = '23514';
  end if;
  if coalesce(btrim(p_name), '') = '' then
    raise exception 'Session name is required' using errcode = '23514';
  end if;
  if p_session_context = 'COMMUNITY' and p_community_id is null then
    raise exception 'COMMUNITY Session requires a Community' using errcode = '23514';
  end if;
  if p_planned_end_at is not null and p_planned_start_at is not null
     and p_planned_end_at < p_planned_start_at then
    raise exception 'Planned Session end cannot precede its start' using errcode = '23514';
  end if;

  if p_session_context = 'COMMUNITY' then
    select m.id into v_membership_id
      from public.community_memberships m
     where m.community_id = p_community_id
       and m.user_id = v_uid
       and m.status = 'active';

    if v_membership_id is null then
      raise exception 'Active Community Membership is required' using errcode = '42501';
    end if;
    if not exists (
      select 1
        from public.community_responsibilities r
       where r.community_id = p_community_id
         and r.user_id = v_uid
         and r.responsibility = 'ORGANIZER'
         and r.revoked_at is null
    ) then
      raise exception 'Missing capability session.manage' using errcode = '42501';
    end if;
  elsif p_community_id is not null
     and not public.current_user_has_community_capability(p_community_id, 'session.manage') then
    raise exception 'Missing capability session.manage' using errcode = '42501';
  end if;

  insert into public.sessions (
    id, owner_id, community_id, name, date, status, type,
    authority_model, target_model_version, session_context, play_mode,
    lifecycle_status, publication_state, planned_start_at, planned_end_at, revision
  )
  values (
    p_session_id, v_uid, p_community_id, btrim(p_name),
    coalesce(p_planned_start_at::date, current_date),
    public.target_session_compatibility_status('DRAFT'),
    public.target_session_compatibility_type(p_play_mode),
    'target', 1, p_session_context, p_play_mode,
    'DRAFT', 'PRIVATE', p_planned_start_at, p_planned_end_at, 1
  );

  insert into public.session_organizer_assignments (
    session_id, community_membership_id, organizer_user_id, assigned_by_user_id
  )
  values (p_session_id, v_membership_id, v_uid, v_uid);

  return p_session_id;
end;
$$;

revoke all on function public.create_target_session(uuid, uuid, text, text, text, timestamptz, timestamptz)
  from public, anon;
grant execute on function public.create_target_session(uuid, uuid, text, text, text, timestamptz, timestamptz)
  to authenticated;

create or replace function public.read_target_session(p_session_id uuid)
returns table (
  id uuid,
  community_id uuid,
  name text,
  session_context text,
  play_mode text,
  lifecycle_status text,
  publication_state text,
  planned_start_at timestamptz,
  planned_end_at timestamptz,
  actual_started_at timestamptz,
  actual_finished_at timestamptz,
  revision integer,
  compatibility_type text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.sessions;
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select * into v_session
    from public.sessions s
   where s.id = p_session_id and s.authority_model = 'target';

  if not found then
    raise exception 'Target Session not found' using errcode = 'P0002';
  end if;

  if v_session.session_context = 'QUICK' then
    if not exists (
      select 1
        from public.session_organizer_assignments a
       where a.session_id = v_session.id
         and a.organizer_user_id = v_uid
         and a.community_membership_id is null
         and a.revoked_at is null
    ) then
      raise exception 'Not authorized to read this Quick Session' using errcode = '42501';
    end if;
  elsif not exists (
    select 1
      from public.community_memberships m
     where m.community_id = v_session.community_id
       and m.user_id = v_uid
       and m.status = 'active'
  ) then
    raise exception 'Not authorized to read this Community Session' using errcode = '42501';
  end if;

  return query
    select
      v_session.id,
      v_session.community_id,
      v_session.name,
      v_session.session_context,
      v_session.play_mode,
      v_session.lifecycle_status,
      v_session.publication_state,
      v_session.planned_start_at,
      v_session.planned_end_at,
      v_session.actual_started_at,
      v_session.actual_finished_at,
      v_session.revision,
      public.target_session_compatibility_type(v_session.play_mode);
end;
$$;

revoke all on function public.read_target_session(uuid) from public, anon;
grant execute on function public.read_target_session(uuid) to authenticated;
