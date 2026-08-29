create table app_private.session_authority_cutovers (
  session_id uuid primary key references public.sessions(id) on delete restrict,
  source_authority text not null check (source_authority in ('NONE', 'LEGACY')),
  target_model_version integer not null check (target_model_version = 1),
  cutover_kind text not null check (cutover_kind in ('NEW_TARGET', 'LEGACY_EXPLICIT')),
  command_id uuid,
  source_fingerprint text,
  cutover_by_user_id uuid references auth.users(id) on delete set null,
  cutover_at timestamptz not null default pg_catalog.now(),
  check (
    (cutover_kind = 'NEW_TARGET' and source_authority = 'NONE' and source_fingerprint is null)
    or
    (
      cutover_kind = 'LEGACY_EXPLICIT'
      and source_authority = 'LEGACY'
      and nullif(pg_catalog.btrim(source_fingerprint), '') is not null
      and command_id is not null
    )
  )
);

create unique index session_authority_cutovers_command_idx
  on app_private.session_authority_cutovers (command_id)
  where command_id is not null;

create index session_authority_cutovers_actor_idx
  on app_private.session_authority_cutovers (cutover_by_user_id);

create function app_private.reject_session_authority_cutover_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and pg_catalog.pg_trigger_depth() > 1
     and new.cutover_by_user_id is null
     and old.cutover_by_user_id is not null
     and new.session_id = old.session_id
     and new.source_authority = old.source_authority
     and new.target_model_version = old.target_model_version
     and new.cutover_kind = old.cutover_kind
     and new.command_id is not distinct from old.command_id
     and new.source_fingerprint is not distinct from old.source_fingerprint
     and new.cutover_at = old.cutover_at then
    return new;
  end if;

  raise exception 'Session authority cutovers are immutable' using errcode = '55000';
end;
$$;

revoke all on function app_private.reject_session_authority_cutover_mutation()
  from public, anon, authenticated;

create trigger reject_session_authority_cutover_mutation_trigger
before update or delete on app_private.session_authority_cutovers
for each row execute function app_private.reject_session_authority_cutover_mutation();

insert into app_private.session_authority_cutovers (
  session_id,
  source_authority,
  target_model_version,
  cutover_kind,
  command_id,
  source_fingerprint,
  cutover_by_user_id,
  cutover_at
)
select
  s.id,
  'NONE',
  1,
  'NEW_TARGET',
  null,
  null,
  null,
  coalesce(s.created_at, pg_catalog.now())
from public.sessions s
where s.authority_model = 'target'
on conflict (session_id) do nothing;

create function app_private.guard_session_authority_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.authority_model = 'target' and new.authority_model <> 'target' then
    raise exception 'Target Session authority cannot return to legacy' using errcode = '55000';
  end if;

  if old.authority_model = 'legacy' and new.authority_model = 'target'
     and coalesce(
       pg_catalog.current_setting('app.session_authority_cutover', true),
       ''
     ) <> 'on' then
    raise exception 'Use the Session cohort cutover command' using errcode = '55000';
  end if;

  return new;
end;
$$;

revoke all on function app_private.guard_session_authority_transition()
  from public, anon, authenticated;

create trigger guard_session_authority_transition_trigger
before update of authority_model on public.sessions
for each row execute function app_private.guard_session_authority_transition();

create function app_private.assert_target_session_authority_ledger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_authority_model text;
  v_target_model_version integer;
  v_ledger_count bigint;
begin
  select s.authority_model, s.target_model_version
    into v_authority_model, v_target_model_version
    from public.sessions s
   where s.id = new.id;

  if not found or v_authority_model <> 'target' then
    return null;
  end if;

  select pg_catalog.count(*)
    into v_ledger_count
    from app_private.session_authority_cutovers c
   where c.session_id = new.id
     and c.target_model_version = v_target_model_version;

  if v_ledger_count <> 1 then
    raise exception 'Target Session authority requires matching provenance'
      using errcode = '55000';
  end if;

  return null;
end;
$$;

revoke all on function app_private.assert_target_session_authority_ledger()
  from public, anon, authenticated;

create constraint trigger assert_target_session_authority_ledger_trigger
after insert or update of authority_model, target_model_version on public.sessions
deferrable initially deferred
for each row execute function app_private.assert_target_session_authority_ledger();

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

  insert into app_private.session_authority_cutovers (
    session_id, source_authority, target_model_version, cutover_kind,
    command_id, source_fingerprint, cutover_by_user_id
  )
  values (p_session_id, 'NONE', 1, 'NEW_TARGET', null, null, v_uid);

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

alter table app_private.session_authority_cutovers enable row level security;
revoke all on app_private.session_authority_cutovers from public, anon, authenticated;
