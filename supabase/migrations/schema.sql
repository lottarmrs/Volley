-- Volley Cloud Database Schema
-- Paste this schema directly into the Supabase SQL Editor

-- 1. Create Profiles Table (Users)
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  email text,
  role text not null check (role in ('admin', 'organizer')) default 'organizer',
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
  local_id text,
  sync_version integer default 1 not null,
  deleted_at timestamptz,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

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
create policy "Users can insert own players" on public.players
  for insert to authenticated with check (owner_id = (select auth.uid()));
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

-- Trigger to automatically create a profile for new users on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email,
    'organizer'
  );
  return new;
end;
$$;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Revoke execution from PUBLIC, anon, and authenticated to secure SECURITY DEFINER trigger functions
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.log_table_changes() from public, anon, authenticated;
