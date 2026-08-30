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

create function app_private.legacy_session_cutover_fingerprint(
  p_session public.sessions
)
returns text
language sql
security definer
set search_path = ''
as $$
  select pg_catalog.md5(
    pg_catalog.jsonb_build_object(
      'id', (p_session).id,
      'owner_id', (p_session).owner_id,
      'community_id', (p_session).community_id,
      'name', (p_session).name,
      'date', pg_catalog.to_char((p_session).date, 'YYYY-MM-DD'),
      'location', (p_session).location,
      'notes', (p_session).notes,
      'status', (p_session).status,
      'type', (p_session).type,
      'selected_player_ids', (p_session).selected_player_ids,
      'team_ids', (p_session).team_ids,
      'config', (p_session).config,
      'local_id', (p_session).local_id,
      'sync_version', (p_session).sync_version,
      'deleted_at', case
        when (p_session).deleted_at is null then null
        else pg_catalog.to_char(
          pg_catalog.timezone('UTC', (p_session).deleted_at),
          'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
        )
      end,
      'created_at', case
        when (p_session).created_at is null then null
        else pg_catalog.to_char(
          pg_catalog.timezone('UTC', (p_session).created_at),
          'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
        )
      end,
      'updated_at', case
        when (p_session).updated_at is null then null
        else pg_catalog.to_char(
          pg_catalog.timezone('UTC', (p_session).updated_at),
          'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
        )
      end,
      'controlled_by_user_id', (p_session).controlled_by_user_id,
      'control_claimed_at', case
        when (p_session).control_claimed_at is null then null
        else pg_catalog.to_char(
          pg_catalog.timezone('UTC', (p_session).control_claimed_at),
          'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
        )
      end,
      'control_device_id', (p_session).control_device_id
    )::text
  );
$$;

revoke all on function app_private.legacy_session_cutover_fingerprint(public.sessions)
  from public, anon, authenticated;

create function app_private.resolve_legacy_session_roster(
  p_session public.sessions
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tokens text[] := coalesce(p_session.selected_player_ids, '{}'::text[]);
  v_source_hash text;
  v_candidates jsonb;
  v_blockers text[] := '{}'::text[];
  v_entries jsonb;
begin
  v_source_hash := pg_catalog.md5(pg_catalog.to_jsonb(v_tokens)::text);

  select coalesce(
           pg_catalog.jsonb_agg(
             pg_catalog.jsonb_build_object(
               'ordinal', t.ordinal,
               'token', t.token,
               'player_ids', coalesce(resolved.player_ids, '[]'::jsonb)
             )
             order by t.ordinal
           ),
           '[]'::jsonb
         )
    into v_candidates
    from pg_catalog.unnest(v_tokens) with ordinality as t(token, ordinal)
    left join lateral (
      select pg_catalog.jsonb_agg(candidate.id::text order by candidate.id) as player_ids
        from (
          select p.id
            from public.players p
           where p.id::text = t.token
          union
          select p.id
            from public.players p
           where p_session.owner_id is not null
             and p.owner_id = p_session.owner_id
             and p.local_id = t.token
        ) candidate
    ) resolved on true;

  if exists (
    select 1
      from pg_catalog.jsonb_array_elements(v_candidates) c
     where pg_catalog.jsonb_array_length(c->'player_ids') = 1
       and exists (
         select 1
           from pg_catalog.jsonb_array_elements(v_candidates) other
          where other->>'token' <> c->>'token'
            and pg_catalog.jsonb_array_length(other->'player_ids') = 1
            and other->'player_ids'->>0 = c->'player_ids'->>0
       )
  ) then
    v_blockers := pg_catalog.array_append(v_blockers, 'ROSTER_PLAYERS_COLLIDE');
  end if;

  if exists (
    select 1
      from pg_catalog.jsonb_array_elements(v_candidates) c
     where pg_catalog.jsonb_array_length(c->'player_ids') > 1
  ) then
    v_blockers := pg_catalog.array_append(v_blockers, 'ROSTER_TOKEN_AMBIGUOUS');
  end if;

  if exists (
    select 1
      from pg_catalog.unnest(v_tokens) t(token)
     group by t.token
    having pg_catalog.count(*) > 1
  ) then
    v_blockers := pg_catalog.array_append(v_blockers, 'ROSTER_TOKEN_REPEATED');
  end if;

  if exists (
    select 1
      from pg_catalog.jsonb_array_elements(v_candidates) c
     where pg_catalog.jsonb_array_length(c->'player_ids') = 0
  ) then
    v_blockers := pg_catalog.array_append(v_blockers, 'ROSTER_TOKEN_UNRESOLVED');
  end if;

  if pg_catalog.cardinality(v_blockers) = 0 then
    select coalesce(
             pg_catalog.jsonb_agg(
               pg_catalog.jsonb_build_object(
                 'entry_order', (c->>'ordinal')::integer - 1,
                 'identity_kind', 'PLAYER',
                 'player_id', c->'player_ids'->>0,
                 'display_name', coalesce(
                   nullif(pg_catalog.btrim(coalesce(pl.nickname, '')), ''),
                   pg_catalog.btrim(pl.name)
                 ),
                 'source_ordinal', (c->>'ordinal')::integer,
                 'source_token', c->>'token'
               )
               order by (c->>'ordinal')::bigint
             ),
             '[]'::jsonb
           )
      into v_entries
      from pg_catalog.jsonb_array_elements(v_candidates) c
      join public.players pl on pl.id = (c->'player_ids'->>0)::uuid;
  else
    select coalesce(
             pg_catalog.jsonb_agg(
               c || pg_catalog.jsonb_build_object(
                 'repeated', (
                   select pg_catalog.count(*) > 1
                     from pg_catalog.jsonb_array_elements(v_candidates) same_token
                    where same_token->>'token' = c->>'token'
                 ),
                 'unresolved', pg_catalog.jsonb_array_length(c->'player_ids') = 0,
                 'ambiguous', pg_catalog.jsonb_array_length(c->'player_ids') > 1,
                 'colliding', (
                   pg_catalog.jsonb_array_length(c->'player_ids') = 1
                   and exists (
                     select 1
                       from pg_catalog.jsonb_array_elements(v_candidates) other
                      where other->>'token' <> c->>'token'
                        and pg_catalog.jsonb_array_length(other->'player_ids') = 1
                        and other->'player_ids'->>0 = c->'player_ids'->>0
                   )
                 )
               )
               order by (c->>'ordinal')::bigint
             ),
             '[]'::jsonb
           )
      into v_entries
      from pg_catalog.jsonb_array_elements(v_candidates) c;
  end if;

  return pg_catalog.jsonb_build_object(
    'source_hash', v_source_hash,
    'blockers', pg_catalog.to_jsonb(v_blockers),
    'entries', v_entries
  );
end;
$$;

revoke all on function app_private.resolve_legacy_session_roster(public.sessions)
  from public, anon, authenticated;

create or replace function app_private.import_legacy_session_rosters(p_source_release text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run_id uuid;
  v_session public.sessions;
  v_tokens text[];
  v_hash text;
  v_existing public.roster_revisions;
  v_candidates jsonb;
  v_rejected text[];
  v_revision_id uuid;
  v_entries jsonb;
  v_resolution jsonb;
  v_blockers text[];
  v_reason text;
begin
  insert into app_private.migration_runs (name, source_release)
  values ('import_legacy_session_rosters', p_source_release)
  returning run_id into v_run_id;

  for v_session in
    select s.*
      from public.sessions s
     where s.authority_model = 'legacy'
       and s.status in ('finished', 'cancelled')
       and s.selected_player_ids is not null
       and pg_catalog.array_length(s.selected_player_ids, 1) > 0
     order by s.id
  loop
    v_tokens := v_session.selected_player_ids;
    v_resolution := app_private.resolve_legacy_session_roster(v_session);
    v_hash := v_resolution->>'source_hash';
    v_blockers := array(
      select pg_catalog.jsonb_array_elements_text(v_resolution->'blockers')
    );
    v_entries := v_resolution->'entries';

    select * into v_existing
      from public.roster_revisions r
     where r.session_id = v_session.id
       and r.source_kind = 'LEGACY_SELECTED_ROSTER';

    if found then
      if v_existing.source_payload_hash is not distinct from v_hash then
        insert into app_private.migration_entity_map (
          run_id, source_type, source_id, target_type, target_id,
          mapping_kind, source_hash, confidence, reason
        )
        values (
          v_run_id,
          'legacy_session_selected_roster',
          v_session.id::text,
          'roster_revision',
          v_existing.id::text,
          'ONE_TO_ONE',
          v_hash,
          'EXACT',
          'Legacy selected roster was already imported from an unchanged source'
        )
        on conflict do nothing;

        insert into app_private.migration_entity_map (
          run_id, source_type, source_id, target_type, target_id,
          mapping_kind, source_hash, confidence, reason
        )
        select
          v_run_id,
          'legacy_session_selected_player',
          v_session.id::text || '#' || (e.entry_order + 1)::text
            || ':' || v_tokens[e.entry_order + 1],
          'session_participant',
          e.participant_id::text,
          'ONE_TO_ONE',
          v_hash,
          'EXACT',
          'Legacy selected roster token was already mapped to a Session Participant'
        from public.roster_revision_entries e
       where e.roster_revision_id = v_existing.id
        on conflict do nothing;

        continue;
      end if;

      insert into app_private.migration_anomalies (
        run_id, source_type, source_id, reason, details
      )
      values (
        v_run_id,
        'legacy_session_selected_roster',
        v_session.id::text,
        'LEGACY_ROSTER_SOURCE_CHANGED_AFTER_IMPORT',
        pg_catalog.jsonb_build_object(
          'source_hash', v_hash,
          'imported_source_hash', v_existing.source_payload_hash,
          'roster_revision_id', v_existing.id::text
        )
      )
      on conflict (run_id, source_type, source_id, reason) do nothing;

      continue;
    end if;

    if 'ROSTER_TOKEN_REPEATED' = any (v_blockers) then
      v_reason := 'LEGACY_ROSTER_TOKEN_REPEATED';
      v_rejected := array(
        select c->>'token'
          from pg_catalog.jsonb_array_elements(v_entries) c
         where (c->>'repeated')::boolean
         group by c->>'token'
         order by c->>'token'
      );
    elsif 'ROSTER_TOKEN_UNRESOLVED' = any (v_blockers) then
      v_reason := case
        when v_session.owner_id is null then 'LEGACY_ROSTER_OWNER_UNKNOWN'
        else 'LEGACY_ROSTER_TOKEN_UNRESOLVED'
      end;
      v_rejected := array(
        select c->>'token'
          from pg_catalog.jsonb_array_elements(v_entries) c
         where (c->>'unresolved')::boolean
         order by (c->>'ordinal')::bigint
      );
    elsif 'ROSTER_TOKEN_AMBIGUOUS' = any (v_blockers) then
      v_reason := 'LEGACY_ROSTER_TOKEN_AMBIGUOUS';
      v_rejected := array(
        select c->>'token'
          from pg_catalog.jsonb_array_elements(v_entries) c
         where (c->>'ambiguous')::boolean
         order by (c->>'ordinal')::bigint
      );
    elsif 'ROSTER_PLAYERS_COLLIDE' = any (v_blockers) then
      v_reason := 'LEGACY_ROSTER_PLAYERS_COLLIDE';
      v_rejected := array(
        select c->>'token'
          from pg_catalog.jsonb_array_elements(v_entries) c
         where (c->>'colliding')::boolean
         order by (c->>'ordinal')::bigint
      );
    else
      v_reason := null;
      v_rejected := '{}'::text[];
    end if;

    if v_reason is not null then
      v_candidates := v_entries;
      perform app_private.record_legacy_roster_anomaly(
        v_run_id,
        v_session.id,
        v_reason,
        v_hash,
        v_rejected,
        v_candidates
      );
      continue;
    end if;

    select coalesce(
             pg_catalog.jsonb_agg(
               e || pg_catalog.jsonb_build_object(
                 'participant_id', pg_catalog.gen_random_uuid()::text
               )
               order by (e->>'entry_order')::integer
             ),
             '[]'::jsonb
           )
      into v_entries
      from pg_catalog.jsonb_array_elements(v_entries) e;

    v_revision_id := pg_catalog.gen_random_uuid();
    perform app_private.materialize_target_session_roster(
      v_revision_id,
      v_session.id,
      'LEGACY_SELECTED_ROSTER',
      null,
      null,
      v_hash,
      null,
      v_entries,
      1
    );

    insert into app_private.migration_entity_map (
      run_id, source_type, source_id, target_type, target_id,
      mapping_kind, source_hash, confidence, reason
    )
    values (
      v_run_id,
      'legacy_session_selected_roster',
      v_session.id::text,
      'roster_revision',
      v_revision_id::text,
      'ONE_TO_ONE',
      v_hash,
      'EXACT',
      'Terminal legacy selected roster materialized as roster revision one'
    )
    on conflict do nothing;

    insert into app_private.migration_entity_map (
      run_id, source_type, source_id, target_type, target_id,
      mapping_kind, source_hash, confidence, reason
    )
    select
      v_run_id,
      'legacy_session_selected_player',
      v_session.id::text || '#' || (e->>'source_ordinal') || ':' || (e->>'source_token'),
      'session_participant',
      e->>'participant_id',
      'ONE_TO_ONE',
      v_hash,
      'EXACT',
      'Legacy selected roster token resolved to exactly one Player'
    from pg_catalog.jsonb_array_elements(v_entries) e
    on conflict do nothing;
  end loop;

  update app_private.migration_runs
     set status = 'COMPLETED',
         finished_at = pg_catalog.now()
   where run_id = v_run_id;

  return v_run_id;
end;
$$;

revoke all on function app_private.import_legacy_session_rosters(text)
  from public, anon, authenticated;

create function app_private.inspect_legacy_session_cutover_state(
  p_session public.sessions
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_resolution jsonb;
  v_resolution_blockers text[];
  v_blockers text[] := '{}'::text[];
  v_reason text;
begin
  v_resolution := app_private.resolve_legacy_session_roster(p_session);
  v_resolution_blockers := array(
    select pg_catalog.jsonb_array_elements_text(v_resolution->'blockers')
  );

  if exists (
    select 1 from public.games g where g.session_id = p_session.id
  ) then
    v_blockers := pg_catalog.array_append(v_blockers, 'HAS_GAME_EVIDENCE');
  end if;

  if exists (
       select 1
         from public.session_organizer_assignments a
        where a.session_id = p_session.id
     )
     or exists (
       select 1 from public.session_courts c where c.session_id = p_session.id
     )
     or exists (
       select 1 from public.session_rules_snapshots r where r.session_id = p_session.id
     )
     or exists (
       select 1 from public.roster_revisions r where r.session_id = p_session.id
     )
     or exists (
       select 1 from public.session_participants p where p.session_id = p_session.id
     ) then
    v_blockers := pg_catalog.array_append(v_blockers, 'HAS_TARGET_ARTIFACTS');
  end if;

  if pg_catalog.cardinality(coalesce(p_session.team_ids, '{}'::text[])) > 0
     or exists (
       select 1 from public.teams t where t.session_id = p_session.id
     ) then
    v_blockers := pg_catalog.array_append(v_blockers, 'HAS_TEAM_EVIDENCE');
  end if;

  if p_session.status <> 'draft' then
    v_blockers := pg_catalog.array_append(v_blockers, 'NOT_DRAFT');
  end if;

  if p_session.authority_model <> 'legacy' then
    v_blockers := pg_catalog.array_append(v_blockers, 'NOT_LEGACY');
  end if;

  foreach v_reason in array array[
    'ROSTER_PLAYERS_COLLIDE',
    'ROSTER_TOKEN_AMBIGUOUS',
    'ROSTER_TOKEN_REPEATED',
    'ROSTER_TOKEN_UNRESOLVED'
  ]
  loop
    if v_reason = any (v_resolution_blockers) then
      v_blockers := pg_catalog.array_append(v_blockers, v_reason);
    end if;
  end loop;

  if p_session.deleted_at is not null then
    v_blockers := pg_catalog.array_append(v_blockers, 'SOFT_DELETED');
  end if;

  return pg_catalog.jsonb_build_object(
    'eligible', pg_catalog.cardinality(v_blockers) = 0,
    'blockers', pg_catalog.to_jsonb(v_blockers),
    'source_fingerprint', app_private.legacy_session_cutover_fingerprint(p_session),
    'selected_player_count', pg_catalog.cardinality(
      coalesce(p_session.selected_player_ids, '{}'::text[])
    )
  );
end;
$$;

revoke all on function app_private.inspect_legacy_session_cutover_state(public.sessions)
  from public, anon, authenticated;

create function public.inspect_legacy_session_cutover(
  p_session_id uuid
)
returns table (
  eligible boolean,
  blockers text[],
  source_fingerprint text,
  selected_player_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.sessions;
  v_uid uuid := (select auth.uid());
  v_state jsonb;
begin
  select * into v_session
    from public.sessions s
   where s.id = p_session_id;

  if not found then
    raise exception 'Session not found' using errcode = 'P0002';
  end if;

  if v_session.community_id is null then
    if v_uid is null or v_session.owner_id is distinct from v_uid then
      raise exception 'Not authorized to inspect this Session' using errcode = '42501';
    end if;
  elsif v_uid is null
     or not exists (
       select 1
         from public.community_memberships m
        where m.community_id = v_session.community_id
          and m.user_id = v_uid
          and m.status = 'active'
     )
     or not exists (
       select 1
         from public.community_responsibilities r
        where r.community_id = v_session.community_id
          and r.user_id = v_uid
          and r.responsibility = 'ORGANIZER'
          and r.revoked_at is null
     ) then
    raise exception 'Not authorized to inspect this Session' using errcode = '42501';
  end if;

  v_state := app_private.inspect_legacy_session_cutover_state(v_session);

  return query
    select
      (v_state->>'eligible')::boolean,
      array(
        select pg_catalog.jsonb_array_elements_text(v_state->'blockers')
      ),
      v_state->>'source_fingerprint',
      (v_state->>'selected_player_count')::integer;
end;
$$;

revoke all on function public.inspect_legacy_session_cutover(uuid)
  from public, anon, authenticated;
grant execute on function public.inspect_legacy_session_cutover(uuid)
  to authenticated;

create function public.transition_legacy_session_to_target(
  p_command_id uuid,
  p_session_id uuid,
  p_expected_source_fingerprint text,
  p_session_context text,
  p_play_mode text
)
returns table (
  session_id uuid,
  session_revision integer,
  authority_model text,
  target_model_version integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.sessions;
  v_cutover app_private.session_authority_cutovers;
  v_uid uuid;
  v_membership_id uuid;
  v_receipt jsonb;
  v_result jsonb;
  v_fingerprint text;
  v_state jsonb;
  v_blockers text[];
  v_resolution jsonb;
  v_entries jsonb;
begin
  if p_command_id is null then
    raise exception 'Command id is required' using errcode = '23514';
  end if;
  if p_session_id is null then
    raise exception 'Session id is required' using errcode = '23514';
  end if;
  if nullif(pg_catalog.btrim(p_expected_source_fingerprint), '') is null then
    raise exception 'Expected source fingerprint is required' using errcode = '23514';
  end if;

  -- Load-bearing despite the discarded result: find_command_receipt raises 23505 when this
  -- command id already belongs to another Session or command type, and that collision must be
  -- detected before the row lock. The replay itself happens only after authorization below, so
  -- a caller whose capability was revoked cannot read back an earlier result. Deleting this
  -- call because v_receipt is reassigned later would silently drop the collision guard while
  -- every replay test still passes.
  v_receipt := app_private.find_command_receipt(
    p_command_id,
    'transition_legacy_session_to_target',
    p_session_id
  );

  select * into v_session
    from public.sessions s
   where s.id = p_session_id
   for update;

  if not found then
    raise exception 'Session not found' using errcode = 'P0002';
  end if;

  v_uid := (select auth.uid());
  if v_session.community_id is null then
    if v_uid is null or v_session.owner_id is distinct from v_uid then
      raise exception 'Not authorized to transition this Session' using errcode = '42501';
    end if;
  else
    select m.id into v_membership_id
      from public.community_memberships m
     where m.community_id = v_session.community_id
       and m.user_id = v_uid
       and m.status = 'active';

    if v_uid is null
       or v_membership_id is null
       or not exists (
         select 1
           from public.community_responsibilities r
          where r.community_id = v_session.community_id
            and r.user_id = v_uid
            and r.responsibility = 'ORGANIZER'
            and r.revoked_at is null
       ) then
      raise exception 'Not authorized to transition this Session' using errcode = '42501';
    end if;
  end if;

  v_receipt := app_private.find_command_receipt(
    p_command_id,
    'transition_legacy_session_to_target',
    p_session_id
  );
  if v_receipt is not null then
    return query
      select
        (v_receipt->>'session_id')::uuid,
        (v_receipt->>'session_revision')::integer,
        v_receipt->>'authority_model',
        (v_receipt->>'target_model_version')::integer;
    return;
  end if;

  if p_session_context is null or p_session_context not in ('QUICK', 'COMMUNITY') then
    raise exception 'Invalid Session context' using errcode = '23514';
  end if;
  if p_play_mode is null or p_play_mode not in ('FREE_PLAY', 'STRUCTURED_MATCHES') then
    raise exception 'Invalid Session play mode' using errcode = '23514';
  end if;
  if p_session_context = 'COMMUNITY' and v_session.community_id is null then
    raise exception 'COMMUNITY Session requires a Community' using errcode = '23514';
  end if;
  if p_session_context = 'QUICK' and v_session.community_id is not null then
    raise exception 'QUICK Session cannot have a Community' using errcode = '23514';
  end if;

  if v_session.authority_model = 'target' then
    select * into v_cutover
      from app_private.session_authority_cutovers c
     where c.session_id = v_session.id;

    if found
       and v_cutover.source_authority = 'LEGACY'
       and v_cutover.cutover_kind = 'LEGACY_EXPLICIT'
       and v_cutover.target_model_version = 1
       and v_cutover.source_fingerprint is not distinct from p_expected_source_fingerprint
       and v_session.target_model_version = 1
       and v_session.session_context is not distinct from p_session_context
       and v_session.play_mode is not distinct from p_play_mode then
      v_result := pg_catalog.jsonb_build_object(
        'session_id', v_session.id,
        'session_revision', v_session.revision,
        'authority_model', v_session.authority_model,
        'target_model_version', v_session.target_model_version
      );
      perform app_private.record_command_receipt(
        p_command_id,
        v_uid,
        'transition_legacy_session_to_target',
        p_session_id,
        v_result,
        'SESSION_AUTHORITY_CUTOVER'
      );

      return query
        select
          v_session.id,
          v_session.revision,
          v_session.authority_model,
          v_session.target_model_version;
      return;
    end if;

    raise exception 'Session is already governed by target authority' using errcode = '23514';
  end if;

  v_fingerprint := app_private.legacy_session_cutover_fingerprint(v_session);
  if v_fingerprint is distinct from p_expected_source_fingerprint then
    raise exception 'Stale legacy Session source fingerprint' using errcode = '40001';
  end if;

  v_state := app_private.inspect_legacy_session_cutover_state(v_session);
  v_blockers := array(
    select pg_catalog.jsonb_array_elements_text(v_state->'blockers')
  );
  if pg_catalog.cardinality(v_blockers) > 0 then
    raise exception 'Legacy Session cutover blocked: %',
      pg_catalog.array_to_string(v_blockers, ', ')
      using errcode = '23514';
  end if;

  v_resolution := app_private.resolve_legacy_session_roster(v_session);
  v_entries := v_resolution->'entries';
  if pg_catalog.jsonb_array_length(v_entries) > 0 then
    select pg_catalog.jsonb_agg(
             e || pg_catalog.jsonb_build_object(
               'participant_id', pg_catalog.gen_random_uuid()::text
             )
             order by (e->>'entry_order')::integer
           )
      into v_entries
      from pg_catalog.jsonb_array_elements(v_entries) e;

    perform app_private.materialize_target_session_roster(
      pg_catalog.gen_random_uuid(),
      p_session_id,
      'LEGACY_SELECTED_ROSTER',
      1,
      null,
      v_resolution->>'source_hash',
      v_uid,
      v_entries,
      1
    );
  end if;

  insert into public.session_organizer_assignments (
    session_id,
    community_membership_id,
    organizer_user_id,
    assigned_by_user_id
  )
  values (p_session_id, v_membership_id, v_uid, v_uid);

  perform pg_catalog.set_config('app.session_authority_cutover', 'on', true);
  update public.sessions s
     set authority_model = 'target',
         target_model_version = 1,
         session_context = p_session_context,
         play_mode = p_play_mode,
         lifecycle_status = 'DRAFT',
         publication_state = 'PRIVATE',
         revision = 1,
         status = public.target_session_compatibility_status('DRAFT'),
         type = public.target_session_compatibility_type(p_play_mode),
         actual_started_at = null,
         actual_finished_at = null,
         cancelled_at = null,
         cancelled_by_user_id = null,
         cancel_reason = null
   where s.id = p_session_id;

  insert into app_private.session_authority_cutovers (
    session_id,
    source_authority,
    target_model_version,
    cutover_kind,
    command_id,
    source_fingerprint,
    cutover_by_user_id
  )
  values (
    p_session_id,
    'LEGACY',
    1,
    'LEGACY_EXPLICIT',
    p_command_id,
    v_fingerprint,
    v_uid
  );

  v_result := pg_catalog.jsonb_build_object(
    'session_id', p_session_id,
    'session_revision', 1,
    'authority_model', 'target',
    'target_model_version', 1
  );
  perform app_private.record_command_receipt(
    p_command_id,
    v_uid,
    'transition_legacy_session_to_target',
    p_session_id,
    v_result,
    'SESSION_AUTHORITY_CUTOVER'
  );

  return query select p_session_id, 1, 'target'::text, 1;
end;
$$;

revoke all on function public.transition_legacy_session_to_target(uuid, uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.transition_legacy_session_to_target(uuid, uuid, text, text, text)
  to authenticated;
