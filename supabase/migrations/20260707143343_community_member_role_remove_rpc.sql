-- Harden community member role updates and removals behind explicit RPCs.
-- Direct table mutations from the browser remain protected by RLS/triggers, but
-- these functions give the client a narrow, auditable API for sensitive actions.

create or replace function public.set_community_member_role(
  p_member_id uuid,
  p_role text
)
returns public.community_members
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  target_member public.community_members;
  updated_member public.community_members;
begin
  if v_uid is null then
    raise exception 'Nao autenticado' using errcode = '42501';
  end if;

  if p_role not in ('admin', 'moderator', 'member') then
    raise exception 'Invalid community member role: %', p_role using errcode = '22023';
  end if;

  select *
    into target_member
    from public.community_members
   where id = p_member_id;

  if target_member.id is null then
    raise exception 'Membro da comunidade nao encontrado' using errcode = '22023';
  end if;

  if target_member.role = 'owner' then
    raise exception 'O papel owner nao pode ser alterado por esta acao' using errcode = '42501';
  end if;

  if not (
    public.is_superadmin()
    or (
      public.current_user_has_community_role(target_member.community_id, array['owner', 'admin'])
      and exists (
        select 1
          from public.community_members actor
         where actor.community_id = target_member.community_id
           and actor.user_id = v_uid
           and actor.status = 'active'
           and actor.role = any(array['owner', 'admin'])
      )
    )
  ) then
    raise exception 'Apenas dono/admin podem alterar papeis de membros' using errcode = '42501';
  end if;

  update public.community_members
     set role = p_role,
         updated_at = now()
   where id = p_member_id
   returning * into updated_member;

  return updated_member;
end;
$$;

revoke execute on function public.set_community_member_role(uuid, text) from public, anon;
grant execute on function public.set_community_member_role(uuid, text) to authenticated;

create or replace function public.remove_community_member(
  p_member_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  target_member public.community_members;
begin
  if v_uid is null then
    raise exception 'Nao autenticado' using errcode = '42501';
  end if;

  select *
    into target_member
    from public.community_members
   where id = p_member_id;

  if target_member.id is null then
    raise exception 'Membro da comunidade nao encontrado' using errcode = '22023';
  end if;

  if target_member.role = 'owner' then
    raise exception 'Owner nao pode ser removido por esta acao' using errcode = '42501';
  end if;

  if not (
    public.is_superadmin()
    or (
      public.current_user_has_community_role(target_member.community_id, array['owner', 'admin'])
      and exists (
        select 1
          from public.community_members actor
         where actor.community_id = target_member.community_id
           and actor.user_id = v_uid
           and actor.status = 'active'
           and actor.role = any(array['owner', 'admin'])
      )
    )
  ) then
    raise exception 'Apenas dono/admin podem remover membros' using errcode = '42501';
  end if;

  delete from public.community_members
   where id = p_member_id;
end;
$$;

revoke execute on function public.remove_community_member(uuid) from public, anon;
grant execute on function public.remove_community_member(uuid) to authenticated;
