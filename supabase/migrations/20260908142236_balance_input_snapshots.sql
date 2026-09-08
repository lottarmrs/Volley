-- XS-W6-01 — entradas autorizadas e imutaveis do balanceador.
--
-- Ate aqui a cadeia W5 produzia perfis calculados sob demanda: qualquer leitura refletia o
-- estado das avaliacoes naquele instante. Isso e correto para consultar um perfil e errado
-- para formar times, porque a formacao precisa continuar explicavel depois que as origens
-- mudarem. Este artefato existe por isso, e so por isso: congelar o que entrou no sorteio.
--
-- O comando aceita apenas identificadores. O navegador nunca envia vetor de atributo --
-- quem resolve os valores e o servidor, a partir do perfil global privado da W5-04, que
-- continua sendo a unica origem de avaliacao aqui. Nada de atributo legado, autoavaliacao,
-- Overall, forma, estatistica ou nota de exibicao entra no vetor.

create table app_private.balance_input_snapshots (
  id uuid primary key,
  session_id uuid not null references public.sessions(id) on delete restrict,
  roster_revision_id uuid not null,
  created_by uuid references auth.users(id) on delete set null,
  captured_at timestamptz not null default pg_catalog.now(),
  payload jsonb not null,
  provenance jsonb not null,
  constraint balance_input_snapshots_roster_fkey
    foreign key (roster_revision_id, session_id)
    references public.roster_revisions (id, session_id)
    on delete restrict,
  constraint balance_input_snapshots_payload_object_check
    check (pg_catalog.jsonb_typeof(payload) = 'object'),
  constraint balance_input_snapshots_provenance_array_check
    check (pg_catalog.jsonb_typeof(provenance) = 'array')
);

create index balance_input_snapshots_session_idx
  on app_private.balance_input_snapshots (session_id);
create index balance_input_snapshots_roster_idx
  on app_private.balance_input_snapshots (roster_revision_id, session_id);
create index balance_input_snapshots_created_by_idx
  on app_private.balance_input_snapshots (created_by);

revoke all on table app_private.balance_input_snapshots from public, anon, authenticated;
alter table app_private.balance_input_snapshots enable row level security;

-- A unica mutacao aceita e a que o apagamento de conta provoca: created_by -> null pelo
-- `on delete set null`. Qualquer outra escrita, inclusive por quem administra o banco, e
-- recusada -- um snapshot que pode ser reescrito nao prova nada sobre a formacao passada.
create function app_private.reject_balance_input_snapshot_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Balance input snapshots are immutable' using errcode = '55000';
  end if;

  if new.id = old.id
     and new.session_id is not distinct from old.session_id
     and new.roster_revision_id is not distinct from old.roster_revision_id
     and new.captured_at is not distinct from old.captured_at
     and new.payload is not distinct from old.payload
     and new.provenance is not distinct from old.provenance
     and old.created_by is not null
     and new.created_by is null then
    return new;
  end if;

  raise exception 'Balance input snapshots are immutable' using errcode = '55000';
end;
$$;

create trigger reject_balance_input_snapshot_mutation_trigger
  before update or delete on app_private.balance_input_snapshots
  for each row execute function app_private.reject_balance_input_snapshot_mutation();

revoke all on function app_private.reject_balance_input_snapshot_mutation()
  from public, anon, authenticated;

-- ── capture_balance_input_snapshot ──────────────────────────────────────────
create function public.capture_balance_input_snapshot(
  p_command_id uuid,
  p_session_id uuid,
  p_roster_revision_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rubric_version constant text := 'v0-legacy-11';
  v_resolver_version constant text := 'v0-global-roster-mean-5';
  v_global_policy_version constant text := 'v0-equal-community-mean';
  v_community_policy_version constant text := 'v0-legacy-mad-mean';
  v_expected_dimensions constant text[] := array[
    'saque', 'recepcao', 'levantamento', 'ataque', 'bloqueio', 'defesa',
    'velocidade', 'resistencia', 'leituraDeJogo', 'regularidade', 'controleEmocional'
  ];
  v_uid uuid := (select auth.uid());
  v_session public.sessions;
  v_revision public.roster_revisions;
  v_latest_revision integer;
  v_registry text[];
  v_receipt jsonb;
  v_entry_count integer;
  v_invalid_count integer;
  v_unactivated_count integer;
  v_participants jsonb;
  v_provenance jsonb;
  v_captured_at timestamptz;
  v_fingerprint text;
  v_payload jsonb;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_command_id is null or p_session_id is null or p_roster_revision_id is null then
    raise exception 'command_id, session_id and roster_revision_id are required'
      using errcode = '23514';
  end if;

  -- Mesmo lock da mutacao de elenco e da finalizacao: duas capturas simultaneas do mesmo
  -- elenco serializam aqui, e nao competem por linha nenhuma do artefato.
  select * into v_session
    from public.sessions s
   where s.id = p_session_id
     and s.authority_model = 'target'
     and s.session_context = 'COMMUNITY'
   for update;
  if not found then
    raise exception 'Target Community Session not found' using errcode = 'P0002';
  end if;

  -- Autorizacao antes de qualquer leitura de recibo: quem nao pode formar time tambem nao
  -- pode descobrir, por replay, o que outra pessoa capturou.
  perform public.assert_target_session_write_authorized(v_session);

  v_receipt := app_private.find_command_receipt(
    p_command_id, 'capture_balance_input_snapshot', p_session_id
  );
  if v_receipt is not null then
    if (v_receipt ->> 'roster_revision_id')::uuid is distinct from p_roster_revision_id then
      raise exception
        'command_id % already captured roster revision %, not %',
        p_command_id, v_receipt ->> 'roster_revision_id', p_roster_revision_id
        using errcode = '23505';
    end if;
    return v_receipt;
  end if;

  if v_session.lifecycle_status not in ('DRAFT', 'SCHEDULED') then
    raise exception 'Session must be DRAFT or SCHEDULED to capture balance inputs'
      using errcode = '23514';
  end if;

  if not exists (
    select 1
      from app_private.community_evaluation_cutovers c
     where c.community_id = v_session.community_id
  ) then
    raise exception 'Community evaluation model is not activated' using errcode = '23514';
  end if;

  select * into v_revision
    from public.roster_revisions r
   where r.id = p_roster_revision_id
     and r.session_id = v_session.id;
  if not found then
    raise exception 'Roster revision does not belong to this Session' using errcode = '23514';
  end if;

  select pg_catalog.max(r.revision_number) into v_latest_revision
    from public.roster_revisions r
   where r.session_id = v_session.id;
  if v_revision.revision_number is distinct from v_latest_revision then
    raise exception 'Roster revision is not the current one' using errcode = '40001';
  end if;

  -- O resolver e casado com uma rubric concreta. Se o registro derivar -- dimensao nova,
  -- renomeada ou removida -- a captura para, em vez de produzir um vetor com chave que o
  -- solver nunca viu.
  select pg_catalog.array_agg(d.dimension_key order by d.display_order) into v_registry
    from public.skill_rubric_dimensions d
   where d.rubric_version = v_rubric_version
     and d.kind = 'SOURCE';
  if v_registry is distinct from v_expected_dimensions then
    raise exception 'Skill rubric registry drifted from the % resolver contract', v_resolver_version
      using errcode = '23514';
  end if;

  v_captured_at := pg_catalog.clock_timestamp();

  -- Uma unica instrucao resolve elegibilidade, perfis globais, metadados do atleta e a
  -- ativacao das comunidades de origem. Duas instrucoes veriam dois instantes diferentes em
  -- READ COMMITTED, e o vetor de um participante poderia nascer de um estado que nunca
  -- coexistiu com o do participante seguinte.
  with entry as (
    select e.participant_id,
           e.entry_order,
           e.identity_kind,
           e.player_id,
           e.display_name_at_time
      from public.roster_revision_entries e
     where e.roster_revision_id = p_roster_revision_id
  ), invalid as (
    select e.entry_order
      from entry e
     where e.identity_kind = 'PLAYER'
       and (
         e.player_id is null
         or not exists (
           select 1
             from public.players p
            where p.id = e.player_id
              and p.active
              and p.deleted_at is null
         )
         or not exists (
           select 1
             from public.community_players cp
            where cp.community_id = v_session.community_id
              and cp.player_id = e.player_id
              and cp.active
              and cp.status = 'active'
         )
       )
  ), profile as materialized (
    select e.participant_id,
           app_private.compute_global_player_skill_profile(
             e.player_id, v_rubric_version
           ) as profile
      from entry e
     where e.identity_kind = 'PLAYER'
       and e.player_id is not null
  ), source_community as (
    select distinct (s.value ->> 'community_id')::uuid as community_id
      from profile p
      cross join lateral pg_catalog.jsonb_array_elements(p.profile -> 'community_sources') s
  ), unactivated as (
    select sc.community_id
      from source_community sc
     where not exists (
       select 1
         from app_private.community_evaluation_cutovers c
        where c.community_id = sc.community_id
     )
  ), dimension as (
    select d.dimension_key, d.display_order
      from public.skill_rubric_dimensions d
     where d.rubric_version = v_rubric_version
  ), observed as (
    select p.participant_id,
           v.value ->> 'dimension_key' as dimension_key,
           (v.value ->> 'value')::numeric as value
      from profile p
      cross join lateral pg_catalog.jsonb_array_elements(p.profile -> 'dimensions') v
     where v.value -> 'value' <> 'null'::jsonb
  ), reference as (
    -- A media de referencia nasce so de valor observado: estimativa nao realimenta a
    -- estimativa do participante seguinte. Sem nenhuma observacao no elenco inteiro, a
    -- dimensao vale 5 -- politica escolhida pelo usuario, versionada em v0-global-roster-mean-5.
    select d.dimension_key,
           d.display_order,
           case
             when pg_catalog.count(o.value) = 0 then 5::numeric
             else pg_catalog.round(pg_catalog.avg(o.value), 1)
           end as value
      from dimension d
      left join observed o on o.dimension_key = d.dimension_key
     group by d.dimension_key, d.display_order
  ), resolved as (
    select e.participant_id,
           e.entry_order,
           r.dimension_key,
           r.display_order,
           coalesce(o.value, r.value) as value,
           o.value is null as estimated
      from entry e
      cross join reference r
      left join observed o
        on o.participant_id = e.participant_id
       and o.dimension_key = r.dimension_key
  ), vector as (
    select r.participant_id,
           r.entry_order,
           pg_catalog.jsonb_object_agg(r.dimension_key, pg_catalog.to_jsonb(r.value)) as attributes,
           coalesce(
             pg_catalog.jsonb_agg(r.dimension_key order by r.display_order)
               filter (where r.estimated),
             '[]'::jsonb
           ) as estimated_dimensions,
           pg_catalog.bool_or(r.estimated) as is_estimated
      from resolved r
     group by r.participant_id, r.entry_order
  ), participant as (
    select e.entry_order,
           pg_catalog.jsonb_build_object(
             'participant_id', e.participant_id,
             'identity_kind', e.identity_kind,
             'display_name_at_time', e.display_name_at_time,
             'attribute_vector', v.attributes,
             'estimated_dimensions', v.estimated_dimensions,
             'is_estimated', v.is_estimated,
             'source_profile_revision', pr.profile ->> 'source_revision',
             'height_cm', case
               when e.identity_kind <> 'PLAYER' then null
               when p.height is null then null
               when p.height = 'NaN'::numeric then null
               when p.height <= 0 then null
               else pg_catalog.to_jsonb(p.height)
             end,
             'gender', case when e.identity_kind = 'PLAYER' then p.gender end,
             'primary_position', case when e.identity_kind = 'PLAYER' then p.primary_position end,
             'secondary_positions', case
               when e.identity_kind = 'PLAYER'
                 then coalesce(pg_catalog.to_jsonb(p.secondary_positions), '[]'::jsonb)
               else '[]'::jsonb
             end,
             'is_injured', case
               when e.identity_kind = 'PLAYER' and p.status -> 'lesionado' = 'true'::jsonb
                 then true
               else false
             end
           ) as payload
      from entry e
      join vector v on v.participant_id = e.participant_id
      left join profile pr on pr.participant_id = e.participant_id
      left join public.players p
        on p.id = e.player_id
       and e.identity_kind = 'PLAYER'
  ), provenance as (
    -- Proveniencia guarda a revisao de origem e os valores crus, inclusive os ausentes, sem
    -- identidade de avaliador, sem player_id global e sem calculated_at: o carimbo de hora do
    -- calculo mudaria a impressao digital de uma entrada logicamente identica.
    select e.entry_order,
           pg_catalog.jsonb_build_object(
             'participant_id', e.participant_id,
             'identity_kind', e.identity_kind,
             'source_profile_revision', pr.profile ->> 'source_revision',
             'community_count', coalesce(pr.profile -> 'community_count', '0'::jsonb),
             'community_sources', coalesce(pr.profile -> 'community_sources', '[]'::jsonb),
             'raw_dimensions', coalesce(pr.profile -> 'dimensions', '[]'::jsonb)
           ) as payload
      from entry e
      left join profile pr on pr.participant_id = e.participant_id
  )
  select (select pg_catalog.count(*)::integer from entry),
         (select pg_catalog.count(*)::integer from invalid),
         (select pg_catalog.count(*)::integer from unactivated),
         coalesce(
           (select pg_catalog.jsonb_agg(x.payload order by x.entry_order) from participant x),
           '[]'::jsonb
         ),
         coalesce(
           (select pg_catalog.jsonb_agg(y.payload order by y.entry_order) from provenance y),
           '[]'::jsonb
         )
    into v_entry_count, v_invalid_count, v_unactivated_count, v_participants, v_provenance;

  if v_entry_count = 0 then
    raise exception 'Roster revision has no entries to capture' using errcode = '23514';
  end if;
  if v_invalid_count > 0 then
    raise exception 'Roster entry references a Player without live Community standing'
      using errcode = '23514';
  end if;
  -- Recusa mistura: uma comunidade ainda em sombra nao vira entrada confiavel por omissao,
  -- e tambem nao e silenciosamente descartada do calculo.
  if v_unactivated_count > 0 then
    raise exception 'Source Community has not activated the evaluation model'
      using errcode = '23514';
  end if;

  v_fingerprint := pg_catalog.md5(
    pg_catalog.jsonb_build_object(
      'session_id', v_session.id,
      'roster_revision_id', p_roster_revision_id,
      'rubric_version', v_rubric_version,
      'resolver_version', v_resolver_version,
      'global_policy_version', v_global_policy_version,
      'community_policy_version', v_community_policy_version,
      'participants', v_participants,
      'provenance', v_provenance
    )::text
  );

  v_payload := pg_catalog.jsonb_build_object(
    'snapshot_id', p_command_id,
    'session_id', v_session.id,
    'roster_revision_id', p_roster_revision_id,
    'rubric_version', v_rubric_version,
    'resolver_version', v_resolver_version,
    'global_policy_version', v_global_policy_version,
    'community_policy_version', v_community_policy_version,
    'captured_at', v_captured_at,
    'input_fingerprint', v_fingerprint,
    'participants', v_participants
  );

  insert into app_private.balance_input_snapshots (
    id, session_id, roster_revision_id, created_by, captured_at, payload, provenance
  ) values (
    p_command_id, v_session.id, p_roster_revision_id, v_uid, v_captured_at,
    v_payload, v_provenance
  );

  perform app_private.record_command_receipt(
    p_command_id,
    v_uid,
    'capture_balance_input_snapshot',
    v_session.id,
    v_payload,
    'BALANCE_INPUT_SNAPSHOT'
  );

  return v_payload;
end;
$$;

revoke all on function public.capture_balance_input_snapshot(uuid, uuid, uuid)
  from public, anon;
grant execute on function public.capture_balance_input_snapshot(uuid, uuid, uuid) to authenticated;

-- ── read_balance_input_snapshot ─────────────────────────────────────────────
-- A leitura reconfere a permissao corrente, mas nao o ciclo de vida: um snapshot de Session
-- ja encerrada continua legivel, porque explicar a formacao passada e justamente o ponto.
-- O que ele devolve continua amarrado ao elenco original -- publicar candidatos exige
-- revalidar elenco e configuracao atuais por conta propria.
create function public.read_balance_input_snapshot(p_snapshot_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_snapshot app_private.balance_input_snapshots;
  v_session public.sessions;
begin
  if (select auth.uid()) is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_snapshot_id is null then
    raise exception 'snapshot_id is required' using errcode = '23514';
  end if;

  select * into v_snapshot
    from app_private.balance_input_snapshots s
   where s.id = p_snapshot_id;
  if not found then
    raise exception 'Balance input snapshot not found' using errcode = 'P0002';
  end if;

  select * into v_session
    from public.sessions s
   where s.id = v_snapshot.session_id;
  if not found then
    raise exception 'Target Community Session not found' using errcode = 'P0002';
  end if;

  perform public.assert_target_session_write_authorized(v_session);

  return v_snapshot.payload;
end;
$$;

revoke all on function public.read_balance_input_snapshot(uuid) from public, anon;
grant execute on function public.read_balance_input_snapshot(uuid) to authenticated;
