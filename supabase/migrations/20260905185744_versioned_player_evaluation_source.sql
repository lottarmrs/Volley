-- XS-W5-01 — Versioned PlayerEvaluation source model.
--
-- GINV-CAP-002: a Community governance rank never confers the right to evaluate a Player. The
-- capability has to come from an explicit, per-person operational grant, which is why
-- public.community_capabilities has carried a comment saying player.evaluate is deliberately
-- absent. This slice supplies the source that comment anticipated.

alter table public.community_responsibilities
  drop constraint community_responsibilities_responsibility_check;

alter table public.community_responsibilities
  add constraint community_responsibilities_responsibility_check
    check (responsibility in ('ORGANIZER', 'EVALUATOR'));

create or replace function public.community_capabilities(
  target_community_id uuid,
  target_user_id uuid
)
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select c.capability
    from public.community_memberships m
    cross join lateral (
      select unnest(
        case m.role
          when 'owner' then array[
            'community.members.manage',
            'community.ownership.transfer',
            'community.profile.update',
            'community.archive'
          ]
          when 'admin' then array[
            'community.members.manage',
            'community.profile.update'
          ]
          else array[]::text[]
        end
      ) as capability
    ) c
   where m.community_id = target_community_id
     and m.user_id = target_user_id
     and m.status = 'active'

  union

  select 'session.manage'
    from public.community_responsibilities r
    join public.community_memberships m
      on m.community_id = r.community_id
     and m.user_id = r.user_id
     and m.status = 'active'
   where r.community_id = target_community_id
     and r.user_id = target_user_id
     and r.responsibility = 'ORGANIZER'
     and r.revoked_at is null

  union

  -- player.evaluate is an operational duty on the same footing: granted per person by an
  -- EVALUATOR responsibility, never derived from owner or admin rank (GINV-CAP-002).
  select 'player.evaluate'
    from public.community_responsibilities r
    join public.community_memberships m
      on m.community_id = r.community_id
     and m.user_id = r.user_id
     and m.status = 'active'
   where r.community_id = target_community_id
     and r.user_id = target_user_id
     and r.responsibility = 'EVALUATOR'
     and r.revoked_at is null;

  -- Deliberately absent, and each absence is asserted by the negative matrix:
  --   match.control      per-Match control is leased at Match time (GINV-MATCH-004),
  --                      never derived from a Community rank -- W7 owns it
  --   competition.admin  W8 owns it; an ORGANIZER is not a CompetitionAdmin
$$;

create table public.player_evaluation_contributions (
  id uuid primary key,
  community_id uuid not null references public.communities(id) on delete restrict,
  player_id uuid not null references public.players(id) on delete restrict,
  evaluator_user_id uuid references auth.users(id) on delete set null,
  rubric_version text not null,
  recorded_at timestamptz not null default pg_catalog.now(),
  superseded_at timestamptz,
  superseded_by_id uuid references public.player_evaluation_contributions(id) on delete restrict,
  command_id uuid not null unique,
  constraint player_evaluation_contributions_rubric_version_check
    check (pg_catalog.btrim(rubric_version) <> ''),
  constraint player_evaluation_contributions_supersession_check
    check ((superseded_at is null) = (superseded_by_id is null))
);

-- The invariant the slice exists for: one effective contribution per evaluator, Player and
-- Community. A constraint, not a convention -- the command is not the only thing that must
-- fail if a second effective row is attempted.
create unique index player_evaluation_contributions_effective_key
  on public.player_evaluation_contributions (community_id, player_id, evaluator_user_id)
  where superseded_at is null;

create index player_evaluation_contributions_player_idx
  on public.player_evaluation_contributions (player_id);
create index player_evaluation_contributions_evaluator_idx
  on public.player_evaluation_contributions (evaluator_user_id);

create table public.player_evaluation_dimension_scores (
  contribution_id uuid not null
    references public.player_evaluation_contributions(id) on delete restrict,
  dimension_key text not null,
  value numeric not null,
  constraint player_evaluation_dimension_scores_pkey primary key (contribution_id, dimension_key),
  constraint player_evaluation_dimension_scores_key_check
    check (pg_catalog.btrim(dimension_key) <> ''),
  constraint player_evaluation_dimension_scores_value_range_check
    check (value >= 0 and value <= 10)
);

revoke all on table public.player_evaluation_contributions from public, anon, authenticated;
alter table public.player_evaluation_contributions enable row level security;

revoke all on table public.player_evaluation_dimension_scores from public, anon, authenticated;
alter table public.player_evaluation_dimension_scores enable row level security;
