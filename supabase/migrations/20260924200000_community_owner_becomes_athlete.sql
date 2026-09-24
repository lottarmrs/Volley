-- Quem cria a comunidade vira atleta dela.
--
-- Levantado pela jornada do zero (`docs/JORNADA.md`, etapa 3) e medido em
-- `jornadaDoZero.dbtest.ts`: no banco inteiro so duas funcoes criam
-- `player_account_links`, e as duas rodam ao aprovar um pedido de entrada.
-- Quem cria a propria comunidade nao tem pedido para aprovar, entao nunca
-- recebia vinculo -- e nao conseguia entrar na pelada que ela mesma abriu.
--
-- Reusa `enroll_approved_member`, que ja e o lugar onde mora "esta pessoa e
-- atleta desta comunidade": cria a ficha se faltar, poe no elenco e cria o
-- vinculo. Idempotente, e nao reescreve vinculo que a conta ja tenha.
--
-- Producao nao tinha ninguem preso: os donos existentes vieram do backfill de
-- 20260827130000. O buraco era das comunidades criadas de agora em diante.

create or replace function public.create_community_with_owner(p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_community_id uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if coalesce(btrim(p_name), '') = '' then
    raise exception 'Community name is required' using errcode = '23514';
  end if;

  insert into public.communities (name, owner_id, authority_model)
  values (btrim(p_name), v_uid, 'target')
  returning id into v_community_id;

  insert into public.community_memberships (community_id, user_id, role, status)
  values (v_community_id, v_uid, 'owner', 'active');

  -- Quem cria a pelada joga nela. Sem isto a pessoa sai daqui com participacao
  -- e sem ficha no elenco nem vinculo de conta, e e recusada na propria lista
  -- com uma mensagem mandando "pedir a quem administra" -- sendo que ela e
  -- quem administra. Nao havia caminho nenhum: as unicas funcoes que criam
  -- vinculo so rodam ao APROVAR um pedido de entrada, e nao ha pedido para
  -- aprovar quando a comunidade acabou de nascer.
  perform app_private.enroll_approved_member(v_community_id, v_uid);

  return v_community_id;
end;
$$;
