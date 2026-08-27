-- ============================================================================
-- Comunidade v2 — Sistema de Entrada (Fase C, backend)
--
-- Entrada por LINK/CÓDIGO + PEDIDO/APROVAÇÃO (comunidades privadas):
--   * generate_join_code / disable_join_code  -> dono/admin gerenciam o código.
--   * find_community_by_code                   -> preview pra quem tem o código.
--   * request_to_join_community                -> cria filiação status='pending'.
--   * approve_join_request / reject_join_request -> dono/admin decidem.
--   * leave_community                          -> membro sai (owner não sai).
--
-- Todas as RPCs são SECURITY DEFINER (contornam RLS de forma controlada).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. Auto-leitura: um membro sempre enxerga a PRÓPRIA filiação (mesmo pending)
-- ----------------------------------------------------------------------------
drop policy if exists "Users can read their own membership" on public.community_members;
create policy "Users can read their own membership" on public.community_members
  for select to authenticated
  using (user_id = (select auth.uid()));

-- ----------------------------------------------------------------------------
-- 1. Código de convite
-- ----------------------------------------------------------------------------
create or replace function public.generate_join_code(target_community_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
begin
  if not (public.is_superadmin()
          or public.current_user_has_community_role(target_community_id, array['owner', 'admin'])) then
    raise exception 'Apenas dono/admin podem gerenciar o código de convite' using errcode = '42501';
  end if;

  loop
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    exit when not exists (select 1 from public.communities where join_code = v_code);
  end loop;

  update public.communities
     set join_code = v_code, updated_at = now()
   where id = target_community_id;

  return v_code;
end;
$$;
revoke execute on function public.generate_join_code(uuid) from public, anon;
grant execute on function public.generate_join_code(uuid) to authenticated;

create or replace function public.disable_join_code(target_community_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (public.is_superadmin()
          or public.current_user_has_community_role(target_community_id, array['owner', 'admin'])) then
    raise exception 'Apenas dono/admin podem gerenciar o código de convite' using errcode = '42501';
  end if;
  update public.communities set join_code = null, updated_at = now() where id = target_community_id;
end;
$$;
revoke execute on function public.disable_join_code(uuid) from public, anon;
grant execute on function public.disable_join_code(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 2. Preview por código (qualquer autenticado com o código)
-- ----------------------------------------------------------------------------
create or replace function public.find_community_by_code(p_code text)
returns table (id uuid, name text, description text, member_count bigint, my_status text)
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
  where c.join_code = upper(trim(p_code)) and c.deleted_at is null
  limit 1;
$$;
revoke execute on function public.find_community_by_code(text) from public, anon;
grant execute on function public.find_community_by_code(text) to authenticated;

-- ----------------------------------------------------------------------------
-- 3. Pedido de entrada (cria filiação pending; re-pedido reativa de rejected)
-- ----------------------------------------------------------------------------
create or replace function public.request_to_join_community(p_code text)
returns public.community_members
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := (select auth.uid());
  v_comm uuid;
  v_row  public.community_members;
begin
  if v_uid is null then
    raise exception 'Não autenticado' using errcode = '42501';
  end if;

  select id into v_comm
  from public.communities
  where join_code = upper(trim(p_code)) and deleted_at is null
  limit 1;

  if v_comm is null then
    raise exception 'Código de convite inválido' using errcode = '22023';
  end if;

  insert into public.community_members (community_id, user_id, role, status)
  values (v_comm, v_uid, 'member', 'pending')
  on conflict (community_id, user_id) do update
    set status = case when public.community_members.status = 'active' then 'active' else 'pending' end,
        updated_at = now()
  returning * into v_row;

  return v_row;
end;
$$;
revoke execute on function public.request_to_join_community(text) from public, anon;
grant execute on function public.request_to_join_community(text) to authenticated;

-- ----------------------------------------------------------------------------
-- 4. Aprovar / rejeitar pedido (dono/admin)
-- ----------------------------------------------------------------------------
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
    raise exception 'Solicitação não encontrada' using errcode = '22023';
  end if;
  if not (public.is_superadmin()
          or public.current_user_has_community_role(v_comm, array['owner', 'admin'])) then
    raise exception 'Apenas dono/admin podem aprovar solicitações' using errcode = '42501';
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
    raise exception 'Solicitação não encontrada' using errcode = '22023';
  end if;
  if not (public.is_superadmin()
          or public.current_user_has_community_role(v_comm, array['owner', 'admin'])) then
    raise exception 'Apenas dono/admin podem rejeitar solicitações' using errcode = '42501';
  end if;

  update public.community_members
     set status = 'rejected', updated_at = now()
   where id = p_member_id;
end;
$$;
revoke execute on function public.reject_join_request(uuid) from public, anon;
grant execute on function public.reject_join_request(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 5. Sair da comunidade (membro comum/admin/moderador; owner não sai)
-- ----------------------------------------------------------------------------
create or replace function public.leave_community(target_community_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'Não autenticado' using errcode = '42501';
  end if;
  delete from public.community_members
   where community_id = target_community_id
     and user_id = v_uid
     and role <> 'owner';
end;
$$;
revoke execute on function public.leave_community(uuid) from public, anon;
grant execute on function public.leave_community(uuid) to authenticated;
