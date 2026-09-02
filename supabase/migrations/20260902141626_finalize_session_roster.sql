create function public.finalize_session_roster(
  p_command_id uuid,
  p_window_id uuid,
  p_expected_registration_revision integer
)
returns table (
  roster_revision_id uuid,
  roster_revision_number integer,
  source_registration_revision bigint,
  session_revision integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session_id uuid;
  v_session public.sessions;
  v_window public.registration_windows;
  v_entries jsonb;
  v_ineligible_entry_id uuid;
  v_roster_revision_id uuid;
  v_roster_revision_number integer;
  v_new_session_revision integer;
begin
  if p_command_id is null or p_window_id is null or p_expected_registration_revision is null then
    raise exception 'command_id, window_id and expected Registration revision are required'
      using errcode = '23514';
  end if;

  select w.session_id into v_session_id
    from public.registration_windows w
   where w.id = p_window_id;
  if not found then
    raise exception 'Registration Window not found' using errcode = 'P0002';
  end if;

  select * into v_session
    from public.sessions s
   where s.id = v_session_id
     and s.authority_model = 'target'
     and s.session_context = 'COMMUNITY'
   for update;
  if not found then
    raise exception 'Target Community Session not found' using errcode = 'P0002';
  end if;

  select * into v_window
    from public.registration_windows w
   where w.id = p_window_id
     and w.session_id = v_session.id
   for update;
  if not found then
    raise exception 'Registration Window not found for Session' using errcode = 'P0002';
  end if;

  perform public.assert_target_session_write_authorized(v_session);

  if v_session.lifecycle_status not in ('DRAFT', 'SCHEDULED') then
    raise exception 'Session must be DRAFT or SCHEDULED to finalize Registration roster'
      using errcode = '23514';
  end if;
  if v_window.status <> 'LOCKED' then
    raise exception 'Registration Window must be LOCKED to finalize roster'
      using errcode = '23514';
  end if;
  if v_window.revision is distinct from p_expected_registration_revision then
    raise exception 'Stale Registration revision' using errcode = '40001';
  end if;

  select e.id into v_ineligible_entry_id
    from public.registration_entries e
   where e.registration_window_id = v_window.id
     and e.status = 'CONFIRMED'
     and not app_private.registration_entry_still_eligible(e.id)
   order by e.joined_at, e.id
   limit 1;
  if found then
    raise exception 'Confirmed Registration entry % is no longer eligible', v_ineligible_entry_id
      using errcode = '23514';
  end if;

  select pg_catalog.jsonb_agg(
           pg_catalog.jsonb_build_object(
             'entry_order', ordered.entry_order,
             'participant_id', coalesce(sp.id, pg_catalog.gen_random_uuid())::text,
             'identity_kind', 'PLAYER',
             'player_id', ordered.player_id::text,
             'display_name', coalesce(
               nullif(pg_catalog.btrim(coalesce(p.nickname, '')), ''),
               pg_catalog.btrim(p.name)
             )
           )
           order by ordered.entry_order
         )
    into v_entries
    from (
      select e.player_id, pg_catalog.row_number() over (order by e.joined_at, e.id) - 1 as entry_order
        from public.registration_entries e
       where e.registration_window_id = v_window.id
         and e.status = 'CONFIRMED'
    ) ordered
    join public.players p on p.id = ordered.player_id
    left join public.session_participants sp
      on sp.session_id = v_session.id and sp.player_id = ordered.player_id;

  if v_entries is null or pg_catalog.jsonb_array_length(v_entries) = 0 then
    raise exception 'Registration roster requires at least one confirmed entry'
      using errcode = '23514';
  end if;

  v_roster_revision_id := pg_catalog.gen_random_uuid();
  v_roster_revision_number := app_private.materialize_target_session_roster(
    v_roster_revision_id,
    v_session.id,
    'REGISTRATION',
    null,
    v_window.revision::bigint,
    null,
    (select auth.uid()),
    v_entries
  );

  update public.sessions
     set revision = revision + 1,
         updated_at = pg_catalog.now()
   where id = v_session.id;
  v_new_session_revision := v_session.revision + 1;

  return query
    select v_roster_revision_id,
           v_roster_revision_number,
           v_window.revision::bigint,
           v_new_session_revision;
end;
$$;

revoke all on function public.finalize_session_roster(uuid, uuid, integer)
  from public, anon;
grant execute on function public.finalize_session_roster(uuid, uuid, integer)
  to authenticated;
