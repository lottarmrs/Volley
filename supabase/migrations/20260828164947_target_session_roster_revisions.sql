create table public.session_participants (
  id uuid primary key,
  session_id uuid not null references public.sessions(id) on delete restrict,
  identity_kind text not null,
  player_id uuid references public.players(id) on delete set null,
  source_kind text not null,
  display_name text not null,
  participation_status text not null,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint session_participants_identity_kind_check
    check (identity_kind in ('PLAYER', 'GUEST')),
  constraint session_participants_guest_has_no_player_check
    check (identity_kind = 'PLAYER' or player_id is null),
  constraint session_participants_source_kind_check
    check (source_kind in ('QUICK_DIRECT', 'LEGACY_SELECTED_ROSTER', 'REGISTRATION')),
  constraint session_participants_participation_status_check
    check (participation_status in ('INCLUDED', 'REMOVED')),
  constraint session_participants_display_name_check
    check (btrim(display_name) <> ''),
  constraint session_participants_session_scoped_identity_key unique (id, session_id)
);

create unique index session_participants_session_player_key
  on public.session_participants (session_id, player_id)
  where player_id is not null;
create index session_participants_session_idx
  on public.session_participants (session_id);
create index session_participants_player_idx
  on public.session_participants (player_id);
create index session_participants_created_by_idx
  on public.session_participants (created_by_user_id);

create table public.roster_revisions (
  id uuid primary key,
  session_id uuid not null references public.sessions(id) on delete restrict,
  revision_number integer not null,
  source_kind text not null,
  source_session_revision integer,
  source_registration_revision bigint,
  source_payload_hash text,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint roster_revisions_revision_number_check check (revision_number > 0),
  constraint roster_revisions_source_kind_check
    check (source_kind in ('QUICK_DIRECT', 'LEGACY_SELECTED_ROSTER', 'REGISTRATION')),
  constraint roster_revisions_registration_revision_check
    check (source_kind = 'REGISTRATION' or source_registration_revision is null),
  constraint roster_revisions_session_number_key unique (session_id, revision_number),
  constraint roster_revisions_session_scoped_identity_key unique (id, session_id)
);

create unique index roster_revisions_single_legacy_source_key
  on public.roster_revisions (session_id)
  where source_kind = 'LEGACY_SELECTED_ROSTER';
create index roster_revisions_created_by_idx
  on public.roster_revisions (created_by_user_id);

create table public.roster_revision_entries (
  roster_revision_id uuid not null,
  session_id uuid not null,
  participant_id uuid not null,
  entry_order integer not null,
  identity_kind text not null,
  player_id uuid references public.players(id) on delete set null,
  display_name_at_time text not null,
  constraint roster_revision_entries_pkey primary key (roster_revision_id, entry_order),
  constraint roster_revision_entries_participant_key unique (roster_revision_id, participant_id),
  constraint roster_revision_entries_entry_order_check check (entry_order >= 0),
  constraint roster_revision_entries_identity_kind_check
    check (identity_kind in ('PLAYER', 'GUEST')),
  constraint roster_revision_entries_guest_has_no_player_check
    check (identity_kind = 'PLAYER' or player_id is null),
  constraint roster_revision_entries_display_name_check
    check (btrim(display_name_at_time) <> ''),
  constraint roster_revision_entries_revision_fkey
    foreign key (roster_revision_id, session_id)
    references public.roster_revisions (id, session_id),
  constraint roster_revision_entries_participant_fkey
    foreign key (participant_id, session_id)
    references public.session_participants (id, session_id)
);

create index roster_revision_entries_revision_session_idx
  on public.roster_revision_entries (roster_revision_id, session_id);
create index roster_revision_entries_participant_session_idx
  on public.roster_revision_entries (participant_id, session_id);
create index roster_revision_entries_player_idx
  on public.roster_revision_entries (player_id);

create function app_private.reject_roster_revision_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and new.created_by_user_id is null
     and old.created_by_user_id is not null
     and new.id = old.id
     and new.session_id = old.session_id
     and new.revision_number = old.revision_number
     and new.source_kind = old.source_kind
     and new.source_session_revision is not distinct from old.source_session_revision
     and new.source_registration_revision is not distinct from old.source_registration_revision
     and new.source_payload_hash is not distinct from old.source_payload_hash
     and new.created_at = old.created_at then
    return new;
  end if;

  raise exception 'Roster revisions are immutable' using errcode = '55000';
end;
$$;

revoke all on function app_private.reject_roster_revision_mutation()
  from public, anon, authenticated;

create trigger reject_roster_revision_mutation_trigger
before update or delete on public.roster_revisions
for each row execute function app_private.reject_roster_revision_mutation();

create function app_private.reject_roster_revision_entry_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and new.player_id is null
     and old.player_id is not null
     and new.roster_revision_id = old.roster_revision_id
     and new.session_id = old.session_id
     and new.participant_id = old.participant_id
     and new.entry_order = old.entry_order
     and new.identity_kind = old.identity_kind
     and new.display_name_at_time = old.display_name_at_time then
    return new;
  end if;

  raise exception 'Roster revision entries are immutable' using errcode = '55000';
end;
$$;

revoke all on function app_private.reject_roster_revision_entry_mutation()
  from public, anon, authenticated;

create trigger reject_roster_revision_entry_mutation_trigger
before update or delete on public.roster_revision_entries
for each row execute function app_private.reject_roster_revision_entry_mutation();

alter table public.session_participants enable row level security;
revoke all on public.session_participants from public, anon, authenticated;
grant select on public.session_participants to authenticated;

create policy "Target Session readers can read Session Participants"
  on public.session_participants
  for select to authenticated
  using (app_private.current_user_can_read_target_session(session_id));

alter table public.roster_revisions enable row level security;
revoke all on public.roster_revisions from public, anon, authenticated;
grant select on public.roster_revisions to authenticated;

create policy "Target Session readers can read Roster Revisions"
  on public.roster_revisions
  for select to authenticated
  using (app_private.current_user_can_read_target_session(session_id));

alter table public.roster_revision_entries enable row level security;
revoke all on public.roster_revision_entries from public, anon, authenticated;
grant select on public.roster_revision_entries to authenticated;

create policy "Target Session readers can read Roster Revision Entries"
  on public.roster_revision_entries
  for select to authenticated
  using (app_private.current_user_can_read_target_session(session_id));

create function app_private.current_user_can_select_target_quick_roster_player(
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
      from public.players p
     where p.id = p_player_id
       and p.deleted_at is null
       and p.active
       and (
         p.user_id = (select auth.uid())
         or p.owner_id = (select auth.uid())
         or exists (
           select 1
             from public.community_players cp
             join public.community_memberships m
               on m.community_id = cp.community_id
            where cp.player_id = p.id
              and cp.deleted_at is null
              and cp.active
              and m.user_id = (select auth.uid())
              and m.status = 'active'
         )
       )
  );
$$;

revoke all on function app_private.current_user_can_select_target_quick_roster_player(uuid)
  from public, anon, authenticated;

create function app_private.materialize_target_session_roster(
  p_roster_revision_id uuid,
  p_session_id uuid,
  p_source_kind text,
  p_source_session_revision integer,
  p_source_registration_revision bigint,
  p_source_payload_hash text,
  p_created_by_user_id uuid,
  p_entries jsonb,
  p_revision_number integer default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_revision_number integer;
begin
  v_revision_number := coalesce(
    p_revision_number,
    (
      select coalesce(pg_catalog.max(r.revision_number), 0) + 1
        from public.roster_revisions r
       where r.session_id = p_session_id
    )
  );

  update public.session_participants sp
     set participation_status = 'REMOVED',
         updated_at = pg_catalog.now()
   where sp.session_id = p_session_id
     and sp.participation_status = 'INCLUDED'
     and not exists (
       select 1
         from pg_catalog.jsonb_array_elements(p_entries) e
        where (e->>'participant_id')::uuid = sp.id
     );

  insert into public.session_participants (
    id, session_id, identity_kind, player_id, source_kind,
    display_name, participation_status, created_by_user_id
  )
  select
    (e->>'participant_id')::uuid,
    p_session_id,
    e->>'identity_kind',
    (e->>'player_id')::uuid,
    p_source_kind,
    e->>'display_name',
    'INCLUDED',
    p_created_by_user_id
  from pg_catalog.jsonb_array_elements(p_entries) e
  on conflict (id) do update
    set display_name = excluded.display_name,
        participation_status = 'INCLUDED',
        updated_at = pg_catalog.now();

  insert into public.roster_revisions (
    id, session_id, revision_number, source_kind, source_session_revision,
    source_registration_revision, source_payload_hash, created_by_user_id
  )
  values (
    p_roster_revision_id,
    p_session_id,
    v_revision_number,
    p_source_kind,
    p_source_session_revision,
    p_source_registration_revision,
    p_source_payload_hash,
    p_created_by_user_id
  );

  insert into public.roster_revision_entries (
    roster_revision_id, session_id, participant_id, entry_order,
    identity_kind, player_id, display_name_at_time
  )
  select
    p_roster_revision_id,
    p_session_id,
    (e->>'participant_id')::uuid,
    (e->>'entry_order')::integer,
    e->>'identity_kind',
    (e->>'player_id')::uuid,
    e->>'display_name'
  from pg_catalog.jsonb_array_elements(p_entries) e;

  return v_revision_number;
end;
$$;

revoke all on function app_private.materialize_target_session_roster(
  uuid, uuid, text, integer, bigint, text, uuid, jsonb, integer
) from public, anon, authenticated;

create function public.replace_target_quick_session_roster(
  p_roster_revision_id uuid,
  p_session_id uuid,
  p_expected_session_revision integer,
  p_participants jsonb
)
returns table (
  roster_revision_id uuid,
  roster_revision_number integer,
  session_revision integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uuid_pattern constant text :=
    '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
  v_session public.sessions;
  v_existing public.roster_revisions;
  v_item jsonb;
  v_ordinal bigint;
  v_keys text[];
  v_identity_kind text;
  v_participant_id uuid;
  v_player_id uuid;
  v_display_name text;
  v_participant_ids uuid[] := array[]::uuid[];
  v_player_ids uuid[] := array[]::uuid[];
  v_normalized jsonb := '[]'::jsonb;
  v_identity jsonb;
  v_stored_identity jsonb;
  v_entries jsonb;
  v_revision_number integer;
begin
  if p_session_id is null then
    raise exception 'Session id is required' using errcode = '23514';
  end if;

  select * into v_session
    from public.sessions s
   where s.id = p_session_id and s.authority_model = 'target'
   for update;

  if not found then
    raise exception 'Target Session not found' using errcode = 'P0002';
  end if;

  perform public.assert_target_session_write_authorized(v_session);

  if v_session.session_context is distinct from 'QUICK' then
    raise exception 'Only Quick target Sessions accept direct roster replacement'
      using errcode = '23514';
  end if;
  if v_session.lifecycle_status not in ('DRAFT', 'SCHEDULED') then
    raise exception 'Target roster replacement is pre-start only' using errcode = '23514';
  end if;

  if p_roster_revision_id is null then
    raise exception 'Roster revision id is required and final' using errcode = '23514';
  end if;
  if p_expected_session_revision is null then
    raise exception 'Expected Session revision is required' using errcode = '23514';
  end if;
  if p_participants is null or pg_catalog.jsonb_typeof(p_participants) <> 'array' then
    raise exception 'Roster participants must be a JSON array' using errcode = '23514';
  end if;

  for v_item, v_ordinal in
    select value, ordinality
      from pg_catalog.jsonb_array_elements(p_participants) with ordinality
  loop
    if pg_catalog.jsonb_typeof(v_item) <> 'object' then
      raise exception 'Each roster participant must be a JSON object' using errcode = '23514';
    end if;

    if pg_catalog.jsonb_typeof(v_item->'identity_kind') <> 'string'
       or v_item->>'identity_kind' not in ('PLAYER', 'GUEST') then
      raise exception 'Unsupported roster participant identity kind' using errcode = '23514';
    end if;
    v_identity_kind := v_item->>'identity_kind';

    v_keys := array(select k from pg_catalog.jsonb_object_keys(v_item) as k order by k);
    if v_identity_kind = 'PLAYER' then
      if v_keys <> array['identity_kind', 'participant_id', 'player_id']::text[] then
        raise exception 'Linked Player participants accept only participant_id, identity_kind, and player_id'
          using errcode = '23514';
      end if;
    else
      if v_keys <> array['display_name', 'identity_kind', 'participant_id']::text[] then
        raise exception 'Guest participants accept only participant_id, identity_kind, and display_name'
          using errcode = '23514';
      end if;
    end if;

    if pg_catalog.jsonb_typeof(v_item->'participant_id') <> 'string'
       or (v_item->>'participant_id') !~ v_uuid_pattern then
      raise exception 'Roster participant id must be a UUID' using errcode = '23514';
    end if;
    v_participant_id := (v_item->>'participant_id')::uuid;
    if v_participant_id = any (v_participant_ids) then
      raise exception 'Duplicate roster participant id' using errcode = '23514';
    end if;
    v_participant_ids := v_participant_ids || v_participant_id;

    v_player_id := null;
    v_display_name := null;
    if v_identity_kind = 'PLAYER' then
      if pg_catalog.jsonb_typeof(v_item->'player_id') <> 'string'
         or (v_item->>'player_id') !~ v_uuid_pattern then
        raise exception 'Linked Player participant requires a Player UUID' using errcode = '23514';
      end if;
      v_player_id := (v_item->>'player_id')::uuid;
      if v_player_id = any (v_player_ids) then
        raise exception 'Duplicate linked Player in one roster' using errcode = '23514';
      end if;
      v_player_ids := v_player_ids || v_player_id;
    else
      if pg_catalog.jsonb_typeof(v_item->'display_name') <> 'string' then
        raise exception 'Guest participant requires a display name' using errcode = '23514';
      end if;
      v_display_name := pg_catalog.btrim(v_item->>'display_name');
      if v_display_name = '' then
        raise exception 'Guest display name cannot be blank' using errcode = '23514';
      end if;
      if pg_catalog.length(v_display_name) > 200 then
        raise exception 'Guest display name is too long' using errcode = '23514';
      end if;
    end if;

    v_normalized := v_normalized || pg_catalog.jsonb_build_object(
      'entry_order', v_ordinal - 1,
      'participant_id', v_participant_id::text,
      'identity_kind', v_identity_kind,
      'player_id', v_player_id::text,
      'display_name', v_display_name
    );
  end loop;

  select coalesce(
           pg_catalog.jsonb_agg(
             pg_catalog.jsonb_build_object(
               'participant_id', e->>'participant_id',
               'identity_kind', e->>'identity_kind',
               'player_id', e->>'player_id',
               'display_name', e->>'display_name'
             )
             order by (e->>'entry_order')::integer
           ),
           '[]'::jsonb
         )
    into v_identity
    from pg_catalog.jsonb_array_elements(v_normalized) e;

  select * into v_existing
    from public.roster_revisions r
   where r.id = p_roster_revision_id;

  if found then
    select coalesce(
             pg_catalog.jsonb_agg(
               pg_catalog.jsonb_build_object(
                 'participant_id', e.participant_id::text,
                 'identity_kind', e.identity_kind,
                 'player_id', e.player_id::text,
                 'display_name',
                   case when e.identity_kind = 'GUEST' then e.display_name_at_time else null end
               )
               order by e.entry_order
             ),
             '[]'::jsonb
           )
      into v_stored_identity
      from public.roster_revision_entries e
     where e.roster_revision_id = p_roster_revision_id;

    if v_existing.session_id = p_session_id
       and v_existing.source_kind = 'QUICK_DIRECT'
       and v_stored_identity = v_identity then
      return query
        select
          v_existing.id,
          v_existing.revision_number,
          coalesce(v_existing.source_session_revision + 1, v_session.revision);
      return;
    end if;

    raise exception 'Roster revision id already materialized different content'
      using errcode = '23505';
  end if;

  if v_session.revision is distinct from p_expected_session_revision then
    raise exception 'Stale Session revision' using errcode = '40001';
  end if;

  for v_player_id in
    select distinct (e->>'player_id')::uuid
      from pg_catalog.jsonb_array_elements(v_normalized) e
     where e->>'identity_kind' = 'PLAYER'
  loop
    if not app_private.current_user_can_select_target_quick_roster_player(v_player_id) then
      raise exception 'Not authorized to add this Player to the roster' using errcode = '42501';
    end if;
  end loop;

  if exists (
    select 1
      from pg_catalog.jsonb_array_elements(v_normalized) e
      join public.session_participants sp on sp.id = (e->>'participant_id')::uuid
     where sp.session_id is distinct from p_session_id
        or sp.identity_kind is distinct from e->>'identity_kind'
        or sp.player_id is distinct from (e->>'player_id')::uuid
  ) then
    raise exception 'Session participant identity cannot be rebound' using errcode = '23514';
  end if;

  select coalesce(
           pg_catalog.jsonb_agg(
             pg_catalog.jsonb_build_object(
               'entry_order', (e->>'entry_order')::integer,
               'participant_id', e->>'participant_id',
               'identity_kind', e->>'identity_kind',
               'player_id', e->>'player_id',
               'display_name',
                 case
                   when e->>'identity_kind' = 'GUEST' then e->>'display_name'
                   else coalesce(
                          nullif(pg_catalog.btrim(coalesce(pl.nickname, '')), ''),
                          pg_catalog.btrim(pl.name)
                        )
                 end
             )
             order by (e->>'entry_order')::integer
           ),
           '[]'::jsonb
         )
    into v_entries
    from pg_catalog.jsonb_array_elements(v_normalized) e
    left join public.players pl on pl.id = (e->>'player_id')::uuid;

  v_revision_number := app_private.materialize_target_session_roster(
    p_roster_revision_id,
    p_session_id,
    'QUICK_DIRECT',
    v_session.revision,
    null,
    null,
    (select auth.uid()),
    v_entries
  );

  update public.sessions
     set revision = revision + 1,
         updated_at = pg_catalog.now()
   where id = p_session_id;

  return query select p_roster_revision_id, v_revision_number, v_session.revision + 1;
end;
$$;

revoke all on function public.replace_target_quick_session_roster(uuid, uuid, integer, jsonb)
  from public, anon;
grant execute on function public.replace_target_quick_session_roster(uuid, uuid, integer, jsonb)
  to authenticated;

create function public.read_target_roster_revision(p_roster_revision_id uuid)
returns table (
  roster_revision_id uuid,
  session_id uuid,
  roster_revision_number integer,
  source_kind text,
  source_session_revision integer,
  source_registration_revision bigint,
  source_payload_hash text,
  created_by_user_id uuid,
  created_at timestamptz,
  entries jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_revision public.roster_revisions;
  v_entries jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select * into v_revision
    from public.roster_revisions r
   where r.id = p_roster_revision_id;

  if not found then
    raise exception 'Roster revision not found' using errcode = 'P0002';
  end if;

  if not app_private.current_user_can_read_target_session(v_revision.session_id) then
    raise exception 'Not authorized to read this roster revision' using errcode = '42501';
  end if;

  select coalesce(
           pg_catalog.jsonb_agg(
             pg_catalog.jsonb_build_object(
               'participant_id', e.participant_id,
               'identity_kind', e.identity_kind,
               'player_id', e.player_id,
               'display_name_at_time', e.display_name_at_time
             )
             order by e.entry_order
           ),
           '[]'::jsonb
         )
    into v_entries
    from public.roster_revision_entries e
   where e.roster_revision_id = v_revision.id;

  return query
    select
      v_revision.id,
      v_revision.session_id,
      v_revision.revision_number,
      v_revision.source_kind,
      v_revision.source_session_revision,
      v_revision.source_registration_revision,
      v_revision.source_payload_hash,
      v_revision.created_by_user_id,
      v_revision.created_at,
      v_entries;
end;
$$;

revoke all on function public.read_target_roster_revision(uuid) from public, anon;
grant execute on function public.read_target_roster_revision(uuid) to authenticated;
