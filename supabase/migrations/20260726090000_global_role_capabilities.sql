-- Capability layer for global roles. Existing is_app_staff()/is_superadmin() checks
-- are untouched; only new/rewritten checks in this plan use has_capability(). See
-- docs/superpowers/plans/2026-07-26-roles-permissions-security-hardening.md.

create table public.global_role_capabilities (
  role text not null check (role in ('master', 'programmer', 'user')),
  capability text not null,
  primary key (role, capability)
);

-- 'manage_community_ownership' is intentionally master-only: it gates
-- transfer_community_ownership (Task 2) so programmer can never become or remove a
-- community owner, per the approved design.
insert into public.global_role_capabilities (role, capability) values
  ('master', 'manage_global_roles'),
  ('master', 'manage_community_ownership'),
  ('master', 'view_all_profiles'),
  ('master', 'manage_communities_any'),
  ('programmer', 'view_all_profiles'),
  ('programmer', 'manage_communities_any')
on conflict do nothing;

alter table public.global_role_capabilities enable row level security;

create policy "Authenticated users can read global role capabilities"
  on public.global_role_capabilities
  for select to authenticated
  using (true);

revoke all on table public.global_role_capabilities from public, anon;
grant select on table public.global_role_capabilities to authenticated;

create or replace function public.has_capability(capability text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    join public.global_role_capabilities c on c.role = p.role
    where p.id = (select auth.uid())
      and c.capability = has_capability.capability
  );
$$;

revoke execute on function public.has_capability(text) from public, anon;
grant execute on function public.has_capability(text) to authenticated;
