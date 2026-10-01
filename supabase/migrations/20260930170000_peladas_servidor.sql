-- Dados online, parte 2 (spec 2026-09-30-peladas-online-design.md, "Analise de dependencias").
-- 1. Quem organiza pela responsabilidade (session.manage) grava times, jogos, pontos e relatorios
--    da comunidade; ate aqui so dono, admin e moderador gravavam, e o sync escondia a recusa.
-- 2. A pelada target nao aceita gravacao direta na raiz: local e observacoes ganham um comando.
-- 3. A carreira so era recalculada quando jogos ou pontos mudavam; encerrar a pelada agora
--    tambem recalcula, para nao depender da ordem das gravacoes.

do $$
declare
  v_table text;
begin
  foreach v_table in array array['teams', 'games', 'point_events', 'game_reports', 'session_reports']
  loop
    execute format('drop policy if exists %I on public.%I', 'Session organizers can insert', v_table);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check ('
      || 'owner_id = (select auth.uid()) and community_id is not null '
      || 'and public.current_user_has_community_capability(community_id, %L))',
      'Session organizers can insert', v_table, 'session.manage'
    );
    execute format('drop policy if exists %I on public.%I', 'Session organizers can update', v_table);
    execute format(
      'create policy %I on public.%I for update to authenticated using ('
      || 'community_id is not null '
      || 'and public.current_user_has_community_capability(community_id, %L)) with check ('
      || 'community_id is not null '
      || 'and public.current_user_has_community_capability(community_id, %L))',
      'Session organizers can update', v_table, 'session.manage', 'session.manage'
    );
    execute format('drop policy if exists %I on public.%I', 'Session organizers can delete', v_table);
    execute format(
      'create policy %I on public.%I for delete to authenticated using ('
      || 'community_id is not null '
      || 'and public.current_user_has_community_capability(community_id, %L))',
      'Session organizers can delete', v_table, 'session.manage'
    );
  end loop;
end;
$$;

create or replace function public.set_target_session_details(
  p_session_id uuid,
  p_expected_revision integer,
  p_location text,
  p_notes text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.sessions;
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
  if v_session.lifecycle_status in ('COMPLETED', 'CANCELLED') then
    raise exception 'A finished or cancelled Session cannot change its details' using errcode = '23514';
  end if;

  update public.sessions
     set location = nullif(btrim(coalesce(p_location, '')), ''),
         notes = nullif(btrim(coalesce(p_notes, '')), ''),
         updated_at = now(),
         revision = revision + 1
   where id = p_session_id;

  return v_session.revision + 1;
end;
$$;

revoke all on function public.set_target_session_details(uuid, integer, text, text) from public, anon;
grant execute on function public.set_target_session_details(uuid, integer, text, text) to authenticated;

create or replace function app_private.regenerate_career_on_session_finish()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_players uuid[];
  v_player uuid;
begin
  if new.status is distinct from 'finished' or old.status is not distinct from 'finished' then
    return null;
  end if;

  select array_agg(distinct player_id) into v_players
    from public.career_events
   where session_id = new.id and type = 'session_played';

  perform public.regenerate_career_events_for_sessions(array[new.id]);

  for v_player in
    select distinct player_id from (
      select unnest(v_players) as player_id
      union
      select player_id
        from public.career_events
       where session_id = new.id and type = 'session_played'
    ) combined where player_id is not null
  loop
    perform public.regenerate_player_milestones(v_player);
  end loop;

  return null;
end;
$$;

revoke all on function app_private.regenerate_career_on_session_finish() from public, anon, authenticated;

drop trigger if exists zz_regenerate_career_on_session_finish on public.sessions;
create trigger zz_regenerate_career_on_session_finish
  after update of status on public.sessions
  for each row execute function app_private.regenerate_career_on_session_finish();
