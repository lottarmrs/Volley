-- Achados do advisor de seguranca do Supabase em 2026-09-15.
--
-- 1. `anon` tinha ALL em 18 tabelas do public e EXECUTE em todas as funcoes novas, pelos
--    privilegios padrao do projeto. RLS segurava as linhas, mas o contrato do repositorio
--    (schemaSecurity.dbtest.ts) e que anonimo nao alcanca estado de dominio por nada. Sem
--    privilegio de tabela, `anon` nunca chega as policies sem clausula `to`, entao os helpers
--    que 20260914130000 manteve executaveis para `anon` podem ser revogados.
-- 2. rls_auto_enable e funcao de event trigger: nenhum papel da API precisa de EXECUTE.
-- 3. sync_community_player_active_status nao fixava search_path.
-- 4. community_profile_summary era view com os direitos do dono (ERROR no advisor). A view
--    precisa ignorar a RLS de profiles para mostrar o nome de outro membro, o que
--    security_invoker impede; o mesmo predicado vira funcao com privilegio explicito.

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;
alter default privileges for role postgres in schema public revoke execute on functions from anon;

revoke execute on function public.current_user_active_player_id() from public, anon;
revoke execute on function public.current_user_has_community_capability(uuid, text) from public, anon;
revoke execute on function public.current_user_is_active_community_member(uuid) from public, anon;
revoke execute on function public.player_is_linked_to_current_user(uuid) from public, anon;

revoke execute on function public.rls_auto_enable() from public, anon, authenticated;

alter function public.sync_community_player_active_status() set search_path = '';

create or replace function public.community_profile_summaries(p_user_ids uuid[])
returns table (id uuid, name text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.name
  from public.profiles p
  where p.id = any (p_user_ids)
    and public.current_user_shares_profile(p.id);
$$;

revoke all on function public.community_profile_summaries(uuid[]) from public, anon;
grant execute on function public.community_profile_summaries(uuid[]) to authenticated;

drop view if exists public.community_profile_summary;
