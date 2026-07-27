-- Gera os resumos de sessao do livro-razao. Espelha src/logic/statistics.ts.
--
-- ATENCAO (armadilha central deste plano): point_events.player_id, point_events.game_id,
-- teams.player_ids e games.team_a_id/team_b_id/winner_team_id sao TEXT e carregam ids
-- LOCAIS — o sync so remapeia session_id e community_id. Por isso toda resolucao usa
-- coalesce(x.local_id, x.id::text) e e escopada por owner_id: o indice unico e
-- (owner_id, local_id), nao global.

create or replace function public.regenerate_career_events_for_sessions(target_sessions uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if target_sessions is null or array_length(target_sessions, 1) is null then
    return;
  end if;

  -- Apagar-e-inserir por sessao afetada: com a source_key unica isso torna a
  -- regeneracao idempotente e auto-corretiva (jogo apagado remove seus eventos).
  delete from public.career_events
   where type = 'session_played'
     and session_id = any(target_sessions);

  insert into public.career_events (
    player_id, community_id, session_id, type, occurred_at, payload, source_key, contract_version
  )
  with player_ref as (
    select p.id as player_uuid, p.owner_id, coalesce(p.local_id, p.id::text) as ref
      from public.players p
     where p.deleted_at is null
  ),
  team_ref as (
    select t.id, t.session_id, t.owner_id, t.player_ids,
           coalesce(t.local_id, t.id::text) as ref
      from public.teams t
     where t.session_id = any(target_sessions) and t.deleted_at is null
  ),
  game_ref as (
    select g.id, g.session_id, g.owner_id, g.team_a_id, g.team_b_id, g.winner_team_id,
           coalesce(g.local_id, g.id::text) as ref
      from public.games g
     where g.session_id = any(target_sessions)
       and g.deleted_at is null
       and g.status = 'finished'
  ),
  -- Times do jogador: teams.player_ids guarda ids LOCAIS de jogador.
  player_teams as (
    select pr.player_uuid, tr.session_id, tr.ref as team_ref
      from team_ref tr
      join player_ref pr on pr.owner_id = tr.owner_id and pr.ref = any(tr.player_ids)
  ),
  player_games as (
    select pt.player_uuid, gr.id as game_uuid, gr.ref as game_ref, gr.session_id,
           (gr.winner_team_id is not null and gr.winner_team_id = pt.team_ref) as won
      from game_ref gr
      join player_teams pt
        on pt.session_id = gr.session_id
       and (gr.team_a_id = pt.team_ref or gr.team_b_id = pt.team_ref)
  ),
  -- point_events.game_id tambem e id LOCAL de jogo.
  scored as (
    select pg.player_uuid, pg.session_id,
           count(*) filter (
             where pe.event_kind is distinct from 'highlight'
               and (
                 case when pe.point_type is not null then pe.point_type = 'winner'
                      else pe.reason in ('attack','block','serve_ace','defense_counterattack','tip')
                 end
               )
           ) as points,
           count(*) filter (
             where pe.event_kind is distinct from 'highlight'
               and pe.point_type = 'error'
           ) as errors,
           count(*) filter (where pe.event_kind = 'highlight') as highlights
      from player_games pg
      join player_ref pr on pr.player_uuid = pg.player_uuid
      join public.point_events pe
        on pe.game_id = pg.game_ref
       and pe.player_id = pr.ref
       and pe.deleted_at is null
     group by pg.player_uuid, pg.session_id
  ),
  rollup as (
    select pg.player_uuid,
           pg.session_id,
           count(*) as games_played,
           count(*) filter (where pg.won) as games_won,
           coalesce(max(s.points), 0) as points,
           coalesce(max(s.errors), 0) as errors,
           coalesce(max(s.highlights), 0) as highlights
      from player_games pg
      left join scored s
        on s.player_uuid = pg.player_uuid and s.session_id = pg.session_id
     group by pg.player_uuid, pg.session_id
  )
  select r.player_uuid,
         se.community_id,
         r.session_id,
         'session_played',
         coalesce(se.date::timestamptz, se.created_at),
         jsonb_build_object(
           'games_played', r.games_played,
           'games_won', r.games_won,
           'points', r.points,
           'errors', r.errors,
           'highlights', r.highlights
         ),
         'player:' || r.player_uuid || '|session:' || r.session_id || '|session_played',
         1
    from rollup r
    join public.sessions se on se.id = r.session_id
   where se.deleted_at is null
     and se.status = 'finished';
end;
$$;

revoke execute on function public.regenerate_career_events_for_sessions(uuid[]) from public, anon;
grant execute on function public.regenerate_career_events_for_sessions(uuid[]) to authenticated;

-- Trigger de STATEMENT com transition table. Um trigger de linha dispararia uma vez por
-- ponto: point_events chega em lote no sync (bulkUpsertRows), entao uma sessao de 100
-- pontos custaria 100 recomputacoes do mesmo resumo.
create or replace function public.regenerate_career_events()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  affected uuid[];
begin
  select array_agg(distinct session_id) into affected
    from (
      select session_id from touched_rows where session_id is not null
    ) s;

  perform public.regenerate_career_events_for_sessions(affected);
  return null;
end;
$$;

create trigger regenerate_career_after_point_events_ins
  after insert on public.point_events
  referencing new table as touched_rows
  for each statement execute function public.regenerate_career_events();

create trigger regenerate_career_after_point_events_upd
  after update on public.point_events
  referencing new table as touched_rows
  for each statement execute function public.regenerate_career_events();

create trigger regenerate_career_after_point_events_del
  after delete on public.point_events
  referencing old table as touched_rows
  for each statement execute function public.regenerate_career_events();

create trigger regenerate_career_after_games_ins
  after insert on public.games
  referencing new table as touched_rows
  for each statement execute function public.regenerate_career_events();

create trigger regenerate_career_after_games_upd
  after update on public.games
  referencing new table as touched_rows
  for each statement execute function public.regenerate_career_events();

create trigger regenerate_career_after_games_del
  after delete on public.games
  referencing old table as touched_rows
  for each statement execute function public.regenerate_career_events();
