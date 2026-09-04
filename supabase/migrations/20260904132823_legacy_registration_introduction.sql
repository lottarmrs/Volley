create table app_private.registration_introductions (
  registration_window_id uuid primary key
    references public.registration_windows(id) on delete restrict,
  session_id uuid not null unique references public.sessions(id) on delete restrict,
  source_kind text not null check (source_kind = 'LEGACY_SELECTED_ROSTER'),
  source_roster_revision_id uuid not null
    references public.roster_revisions(id) on delete restrict,
  source_fingerprint text not null check (pg_catalog.btrim(source_fingerprint) <> ''),
  confirmed_count integer not null check (confirmed_count > 0),
  capacity_at_introduction integer not null check (capacity_at_introduction > 0),
  initial_window_status text not null check (initial_window_status = 'DRAFT'),
  initial_window_revision integer not null check (initial_window_revision = 1),
  queue_chronology text not null check (queue_chronology = 'UNKNOWN'),
  command_id uuid not null unique,
  introduced_by_user_id uuid references auth.users(id) on delete set null,
  introduced_at timestamptz not null default pg_catalog.now(),
  constraint registration_introductions_capacity_fits_check
    check (capacity_at_introduction >= confirmed_count)
);

create index registration_introductions_actor_idx
  on app_private.registration_introductions (introduced_by_user_id);
create index registration_introductions_source_idx
  on app_private.registration_introductions (source_roster_revision_id);

-- The single-value checks above are deliberate. They record what XS-W4-06 decided, not merely the
-- value it happens to write: a later slice that wants a Window introduced already OPEN, or a queue
-- chronology that was actually proven, has to widen the constraint on purpose.
create function app_private.reject_registration_introduction_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- The narrow exception is the auth.users cascade: `on delete set null` arrives as an UPDATE at
  -- trigger depth greater than one and may only null the actor. Without it, deleting a user fails.
  if tg_op = 'UPDATE'
     and pg_catalog.pg_trigger_depth() > 1
     and new.introduced_by_user_id is null
     and old.introduced_by_user_id is not null
     and new.registration_window_id = old.registration_window_id
     and new.session_id = old.session_id
     and new.source_kind = old.source_kind
     and new.source_roster_revision_id = old.source_roster_revision_id
     and new.source_fingerprint = old.source_fingerprint
     and new.confirmed_count = old.confirmed_count
     and new.capacity_at_introduction = old.capacity_at_introduction
     and new.initial_window_status = old.initial_window_status
     and new.initial_window_revision = old.initial_window_revision
     and new.queue_chronology = old.queue_chronology
     and new.command_id = old.command_id
     and new.introduced_at = old.introduced_at then
    return new;
  end if;

  raise exception 'Registration introductions are immutable' using errcode = '55000';
end;
$$;

revoke all on function app_private.reject_registration_introduction_mutation()
  from public, anon, authenticated;

create trigger reject_registration_introduction_mutation_trigger
before update or delete on app_private.registration_introductions
for each row execute function app_private.reject_registration_introduction_mutation();

create function app_private.registration_player_standing_alive(
  p_community_id uuid,
  p_player_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.community_players cp
      join public.players p
        on p.id = cp.player_id
       and p.deleted_at is null
       and p.active
     where cp.community_id = p_community_id
       and cp.player_id = p_player_id
       and cp.deleted_at is null
       and cp.active
  );
$$;

revoke all on function app_private.registration_player_standing_alive(uuid, uuid)
  from public, anon, authenticated;

-- Delegates the "standing alive" half to the predicate above so W4-06's pre-insert check and
-- W4-04's per-entry check cannot drift apart. The source-aware account-link branch is unchanged.
create or replace function app_private.registration_entry_still_eligible(p_entry_id uuid)
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
     where e.id = p_entry_id
       and app_private.registration_player_standing_alive(s.community_id, e.player_id)
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

create function app_private.legacy_registration_source_fingerprint(p_roster_revision_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.md5(
    pg_catalog.jsonb_build_object(
      'roster_revision_id', r.id::text,
      'revision_number', r.revision_number,
      'entries', coalesce(
        (
          select pg_catalog.jsonb_agg(
                   pg_catalog.jsonb_build_object(
                     'entry_order', e.entry_order,
                     'player_id', e.player_id::text
                   )
                   order by e.entry_order
                 )
            from public.roster_revision_entries e
           where e.roster_revision_id = r.id
        ),
        '[]'::jsonb
      )
    )::text
  )
    from public.roster_revisions r
   where r.id = p_roster_revision_id;
$$;

revoke all on function app_private.legacy_registration_source_fingerprint(uuid)
  from public, anon, authenticated;

create function public.inspect_registration_introduction(p_session_id uuid)
returns table (
  introducible boolean,
  source_fingerprint text,
  confirmed_count integer,
  blockers text[],
  entries jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.sessions;
  v_revision public.roster_revisions;
  v_max_revision integer;
  v_blockers text[] := '{}'::text[];
  v_entries jsonb := '[]'::jsonb;
  v_fingerprint text;
  v_count integer := 0;
begin
  if p_session_id is null then
    raise exception 'Session id is required' using errcode = '23514';
  end if;

  select * into v_session from public.sessions s where s.id = p_session_id;
  if not found then
    raise exception 'Session not found' using errcode = 'P0002';
  end if;

  -- Authorization first, and identical to the write path: a caller who cannot introduce cannot use
  -- this command to read a roster either. A still-legacy Session has no organizer assignment, so it
  -- answers 42501 here rather than reaching any blocker.
  perform public.assert_target_session_write_authorized(v_session);

  if v_session.session_context is distinct from 'COMMUNITY' then
    v_blockers := pg_catalog.array_append(v_blockers, 'SESSION_NOT_COMMUNITY');
  end if;

  if v_session.lifecycle_status not in ('DRAFT', 'SCHEDULED') then
    v_blockers := pg_catalog.array_append(v_blockers, 'SESSION_NOT_UPCOMING');
  end if;

  if exists (
    select 1 from public.registration_windows w where w.session_id = p_session_id
  ) then
    v_blockers := pg_catalog.array_append(v_blockers, 'REGISTRATION_WINDOW_EXISTS');
  end if;

  select * into v_revision
    from public.roster_revisions r
   where r.session_id = p_session_id
     and r.source_kind = 'LEGACY_SELECTED_ROSTER';

  if not found then
    v_blockers := pg_catalog.array_append(v_blockers, 'LEGACY_ROSTER_MISSING');
  else
    select pg_catalog.max(r.revision_number) into v_max_revision
      from public.roster_revisions r
     where r.session_id = p_session_id;

    if v_max_revision > v_revision.revision_number then
      v_blockers := pg_catalog.array_append(v_blockers, 'LEGACY_ROSTER_SUPERSEDED');
    end if;

    select pg_catalog.count(*) into v_count
      from public.roster_revision_entries e
     where e.roster_revision_id = v_revision.id;

    if v_count = 0 then
      v_blockers := pg_catalog.array_append(v_blockers, 'LEGACY_ROSTER_EMPTY');
    end if;

    if exists (
      select 1
        from public.roster_revision_entries e
       where e.roster_revision_id = v_revision.id
         and (e.identity_kind <> 'PLAYER' or e.player_id is null)
    ) then
      v_blockers := pg_catalog.array_append(v_blockers, 'ROSTER_ENTRY_NOT_PLAYER');
    end if;

    v_fingerprint := app_private.legacy_registration_source_fingerprint(v_revision.id);

    select coalesce(
             pg_catalog.jsonb_agg(
               pg_catalog.jsonb_build_object(
                 'entry_order', e.entry_order,
                 'player_id', e.player_id,
                 'display_name_at_time', e.display_name_at_time,
                 'eligible', e.player_id is not null
                   and app_private.registration_player_standing_alive(
                     v_session.community_id,
                     e.player_id
                   )
               )
               order by e.entry_order
             ),
             '[]'::jsonb
           )
      into v_entries
      from public.roster_revision_entries e
     where e.roster_revision_id = v_revision.id;

    if exists (
      select 1
        from pg_catalog.jsonb_array_elements(v_entries) candidate
       where (candidate->>'eligible')::boolean is not true
    ) then
      v_blockers := pg_catalog.array_append(v_blockers, 'PLAYER_NOT_ELIGIBLE');
    end if;
  end if;

  return query
    select
      pg_catalog.cardinality(v_blockers) = 0,
      v_fingerprint,
      v_count,
      v_blockers,
      v_entries;
end;
$$;

revoke all on function public.inspect_registration_introduction(uuid)
  from public, anon, authenticated;
grant execute on function public.inspect_registration_introduction(uuid) to authenticated;

create function public.introduce_registration_from_legacy_roster(
  p_command_id uuid,
  p_window_id uuid,
  p_session_id uuid,
  p_capacity integer,
  p_closes_at timestamptz
)
returns table (
  window_id uuid,
  window_revision integer,
  confirmed_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.sessions;
  v_revision public.roster_revisions;
  v_max_revision integer;
  v_count integer;
  v_uid uuid;
  v_receipt jsonb;
  v_result jsonb;
  v_fingerprint text;
begin
  if p_command_id is null
     or p_window_id is null
     or p_session_id is null
     or p_capacity is null then
    raise exception 'command_id, window_id, session_id and capacity are required'
      using errcode = '23514';
  end if;

  -- Load-bearing despite the discarded result: find_command_receipt raises 23505 when this command
  -- id already belongs to another aggregate or command type, and that collision must surface before
  -- the row lock. The replay itself happens after authorization below, so a caller whose capability
  -- was revoked cannot read back an earlier result.
  v_receipt := app_private.find_command_receipt(
    p_command_id,
    'introduce_registration_from_legacy_roster',
    p_window_id
  );

  -- Session before Window, the global lock order. The Window does not exist yet; taking the Session
  -- first is what keeps this command consistent with every other command that locks both.
  select * into v_session
    from public.sessions s
   where s.id = p_session_id
   for update;

  if not found then
    raise exception 'Session not found' using errcode = 'P0002';
  end if;

  perform public.assert_target_session_write_authorized(v_session);
  v_uid := (select auth.uid());

  v_receipt := app_private.find_command_receipt(
    p_command_id,
    'introduce_registration_from_legacy_roster',
    p_window_id
  );
  if v_receipt is not null then
    return query
      select
        (v_receipt->>'window_id')::uuid,
        (v_receipt->>'window_revision')::integer,
        (v_receipt->>'confirmed_count')::integer;
    return;
  end if;

  -- Defense in depth: assert_target_session_write_authorized already excluded every legacy Session,
  -- because organizer assignments exist only for target Sessions and a target Session cannot return
  -- to legacy.
  if v_session.authority_model <> 'target' then
    raise exception 'Registration introduction blocked (SESSION_NOT_TARGET)' using errcode = '23514';
  end if;

  if v_session.session_context is distinct from 'COMMUNITY' then
    raise exception 'Registration introduction blocked (SESSION_NOT_COMMUNITY)'
      using errcode = '23514';
  end if;

  if v_session.lifecycle_status not in ('DRAFT', 'SCHEDULED') then
    raise exception 'Registration introduction blocked (SESSION_NOT_UPCOMING)'
      using errcode = '23514';
  end if;

  if exists (
    select 1 from public.registration_windows w where w.session_id = p_session_id
  ) then
    raise exception 'Registration introduction blocked (REGISTRATION_WINDOW_EXISTS)'
      using errcode = '23514';
  end if;

  if exists (select 1 from public.registration_windows w where w.id = p_window_id) then
    raise exception 'Registration Window id already exists' using errcode = '23514';
  end if;

  select * into v_revision
    from public.roster_revisions r
   where r.session_id = p_session_id
     and r.source_kind = 'LEGACY_SELECTED_ROSTER';

  if not found then
    raise exception 'Registration introduction blocked (LEGACY_ROSTER_MISSING)'
      using errcode = '23514';
  end if;

  select pg_catalog.max(r.revision_number) into v_max_revision
    from public.roster_revisions r
   where r.session_id = p_session_id;

  if v_max_revision > v_revision.revision_number then
    raise exception 'Registration introduction blocked (LEGACY_ROSTER_SUPERSEDED)'
      using errcode = '23514';
  end if;

  select pg_catalog.count(*) into v_count
    from public.roster_revision_entries e
   where e.roster_revision_id = v_revision.id;

  if v_count = 0 then
    raise exception 'Registration introduction blocked (LEGACY_ROSTER_EMPTY)'
      using errcode = '23514';
  end if;

  if exists (
    select 1
      from public.roster_revision_entries e
     where e.roster_revision_id = v_revision.id
       and (e.identity_kind <> 'PLAYER' or e.player_id is null)
  ) then
    raise exception 'Registration introduction blocked (ROSTER_ENTRY_NOT_PLAYER)'
      using errcode = '23514';
  end if;

  -- The message never enumerates people; inspect_registration_introduction is where the Organizer
  -- sees who.
  if exists (
    select 1
      from public.roster_revision_entries e
     where e.roster_revision_id = v_revision.id
       and not app_private.registration_player_standing_alive(v_session.community_id, e.player_id)
  ) then
    raise exception 'Registration introduction blocked (PLAYER_NOT_ELIGIBLE)'
      using errcode = '23514';
  end if;

  if p_capacity < v_count then
    raise exception 'Capacity is below the migrated confirmed roster' using errcode = '23514';
  end if;

  v_fingerprint := app_private.legacy_registration_source_fingerprint(v_revision.id);

  insert into public.registration_windows (
    id, session_id, status, capacity, closes_at, revision, next_queue_sequence, created_by_user_id
  ) values (
    p_window_id, p_session_id, 'DRAFT', p_capacity, p_closes_at, 1, 1, v_uid
  );

  -- One INSERT, one Window revision. allocate_registration_slot is deliberately not reused: it locks
  -- the Window and bumps `revision` per row, which would turn one logical command into N revisions.
  insert into public.registration_entries (
    id, registration_window_id, player_id, status, queue_sequence, source, created_by_user_id
  )
  select
    pg_catalog.gen_random_uuid(),
    p_window_id,
    e.player_id,
    'CONFIRMED',
    null,
    'MIGRATION',
    v_uid
  from public.roster_revision_entries e
  where e.roster_revision_id = v_revision.id
  order by e.entry_order;

  insert into app_private.registration_introductions (
    registration_window_id,
    session_id,
    source_kind,
    source_roster_revision_id,
    source_fingerprint,
    confirmed_count,
    capacity_at_introduction,
    initial_window_status,
    initial_window_revision,
    queue_chronology,
    command_id,
    introduced_by_user_id
  ) values (
    p_window_id,
    p_session_id,
    'LEGACY_SELECTED_ROSTER',
    v_revision.id,
    v_fingerprint,
    v_count,
    p_capacity,
    'DRAFT',
    1,
    'UNKNOWN',
    p_command_id,
    v_uid
  );

  v_result := pg_catalog.jsonb_build_object(
    'window_id', p_window_id,
    'window_revision', 1,
    'confirmed_count', v_count
  );
  perform app_private.record_command_receipt(
    p_command_id,
    v_uid,
    'introduce_registration_from_legacy_roster',
    p_window_id,
    v_result,
    'REGISTRATION_INTRODUCTION'
  );

  return query select p_window_id, 1, v_count;
end;
$$;

revoke all on function public.introduce_registration_from_legacy_roster(
  uuid, uuid, uuid, integer, timestamptz
) from public, anon, authenticated;
grant execute on function public.introduce_registration_from_legacy_roster(
  uuid, uuid, uuid, integer, timestamptz
) to authenticated;
