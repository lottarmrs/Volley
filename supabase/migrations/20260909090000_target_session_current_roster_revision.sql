drop function if exists public.read_target_session(uuid);

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
  compatibility_type text,
  current_roster_revision_id uuid
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
      public.target_session_compatibility_type(v_session.play_mode),
      (
        select r.id
          from public.roster_revisions r
         where r.session_id = v_session.id
         order by r.revision_number desc
         limit 1
      );
end;
$$;

revoke all on function public.read_target_session(uuid) from public, anon;
grant execute on function public.read_target_session(uuid) to authenticated;
