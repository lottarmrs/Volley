-- C6 XS-W3-01 — Target Session root and provisional semantic dimensions.
--
-- This is an additive strangler step. Existing rows remain authority_model = 'legacy';
-- no legacy type/status is interpreted or backfilled into the target fields. New target
-- rows are created only by semantic commands, have a final caller-supplied UUID, and carry
-- an explicit revision for optimistic concurrency.
--
-- OPEN-SES-001 remains open. The column names and values below are contract version 1,
-- provisional semantic values for this migration only, not a decision closing that issue:
--   session_context: QUICK | COMMUNITY
--   play_mode: FREE_PLAY | STRUCTURED_MATCHES
--   lifecycle_status: DRAFT | SCHEDULED | IN_PROGRESS | COMPLETED | CANCELLED
--   publication_state: PRIVATE | PUBLISHED
-- Competition remains external; it is not a Session type or column here.

alter table public.sessions
  add column if not exists authority_model text not null default 'legacy',
  add column if not exists target_model_version integer,
  add column if not exists session_context text,
  add column if not exists play_mode text,
  add column if not exists lifecycle_status text,
  add column if not exists publication_state text,
  add column if not exists planned_start_at timestamptz,
  add column if not exists planned_end_at timestamptz,
  add column if not exists actual_started_at timestamptz,
  add column if not exists actual_finished_at timestamptz,
  add column if not exists revision integer not null default 0;

alter table public.sessions
  drop constraint if exists sessions_authority_model_check,
  add constraint sessions_authority_model_check
    check (authority_model in ('legacy', 'target')),
  drop constraint if exists sessions_target_model_check,
  add constraint sessions_target_model_check check (
    authority_model = 'legacy'
    or (
      target_model_version is not null
      and target_model_version = 1
      and session_context is not null
      and session_context in ('QUICK', 'COMMUNITY')
      and play_mode is not null
      and play_mode in ('FREE_PLAY', 'STRUCTURED_MATCHES')
      and lifecycle_status is not null
      and lifecycle_status in ('DRAFT', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')
      and publication_state is not null
      and publication_state in ('PRIVATE', 'PUBLISHED')
      and revision is not null
      and revision >= 1
    )
  ),
  drop constraint if exists sessions_community_context_check,
  add constraint sessions_community_context_check
    check (session_context is distinct from 'COMMUNITY' or community_id is not null),
  drop constraint if exists sessions_planned_time_check,
  add constraint sessions_planned_time_check
    check (planned_end_at is null or planned_start_at is null or planned_end_at >= planned_start_at),
  drop constraint if exists sessions_actual_time_check,
  add constraint sessions_actual_time_check
    check (actual_finished_at is null or actual_started_at is null or actual_finished_at >= actual_started_at),
  drop constraint if exists sessions_in_progress_actual_start_check,
  add constraint sessions_in_progress_actual_start_check
    check (lifecycle_status is distinct from 'IN_PROGRESS' or actual_started_at is not null),
  drop constraint if exists sessions_completed_actual_time_check,
  add constraint sessions_completed_actual_time_check
    check (
      lifecycle_status is distinct from 'COMPLETED'
      or (actual_started_at is not null and actual_finished_at is not null)
    );

create index if not exists sessions_target_community_lifecycle_idx
  on public.sessions (community_id, lifecycle_status)
  where authority_model = 'target';

comment on column public.sessions.authority_model is
  'Write authority cohort: legacy rows retain legacy behavior; target rows use XS-W3-01 semantic commands.';
comment on column public.sessions.target_model_version is
  'Provisional Session semantic contract version. Version 1 does not close OPEN-SES-001.';
comment on column public.sessions.session_context is
  'Provisional v1 SessionContext: QUICK | COMMUNITY (OPEN-SES-001 remains open).';
comment on column public.sessions.play_mode is
  'Provisional v1 PlayMode: FREE_PLAY | STRUCTURED_MATCHES; Competition is external.';
comment on column public.sessions.lifecycle_status is
  'Provisional v1 lifecycle: DRAFT → SCHEDULED → IN_PROGRESS → COMPLETED, or CANCELLED.';
comment on column public.sessions.publication_state is
  'Publication is independent from lifecycle. Only PRIVATE is created in XS-W3-01; unpublish stays open.';
comment on column public.sessions.revision is
  'Explicit domain revision for target Session optimistic concurrency; updated_at is not a concurrency token.';

-- A caller can set an arbitrary custom GUC, so it cannot be an authorization boundary.
-- Target writes are excluded from the authenticated role's direct RLS policies instead.
-- SECURITY DEFINER semantic commands execute as the table owner and remain the target
-- writer; legacy rows retain the existing browser/sync CRUD behavior.
drop policy if exists "Community organizers can insert sessions" on public.sessions;
create policy "Community organizers can insert sessions" on public.sessions
  for insert to authenticated
  with check (
    authority_model = 'legacy'
    and owner_id = (select auth.uid())
    and (community_id is null or public.current_user_has_community_role(community_id))
  );

drop policy if exists "Community organizers can update sessions" on public.sessions;
create policy "Community organizers can update sessions" on public.sessions
  for update to authenticated
  using (
    authority_model = 'legacy'
    and (owner_id = (select auth.uid())
         or (community_id is not null and public.current_user_has_community_role(community_id)))
  )
  with check (
    authority_model = 'legacy'
    and (owner_id = (select auth.uid())
         or (community_id is not null and public.current_user_has_community_role(community_id)))
  );

drop policy if exists "Community organizers can delete sessions" on public.sessions;
create policy "Community organizers can delete sessions" on public.sessions
  for delete to authenticated
  using (
    authority_model = 'legacy'
    and (owner_id = (select auth.uid())
         or (community_id is not null and public.current_user_has_community_role(community_id)))
  );

create or replace function public.target_session_compatibility_type(p_play_mode text)
returns text
language sql
immutable
security definer
set search_path = ''
as $$
  select case p_play_mode
    when 'FREE_PLAY' then 'free_play'
    when 'STRUCTURED_MATCHES' then 'tournament'
    else null
  end;
$$;

revoke all on function public.target_session_compatibility_type(text) from public, anon, authenticated;

create or replace function public.target_session_compatibility_status(p_lifecycle_status text)
returns text
language sql
immutable
security definer
set search_path = ''
as $$
  select case p_lifecycle_status
    when 'DRAFT' then 'draft'
    when 'SCHEDULED' then 'draft'
    when 'IN_PROGRESS' then 'active'
    when 'COMPLETED' then 'finished'
    when 'CANCELLED' then 'cancelled'
    else null
  end;
$$;

revoke all on function public.target_session_compatibility_status(text) from public, anon, authenticated;

create or replace function public.assert_target_session_write_authorized(p_session public.sessions)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if p_session.community_id is null then
    if p_session.owner_id <> v_uid then
      raise exception 'Not authorized to write this Quick Session' using errcode = '42501';
    end if;
    return;
  end if;

  if not public.current_user_has_community_capability(p_session.community_id, 'session.manage') then
    raise exception 'Missing capability session.manage' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.assert_target_session_write_authorized(public.sessions)
  from public, anon, authenticated;

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
  if p_planned_end_at is not null and p_planned_start_at is not null
     and p_planned_end_at < p_planned_start_at then
    raise exception 'Planned Session end cannot precede its start' using errcode = '23514';
  end if;

  -- Quick may be Community-less. Any supplied Community nevertheless makes this a shared
  -- write and therefore requires the contextual capability, never an actor/role payload.
  if p_community_id is not null
     and not public.current_user_has_community_capability(p_community_id, 'session.manage') then
    raise exception 'Missing capability session.manage' using errcode = '42501';
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

  return p_session_id;
end;
$$;

revoke all on function public.create_target_session(uuid, uuid, text, text, text, timestamptz, timestamptz)
  from public, anon;
grant execute on function public.create_target_session(uuid, uuid, text, text, text, timestamptz, timestamptz)
  to authenticated;

create or replace function public.update_target_session_draft(
  p_session_id uuid,
  p_expected_revision integer,
  p_name text,
  p_planned_start_at timestamptz default null,
  p_planned_end_at timestamptz default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.sessions;
  v_planned_start_at timestamptz;
  v_planned_end_at timestamptz;
begin
  select * into v_session
    from public.sessions
   where id = p_session_id and authority_model = 'target'
   for update;

  if not found then
    raise exception 'Target Session not found' using errcode = 'P0002';
  end if;
  perform public.assert_target_session_write_authorized(v_session);
  if v_session.revision is distinct from p_expected_revision then
    raise exception 'Stale Session revision' using errcode = '40001';
  end if;
  if v_session.lifecycle_status <> 'DRAFT' then
    raise exception 'Only a DRAFT Session may use the draft update command' using errcode = '23514';
  end if;
  if coalesce(btrim(p_name), '') = '' then
    raise exception 'Session name is required' using errcode = '23514';
  end if;

  v_planned_start_at := coalesce(p_planned_start_at, v_session.planned_start_at);
  v_planned_end_at := coalesce(p_planned_end_at, v_session.planned_end_at);
  if v_planned_end_at is not null and v_planned_start_at is not null
     and v_planned_end_at < v_planned_start_at then
    raise exception 'Planned Session end cannot precede its start' using errcode = '23514';
  end if;

  update public.sessions
     set name = btrim(p_name),
         date = coalesce(v_planned_start_at::date, date),
         planned_start_at = v_planned_start_at,
         planned_end_at = v_planned_end_at,
         updated_at = now(),
         revision = revision + 1
   where id = p_session_id;

  return v_session.revision + 1;
end;
$$;

revoke all on function public.update_target_session_draft(uuid, integer, text, timestamptz, timestamptz)
  from public, anon;
grant execute on function public.update_target_session_draft(uuid, integer, text, timestamptz, timestamptz)
  to authenticated;

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
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select * into v_session
    from public.sessions s
   where s.id = p_session_id and s.authority_model = 'target';

  if not found then
    raise exception 'Target Session not found' using errcode = 'P0002';
  end if;

  if v_session.community_id is null then
    if v_session.owner_id <> v_uid then
      raise exception 'Not authorized to read this Quick Session' using errcode = '42501';
    end if;
  elsif not exists (
    select 1
      from public.community_memberships m
     where m.community_id = v_session.community_id
       and m.user_id = v_uid
       and m.status = 'active'
  ) and not public.current_user_has_community_capability(v_session.community_id, 'session.manage') then
    raise exception 'Not authorized to read this Community Session' using errcode = '42501';
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

create or replace function public.claim_session_ownership(p_session_id uuid, p_device_id text)
returns public.sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  v_session public.sessions;
begin
  if v_uid is null then
    raise exception 'Nao autenticado' using errcode = '42501';
  end if;

  select * into v_session from public.sessions
   where id = p_session_id and deleted_at is null;

  if v_session.id is null then
    raise exception 'Sessão não encontrada' using errcode = '22023';
  end if;
  if v_session.authority_model <> 'legacy' then
    raise exception 'Target Session does not support legacy ownership commands' using errcode = '42501';
  end if;

  if not (
    v_session.owner_id = v_uid
    or (v_session.community_id is not null
        and public.current_user_has_community_role(v_session.community_id))
  ) then
    raise exception 'Sem permissão para controlar esta sessão' using errcode = '42501';
  end if;

  if v_session.status = 'finished' then
    raise exception 'Sessão encerrada não tem placar a marcar' using errcode = '22023';
  end if;

  if v_session.controlled_by_user_id is not null
     and v_session.controlled_by_user_id <> v_uid
     and not public.session_control_is_expired(v_session) then
    raise exception 'Outra pessoa está com o controle desta sessão' using errcode = '42501';
  end if;

  update public.sessions
     set controlled_by_user_id = v_uid,
         control_claimed_at = now(),
         control_device_id = p_device_id,
         updated_at = now()
   where id = p_session_id
  returning * into v_session;

  return v_session;
end;
$$;

revoke execute on function public.claim_session_ownership(uuid, text) from public, anon;
grant execute on function public.claim_session_ownership(uuid, text) to authenticated;

create or replace function public.transfer_session_ownership(p_session_id uuid, p_device_id text)
returns public.sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  v_session public.sessions;
begin
  if v_uid is null then
    raise exception 'Nao autenticado' using errcode = '42501';
  end if;

  select * into v_session from public.sessions
   where id = p_session_id and deleted_at is null;

  if v_session.id is null then
    raise exception 'Sessão não encontrada' using errcode = '22023';
  end if;
  if v_session.authority_model <> 'legacy' then
    raise exception 'Target Session does not support legacy ownership commands' using errcode = '42501';
  end if;

  if not (
    v_session.owner_id = v_uid
    or (v_session.community_id is not null
        and public.current_user_has_community_role(v_session.community_id))
  ) then
    raise exception 'Sem permissão para controlar esta sessão' using errcode = '42501';
  end if;

  if v_session.status = 'finished' then
    raise exception 'Sessão encerrada não tem placar a marcar' using errcode = '22023';
  end if;

  update public.sessions
     set controlled_by_user_id = v_uid,
         control_claimed_at = now(),
         control_device_id = p_device_id,
         updated_at = now()
   where id = p_session_id
  returning * into v_session;

  return v_session;
end;
$$;

revoke execute on function public.transfer_session_ownership(uuid, text) from public, anon;
grant execute on function public.transfer_session_ownership(uuid, text) to authenticated;
