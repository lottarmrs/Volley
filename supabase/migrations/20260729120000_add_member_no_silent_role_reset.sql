-- Adicionar alguem que JA e membro ativo nao pode rebaixar o cargo dele.
--
-- O on conflict do update anterior fazia `set role = excluded.role`, entao readicionar
-- um moderador com o papel padrao 'member' o rebaixava em silencio — sem aviso, sem
-- confirmacao. Verificado na tela: um moderador virou membro so por ser readicionado.
--
-- Agora: membro ATIVO devolve erro e nada muda. Pendente/rejeitado/convidado continua
-- podendo ser ativado, porque ai adicionar e justamente a acao pretendida (equivale a
-- aprovar o pedido), e nao ha cargo estabelecido para preservar.
--
-- Trocar o cargo de quem ja esta na comunidade se faz no card do membro, que usa
-- set_community_member_role.

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
  v_existing public.community_members;
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

    if v_player_user_id is null then
      raise exception 'O atleta % ainda nao tem conta vinculada. Use o codigo de claim para ele reivindicar o perfil.', v_identifier
        using errcode = '22023';
    end if;

    v_user_id := v_player_user_id;
  end if;

  select * into v_existing
    from public.community_members
   where community_id = target_community_id and user_id = v_user_id;

  -- Ja ativo: nada muda. O cargo se altera no card, nao readicionando.
  if v_existing.id is not null and v_existing.status = 'active' then
    raise exception 'Ja e membro da comunidade' using errcode = '22023';
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
