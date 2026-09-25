-- Avaliacao da comunidade (spec 2026-09-25-avaliacao-da-comunidade-design.md).
--
-- Decisao do usuario em 2026-09-25: dono e admin avaliam pelo cargo e podem designar outros
-- avaliadores. Isso troca, para player.evaluate, a regra GINV-CAP-002 escrita em
-- 20260905185744 ("a governance rank never confers the right to evaluate a Player"). Em
-- producao ninguem tinha EVALUATOR, entao nenhuma comunidade conseguia avaliar.

-- Ultima definicao: 20260905185744_versioned_player_evaluation_source.sql. O execute continua
-- revogado de authenticated (auditoria A7, 20260908160000): create or replace preserva isso.
create or replace function public.community_capabilities(
  target_community_id uuid,
  target_user_id uuid
)
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select c.capability
    from public.community_memberships m
    cross join lateral (
      select unnest(
        case m.role
          when 'owner' then array[
            'community.members.manage',
            'community.ownership.transfer',
            'community.profile.update',
            'community.archive',
            'player.evaluate'
          ]
          when 'admin' then array[
            'community.members.manage',
            'community.profile.update',
            'player.evaluate'
          ]
          else array[]::text[]
        end
      ) as capability
    ) c
   where m.community_id = target_community_id
     and m.user_id = target_user_id
     and m.status = 'active'

  union

  select 'session.manage'
    from public.community_responsibilities r
    join public.community_memberships m
      on m.community_id = r.community_id
     and m.user_id = r.user_id
     and m.status = 'active'
   where r.community_id = target_community_id
     and r.user_id = target_user_id
     and r.responsibility = 'ORGANIZER'
     and r.revoked_at is null

  union

  -- player.evaluate vem do cargo de dono ou admin (decisao de 2026-09-25) e tambem de uma
  -- responsabilidade EVALUATOR dada por quem gerencia membros.
  select 'player.evaluate'
    from public.community_responsibilities r
    join public.community_memberships m
      on m.community_id = r.community_id
     and m.user_id = r.user_id
     and m.status = 'active'
   where r.community_id = target_community_id
     and r.user_id = target_user_id
     and r.responsibility = 'EVALUATOR'
     and r.revoked_at is null;

  -- Deliberately absent, and each absence is asserted by the negative matrix:
  --   match.control      per-Match control is leased at Match time (GINV-MATCH-004),
  --                      never derived from a Community rank -- W7 owns it
  --   competition.admin  W8 owns it; an ORGANIZER is not a CompetitionAdmin
$$;


-- A marca e gravada na escrita, nao deduzida depois: quando a conta de quem avaliou e
-- apagada, evaluator_user_id vira null, e uma deducao passaria a contar a autoavaliacao como
-- nota de outra pessoa.
alter table public.player_evaluation_contributions
  add column if not exists is_self_assessment boolean not null default false;

create or replace function app_private.community_has_other_evaluator(
  p_community_id uuid,
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.community_memberships m
     where m.community_id = p_community_id
       and m.user_id <> p_user_id
       and m.status = 'active'
       and m.role in ('owner', 'admin')
  )
  or exists (
    select 1
      from public.community_responsibilities r
      join public.community_memberships m
        on m.community_id = r.community_id
       and m.user_id = r.user_id
       and m.status = 'active'
     where r.community_id = p_community_id
       and r.user_id <> p_user_id
       and r.responsibility = 'EVALUATOR'
       and r.revoked_at is null
  );
$$;

revoke all on function app_private.community_has_other_evaluator(uuid, uuid)
  from public, anon, authenticated;

-- Ultima definicao: 20260906130635_skill_rubric_contract.sql. Tres mudancas: v_self; a regra
-- da autoavaliacao logo depois do recibo, para o reenvio continuar devolvendo o recibo; e a
-- marca gravada no insert.
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
  v_self boolean;
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

  v_self := public.player_is_linked_to_current_user(p_player_id);
  if v_self and app_private.community_has_other_evaluator(p_community_id, v_uid) then
    raise exception 'Only the sole evaluator of this Community can assess themselves'
      using errcode = '42501';
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
    command_id,
    is_self_assessment
  ) values (
    p_contribution_id,
    p_community_id,
    p_player_id,
    v_uid,
    pg_catalog.btrim(p_rubric_version),
    p_command_id,
    v_self
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

-- Definicao unica ate aqui: 20260908031027_global_skill_profile.sql. Muda so o CTE
-- contributions: a autoavaliacao so entra enquanto nao ha nota de outra pessoa. O perfil
-- global e o sorteio leem esta funcao e herdam a regra.
create or replace function app_private.compute_community_player_skill_profile(
  p_community_id uuid,
  p_player_id uuid,
  p_rubric_version text
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with dimensions as (
    select d.dimension_key, d.kind, d.is_required, d.display_order
      from public.skill_rubric_dimensions d
     where d.rubric_version = p_rubric_version
  ), contributions as (
    select c.id
      from public.player_evaluation_contributions c
     where c.community_id = p_community_id
       and c.player_id = p_player_id
       and c.rubric_version = p_rubric_version
       and c.superseded_at is null
       and (
         not c.is_self_assessment
         or not exists (
           select 1
             from public.player_evaluation_contributions o
            where o.community_id = p_community_id
              and o.player_id = p_player_id
              and o.rubric_version = p_rubric_version
              and o.superseded_at is null
              and not o.is_self_assessment
         )
       )
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
    'rubric_version', p_rubric_version,
    'aggregation_policy_version', 'v0-legacy-mad-mean',
    'status', 'EXPERIMENTAL',
    'source_revision', pg_catalog.md5(pg_catalog.jsonb_build_object(
      'community_id', p_community_id,
      'player_id', p_player_id,
      'rubric_version', p_rubric_version,
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
  );
$$;
