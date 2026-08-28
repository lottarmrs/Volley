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
