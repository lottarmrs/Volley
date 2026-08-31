-- C6 XS-W4-03 Task 2 — JoinRegistration and organizer-added entries
--
-- Two commands over the Window aggregate (public.registration_windows), added under W4-01's
-- schema, W4-02's lifecycle commands and W3-06's receipt substrate. Both commands share the
-- same lock-then-authorize-then-receipt-then-allocate shape as
-- 20260831132100_registration_lifecycle_commands.sql: null-check caller-supplied ids, load-and-
-- lock the governing Session first (raising P0002 when absent), then load-and-lock the Window,
-- check write authority, consult app_private.find_command_receipt for a retried command_id,
-- validate the desired state, delegate the capacity/FIFO decision to
-- app_private.allocate_registration_slot, then record the receipt.
--
-- Neither command takes an expected_revision: the Window's revision moves on every join, so a
-- caller holding one would conflict over other people's joins, not just their own.

create function app_private.current_user_can_join_registration(p_window_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.registration_windows w
      join public.sessions s on s.id = w.session_id
      join public.community_memberships m
        on m.community_id = s.community_id
       and m.user_id = (select auth.uid())
       and m.status = 'active'
     where w.id = p_window_id
  );
$$;

revoke all on function app_private.current_user_can_join_registration(uuid)
  from public, anon, authenticated;

create function public.join_registration(
  p_command_id uuid,
  p_entry_id uuid,
  p_window_id uuid
)
returns table (entry_status text, window_revision integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.sessions;
  v_window public.registration_windows;
  v_receipt jsonb;
  v_result jsonb;
  v_player_id uuid;
  v_allocation jsonb;
begin
  if p_command_id is null or p_entry_id is null or p_window_id is null then
    raise exception 'command_id, entry_id and window_id are required' using errcode = '23514';
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

  if not app_private.current_user_can_join_registration(p_window_id) then
    raise exception 'Not an active member of this Registration Window''s Community'
      using errcode = '42501';
  end if;

  v_receipt := app_private.find_command_receipt(p_command_id, 'join_registration', p_window_id);
  if v_receipt is not null then
    return query
      select (v_receipt ->> 'entry_status')::text, (v_receipt ->> 'window_revision')::integer;
    return;
  end if;

  if v_session.lifecycle_status not in ('DRAFT', 'SCHEDULED') then
    raise exception 'Session must be DRAFT or SCHEDULED to join Registration' using errcode = '23514';
  end if;

  if v_window.status <> 'OPEN' then
    raise exception 'Registration Window must be OPEN to join' using errcode = '23514';
  end if;

  if v_window.closes_at is not null and pg_catalog.now() >= v_window.closes_at then
    raise exception 'Registration Window is past its closing time' using errcode = '23514';
  end if;

  v_player_id := public.current_user_active_player_id();
  if v_player_id is null then
    raise exception 'Caller has no ACTIVE Player account link' using errcode = '42501';
  end if;

  if not exists (
    select 1
      from public.community_players cp
     where cp.community_id = v_session.community_id
       and cp.player_id = v_player_id
       and cp.deleted_at is null
       and cp.active
  ) then
    raise exception 'Player % is not on this Community''s roster', v_player_id
      using errcode = '42501';
  end if;

  v_allocation := app_private.allocate_registration_slot(
    p_entry_id, p_window_id, v_player_id, 'SELF_JOIN', (select auth.uid())
  );

  v_result := pg_catalog.jsonb_build_object(
    'entry_status', v_allocation ->> 'status',
    'window_revision', (v_allocation ->> 'window_revision')::integer
  );
  perform app_private.record_command_receipt(
    p_command_id, (select auth.uid()), 'join_registration', p_window_id,
    v_result, 'REGISTRATION_ENTRY'
  );

  return query
    select (v_result ->> 'entry_status')::text, (v_result ->> 'window_revision')::integer;
end;
$$;

revoke all on function public.join_registration(uuid, uuid, uuid) from public, anon;
grant execute on function public.join_registration(uuid, uuid, uuid) to authenticated;

create function public.add_registration_entry(
  p_command_id uuid,
  p_entry_id uuid,
  p_window_id uuid,
  p_player_id uuid
)
returns table (entry_status text, window_revision integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.sessions;
  v_window public.registration_windows;
  v_receipt jsonb;
  v_result jsonb;
  v_allocation jsonb;
begin
  if p_command_id is null or p_entry_id is null or p_window_id is null or p_player_id is null then
    raise exception 'command_id, entry_id, window_id and player_id are required'
      using errcode = '23514';
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

  v_receipt := app_private.find_command_receipt(
    p_command_id, 'add_registration_entry', p_window_id
  );
  if v_receipt is not null then
    return query
      select (v_receipt ->> 'entry_status')::text, (v_receipt ->> 'window_revision')::integer;
    return;
  end if;

  if v_session.lifecycle_status not in ('DRAFT', 'SCHEDULED') then
    raise exception 'Session must be DRAFT or SCHEDULED to add a Registration entry'
      using errcode = '23514';
  end if;

  if v_window.status <> 'OPEN' then
    raise exception 'Registration Window must be OPEN to add an entry' using errcode = '23514';
  end if;

  if not exists (
    select 1
      from public.community_players cp
     where cp.community_id = v_session.community_id
       and cp.player_id = p_player_id
       and cp.deleted_at is null
       and cp.active
  ) then
    raise exception 'Player % is not on this Community''s roster', p_player_id
      using errcode = '42501';
  end if;

  v_allocation := app_private.allocate_registration_slot(
    p_entry_id, p_window_id, p_player_id, 'ORGANIZER_ADDED', (select auth.uid())
  );

  v_result := pg_catalog.jsonb_build_object(
    'entry_status', v_allocation ->> 'status',
    'window_revision', (v_allocation ->> 'window_revision')::integer
  );
  perform app_private.record_command_receipt(
    p_command_id, (select auth.uid()), 'add_registration_entry', p_window_id,
    v_result, 'REGISTRATION_ENTRY'
  );

  return query
    select (v_result ->> 'entry_status')::text, (v_result ->> 'window_revision')::integer;
end;
$$;

revoke all on function public.add_registration_entry(uuid, uuid, uuid, uuid) from public, anon;
grant execute on function public.add_registration_entry(uuid, uuid, uuid, uuid) to authenticated;
