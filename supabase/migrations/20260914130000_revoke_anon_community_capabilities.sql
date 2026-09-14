-- Fecha para `anon` o achado A7 da auditoria de 2026-09-08.
--
-- 20260908160000 revogou de `authenticated` o EXECUTE de community_capabilities, cujo
-- target_user_id livre deixa sondar o papel de qualquer usuario em qualquer comunidade.
-- As migrations anteriores ja revogavam de `public`, e num Postgres puro isso bastava. No
-- Supabase nao: os privilegios padrao do schema public concedem EXECUTE diretamente a
-- `anon`, e `revoke ... from public` nao remove essa concessao. O advisor de seguranca do
-- projeto apontou a funcao executavel por `anon` depois da aplicacao da cadeia.
--
-- So esta funcao muda. As outras que o advisor lista para `anon` dependem de auth.uid() e
-- devolvem null ou false sem sessao, e algumas sao avaliadas dentro de policies sem clausula
-- `to`: revogar delas trocaria "zero linhas" por erro de permissao.

revoke execute on function public.community_capabilities(uuid, uuid) from anon;
