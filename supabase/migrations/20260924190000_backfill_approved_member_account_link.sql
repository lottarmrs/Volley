-- Reparo do que a fatia 3 deixou para tras.
--
-- `enroll_approved_member` passou a criar o vinculo de conta
-- (20260924180000), mas so em aprovacoes futuras. Quem foi aprovado entre o
-- backfill de 20260827130000 e hoje ficou com ficha e vaga no elenco e sem
-- `player_account_links` -- ou seja, aparecendo como atleta na tela e sendo
-- recusado ao entrar na lista.
--
-- O reparo e uma funcao, nao um bloco solto, por dois motivos: da para testar
-- contra dados montados (`approvedMemberCanJoin.dbtest.ts`) e da para rodar de
-- novo se o buraco reaparecer por outro caminho.
--
-- DUAS GUARDAS, e as duas importam:
--
--   * so age sobre quem NAO TEM LINHA NENHUMA em player_account_links. Quem
--     teve o vinculo REJECTED ou REVOKED nao e alcancado -- criar um ACTIVE
--     por cima desfaria uma decisao deliberada de quem revisou;
--   * so age quando a ficha nao esta ativa em outra conta, respeitando
--     `player_account_links_one_active_per_player`.
--
-- Alcance: quem e membro ATIVO de alguma comunidade e esta no elenco dela. E
-- a populacao cuja permissao ja foi concedida por uma aprovacao; nao e "todo
-- atleta com user_id", que seria mais largo do que o defeito.

create or replace function app_private.backfill_approved_member_account_links()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_criados integer;
begin
  with alvo as (
    select distinct m.user_id, p.id as player_id
      from public.community_members m
      join public.players p
        on p.user_id = m.user_id
       and p.deleted_at is null
      join public.community_players cp
        on cp.community_id = m.community_id
       and cp.player_id = p.id
       and cp.active
     where m.status = 'active'
       and not exists (
             select 1 from public.player_account_links l
              where l.user_id = m.user_id
           )
       and not exists (
             select 1 from public.player_account_links l
              where l.player_id = p.id
                and l.status = 'ACTIVE'
           )
  ),
  inseridos as (
    insert into public.player_account_links
      (player_id, user_id, status, provenance, activated_at)
    select player_id, user_id, 'ACTIVE', 'ORGANIZER_ASSIGNED', now()
      from alvo
    on conflict do nothing
    returning 1
  )
  select count(*) into v_criados from inseridos;

  return v_criados;
end;
$$;

revoke all on function app_private.backfill_approved_member_account_links()
  from public, anon, authenticated;

select app_private.backfill_approved_member_account_links();
