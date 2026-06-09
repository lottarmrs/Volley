-- Backend operational sync and community membership.
-- Supabase CLI was not available in this workspace, so this migration was
-- created manually with a timestamped filename.

create unique index if not exists profiles_email_lower_unique
  on public.profiles (lower(email));

alter table public.modification_logs
  add column if not exists community_id uuid references public.communities(id) on delete set null;

create table if not exists public.community_members (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'organizer')) default 'organizer',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  unique (community_id, user_id)
);

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
  updated_at timestamptz default now() not null
);

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

create index if not exists community_members_community_id_idx on public.community_members (community_id);
create index if not exists community_members_user_id_idx on public.community_members (user_id);
create index if not exists modification_logs_community_id_idx on public.modification_logs (community_id);

create unique index if not exists communities_owner_local_id_idx on public.communities (owner_id, local_id) where local_id is not null;
create unique index if not exists players_owner_local_id_idx on public.players (owner_id, local_id) where local_id is not null;
create unique index if not exists whatsapp_templates_owner_local_id_idx on public.whatsapp_list_templates (owner_id, local_id) where local_id is not null;

create index if not exists sessions_community_id_idx on public.sessions (community_id);
create index if not exists sessions_updated_at_idx on public.sessions (updated_at);
create index if not exists sessions_deleted_at_idx on public.sessions (deleted_at);
create unique index if not exists sessions_owner_local_id_idx on public.sessions (owner_id, local_id) where local_id is not null;

create index if not exists teams_community_id_idx on public.teams (community_id);
create index if not exists teams_session_id_idx on public.teams (session_id);
create index if not exists teams_updated_at_idx on public.teams (updated_at);
create index if not exists teams_deleted_at_idx on public.teams (deleted_at);
create unique index if not exists teams_owner_local_id_idx on public.teams (owner_id, local_id) where local_id is not null;

create index if not exists games_community_id_idx on public.games (community_id);
create index if not exists games_session_id_idx on public.games (session_id);
create index if not exists games_updated_at_idx on public.games (updated_at);
create index if not exists games_deleted_at_idx on public.games (deleted_at);
create unique index if not exists games_owner_local_id_idx on public.games (owner_id, local_id) where local_id is not null;

create index if not exists point_events_community_id_idx on public.point_events (community_id);
create index if not exists point_events_session_id_idx on public.point_events (session_id);
create index if not exists point_events_updated_at_idx on public.point_events (updated_at);
create index if not exists point_events_deleted_at_idx on public.point_events (deleted_at);
create unique index if not exists point_events_owner_local_id_idx on public.point_events (owner_id, local_id) where local_id is not null;

create index if not exists game_reports_community_id_idx on public.game_reports (community_id);
create index if not exists game_reports_session_id_idx on public.game_reports (session_id);
create index if not exists game_reports_updated_at_idx on public.game_reports (updated_at);
create index if not exists game_reports_deleted_at_idx on public.game_reports (deleted_at);
create unique index if not exists game_reports_owner_local_id_idx on public.game_reports (owner_id, local_id) where local_id is not null;

create index if not exists session_reports_community_id_idx on public.session_reports (community_id);
create index if not exists session_reports_session_id_idx on public.session_reports (session_id);
create index if not exists session_reports_updated_at_idx on public.session_reports (updated_at);
create index if not exists session_reports_deleted_at_idx on public.session_reports (deleted_at);
create unique index if not exists session_reports_owner_local_id_idx on public.session_reports (owner_id, local_id) where local_id is not null;

create index if not exists community_presence_community_id_idx on public.community_presence (community_id);
create index if not exists community_presence_updated_at_idx on public.community_presence (updated_at);
create index if not exists community_presence_deleted_at_idx on public.community_presence (deleted_at);
create unique index if not exists community_presence_owner_local_id_idx on public.community_presence (owner_id, local_id) where local_id is not null;

create index if not exists whatsapp_list_drafts_community_id_idx on public.whatsapp_list_drafts (community_id);
create index if not exists whatsapp_list_drafts_updated_at_idx on public.whatsapp_list_drafts (updated_at);
create index if not exists whatsapp_list_drafts_deleted_at_idx on public.whatsapp_list_drafts (deleted_at);
create unique index if not exists whatsapp_list_drafts_owner_local_id_idx on public.whatsapp_list_drafts (owner_id, local_id) where local_id is not null;

alter table public.community_members enable row level security;
alter table public.sessions enable row level security;
alter table public.teams enable row level security;
alter table public.games enable row level security;
alter table public.point_events enable row level security;
alter table public.game_reports enable row level security;
alter table public.session_reports enable row level security;
alter table public.community_presence enable row level security;
alter table public.whatsapp_list_drafts enable row level security;

grant select, insert, update, delete on
  public.community_members,
  public.sessions,
  public.teams,
  public.games,
  public.point_events,
  public.game_reports,
  public.session_reports,
  public.community_presence,
  public.whatsapp_list_drafts
to authenticated;

grant select, insert, update, delete on
  public.communities,
  public.players,
  public.community_players,
  public.community_rules,
  public.whatsapp_list_templates
to authenticated;

grant select, update on public.profiles to authenticated;

create or replace function public.current_user_has_community_role(
  target_community_id uuid,
  allowed_roles text[] default array['owner', 'admin', 'organizer']
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.community_members cm
    where cm.community_id = target_community_id
      and cm.user_id = (select auth.uid())
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
  select exists (
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
  );
$$;

create or replace function public.current_user_shares_profile(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select target_user_id = (select auth.uid())
  or exists (
    select 1
    from public.community_members mine
    join public.community_members theirs on theirs.community_id = mine.community_id
    where mine.user_id = (select auth.uid())
      and theirs.user_id = target_user_id
  );
$$;

create or replace function public.add_community_member_by_email(
  target_community_id uuid,
  target_email text,
  target_role text default 'organizer'
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
  if target_role not in ('owner', 'admin', 'organizer') then
    raise exception 'Invalid community member role: %', target_role
      using errcode = '22023';
  end if;

  if not public.current_user_has_community_role(target_community_id, array['owner', 'admin']) then
    raise exception 'Only owners and admins can add community members'
      using errcode = '42501';
  end if;

  select p.id
    into target_user_id
  from public.profiles p
  where lower(p.email) = lower(trim(target_email))
  limit 1;

  if target_user_id is null then
    raise exception 'No registered user found for email %', target_email
      using errcode = '22023';
  end if;

  insert into public.community_members (community_id, user_id, role, created_by)
  values (target_community_id, target_user_id, target_role, (select auth.uid()))
  on conflict (community_id, user_id)
  do update set role = excluded.role, updated_at = now()
  returning * into inserted_member;

  return inserted_member;
end;
$$;

grant execute on function public.current_user_has_community_role(uuid, text[]) to authenticated;
grant execute on function public.current_user_can_access_player(uuid) to authenticated;
grant execute on function public.current_user_shares_profile(uuid) to authenticated;
grant execute on function public.add_community_member_by_email(uuid, text, text) to authenticated;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.ensure_community_owner_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.community_members (community_id, user_id, role, created_by)
  values (new.id, new.owner_id, 'owner', new.owner_id)
  on conflict (community_id, user_id) do nothing;
  return new;
end;
$$;

create or replace function public.prevent_last_community_owner_change()
returns trigger
language plpgsql
as $$
declare
  owner_count integer;
begin
  if tg_op = 'DELETE' and old.role = 'owner' then
    select count(*) into owner_count
    from public.community_members
    where community_id = old.community_id and role = 'owner';

    if owner_count <= 1 then
      raise exception 'Cannot remove the last owner from a community'
        using errcode = '23514';
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' and old.role = 'owner' and new.role <> 'owner' then
    select count(*) into owner_count
    from public.community_members
    where community_id = old.community_id and role = 'owner';

    if owner_count <= 1 then
      raise exception 'Cannot demote the last owner from a community'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists create_community_owner_member on public.communities;
create trigger create_community_owner_member
  after insert on public.communities
  for each row execute function public.ensure_community_owner_member();

drop trigger if exists prevent_last_community_owner_delete on public.community_members;
create trigger prevent_last_community_owner_delete
  before delete on public.community_members
  for each row execute function public.prevent_last_community_owner_change();

drop trigger if exists prevent_last_community_owner_update on public.community_members;
create trigger prevent_last_community_owner_update
  before update on public.community_members
  for each row execute function public.prevent_last_community_owner_change();

insert into public.community_members (community_id, user_id, role, created_by)
select id, owner_id, 'owner', owner_id
from public.communities
on conflict (community_id, user_id) do nothing;

drop policy if exists "Users can read own profile" on public.profiles;
drop policy if exists "Users can update own profile" on public.profiles;
create policy "Profiles are readable by self or shared communities" on public.profiles
  for select to authenticated
  using (public.current_user_shares_profile(id));
create policy "Users can update own profile" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

drop policy if exists "Users can read own communities" on public.communities;
drop policy if exists "Users can insert own communities" on public.communities;
drop policy if exists "Users can update own communities" on public.communities;
drop policy if exists "Users can delete own communities" on public.communities;
create policy "Community members can read communities" on public.communities
  for select to authenticated
  using (owner_id = (select auth.uid()) or public.current_user_has_community_role(id));
create policy "Users can insert owned communities" on public.communities
  for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy "Community owners and admins can update communities" on public.communities
  for update to authenticated
  using (owner_id = (select auth.uid()) or public.current_user_has_community_role(id, array['owner', 'admin']))
  with check (owner_id = (select auth.uid()) or public.current_user_has_community_role(id, array['owner', 'admin']));
create policy "Community owners and admins can delete communities" on public.communities
  for delete to authenticated
  using (owner_id = (select auth.uid()) or public.current_user_has_community_role(id, array['owner', 'admin']));

create policy "Community members can read memberships" on public.community_members
  for select to authenticated
  using (public.current_user_has_community_role(community_id));
create policy "Community owners and admins can insert memberships" on public.community_members
  for insert to authenticated
  with check (public.current_user_has_community_role(community_id, array['owner', 'admin']));
create policy "Community owners and admins can update memberships" on public.community_members
  for update to authenticated
  using (public.current_user_has_community_role(community_id, array['owner', 'admin']))
  with check (public.current_user_has_community_role(community_id, array['owner', 'admin']));
create policy "Community owners and admins can delete memberships" on public.community_members
  for delete to authenticated
  using (public.current_user_has_community_role(community_id, array['owner', 'admin']));

drop policy if exists "Users can read own players" on public.players;
drop policy if exists "Users can insert own players" on public.players;
drop policy if exists "Users can update own players" on public.players;
drop policy if exists "Users can delete own players" on public.players;
create policy "Community members can read players" on public.players
  for select to authenticated
  using (owner_id = (select auth.uid()) or public.current_user_can_access_player(id));
create policy "Users can insert owned players" on public.players
  for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy "Community members can update players" on public.players
  for update to authenticated
  using (owner_id = (select auth.uid()) or public.current_user_can_access_player(id))
  with check (owner_id = (select auth.uid()) or public.current_user_can_access_player(id));
create policy "Player owners can delete players" on public.players
  for delete to authenticated
  using (owner_id = (select auth.uid()));

drop policy if exists "Users can read own community players" on public.community_players;
drop policy if exists "Users can insert own community players" on public.community_players;
drop policy if exists "Users can update own community players" on public.community_players;
drop policy if exists "Users can delete own community players" on public.community_players;
create policy "Community members can read community players" on public.community_players
  for select to authenticated
  using (owner_id = (select auth.uid()) or public.current_user_has_community_role(community_id));
create policy "Community organizers can insert community players" on public.community_players
  for insert to authenticated
  with check (owner_id = (select auth.uid()) and public.current_user_has_community_role(community_id));
create policy "Community organizers can update community players" on public.community_players
  for update to authenticated
  using (owner_id = (select auth.uid()) or public.current_user_has_community_role(community_id))
  with check (owner_id = (select auth.uid()) or public.current_user_has_community_role(community_id));
create policy "Community organizers can delete community players" on public.community_players
  for delete to authenticated
  using (owner_id = (select auth.uid()) or public.current_user_has_community_role(community_id));

drop policy if exists "Users can read own community rules" on public.community_rules;
drop policy if exists "Users can insert own community rules" on public.community_rules;
drop policy if exists "Users can update own community rules" on public.community_rules;
drop policy if exists "Users can delete own community rules" on public.community_rules;
create policy "Community members can read community rules" on public.community_rules
  for select to authenticated
  using (owner_id = (select auth.uid()) or public.current_user_has_community_role(community_id));
create policy "Community owners and admins can insert community rules" on public.community_rules
  for insert to authenticated
  with check (owner_id = (select auth.uid()) and public.current_user_has_community_role(community_id, array['owner', 'admin']));
create policy "Community owners and admins can update community rules" on public.community_rules
  for update to authenticated
  using (owner_id = (select auth.uid()) or public.current_user_has_community_role(community_id, array['owner', 'admin']))
  with check (owner_id = (select auth.uid()) or public.current_user_has_community_role(community_id, array['owner', 'admin']));
create policy "Community owners and admins can delete community rules" on public.community_rules
  for delete to authenticated
  using (owner_id = (select auth.uid()) or public.current_user_has_community_role(community_id, array['owner', 'admin']));

drop policy if exists "Users can read own whatsapp templates" on public.whatsapp_list_templates;
drop policy if exists "Users can insert own whatsapp templates" on public.whatsapp_list_templates;
drop policy if exists "Users can update own whatsapp templates" on public.whatsapp_list_templates;
drop policy if exists "Users can delete own whatsapp templates" on public.whatsapp_list_templates;
create policy "Community members can read whatsapp templates" on public.whatsapp_list_templates
  for select to authenticated
  using (owner_id = (select auth.uid()) or public.current_user_has_community_role(community_id));
create policy "Community organizers can insert whatsapp templates" on public.whatsapp_list_templates
  for insert to authenticated
  with check (owner_id = (select auth.uid()) and public.current_user_has_community_role(community_id));
create policy "Community organizers can update whatsapp templates" on public.whatsapp_list_templates
  for update to authenticated
  using (owner_id = (select auth.uid()) or public.current_user_has_community_role(community_id))
  with check (owner_id = (select auth.uid()) or public.current_user_has_community_role(community_id));
create policy "Community organizers can delete whatsapp templates" on public.whatsapp_list_templates
  for delete to authenticated
  using (owner_id = (select auth.uid()) or public.current_user_has_community_role(community_id));

drop policy if exists "Users can read own logs" on public.modification_logs;
create policy "Community members can read modification logs" on public.modification_logs
  for select to authenticated
  using (
    owner_id = (select auth.uid())
    or (community_id is not null and public.current_user_has_community_role(community_id))
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

create or replace function public.log_table_changes()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  record_owner uuid;
  record_community uuid;
begin
  if (tg_op = 'INSERT') then
    record_owner := nullif(to_jsonb(new)->>'owner_id', '')::uuid;
    record_community := coalesce(
      nullif(to_jsonb(new)->>'community_id', '')::uuid,
      case when tg_table_name = 'communities' then new.id else null end
    );

    insert into public.modification_logs (
      owner_id, community_id, changed_by, table_name, record_id, action_type, old_data, new_data
    ) values (
      record_owner, record_community, auth.uid(), tg_table_name, new.id::text, tg_op, null, to_jsonb(new)
    );
    return new;
  elsif (tg_op = 'UPDATE') then
    record_owner := coalesce(
      nullif(to_jsonb(new)->>'owner_id', '')::uuid,
      nullif(to_jsonb(old)->>'owner_id', '')::uuid
    );
    record_community := coalesce(
      nullif(to_jsonb(new)->>'community_id', '')::uuid,
      nullif(to_jsonb(old)->>'community_id', '')::uuid,
      case when tg_table_name = 'communities' then new.id else null end
    );

    insert into public.modification_logs (
      owner_id, community_id, changed_by, table_name, record_id, action_type, old_data, new_data
    ) values (
      record_owner, record_community, auth.uid(), tg_table_name, new.id::text, tg_op, to_jsonb(old), to_jsonb(new)
    );
    return new;
  elsif (tg_op = 'DELETE') then
    record_owner := nullif(to_jsonb(old)->>'owner_id', '')::uuid;
    record_community := coalesce(
      nullif(to_jsonb(old)->>'community_id', '')::uuid,
      case when tg_table_name = 'communities' then old.id else null end
    );

    insert into public.modification_logs (
      owner_id, community_id, changed_by, table_name, record_id, action_type, old_data, new_data
    ) values (
      record_owner, record_community, auth.uid(), tg_table_name, old.id::text, tg_op, to_jsonb(old), null
    );
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists audit_sessions on public.sessions;
create trigger audit_sessions
  after insert or update or delete on public.sessions
  for each row execute function public.log_table_changes();

drop trigger if exists audit_teams on public.teams;
create trigger audit_teams
  after insert or update or delete on public.teams
  for each row execute function public.log_table_changes();

drop trigger if exists audit_games on public.games;
create trigger audit_games
  after insert or update or delete on public.games
  for each row execute function public.log_table_changes();

drop trigger if exists audit_point_events on public.point_events;
create trigger audit_point_events
  after insert or update or delete on public.point_events
  for each row execute function public.log_table_changes();

drop trigger if exists audit_game_reports on public.game_reports;
create trigger audit_game_reports
  after insert or update or delete on public.game_reports
  for each row execute function public.log_table_changes();

drop trigger if exists audit_session_reports on public.session_reports;
create trigger audit_session_reports
  after insert or update or delete on public.session_reports
  for each row execute function public.log_table_changes();

drop trigger if exists audit_community_presence on public.community_presence;
create trigger audit_community_presence
  after insert or update or delete on public.community_presence
  for each row execute function public.log_table_changes();

drop trigger if exists audit_whatsapp_list_drafts on public.whatsapp_list_drafts;
create trigger audit_whatsapp_list_drafts
  after insert or update or delete on public.whatsapp_list_drafts
  for each row execute function public.log_table_changes();

revoke execute on function public.ensure_community_owner_member() from public, anon, authenticated;
revoke execute on function public.prevent_last_community_owner_change() from public, anon, authenticated;
revoke execute on function public.log_table_changes() from public, anon, authenticated;
