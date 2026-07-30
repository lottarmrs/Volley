-- Remove o outbox. Decisao do usuario em 2026-07-30, ao fechar o Plano 3.
--
-- Por que sai: o outbox modelava "uma linha por operacao de dominio", mas o app nao
-- tem escrita por operacao — o sync e reconciliacao de payload inteiro, e repetir uma
-- reconciliacao ja e idempotente por construcao. As quatro operacoes que o cliente
-- validava (session.conclude, point.register, claim.apply, evaluation.save) nao tinham
-- ponto de escrita para interceptar: sessionLifecycleUseCases e logica local pura.
--
-- O que o outbox resolveria de verdade e fila offline, e nao existe modo offline ate o
-- Plano 4. O cliente tambem nunca funcionou: importava node:crypto (quebra o build do
-- browser) e montava os updates com chaves camelCase contra colunas snake_case. Guardar
-- a tabela nao preservava nada aproveitavel — o Plano 4 escreve isso contra requisitos
-- offline reais.
--
-- A tabela nunca teve consumidor em producao, entao nao ha dado a preservar.

-- Primeiro a funcao, que referencia a tabela no corpo. Identica a versao de
-- 20260728110000_reset_scaffold.sql, menos o `delete from public.outbox_entries`.
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
  delete from public.player_achievements;
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

drop table if exists public.outbox_entries;
