-- Championship (liga de pontos corridos multi-data): roster fixo, agendamento
-- recorrente, classificação acumulada entre várias sessões. Ver
-- docs/superpowers/specs/2026-07-24-liga-pontos-corridos-design.md.

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

alter table public.championships enable row level security;

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

revoke all on table public.championships from public, anon;
grant select, insert, update, delete on public.championships to authenticated;

create table public.championship_teams (
  id uuid primary key default gen_random_uuid(),
  championship_id uuid not null references public.championships(id) on delete cascade,
  name text not null,
  player_ids uuid[] not null default '{}',
  local_id text,
  sync_version integer default 1 not null,
  deleted_at timestamptz,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create index if not exists championship_teams_championship_id_idx
  on public.championship_teams (championship_id);

alter table public.championship_teams enable row level security;

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

revoke all on table public.championship_teams from public, anon;
grant select, insert, update, delete on public.championship_teams to authenticated;

create table public.championship_rounds (
  id uuid primary key default gen_random_uuid(),
  championship_id uuid not null references public.championships(id) on delete cascade,
  round integer not null,
  team_a_id uuid not null references public.championship_teams(id) on delete cascade,
  team_b_id uuid not null references public.championship_teams(id) on delete cascade,
  scheduled_date timestamptz not null,
  skipped boolean not null default false,
  session_id uuid references public.sessions(id) on delete set null,
  local_id text,
  sync_version integer default 1 not null,
  deleted_at timestamptz,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  unique (championship_id, round)
);

create index if not exists championship_rounds_championship_id_idx
  on public.championship_rounds (championship_id);

alter table public.championship_rounds enable row level security;

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

revoke all on table public.championship_rounds from public, anon;
grant select, insert, update, delete on public.championship_rounds to authenticated;
