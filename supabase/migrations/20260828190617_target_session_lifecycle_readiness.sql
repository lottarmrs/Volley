alter table public.sessions
  add column cancelled_at timestamptz,
  add column cancelled_by_user_id uuid references auth.users(id) on delete set null,
  add column cancel_reason text,
  add constraint sessions_target_cancelled_audit_check check (
    authority_model = 'legacy'
    or lifecycle_status is distinct from 'CANCELLED'
    or (cancelled_at is not null and cancelled_by_user_id is not null)
  ),
  add constraint sessions_cancel_reason_non_blank_check check (
    cancel_reason is null or btrim(cancel_reason) <> ''
  );

create index sessions_cancelled_by_user_id_idx on public.sessions (cancelled_by_user_id);

create table app_private.session_readiness_blockers (
  code text primary key,
  evaluation_status text not null check (evaluation_status in ('EVALUATED', 'DEFERRED')),
  owning_wave text not null,
  description text not null
);

insert into app_private.session_readiness_blockers (code, evaluation_status, owning_wave, description)
values
  ('REQUIRED_ORGANIZER_MISSING', 'EVALUATED', 'W3',
   'No active Session organizer assignment is responsible for this Session.'),
  ('NO_EFFECTIVE_ROSTER', 'EVALUATED', 'W3',
   'The latest roster revision is absent or contains no participants.'),
  ('RULES_INVALID', 'EVALUATED', 'W3',
   'No Session rules snapshot has been frozen for this Session.'),
  ('COURT_CONFIGURATION_INVALID', 'EVALUATED', 'W3',
   'The Session has no configured court to play on.'),
  ('ROSTER_STALE', 'DEFERRED', 'W6',
   'A confirmed Team draw is bound to an older roster revision than the current one.'),
  ('NO_CONFIRMED_TEAM_DRAW', 'DEFERRED', 'W6',
   'Structured play requires a confirmed Team draw that does not exist yet.'),
  ('TEAM_DRAW_STALE', 'DEFERRED', 'W6',
   'The confirmed Team draw was invalidated by a later roster or configuration change.'),
  ('VOTING_STILL_OPEN', 'DEFERRED', 'W5',
   'A rating or evaluation ballot is still open and would change inputs mid-Session.'),
  ('COMPETITION_FIXTURE_NOT_READY', 'DEFERRED', 'W8',
   'A Competition fixture hosted by this Session is not ready to be played.');

alter table app_private.session_readiness_blockers enable row level security;
revoke all on app_private.session_readiness_blockers from public, anon, authenticated;

create function app_private.target_session_readiness(p_session_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_session_revision integer;
  v_roster_revision_id uuid;
  v_roster_revision_number integer;
  v_rules_snapshot_id uuid;
  v_blocker_codes text[] := array[]::text[];
  v_blockers jsonb;
begin
  select s.revision,
         roster.id,
         roster.revision_number,
         rules.id
    into v_session_revision,
         v_roster_revision_id,
         v_roster_revision_number,
         v_rules_snapshot_id
    from public.sessions s
    left join lateral (
      select r.id, r.revision_number
        from public.roster_revisions r
       where r.session_id = s.id
       order by r.revision_number desc, r.id desc
       limit 1
    ) roster on true
    left join public.session_rules_snapshots rules on rules.session_id = s.id
   where s.id = p_session_id;

  if not exists (
    select 1
      from public.session_organizer_assignments a
     where a.session_id = p_session_id
       and a.revoked_at is null
  ) then
    v_blocker_codes := array_append(v_blocker_codes, 'REQUIRED_ORGANIZER_MISSING');
  end if;

  if v_roster_revision_id is null or not exists (
    select 1
      from public.roster_revision_entries e
     where e.roster_revision_id = v_roster_revision_id
  ) then
    v_blocker_codes := array_append(v_blocker_codes, 'NO_EFFECTIVE_ROSTER');
  end if;

  if v_rules_snapshot_id is null then
    v_blocker_codes := array_append(v_blocker_codes, 'RULES_INVALID');
  end if;

  if not exists (
    select 1
      from public.session_courts c
     where c.session_id = p_session_id
  ) then
    v_blocker_codes := array_append(v_blocker_codes, 'COURT_CONFIGURATION_INVALID');
  end if;

  select coalesce(
           jsonb_agg(
             jsonb_build_object(
               'code', b.code,
               'evaluation_status', b.evaluation_status,
               'owning_wave', b.owning_wave
             )
             order by b.code
           ),
           '[]'::jsonb
         )
    into v_blockers
    from app_private.session_readiness_blockers b
   where b.code = any(v_blocker_codes);

  return jsonb_build_object(
    'ready', jsonb_array_length(v_blockers) = 0,
    'blockers', v_blockers,
    'revisions', jsonb_build_object(
      'session_revision', v_session_revision,
      'roster_revision_id', v_roster_revision_id,
      'roster_revision_number', v_roster_revision_number,
      'rules_snapshot_id', v_rules_snapshot_id
    )
  );
end;
$$;

revoke all on function app_private.target_session_readiness(uuid)
  from public, anon, authenticated;

create function public.read_target_session_readiness(p_session_id uuid)
returns table (ready boolean, blockers jsonb, revisions jsonb)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.sessions;
  v_readiness jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select * into v_session
    from public.sessions s
   where s.id = p_session_id
     and s.authority_model = 'target';

  if not found then
    raise exception 'Target Session not found' using errcode = 'P0002';
  end if;

  perform public.assert_target_session_write_authorized(v_session);

  v_readiness := app_private.target_session_readiness(v_session.id);

  return query
    select (v_readiness ->> 'ready')::boolean,
           v_readiness -> 'blockers',
           v_readiness -> 'revisions';
end;
$$;

revoke all on function public.read_target_session_readiness(uuid) from public, anon;
grant execute on function public.read_target_session_readiness(uuid) to authenticated;

-- ── XS-W3-06 Task 6 — the nine semantic Session lifecycle commands ─────────────────────
--
-- Every state-changing command below follows the same command prologue: null-check the
-- caller-supplied ids, load-and-lock the target Session (raising P0002 when absent), check
-- write authority, consult app_private.find_command_receipt for a retried command_id,
-- guard the transition or precondition, check the caller's expected_revision, mutate, then
-- record the receipt. The duplication across the eight commands is accepted: PL/pgSQL
-- cannot early-return from a callee, and the factorable pieces already live in the two
-- helpers below plus the substrate from the prior migration.

create function app_private.assert_target_session_lifecycle_transition(p_from text, p_to text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (
    (p_from, p_to) in (
      ('DRAFT', 'SCHEDULED'),
      ('DRAFT', 'IN_PROGRESS'),
      ('SCHEDULED', 'IN_PROGRESS'),
      ('IN_PROGRESS', 'COMPLETED'),
      ('DRAFT', 'CANCELLED'),
      ('SCHEDULED', 'CANCELLED'),
      ('IN_PROGRESS', 'CANCELLED')
    )
  ) then
    raise exception 'Disallowed Session lifecycle transition from % to %', p_from, p_to
      using errcode = '23514';
  end if;
end;
$$;

revoke all on function app_private.assert_target_session_lifecycle_transition(text, text)
  from public, anon, authenticated;

-- Reads legacy `public.games` deliberately: SES-INV-025 forbids silently finishing a
-- Session while a Match is still active. Target Matches arrive in XS-W7-01; XS-W3-07 will
-- bring legacy Sessions carrying `games` under target authority. Until then this is the
-- only source of truth for "does this target Session have an active Match".
create function app_private.target_session_has_active_matches(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.games g
     where g.session_id = p_session_id
       and g.deleted_at is null
       and g.status not in ('finished', 'cancelled')
  );
$$;

revoke all on function app_private.target_session_has_active_matches(uuid)
  from public, anon, authenticated;

create function public.schedule_target_session(
  p_command_id uuid,
  p_session_id uuid,
  p_expected_revision integer
)
returns table (session_revision integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.sessions;
  v_receipt jsonb;
  v_result jsonb;
  v_new_revision integer;
begin
  if p_command_id is null or p_session_id is null then
    raise exception 'command_id and session_id are required' using errcode = '23514';
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
    p_command_id, 'schedule_target_session', p_session_id
  );
  if v_receipt is not null then
    return query select (v_receipt ->> 'session_revision')::integer;
    return;
  end if;

  if v_session.lifecycle_status = 'SCHEDULED' then
    if v_session.revision is distinct from p_expected_revision then
      raise exception 'Stale Session revision' using errcode = '40001';
    end if;
    v_result := pg_catalog.jsonb_build_object('session_revision', v_session.revision);
    perform app_private.record_command_receipt(
      p_command_id, (select auth.uid()), 'schedule_target_session', p_session_id,
      v_result, 'SESSION_LIFECYCLE'
    );
    return query select v_session.revision;
    return;
  end if;

  perform app_private.assert_target_session_lifecycle_transition(
    v_session.lifecycle_status, 'SCHEDULED'
  );

  if v_session.planned_start_at is null then
    raise exception 'Session requires a planned start time to be scheduled'
      using errcode = '23514';
  end if;

  if v_session.revision is distinct from p_expected_revision then
    raise exception 'Stale Session revision' using errcode = '40001';
  end if;

  update public.sessions
     set lifecycle_status = 'SCHEDULED',
         status = public.target_session_compatibility_status('SCHEDULED'),
         revision = revision + 1,
         updated_at = pg_catalog.now()
   where id = p_session_id;

  v_new_revision := v_session.revision + 1;
  v_result := pg_catalog.jsonb_build_object('session_revision', v_new_revision);
  perform app_private.record_command_receipt(
    p_command_id, (select auth.uid()), 'schedule_target_session', p_session_id,
    v_result, 'SESSION_LIFECYCLE'
  );

  return query select v_new_revision;
end;
$$;

revoke all on function public.schedule_target_session(uuid, uuid, integer) from public, anon;
grant execute on function public.schedule_target_session(uuid, uuid, integer) to authenticated;

create function public.start_target_session(
  p_command_id uuid,
  p_session_id uuid,
  p_expected_revision integer
)
returns table (session_revision integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.sessions;
  v_receipt jsonb;
  v_result jsonb;
  v_new_revision integer;
  v_readiness jsonb;
  v_blocker_codes text;
begin
  if p_command_id is null or p_session_id is null then
    raise exception 'command_id and session_id are required' using errcode = '23514';
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
    p_command_id, 'start_target_session', p_session_id
  );
  if v_receipt is not null then
    return query select (v_receipt ->> 'session_revision')::integer;
    return;
  end if;

  if v_session.lifecycle_status = 'IN_PROGRESS' then
    if v_session.revision is distinct from p_expected_revision then
      raise exception 'Stale Session revision' using errcode = '40001';
    end if;
    v_result := pg_catalog.jsonb_build_object('session_revision', v_session.revision);
    perform app_private.record_command_receipt(
      p_command_id, (select auth.uid()), 'start_target_session', p_session_id,
      v_result, 'SESSION_LIFECYCLE'
    );
    return query select v_session.revision;
    return;
  end if;

  perform app_private.assert_target_session_lifecycle_transition(
    v_session.lifecycle_status, 'IN_PROGRESS'
  );

  -- N4.04.03.01: Quick may take the reduced DRAFT -> IN_PROGRESS path without ever having
  -- set up an explicit roster revision, rules snapshot, or additional court -- organizer
  -- and a default court already exist from create_target_session. N6.04.03 scopes the
  -- readiness gate to the official SCHEDULED -> IN_PROGRESS transition (SES-INV-024): once
  -- an explicit roster revision exists for the Session, it must still have participants at
  -- start time. A Session that never established one is not held to that bar.
  if v_session.lifecycle_status = 'SCHEDULED' then
    v_readiness := app_private.target_session_readiness(p_session_id);
    if v_readiness -> 'revisions' ->> 'roster_revision_id' is not null
       and exists (
         select 1
           from pg_catalog.jsonb_array_elements(v_readiness -> 'blockers') b
          where b ->> 'code' = 'NO_EFFECTIVE_ROSTER'
       )
    then
      select pg_catalog.string_agg(b ->> 'code', ', ')
        into v_blocker_codes
        from pg_catalog.jsonb_array_elements(v_readiness -> 'blockers') b;
      raise exception 'Session is not ready to start: %', v_blocker_codes
        using errcode = '23514';
    end if;
  end if;

  if v_session.revision is distinct from p_expected_revision then
    raise exception 'Stale Session revision' using errcode = '40001';
  end if;

  update public.sessions
     set lifecycle_status = 'IN_PROGRESS',
         status = public.target_session_compatibility_status('IN_PROGRESS'),
         actual_started_at = pg_catalog.now(),
         revision = revision + 1,
         updated_at = pg_catalog.now()
   where id = p_session_id;

  v_new_revision := v_session.revision + 1;
  v_result := pg_catalog.jsonb_build_object('session_revision', v_new_revision);
  perform app_private.record_command_receipt(
    p_command_id, (select auth.uid()), 'start_target_session', p_session_id,
    v_result, 'SESSION_LIFECYCLE'
  );

  return query select v_new_revision;
end;
$$;

revoke all on function public.start_target_session(uuid, uuid, integer) from public, anon;
grant execute on function public.start_target_session(uuid, uuid, integer) to authenticated;

create function public.finish_target_session(
  p_command_id uuid,
  p_session_id uuid,
  p_expected_revision integer
)
returns table (session_revision integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.sessions;
  v_receipt jsonb;
  v_result jsonb;
  v_new_revision integer;
begin
  if p_command_id is null or p_session_id is null then
    raise exception 'command_id and session_id are required' using errcode = '23514';
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
    p_command_id, 'finish_target_session', p_session_id
  );
  if v_receipt is not null then
    return query select (v_receipt ->> 'session_revision')::integer;
    return;
  end if;

  perform app_private.assert_target_session_lifecycle_transition(
    v_session.lifecycle_status, 'COMPLETED'
  );

  if app_private.target_session_has_active_matches(p_session_id) then
    raise exception 'Cannot finish a Session while a Match is still active (SES-INV-025)'
      using errcode = '23514';
  end if;

  if v_session.revision is distinct from p_expected_revision then
    raise exception 'Stale Session revision' using errcode = '40001';
  end if;

  update public.sessions
     set lifecycle_status = 'COMPLETED',
         status = public.target_session_compatibility_status('COMPLETED'),
         actual_finished_at = pg_catalog.now(),
         revision = revision + 1,
         updated_at = pg_catalog.now()
   where id = p_session_id;

  v_new_revision := v_session.revision + 1;
  v_result := pg_catalog.jsonb_build_object('session_revision', v_new_revision);
  perform app_private.record_command_receipt(
    p_command_id, (select auth.uid()), 'finish_target_session', p_session_id,
    v_result, 'SESSION_LIFECYCLE'
  );

  return query select v_new_revision;
end;
$$;

revoke all on function public.finish_target_session(uuid, uuid, integer) from public, anon;
grant execute on function public.finish_target_session(uuid, uuid, integer) to authenticated;

create function public.cancel_target_session(
  p_command_id uuid,
  p_session_id uuid,
  p_expected_revision integer,
  p_cancel_reason text
)
returns table (session_revision integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.sessions;
  v_receipt jsonb;
  v_result jsonb;
  v_new_revision integer;
  v_uid uuid := (select auth.uid());
begin
  if p_command_id is null or p_session_id is null then
    raise exception 'command_id and session_id are required' using errcode = '23514';
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
    p_command_id, 'cancel_target_session', p_session_id
  );
  if v_receipt is not null then
    return query select (v_receipt ->> 'session_revision')::integer;
    return;
  end if;

  perform app_private.assert_target_session_lifecycle_transition(
    v_session.lifecycle_status, 'CANCELLED'
  );

  if p_cancel_reason is null or pg_catalog.btrim(p_cancel_reason) = '' then
    raise exception 'Cancel reason is required' using errcode = '23514';
  end if;

  if v_session.lifecycle_status = 'IN_PROGRESS'
     and app_private.target_session_has_active_matches(p_session_id) then
    raise exception 'Cannot cancel a Session while a Match is still active (N5.04.16.02)'
      using errcode = '23514';
  end if;

  if v_session.revision is distinct from p_expected_revision then
    raise exception 'Stale Session revision' using errcode = '40001';
  end if;

  update public.sessions
     set lifecycle_status = 'CANCELLED',
         status = public.target_session_compatibility_status('CANCELLED'),
         cancelled_at = pg_catalog.now(),
         cancelled_by_user_id = v_uid,
         cancel_reason = pg_catalog.btrim(p_cancel_reason),
         revision = revision + 1,
         updated_at = pg_catalog.now()
   where id = p_session_id;

  v_new_revision := v_session.revision + 1;
  v_result := pg_catalog.jsonb_build_object('session_revision', v_new_revision);
  perform app_private.record_command_receipt(
    p_command_id, v_uid, 'cancel_target_session', p_session_id, v_result, 'SESSION_LIFECYCLE'
  );

  return query select v_new_revision;
end;
$$;

revoke all on function public.cancel_target_session(uuid, uuid, integer, text)
  from public, anon;
grant execute on function public.cancel_target_session(uuid, uuid, integer, text)
  to authenticated;

create function public.publish_target_session(
  p_command_id uuid,
  p_session_id uuid,
  p_expected_revision integer
)
returns table (session_revision integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.sessions;
  v_receipt jsonb;
  v_result jsonb;
  v_new_revision integer;
begin
  if p_command_id is null or p_session_id is null then
    raise exception 'command_id and session_id are required' using errcode = '23514';
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
    p_command_id, 'publish_target_session', p_session_id
  );
  if v_receipt is not null then
    return query select (v_receipt ->> 'session_revision')::integer;
    return;
  end if;

  if v_session.publication_state = 'PUBLISHED' then
    if v_session.revision is distinct from p_expected_revision then
      raise exception 'Stale Session revision' using errcode = '40001';
    end if;
    v_result := pg_catalog.jsonb_build_object('session_revision', v_session.revision);
    perform app_private.record_command_receipt(
      p_command_id, (select auth.uid()), 'publish_target_session', p_session_id,
      v_result, 'SESSION_LIFECYCLE'
    );
    return query select v_session.revision;
    return;
  end if;

  if v_session.lifecycle_status not in ('DRAFT', 'SCHEDULED') then
    raise exception 'Session must be DRAFT or SCHEDULED to publish' using errcode = '23514';
  end if;

  if v_session.revision is distinct from p_expected_revision then
    raise exception 'Stale Session revision' using errcode = '40001';
  end if;

  update public.sessions
     set publication_state = 'PUBLISHED',
         revision = revision + 1,
         updated_at = pg_catalog.now()
   where id = p_session_id;

  v_new_revision := v_session.revision + 1;
  v_result := pg_catalog.jsonb_build_object('session_revision', v_new_revision);
  perform app_private.record_command_receipt(
    p_command_id, (select auth.uid()), 'publish_target_session', p_session_id,
    v_result, 'SESSION_LIFECYCLE'
  );

  return query select v_new_revision;
end;
$$;

revoke all on function public.publish_target_session(uuid, uuid, integer) from public, anon;
grant execute on function public.publish_target_session(uuid, uuid, integer) to authenticated;

-- assign/revoke deliberately do NOT call assert_target_session_write_authorized: it
-- requires an existing, non-revoked organizer assignment, which would make it impossible
-- to create the very first assignment on a Session. Authorization instead mirrors
-- create_target_session's Community bootstrap check: the Community's session.manage
-- capability, or -- for a Quick Session -- Session ownership. The Community is always
-- resolved from the loaded Session row, never a client argument (N8.04.06).
create function public.assign_target_session_organizer(
  p_command_id uuid,
  p_assignment_id uuid,
  p_session_id uuid,
  p_expected_revision integer,
  p_organizer_user_id uuid
)
returns table (assignment_id uuid, session_revision integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.sessions;
  v_receipt jsonb;
  v_result jsonb;
  v_new_revision integer;
  v_uid uuid := (select auth.uid());
  v_membership_id uuid;
  v_existing_id uuid;
begin
  if p_command_id is null or p_session_id is null then
    raise exception 'command_id and session_id are required' using errcode = '23514';
  end if;

  select * into v_session
    from public.sessions
   where id = p_session_id and authority_model = 'target'
   for update;
  if not found then
    raise exception 'Target Session not found' using errcode = 'P0002';
  end if;

  if v_session.community_id is not null then
    if not public.current_user_has_community_capability(v_session.community_id, 'session.manage') then
      raise exception 'Missing capability session.manage' using errcode = '42501';
    end if;
  else
    if v_uid is null or v_session.owner_id <> v_uid then
      raise exception 'Not authorized to assign an organizer to this Quick Session'
        using errcode = '42501';
    end if;
  end if;

  v_receipt := app_private.find_command_receipt(
    p_command_id, 'assign_target_session_organizer', p_session_id
  );
  if v_receipt is not null then
    return query
      select (v_receipt ->> 'assignment_id')::uuid, (v_receipt ->> 'session_revision')::integer;
    return;
  end if;

  if v_session.lifecycle_status in ('COMPLETED', 'CANCELLED') then
    raise exception 'Cannot assign an organizer to a terminal Session' using errcode = '23514';
  end if;
  if p_assignment_id is null then
    raise exception 'Assignment id is required and final' using errcode = '23514';
  end if;
  if p_organizer_user_id is null then
    raise exception 'Organizer user id is required' using errcode = '23514';
  end if;

  select id into v_existing_id
    from public.session_organizer_assignments
   where session_id = p_session_id
     and organizer_user_id = p_organizer_user_id
     and revoked_at is null;

  if found then
    if v_session.revision is distinct from p_expected_revision then
      raise exception 'Stale Session revision' using errcode = '40001';
    end if;
    v_result := pg_catalog.jsonb_build_object(
      'assignment_id', v_existing_id, 'session_revision', v_session.revision
    );
    perform app_private.record_command_receipt(
      p_command_id, v_uid, 'assign_target_session_organizer', p_session_id,
      v_result, 'SESSION_LIFECYCLE'
    );
    return query select v_existing_id, v_session.revision;
    return;
  end if;

  if v_session.revision is distinct from p_expected_revision then
    raise exception 'Stale Session revision' using errcode = '40001';
  end if;

  if v_session.community_id is not null then
    select m.id into v_membership_id
      from public.community_memberships m
     where m.community_id = v_session.community_id
       and m.user_id = p_organizer_user_id
       and m.status = 'active';
    if v_membership_id is null then
      raise exception 'Organizer requires an active Community membership' using errcode = '23514';
    end if;
  else
    v_membership_id := null;
  end if;

  insert into public.session_organizer_assignments (
    id, session_id, community_membership_id, organizer_user_id, assigned_by_user_id
  ) values (
    p_assignment_id, p_session_id, v_membership_id, p_organizer_user_id, v_uid
  );

  update public.sessions
     set revision = revision + 1,
         updated_at = pg_catalog.now()
   where id = p_session_id;

  v_new_revision := v_session.revision + 1;
  v_result := pg_catalog.jsonb_build_object(
    'assignment_id', p_assignment_id, 'session_revision', v_new_revision
  );
  perform app_private.record_command_receipt(
    p_command_id, v_uid, 'assign_target_session_organizer', p_session_id,
    v_result, 'SESSION_LIFECYCLE'
  );

  return query select p_assignment_id, v_new_revision;
end;
$$;

revoke all on function public.assign_target_session_organizer(uuid, uuid, uuid, integer, uuid)
  from public, anon;
grant execute on function public.assign_target_session_organizer(uuid, uuid, uuid, integer, uuid)
  to authenticated;

create function public.revoke_target_session_organizer(
  p_command_id uuid,
  p_session_id uuid,
  p_expected_revision integer,
  p_organizer_user_id uuid
)
returns table (session_revision integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.sessions;
  v_receipt jsonb;
  v_result jsonb;
  v_new_revision integer;
  v_uid uuid := (select auth.uid());
  v_assignment_id uuid;
begin
  if p_command_id is null or p_session_id is null then
    raise exception 'command_id and session_id are required' using errcode = '23514';
  end if;

  select * into v_session
    from public.sessions
   where id = p_session_id and authority_model = 'target'
   for update;
  if not found then
    raise exception 'Target Session not found' using errcode = 'P0002';
  end if;

  if v_session.community_id is not null then
    if not public.current_user_has_community_capability(v_session.community_id, 'session.manage') then
      raise exception 'Missing capability session.manage' using errcode = '42501';
    end if;
  else
    if v_uid is null or v_session.owner_id <> v_uid then
      raise exception 'Not authorized to revoke an organizer on this Quick Session'
        using errcode = '42501';
    end if;
  end if;

  v_receipt := app_private.find_command_receipt(
    p_command_id, 'revoke_target_session_organizer', p_session_id
  );
  if v_receipt is not null then
    return query select (v_receipt ->> 'session_revision')::integer;
    return;
  end if;

  if v_session.lifecycle_status in ('COMPLETED', 'CANCELLED') then
    raise exception 'Cannot revoke an organizer on a terminal Session' using errcode = '23514';
  end if;
  if p_organizer_user_id is null then
    raise exception 'Organizer user id is required' using errcode = '23514';
  end if;

  select id into v_assignment_id
    from public.session_organizer_assignments
   where session_id = p_session_id
     and organizer_user_id = p_organizer_user_id
     and revoked_at is null;

  if not found then
    if v_session.revision is distinct from p_expected_revision then
      raise exception 'Stale Session revision' using errcode = '40001';
    end if;
    v_result := pg_catalog.jsonb_build_object('session_revision', v_session.revision);
    perform app_private.record_command_receipt(
      p_command_id, v_uid, 'revoke_target_session_organizer', p_session_id,
      v_result, 'SESSION_LIFECYCLE'
    );
    return query select v_session.revision;
    return;
  end if;

  if v_session.revision is distinct from p_expected_revision then
    raise exception 'Stale Session revision' using errcode = '40001';
  end if;

  update public.session_organizer_assignments
     set revoked_at = pg_catalog.now(),
         revoked_by_user_id = v_uid
   where id = v_assignment_id;

  update public.sessions
     set revision = revision + 1,
         updated_at = pg_catalog.now()
   where id = p_session_id;

  v_new_revision := v_session.revision + 1;
  v_result := pg_catalog.jsonb_build_object('session_revision', v_new_revision);
  perform app_private.record_command_receipt(
    p_command_id, v_uid, 'revoke_target_session_organizer', p_session_id,
    v_result, 'SESSION_LIFECYCLE'
  );

  return query select v_new_revision;
end;
$$;

revoke all on function public.revoke_target_session_organizer(uuid, uuid, integer, uuid)
  from public, anon;
grant execute on function public.revoke_target_session_organizer(uuid, uuid, integer, uuid)
  to authenticated;

create function public.configure_target_session_court(
  p_command_id uuid,
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
  v_receipt jsonb;
  v_result jsonb;
  v_new_revision integer;
  v_court public.session_courts;
begin
  if p_command_id is null or p_session_id is null then
    raise exception 'command_id and session_id are required' using errcode = '23514';
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
    p_command_id, 'configure_target_session_court', p_session_id
  );
  if v_receipt is not null then
    return query
      select (v_receipt ->> 'court_id')::uuid, (v_receipt ->> 'session_revision')::integer;
    return;
  end if;

  select * into v_court
    from public.session_courts
   where id = p_court_id and session_id = p_session_id;
  if not found then
    raise exception 'Session Court not found' using errcode = 'P0002';
  end if;

  if v_session.lifecycle_status in ('COMPLETED', 'CANCELLED') then
    raise exception 'Cannot configure a Court on a terminal Session' using errcode = '23514';
  end if;
  if p_label is null or p_label ~ '^[[:space:]]*$' then
    raise exception 'Court label is required' using errcode = '23514';
  end if;
  if p_court_order is null or p_court_order < 1 then
    raise exception 'Court order must be at least one' using errcode = '23514';
  end if;

  if v_session.revision is distinct from p_expected_revision then
    raise exception 'Stale Session revision' using errcode = '40001';
  end if;

  update public.session_courts
     set label = pg_catalog.btrim(p_label),
         court_order = p_court_order,
         updated_at = pg_catalog.now()
   where id = p_court_id;

  update public.sessions
     set revision = revision + 1,
         updated_at = pg_catalog.now()
   where id = p_session_id;

  v_new_revision := v_session.revision + 1;
  v_result := pg_catalog.jsonb_build_object(
    'court_id', p_court_id, 'session_revision', v_new_revision
  );
  perform app_private.record_command_receipt(
    p_command_id, (select auth.uid()), 'configure_target_session_court', p_session_id,
    v_result, 'SESSION_LIFECYCLE'
  );

  return query select p_court_id, v_new_revision;
end;
$$;

revoke all on function public.configure_target_session_court(
  uuid, uuid, uuid, integer, text, integer
) from public, anon;
grant execute on function public.configure_target_session_court(
  uuid, uuid, uuid, integer, text, integer
) to authenticated;
