-- Volley Cloud Database Schema
-- Paste this schema directly into the Supabase SQL Editor

-- 1. Create Profiles Table (Users)
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  email text,
  role text not null check (role in ('master', 'programmer', 'user')) default 'user',
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- 2. Create Communities Table
create table public.communities (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  default_location text,
  default_day text,
  default_start_time text,
  default_end_time text,
  default_format text,
  color text,
  icon text,
  archived boolean default false not null,
  local_id text,
  sync_version integer default 1 not null,
  deleted_at timestamptz,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- 3. Create Players Table
create table public.players (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  nickname text,
  gender text check (gender in ('M', 'F', 'mixed', 'other')),
  height numeric,
  dominant_hand text,
  primary_position text,
  secondary_positions text[] default '{}'::text[],
  active boolean default true not null,
  attributes jsonb default '{}'::jsonb not null,
  profile jsonb default '{}'::jsonb not null,
  forma_atual jsonb default '{}'::jsonb not null,
  status jsonb default '{}'::jsonb not null,
  notes text,
  avatar_url text,
  username text constraint players_username_account_format_check check (
    username is null
    or (
      username = lower(username)
      and username ~ '^[a-z0-9][a-z0-9_-]{2,29}$'
    )
  ),
  user_id uuid references auth.users(id) on delete set null,
  has_account_identity_history boolean default false not null,
  local_id text,
  sync_version integer default 1 not null,
  deleted_at timestamptz,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  constraint players_account_identity_history_check
    check (user_id is null or has_account_identity_history)
);

create unique index if not exists players_username_lower_idx
  on public.players (lower(username));

create unique index if not exists players_user_id_unique_idx
  on public.players (user_id)
  where user_id is not null;

-- 4. Create Community Players Vínculo Table
create table public.community_players (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  community_id uuid not null references public.communities(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  active boolean default true not null,
  status text default 'active' not null check (status in ('active', 'inactive', 'banned')),
  role text default 'player' not null check (role in ('owner', 'admin', 'player', 'guest')),
  sync_version integer default 1 not null,
  deleted_at timestamptz,
  joined_at timestamptz default now() not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  unique (community_id, player_id)
);

create table public.community_members (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member'
    check (role in ('owner', 'admin', 'moderator', 'organizador', 'member')),
  status text not null default 'active'
    check (status in ('active', 'pending', 'invited', 'rejected')),
  created_by uuid references public.profiles(id) on delete set null,
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  unique (community_id, user_id)
);

create index if not exists community_members_community_id_idx
  on public.community_members (community_id);
create index if not exists community_members_user_id_idx
  on public.community_members (user_id);
create index if not exists community_members_status_idx
  on public.community_members (community_id, status);

create or replace function public.is_superadmin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and role = 'master'
  );
$$;

create or replace function public.is_app_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and role in ('master', 'programmer')
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
    select 1
    from public.players p
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
    select 1
    from public.players p
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

revoke execute on function public.is_superadmin() from public, anon;
revoke execute on function public.is_app_staff() from public, anon;
revoke execute on function public.current_user_can_access_player(uuid) from public, anon;
revoke execute on function public.current_user_is_player_admin(uuid) from public, anon;
revoke execute on function public.current_user_has_community_role(uuid, text[]) from public, anon;
grant execute on function public.is_superadmin() to authenticated;
grant execute on function public.is_app_staff() to authenticated;
grant execute on function public.current_user_can_access_player(uuid) to authenticated;
grant execute on function public.current_user_is_player_admin(uuid) to authenticated;
grant execute on function public.current_user_has_community_role(uuid, text[]) to authenticated;

-- Capability layer for global roles. Existing is_app_staff()/is_superadmin() checks
-- above are untouched; only new/rewritten checks use has_capability(). See
-- docs/superpowers/plans/2026-07-26-roles-permissions-security-hardening.md.

create table public.global_role_capabilities (
  role text not null check (role in ('master', 'programmer', 'user')),
  capability text not null,
  primary key (role, capability)
);

-- 'manage_community_ownership' is intentionally master-only.
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

-- Community-level capability layer + 'organizador' role. See
-- docs/superpowers/plans/2026-07-26-roles-permissions-security-hardening.md.

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

-- PRE-FLIGHT CORRECTION (decidida antes da execução): 'admin' entra aqui.
-- O texto original desta task exigia aal2 em set_community_member_role e
-- remove_community_member, mas só obrigava MFA para master/programmer/owner —
-- e o seed de capabilities dá manage_members/remove_members ao admin. Um admin
-- nunca seria mandado enrolar TOTP, nunca chegaria a aal2, e toda chamada dele
-- a essas duas RPCs falharia com 42501 para sempre. Incluir 'admin' fecha a
-- contradição mantendo as quatro RPCs sob require_aal2().
create or replace function public.account_requires_aal2(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (
      select 1 from public.profiles
      where id = p_uid and role in ('master', 'programmer')
    )
    or exists (
      select 1 from public.community_members
      where user_id = p_uid and role in ('owner', 'admin') and status = 'active'
    );
$$;

revoke execute on function public.account_requires_aal2(uuid) from public, anon;
grant execute on function public.account_requires_aal2(uuid) to authenticated;

-- AAL2 enforcement at the DB layer for sensitive role/ownership RPCs, independent of
-- client-side gating (per "Operacoes administrativas sensiveis exigem aal2 no banco",
-- docs/superpowers/specs/2026-07-22-scalable-product-restructure-design.md).
create or replace function public.require_aal2()
returns void
language plpgsql
stable
set search_path = public
as $$
begin
  if coalesce((select auth.jwt() ->> 'aal'), '') <> 'aal2' then
    raise exception 'Esta operacao exige verificacao em duas etapas (AAL2).' using errcode = '42501';
  end if;
end;
$$;

revoke execute on function public.require_aal2() from public, anon;
grant execute on function public.require_aal2() to authenticated;

-- Member-management RPCs, capability-gated. The "target_member.role = 'owner' ->
-- reject" guard is what makes these two unable to ever touch an owner, for anyone,
-- including programmer/master.
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

  delete from public.community_members where id = p_member_id;
end;
$$;

-- Master-only ownership transfer. Deliberately NOT granted to programmer (only
-- 'master' holds the 'manage_community_ownership' global capability).
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
  perform public.require_aal2();

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

drop policy if exists "App staff can read all profiles" on public.profiles;
create policy "App staff can read all profiles" on public.profiles
  for select to authenticated
  using (public.is_app_staff());

create or replace function public.guard_profile_role()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.role is distinct from old.role
     and coalesce(current_setting('app.allow_role_change', true), '') <> 'on' then
    raise exception 'O papel só pode ser alterado por um administrador (master).'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function public.guard_profile_role() from public, anon, authenticated;

drop trigger if exists trg_guard_profile_role on public.profiles;
create trigger trg_guard_profile_role
  before update on public.profiles
  for each row execute function public.guard_profile_role();

create or replace function public.set_user_role(
  target_user_id uuid,
  new_role text
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  updated public.profiles;
begin
  perform public.require_aal2();

  if not public.is_superadmin() then
    raise exception 'Apenas um master pode alterar papeis.' using errcode = '42501';
  end if;

  if new_role not in ('master', 'programmer', 'user') then
    raise exception 'Papel invalido: %', new_role using errcode = '22023';
  end if;

  if new_role <> 'master'
     and exists (select 1 from public.profiles where id = target_user_id and role = 'master')
     and (select count(*) from public.profiles where role = 'master') <= 1 then
    raise exception 'Nao e possivel rebaixar o ultimo master.' using errcode = '42501';
  end if;

  perform set_config('app.allow_role_change', 'on', true);

  update public.profiles
     set role = new_role,
         updated_at = now()
   where id = target_user_id
   returning * into updated;

  if updated.id is null then
    raise exception 'Usuario nao encontrado.' using errcode = '22023';
  end if;

  return updated;
end;
$$;

revoke execute on function public.set_user_role(uuid, text) from public, anon;
grant execute on function public.set_user_role(uuid, text) to authenticated;

create or replace function public.guard_avatar_url()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.avatar_url is distinct from old.avatar_url
     and coalesce(current_setting('app.allow_avatar_promotion', true), '') <> 'on' then
    raise exception 'avatar_url can only be changed through the avatar approval flow'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function public.guard_avatar_url() from public, anon, authenticated;

drop trigger if exists trg_guard_avatar_url on public.players;
create trigger trg_guard_avatar_url
  before update on public.players
  for each row execute function public.guard_avatar_url();

create table public.player_evaluations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  community_id uuid not null references public.communities(id) on delete cascade,
  attributes jsonb default '{}'::jsonb not null,
  profile jsonb default '{}'::jsonb not null,
  status jsonb default '{}'::jsonb not null,
  notes text,
  local_id text,
  sync_version integer default 1 not null,
  deleted_at timestamptz,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create unique index if not exists player_evaluations_owner_player_idx
  on public.player_evaluations (owner_id, player_id);
create index if not exists player_evaluations_player_id_idx
  on public.player_evaluations (player_id);
create index if not exists player_evaluations_updated_at_idx
  on public.player_evaluations (updated_at);
create index if not exists player_evaluations_deleted_at_idx
  on public.player_evaluations (deleted_at);

create table public.player_avatar_proposals (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  proposed_by uuid not null references auth.users(id) on delete cascade,
  image_url text not null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'superseded')),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists player_avatar_proposals_player_status_idx
  on public.player_avatar_proposals (player_id, status);
create index if not exists player_avatar_proposals_pending_idx
  on public.player_avatar_proposals (player_id) where status = 'pending';

create table public.self_evaluations (
  player_id uuid primary key references public.players(id) on delete cascade,
  attributes jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Championship (liga de pontos corridos multi-data): roster fixo, agendamento
-- recorrente, classificação acumulada entre várias sessões.
create table public.championships (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  community_id uuid not null references public.communities(id) on delete cascade,
  name text not null,
  format text not null check (format in ('round_robin', 'double_round_robin')),
  classification_points jsonb not null default '{"win": 3, "loss": 0}'::jsonb,
  recurrence_days_of_week int[] not null,
  recurrence_time text not null,
  recurrence_start_date date not null,
  recurrence_end_date date,
  local_id text,
  sync_version integer default 1 not null,
  deleted_at timestamptz,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create index if not exists championships_community_id_idx
  on public.championships (community_id);

create table public.championship_teams (
  id uuid primary key default gen_random_uuid(),
  championship_id uuid not null references public.championships(id) on delete cascade,
  name text not null,
  player_ids uuid[] not null default '{}',
  local_id text,
  sync_version integer default 1 not null,
  deleted_at timestamptz,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  unique (championship_id, id)
);

create index if not exists championship_teams_championship_id_idx
  on public.championship_teams (championship_id);

alter table if exists public.teams
  add column if not exists championship_team_id uuid
    references public.championship_teams(id) on delete set null;

create index if not exists teams_championship_team_id_idx
  on public.teams (championship_team_id);

create table public.championship_rounds (
  id uuid primary key default gen_random_uuid(),
  championship_id uuid not null references public.championships(id) on delete cascade,
  round integer not null,
  team_a_id uuid not null,
  team_b_id uuid not null,
  scheduled_date timestamptz not null,
  skipped boolean not null default false,
  session_id uuid references public.sessions(id) on delete set null,
  local_id text not null,
  sync_version integer default 1 not null,
  deleted_at timestamptz,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  unique (championship_id, local_id),
  check (team_a_id <> team_b_id),
  foreign key (championship_id, team_a_id)
    references public.championship_teams(championship_id, id) on delete cascade,
  foreign key (championship_id, team_b_id)
    references public.championship_teams(championship_id, id) on delete cascade
);

create index if not exists championship_rounds_championship_id_idx
  on public.championship_rounds (championship_id);

create or replace function public.validate_championship_round_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  championship_community_id uuid;
  session_community_id uuid;
begin
  if new.session_id is null then
    return new;
  end if;

  select community_id into championship_community_id
  from public.championships where id = new.championship_id;

  select community_id into session_community_id
  from public.sessions where id = new.session_id;

  if championship_community_id is null
     or session_community_id is distinct from championship_community_id then
    raise exception 'championship round session must belong to the championship community'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.validate_championship_round_scope() from public, anon, authenticated;

create trigger validate_championship_round_scope_trigger
before insert or update of championship_id, session_id
on public.championship_rounds
for each row execute function public.validate_championship_round_scope();

-- 5. Create Community Rules Table
create table public.community_rules (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  community_id uuid not null references public.communities(id) on delete cascade,
  default_format text,
  default_location text,
  default_day text,
  default_start_time text,
  default_end_time text,
  free_play_rules jsonb default '{}'::jsonb not null,
  tournament_rules jsonb default '{}'::jsonb not null,
  balance_weights jsonb default '{}'::jsonb not null,
  default_team_names text[] default '{}'::text[],
  default_team_colors text[] default '{}'::text[],
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  unique (community_id)
);

-- 6. Create WhatsApp List Templates Table
create table public.whatsapp_list_templates (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  community_id uuid not null references public.communities(id) on delete cascade,
  name text not null,
  title text not null,
  category text,
  default_location text,
  default_start_time text,
  default_end_time text,
  default_value numeric,
  pix_key text,
  pix_holder text,
  pix_bank text,
  payment_deadline text,
  payment_note text,
  setters_count integer default 3 not null,
  main_slots_count integer default 18 not null,
  reserve_slots_count integer default 4 not null,
  setters_section_title text default 'LEVANTADORES' not null,
  reserve_section_title text default 'CONVIDADOS/RESERVAS' not null,
  show_lock_icon boolean default true not null,
  payment_symbol text default '✅' not null,
  extra_text text,
  local_id text,
  deleted_at timestamptz,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- 7. Create Modification Logs (Audit) Table
create table public.modification_logs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete set null,
  changed_by uuid references auth.users(id) on delete set null,
  table_name text not null,
  record_id text not null,
  action_type text not null check (action_type in ('INSERT', 'UPDATE', 'DELETE')),
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz default now() not null
);

-- 8. Create Sessions Table
create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  community_id uuid references public.communities(id) on delete cascade,
  name text not null,
  date date not null,
  location text,
  notes text,
  status text not null,
  type text not null check (type in ('tournament', 'free_play')),
  selected_player_ids text[] default '{}'::text[] not null,
  team_ids text[] default '{}'::text[] not null,
  config jsonb default '{}'::jsonb not null,
  local_id text,
  sync_version integer default 1 not null,
  deleted_at timestamptz,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create index if not exists sessions_community_id_idx on public.sessions (community_id);
create index if not exists sessions_updated_at_idx on public.sessions (updated_at);
create index if not exists sessions_deleted_at_idx on public.sessions (deleted_at);
create unique index if not exists sessions_owner_local_id_idx on public.sessions (owner_id, local_id);

-- 9. Create Teams Table
create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  community_id uuid references public.communities(id) on delete cascade,
  session_id uuid not null references public.sessions(id) on delete cascade,
  name text not null,
  color text,
  player_ids text[] default '{}'::text[] not null,
  generated_by_algorithm boolean default false not null,
  locked boolean default false not null,
  strength_snapshot jsonb default '{}'::jsonb not null,
  local_id text,
  sync_version integer default 1 not null,
  deleted_at timestamptz,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create index if not exists teams_community_id_idx on public.teams (community_id);
create index if not exists teams_session_id_idx on public.teams (session_id);
create index if not exists teams_updated_at_idx on public.teams (updated_at);
create index if not exists teams_deleted_at_idx on public.teams (deleted_at);
create unique index if not exists teams_owner_local_id_idx on public.teams (owner_id, local_id);

-- 10. Create Games Table
create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  community_id uuid references public.communities(id) on delete cascade,
  session_id uuid not null references public.sessions(id) on delete cascade,
  type text not null check (type in ('tournament', 'free_play')),
  sequence_number integer not null,
  round integer,
  stage text,
  group_id text,
  team_a_id text not null,
  team_b_id text not null,
  score_a integer default 0 not null,
  score_b integer default 0 not null,
  winner_team_id text,
  loser_team_id text,
  status text not null,
  started_at timestamptz,
  finished_at timestamptz,
  finish_reason text,
  point_ids text[] default '{}'::text[] not null,
  metadata jsonb default '{}'::jsonb not null,
  local_id text,
  sync_version integer default 1 not null,
  deleted_at timestamptz,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create index if not exists games_community_id_idx on public.games (community_id);
create index if not exists games_session_id_idx on public.games (session_id);
create index if not exists games_updated_at_idx on public.games (updated_at);
create index if not exists games_deleted_at_idx on public.games (deleted_at);
create unique index if not exists games_owner_local_id_idx on public.games (owner_id, local_id);

-- 11. Create Point Events Table
create table if not exists public.point_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  community_id uuid references public.communities(id) on delete cascade,
  session_id uuid not null references public.sessions(id) on delete cascade,
  game_id text not null,
  sequence_number integer not null,
  scoring_team_id text not null,
  conceding_team_id text not null,
  player_id text,
  reason text,
  score_before jsonb default '{}'::jsonb not null,
  score_after jsonb default '{}'::jsonb not null,
  occurred_at timestamptz not null,
  local_id text,
  sync_version integer default 1 not null,
  deleted_at timestamptz,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  point_type text,
  skill text,
  fault text,
  player_team_id text,
  event_kind text not null default 'point',
  assist_player_id text
);

create index if not exists point_events_community_id_idx on public.point_events (community_id);
create index if not exists point_events_session_id_idx on public.point_events (session_id);
create index if not exists point_events_updated_at_idx on public.point_events (updated_at);
create index if not exists point_events_deleted_at_idx on public.point_events (deleted_at);
create unique index if not exists point_events_owner_local_id_idx on public.point_events (owner_id, local_id);

-- 12. Create Game Reports Table
create table if not exists public.game_reports (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  community_id uuid references public.communities(id) on delete cascade,
  session_id uuid not null references public.sessions(id) on delete cascade,
  game_id text not null,
  sequence_number integer not null,
  generated_at timestamptz not null,
  report jsonb default '{}'::jsonb not null,
  local_id text,
  sync_version integer default 1 not null,
  deleted_at timestamptz,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create index if not exists game_reports_community_id_idx on public.game_reports (community_id);
create index if not exists game_reports_session_id_idx on public.game_reports (session_id);
create index if not exists game_reports_updated_at_idx on public.game_reports (updated_at);
create index if not exists game_reports_deleted_at_idx on public.game_reports (deleted_at);
create unique index if not exists game_reports_owner_local_id_idx on public.game_reports (owner_id, local_id);

-- 13. Create Session Reports Table
create table if not exists public.session_reports (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  community_id uuid references public.communities(id) on delete cascade,
  session_id uuid not null references public.sessions(id) on delete cascade,
  generated_at timestamptz not null,
  report jsonb default '{}'::jsonb not null,
  local_id text,
  sync_version integer default 1 not null,
  deleted_at timestamptz,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create index if not exists session_reports_community_id_idx on public.session_reports (community_id);
create index if not exists session_reports_session_id_idx on public.session_reports (session_id);
create index if not exists session_reports_updated_at_idx on public.session_reports (updated_at);
create index if not exists session_reports_deleted_at_idx on public.session_reports (deleted_at);
create unique index if not exists session_reports_owner_local_id_idx on public.session_reports (owner_id, local_id);

-- 14. Create Community Presence Table
create table if not exists public.community_presence (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  community_id uuid not null references public.communities(id) on delete cascade,
  date date not null,
  items jsonb default '[]'::jsonb not null,
  local_id text,
  sync_version integer default 1 not null,
  deleted_at timestamptz,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  unique (community_id, date)
);

create index if not exists community_presence_community_id_idx on public.community_presence (community_id);
create index if not exists community_presence_updated_at_idx on public.community_presence (updated_at);
create index if not exists community_presence_deleted_at_idx on public.community_presence (deleted_at);
create unique index if not exists community_presence_owner_local_id_idx on public.community_presence (owner_id, local_id);

-- 15. Create WhatsApp List Drafts Table
create table if not exists public.whatsapp_list_drafts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  community_id uuid not null references public.communities(id) on delete cascade,
  template_id text,
  title text not null,
  date date not null,
  location text,
  start_time text,
  end_time text,
  value numeric,
  pix_key text,
  pix_holder text,
  pix_bank text,
  payment_deadline text,
  payment_note text,
  setters jsonb default '[]'::jsonb not null,
  main_slots jsonb default '[]'::jsonb not null,
  reserve_slots jsonb default '[]'::jsonb not null,
  setters_section_title text not null,
  reserve_section_title text not null,
  show_lock_icon boolean default true not null,
  payment_symbol text default '✅' not null,
  extra_text text,
  local_id text,
  sync_version integer default 1 not null,
  deleted_at timestamptz,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create index if not exists whatsapp_list_drafts_community_id_idx on public.whatsapp_list_drafts (community_id);
create index if not exists whatsapp_list_drafts_updated_at_idx on public.whatsapp_list_drafts (updated_at);
create index if not exists whatsapp_list_drafts_deleted_at_idx on public.whatsapp_list_drafts (deleted_at);
create unique index if not exists whatsapp_list_drafts_owner_local_id_idx on public.whatsapp_list_drafts (owner_id, local_id);

-- Enable Row Level Security (RLS) on all tables
alter table public.profiles enable row level security;
alter table public.communities enable row level security;
alter table public.players enable row level security;
alter table public.community_players enable row level security;
alter table public.community_members enable row level security;
alter table public.player_evaluations enable row level security;
alter table public.player_avatar_proposals enable row level security;
alter table public.self_evaluations enable row level security;
alter table public.championships enable row level security;
alter table public.championship_teams enable row level security;
alter table public.championship_rounds enable row level security;
alter table public.community_rules enable row level security;
alter table public.whatsapp_list_templates enable row level security;
alter table public.modification_logs enable row level security;
alter table public.sessions enable row level security;
alter table public.teams enable row level security;
alter table public.games enable row level security;
alter table public.point_events enable row level security;
alter table public.game_reports enable row level security;
alter table public.session_reports enable row level security;
alter table public.community_presence enable row level security;
alter table public.whatsapp_list_drafts enable row level security;

-- Create Policies for Profiles
create policy "Users can read own profile" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "Users can update own profile" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Create Policies for Communities
create policy "Users can read own communities" on public.communities
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "Users can insert own communities" on public.communities
  for insert to authenticated with check (owner_id = (select auth.uid()));
-- UPDATE is capability-gated (not owner_id-only), so per-community capability
-- overrides actually govern who can edit community info.
create policy "Community capability holders can update communities" on public.communities
  for update to authenticated
  using (public.community_has_capability(id, 'edit_community_info'))
  with check (public.community_has_capability(id, 'edit_community_info'));
create policy "Users can delete own communities" on public.communities
  for delete to authenticated using (owner_id = (select auth.uid()));

-- Create Policies for Players
create policy "Users can read own players" on public.players
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "Linked users can read their own player" on public.players
  for select to authenticated using (
    user_id = (select auth.uid())
    and deleted_at is null
  );
create policy "Users can insert unlinked owned players" on public.players
  for insert to authenticated with check (
    owner_id = (select auth.uid())
    and user_id is null
  );
create policy "Users can update own players" on public.players
  for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "Users can delete owned legacy players" on public.players
  for delete to authenticated using (
    owner_id = (select auth.uid())
    and not has_account_identity_history
  );

-- Create Policies for Community Players
create policy "Users can read own community players" on public.community_players
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "Users can insert own community players" on public.community_players
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "Users can update own community players" on public.community_players
  for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "Users can delete own community players" on public.community_players
  for delete to authenticated using (owner_id = (select auth.uid()));

create policy "Users can read their own membership" on public.community_members
  for select to authenticated using (user_id = (select auth.uid()));

create policy "Community members can read player evaluations" on public.player_evaluations
  for select to authenticated using (
    owner_id = (select auth.uid())
    or public.current_user_can_access_player(player_id)
  );
create policy "Community owner or admin can insert player evaluations"
  on public.player_evaluations
  for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and public.current_user_has_community_role(community_id, array['owner', 'admin'])
  );
create policy "Community owner or admin can update player evaluations"
  on public.player_evaluations
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and public.current_user_has_community_role(community_id, array['owner', 'admin'])
  );
create policy "Community owner or admin can delete player evaluations"
  on public.player_evaluations
  for delete to authenticated
  using (owner_id = (select auth.uid()));

create policy "Admins can read avatar proposals" on public.player_avatar_proposals
  for select to authenticated using (public.current_user_is_player_admin(player_id));

create policy "Players can read their own self-evaluation"
  on public.self_evaluations
  for select to authenticated
  using (
    exists (
      select 1 from public.players p
      where p.id = self_evaluations.player_id
        and p.user_id = (select auth.uid())
    )
  );
create policy "Players can upsert their own self-evaluation"
  on public.self_evaluations
  for insert to authenticated
  with check (
    exists (
      select 1 from public.players p
      where p.id = self_evaluations.player_id
        and p.user_id = (select auth.uid())
    )
  );
create policy "Players can update their own self-evaluation"
  on public.self_evaluations
  for update to authenticated
  using (
    exists (
      select 1 from public.players p
      where p.id = self_evaluations.player_id
        and p.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.players p
      where p.id = self_evaluations.player_id
        and p.user_id = (select auth.uid())
    )
  );

create policy "Community members can read championships"
  on public.championships
  for select to authenticated
  using (public.current_user_has_community_role(community_id));
create policy "Community owner or admin can insert championships"
  on public.championships
  for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and public.current_user_has_community_role(community_id, array['owner', 'admin'])
  );
create policy "Community owner or admin can update championships"
  on public.championships
  for update to authenticated
  using (public.current_user_has_community_role(community_id, array['owner', 'admin']))
  with check (public.current_user_has_community_role(community_id, array['owner', 'admin']));
create policy "Community owner or admin can delete championships"
  on public.championships
  for delete to authenticated
  using (public.current_user_has_community_role(community_id, array['owner', 'admin']));

create policy "Community members can read championship teams"
  on public.championship_teams
  for select to authenticated
  using (
    exists (
      select 1 from public.championships c
      where c.id = championship_teams.championship_id
        and public.current_user_has_community_role(c.community_id)
    )
  );
create policy "Community owner or admin can insert championship teams"
  on public.championship_teams
  for insert to authenticated
  with check (
    exists (
      select 1 from public.championships c
      where c.id = championship_teams.championship_id
        and public.current_user_has_community_role(c.community_id, array['owner', 'admin'])
    )
  );
create policy "Community owner or admin can update championship teams"
  on public.championship_teams
  for update to authenticated
  using (
    exists (
      select 1 from public.championships c
      where c.id = championship_teams.championship_id
        and public.current_user_has_community_role(c.community_id, array['owner', 'admin'])
    )
  )
  with check (
    exists (
      select 1 from public.championships c
      where c.id = championship_teams.championship_id
        and public.current_user_has_community_role(c.community_id, array['owner', 'admin'])
    )
  );
create policy "Community owner or admin can delete championship teams"
  on public.championship_teams
  for delete to authenticated
  using (
    exists (
      select 1 from public.championships c
      where c.id = championship_teams.championship_id
        and public.current_user_has_community_role(c.community_id, array['owner', 'admin'])
    )
  );

create policy "Community members can read championship rounds"
  on public.championship_rounds
  for select to authenticated
  using (
    exists (
      select 1 from public.championships c
      where c.id = championship_rounds.championship_id
        and public.current_user_has_community_role(c.community_id)
    )
  );
create policy "Community owner or admin can insert championship rounds"
  on public.championship_rounds
  for insert to authenticated
  with check (
    exists (
      select 1 from public.championships c
      where c.id = championship_rounds.championship_id
        and public.current_user_has_community_role(c.community_id, array['owner', 'admin'])
    )
  );
create policy "Community owner or admin can update championship rounds"
  on public.championship_rounds
  for update to authenticated
  using (
    exists (
      select 1 from public.championships c
      where c.id = championship_rounds.championship_id
        and public.current_user_has_community_role(c.community_id, array['owner', 'admin'])
    )
  )
  with check (
    exists (
      select 1 from public.championships c
      where c.id = championship_rounds.championship_id
        and public.current_user_has_community_role(c.community_id, array['owner', 'admin'])
    )
  );
create policy "Community owner or admin can delete championship rounds"
  on public.championship_rounds
  for delete to authenticated
  using (
    exists (
      select 1 from public.championships c
      where c.id = championship_rounds.championship_id
        and public.current_user_has_community_role(c.community_id, array['owner', 'admin'])
    )
  );

create policy "Community members can read sessions" on public.sessions
  for select to authenticated
  using (owner_id = (select auth.uid()) or (community_id is not null and public.current_user_has_community_role(community_id)));
create policy "Community organizers can insert sessions" on public.sessions
  for insert to authenticated
  with check (owner_id = (select auth.uid()) and (community_id is null or public.current_user_has_community_role(community_id)));
create policy "Community organizers can update sessions" on public.sessions
  for update to authenticated
  using (owner_id = (select auth.uid()) or (community_id is not null and public.current_user_has_community_role(community_id)))
  with check (owner_id = (select auth.uid()) or (community_id is not null and public.current_user_has_community_role(community_id)));
create policy "Community organizers can delete sessions" on public.sessions
  for delete to authenticated
  using (owner_id = (select auth.uid()) or (community_id is not null and public.current_user_has_community_role(community_id)));

create policy "Community members can read teams" on public.teams
  for select to authenticated
  using (owner_id = (select auth.uid()) or (community_id is not null and public.current_user_has_community_role(community_id)));
create policy "Community organizers can insert teams" on public.teams
  for insert to authenticated
  with check (owner_id = (select auth.uid()) and (community_id is null or public.current_user_has_community_role(community_id)));
create policy "Community organizers can update teams" on public.teams
  for update to authenticated
  using (owner_id = (select auth.uid()) or (community_id is not null and public.current_user_has_community_role(community_id)))
  with check (owner_id = (select auth.uid()) or (community_id is not null and public.current_user_has_community_role(community_id)));
create policy "Community organizers can delete teams" on public.teams
  for delete to authenticated
  using (owner_id = (select auth.uid()) or (community_id is not null and public.current_user_has_community_role(community_id)));

create policy "Community members can read games" on public.games
  for select to authenticated
  using (owner_id = (select auth.uid()) or (community_id is not null and public.current_user_has_community_role(community_id)));
create policy "Community organizers can insert games" on public.games
  for insert to authenticated
  with check (owner_id = (select auth.uid()) and (community_id is null or public.current_user_has_community_role(community_id)));
create policy "Community organizers can update games" on public.games
  for update to authenticated
  using (owner_id = (select auth.uid()) or (community_id is not null and public.current_user_has_community_role(community_id)))
  with check (owner_id = (select auth.uid()) or (community_id is not null and public.current_user_has_community_role(community_id)));
create policy "Community organizers can delete games" on public.games
  for delete to authenticated
  using (owner_id = (select auth.uid()) or (community_id is not null and public.current_user_has_community_role(community_id)));

create policy "Community members can read point events" on public.point_events
  for select to authenticated
  using (owner_id = (select auth.uid()) or (community_id is not null and public.current_user_has_community_role(community_id)));
create policy "Community organizers can insert point events" on public.point_events
  for insert to authenticated
  with check (owner_id = (select auth.uid()) and (community_id is null or public.current_user_has_community_role(community_id)));
create policy "Community organizers can update point events" on public.point_events
  for update to authenticated
  using (owner_id = (select auth.uid()) or (community_id is not null and public.current_user_has_community_role(community_id)))
  with check (owner_id = (select auth.uid()) or (community_id is not null and public.current_user_has_community_role(community_id)));
create policy "Community organizers can delete point events" on public.point_events
  for delete to authenticated
  using (owner_id = (select auth.uid()) or (community_id is not null and public.current_user_has_community_role(community_id)));

create policy "Community members can read game reports" on public.game_reports
  for select to authenticated
  using (owner_id = (select auth.uid()) or (community_id is not null and public.current_user_has_community_role(community_id)));
create policy "Community organizers can insert game reports" on public.game_reports
  for insert to authenticated
  with check (owner_id = (select auth.uid()) and (community_id is null or public.current_user_has_community_role(community_id)));
create policy "Community organizers can update game reports" on public.game_reports
  for update to authenticated
  using (owner_id = (select auth.uid()) or (community_id is not null and public.current_user_has_community_role(community_id)))
  with check (owner_id = (select auth.uid()) or (community_id is not null and public.current_user_has_community_role(community_id)));
create policy "Community organizers can delete game reports" on public.game_reports
  for delete to authenticated
  using (owner_id = (select auth.uid()) or (community_id is not null and public.current_user_has_community_role(community_id)));

create policy "Community members can read session reports" on public.session_reports
  for select to authenticated
  using (owner_id = (select auth.uid()) or (community_id is not null and public.current_user_has_community_role(community_id)));
create policy "Community organizers can insert session reports" on public.session_reports
  for insert to authenticated
  with check (owner_id = (select auth.uid()) and (community_id is null or public.current_user_has_community_role(community_id)));
create policy "Community organizers can update session reports" on public.session_reports
  for update to authenticated
  using (owner_id = (select auth.uid()) or (community_id is not null and public.current_user_has_community_role(community_id)))
  with check (owner_id = (select auth.uid()) or (community_id is not null and public.current_user_has_community_role(community_id)));
create policy "Community organizers can delete session reports" on public.session_reports
  for delete to authenticated
  using (owner_id = (select auth.uid()) or (community_id is not null and public.current_user_has_community_role(community_id)));

create policy "Community members can read presence" on public.community_presence
  for select to authenticated
  using (owner_id = (select auth.uid()) or public.current_user_has_community_role(community_id));
create policy "Community organizers can insert presence" on public.community_presence
  for insert to authenticated
  with check (owner_id = (select auth.uid()) and public.current_user_has_community_role(community_id));
create policy "Community organizers can update presence" on public.community_presence
  for update to authenticated
  using (owner_id = (select auth.uid()) or public.current_user_has_community_role(community_id))
  with check (owner_id = (select auth.uid()) or public.current_user_has_community_role(community_id));
create policy "Community organizers can delete presence" on public.community_presence
  for delete to authenticated
  using (owner_id = (select auth.uid()) or public.current_user_has_community_role(community_id));

create policy "Community members can read whatsapp drafts" on public.whatsapp_list_drafts
  for select to authenticated
  using (owner_id = (select auth.uid()) or public.current_user_has_community_role(community_id));
create policy "Community organizers can insert whatsapp drafts" on public.whatsapp_list_drafts
  for insert to authenticated
  with check (owner_id = (select auth.uid()) and public.current_user_has_community_role(community_id));
create policy "Community organizers can update whatsapp drafts" on public.whatsapp_list_drafts
  for update to authenticated
  using (owner_id = (select auth.uid()) or public.current_user_has_community_role(community_id))
  with check (owner_id = (select auth.uid()) or public.current_user_has_community_role(community_id));
create policy "Community organizers can delete whatsapp drafts" on public.whatsapp_list_drafts
  for delete to authenticated
  using (owner_id = (select auth.uid()) or public.current_user_has_community_role(community_id));

grant select, insert, update, delete on public.community_members to authenticated;
grant select, insert, update, delete on public.player_evaluations to authenticated;
grant select, insert, update, delete on
  public.sessions,
  public.teams,
  public.games,
  public.point_events,
  public.game_reports,
  public.session_reports,
  public.community_presence,
  public.whatsapp_list_drafts
to authenticated;
grant select on public.player_avatar_proposals to authenticated;
revoke all on table public.self_evaluations from public, anon;
grant select, insert, update on public.self_evaluations to authenticated;
revoke all on table public.championships from public, anon;
grant select, insert, update, delete on public.championships to authenticated;
revoke all on table public.championship_teams from public, anon;
grant select, insert, update, delete on public.championship_teams to authenticated;
revoke all on table public.championship_rounds from public, anon;
grant select, insert, update, delete on public.championship_rounds to authenticated;

-- Create Policies for Community Rules
create policy "Users can read own community rules" on public.community_rules
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "Users can insert own community rules" on public.community_rules
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "Users can update own community rules" on public.community_rules
  for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "Users can delete own community rules" on public.community_rules
  for delete to authenticated using (owner_id = (select auth.uid()));

-- Create Policies for WhatsApp List Templates
create policy "Users can read own whatsapp templates" on public.whatsapp_list_templates
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "Users can insert own whatsapp templates" on public.whatsapp_list_templates
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "Users can update own whatsapp templates" on public.whatsapp_list_templates
  for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "Users can delete own whatsapp templates" on public.whatsapp_list_templates
  for delete to authenticated using (owner_id = (select auth.uid()));

-- Create Policies for Modification Logs
create policy "Users can read own logs" on public.modification_logs
  for select to authenticated using (owner_id = (select auth.uid()));
-- Note: modification_logs has no insert/update/delete policies since it is populated via triggers running under SECURITY DEFINER

-- Trigger function for audit logging of table changes
create or replace function public.log_table_changes()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  record_owner uuid;
begin
  record_owner := coalesce(
    (to_jsonb(new)->>'owner_id')::uuid,
    (to_jsonb(old)->>'owner_id')::uuid
  );

  if (tg_op = 'INSERT') then
    insert into public.modification_logs (
      owner_id,
      changed_by,
      table_name,
      record_id,
      action_type,
      old_data,
      new_data
    ) values (
      record_owner,
      auth.uid(),
      tg_table_name,
      new.id::text,
      tg_op,
      null,
      to_jsonb(new)
    );
    return new;
  elsif (tg_op = 'UPDATE') then
    insert into public.modification_logs (
      owner_id,
      changed_by,
      table_name,
      record_id,
      action_type,
      old_data,
      new_data
    ) values (
      record_owner,
      auth.uid(),
      tg_table_name,
      new.id::text,
      tg_op,
      to_jsonb(old),
      to_jsonb(new)
    );
    return new;
  elsif (tg_op = 'DELETE') then
    insert into public.modification_logs (
      owner_id,
      changed_by,
      table_name,
      record_id,
      action_type,
      old_data,
      new_data
    ) values (
      record_owner,
      auth.uid(),
      tg_table_name,
      old.id::text,
      tg_op,
      to_jsonb(old),
      null
    );
    return old;
  end if;
  return null;
end;
$$;

-- Attach audit log triggers to tables
create trigger audit_communities
  after insert or update or delete on public.communities
  for each row execute function public.log_table_changes();

create trigger audit_players
  after insert or update or delete on public.players
  for each row execute function public.log_table_changes();

create trigger audit_community_players
  after insert or update or delete on public.community_players
  for each row execute function public.log_table_changes();

create trigger audit_community_rules
  after insert or update or delete on public.community_rules
  for each row execute function public.log_table_changes();

create trigger audit_whatsapp_list_templates
  after insert or update or delete on public.whatsapp_list_templates
  for each row execute function public.log_table_changes();

create trigger audit_sessions
  after insert or update or delete on public.sessions
  for each row execute function public.log_table_changes();

create trigger audit_teams
  after insert or update or delete on public.teams
  for each row execute function public.log_table_changes();

create trigger audit_games
  after insert or update or delete on public.games
  for each row execute function public.log_table_changes();

create trigger audit_point_events
  after insert or update or delete on public.point_events
  for each row execute function public.log_table_changes();

create trigger audit_game_reports
  after insert or update or delete on public.game_reports
  for each row execute function public.log_table_changes();

create trigger audit_session_reports
  after insert or update or delete on public.session_reports
  for each row execute function public.log_table_changes();

create trigger audit_community_presence
  after insert or update or delete on public.community_presence
  for each row execute function public.log_table_changes();

create trigger audit_whatsapp_list_drafts
  after insert or update or delete on public.whatsapp_list_drafts
  for each row execute function public.log_table_changes();

create or replace function public.guard_player_user_id()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.user_id is distinct from old.user_id
     and coalesce(current_setting('app.allow_user_link_promotion', true), '') <> 'on'
     and not (
       new.deleted_at is not null
       and old.deleted_at is null
       and new.user_id is null
     ) then
    raise exception 'user_id can only be changed through the player link approval flow'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function public.handle_player_soft_delete_user_unlink()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    new.user_id := null;
  end if;
  return new;
end;
$$;

create or replace function public.guard_player_account_identity_history()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.has_account_identity_history
     and (
       not new.has_account_identity_history
       or new.user_id is distinct from old.user_id
       or new.deleted_at is not null
     ) then
    raise exception 'Canonical account identity is immutable'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function public.guard_player_account_identity_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.has_account_identity_history then
    raise exception 'Canonical account identity cannot be deleted'
      using errcode = '42501';
  end if;
  return old;
end;
$$;

revoke execute on function public.guard_player_user_id() from public, anon, authenticated;
revoke execute on function public.handle_player_soft_delete_user_unlink() from public, anon, authenticated;
revoke execute on function public.guard_player_account_identity_history() from public, anon, authenticated;
revoke execute on function public.guard_player_account_identity_delete()
  from public, anon, authenticated;

-- PostgreSQL fires same-event triggers by name: guard first, then forced unlink.
create trigger trg_guard_player_account_identity_history
  before update on public.players
  for each row execute function public.guard_player_account_identity_history();

create trigger trg_guard_player_account_identity_delete
  before delete on public.players
  for each row execute function public.guard_player_account_identity_delete();

create trigger trg_guard_player_user_id
  before update on public.players
  for each row execute function public.guard_player_user_id();

create trigger trg_player_soft_delete_user_unlink
  before update on public.players
  for each row execute function public.handle_player_soft_delete_user_unlink();

create or replace function public.unlink_player_user(
  p_player_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  raise exception 'Canonical account identity is immutable; unlink is unsupported'
    using errcode = '0A000';
end;
$$;

revoke execute on function public.unlink_player_user(uuid) from public, anon;
grant execute on function public.unlink_player_user(uuid) to authenticated;

create or replace function public.normalize_account_username(value text)
returns text
language sql
immutable
set search_path = public
as $$
  select lower(trim(value));
$$;

create or replace function public.is_valid_account_username(value text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select public.normalize_account_username(value) ~ '^[a-z0-9][a-z0-9_-]{2,29}$';
$$;

create or replace function public.ensure_account_ready(p_username text default null)
returns table (
  state text,
  profile_id uuid,
  profile_name text,
  profile_email text,
  profile_role text,
  profile_created_at timestamptz,
  profile_updated_at timestamptz,
  player_id uuid,
  username text,
  requires_aal2 boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  v_email text;
  v_name text;
  v_username text := public.normalize_account_username(p_username);
  v_profile public.profiles%rowtype;
  v_player public.players%rowtype;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select email, coalesce(raw_user_meta_data->>'name', split_part(email, '@', 1))
    into v_email, v_name
    from auth.users
   where id = v_uid;

  insert into public.profiles (id, name, email, role)
  values (v_uid, v_name, v_email, 'user')
  on conflict (id) do update
    set email = excluded.email,
        updated_at = now();

  select * into v_profile from public.profiles where id = v_uid;

  select * into v_player
    from public.players
   where user_id = v_uid and deleted_at is null
   order by created_at
   limit 1
   for update;

  if nullif(v_username, '') is not null
     and not public.is_valid_account_username(v_username) then
    raise exception 'Invalid username' using errcode = '22023';
  end if;

  if v_player.id is null then
    insert into public.players (
      owner_id,
      user_id,
      name,
      username,
      has_account_identity_history
    )
    values (v_uid, v_uid, v_name, nullif(v_username, ''), true)
    on conflict (user_id) where user_id is not null
    do update set updated_at = now()
    returning * into v_player;
  elsif (
    v_player.username is null
    or v_player.username <> public.normalize_account_username(v_player.username)
    or not public.is_valid_account_username(v_player.username)
  ) and nullif(v_username, '') is not null then
    if not public.is_valid_account_username(v_username) then
      raise exception 'Invalid username' using errcode = '22023';
    end if;
    update public.players
       set username = v_username, updated_at = now()
     where id = v_player.id
     returning * into v_player;
  end if;

  if v_player.username is null
     or v_player.username <> public.normalize_account_username(v_player.username)
     or not public.is_valid_account_username(v_player.username) then
    return query select
      'needs_username'::text,
      v_profile.id,
      v_profile.name,
      v_profile.email,
      v_profile.role,
      v_profile.created_at,
      v_profile.updated_at,
      v_player.id,
      null::text,
      public.account_requires_aal2(v_uid);
  else
    return query select
      'ready'::text,
      v_profile.id,
      v_profile.name,
      v_profile.email,
      v_profile.role,
      v_profile.created_at,
      v_profile.updated_at,
      v_player.id,
      v_player.username,
      public.account_requires_aal2(v_uid);
  end if;
exception
  when unique_violation then
    raise exception 'Username unavailable' using errcode = '23505';
end;
$$;

revoke execute on function public.ensure_account_ready(text) from public, anon;
grant execute on function public.ensure_account_ready(text) to authenticated;

-- Trigger to automatically create a profile and canonical player for new users on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1));
  v_username text := public.normalize_account_username(new.raw_user_meta_data->>'username');
  v_claim_code text := upper(trim(new.raw_user_meta_data->>'claim_code'));
  v_claimed_player_id uuid;
begin
  insert into public.profiles (id, name, email, role)
  values (new.id, v_name, new.email, 'user')
  on conflict (id) do nothing;

  if nullif(v_claim_code, '') is not null then
    select player_id into v_claimed_player_id
      from public.player_claim_codes
     where code = v_claim_code
     for update;

    if v_claimed_player_id is not null then
      perform set_config('app.allow_user_link_promotion', 'on', true);

      update public.players
         set user_id = new.id,
             owner_id = new.id,
             has_account_identity_history = true,
             updated_at = now()
       where id = v_claimed_player_id
         and user_id is null;

      if found then
        delete from public.player_claim_codes where player_id = v_claimed_player_id;
      else
        v_claimed_player_id := null;
      end if;
    end if;
  end if;

  if v_claimed_player_id is null then
    insert into public.players (
      owner_id,
      user_id,
      name,
      username,
      has_account_identity_history
    )
    values (new.id, new.id, v_name, null, true)
    on conflict (user_id) where user_id is not null do nothing;
  end if;

  if public.is_valid_account_username(v_username) then
    begin
      update public.players
         set username = v_username,
             updated_at = now()
       where user_id = new.id
         and deleted_at is null
         and username is null;
    exception
      when unique_violation then
        null;
    end;
  end if;

  return new;
end;
$$;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Revoke execution from PUBLIC, anon, and authenticated to secure SECURITY DEFINER trigger functions
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.log_table_changes() from public, anon, authenticated;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke execute on function public.set_updated_at() from public, anon, authenticated;

create trigger set_player_evaluations_updated_at
  before update on public.player_evaluations
  for each row execute function public.set_updated_at();

create trigger audit_player_evaluations
  after insert or update or delete on public.player_evaluations
  for each row execute function public.log_table_changes();

create or replace function public.guard_active_player_reference()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted_at timestamptz;
begin
  select deleted_at
    into v_deleted_at
    from public.players
   where id = new.player_id
   for update;

  if v_deleted_at is not null then
    raise exception 'Player reference must target an active canonical player'
      using errcode = '23503';
  end if;

  return new;
end;
$$;

revoke execute on function public.guard_active_player_reference()
  from public, anon, authenticated;

drop trigger if exists trg_guard_active_player_reference
  on public.community_players;
create trigger trg_guard_active_player_reference
  before insert or update on public.community_players
  for each row execute function public.guard_active_player_reference();

drop trigger if exists trg_guard_active_player_reference
  on public.player_evaluations;
create trigger trg_guard_active_player_reference
  before insert or update on public.player_evaluations
  for each row execute function public.guard_active_player_reference();

drop trigger if exists trg_guard_active_player_reference
  on public.player_avatar_proposals;
create trigger trg_guard_active_player_reference
  before insert or update on public.player_avatar_proposals
  for each row execute function public.guard_active_player_reference();

create table if not exists public.player_claim_codes (
  player_id uuid primary key references public.players(id) on delete cascade,
  code text not null unique,
  created_at timestamptz not null default now()
);

alter table public.player_claim_codes enable row level security;

drop policy if exists "Owner or staff can read claim codes" on public.player_claim_codes;
create policy "Owner or staff can read claim codes"
  on public.player_claim_codes
  for select to authenticated
  using (
    exists (
      select 1 from public.players p
      where p.id = player_claim_codes.player_id
        and p.owner_id = (select auth.uid())
    )
    or public.is_app_staff()
  );

revoke all on table public.player_claim_codes from public, anon, authenticated;
grant select on public.player_claim_codes to authenticated;

create or replace function public.generate_player_claim_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
begin
  if new.user_id is not null then
    return new;
  end if;

  loop
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    exit when not exists (
      select 1 from public.player_claim_codes where code = v_code
    );
  end loop;

  insert into public.player_claim_codes (player_id, code)
  values (new.id, v_code);

  return new;
end;
$$;

revoke execute on function public.generate_player_claim_code()
  from public, anon, authenticated;

drop trigger if exists trg_generate_player_claim_code on public.players;
create trigger trg_generate_player_claim_code
  after insert on public.players
  for each row execute function public.generate_player_claim_code();
