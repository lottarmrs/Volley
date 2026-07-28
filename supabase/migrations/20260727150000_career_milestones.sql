-- Dez marcos deterministicos. Conjunto FECHADO — os limiares vivem aqui, uma vez so; o
-- TypeScript apenas apresenta (slug -> rotulo), sem duplicar regra.
--
-- "Sessao vencida" = games_won > games_played - games_won (empate nao conta).
-- Sequencia e contada por SESSAO, nao por jogo: o livro-razao e session-granular e nao
-- guarda ordenacao por jogo, entao uma sequencia por jogo nao seria reconstruivel a
-- partir dele.

create or replace function public.regenerate_player_milestones(p_player_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.career_events
   where type = 'milestone' and player_id = p_player_id;

  insert into public.career_events (
    player_id, community_id, session_id, type, occurred_at, payload, source_key, contract_version
  )
  with sessions_ordered as (
    select ce.occurred_at,
           (ce.payload->>'games_played')::int as games_played,
           (ce.payload->>'games_won')::int as games_won,
           (ce.payload->>'points')::int as points,
           row_number() over (order by ce.occurred_at) as seq
      from public.career_events ce
     where ce.player_id = p_player_id and ce.type = 'session_played'
  ),
  running as (
    select so.*,
           (so.games_won > so.games_played - so.games_won) as session_won,
           sum(so.games_played) over (order by so.seq) as cum_games,
           sum(so.points) over (order by so.seq) as cum_points
      from sessions_ordered so
  ),
  -- Ilhas de sessoes vencidas consecutivas: seq menos a contagem de vitorias e
  -- constante dentro de uma sequencia. Pre-computamos a chave em uma CTE separada
  -- porque o Postgres nao permite aninhar funcoes de janela no mesmo nivel.
  streak_keys as (
    select r.*,
           r.seq - sum(case when r.session_won then 1 else 0 end)
                    over (order by r.seq) as streak_key
      from running r
  ),
  streaks as (
    select sk.*,
           case when sk.session_won then
             row_number() over (
               partition by sk.streak_key
               order by sk.seq
             )
           else 0 end as streak_len
      from streak_keys sk
  ),
  hits as (
    select 'first_session' as slug, min(occurred_at) as at from running
    union all
    select 'first_win', min(occurred_at) from running where session_won
    union all
    select 'games_10', min(occurred_at) from running where cum_games >= 10
    union all
    select 'games_50', min(occurred_at) from running where cum_games >= 50
    union all
    select 'games_100', min(occurred_at) from running where cum_games >= 100
    union all
    select 'points_100', min(occurred_at) from running where cum_points >= 100
    union all
    select 'points_500', min(occurred_at) from running where cum_points >= 500
    union all
    select 'points_1000', min(occurred_at) from running where cum_points >= 1000
    union all
    select 'streak_3', min(occurred_at) from streaks where streak_len >= 3
    union all
    select 'streak_5', min(occurred_at) from streaks where streak_len >= 5
  )
  select p_player_id,
         null::uuid,
         null::uuid,
         'milestone',
         h.at,
         jsonb_build_object('slug', h.slug),
         'player:' || p_player_id || '|milestone:' || h.slug,
         1
    from hits h
   where h.at is not null;
end;
$$;

revoke execute on function public.regenerate_player_milestones(uuid) from public, anon;
grant execute on function public.regenerate_player_milestones(uuid) to authenticated;

-- Encadeia os marcos no wrapper do trigger. Os seis triggers da Task 2 continuam
-- apontando para esta funcao — nao precisam ser recriados.

create or replace function public.regenerate_career_events()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  affected uuid[];
  affected_players uuid[];
  affected_player uuid;
begin
  select array_agg(distinct session_id) into affected
    from (
      select session_id from touched_rows where session_id is not null
    ) s;

  -- Captura os jogadores afetados ANTES de deletar/recriar os resumos de sessao.
  select array_agg(distinct player_id) into affected_players
    from public.career_events
   where session_id = any(affected) and type = 'session_played';

  perform public.regenerate_career_events_for_sessions(affected);

  -- Recalcula marcos para quem tinha eventos ou passou a ter eventos nessas sessoes.
  for affected_player in
    select distinct player_id from (
      select unnest(affected_players) as player_id
      union
      select player_id
        from public.career_events
       where session_id = any(affected) and type = 'session_played'
    ) combined where player_id is not null
  loop
    perform public.regenerate_player_milestones(affected_player);
  end loop;

  return null;
end;
$$;
