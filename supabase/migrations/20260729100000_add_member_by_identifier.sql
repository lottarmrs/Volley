-- Adicionar membro por e-mail OU username, e corrigir dois resquicios do RPC antigo.
--
-- 1. 'organizador' nunca entrou na lista de papeis aceitos: o papel foi criado em
--    20260726100000 e este RPC ficou para tras. Dava para promover alguem a
--    organizador pelo card, mas nao para ADICIONAR ja como organizador.
-- 2. A autorizacao usava array['owner','admin'] hardcoded em vez da capability
--    'manage_members' — mesmo resquicio que 20260728100000 corrigiu em
--    approve_join_request. Hoje o resultado coincide, mas um override de capability
--    seria silenciosamente ignorado aqui.
--
-- Username nao pode conter ponto nem '@' (is_valid_account_username exige
-- ^[a-z0-9][a-z0-9_-]{2,29}$), entao a deteccao por '@' e inequivoca.
--
-- O username vive em players, nao em profiles: a resolucao e
-- username -> players.user_id -> profiles.id. Um atleta sem conta vinculada
-- (convidado, ficha nunca reivindicada) tem user_id nulo e NAO pode virar membro —
-- o erro precisa dizer isso, e nao "nao encontrado", que mandaria o admin procurar
-- um cadastro que existe.

create or replace function public.add_community_member_by_identifier(
  target_community_id uuid,
  target_identifier text,
  target_role text default 'member'
)
returns public.community_members
language plpgsql
security definer
set search_path = public
as $$
declare
  v_identifier text := trim(target_identifier);
  v_user_id uuid;
  v_player_user_id uuid;
  inserted_member public.community_members;
begin
  if v_identifier is null or v_identifier = '' then
    raise exception 'Informe um e-mail ou username' using errcode = '22023';
  end if;

  if target_role not in ('owner', 'admin', 'moderator', 'organizador', 'member') then
    raise exception 'Invalid community member role: %', target_role using errcode = '22023';
  end if;

  if not (
    public.is_superadmin()
    or public.community_has_capability(target_community_id, 'manage_members')
  ) then
    raise exception 'Apenas quem tem manage_members pode adicionar membros'
      using errcode = '42501';
  end if;

  if position('@' in v_identifier) > 0 then
    select p.id into v_user_id
      from public.profiles p
     where lower(p.email) = lower(v_identifier)
     limit 1;

    if v_user_id is null then
      raise exception 'Nenhuma conta encontrada para o e-mail %', v_identifier
        using errcode = '22023';
    end if;
  else
    select pl.user_id into v_player_user_id
      from public.players pl
     where lower(pl.username) = lower(v_identifier)
       and pl.deleted_at is null
     limit 1;

    if not found then
      raise exception 'Nenhum atleta encontrado com o username %', v_identifier
        using errcode = '22023';
    end if;

    -- Atleta existe mas nao tem conta: distinguir do caso acima e o que evita o
    -- admin procurar um cadastro que esta ali.
    if v_player_user_id is null then
      raise exception 'O atleta % ainda nao tem conta vinculada. Use o codigo de claim para ele reivindicar o perfil.', v_identifier
        using errcode = '22023';
    end if;

    v_user_id := v_player_user_id;
  end if;

  insert into public.community_members (community_id, user_id, role, status, created_by)
  values (target_community_id, v_user_id, target_role, 'active', (select auth.uid()))
  on conflict (community_id, user_id)
  do update set role = excluded.role, status = 'active', updated_at = now()
  returning * into inserted_member;

  return inserted_member;
end;
$$;

revoke execute on function public.add_community_member_by_identifier(uuid, text, text)
  from public, anon;
grant execute on function public.add_community_member_by_identifier(uuid, text, text)
  to authenticated;
