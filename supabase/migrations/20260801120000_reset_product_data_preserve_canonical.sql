-- reset_product_data apagava TODOS os players do owner, incluindo o player
-- canonico da conta (has_account_identity_history = true). O trigger
-- guard_player_account_identity_delete bloqueia essa delecao com
-- 'Canonical account identity cannot be deleted' (errcode 42501), abortando
-- o reset inteiro -- que e transacional, entao e fail-safe (rollback, nada
-- apagado) mas o reset nunca completaria em producao.
--
-- Descoberto no ensaio do Plano 5, Fase 1 (projeto ypuwjxblcsudlaqakyro):
-- toda conta pronta tem um player canonico com a flag = true (gate 2 do
-- programa), entao o reset sempre abortaria no statement de players.
--
-- Correcao: preservar o player canonico. "Reset de produto" apaga dados de
-- jogo/comunidade/avaliacoes e jogadores NAO vinculados a identidade da conta;
-- o jogador canonico (user_id != null, has_account_identity_history = true) e
-- inalianavel e sobrevive. A constraint players_account_identity_history_check
-- garante que has_account_identity_history = true sse o player e canonico.
--
-- Gate de "players zerado" passa a ser "players NAO-canonico zerado".
--
-- Segundo defeito do ensaio: o DELETE FROM communities cascadeia para
-- community_members e dispara prevent_last_community_owner_change ('Cannot
-- remove the last owner from a community') -- toda comunidade tem owner, entao
-- o reset sempre abortaria. Solucao: uma flag transaction-local
-- app.allow_reset_bypass (mesmo padrao de app.allow_role_change) que o reset
-- liga no inicio e o guard de last-owner respeita. O reset e a unica chamada
-- autorizada (master + AAL2) que desativa o guard de integridade de membership,
-- pontualmente, dentro da transacao.

create or replace function public.prevent_last_community_owner_change()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  owner_count integer;
begin
  -- Reset autorizado (master + AAL2) desativa o guard dentro da transacao.
  -- Este e um trigger BEFORE: retornar a row certa respeita a operacao. Em
  -- DELETE, new e NULL -> retornar new cancelaria a delecao da row (e do
  -- cascade que originou o DELETE); por isso retorna old para prosseguir.
  if coalesce(current_setting('app.allow_reset_bypass', true), '') = 'on' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'DELETE' and old.role = 'owner' then
    select count(*) into owner_count
    from public.community_members
    where community_id = old.community_id and role = 'owner';

    if owner_count <= 1 then
      raise exception 'Cannot remove the last owner from a community'
        using errcode = '23514';
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' and old.role = 'owner' and new.role <> 'owner' then
    select count(*) into owner_count
    from public.community_members
    where community_id = old.community_id and role = 'owner';

    if owner_count <= 1 then
      raise exception 'Cannot demote the last owner from a community'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function public.prevent_last_community_owner_change() from public, anon, authenticated;

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

  -- Allow last-owner guard bypass for the duration of this transaction only.
  -- security definer: a flag vive na transacao do caller do reset.
  perform set_config('app.allow_reset_bypass', 'on', true);

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
  -- Preserva o player canonico da conta (has_account_identity_history = true).
  -- Ver constraint players_account_identity_history_check.
  delete from public.players
   where owner_id = target_account_uuid::uuid
     and not has_account_identity_history;
  delete from public.communities where owner_id = target_account_uuid::uuid;
end;
$$;

revoke all on function public.reset_product_data(text) from public, anon, authenticated;
grant execute on function public.reset_product_data(text) to authenticated;

-- Terceiro defeito do ensaio: o trigger de auditoria log_table_changes
-- (AFTER [INSERT/UPDATE/DELETE] em communities, players, sessions, games,
-- teams, point_events, career... etc) insere em modification_logs
-- referenciando community_id/owner_id da propria linha deletada. Quando o
-- reset apaga a community mae, o INSERT do log viola a FK
-- modification_logs_community_id_fkey (NO ACTION) -- a mae ja sumiu na
-- mesma transacao, abortando o reset. Reset autorizado (master + AAL2)
-- destrui deliberadamente dados de produto; auditar a delecao em massa nao
-- agrega e quebra a transacao. Mesmo bypass app.allow_reset_bypass: o
-- trigger nao audita enquanto o reset esta ativo.
create or replace function public.log_table_changes()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  record_owner uuid;
  record_community uuid;
begin
  -- Reset autorizado desativa a auditoria dentro da transacao.
  if coalesce(current_setting('app.allow_reset_bypass', true), '') = 'on' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if (tg_op = 'INSERT') then
    record_owner := nullif(to_jsonb(new)->>'owner_id', '')::uuid;
    record_community := coalesce(
      nullif(to_jsonb(new)->>'community_id', '')::uuid,
      case when tg_table_name = 'communities' then new.id else null end
    );

    insert into public.modification_logs (
      owner_id, community_id, changed_by, table_name, record_id, action_type, old_data, new_data
    ) values (
      record_owner, record_community, auth.uid(), tg_table_name, new.id::text, tg_op, null, to_jsonb(new)
    );
    return new;
  elsif (tg_op = 'UPDATE') then
    record_owner := coalesce(
      nullif(to_jsonb(new)->>'owner_id', '')::uuid,
      nullif(to_jsonb(old)->>'owner_id', '')::uuid
    );
    record_community := coalesce(
      nullif(to_jsonb(new)->>'community_id', '')::uuid,
      nullif(to_jsonb(old)->>'community_id', '')::uuid,
      case when tg_table_name = 'communities' then new.id else null end
    );

    insert into public.modification_logs (
      owner_id, community_id, changed_by, table_name, record_id, action_type, old_data, new_data
    ) values (
      record_owner, record_community, auth.uid(), tg_table_name, new.id::text, tg_op, to_jsonb(old), to_jsonb(new)
    );
    return new;
  elsif (tg_op = 'DELETE') then
    record_owner := nullif(to_jsonb(old)->>'owner_id', '')::uuid;
    record_community := coalesce(
      nullif(to_jsonb(old)->>'community_id', '')::uuid,
      case when tg_table_name = 'communities' then old.id else null end
    );

    insert into public.modification_logs (
      owner_id, community_id, changed_by, table_name, record_id, action_type, old_data, new_data
    ) values (
      record_owner, record_community, auth.uid(), tg_table_name, old.id::text, tg_op, to_jsonb(old), null
    );
    return old;
  end if;
  return null;
end;
$$;
