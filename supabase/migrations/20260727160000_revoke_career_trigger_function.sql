-- regenerate_career_events() e funcao de TRIGGER e subiu sem revoke: as duas funcoes
-- com argumento foram revogadas, essa nao. Ficou exposta em
-- /rest/v1/rpc/regenerate_career_events para anon e authenticated.
--
-- Chamar por RPC falharia (a transition table touched_rows so existe dentro do contexto
-- do trigger), entao nao ha exploracao pratica — mas expor uma funcao security definer
-- que ninguem deve chamar contraria a convencao do schema. Mesmo caso de
-- 20260726180000_revoke_require_aal2_from_public.sql.
--
-- Revogado de authenticated tambem: ninguem deve invocar isto diretamente. O trigger
-- roda como dono da funcao e nao depende deste grant.

revoke all on function public.regenerate_career_events() from public, anon, authenticated;
