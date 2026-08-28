create function app_private.record_legacy_roster_anomaly(
  p_run_id uuid,
  p_session_id uuid,
  p_reason text,
  p_source_hash text,
  p_rejected_tokens text[],
  p_candidates jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into app_private.migration_anomalies (
    run_id, source_type, source_id, reason, details
  )
  values (
    p_run_id,
    'legacy_session_selected_roster',
    p_session_id::text,
    p_reason,
    pg_catalog.jsonb_build_object(
      'source_hash', p_source_hash,
      'source_token_count', coalesce(pg_catalog.array_length(p_rejected_tokens, 1), 0),
      'rejected_tokens', pg_catalog.to_jsonb(p_rejected_tokens),
      'candidates', coalesce(
        (
          select pg_catalog.jsonb_agg(
                   pg_catalog.jsonb_build_object(
                     'token', c->>'token',
                     'player_ids', c->'player_ids'
                   )
                   order by (c->>'ordinal')::bigint
                 )
            from pg_catalog.jsonb_array_elements(p_candidates) c
           where c->>'token' = any (p_rejected_tokens)
        ),
        '[]'::jsonb
      )
    )
  )
  on conflict (run_id, source_type, source_id, reason) do nothing;
end;
$$;

revoke all on function app_private.record_legacy_roster_anomaly(
  uuid, uuid, text, text, text[], jsonb
) from public, anon, authenticated;

create function app_private.import_legacy_session_rosters(p_source_release text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run_id uuid;
  v_session record;
  v_tokens text[];
  v_hash text;
  v_existing public.roster_revisions;
  v_candidates jsonb;
  v_rejected text[];
  v_revision_id uuid;
  v_entries jsonb;
begin
  insert into app_private.migration_runs (name, source_release)
  values ('import_legacy_session_rosters', p_source_release)
  returning run_id into v_run_id;

  for v_session in
    select s.id, s.owner_id, s.selected_player_ids
      from public.sessions s
     where s.authority_model = 'legacy'
       and s.status in ('finished', 'cancelled')
       and s.selected_player_ids is not null
       and pg_catalog.array_length(s.selected_player_ids, 1) > 0
     order by s.id
  loop
    v_tokens := v_session.selected_player_ids;
    v_hash := pg_catalog.md5(pg_catalog.to_jsonb(v_tokens)::text);

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

    select pg_catalog.jsonb_agg(
             pg_catalog.jsonb_build_object(
               'ordinal', t.ordinal,
               'token', t.token,
               'player_ids', coalesce(resolved.player_ids, '[]'::jsonb)
             )
             order by t.ordinal
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
             where v_session.owner_id is not null
               and p.owner_id = v_session.owner_id
               and p.local_id = t.token
          ) candidate
      ) resolved on true;

    v_rejected := array(
      select t.token
        from pg_catalog.unnest(v_tokens) as t(token)
       group by t.token
      having pg_catalog.count(*) > 1
       order by t.token
    );
    if coalesce(pg_catalog.array_length(v_rejected, 1), 0) > 0 then
      perform app_private.record_legacy_roster_anomaly(
        v_run_id, v_session.id, 'LEGACY_ROSTER_TOKEN_REPEATED',
        v_hash, v_rejected, v_candidates
      );
      continue;
    end if;

    v_rejected := array(
      select c->>'token'
        from pg_catalog.jsonb_array_elements(v_candidates) c
       where pg_catalog.jsonb_array_length(c->'player_ids') = 0
       order by (c->>'ordinal')::bigint
    );
    if coalesce(pg_catalog.array_length(v_rejected, 1), 0) > 0 then
      perform app_private.record_legacy_roster_anomaly(
        v_run_id,
        v_session.id,
        case
          when v_session.owner_id is null then 'LEGACY_ROSTER_OWNER_UNKNOWN'
          else 'LEGACY_ROSTER_TOKEN_UNRESOLVED'
        end,
        v_hash,
        v_rejected,
        v_candidates
      );
      continue;
    end if;

    v_rejected := array(
      select c->>'token'
        from pg_catalog.jsonb_array_elements(v_candidates) c
       where pg_catalog.jsonb_array_length(c->'player_ids') > 1
       order by (c->>'ordinal')::bigint
    );
    if coalesce(pg_catalog.array_length(v_rejected, 1), 0) > 0 then
      perform app_private.record_legacy_roster_anomaly(
        v_run_id, v_session.id, 'LEGACY_ROSTER_TOKEN_AMBIGUOUS',
        v_hash, v_rejected, v_candidates
      );
      continue;
    end if;

    v_rejected := array(
      select c->>'token'
        from pg_catalog.jsonb_array_elements(v_candidates) c
       where c->'player_ids'->>0 in (
         select shared->'player_ids'->>0
           from pg_catalog.jsonb_array_elements(v_candidates) shared
          group by shared->'player_ids'->>0
         having pg_catalog.count(*) > 1
       )
       order by (c->>'ordinal')::bigint
    );
    if coalesce(pg_catalog.array_length(v_rejected, 1), 0) > 0 then
      perform app_private.record_legacy_roster_anomaly(
        v_run_id, v_session.id, 'LEGACY_ROSTER_PLAYERS_COLLIDE',
        v_hash, v_rejected, v_candidates
      );
      continue;
    end if;

    select pg_catalog.jsonb_agg(
             pg_catalog.jsonb_build_object(
               'entry_order', (c->>'ordinal')::integer - 1,
               'participant_id', pg_catalog.gen_random_uuid()::text,
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
           )
      into v_entries
      from pg_catalog.jsonb_array_elements(v_candidates) c
      join public.players pl on pl.id = (c->'player_ids'->>0)::uuid;

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

do $$
begin
  perform app_private.import_legacy_session_rosters(
    '20260828165916_import_legacy_session_rosters'
  );
end;
$$;
