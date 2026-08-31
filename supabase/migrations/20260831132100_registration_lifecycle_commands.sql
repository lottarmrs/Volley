-- C6 XS-W4-02 Task 2 — Registration lifecycle commands
--
-- Four commands over the Window aggregate (public.registration_windows), added under W4-01's
-- schema and the W3-06 receipt substrate. Every command follows the same shape as the target
-- Session lifecycle commands in 20260828190617_target_session_lifecycle_readiness.sql: null-
-- check caller-supplied ids, load-and-lock the governing Session (raising P0002 when absent),
-- check write authority, consult app_private.find_command_receipt for a retried command_id,
-- validate the desired state, return a receipt-backed no-op when already achieved, check the
-- caller's expected_revision only for a genuine mutation, then record the receipt.
--
-- The Window is its own aggregate root with its own revision: no command here writes
-- sessions.revision. Locking the Session still matters -- it gates the Window's lifecycle on
-- the Session's own lifecycle_status and serializes concurrent creates for the same Session.

create function app_private.assert_registration_lifecycle_transition(
  p_from text,
  p_to text
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_from is null or p_to is null or (p_from, p_to) not in (
    ('DRAFT', 'OPEN'),
    ('OPEN', 'CLOSED'),
    ('CLOSED', 'LOCKED')
  ) then
    raise exception 'Registration lifecycle transition % -> % is not allowed', p_from, p_to
      using errcode = '23514';
  end if;
end;
$$;

revoke all on function app_private.assert_registration_lifecycle_transition(text, text)
  from public, anon, authenticated;

create function public.create_registration_window(
  p_command_id uuid,
  p_window_id uuid,
  p_session_id uuid,
  p_capacity integer,
  p_closes_at timestamptz
)
returns table (window_id uuid, window_revision integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.sessions;
  v_receipt jsonb;
  v_result jsonb;
begin
  if p_command_id is null or p_window_id is null or p_session_id is null or p_capacity is null then
    raise exception 'command_id, window_id, session_id and capacity are required'
      using errcode = '23514';
  end if;

  select * into v_session
    from public.sessions
   where id = p_session_id and authority_model = 'target'
   for update;
  if not found then
    raise exception 'Target Session not found' using errcode = 'P0002';
  end if;

  perform public.assert_target_session_write_authorized(v_session);

  v_receipt := app_private.find_command_receipt(
    p_command_id, 'create_registration_window', p_window_id
  );
  if v_receipt is not null then
    return query
      select (v_receipt ->> 'window_id')::uuid, (v_receipt ->> 'window_revision')::integer;
    return;
  end if;

  if v_session.lifecycle_status not in ('DRAFT', 'SCHEDULED') then
    raise exception 'Session must be DRAFT or SCHEDULED to create a Registration Window'
      using errcode = '23514';
  end if;

  -- Pre-check rather than let W4-01's unique session_id or the primary key surface a raw
  -- 23505: this codebase reserves 23505 for command_id collisions in the receipt substrate.
  if exists (select 1 from public.registration_windows where session_id = p_session_id) then
    raise exception 'Session already has a Registration Window' using errcode = '23514';
  end if;

  if exists (select 1 from public.registration_windows where id = p_window_id) then
    raise exception 'Registration Window id already exists' using errcode = '23514';
  end if;

  insert into public.registration_windows (
    id, session_id, status, capacity, closes_at, revision, next_queue_sequence,
    created_by_user_id
  ) values (
    p_window_id, p_session_id, 'DRAFT', p_capacity, p_closes_at, 1, 1, (select auth.uid())
  );

  v_result := pg_catalog.jsonb_build_object('window_id', p_window_id, 'window_revision', 1);
  perform app_private.record_command_receipt(
    p_command_id, (select auth.uid()), 'create_registration_window', p_window_id,
    v_result, 'REGISTRATION_LIFECYCLE'
  );

  return query select p_window_id, 1;
end;
$$;

revoke all on function public.create_registration_window(uuid, uuid, uuid, integer, timestamptz)
  from public, anon;
grant execute on function public.create_registration_window(uuid, uuid, uuid, integer, timestamptz)
  to authenticated;

create function public.open_registration(
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

  v_receipt := app_private.find_command_receipt(p_command_id, 'open_registration', p_window_id);
  if v_receipt is not null then
    return query select (v_receipt ->> 'window_revision')::integer;
    return;
  end if;

  if v_session.lifecycle_status not in ('DRAFT', 'SCHEDULED') then
    raise exception 'Session must be DRAFT or SCHEDULED to change Registration state'
      using errcode = '23514';
  end if;

  if v_window.status = 'OPEN' then
    v_result := pg_catalog.jsonb_build_object('window_revision', v_window.revision);
    perform app_private.record_command_receipt(
      p_command_id, (select auth.uid()), 'open_registration', p_window_id,
      v_result, 'REGISTRATION_LIFECYCLE'
    );
    return query select v_window.revision;
    return;
  end if;

  perform app_private.assert_registration_lifecycle_transition(v_window.status, 'OPEN');

  if v_window.revision is distinct from p_expected_revision then
    raise exception 'Stale Registration Window revision' using errcode = '40001';
  end if;

  update public.registration_windows
     set status = 'OPEN',
         opened_at = pg_catalog.now(),
         revision = revision + 1,
         updated_at = pg_catalog.now()
   where id = p_window_id
  returning revision into v_new_revision;

  v_result := pg_catalog.jsonb_build_object('window_revision', v_new_revision);
  perform app_private.record_command_receipt(
    p_command_id, (select auth.uid()), 'open_registration', p_window_id,
    v_result, 'REGISTRATION_LIFECYCLE'
  );

  return query select v_new_revision;
end;
$$;

revoke all on function public.open_registration(uuid, uuid, integer) from public, anon;
grant execute on function public.open_registration(uuid, uuid, integer) to authenticated;

create function public.close_registration(
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

  v_receipt := app_private.find_command_receipt(p_command_id, 'close_registration', p_window_id);
  if v_receipt is not null then
    return query select (v_receipt ->> 'window_revision')::integer;
    return;
  end if;

  if v_session.lifecycle_status not in ('DRAFT', 'SCHEDULED') then
    raise exception 'Session must be DRAFT or SCHEDULED to change Registration state'
      using errcode = '23514';
  end if;

  if v_window.status = 'CLOSED' then
    v_result := pg_catalog.jsonb_build_object('window_revision', v_window.revision);
    perform app_private.record_command_receipt(
      p_command_id, (select auth.uid()), 'close_registration', p_window_id,
      v_result, 'REGISTRATION_LIFECYCLE'
    );
    return query select v_window.revision;
    return;
  end if;

  perform app_private.assert_registration_lifecycle_transition(v_window.status, 'CLOSED');

  if v_window.revision is distinct from p_expected_revision then
    raise exception 'Stale Registration Window revision' using errcode = '40001';
  end if;

  update public.registration_windows
     set status = 'CLOSED',
         closed_at = pg_catalog.now(),
         revision = revision + 1,
         updated_at = pg_catalog.now()
   where id = p_window_id
  returning revision into v_new_revision;

  v_result := pg_catalog.jsonb_build_object('window_revision', v_new_revision);
  perform app_private.record_command_receipt(
    p_command_id, (select auth.uid()), 'close_registration', p_window_id,
    v_result, 'REGISTRATION_LIFECYCLE'
  );

  return query select v_new_revision;
end;
$$;

revoke all on function public.close_registration(uuid, uuid, integer) from public, anon;
grant execute on function public.close_registration(uuid, uuid, integer) to authenticated;

create function public.lock_registration(
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

  v_receipt := app_private.find_command_receipt(p_command_id, 'lock_registration', p_window_id);
  if v_receipt is not null then
    return query select (v_receipt ->> 'window_revision')::integer;
    return;
  end if;

  if v_session.lifecycle_status not in ('DRAFT', 'SCHEDULED') then
    raise exception 'Session must be DRAFT or SCHEDULED to change Registration state'
      using errcode = '23514';
  end if;

  if v_window.status = 'LOCKED' then
    v_result := pg_catalog.jsonb_build_object('window_revision', v_window.revision);
    perform app_private.record_command_receipt(
      p_command_id, (select auth.uid()), 'lock_registration', p_window_id,
      v_result, 'REGISTRATION_LIFECYCLE'
    );
    return query select v_window.revision;
    return;
  end if;

  perform app_private.assert_registration_lifecycle_transition(v_window.status, 'LOCKED');

  if v_window.revision is distinct from p_expected_revision then
    raise exception 'Stale Registration Window revision' using errcode = '40001';
  end if;

  update public.registration_windows
     set status = 'LOCKED',
         locked_at = pg_catalog.now(),
         revision = revision + 1,
         updated_at = pg_catalog.now()
   where id = p_window_id
  returning revision into v_new_revision;

  v_result := pg_catalog.jsonb_build_object('window_revision', v_new_revision);
  perform app_private.record_command_receipt(
    p_command_id, (select auth.uid()), 'lock_registration', p_window_id,
    v_result, 'REGISTRATION_LIFECYCLE'
  );

  return query select v_new_revision;
end;
$$;

revoke all on function public.lock_registration(uuid, uuid, integer) from public, anon;
grant execute on function public.lock_registration(uuid, uuid, integer) to authenticated;
