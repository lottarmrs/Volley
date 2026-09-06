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

-- The command below supersedes the previous effective contribution by setting its
-- superseded_by_id to the new contribution's id in one UPDATE, then inserts that new row
-- afterwards -- the new row does not exist yet at the moment the UPDATE runs. A NOT
-- DEFERRABLE foreign key checks the referencing UPDATE immediately and raises 23503 for
-- exactly this ordering, so the existence check on this self-reference must move to commit
-- time (deferred), which is unrelated to and does not weaken the ON DELETE RESTRICT action
-- that still fires immediately if a superseded row is ever targeted for deletion.
alter table public.player_evaluation_contributions
  drop constraint player_evaluation_contributions_superseded_by_id_fkey,
  add constraint player_evaluation_contributions_superseded_by_id_fkey
    foreign key (superseded_by_id) references public.player_evaluation_contributions(id)
    on delete restrict deferrable initially deferred;

create function public.record_player_evaluation(
  p_command_id uuid,
  p_contribution_id uuid,
  p_community_id uuid,
  p_player_id uuid,
  p_rubric_version text,
  p_dimensions jsonb
)
returns table (
  contribution_id uuid,
  superseded_contribution_id uuid,
  dimension_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_receipt jsonb;
  v_result jsonb;
  v_superseded uuid;
  v_count integer;
begin
  if p_command_id is null
     or p_contribution_id is null
     or p_community_id is null
     or p_player_id is null then
    raise exception 'command_id, contribution_id, community_id and player_id are required'
      using errcode = '23514';
  end if;

  -- Load-bearing despite the discarded result: find_command_receipt raises 23505 when this command
  -- id already belongs to another aggregate or command type, and that collision must surface before
  -- any row lock. The replay itself happens after authorization below, so a caller whose capability
  -- was revoked cannot read back an earlier result.
  v_receipt := app_private.find_command_receipt(
    p_command_id,
    'record_player_evaluation',
    p_contribution_id
  );

  v_uid := (select auth.uid());
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  -- The Player row is the narrowest row two concurrent submissions share. Without this lock a
  -- double click reads one effective contribution twice, both calls try to supersede it, and the
  -- second insert collides with the partial unique index as a raw 23505 -- a code reserved here for
  -- command id collisions. Locking the Community row instead would serialize every evaluation in
  -- the Community for no added safety.
  perform 1 from public.players p where p.id = p_player_id for update;
  if not found then
    raise exception 'Player not found' using errcode = 'P0002';
  end if;

  if not exists (select 1 from public.communities c where c.id = p_community_id) then
    raise exception 'Community not found' using errcode = 'P0002';
  end if;

  if not public.current_user_has_community_capability(p_community_id, 'player.evaluate') then
    raise exception 'Not authorized to evaluate Players in this Community'
      using errcode = '42501';
  end if;

  v_receipt := app_private.find_command_receipt(
    p_command_id,
    'record_player_evaluation',
    p_contribution_id
  );
  if v_receipt is not null then
    return query
      select
        (v_receipt->>'contribution_id')::uuid,
        (v_receipt->>'superseded_contribution_id')::uuid,
        (v_receipt->>'dimension_count')::integer;
    return;
  end if;

  if not app_private.registration_player_standing_alive(p_community_id, p_player_id) then
    raise exception 'Player has no living roster standing in this Community'
      using errcode = '23514';
  end if;

  if nullif(pg_catalog.btrim(coalesce(p_rubric_version, '')), '') is null then
    raise exception 'Rubric version is required' using errcode = '23514';
  end if;

  if p_dimensions is null
     or pg_catalog.jsonb_typeof(p_dimensions) <> 'object'
     or p_dimensions = '{}'::jsonb then
    raise exception 'At least one dimension score is required' using errcode = '23514';
  end if;

  -- Two passes on purpose: the range test casts each value to numeric, which would raise a raw
  -- 22P02 on a non-numeric value, so every value must be proven numeric first.
  if exists (
    select 1
      from pg_catalog.jsonb_each(p_dimensions) d
     where pg_catalog.btrim(d.key) = ''
        or pg_catalog.jsonb_typeof(d.value) <> 'number'
  ) then
    raise exception 'Dimension keys must be non-blank and scores must be numbers'
      using errcode = '23514';
  end if;

  if exists (
    select 1
      from pg_catalog.jsonb_each(p_dimensions) d
     where (d.value)::numeric < 0
        or (d.value)::numeric > 10
  ) then
    raise exception 'Dimension scores must be between 0 and 10' using errcode = '23514';
  end if;

  -- Supersede before inserting: the partial unique index permits exactly one effective row, so the
  -- reverse order would collide with the row being replaced.
  update public.player_evaluation_contributions
     set superseded_at = pg_catalog.now(),
         superseded_by_id = p_contribution_id
   where community_id = p_community_id
     and player_id = p_player_id
     and evaluator_user_id = v_uid
     and superseded_at is null
  returning id into v_superseded;

  insert into public.player_evaluation_contributions (
    id, community_id, player_id, evaluator_user_id, rubric_version, command_id
  ) values (
    p_contribution_id,
    p_community_id,
    p_player_id,
    v_uid,
    pg_catalog.btrim(p_rubric_version),
    p_command_id
  );

  insert into public.player_evaluation_dimension_scores (contribution_id, dimension_key, value)
  select p_contribution_id, d.key, (d.value)::numeric
    from pg_catalog.jsonb_each(p_dimensions) d;

  get diagnostics v_count = row_count;

  v_result := pg_catalog.jsonb_build_object(
    'contribution_id', p_contribution_id,
    'superseded_contribution_id', v_superseded,
    'dimension_count', v_count
  );
  perform app_private.record_command_receipt(
    p_command_id,
    v_uid,
    'record_player_evaluation',
    p_contribution_id,
    v_result,
    'PLAYER_EVALUATION'
  );

  return query select p_contribution_id, v_superseded, v_count;
end;
$$;

revoke all on function public.record_player_evaluation(uuid, uuid, uuid, uuid, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.record_player_evaluation(uuid, uuid, uuid, uuid, text, jsonb)
  to authenticated;

-- I1 (final review, XS-W5-01): public.reset_product_data enumerates the tables the reset deletes
-- and already lists player_evaluations and self_evaluations, but predates this slice's two new
-- tables. player_evaluation_contributions.player_id and .community_id are both `on delete
-- restrict`, so once any contribution exists the whole reset aborts with 23503. This
-- `create or replace` reproduces the last definition (20260801120000_reset_product_data_preserve_
-- canonical.sql) verbatim and adds only the two new deletes, children before parents, in the same
-- place the legacy evaluation tables are cleared.
create or replace function public.reset_product_data(target_account_uuid text)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.has_capability('reset_product_data') then
    raise exception 'Not authorized: missing reset_product_data capability';
  end if;
  perform public.require_aal2();

  -- Allow last-owner guard bypass for the duration of this transaction only.
  -- security definer: a flag vive na transacao do caller do reset.
  perform set_config('app.allow_reset_bypass', 'on', true);

  -- Children-first referential order
  delete from public.point_events;
  delete from public.games;
  delete from public.teams;
  delete from public.sessions;
  delete from public.championship_rounds;
  delete from public.championship_teams;
  delete from public.championships;
  -- Marcos vivem em career_events com type = 'milestone'; nao ha tabela separada.
  delete from public.career_events;
  delete from public.player_evaluations;
  delete from public.self_evaluations;
  -- XS-W5-01: children before parents -- both reference players and communities `on delete
  -- restrict`, so they must be gone before the players/communities deletes below run.
  delete from public.player_evaluation_dimension_scores;
  delete from public.player_evaluation_contributions;
  delete from public.community_players;
  delete from public.whatsapp_list_drafts;
  delete from public.community_presence;
  delete from public.game_reports;
  delete from public.session_reports;
  -- Preserva o player canonico da conta (has_account_identity_history = true).
  -- Ver constraint players_account_identity_history_check.
  delete from public.players
   where owner_id = target_account_uuid::uuid
     and not has_account_identity_history;
  delete from public.communities where owner_id = target_account_uuid::uuid;
end;
$$;

revoke all on function public.reset_product_data(text) from public, anon, authenticated;
grant execute on function public.reset_product_data(text) to authenticated;
