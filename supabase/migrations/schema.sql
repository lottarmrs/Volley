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
  username text constraint players_username_account_format_check check (
    username is null
    or (
      username = lower(username)
      and username ~ '^[a-z0-9][a-z0-9_-]{2,29}$'
    )
  ),
  user_id uuid references auth.users(id) on delete set null,
  local_id text,
  sync_version integer default 1 not null,
  deleted_at timestamptz,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
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
  joined_at timestamptz default now() not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  unique (community_id, player_id)
);

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
create policy "Users can delete own players" on public.players
  for delete to authenticated using (owner_id = (select auth.uid()));

-- Create Policies for Community Players
create policy "Users can read own community players" on public.community_players
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "Users can insert own community players" on public.community_players
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "Users can update own community players" on public.community_players
  for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "Users can delete own community players" on public.community_players
  for delete to authenticated using (owner_id = (select auth.uid()));

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
    insert into public.players (owner_id, user_id, name, username)
    values (v_uid, v_uid, v_name, nullif(v_username, ''))
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

  insert into public.players (owner_id, user_id, name, username)
  values (new.id, new.id, v_name, null)
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
