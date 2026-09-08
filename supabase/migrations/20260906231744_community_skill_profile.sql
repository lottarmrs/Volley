create function public.get_community_player_skill_profile(
  p_community_id uuid,
  p_player_id uuid,
  p_rubric_version text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_rubric_version text := pg_catalog.btrim(p_rubric_version);
  v_profile jsonb;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_community_id is null or p_player_id is null then
    raise exception 'Community and Player are required' using errcode = '23514';
  end if;
  if not public.current_user_has_community_capability(p_community_id, 'player.evaluate') then
    raise exception 'Not authorized to read skill profiles in this Community'
      using errcode = '42501';
  end if;
  if not app_private.registration_player_standing_alive(p_community_id, p_player_id) then
    raise exception 'Player has no living roster standing in this Community'
      using errcode = '23514';
  end if;
  if not exists (
    select 1 from public.skill_rubric_versions r where r.rubric_version = v_rubric_version
  ) then
    raise exception 'Rubric version is not registered' using errcode = '23514';
  end if;

  with dimensions as (
    select d.dimension_key, d.kind, d.is_required, d.display_order
      from public.skill_rubric_dimensions d
     where d.rubric_version = v_rubric_version
  ), contributions as (
    select c.id
      from public.player_evaluation_contributions c
     where c.community_id = p_community_id
       and c.player_id = p_player_id
       and c.rubric_version = v_rubric_version
       and c.superseded_at is null
  ), scores as (
    select s.contribution_id, s.dimension_key, s.value
      from public.player_evaluation_dimension_scores s
      join contributions c on c.id = s.contribution_id
  ), medians as (
    select s.dimension_key, pg_catalog.count(*) as sample_count,
           pg_catalog.percentile_cont(0.5) within group (order by s.value::double precision) as median
      from scores s
     group by s.dimension_key
  ), deviations as (
    select s.*, m.sample_count, pg_catalog.abs(s.value::double precision - m.median) as deviation
      from scores s
      join medians m using (dimension_key)
  ), thresholds as (
    select d.dimension_key,
           greatest(1.75, 2.5 * pg_catalog.percentile_cont(0.5) within group (order by d.deviation)) as threshold
      from deviations d
     group by d.dimension_key
  ), classified as (
    select d.*, d.sample_count < 4 or d.deviation <= t.threshold as included
      from deviations d
      join thresholds t using (dimension_key)
  ), statistics as (
    select c.dimension_key, pg_catalog.count(*) as sample_count,
           pg_catalog.count(*) filter (where c.included) as filtered_count,
           pg_catalog.avg(c.value) as all_mean,
           pg_catalog.avg(c.value) filter (where c.included) as filtered_mean
      from classified c
     group by c.dimension_key
  ), aggregates as (
    select s.dimension_key, s.sample_count,
           case when s.filtered_count < 2 then s.sample_count else s.filtered_count end as included_count,
           pg_catalog.round(case when s.filtered_count < 2 then s.all_mean else s.filtered_mean end, 1) as value
      from statistics s
  )
  select pg_catalog.jsonb_build_object(
    'community_id', p_community_id,
    'player_id', p_player_id,
    'rubric_version', v_rubric_version,
    'aggregation_policy_version', 'v0-legacy-mad-mean',
    'status', 'EXPERIMENTAL',
    'source_revision', pg_catalog.md5(pg_catalog.jsonb_build_object(
      'community_id', p_community_id,
      'player_id', p_player_id,
      'rubric_version', v_rubric_version,
      'dimensions', coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(d) order by d.display_order) from dimensions d), '[]'::jsonb),
      'contributions', coalesce((select pg_catalog.jsonb_agg(c.id order by c.id) from contributions c), '[]'::jsonb),
      'scores', coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(s) order by s.contribution_id, s.dimension_key) from scores s), '[]'::jsonb)
    )::text),
    'calculated_at', pg_catalog.statement_timestamp(),
    'contribution_count', (select pg_catalog.count(*) from contributions),
    'dimensions', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'dimension_key', d.dimension_key,
        'value', a.value,
        'sample_count', coalesce(a.sample_count, 0),
        'included_count', coalesce(a.included_count, 0),
        'excluded_count', coalesce(a.sample_count - a.included_count, 0)
      ) order by d.display_order)
      from dimensions d
      left join aggregates a using (dimension_key)
    ), '[]'::jsonb)
  ) into v_profile;
  return v_profile;
end;
$$;

revoke all on function public.get_community_player_skill_profile(uuid, uuid, text)
  from public, anon;
grant execute on function public.get_community_player_skill_profile(uuid, uuid, text)
  to authenticated;
