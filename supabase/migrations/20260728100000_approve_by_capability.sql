-- Re-escreve approve_join_request / reject_join_request para usar a capability
-- 'approve_members' em vez do array hardcoded ['owner', 'admin']. A capability matrix
-- ja atribui approve_members a owner, admin e moderator; a migration que criou a
-- capability (20260726100000_community_role_capabilities.sql) reescreveu
-- set_community_member_role e remove_community_member mas deixou estes dois para
-- tras. Esta migration completa o alinhamento.

create or replace function public.approve_join_request(p_member_id uuid)
returns public.community_members
language plpgsql
security definer
set search_path = public
as $$
declare
  v_comm uuid;
  v_row  public.community_members;
begin
  select community_id into v_comm from public.community_members where id = p_member_id;
  if v_comm is null then
    raise exception 'Solicitacao nao encontrada' using errcode = '22023';
  end if;
  if not (public.is_superadmin()
          or public.community_has_capability(v_comm, 'approve_members')) then
    raise exception 'Apenas quem tem approve_members pode aprovar solicitacoes' using errcode = '42501';
  end if;

  update public.community_members
     set status = 'active', updated_at = now()
   where id = p_member_id
   returning * into v_row;

  return v_row;
end;
$$;

revoke execute on function public.approve_join_request(uuid) from public, anon;
grant execute on function public.approve_join_request(uuid) to authenticated;

create or replace function public.reject_join_request(p_member_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_comm uuid;
begin
  select community_id into v_comm from public.community_members where id = p_member_id;
  if v_comm is null then
    raise exception 'Solicitacao nao encontrada' using errcode = '22023';
  end if;
  if not (public.is_superadmin()
          or public.community_has_capability(v_comm, 'approve_members')) then
    raise exception 'Apenas quem tem approve_members pode rejeitar solicitacoes' using errcode = '42501';
  end if;

  update public.community_members
     set status = 'rejected', updated_at = now()
   where id = p_member_id;
end;
$$;

revoke execute on function public.reject_join_request(uuid) from public, anon;
grant execute on function public.reject_join_request(uuid) to authenticated;
