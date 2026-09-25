-- Admin nao mexe em admin (decisao de 2026-09-25, docs/PERMISSOES.md).
--
-- O cargo de admin so e dado, tirado ou tocado pelo dono. Ate aqui `manage_members` bastava
-- para rebaixar, remover ou promover a admin, e `community.members.manage` para ligar ou
-- desligar a organizacao de qualquer um: dois admins podiam se tirar um ao outro, e um admin
-- criava outro que ele mesmo nao desfazia. Provado em adminNaoMexeEmAdmin.dbtest.ts.
--
-- Redefine as tres funcoes a partir da ultima definicao de cada uma
-- (20260726110000 para as duas legadas, 20260910100000 para a de organizacao), repetindo
-- security definer e search_path, que `create or replace` nao herda.

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

  perform public.require_aal2();

  if p_role not in ('admin', 'moderator', 'organizador', 'member') then
    raise exception 'Invalid community member role: %', p_role using errcode = '22023';
  end if;

  select * into target_member from public.community_members where id = p_member_id;

  if target_member.id is null then
    raise exception 'Membro da comunidade nao encontrado' using errcode = '22023';
  end if;

  if target_member.role = 'owner' then
    raise exception 'O papel owner nao pode ser alterado por esta acao' using errcode = '42501';
  end if;

  if not public.community_has_capability(target_member.community_id, 'manage_members') then
    raise exception 'Apenas quem tem manage_members pode alterar papeis de membros' using errcode = '42501';
  end if;

  if (p_role = 'admin' or (target_member.role = 'admin' and target_member.user_id <> v_uid))
     and not public.is_superadmin()
     and not exists (
       select 1 from public.community_members m
        where m.community_id = target_member.community_id
          and m.user_id = v_uid
          and m.role = 'owner'
          and m.status = 'active'
     )
  then
    raise exception 'Apenas o dono da comunidade da ou tira o cargo de admin' using errcode = '42501';
  end if;

  update public.community_members
     set role = p_role, updated_at = now()
   where id = p_member_id
   returning * into updated_member;

  return updated_member;
end;
$$;

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

  perform public.require_aal2();

  select * into target_member from public.community_members where id = p_member_id;

  if target_member.id is null then
    raise exception 'Membro da comunidade nao encontrado' using errcode = '22023';
  end if;

  if target_member.role = 'owner' then
    raise exception 'Owner nao pode ser removido por esta acao' using errcode = '42501';
  end if;

  if not public.community_has_capability(target_member.community_id, 'remove_members') then
    raise exception 'Apenas quem tem remove_members pode remover membros' using errcode = '42501';
  end if;

  if target_member.role = 'admin'
     and target_member.user_id <> v_uid
     and not public.is_superadmin()
     and not exists (
       select 1 from public.community_members m
        where m.community_id = target_member.community_id
          and m.user_id = v_uid
          and m.role = 'owner'
          and m.status = 'active'
     )
  then
    raise exception 'Apenas o dono da comunidade remove um admin' using errcode = '42501';
  end if;

  delete from public.community_members where id = p_member_id;
end;
$$;

create or replace function public.set_community_organizer(
  p_community_id uuid,
  p_user_id uuid,
  p_enabled boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_enabled is null then
    raise exception 'enabled is required' using errcode = '23514';
  end if;
  if p_community_id is null or p_user_id is null
     or not public.current_user_has_community_capability(p_community_id, 'community.members.manage')
  then
    raise exception 'Not authorized to manage organizers in this Community' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.community_memberships
     where community_id = p_community_id and user_id = p_user_id and status = 'active'
  ) then
    raise exception 'Organizer must be an active Community member' using errcode = '23514';
  end if;

  if p_user_id <> (select auth.uid())
     and exists (
       select 1 from public.community_memberships
        where community_id = p_community_id and user_id = p_user_id
          and role = 'admin' and status = 'active'
     )
     and not exists (
       select 1 from public.community_memberships
        where community_id = p_community_id and user_id = (select auth.uid())
          and role = 'owner' and status = 'active'
     )
  then
    raise exception 'Only the Community owner manages another admin''s organizer duty'
      using errcode = '42501';
  end if;

  if not p_enabled then
    update public.community_responsibilities
       set revoked_at = pg_catalog.now()
     where community_id = p_community_id
       and user_id = p_user_id
       and responsibility = 'ORGANIZER'
       and revoked_at is null;
    return;
  end if;

  insert into public.community_responsibilities (
    community_id, user_id, responsibility, assigned_by
  )
  values (p_community_id, p_user_id, 'ORGANIZER', (select auth.uid()))
  on conflict (community_id, user_id, responsibility) do update
    set revoked_at = null,
        assigned_at = pg_catalog.now(),
        assigned_by = (select auth.uid());
end;
$$;
