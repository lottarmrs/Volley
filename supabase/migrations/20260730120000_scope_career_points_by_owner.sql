-- Escopar por owner_id a resolucao de ids locais de point_events.
--
-- O CTE scored casava point_events por (game_id, player_id) sem dono. Esses campos
-- guardam ids LOCAIS, unicos apenas em (owner_id, local_id) — entao dois donos com
-- os mesmos ids locais tinham as carreiras misturadas. Reproduzido contra producao
-- numa transacao: a sessao da conta A passou de 0 para 5 pontos assim que a conta B
-- inseriu 5 point_events com os mesmos ids locais.
--
-- Item do Completion Gate do Plano 3 que nunca fora verificado: "toda resolucao de id
-- local no SQL e escopada por owner_id". Os demais joins ja estavam corretos.

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
  -- distinct on (jogador, jogo): um jogador pode aparecer em MAIS DE UM time da mesma
  -- sessao (rebalanceamento no meio). Sem isso o join casa o mesmo jogo uma vez por
  -- time e games_played conta em dobro, distorcendo o win rate. statistics.ts usa
  -- filter e conta o jogo uma vez so.
  player_games as (
    select distinct on (pt.player_uuid, gr.id)
           pt.player_uuid, gr.id as game_uuid, gr.ref as game_ref, gr.session_id,
           (gr.winner_team_id is not null and gr.winner_team_id = pt.team_ref) as won
      from game_ref gr
      join player_teams pt
        on pt.session_id = gr.session_id
       and (gr.team_a_id = pt.team_ref or gr.team_b_id = pt.team_ref)
     -- Vitoria ganha do empate na desambiguacao: se o jogador estava nos dois times,
     -- o time vencedor e o que conta.
     order by pt.player_uuid, gr.id, (gr.winner_team_id = pt.team_ref) desc
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
           -- O ramo legado importa: linhas anteriores a taxonomia de junho tem
           -- point_type nulo, e statistics.ts as conta como erro via
           -- reason = 'opponent_error' com o time do jogador concedendo o ponto.
           -- Sem ele, o calculo de erros divergia do de pontos logo acima, que ja
           -- tratava o legado.
           count(*) filter (
             where pe.event_kind is distinct from 'highlight'
               and (
                 case when pe.point_type is not null then pe.point_type = 'error'
                      else pe.reason = 'opponent_error'
                        and pe.conceding_team_id in (
                          select pt2.team_ref from player_teams pt2
                           where pt2.player_uuid = pg.player_uuid
                             and pt2.session_id = pg.session_id
                        )
                 end
               )
           ) as errors,
           count(*) filter (where pe.event_kind = 'highlight') as highlights
      from player_games pg
      join player_ref pr on pr.player_uuid = pg.player_uuid
      join public.point_events pe
        -- Sem este owner_id os ids LOCAIS casam entre contas: local_id so e unico
        -- em (owner_id, local_id). Verificado — dois donos com 'loc-g1'/'loc-p1'
        -- faziam os pontos de um entrar na carreira do outro.
        on pe.owner_id = pr.owner_id
       and pe.game_id = pg.game_ref
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
