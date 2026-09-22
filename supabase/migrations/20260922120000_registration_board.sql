-- A leitura que a XS-W6-08c criou serve a quem organiza e traz só os confirmados. A tela de
-- inscrição precisa da reserva, da ordem e de quem esta lendo -- e precisa que um membro comum
-- consiga ler.

create function app_private.build_registration_board(p_window public.registration_windows)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_player_id uuid;
  v_entries jsonb;
  v_viewer jsonb;
begin
  select p.id into v_player_id
    from public.players p
   where p.user_id = v_uid
     and p.deleted_at is null
   limit 1;

  with ordenadas as (
    select e.id,
           e.player_id,
           e.status,
           e.source,
           e.joined_at,
           case
             when e.status = 'WAITLISTED'
               then pg_catalog.row_number() over (
                 partition by e.status order by e.queue_sequence
               )
             else null
           end as queue_position,
           case when e.status = 'CONFIRMED' then 0 else 1 end as ordem_grupo,
           e.queue_sequence
      from public.registration_entries e
     where e.registration_window_id = p_window.id
       and e.status in ('CONFIRMED', 'WAITLISTED')
  )
  select coalesce(
           pg_catalog.jsonb_agg(
             pg_catalog.jsonb_build_object(
               'entry_id', o.id,
               'player_id', o.player_id,
               'status', o.status,
               'queue_position', o.queue_position,
               'source', o.source,
               'joined_at', o.joined_at
             )
             order by o.ordem_grupo, o.queue_sequence, o.joined_at
           ),
           '[]'::jsonb
         )
    into v_entries
    from ordenadas o;

  select pg_catalog.jsonb_build_object(
           'viewer_entry_status', (
             select e.status
               from public.registration_entries e
              where e.registration_window_id = p_window.id
                and e.player_id = v_player_id
                and e.status in ('CONFIRMED', 'WAITLISTED')
              limit 1
           ),
           'viewer_queue_position', (
             select entry ->> 'queue_position'
               from pg_catalog.jsonb_array_elements(v_entries) as entry
              where (entry ->> 'player_id')::uuid = v_player_id
                and entry ->> 'status' = 'WAITLISTED'
              limit 1
           )
         )
    into v_viewer;

  return pg_catalog.jsonb_build_object(
    'window_id', p_window.id,
    'session_id', p_window.session_id,
    'status', p_window.status,
    'revision', p_window.revision,
    'capacity', p_window.capacity,
    'opened_at', p_window.opened_at,
    'closed_at', p_window.closed_at,
    'locked_at', p_window.locked_at,
    'confirmed_count', (
      select pg_catalog.count(*)
        from pg_catalog.jsonb_array_elements(v_entries) as entry
       where entry ->> 'status' = 'CONFIRMED'
    ),
    'waitlisted_count', (
      select pg_catalog.count(*)
        from pg_catalog.jsonb_array_elements(v_entries) as entry
       where entry ->> 'status' = 'WAITLISTED'
    ),
    'viewer_can_manage',
      app_private.current_user_has_valid_target_session_organizer_assignment(p_window.session_id),
    'viewer_player_id', v_player_id,
    'viewer_entry_status', v_viewer ->> 'viewer_entry_status',
    'viewer_queue_position', (v_viewer ->> 'viewer_queue_position')::integer,
    'entries', v_entries
  );
end;
$$;

revoke all on function app_private.build_registration_board(public.registration_windows)
  from public, anon, authenticated;

create function public.read_registration_board(p_window_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
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

  if not app_private.current_user_can_read_target_session(v_window.session_id) then
    raise exception 'Not authorized to read this Registration Window' using errcode = '42501';
  end if;

  return app_private.build_registration_board(v_window);
end;
$$;

revoke all on function public.read_registration_board(uuid) from public, anon;
grant execute on function public.read_registration_board(uuid) to authenticated;

create function public.read_session_registration(p_session_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_window public.registration_windows;
begin
  if (select auth.uid()) is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_session_id is null then
    raise exception 'session_id is required' using errcode = '23514';
  end if;

  if not app_private.current_user_can_read_target_session(p_session_id) then
    raise exception 'Not authorized to read this Session' using errcode = '42501';
  end if;

  select * into v_window
    from public.registration_windows w
   where w.session_id = p_session_id;
  if not found then
    return null;
  end if;

  return app_private.build_registration_board(v_window);
end;
$$;

revoke all on function public.read_session_registration(uuid) from public, anon;
grant execute on function public.read_session_registration(uuid) to authenticated;
