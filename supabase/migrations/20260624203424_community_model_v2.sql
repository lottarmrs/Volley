-- ============================================================================
-- Comunidade v2 — Fundação (Fase A)
--
-- Redefine o modelo de comunidade para ser realmente usável:
--   1. Papéis renomeados e ampliados: owner/admin/organizer -> owner/admin/
--      moderator/member. 'member' é o participante comum (atleta/usuário), não
--      é staff. Labels no app: Dono / Admin / Moderador / Membro.
--   2. Filiação ganha STATUS (active/pending/invited/rejected) para suportar
--      pedidos de entrada + aprovação (Fase C). Existentes nascem 'active'.
--   3. Comunidade ganha visibility (private/public) e join_code (link/código).
--   4. Os helpers de papel passam a contar apenas membros ATIVOS e usam os
--      novos nomes; 'member' NÃO concede acesso de staff.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. community_members: papéis + status + invited_by
-- ----------------------------------------------------------------------------
do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.community_members'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%role%'
  loop
    execute format('alter table public.community_members drop constraint %I', c);
  end loop;
end $$;

update public.community_members set role = 'moderator' where role = 'organizer';

alter table public.community_members
  add constraint community_members_role_check
  check (role in ('owner', 'admin', 'moderator', 'member'));

alter table public.community_members
  add column if not exists status text not null default 'active'
  check (status in ('active', 'pending', 'invited', 'rejected'));

alter table public.community_members
  add column if not exists invited_by uuid references auth.users(id) on delete set null;

create index if not exists community_members_status_idx
  on public.community_members (community_id, status);

-- ----------------------------------------------------------------------------
-- 2. communities: visibility + join_code
-- ----------------------------------------------------------------------------
alter table public.communities
  add column if not exists visibility text not null default 'private'
  check (visibility in ('private', 'public'));

alter table public.communities add column if not exists join_code text;

create unique index if not exists communities_join_code_idx
  on public.communities (join_code) where join_code is not null;

-- ----------------------------------------------------------------------------
-- 3. Helpers de papel: novos nomes + somente membros ATIVOS
-- ----------------------------------------------------------------------------
create or replace function public.current_user_has_community_role(
  target_community_id uuid,
  allowed_roles text[] default array['owner', 'admin', 'moderator']
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_superadmin() or exists (
    select 1
    from public.community_members cm
    where cm.community_id = target_community_id
      and cm.user_id = (select auth.uid())
      and cm.status = 'active'
      and cm.role = any(allowed_roles)
  );
$$;

create or replace function public.current_user_can_access_player(target_player_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_app_staff()
  or exists (
    select 1 from public.players p
    where p.id = target_player_id
      and p.owner_id = (select auth.uid())
  )
  or exists (
    select 1
    from public.community_players cp
    join public.community_members cm on cm.community_id = cp.community_id
    where cp.player_id = target_player_id
      and cp.active = true
      and cm.user_id = (select auth.uid())
      and cm.status = 'active'
  );
$$;

create or replace function public.current_user_is_player_admin(target_player_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_superadmin()
  or exists (
    select 1 from public.players p
    where p.id = target_player_id
      and p.owner_id = (select auth.uid())
  )
  or exists (
    select 1
    from public.community_players cp
    join public.community_members cm on cm.community_id = cp.community_id
    where cp.player_id = target_player_id
      and cp.active = true
      and cm.user_id = (select auth.uid())
      and cm.status = 'active'
      and cm.role = any(array['owner', 'admin'])
  );
$$;
revoke execute on function public.current_user_is_player_admin(uuid) from public, anon;
grant execute on function public.current_user_is_player_admin(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 4. Convite direto por staff: aceitar os novos papéis
-- ----------------------------------------------------------------------------
create or replace function public.add_community_member_by_email(
  target_community_id uuid,
  target_email text,
  target_role text default 'moderator'
)
returns public.community_members
language plpgsql
security definer
set search_path = public
as $$
declare
  target_user_id uuid;
  inserted_member public.community_members;
begin
  if target_role not in ('owner', 'admin', 'moderator', 'member') then
    raise exception 'Invalid community member role: %', target_role using errcode = '22023';
  end if;

  if not (
    public.is_superadmin()
    or public.current_user_has_community_role(target_community_id, array['owner', 'admin'])
  ) then
    raise exception 'Only owners and admins can add community members' using errcode = '42501';
  end if;

  select p.id into target_user_id
  from public.profiles p
  where lower(p.email) = lower(trim(target_email))
  limit 1;

  if target_user_id is null then
    raise exception 'No registered user found for email %', target_email using errcode = '22023';
  end if;

  insert into public.community_members (community_id, user_id, role, status, created_by)
  values (target_community_id, target_user_id, target_role, 'active', (select auth.uid()))
  on conflict (community_id, user_id)
  do update set role = excluded.role, status = 'active', updated_at = now()
  returning * into inserted_member;

  return inserted_member;
end;
$$;
