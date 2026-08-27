-- Player evaluations: per-organizer perspective for shared athletes.
--
-- public.players remains the global athlete identity (username, avatar, base
-- profile). Attribute opinions from each organizer live here, so shared athlete
-- edits do not overwrite the creator's canonical row.

create table if not exists public.player_evaluations (
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

alter table public.player_evaluations enable row level security;

grant select, insert, update, delete on public.player_evaluations to authenticated;

drop policy if exists "Community members can read player evaluations" on public.player_evaluations;
drop policy if exists "Organizers can insert own player evaluations" on public.player_evaluations;
drop policy if exists "Organizers can update own player evaluations" on public.player_evaluations;
drop policy if exists "Organizers can delete own player evaluations" on public.player_evaluations;

create policy "Community members can read player evaluations" on public.player_evaluations
  for select to authenticated
  using (
    owner_id = (select auth.uid())
    or public.current_user_can_access_player(player_id)
  );

create policy "Organizers can insert own player evaluations" on public.player_evaluations
  for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and public.current_user_can_access_player(player_id)
  );

create policy "Organizers can update own player evaluations" on public.player_evaluations
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and public.current_user_can_access_player(player_id)
  );

create policy "Organizers can delete own player evaluations" on public.player_evaluations
  for delete to authenticated
  using (owner_id = (select auth.uid()));

drop trigger if exists set_player_evaluations_updated_at on public.player_evaluations;
create trigger set_player_evaluations_updated_at
  before update on public.player_evaluations
  for each row execute function public.set_updated_at();

drop trigger if exists audit_player_evaluations on public.player_evaluations;
create trigger audit_player_evaluations
  after insert or update or delete on public.player_evaluations
  for each row execute function public.log_table_changes();
