-- XS-W6-08c: closes OPEN-REG-006. Reopen is its own command, allowed only before the Session
-- starts, so open_registration keeps refusing to leave CLOSED or LOCKED.

create function public.reopen_registration(
  p_command_id uuid,
  p_window_id uuid,
  p_expected_revision integer
)
returns table (window_revision integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.sessions;
  v_window public.registration_windows;
  v_receipt jsonb;
  v_result jsonb;
  v_new_revision integer;
begin
  if p_command_id is null or p_window_id is null then
    raise exception 'command_id and window_id are required' using errcode = '23514';
  end if;

  select s.* into v_session
    from public.sessions s
    join public.registration_windows w on w.session_id = s.id
   where w.id = p_window_id
   for update of s;
  if not found then
    raise exception 'Registration Window not found' using errcode = 'P0002';
  end if;

  select * into v_window from public.registration_windows where id = p_window_id for update;
  if not found then
    raise exception 'Registration Window not found' using errcode = 'P0002';
  end if;

  perform public.assert_target_session_write_authorized(v_session);

  v_receipt := app_private.find_command_receipt(p_command_id, 'reopen_registration', p_window_id);
  if v_receipt is not null then
    return query select (v_receipt ->> 'window_revision')::integer;
    return;
  end if;

  if v_session.lifecycle_status not in ('DRAFT', 'SCHEDULED') then
    raise exception 'Session must be DRAFT or SCHEDULED to reopen Registration'
      using errcode = '23514';
  end if;

  if v_window.status = 'OPEN' then
    v_result := pg_catalog.jsonb_build_object('window_revision', v_window.revision);
    perform app_private.record_command_receipt(
      p_command_id, (select auth.uid()), 'reopen_registration', p_window_id,
      v_result, 'REGISTRATION_LIFECYCLE'
    );
    return query select v_window.revision;
    return;
  end if;

  if v_window.status not in ('CLOSED', 'LOCKED') then
    raise exception 'Registration Window in status % cannot be reopened', v_window.status
      using errcode = '23514';
  end if;

  if v_window.revision is distinct from p_expected_revision then
    raise exception 'Stale Registration Window revision' using errcode = '40001';
  end if;

  update public.registration_windows
     set status = 'OPEN',
         revision = revision + 1,
         updated_at = pg_catalog.now()
   where id = p_window_id
  returning revision into v_new_revision;

  v_result := pg_catalog.jsonb_build_object('window_revision', v_new_revision);
  perform app_private.record_command_receipt(
    p_command_id, (select auth.uid()), 'reopen_registration', p_window_id,
    v_result, 'REGISTRATION_LIFECYCLE'
  );

  return query select v_new_revision;
end;
$$;

revoke all on function public.reopen_registration(uuid, uuid, integer) from public, anon;
grant execute on function public.reopen_registration(uuid, uuid, integer) to authenticated;

create function public.read_registration_window(p_window_id uuid)
returns table (
  window_id uuid,
  session_id uuid,
  status text,
  revision integer,
  capacity integer,
  confirmed_player_ids uuid[]
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.sessions;
  v_window public.registration_windows;
begin
  if (select auth.uid()) is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_window_id is null then
    raise exception 'window_id is required' using errcode = '23514';
  end if;

  select * into v_window from public.registration_windows w where w.id = p_window_id;
  if not found then
    raise exception 'Registration Window not found' using errcode = 'P0002';
  end if;

  select * into v_session from public.sessions s where s.id = v_window.session_id;
  perform public.assert_target_session_write_authorized(v_session);

  return query
    select v_window.id,
           v_window.session_id,
           v_window.status,
           v_window.revision,
           v_window.capacity,
           coalesce(
             (select pg_catalog.array_agg(e.player_id order by e.joined_at, e.id)
                from public.registration_entries e
               where e.registration_window_id = v_window.id
                 and e.status = 'CONFIRMED'),
             array[]::uuid[]
           );
end;
$$;

revoke all on function public.read_registration_window(uuid) from public, anon;
grant execute on function public.read_registration_window(uuid) to authenticated;
