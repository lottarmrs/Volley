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
    check (role in ('owner', 'admin', 'moderator', 'member')),
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

revoke execute on function public.is_superadmin() from public, anon;
revoke execute on function public.is_app_staff() from public, anon;
revoke execute on function public.current_user_can_access_player(uuid) from public, anon;
revoke execute on function public.current_user_is_player_admin(uuid) from public, anon;
grant execute on function public.is_superadmin() to authenticated;
grant execute on function public.is_app_staff() to authenticated;
grant execute on function public.current_user_can_access_player(uuid) to authenticated;
grant execute on function public.current_user_is_player_admin(uuid) to authenticated;

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
  if not public.is_superadmin() then
    raise exception 'Apenas um master pode alterar papéis.' using errcode = '42501';
  end if;

  if new_role not in ('master', 'programmer', 'user') then
    raise exception 'Papel inválido: %', new_role using errcode = '22023';
  end if;

  -- Protege o último master: não permite rebaixá-lo.
  if new_role <> 'master'
     and exists (select 1 from public.profiles where id = target_user_id and role = 'master')
     and (select count(*) from public.profiles where role = 'master') <= 1 then
    raise exception 'Não é possível rebaixar o último master.' using errcode = '42501';
  end if;

  perform set_config('app.allow_role_change', 'on', true);

  update public.profiles
     set role = new_role,
         updated_at = now()
   where id = target_user_id
   returning * into updated;

  if updated.id is null then
    raise exception 'Usuário não encontrado.' using errcode = '22023';
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

create table public.player_link_proposals (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'superseded')),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists pending_link_proposal_idx
  on public.player_link_proposals (player_id, user_id) where status = 'pending';
create index if not exists player_link_proposals_player_id_idx
  on public.player_link_proposals (player_id);
create index if not exists player_link_proposals_user_id_idx
  on public.player_link_proposals (user_id);
create index if not exists player_link_proposals_status_idx
  on public.player_link_proposals (status);

create table public.player_evaluations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
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

-- Enable Row Level Security (RLS) on all tables
alter table public.profiles enable row level security;
alter table public.communities enable row level security;
alter table public.players enable row level security;
alter table public.community_players enable row level security;
alter table public.community_members enable row level security;
alter table public.player_link_proposals enable row level security;
alter table public.player_evaluations enable row level security;
alter table public.player_avatar_proposals enable row level security;
alter table public.community_rules enable row level security;
alter table public.whatsapp_list_templates enable row level security;
alter table public.modification_logs enable row level security;

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
create policy "Users can update own communities" on public.communities
  for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
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

create policy "Users can read their own link proposals" on public.player_link_proposals
  for select to authenticated using (user_id = (select auth.uid()));
create policy "Admins can read proposals for their players" on public.player_link_proposals
  for select to authenticated using (public.current_user_is_player_admin(player_id));
create policy "Users can create their own link proposals" on public.player_link_proposals
  for insert to authenticated with check (user_id = (select auth.uid()));

create policy "Community members can read player evaluations" on public.player_evaluations
  for select to authenticated using (
    owner_id = (select auth.uid())
    or public.current_user_can_access_player(player_id)
  );
create policy "Organizers can insert own player evaluations" on public.player_evaluations
  for insert to authenticated with check (
    owner_id = (select auth.uid())
    and public.current_user_can_access_player(player_id)
  );
create policy "Organizers can update own player evaluations" on public.player_evaluations
  for update to authenticated using (owner_id = (select auth.uid())) with check (
    owner_id = (select auth.uid())
    and public.current_user_can_access_player(player_id)
  );
create policy "Organizers can delete own player evaluations" on public.player_evaluations
  for delete to authenticated using (owner_id = (select auth.uid()));

create policy "Admins can read avatar proposals" on public.player_avatar_proposals
  for select to authenticated using (public.current_user_is_player_admin(player_id));

grant select, insert, update, delete on public.community_members to authenticated;
grant select on public.player_link_proposals to authenticated;
grant select, insert, update, delete on public.player_evaluations to authenticated;
grant select on public.player_avatar_proposals to authenticated;

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
  username text
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
      null::text;
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
      v_player.username;
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
begin
  insert into public.profiles (id, name, email, role)
  values (new.id, v_name, new.email, 'user')
  on conflict (id) do nothing;

  insert into public.players (
    owner_id,
    user_id,
    name,
    username,
    has_account_identity_history
  )
  values (new.id, new.id, v_name, null, true)
  on conflict (user_id) where user_id is not null do nothing;

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
create table if not exists public.player_identity_claims (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null unique references public.player_link_proposals(id) on delete restrict,
  idempotency_key uuid not null,
  user_id uuid not null references auth.users(id) on delete restrict,
  canonical_player_id uuid not null references public.players(id) on delete restrict,
  legacy_player_id uuid not null references public.players(id) on delete restrict,
  reviewed_by uuid not null references auth.users(id) on delete restrict,
  status text not null check (status in ('approved', 'conflict')),
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (idempotency_key),
  unique (legacy_player_id),
  check (canonical_player_id <> legacy_player_id)
);

create table if not exists public.player_identity_aliases (
  legacy_player_id uuid primary key references public.players(id) on delete restrict,
  legacy_local_id text,
  canonical_player_id uuid not null references public.players(id) on delete restrict,
  claim_id uuid not null unique references public.player_identity_claims(id) on delete restrict,
  created_at timestamptz not null default now(),
  check (legacy_player_id <> canonical_player_id)
);

create index if not exists player_identity_claims_user_id_idx
  on public.player_identity_claims (user_id);
create index if not exists player_identity_claims_canonical_player_id_idx
  on public.player_identity_claims (canonical_player_id);
create index if not exists player_identity_aliases_canonical_player_id_idx
  on public.player_identity_aliases (canonical_player_id);

alter table public.player_identity_claims enable row level security;
alter table public.player_identity_aliases enable row level security;

drop policy if exists "Authorized users can read player identity claims"
  on public.player_identity_claims;
create policy "Authorized users can read player identity claims"
  on public.player_identity_claims
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1
      from public.players p
      where p.id in (canonical_player_id, legacy_player_id)
        and p.owner_id = (select auth.uid())
    )
    or public.current_user_can_access_player(canonical_player_id)
    or public.current_user_can_access_player(legacy_player_id)
  );

drop policy if exists "Authorized users can read player identity aliases"
  on public.player_identity_aliases;
create policy "Authorized users can read player identity aliases"
  on public.player_identity_aliases
  for select to authenticated
  using (
    exists (
      select 1
      from public.players p
      where p.id in (canonical_player_id, legacy_player_id)
        and (
          p.user_id = (select auth.uid())
          or p.owner_id = (select auth.uid())
        )
    )
    or public.current_user_can_access_player(canonical_player_id)
    or public.current_user_can_access_player(legacy_player_id)
  );

revoke all on table public.player_identity_claims from public, anon, authenticated;
revoke all on table public.player_identity_aliases from public, anon, authenticated;
grant select on public.player_identity_claims to authenticated;
grant select on public.player_identity_aliases to authenticated;

drop policy if exists "App staff can read link proposals"
  on public.player_link_proposals;
create policy "App staff can read link proposals"
  on public.player_link_proposals
  for select to authenticated
  using (public.is_app_staff());

update public.player_link_proposals as proposal
   set status = 'superseded'
 where proposal.status = 'pending'
   and (
     exists (
       select 1
         from public.players as player
        where player.id = proposal.player_id
          and player.deleted_at is not null
     )
     or exists (
       select 1
         from public.player_identity_aliases as alias
        where alias.legacy_player_id = proposal.player_id
     )
   );

create or replace function public.guard_active_player_reference()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted_at timestamptz;
  v_has_alias boolean;
begin
  if tg_table_name = 'player_link_proposals'
     and tg_op = 'UPDATE'
     and new.player_id is not distinct from old.player_id
     and to_jsonb(new) - array['status', 'reviewed_by', 'reviewed_at', 'updated_at']
       = to_jsonb(old) - array['status', 'reviewed_by', 'reviewed_at', 'updated_at'] then
    return new;
  end if;

  select deleted_at
    into v_deleted_at
    from public.players
   where id = new.player_id
   for update;

  select exists (
    select 1
      from public.player_identity_aliases
     where legacy_player_id = new.player_id
  )
    into v_has_alias;

  if v_deleted_at is not null or v_has_alias then
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

drop trigger if exists trg_guard_active_player_reference
  on public.player_link_proposals;
create trigger trg_guard_active_player_reference
  before insert or update on public.player_link_proposals
  for each row execute function public.guard_active_player_reference();

create or replace function public.merge_player_identity_claim(
  p_proposal_id uuid,
  p_reviewer uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := (select auth.uid());
  v_lock_player_id uuid;
  v_lock_user_id uuid;
  v_player_lock bigint;
  v_user_lock bigint;
  v_proposal public.player_link_proposals%rowtype;
  v_legacy public.players%rowtype;
  v_canonical public.players%rowtype;
  v_existing_claim public.player_identity_claims%rowtype;
  v_user_id uuid;
  v_legacy_player_id uuid;
  v_canonical_player_id uuid;
  v_claim_id uuid := gen_random_uuid();
  v_result jsonb;
begin
  if v_actor is null or v_actor is distinct from p_reviewer then
    raise exception 'Reviewer must be the authenticated user' using errcode = '42501';
  end if;

  select player_id, user_id
    into v_lock_player_id, v_lock_user_id
    from public.player_link_proposals
   where id = p_proposal_id;

  if v_lock_player_id is null then
    raise exception 'Proposal not found' using errcode = '22023';
  end if;

  -- Serialize claims that share either the legacy player or the account.
  v_player_lock := hashtextextended('player:' || v_lock_player_id::text, 0);
  v_user_lock := hashtextextended('user:' || v_lock_user_id::text, 0);
  perform pg_advisory_xact_lock(least(v_player_lock, v_user_lock));
  if v_player_lock <> v_user_lock then
    perform pg_advisory_xact_lock(greatest(v_player_lock, v_user_lock));
  end if;

  select *
    into v_proposal
    from public.player_link_proposals
   where id = p_proposal_id
   for update;

  if v_proposal.player_id is distinct from v_lock_player_id
     or v_proposal.user_id is distinct from v_lock_user_id then
    raise exception 'Proposal changed while claim was starting' using errcode = '40001';
  end if;

  v_user_id := v_proposal.user_id;
  v_legacy_player_id := v_proposal.player_id;

  select *
    into v_existing_claim
    from public.player_identity_claims
   where proposal_id = v_proposal.id;

  if v_existing_claim.id is not null then
    if v_proposal.reviewed_by is distinct from p_reviewer then
      raise exception 'Claim reviewer mismatch' using errcode = '42501';
    end if;
    return v_existing_claim.result;
  end if;

  if exists (
    select 1
      from public.player_identity_aliases
     where legacy_player_id = v_legacy_player_id
  ) or exists (
    select 1
      from public.player_identity_claims
     where legacy_player_id = v_legacy_player_id
        or user_id = v_user_id
  ) then
    raise exception 'Player already claimed' using errcode = '23505';
  end if;

  select *
    into v_legacy
    from public.players
   where id = v_legacy_player_id
   for update;

  if v_legacy.id is null then
    raise exception 'Legacy player not found' using errcode = '22023';
  end if;

  if v_legacy.user_id is not null
     or v_legacy.deleted_at is not null
     or v_legacy.has_account_identity_history then
    raise exception 'Player already claimed' using errcode = '23505';
  end if;

  if v_proposal.status <> 'pending' then
    raise exception 'Proposal not pending' using errcode = '22023';
  end if;

  if not public.current_user_is_player_admin(v_legacy_player_id) then
    raise exception 'Only the athlete creator or community admins can approve a link proposal'
      using errcode = '42501';
  end if;

  select *
    into v_canonical
    from public.players
   where user_id = v_user_id
     and deleted_at is null
   order by created_at, id
   limit 1
   for update;

  if v_canonical.id is null then
    raise exception 'Canonical account player not found' using errcode = '22023';
  end if;

  if v_canonical.username is null
     or v_canonical.username <> public.normalize_account_username(v_canonical.username)
     or not public.is_valid_account_username(v_canonical.username) then
    raise exception 'Canonical account is not ready for player claim' using errcode = '22023';
  end if;

  v_canonical_player_id := v_canonical.id;

  perform 1
    from public.community_players
   where player_id in (v_canonical_player_id, v_legacy_player_id)
   order by id
   for update;
  perform 1
    from public.player_evaluations
   where player_id in (v_canonical_player_id, v_legacy_player_id)
   order by id
   for update;
  perform 1
    from public.player_avatar_proposals
   where player_id in (v_canonical_player_id, v_legacy_player_id)
   order by id
   for update;
  perform 1
    from public.player_link_proposals
   where player_id = v_legacy_player_id
      or user_id = v_user_id
   order by id
   for update;

  -- Canonical identity fields are intentionally absent from this update.
  update public.players as canonical
     set nickname = case
           when nullif(trim(canonical.nickname), '') is null then v_legacy.nickname
           else canonical.nickname
         end,
         gender = coalesce(canonical.gender, v_legacy.gender),
         height = coalesce(canonical.height, v_legacy.height),
         dominant_hand = case
           when nullif(trim(canonical.dominant_hand), '') is null then v_legacy.dominant_hand
           else canonical.dominant_hand
         end,
         primary_position = case
           when nullif(trim(canonical.primary_position), '') is null then v_legacy.primary_position
           else canonical.primary_position
         end,
         secondary_positions = case
           when coalesce(cardinality(canonical.secondary_positions), 0) = 0
             then v_legacy.secondary_positions
           else canonical.secondary_positions
         end,
         attributes = canonical.attributes || coalesce((
           select jsonb_object_agg(entry.key, entry.value)
             from jsonb_each(v_legacy.attributes) as entry
            where not canonical.attributes ? entry.key
         ), '{}'::jsonb),
         profile = canonical.profile || coalesce((
           select jsonb_object_agg(entry.key, entry.value)
             from jsonb_each(v_legacy.profile) as entry
            where not canonical.profile ? entry.key
         ), '{}'::jsonb),
         forma_atual = canonical.forma_atual || coalesce((
           select jsonb_object_agg(entry.key, entry.value)
             from jsonb_each(v_legacy.forma_atual) as entry
            where not canonical.forma_atual ? entry.key
         ), '{}'::jsonb),
         status = canonical.status || coalesce((
           select jsonb_object_agg(entry.key, entry.value)
             from jsonb_each(v_legacy.status) as entry
            where not canonical.status ? entry.key
         ), '{}'::jsonb),
         notes = case
           when nullif(trim(canonical.notes), '') is null then v_legacy.notes
           else canonical.notes
         end,
         sync_version = greatest(canonical.sync_version, v_legacy.sync_version),
         updated_at = now()
   where canonical.id = v_canonical_player_id;

  -- Membership unique (community_id, player_id): banned wins, then active.
  insert into public.community_players as canonical (
    owner_id,
    community_id,
    player_id,
    active,
    joined_at,
    created_at,
    updated_at,
    status,
    role,
    sync_version,
    deleted_at
  )
  select
    legacy.owner_id,
    legacy.community_id,
    v_canonical_player_id,
    legacy.active,
    legacy.joined_at,
    legacy.created_at,
    legacy.updated_at,
    legacy.status,
    legacy.role,
    legacy.sync_version,
    legacy.deleted_at
  from public.community_players as legacy
  where legacy.player_id = v_legacy_player_id
  on conflict (community_id, player_id) do update
    set active = case
          when canonical.status = 'banned' or excluded.status = 'banned' then false
          when canonical.status = 'active' or excluded.status = 'active' then true
          else false
        end,
        status = case
          when canonical.status = 'banned' or excluded.status = 'banned' then 'banned'
          when canonical.status = 'active' or excluded.status = 'active' then 'active'
          else 'inactive'
        end,
        role = case
          when canonical.role = 'player' then excluded.role
          else canonical.role
        end,
        joined_at = least(canonical.joined_at, excluded.joined_at),
        created_at = least(canonical.created_at, excluded.created_at),
        updated_at = greatest(canonical.updated_at, excluded.updated_at),
        sync_version = greatest(canonical.sync_version, excluded.sync_version),
        deleted_at = case
          when canonical.status <> 'banned'
           and excluded.status <> 'banned'
           and (canonical.status = 'active' or excluded.status = 'active') then null
          else coalesce(canonical.deleted_at, excluded.deleted_at)
        end;

  delete from public.community_players
   where player_id = v_legacy_player_id;

  -- Evaluation unique (owner_id, player_id): newest updated_at wins, then id.
  delete from public.player_evaluations as legacy
  using public.player_evaluations as canonical
   where legacy.player_id = v_legacy_player_id
     and canonical.player_id = v_canonical_player_id
     and canonical.owner_id = legacy.owner_id
     and (
       canonical.updated_at > legacy.updated_at
       or (canonical.updated_at = legacy.updated_at and canonical.id < legacy.id)
     );

  delete from public.player_evaluations as canonical
  using public.player_evaluations as legacy
   where canonical.player_id = v_canonical_player_id
     and legacy.player_id = v_legacy_player_id
     and canonical.owner_id = legacy.owner_id
     and (
       legacy.updated_at > canonical.updated_at
       or (legacy.updated_at = canonical.updated_at and legacy.id < canonical.id)
     );

  update public.player_evaluations
     set player_id = v_canonical_player_id
   where player_id = v_legacy_player_id;

  -- Keep one deterministic pending avatar proposal across both identities.
  with ranked_pending as (
    select
      proposal.id,
      row_number() over (
        order by proposal.created_at desc, proposal.id desc
      ) as pending_rank
    from public.player_avatar_proposals as proposal
    where proposal.player_id in (v_canonical_player_id, v_legacy_player_id)
      and proposal.status = 'pending'
  )
  update public.player_avatar_proposals as proposal
     set status = 'superseded'
    from ranked_pending as ranked
   where proposal.id = ranked.id
     and ranked.pending_rank > 1;

  update public.player_avatar_proposals
     set player_id = v_canonical_player_id
   where player_id = v_legacy_player_id;

  update public.player_link_proposals
     set status = 'approved',
         reviewed_by = p_reviewer,
         reviewed_at = now()
   where id = v_proposal.id;

  update public.player_link_proposals
     set status = 'superseded',
         reviewed_by = p_reviewer,
         reviewed_at = now()
   where (player_id = v_legacy_player_id or user_id = v_user_id)
     and status = 'pending'
     and id <> v_proposal.id;

  v_result := jsonb_build_object(
    'claim_id', v_claim_id,
    'canonical_player_id', v_canonical_player_id,
    'legacy_player_id', v_legacy_player_id,
    'legacy_local_id', v_legacy.local_id
  );

  insert into public.player_identity_claims (
    id,
    proposal_id,
    idempotency_key,
    user_id,
    canonical_player_id,
    legacy_player_id,
    reviewed_by,
    status,
    result,
    completed_at
  )
  values (
    v_claim_id,
    v_proposal.id,
    v_proposal.id,
    v_user_id,
    v_canonical_player_id,
    v_legacy_player_id,
    p_reviewer,
    'approved',
    v_result,
    now()
  );

  insert into public.player_identity_aliases (
    legacy_player_id,
    legacy_local_id,
    canonical_player_id,
    claim_id
  )
  values (
    v_legacy_player_id,
    v_legacy.local_id,
    v_canonical_player_id,
    v_claim_id
  );

  perform set_config('app.allow_user_link_promotion', 'on', true);
  update public.players
     set username = null,
         user_id = null,
         active = false,
         deleted_at = coalesce(deleted_at, now()),
         updated_at = now()
   where id = v_legacy_player_id;

  return v_result;
end;
$$;

revoke execute on function public.merge_player_identity_claim(uuid, uuid) from public, anon, authenticated;

create or replace function public.propose_player_link(
  p_player_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  v_player_lock bigint;
  v_user_lock bigint;
  v_proposal uuid;
  v_completed_result jsonb;
  v_legacy public.players%rowtype;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  v_player_lock := hashtextextended('player:' || p_player_id::text, 0);
  v_user_lock := hashtextextended('user:' || v_uid::text, 0);
  perform pg_advisory_xact_lock(least(v_player_lock, v_user_lock));
  if v_player_lock <> v_user_lock then
    perform pg_advisory_xact_lock(greatest(v_player_lock, v_user_lock));
  end if;

  select claim.proposal_id, claim.result
    into v_proposal, v_completed_result
    from public.player_identity_claims as claim
    join public.player_link_proposals as proposal on proposal.id = claim.proposal_id
   where proposal.player_id = p_player_id
     and proposal.user_id = v_uid
   order by claim.completed_at desc, claim.id
   limit 1;

  if v_proposal is not null then
    return v_proposal;
  end if;

  if exists (
    select 1
      from public.player_identity_aliases
     where legacy_player_id = p_player_id
  ) or exists (
    select 1
      from public.player_identity_claims
     where legacy_player_id = p_player_id
        or user_id = v_uid
  ) then
    raise exception 'Player already claimed' using errcode = '23505';
  end if;

  select *
    into v_legacy
    from public.players
   where id = p_player_id
   for update;

  if v_legacy.id is null then
    raise exception 'Athlete not found' using errcode = '22023';
  end if;

  if v_legacy.user_id is not null
     or v_legacy.deleted_at is not null
     or v_legacy.has_account_identity_history then
    raise exception 'Player already claimed' using errcode = '23505';
  end if;

  select id
    into v_proposal
    from public.player_link_proposals
   where player_id = p_player_id
     and user_id = v_uid
     and status = 'pending'
   order by created_at, id
   limit 1
   for update;

  if v_proposal is null then
    insert into public.player_link_proposals (player_id, user_id, status)
    values (p_player_id, v_uid, 'pending')
    on conflict (player_id, user_id) where status = 'pending'
    do update set created_at = public.player_link_proposals.created_at
    returning id into v_proposal;
  end if;

  if v_legacy.owner_id = v_uid then
    perform public.merge_player_identity_claim(v_proposal, v_uid);
  end if;

  return v_proposal;
end;
$$;

revoke execute on function public.propose_player_link(uuid) from public, anon;
grant execute on function public.propose_player_link(uuid) to authenticated;

do $$
begin
  if to_regprocedure('public.approve_player_link(uuid)') is not null then
    execute 'revoke execute on function public.approve_player_link(uuid) from public, anon, authenticated';
  end if;
end;
$$;
drop function if exists public.approve_player_link(uuid);

create or replace function public.approve_player_link(
  p_proposal_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  v_lock_player_id uuid;
  v_lock_user_id uuid;
  v_player_lock bigint;
  v_user_lock bigint;
  v_proposal public.player_link_proposals%rowtype;
  v_existing_claim public.player_identity_claims%rowtype;
  v_legacy public.players%rowtype;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select player_id, user_id
    into v_lock_player_id, v_lock_user_id
    from public.player_link_proposals
   where id = p_proposal_id;

  if v_lock_player_id is null then
    raise exception 'Proposal not found' using errcode = '22023';
  end if;

  v_player_lock := hashtextextended('player:' || v_lock_player_id::text, 0);
  v_user_lock := hashtextextended('user:' || v_lock_user_id::text, 0);
  perform pg_advisory_xact_lock(least(v_player_lock, v_user_lock));
  if v_player_lock <> v_user_lock then
    perform pg_advisory_xact_lock(greatest(v_player_lock, v_user_lock));
  end if;

  select *
    into v_proposal
    from public.player_link_proposals
   where id = p_proposal_id
   for update;

  if v_proposal.player_id is distinct from v_lock_player_id
     or v_proposal.user_id is distinct from v_lock_user_id then
    raise exception 'Proposal changed while claim was starting' using errcode = '40001';
  end if;

  select *
    into v_existing_claim
    from public.player_identity_claims
   where proposal_id = v_proposal.id;

  if v_existing_claim.id is not null then
    if v_proposal.reviewed_by is distinct from v_uid then
      raise exception 'Claim reviewer mismatch' using errcode = '42501';
    end if;
    return v_existing_claim.result;
  end if;

  if exists (
    select 1
      from public.player_identity_aliases
     where legacy_player_id = v_proposal.player_id
  ) or exists (
    select 1
      from public.player_identity_claims
     where legacy_player_id = v_proposal.player_id
        or user_id = v_proposal.user_id
  ) then
    raise exception 'Player already claimed' using errcode = '23505';
  end if;

  select *
    into v_legacy
    from public.players
   where id = v_proposal.player_id
   for update;

  if v_legacy.id is null then
    raise exception 'Legacy player not found' using errcode = '22023';
  end if;

  if v_legacy.user_id is not null
     or v_legacy.deleted_at is not null
     or v_legacy.has_account_identity_history then
    raise exception 'Player already claimed' using errcode = '23505';
  end if;

  if v_proposal.status <> 'pending' then
    raise exception 'Proposal not pending' using errcode = '22023';
  end if;

  if not public.current_user_is_player_admin(v_proposal.player_id) then
    raise exception 'Only the athlete creator or community admins can approve a link proposal'
      using errcode = '42501';
  end if;

  return public.merge_player_identity_claim(p_proposal_id, v_uid);
end;
$$;

revoke execute on function public.approve_player_link(uuid) from public, anon;
grant execute on function public.approve_player_link(uuid) to authenticated;

create or replace function public.reject_player_link(
  p_proposal_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  v_lock_player_id uuid;
  v_lock_user_id uuid;
  v_player_lock bigint;
  v_user_lock bigint;
  v_proposal public.player_link_proposals%rowtype;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select player_id, user_id
    into v_lock_player_id, v_lock_user_id
    from public.player_link_proposals
   where id = p_proposal_id;

  if v_lock_player_id is null then
    raise exception 'Proposal not found' using errcode = '22023';
  end if;

  v_player_lock := hashtextextended('player:' || v_lock_player_id::text, 0);
  v_user_lock := hashtextextended('user:' || v_lock_user_id::text, 0);
  perform pg_advisory_xact_lock(least(v_player_lock, v_user_lock));
  if v_player_lock <> v_user_lock then
    perform pg_advisory_xact_lock(greatest(v_player_lock, v_user_lock));
  end if;

  select *
    into v_proposal
    from public.player_link_proposals
   where id = p_proposal_id
   for update;

  if v_proposal.id is null
     or v_proposal.player_id is distinct from v_lock_player_id
     or v_proposal.user_id is distinct from v_lock_user_id then
    raise exception 'Proposal changed while transition was starting'
      using errcode = '40001';
  end if;

  if v_proposal.status <> 'pending' then
    raise exception 'Proposal not pending' using errcode = '22023';
  end if;

  if not public.current_user_is_player_admin(v_proposal.player_id) then
    raise exception 'Only the athlete creator or community admins can reject a link proposal'
      using errcode = '42501';
  end if;

  update public.player_link_proposals
     set status = 'rejected',
         reviewed_by = v_uid,
         reviewed_at = now()
   where id = p_proposal_id
     and status = 'pending';

  if not found then
    raise exception 'Proposal no longer pending' using errcode = '40001';
  end if;
end;
$$;

revoke execute on function public.reject_player_link(uuid) from public, anon;
grant execute on function public.reject_player_link(uuid) to authenticated;

create or replace function public.cancel_my_link_proposal(
  p_proposal_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  v_lock_player_id uuid;
  v_lock_user_id uuid;
  v_player_lock bigint;
  v_user_lock bigint;
  v_proposal public.player_link_proposals%rowtype;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select player_id, user_id
    into v_lock_player_id, v_lock_user_id
    from public.player_link_proposals
   where id = p_proposal_id;

  if v_lock_player_id is null then
    raise exception 'Proposal not found' using errcode = '22023';
  end if;

  v_player_lock := hashtextextended('player:' || v_lock_player_id::text, 0);
  v_user_lock := hashtextextended('user:' || v_lock_user_id::text, 0);
  perform pg_advisory_xact_lock(least(v_player_lock, v_user_lock));
  if v_player_lock <> v_user_lock then
    perform pg_advisory_xact_lock(greatest(v_player_lock, v_user_lock));
  end if;

  select *
    into v_proposal
    from public.player_link_proposals
   where id = p_proposal_id
   for update;

  if v_proposal.id is null
     or v_proposal.player_id is distinct from v_lock_player_id
     or v_proposal.user_id is distinct from v_lock_user_id then
    raise exception 'Proposal changed while transition was starting'
      using errcode = '40001';
  end if;

  if v_proposal.status <> 'pending' then
    raise exception 'Proposal not pending' using errcode = '22023';
  end if;

  if v_proposal.user_id is distinct from v_uid then
    raise exception 'You can only cancel your own proposal' using errcode = '42501';
  end if;

  update public.player_link_proposals
     set status = 'rejected',
         reviewed_by = v_uid,
         reviewed_at = now()
   where id = p_proposal_id
     and status = 'pending';

  if not found then
    raise exception 'Proposal no longer pending' using errcode = '40001';
  end if;
end;
$$;

revoke execute on function public.cancel_my_link_proposal(uuid) from public, anon;
grant execute on function public.cancel_my_link_proposal(uuid) to authenticated;
