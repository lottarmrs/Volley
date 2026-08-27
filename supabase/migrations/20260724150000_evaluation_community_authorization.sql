-- Ties player_evaluations writes to a specific community's owner/admin instead of any
-- community member with access to the player. Adds a genuine, isolated self-evaluation
-- table. Does not touch aggregation behavior (aggregatePlayerEvaluations is unaffected —
-- community_id exists for authorization only).

alter table public.player_evaluations
  add column community_id uuid references public.communities(id) on delete cascade;

-- Table has zero rows in production (reset earlier); safe to enforce not null directly.
alter table public.player_evaluations
  alter column community_id set not null;

drop policy if exists "Organizers can insert own player evaluations" on public.player_evaluations;
create policy "Community owner or admin can insert player evaluations"
  on public.player_evaluations
  for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and public.current_user_has_community_role(community_id, array['owner', 'admin'])
  );

drop policy if exists "Organizers can update own player evaluations" on public.player_evaluations;
create policy "Community owner or admin can update player evaluations"
  on public.player_evaluations
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and public.current_user_has_community_role(community_id, array['owner', 'admin'])
  );

drop policy if exists "Organizers can delete own player evaluations" on public.player_evaluations;
create policy "Community owner or admin can delete player evaluations"
  on public.player_evaluations
  for delete to authenticated
  using (owner_id = (select auth.uid()));

-- Read policy is unchanged — leave "Community members can read player evaluations" as-is.

create table public.self_evaluations (
  player_id uuid primary key references public.players(id) on delete cascade,
  attributes jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.self_evaluations enable row level security;

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

revoke all on table public.self_evaluations from public, anon;
grant select, insert, update on public.self_evaluations to authenticated;
