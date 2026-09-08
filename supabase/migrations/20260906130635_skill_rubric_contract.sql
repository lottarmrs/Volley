do $$
begin
  if exists (select 1 from public.player_evaluation_contributions)
     or exists (select 1 from public.player_evaluation_dimension_scores) then
    raise exception 'Skill rubric contract migration requires empty evaluation source tables'
      using errcode = '23514';
  end if;
end;
$$;

create table public.skill_rubric_versions (
  rubric_version text primary key,
  status text not null check (status = 'EXPERIMENTAL'),
  provenance text not null check (pg_catalog.btrim(provenance) <> ''),
  published_at timestamptz not null default pg_catalog.now(),
  constraint skill_rubric_versions_version_check
    check (pg_catalog.btrim(rubric_version) <> '')
);

create table public.skill_rubric_dimensions (
  rubric_version text not null references public.skill_rubric_versions(rubric_version)
    on delete restrict,
  dimension_key text not null,
  kind text not null check (kind = 'SOURCE'),
  is_required boolean not null,
  display_order integer not null check (display_order > 0),
  constraint skill_rubric_dimensions_pkey primary key (rubric_version, dimension_key),
  constraint skill_rubric_dimensions_order_key unique (rubric_version, display_order),
  constraint skill_rubric_dimensions_key_check
    check (pg_catalog.btrim(dimension_key) <> '')
);

revoke all on table public.skill_rubric_versions from public, anon, authenticated;
alter table public.skill_rubric_versions enable row level security;
create policy skill_rubric_versions_authenticated_read
  on public.skill_rubric_versions
  for select
  to authenticated
  using (true);
grant select on table public.skill_rubric_versions to authenticated;

revoke all on table public.skill_rubric_dimensions from public, anon, authenticated;
alter table public.skill_rubric_dimensions enable row level security;
create policy skill_rubric_dimensions_authenticated_read
  on public.skill_rubric_dimensions
  for select
  to authenticated
  using (true);
grant select on table public.skill_rubric_dimensions to authenticated;

insert into public.skill_rubric_versions (rubric_version, status, provenance)
values (
  'v0-legacy-11',
  'EXPERIMENTAL',
  'Legacy client vocabulary from ATTRIBUTE_KEYS in src/logic/playerEvaluations.ts; not selected by a sports process.'
);

insert into public.skill_rubric_dimensions (
  rubric_version,
  dimension_key,
  kind,
  is_required,
  display_order
)
values
  ('v0-legacy-11', 'saque', 'SOURCE', false, 1),
  ('v0-legacy-11', 'recepcao', 'SOURCE', false, 2),
  ('v0-legacy-11', 'levantamento', 'SOURCE', false, 3),
  ('v0-legacy-11', 'ataque', 'SOURCE', false, 4),
  ('v0-legacy-11', 'bloqueio', 'SOURCE', false, 5),
  ('v0-legacy-11', 'defesa', 'SOURCE', false, 6),
  ('v0-legacy-11', 'velocidade', 'SOURCE', false, 7),
  ('v0-legacy-11', 'resistencia', 'SOURCE', false, 8),
  ('v0-legacy-11', 'leituraDeJogo', 'SOURCE', false, 9),
  ('v0-legacy-11', 'regularidade', 'SOURCE', false, 10),
  ('v0-legacy-11', 'controleEmocional', 'SOURCE', false, 11);

alter table public.player_evaluation_contributions
  add constraint player_evaluation_contributions_version_identity_key
    unique (id, rubric_version);

alter table public.player_evaluation_contributions
  add constraint player_evaluation_contributions_rubric_version_fkey
    foreign key (rubric_version)
    references public.skill_rubric_versions(rubric_version)
    on delete restrict;

alter table public.player_evaluation_dimension_scores
  drop constraint player_evaluation_dimension_scores_contribution_id_fkey;

alter table public.player_evaluation_dimension_scores
  add column rubric_version text not null;

alter table public.player_evaluation_dimension_scores
  add constraint player_evaluation_dimension_scores_contribution_fkey
    foreign key (contribution_id, rubric_version)
    references public.player_evaluation_contributions(id, rubric_version)
    on delete restrict;

alter table public.player_evaluation_dimension_scores
  add constraint player_evaluation_dimension_scores_dimension_fkey
    foreign key (rubric_version, dimension_key)
    references public.skill_rubric_dimensions(rubric_version, dimension_key)
    on delete restrict;

create function public.skill_rubric_dimensions_for(p_rubric_version text)
returns table (
  dimension_key text,
  is_required boolean,
  display_order integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  select d.dimension_key, d.is_required, d.display_order
    from public.skill_rubric_dimensions d
   where d.rubric_version = p_rubric_version
   order by d.display_order;
$$;

revoke all on function public.skill_rubric_dimensions_for(text)
  from public, anon, authenticated;
grant execute on function public.skill_rubric_dimensions_for(text)
  to authenticated;

create or replace function public.record_player_evaluation(
  p_command_id uuid,
  p_contribution_id uuid,
  p_community_id uuid,
  p_player_id uuid,
  p_rubric_version text,
  p_dimensions jsonb
)
returns table (
  contribution_id uuid,
  superseded_contribution_id uuid,
  dimension_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_receipt jsonb;
  v_result jsonb;
  v_superseded uuid;
  v_count integer;
begin
  if p_command_id is null
     or p_contribution_id is null
     or p_community_id is null
     or p_player_id is null then
    raise exception 'command_id, contribution_id, community_id and player_id are required'
      using errcode = '23514';
  end if;

  v_receipt := app_private.find_command_receipt(
    p_command_id,
    'record_player_evaluation',
    p_contribution_id
  );

  v_uid := (select auth.uid());
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  perform 1 from public.players p where p.id = p_player_id for update;
  if not found then
    raise exception 'Player not found' using errcode = 'P0002';
  end if;

  if not exists (select 1 from public.communities c where c.id = p_community_id) then
    raise exception 'Community not found' using errcode = 'P0002';
  end if;

  if not public.current_user_has_community_capability(p_community_id, 'player.evaluate') then
    raise exception 'Not authorized to evaluate Players in this Community'
      using errcode = '42501';
  end if;

  v_receipt := app_private.find_command_receipt(
    p_command_id,
    'record_player_evaluation',
    p_contribution_id
  );
  if v_receipt is not null then
    return query
      select
        (v_receipt->>'contribution_id')::uuid,
        (v_receipt->>'superseded_contribution_id')::uuid,
        (v_receipt->>'dimension_count')::integer;
    return;
  end if;

  if not app_private.registration_player_standing_alive(p_community_id, p_player_id) then
    raise exception 'Player has no living roster standing in this Community'
      using errcode = '23514';
  end if;

  if nullif(pg_catalog.btrim(coalesce(p_rubric_version, '')), '') is null then
    raise exception 'Rubric version is required' using errcode = '23514';
  end if;

  if p_dimensions is null
     or pg_catalog.jsonb_typeof(p_dimensions) <> 'object'
     or p_dimensions = '{}'::jsonb then
    raise exception 'At least one dimension score is required' using errcode = '23514';
  end if;

  if exists (
    select 1
      from pg_catalog.jsonb_each(p_dimensions) d
     where pg_catalog.btrim(d.key) = ''
        or pg_catalog.jsonb_typeof(d.value) <> 'number'
  ) then
    raise exception 'Dimension keys must be non-blank and scores must be numbers'
      using errcode = '23514';
  end if;

  if exists (
    select 1
      from pg_catalog.jsonb_each(p_dimensions) d
     where (d.value)::numeric < 0
        or (d.value)::numeric > 10
  ) then
    raise exception 'Dimension scores must be between 0 and 10' using errcode = '23514';
  end if;

  if not exists (
    select 1
      from public.skill_rubric_versions r
     where r.rubric_version = pg_catalog.btrim(p_rubric_version)
  ) then
    raise exception 'Rubric version is not registered' using errcode = '23514';
  end if;

  if exists (
    select 1
      from pg_catalog.jsonb_each(p_dimensions) d
     where not exists (
       select 1
         from public.skill_rubric_dimensions r
        where r.rubric_version = pg_catalog.btrim(p_rubric_version)
          and r.dimension_key = d.key
     )
  ) then
    raise exception 'Dimension is not part of this rubric version' using errcode = '23514';
  end if;

  if exists (
    select 1
      from public.skill_rubric_dimensions r
     where r.rubric_version = pg_catalog.btrim(p_rubric_version)
       and r.is_required
       and not (p_dimensions ? r.dimension_key)
  ) then
    raise exception 'Rubric version requires a score for every required dimension'
      using errcode = '23514';
  end if;

  update public.player_evaluation_contributions
     set superseded_at = pg_catalog.now(),
         superseded_by_id = p_contribution_id
   where community_id = p_community_id
     and player_id = p_player_id
     and evaluator_user_id = v_uid
     and superseded_at is null
  returning id into v_superseded;

  insert into public.player_evaluation_contributions (
    id,
    community_id,
    player_id,
    evaluator_user_id,
    rubric_version,
    command_id
  ) values (
    p_contribution_id,
    p_community_id,
    p_player_id,
    v_uid,
    pg_catalog.btrim(p_rubric_version),
    p_command_id
  );

  insert into public.player_evaluation_dimension_scores (
    contribution_id,
    rubric_version,
    dimension_key,
    value
  )
  select
    p_contribution_id,
    pg_catalog.btrim(p_rubric_version),
    d.key,
    (d.value)::numeric
    from pg_catalog.jsonb_each(p_dimensions) d;

  get diagnostics v_count = row_count;

  v_result := pg_catalog.jsonb_build_object(
    'contribution_id', p_contribution_id,
    'superseded_contribution_id', v_superseded,
    'dimension_count', v_count
  );
  perform app_private.record_command_receipt(
    p_command_id,
    v_uid,
    'record_player_evaluation',
    p_contribution_id,
    v_result,
    'PLAYER_EVALUATION'
  );

  return query select p_contribution_id, v_superseded, v_count;
end;
$$;

revoke all on function public.record_player_evaluation(uuid, uuid, uuid, uuid, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.record_player_evaluation(uuid, uuid, uuid, uuid, text, jsonb)
  to authenticated;
