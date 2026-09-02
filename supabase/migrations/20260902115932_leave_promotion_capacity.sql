-- C6 XS-W4-04 Task 2 — Leave and atomic waitlist promotion
--
-- Closes the Registration loop opened by W4-01's schema and W4-03's Join/Add commands: a Player
-- can now give a seat back, and giving it back atomically promotes the next eligible WAITLISTED
-- entry into it. Promotion is its own app_private function so that a later capacity increase
-- (Task 4) can drive the identical FIFO loop without duplicating it.

-- Revalidates one waitlisted entry at promotion time, against that entry's OWN source.
--
-- XS-W4-03 deliberately let an organizer register a Player holding no account at all -- the case
-- add_registration_entry exists for. Applying the self-join chain uniformly here would make every
-- such entry permanently unpromotable, so it would reach the waitlist and never leave it.
create function app_private.registration_entry_still_eligible(p_entry_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.registration_entries e
      join public.registration_windows w on w.id = e.registration_window_id
      join public.sessions s on s.id = w.session_id
      join public.community_players cp
        on cp.community_id = s.community_id
       and cp.player_id = e.player_id
       and cp.deleted_at is null
       and cp.active
      join public.players p
        on p.id = e.player_id
       and p.deleted_at is null
       and p.active
     where e.id = p_entry_id
       and (
         e.source <> 'SELF_JOIN'
         or exists (
           select 1
             from public.player_account_links l
             join public.community_memberships m
               on m.community_id = s.community_id
              and m.user_id = l.user_id
              and m.status = 'active'
            where l.player_id = e.player_id
              and l.status = 'ACTIVE'
         )
       )
  );
$$;

revoke all on function app_private.registration_entry_still_eligible(uuid)
  from public, anon, authenticated;

-- Fills EVERY free slot, walking WAITLISTED entries in queue_sequence order.
--
-- After a Leave or a Remove of a CONFIRMED entry exactly one slot is free, so this promotes at
-- most one. After a capacity increase from 12 to 15 three are free, so it promotes the first three
-- eligible in FIFO order (REG-INV-016) -- one algorithm, not a second code path.
--
-- Assumes the caller already holds the Window row lock, and deliberately does NOT touch `revision`:
-- a leave-and-promotion is ONE logical mutation (REG-INV-013), so its caller bumps once.
--
-- It also does not reuse app_private.allocate_registration_slot, which INSERTS a row and bumps the
-- revision itself. Promotion UPDATES an existing row; the two only happen to end in CONFIRMED.
--
-- The loop terminates because every iteration either raises `v_confirmed` by one -- bounded by
-- `capacity` -- or takes a row out of the `WAITLISTED` set, bounded by the queue's length.
--
-- The returned `promoted`/`skipped` counts exist for the callers' own reasoning and for
-- debugging. They must NOT reach any command's return shape.
create function app_private.promote_waitlist_to_capacity(p_window_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window public.registration_windows;
  v_confirmed bigint;
  v_candidate public.registration_entries;
  v_promoted integer := 0;
  v_skipped integer := 0;
begin
  select * into v_window from public.registration_windows where id = p_window_id;
  if not found then
    raise exception 'Registration Window not found' using errcode = 'P0002';
  end if;

  select pg_catalog.count(*) into v_confirmed
    from public.registration_entries
   where registration_window_id = p_window_id
     and status = 'CONFIRMED';

  loop
    exit when v_confirmed >= v_window.capacity;

    select * into v_candidate
      from public.registration_entries
     where registration_window_id = p_window_id
       and status = 'WAITLISTED'
     order by queue_sequence
     limit 1;
    exit when not found;

    if app_private.registration_entry_still_eligible(v_candidate.id) then
      update public.registration_entries
         set status = 'CONFIRMED',
             status_changed_at = pg_catalog.now()
       where id = v_candidate.id;
      v_confirmed := v_confirmed + 1;
      v_promoted := v_promoted + 1;
    else
      -- OPEN-REG-002: skip, but never silently. The entry keeps its queue_sequence so the
      -- history stays readable, and stops being a candidate rather than being re-evaluated on
      -- every future promotion. RestoreRegistrationEntry is the audited way back.
      update public.registration_entries
         set status = 'REMOVED',
             status_changed_at = pg_catalog.now(),
             removed_at = pg_catalog.now(),
             removal_reason = 'INELIGIBLE_AT_PROMOTION'
       where id = v_candidate.id;
      v_skipped := v_skipped + 1;
    end if;
  end loop;

  return pg_catalog.jsonb_build_object('promoted', v_promoted, 'skipped', v_skipped);
end;
$$;

revoke all on function app_private.promote_waitlist_to_capacity(uuid)
  from public, anon, authenticated;

create function public.leave_registration(
  p_command_id uuid,
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
  v_player_id uuid;
  v_entry public.registration_entries;
  v_receipt jsonb;
  v_result jsonb;
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

  -- Leave deliberately does NOT require an active membership. Withdrawing is the only
  -- Registration action that is strictly de-escalating: it touches one entry, that entry belongs
  -- to the caller, and its effect is to give a seat back. Requiring membership would strand the
  -- entries of people who left the Community until the promoter turned their voluntary WITHDRAWN
  -- into an administrative REMOVED, losing the distinction REG-INV-012 exists to preserve.
  v_player_id := public.current_user_active_player_id();
  if v_player_id is null then
    raise exception 'Caller has no ACTIVE Player account link' using errcode = '42501';
  end if;

  -- Before the entry is resolved, on purpose: a successful Leave makes its own entry
  -- non-effective, so a retry that resolved first would raise P0002 instead of replaying.
  v_receipt := app_private.find_command_receipt(p_command_id, 'leave_registration', p_window_id);
  if v_receipt is not null then
    return query
      select (v_receipt ->> 'entry_status')::text, (v_receipt ->> 'window_revision')::integer;
    return;
  end if;

  if v_session.lifecycle_status not in ('DRAFT', 'SCHEDULED') then
    raise exception 'Session must be DRAFT or SCHEDULED to leave Registration'
      using errcode = '23514';
  end if;

  if v_window.status = 'LOCKED' then
    raise exception 'Registration Window is LOCKED' using errcode = '23514';
  end if;

  select * into v_entry
    from public.registration_entries
   where registration_window_id = p_window_id
     and player_id = v_player_id
     and status in ('CONFIRMED', 'WAITLISTED')
   for update;
  if not found then
    raise exception 'No effective Registration entry for the calling Player'
      using errcode = 'P0002';
  end if;

  update public.registration_entries
     set status = 'WITHDRAWN',
         status_changed_at = pg_catalog.now(),
         withdrawn_at = pg_catalog.now()
   where id = v_entry.id;

  if v_entry.status = 'CONFIRMED' then
    perform app_private.promote_waitlist_to_capacity(p_window_id);
  end if;

  update public.registration_windows
     set revision = revision + 1,
         updated_at = pg_catalog.now()
   where id = p_window_id;

  v_result := pg_catalog.jsonb_build_object(
    'entry_status', 'WITHDRAWN',
    'window_revision', v_window.revision + 1
  );
  perform app_private.record_command_receipt(
    p_command_id, (select auth.uid()), 'leave_registration', p_window_id,
    v_result, 'REGISTRATION_ENTRY'
  );

  return query
    select (v_result ->> 'entry_status')::text, (v_result ->> 'window_revision')::integer;
end;
$$;

revoke all on function public.leave_registration(uuid, uuid) from public, anon;
grant execute on function public.leave_registration(uuid, uuid) to authenticated;

-- Organizer-driven counterpart to Leave: removes ANY effective entry (CONFIRMED or WAITLISTED)
-- for a given Player, with an audited reason, and promotes the queue when a CONFIRMED seat frees.
create function public.remove_registration_entry(
  p_command_id uuid,
  p_window_id uuid,
  p_player_id uuid,
  p_reason text
)
returns table (entry_status text, window_revision integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.sessions;
  v_window public.registration_windows;
  v_entry public.registration_entries;
  v_receipt jsonb;
  v_result jsonb;
begin
  if p_command_id is null or p_window_id is null or p_player_id is null then
    raise exception 'command_id, window_id and player_id are required' using errcode = '23514';
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
    p_command_id, 'remove_registration_entry', p_window_id
  );
  if v_receipt is not null then
    return query
      select (v_receipt ->> 'entry_status')::text, (v_receipt ->> 'window_revision')::integer;
    return;
  end if;

  if v_session.lifecycle_status not in ('DRAFT', 'SCHEDULED') then
    raise exception 'Session must be DRAFT or SCHEDULED to remove a Registration entry'
      using errcode = '23514';
  end if;

  if v_window.status = 'LOCKED' then
    raise exception 'Registration Window is LOCKED' using errcode = '23514';
  end if;

  select * into v_entry
    from public.registration_entries
   where registration_window_id = p_window_id
     and player_id = p_player_id
     and status in ('CONFIRMED', 'WAITLISTED')
   for update;
  if not found then
    raise exception 'No effective Registration entry for Player %', p_player_id
      using errcode = 'P0002';
  end if;

  update public.registration_entries
     set status = 'REMOVED',
         status_changed_at = pg_catalog.now(),
         removed_at = pg_catalog.now(),
         removal_reason = p_reason
   where id = v_entry.id;

  if v_entry.status = 'CONFIRMED' then
    perform app_private.promote_waitlist_to_capacity(p_window_id);
  end if;

  update public.registration_windows
     set revision = revision + 1,
         updated_at = pg_catalog.now()
   where id = p_window_id;

  v_result := pg_catalog.jsonb_build_object(
    'entry_status', 'REMOVED',
    'window_revision', v_window.revision + 1
  );
  perform app_private.record_command_receipt(
    p_command_id, (select auth.uid()), 'remove_registration_entry', p_window_id,
    v_result, 'REGISTRATION_ENTRY'
  );

  return query
    select (v_result ->> 'entry_status')::text, (v_result ->> 'window_revision')::integer;
end;
$$;

revoke all on function public.remove_registration_entry(uuid, uuid, uuid, text) from public, anon;
grant execute on function public.remove_registration_entry(uuid, uuid, uuid, text) to authenticated;

-- A blank p_reason is rejected by the existing registration_entries_removal_reason_check, which
-- already raises 23514. Deliberately not duplicated here -- one rule, one place.

-- Organizer-driven Window capacity change. Shrinking is refused outright below the confirmed
-- count (REG-INV-017) rather than picking victims; growing runs the same FIFO promoter Leave and
-- Remove use, unconditionally, since its own exit condition already makes it a no-op when nothing
-- is free.
create function public.change_registration_capacity(
  p_command_id uuid,
  p_window_id uuid,
  p_capacity integer
)
returns table (window_capacity integer, window_revision integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.sessions;
  v_window public.registration_windows;
  v_confirmed bigint;
  v_receipt jsonb;
  v_result jsonb;
begin
  if p_command_id is null or p_window_id is null or p_capacity is null then
    raise exception 'command_id, window_id and capacity are required' using errcode = '23514';
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
    p_command_id, 'change_registration_capacity', p_window_id
  );
  if v_receipt is not null then
    return query
      select (v_receipt ->> 'window_capacity')::integer,
             (v_receipt ->> 'window_revision')::integer;
    return;
  end if;

  if v_session.lifecycle_status not in ('DRAFT', 'SCHEDULED') then
    raise exception 'Session must be DRAFT or SCHEDULED to change Registration capacity'
      using errcode = '23514';
  end if;

  if v_window.status = 'LOCKED' then
    raise exception 'Registration Window is LOCKED' using errcode = '23514';
  end if;

  if p_capacity <= 0 then
    raise exception 'Registration capacity must be greater than zero' using errcode = '23514';
  end if;

  if p_capacity = v_window.capacity then
    v_result := pg_catalog.jsonb_build_object(
      'window_capacity', v_window.capacity,
      'window_revision', v_window.revision
    );
    perform app_private.record_command_receipt(
      p_command_id, (select auth.uid()), 'change_registration_capacity', p_window_id,
      v_result, 'REGISTRATION_ENTRY'
    );
    return query select v_window.capacity, v_window.revision;
    return;
  end if;

  select pg_catalog.count(*) into v_confirmed
    from public.registration_entries
   where registration_window_id = p_window_id
     and status = 'CONFIRMED';

  -- REG-INV-017: refuse, and pick no victims. The documented path to a smaller Window is for the
  -- Organizer to remove entries explicitly first.
  if p_capacity < v_confirmed then
    raise exception 'Registration capacity cannot be reduced below the confirmed entry count'
      using errcode = '23514';
  end if;

  update public.registration_windows
     set capacity = p_capacity,
         revision = revision + 1,
         updated_at = pg_catalog.now()
   where id = p_window_id;

  -- Called unconditionally: the promoter's first exit condition makes it a no-op whenever no slot
  -- is free, so guarding on "increase" would add a branch that can never change the outcome. It
  -- must run AFTER the capacity update, because it reads capacity from the row.
  perform app_private.promote_waitlist_to_capacity(p_window_id);

  v_result := pg_catalog.jsonb_build_object(
    'window_capacity', p_capacity,
    'window_revision', v_window.revision + 1
  );
  perform app_private.record_command_receipt(
    p_command_id, (select auth.uid()), 'change_registration_capacity', p_window_id,
    v_result, 'REGISTRATION_ENTRY'
  );

  return query select p_capacity, v_window.revision + 1;
end;
$$;

revoke all on function public.change_registration_capacity(uuid, uuid, integer) from public, anon;
grant execute on function public.change_registration_capacity(uuid, uuid, integer) to authenticated;
