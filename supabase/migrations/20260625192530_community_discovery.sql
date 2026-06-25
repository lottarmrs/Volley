-- ============================================================================
-- Comunidade v2 — Descoberta de públicas (Fase E2)
--
-- OPT-IN e mantém o padrão privado: visibility default 'private' (inalterado).
-- Uma comunidade só aparece na busca se o dono a marcar como 'public'. Entrar
-- numa pública ainda passa por APROVAÇÃO (status 'pending') — consistente com o
-- modelo de pedido/aprovação. Tudo via RPCs SECURITY DEFINER.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Definir visibilidade (dono/admin)
-- ----------------------------------------------------------------------------
create or replace function public.set_community_visibility(
  target_community_id uuid,
  p_visibility text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_visibility not in ('private', 'public') then
    raise exception 'Visibilidade inválida: %', p_visibility using errcode = '22023';
  end if;
  if not (public.is_superadmin()
          or public.current_user_has_community_role(target_community_id, array['owner', 'admin'])) then
    raise exception 'Apenas dono/admin podem alterar a visibilidade' using errcode = '42501';
  end if;
  update public.communities
     set visibility = p_visibility, updated_at = now()
   where id = target_community_id;
end;
$$;
revoke execute on function public.set_community_visibility(uuid, text) from public, anon;
grant execute on function public.set_community_visibility(uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 2. Buscar comunidades públicas (descoberta)
-- ----------------------------------------------------------------------------
create or replace function public.search_public_communities(p_query text)
returns table (
  id uuid,
  name text,
  description text,
  member_count bigint,
  my_status text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id,
    c.name,
    c.description,
    (select count(*) from public.community_members m where m.community_id = c.id and m.status = 'active'),
    (select cm.status from public.community_members cm
       where cm.community_id = c.id and cm.user_id = (select auth.uid()) limit 1)
  from public.communities c
  where c.visibility = 'public'
    and c.deleted_at is null
    and (
      coalesce(trim(p_query), '') = ''
      or c.name ilike '%' || trim(p_query) || '%'
    )
  order by c.name
  limit 30;
$$;
revoke execute on function public.search_public_communities(text) from public, anon;
grant execute on function public.search_public_communities(text) to authenticated;

-- ----------------------------------------------------------------------------
-- 3. Pedir entrada numa comunidade pública (por id; cria pending)
-- ----------------------------------------------------------------------------
create or replace function public.request_to_join_public(target_community_id uuid)
returns public.community_members
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  v_row public.community_members;
begin
  if v_uid is null then
    raise exception 'Não autenticado' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.communities
    where id = target_community_id and visibility = 'public' and deleted_at is null
  ) then
    raise exception 'Comunidade pública não encontrada' using errcode = '22023';
  end if;

  insert into public.community_members (community_id, user_id, role, status)
  values (target_community_id, v_uid, 'member', 'pending')
  on conflict (community_id, user_id) do update
    set status = case when public.community_members.status = 'active' then 'active' else 'pending' end,
        updated_at = now()
  returning * into v_row;

  return v_row;
end;
$$;
revoke execute on function public.request_to_join_public(uuid) from public, anon;
grant execute on function public.request_to_join_public(uuid) to authenticated;
