create table public.session_courts (
  id uuid primary key,
  session_id uuid not null references public.sessions(id) on delete cascade,
  label text not null,
  court_order integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint session_courts_label_check check (btrim(label) <> ''),
  constraint session_courts_order_check check (court_order >= 1),
  constraint session_courts_session_order_key unique (session_id, court_order)
);

create index session_courts_session_id_idx on public.session_courts (session_id);

alter table public.session_courts enable row level security;
revoke all on public.session_courts from public, anon, authenticated;
grant select on public.session_courts to authenticated;

create or replace function app_private.current_user_can_read_target_session_courts(
  p_session_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.sessions s
     where s.id = p_session_id
       and s.authority_model = 'target'
       and (
         (
           s.session_context = 'COMMUNITY'
           and exists (
             select 1
               from public.community_memberships m
              where m.community_id = s.community_id
                and m.user_id = (select auth.uid())
                and m.status = 'active'
           )
         )
         or (
           s.session_context = 'QUICK'
           and exists (
             select 1
               from public.session_organizer_assignments a
              where a.session_id = s.id
                and a.organizer_user_id = (select auth.uid())
                and a.community_membership_id is null
                and a.revoked_at is null
           )
         )
       )
  );
$$;

revoke all on function app_private.current_user_can_read_target_session_courts(uuid)
  from public, anon, authenticated;
grant execute on function app_private.current_user_can_read_target_session_courts(uuid)
  to authenticated;

create policy "Active Community members and assigned Quick Organizers can read Session Courts"
  on public.session_courts
  for select to authenticated
  using (app_private.current_user_can_read_target_session_courts(session_id));

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
  if p_session_context = 'QUICK' and p_community_id is not null then
    raise exception 'QUICK Session cannot have a Community' using errcode = '23514';
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

  insert into public.session_courts (id, session_id, label, court_order)
  values (gen_random_uuid(), p_session_id, 'Quadra 1', 1);

  return p_session_id;
end;
$$;

revoke all on function public.create_target_session(uuid, uuid, text, text, text, timestamptz, timestamptz)
  from public, anon;
grant execute on function public.create_target_session(uuid, uuid, text, text, text, timestamptz, timestamptz)
  to authenticated;

create function public.add_target_session_court(
  p_court_id uuid,
  p_session_id uuid,
  p_expected_revision integer,
  p_label text,
  p_court_order integer
)
returns table (court_id uuid, session_revision integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.sessions;
begin
  select * into v_session
    from public.sessions
   where id = p_session_id and authority_model = 'target'
   for update;

  if not found then
    raise exception 'Target Session not found' using errcode = 'P0002';
  end if;
  perform public.assert_target_session_write_authorized(v_session);
  if p_court_id is null then
    raise exception 'Court id is required and final' using errcode = '23514';
  end if;
  if v_session.revision is distinct from p_expected_revision then
    raise exception 'Stale Session revision' using errcode = '40001';
  end if;
  if coalesce(btrim(p_label), '') = '' then
    raise exception 'Court label is required' using errcode = '23514';
  end if;
  if p_court_order is null or p_court_order < 1 then
    raise exception 'Court order must be at least one' using errcode = '23514';
  end if;
  if v_session.lifecycle_status in ('COMPLETED', 'CANCELLED') then
    raise exception 'Cannot add Courts to a terminal Session' using errcode = '23514';
  end if;

  insert into public.session_courts (id, session_id, label, court_order)
  values (p_court_id, p_session_id, btrim(p_label), p_court_order);

  update public.sessions
     set revision = revision + 1,
         updated_at = now()
   where id = p_session_id;

  return query select p_court_id, v_session.revision + 1;
end;
$$;

revoke all on function public.add_target_session_court(uuid, uuid, integer, text, integer)
  from public, anon;
grant execute on function public.add_target_session_court(uuid, uuid, integer, text, integer)
  to authenticated;
