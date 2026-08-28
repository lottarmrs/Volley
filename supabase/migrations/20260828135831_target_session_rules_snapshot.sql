create table public.session_rules_snapshots (
  id uuid primary key,
  session_id uuid not null unique references public.sessions(id) on delete restrict,
  rules_scope text not null,
  rules_schema_version integer not null,
  rules_payload jsonb not null,
  source_kind text not null,
  source_community_rules_id uuid,
  source_default_updated_at timestamptz,
  source_default_fingerprint text,
  captured_at timestamptz not null default now(),
  constraint session_rules_snapshots_scope_check
    check (rules_scope = 'SESSION_MATCH_EXECUTION'),
  constraint session_rules_snapshots_schema_version_check
    check (rules_schema_version = 1),
  constraint session_rules_snapshots_payload_object_check
    check (jsonb_typeof(rules_payload) = 'object'),
  constraint session_rules_snapshots_source_kind_check
    check (source_kind in ('SESSION_EXPLICIT', 'COMMUNITY_DEFAULTS')),
  constraint session_rules_snapshots_source_shape_check check (
    (
      source_kind = 'SESSION_EXPLICIT'
      and source_community_rules_id is null
      and source_default_updated_at is null
      and source_default_fingerprint is null
    )
    or
    (
      source_kind = 'COMMUNITY_DEFAULTS'
      and source_community_rules_id is not null
      and source_default_updated_at is not null
      and source_default_fingerprint is not null
    )
  )
);

create function app_private.reject_session_rules_snapshot_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Session rules snapshots are immutable' using errcode = '55000';
end;
$$;

revoke all on function app_private.reject_session_rules_snapshot_mutation()
  from public, anon, authenticated;

create trigger reject_session_rules_snapshot_mutation_trigger
before update or delete on public.session_rules_snapshots
for each row execute function app_private.reject_session_rules_snapshot_mutation();

create or replace function app_private.current_user_can_read_target_session(
  p_session_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.sessions s
     where s.id = p_session_id
       and s.authority_model = 'target'
       and (
         (
           s.session_context = 'COMMUNITY'
           and exists (
             select 1
               from public.community_memberships m
              where m.community_id = s.community_id
                and m.user_id = (select auth.uid())
                and m.status = 'active'
           )
         )
         or (
           s.session_context = 'QUICK'
           and exists (
             select 1
               from public.session_organizer_assignments a
              where a.session_id = s.id
                and a.organizer_user_id = (select auth.uid())
                and a.community_membership_id is null
                and a.revoked_at is null
           )
         )
       )
  );
$$;

revoke all on function app_private.current_user_can_read_target_session(uuid)
  from public, anon, authenticated;
grant execute on function app_private.current_user_can_read_target_session(uuid)
  to authenticated;

create or replace function app_private.current_user_can_read_target_session_courts(
  p_session_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app_private.current_user_can_read_target_session(p_session_id);
$$;

revoke all on function app_private.current_user_can_read_target_session_courts(uuid)
  from public, anon, authenticated;
grant execute on function app_private.current_user_can_read_target_session_courts(uuid)
  to authenticated;

drop policy if exists "Active Community members and assigned Quick Organizers can read Session Courts"
  on public.session_courts;
create policy "Active Community members and assigned Quick Organizers can read Session Courts"
  on public.session_courts
  for select to authenticated
  using (app_private.current_user_can_read_target_session(session_id));

alter table public.session_rules_snapshots enable row level security;
revoke all on public.session_rules_snapshots from public, anon, authenticated;
grant select on public.session_rules_snapshots to authenticated;

create policy "Active Community members and assigned Quick Organizers can read Session Rules Snapshots"
  on public.session_rules_snapshots
  for select to authenticated
  using (app_private.current_user_can_read_target_session(session_id));

create or replace function public.read_target_session(p_session_id uuid)
returns table (
  id uuid,
  community_id uuid,
  name text,
  session_context text,
  play_mode text,
  lifecycle_status text,
  publication_state text,
  planned_start_at timestamptz,
  planned_end_at timestamptz,
  actual_started_at timestamptz,
  actual_finished_at timestamptz,
  revision integer,
  compatibility_type text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.sessions;
begin
  if (select auth.uid()) is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select * into v_session
    from public.sessions s
   where s.id = p_session_id and s.authority_model = 'target';

  if not found then
    raise exception 'Target Session not found' using errcode = 'P0002';
  end if;

  if not app_private.current_user_can_read_target_session(v_session.id) then
    raise exception 'Not authorized to read this target Session' using errcode = '42501';
  end if;

  return query
    select
      v_session.id,
      v_session.community_id,
      v_session.name,
      v_session.session_context,
      v_session.play_mode,
      v_session.lifecycle_status,
      v_session.publication_state,
      v_session.planned_start_at,
      v_session.planned_end_at,
      v_session.actual_started_at,
      v_session.actual_finished_at,
      v_session.revision,
      public.target_session_compatibility_type(v_session.play_mode);
end;
$$;

revoke all on function public.read_target_session(uuid) from public, anon;
grant execute on function public.read_target_session(uuid) to authenticated;

create function public.freeze_target_session_rules_snapshot(
  p_snapshot_id uuid,
  p_session_id uuid,
  p_expected_revision integer,
  p_rules_schema_version integer,
  p_source_kind text,
  p_rules_payload jsonb
)
returns table (snapshot_id uuid, session_revision integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.sessions;
  v_rules_payload jsonb;
  v_source_community_rules_id uuid;
  v_source_default_updated_at timestamptz;
  v_source_default_fingerprint text;
begin
  select * into v_session
    from public.sessions
   where id = p_session_id and authority_model = 'target'
   for update;

  if not found then
    raise exception 'Target Session not found' using errcode = 'P0002';
  end if;

  perform public.assert_target_session_write_authorized(v_session);

  if p_snapshot_id is null then
    raise exception 'Snapshot id is required and final' using errcode = '23514';
  end if;
  if p_expected_revision is null then
    raise exception 'Expected Session revision is required' using errcode = '23514';
  end if;
  if v_session.revision is distinct from p_expected_revision then
    raise exception 'Stale Session revision' using errcode = '40001';
  end if;
  if v_session.lifecycle_status in ('COMPLETED', 'CANCELLED') then
    raise exception 'Cannot freeze rules for a terminal Session' using errcode = '23514';
  end if;
  if p_rules_schema_version is null or p_rules_schema_version <> 1 then
    raise exception 'Unsupported Session rules schema version' using errcode = '23514';
  end if;
  if p_source_kind is null
     or p_source_kind not in ('SESSION_EXPLICIT', 'COMMUNITY_DEFAULTS') then
    raise exception 'Invalid Session rules source kind' using errcode = '23514';
  end if;

  if p_source_kind = 'SESSION_EXPLICIT' then
    if p_rules_payload is null or jsonb_typeof(p_rules_payload) <> 'object' then
      raise exception 'Explicit Session rules payload must be a JSON object'
        using errcode = '23514';
    end if;
    v_rules_payload := p_rules_payload;
  else
    if p_rules_payload is not null then
      raise exception 'Community default rules payload is server-derived'
        using errcode = '23514';
    end if;
    if v_session.session_context <> 'COMMUNITY'
       or v_session.community_id is null
       or v_session.play_mode <> 'FREE_PLAY' then
      raise exception 'Community defaults require a Community FREE_PLAY Session'
        using errcode = '23514';
    end if;

    select cr.id, cr.updated_at, cr.free_play_rules
      into v_source_community_rules_id, v_source_default_updated_at, v_rules_payload
      from public.community_rules cr
     where cr.community_id = v_session.community_id;

    if not found then
      raise exception 'Community rules defaults not found' using errcode = '23514';
    end if;
    if jsonb_typeof(v_rules_payload) <> 'object' then
      raise exception 'Community default Session rules must be a JSON object'
        using errcode = '23514';
    end if;

    v_source_default_fingerprint := pg_catalog.md5(v_rules_payload::text);
  end if;

  insert into public.session_rules_snapshots (
    id,
    session_id,
    rules_scope,
    rules_schema_version,
    rules_payload,
    source_kind,
    source_community_rules_id,
    source_default_updated_at,
    source_default_fingerprint
  )
  values (
    p_snapshot_id,
    p_session_id,
    'SESSION_MATCH_EXECUTION',
    p_rules_schema_version,
    v_rules_payload,
    p_source_kind,
    v_source_community_rules_id,
    v_source_default_updated_at,
    v_source_default_fingerprint
  );

  update public.sessions
     set revision = revision + 1,
         updated_at = now()
   where id = p_session_id;

  return query select p_snapshot_id, v_session.revision + 1;
end;
$$;

revoke all on function public.freeze_target_session_rules_snapshot(
  uuid, uuid, integer, integer, text, jsonb
) from public, anon;
grant execute on function public.freeze_target_session_rules_snapshot(
  uuid, uuid, integer, integer, text, jsonb
) to authenticated;
