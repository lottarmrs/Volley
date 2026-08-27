-- reset_product_data referenciava public.player_achievements, que nunca foi criada.
--
-- O spec do Plano 3 previa uma tabela separada de conquistas, mas a implementacao
-- consolidou os marcos dentro de career_events (`type = 'milestone'`, ver
-- 20260727150000_career_milestones.sql). O scaffold de reset ficou apontando para a
-- tabela do desenho antigo.
--
-- Corpo plpgsql so resolve nomes em tempo de execucao, entao a funcao criou e passou
-- em todas as verificacoes estruturais — quebraria apenas na primeira chamada real,
-- que por desenho e o cutover do Plano 5. Verificado contra producao: das 18 tabelas
-- que a funcao referencia, era a unica inexistente.

create or replace function public.reset_product_data(target_account_uuid text)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.has_capability('reset_product_data') then
    raise exception 'Not authorized: missing reset_product_data capability';
  end if;
  perform public.require_aal2();

  -- Children-first referential order
  delete from public.point_events;
  delete from public.games;
  delete from public.teams;
  delete from public.sessions;
  delete from public.championship_rounds;
  delete from public.championship_teams;
  delete from public.championships;
  -- Marcos vivem em career_events com type = 'milestone'; nao ha tabela separada.
  delete from public.career_events;
  delete from public.player_evaluations;
  delete from public.self_evaluations;
  delete from public.community_players;
  delete from public.whatsapp_list_drafts;
  delete from public.community_presence;
  delete from public.game_reports;
  delete from public.session_reports;
  delete from public.players where owner_id = target_account_uuid::uuid;
  delete from public.communities where owner_id = target_account_uuid::uuid;
end;
$$;

revoke all on function public.reset_product_data(text) from public, anon, authenticated;
grant execute on function public.reset_product_data(text) to authenticated;
