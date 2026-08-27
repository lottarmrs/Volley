-- Community-level capability layer + new 'organizador' role. See
-- docs/superpowers/plans/2026-07-26-roles-permissions-security-hardening.md.

alter table public.community_members drop constraint community_members_role_check;
alter table public.community_members add constraint community_members_role_check
  check (role in ('owner', 'admin', 'moderator', 'organizador', 'member'));

create table public.community_role_capabilities (
  role text not null check (role in ('owner', 'admin', 'moderator', 'organizador', 'member')),
  capability text not null check (capability in (
    'edit_community_info', 'manage_members', 'approve_members',
    'remove_members', 'manage_sessions', 'manage_evaluations'
  )),
  primary key (role, capability)
);

insert into public.community_role_capabilities (role, capability) values
  ('owner', 'edit_community_info'), ('owner', 'manage_members'),
  ('owner', 'approve_members'), ('owner', 'remove_members'),
  ('owner', 'manage_sessions'), ('owner', 'manage_evaluations'),
  ('admin', 'edit_community_info'), ('admin', 'manage_members'),
  ('admin', 'approve_members'), ('admin', 'remove_members'),
  ('admin', 'manage_sessions'), ('admin', 'manage_evaluations'),
  ('moderator', 'approve_members'), ('moderator', 'manage_sessions'),
  ('organizador', 'manage_sessions')
on conflict do nothing;
-- 'member' intentionally has no rows: no capabilities by default.

alter table public.community_role_capabilities enable row level security;
create policy "Authenticated users can read community role capabilities"
  on public.community_role_capabilities for select to authenticated using (true);
revoke all on table public.community_role_capabilities from public, anon;
grant select on table public.community_role_capabilities to authenticated;

create table public.community_role_capability_overrides (
  community_id uuid not null references public.communities(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'moderator', 'organizador', 'member')),
  capability text not null check (capability in (
    'edit_community_info', 'manage_members', 'approve_members',
    'remove_members', 'manage_sessions', 'manage_evaluations'
  )),
  granted boolean not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  primary key (community_id, role, capability)
);

alter table public.community_role_capability_overrides enable row level security;

create policy "Community members can read overrides for their community"
  on public.community_role_capability_overrides for select to authenticated
  using (
    public.is_superadmin() or exists (
      select 1 from public.community_members cm
      where cm.community_id = community_role_capability_overrides.community_id
        and cm.user_id = (select auth.uid())
        and cm.status = 'active'
    )
  );

-- Overrides are owner-only to write, hardcoded (not routed through
-- community_has_capability itself) to avoid a self-referential capability granting
-- override-editing rights to itself.
create policy "Only community owner can write overrides"
  on public.community_role_capability_overrides for all to authenticated
  using (
    public.is_superadmin() or exists (
      select 1 from public.community_members cm
      where cm.community_id = community_role_capability_overrides.community_id
        and cm.user_id = (select auth.uid())
        and cm.status = 'active'
        and cm.role = 'owner'
    )
  )
  with check (
    public.is_superadmin() or exists (
      select 1 from public.community_members cm
      where cm.community_id = community_role_capability_overrides.community_id
        and cm.user_id = (select auth.uid())
        and cm.status = 'active'
        and cm.role = 'owner'
    )
  );

revoke all on table public.community_role_capability_overrides from public, anon;
grant select, insert, update, delete on table public.community_role_capability_overrides to authenticated;

create or replace function public.community_has_capability(
  target_community_id uuid,
  capability text
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
      and coalesce(
        (
          select o.granted
          from public.community_role_capability_overrides o
          where o.community_id = target_community_id
            and o.role = cm.role
            and o.capability = community_has_capability.capability
        ),
        exists (
          select 1 from public.community_role_capabilities c
          where c.role = cm.role and c.capability = community_has_capability.capability
        )
      )
  );
$$;

revoke execute on function public.community_has_capability(uuid, text) from public, anon;
grant execute on function public.community_has_capability(uuid, text) to authenticated;

-- Rewrite set_community_member_role / remove_community_member to use the capability
-- function instead of a hardcoded array['owner','admin']. The pre-existing guard
-- "target_member.role = 'owner' -> reject" is untouched and is what makes these two
-- RPCs unable to ever touch an owner, for anyone, including programmer/master.
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

  delete from public.community_members where id = p_member_id;
end;
$$;

-- New: master-only ownership transfer. Deliberately NOT granted to programmer (only
-- 'master' holds the 'manage_community_ownership' global capability from Task 1).
create or replace function public.transfer_community_ownership(
  p_community_id uuid,
  p_new_owner_member_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_owner public.community_members;
  new_owner public.community_members;
begin
  if not public.has_capability('manage_community_ownership') then
    raise exception 'Apenas master pode transferir a posse de uma comunidade' using errcode = '42501';
  end if;

  select * into new_owner
    from public.community_members
   where id = p_new_owner_member_id and community_id = p_community_id;
  if new_owner.id is null then
    raise exception 'Membro alvo nao encontrado nesta comunidade' using errcode = '22023';
  end if;

  select * into current_owner
    from public.community_members
   where community_id = p_community_id and role = 'owner';
  if current_owner.id is null then
    raise exception 'Comunidade sem owner atual' using errcode = '22023';
  end if;
  if current_owner.id = new_owner.id then
    raise exception 'Membro alvo ja e owner' using errcode = '22023';
  end if;

  -- Promote first so there are briefly two owners, never zero — the
  -- prevent_last_community_owner_change trigger only rejects a demote when it is the
  -- last owner row at that instant.
  update public.community_members set role = 'owner', updated_at = now()
   where id = new_owner.id;
  update public.community_members set role = 'admin', updated_at = now()
   where id = current_owner.id;
end;
$$;

revoke execute on function public.set_community_member_role(uuid, text) from public, anon;
revoke execute on function public.remove_community_member(uuid) from public, anon;
revoke execute on function public.transfer_community_ownership(uuid, uuid) from public, anon;
grant execute on function public.set_community_member_role(uuid, text) to authenticated;
grant execute on function public.remove_community_member(uuid) to authenticated;
grant execute on function public.transfer_community_ownership(uuid, uuid) to authenticated;

-- Fix the stale owner_id-only UPDATE policy: admin (and owner) can now edit
-- community info, which was previously impossible for anyone but the literal
-- creator row (owner_id), a pre-existing gap this task closes.
drop policy if exists "Users can update own communities" on public.communities;
create policy "Community capability holders can update communities"
  on public.communities for update to authenticated
  using (public.community_has_capability(id, 'edit_community_info'))
  with check (public.community_has_capability(id, 'edit_community_info'));
-- INSERT/DELETE policies on communities are intentionally untouched — not part of
-- the approved design scope.
