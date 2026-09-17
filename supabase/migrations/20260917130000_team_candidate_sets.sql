-- XS-W6-03: an immutable, server-validated set of team candidates. The server checks the exact
-- partition of the snapshot and the constraints the client declares; it does not recompute scores.

create table app_private.team_candidate_sets (
  id uuid primary key,
  session_id uuid not null references public.sessions(id) on delete restrict,
  roster_revision_id uuid not null,
  snapshot_id uuid not null references app_private.balance_input_snapshots(id) on delete restrict,
  created_by uuid references auth.users(id) on delete set null,
  published_at timestamptz not null default pg_catalog.now(),
  team_count integer not null,
  hard_constraints jsonb not null,
  contract_version text not null,
  algorithm_version text not null,
  objective_policy_version text not null,
  set_fingerprint text not null,
  client_claimed jsonb not null,
  constraint team_candidate_sets_roster_fkey
    foreign key (roster_revision_id, session_id)
    references public.roster_revisions (id, session_id)
    on delete restrict,
  constraint team_candidate_sets_team_count_check check (team_count >= 2),
  constraint team_candidate_sets_constraints_object_check
    check (pg_catalog.jsonb_typeof(hard_constraints) = 'object'),
  constraint team_candidate_sets_claimed_object_check
    check (pg_catalog.jsonb_typeof(client_claimed) = 'object')
);

create index team_candidate_sets_session_idx
  on app_private.team_candidate_sets (session_id);
create index team_candidate_sets_roster_idx
  on app_private.team_candidate_sets (roster_revision_id, session_id);
create index team_candidate_sets_snapshot_idx
  on app_private.team_candidate_sets (snapshot_id);
create index team_candidate_sets_created_by_idx
  on app_private.team_candidate_sets (created_by);

create table app_private.team_candidate_solutions (
  set_id uuid not null references app_private.team_candidate_sets(id) on delete restrict,
  candidate_index integer not null,
  candidate_fingerprint text not null,
  assignment jsonb not null,
  client_claimed jsonb not null,
  primary key (set_id, candidate_index),
  constraint team_candidate_solutions_index_check check (candidate_index >= 0),
  constraint team_candidate_solutions_assignment_array_check
    check (pg_catalog.jsonb_typeof(assignment) = 'array'),
  constraint team_candidate_solutions_claimed_object_check
    check (pg_catalog.jsonb_typeof(client_claimed) = 'object')
);

alter table app_private.team_candidate_sets enable row level security;
alter table app_private.team_candidate_solutions enable row level security;
revoke all on table app_private.team_candidate_sets from public, anon, authenticated;
revoke all on table app_private.team_candidate_solutions from public, anon, authenticated;

create function app_private.reject_team_candidate_set_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and old.created_by is not null
     and new.created_by is null
     and (pg_catalog.to_jsonb(new) - 'created_by') = (pg_catalog.to_jsonb(old) - 'created_by') then
    return new;
  end if;
  raise exception 'Team candidate sets are immutable' using errcode = '55000';
end;
$$;

create trigger team_candidate_sets_immutable
  before update or delete on app_private.team_candidate_sets
  for each row execute function app_private.reject_team_candidate_set_mutation();

create function app_private.reject_team_candidate_solution_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Team candidate solutions are immutable' using errcode = '55000';
end;
$$;

create trigger team_candidate_solutions_immutable
  before update or delete on app_private.team_candidate_solutions
  for each row execute function app_private.reject_team_candidate_solution_mutation();

revoke all on function app_private.reject_team_candidate_set_mutation()
  from public, anon, authenticated;
revoke all on function app_private.reject_team_candidate_solution_mutation()
  from public, anon, authenticated;

create function app_private.team_index_of(p_teams jsonb, p_participant text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select (t.ordinality - 1)::integer
    from pg_catalog.jsonb_array_elements(p_teams) with ordinality as t(team, ordinality)
   where exists (
     select 1
       from pg_catalog.jsonb_array_elements_text(t.team) as m(member)
      where m.member = p_participant
   )
   limit 1
$$;

revoke all on function app_private.team_index_of(jsonb, text) from public, anon, authenticated;

create function public.publish_team_candidate_set(
  p_command_id uuid,
  p_session_id uuid,
  p_snapshot_id uuid,
  p_set jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_session public.sessions;
  v_snapshot app_private.balance_input_snapshots;
  v_revision_number integer;
  v_latest_revision integer;
  v_receipt jsonb;
  v_participants text[];
  v_team_count integer;
  v_constraints jsonb;
  v_locks jsonb;
  v_together jsonb;
  v_separated jsonb;
  v_normalized_constraints jsonb;
  v_set_claimed jsonb;
  v_candidate jsonb;
  v_teams jsonb;
  v_claimed jsonb;
  v_members text[];
  v_assignment jsonb;
  v_assignments jsonb[] := array[]::jsonb[];
  v_claims jsonb[] := array[]::jsonb[];
  v_fingerprints text[] := array[]::text[];
  v_set_fingerprint text;
  v_result jsonb;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_command_id is null or p_session_id is null or p_snapshot_id is null or p_set is null then
    raise exception 'command_id, session_id, snapshot_id and set are required'
      using errcode = '23514';
  end if;

  select * into v_session
    from public.sessions s
   where s.id = p_session_id
     and s.authority_model = 'target'
     and s.session_context = 'COMMUNITY'
   for update;
  if not found then
    raise exception 'Target Community Session not found' using errcode = 'P0002';
  end if;

  perform public.assert_target_session_write_authorized(v_session);

  v_receipt := app_private.find_command_receipt(
    p_command_id, 'publish_team_candidate_set', p_session_id
  );
  if v_receipt is not null then
    return v_receipt;
  end if;

  if v_session.lifecycle_status not in ('DRAFT', 'SCHEDULED') then
    raise exception 'Session must be DRAFT or SCHEDULED to publish team candidates'
      using errcode = '23514';
  end if;

  select * into v_snapshot
    from app_private.balance_input_snapshots s
   where s.id = p_snapshot_id
     and s.session_id = v_session.id;
  if not found then
    raise exception 'Balance input snapshot does not belong to this Session'
      using errcode = '23514';
  end if;

  select r.revision_number into v_revision_number
    from public.roster_revisions r
   where r.id = v_snapshot.roster_revision_id;
  select pg_catalog.max(r.revision_number) into v_latest_revision
    from public.roster_revisions r
   where r.session_id = v_session.id;
  if v_revision_number is distinct from v_latest_revision then
    raise exception 'Snapshot roster revision is not the current one' using errcode = '40001';
  end if;

  if pg_catalog.jsonb_typeof(p_set) <> 'object'
     or pg_catalog.jsonb_typeof(p_set -> 'candidates') is distinct from 'array'
     or pg_catalog.jsonb_typeof(p_set -> 'teamCount') is distinct from 'number'
     or (p_set ->> 'teamCount') !~ '^[0-9]{1,4}$' then
    raise exception 'Candidate set is malformed' using errcode = '23514';
  end if;
  if coalesce(p_set ->> 'contractVersion', '') = ''
     or coalesce(p_set ->> 'algorithmVersion', '') = ''
     or coalesce(p_set ->> 'objectivePolicyVersion', '') = '' then
    raise exception 'Candidate set versions are required' using errcode = '23514';
  end if;

  v_set_claimed := coalesce(p_set -> 'clientClaimed', '{}'::jsonb);
  if pg_catalog.jsonb_typeof(v_set_claimed) <> 'object' then
    raise exception 'Candidate set claim is malformed' using errcode = '23514';
  end if;

  if pg_catalog.jsonb_array_length(p_set -> 'candidates') not between 1 and 8 then
    raise exception 'A candidate set carries between 1 and 8 candidates' using errcode = '23514';
  end if;

  select pg_catalog.array_agg(p.participant ->> 'participant_id' order by p.participant ->> 'participant_id')
    into v_participants
    from pg_catalog.jsonb_array_elements(v_snapshot.payload -> 'participants') as p(participant);

  v_team_count := (p_set ->> 'teamCount')::integer;
  if v_team_count < 2 or v_team_count > pg_catalog.cardinality(v_participants) then
    raise exception 'Team count is out of range' using errcode = '23514';
  end if;

  v_constraints := coalesce(p_set -> 'hardConstraints', '{}'::jsonb);
  if pg_catalog.jsonb_typeof(v_constraints) <> 'object' then
    raise exception 'Hard constraints are malformed' using errcode = '23514';
  end if;
  v_locks := coalesce(v_constraints -> 'lockedParticipantTeams', '{}'::jsonb);
  v_together := coalesce(v_constraints -> 'pairsTogether', '[]'::jsonb);
  v_separated := coalesce(v_constraints -> 'pairsSeparated', '[]'::jsonb);
  if pg_catalog.jsonb_typeof(v_locks) <> 'object'
     or pg_catalog.jsonb_typeof(v_together) <> 'array'
     or pg_catalog.jsonb_typeof(v_separated) <> 'array' then
    raise exception 'Hard constraints are malformed' using errcode = '23514';
  end if;
  if exists (
    select 1
      from pg_catalog.jsonb_each(v_locks) as l(participant, team_index)
     where pg_catalog.jsonb_typeof(l.team_index) <> 'number'
        or (l.team_index #>> '{}') !~ '^[0-9]{1,4}$'
  ) then
    raise exception 'Locked participant teams are malformed' using errcode = '23514';
  end if;
  if exists (
    select 1
      from pg_catalog.jsonb_array_elements(v_together || v_separated) as pr(pair)
     where case
             when pg_catalog.jsonb_typeof(pr.pair) <> 'array' then true
             when pg_catalog.jsonb_array_length(pr.pair) <> 2 then true
             else pg_catalog.jsonb_typeof(pr.pair -> 0) <> 'string'
               or pg_catalog.jsonb_typeof(pr.pair -> 1) <> 'string'
           end
  ) then
    raise exception 'Constraint pairs are malformed' using errcode = '23514';
  end if;
  v_normalized_constraints := pg_catalog.jsonb_build_object(
    'lockedParticipantTeams', v_locks,
    'pairsTogether', v_together,
    'pairsSeparated', v_separated
  );

  for v_candidate in
    select c.candidate from pg_catalog.jsonb_array_elements(p_set -> 'candidates') as c(candidate)
  loop
    if pg_catalog.jsonb_typeof(v_candidate) <> 'object'
       or pg_catalog.jsonb_typeof(v_candidate -> 'teams') is distinct from 'array' then
      raise exception 'Candidate is malformed' using errcode = '23514';
    end if;
    v_teams := v_candidate -> 'teams';
    v_claimed := coalesce(v_candidate -> 'clientClaimed', '{}'::jsonb);
    if pg_catalog.jsonb_typeof(v_claimed) <> 'object' then
      raise exception 'Candidate claim is malformed' using errcode = '23514';
    end if;
    if pg_catalog.jsonb_array_length(v_teams) <> v_team_count then
      raise exception 'Candidate does not have the declared team count' using errcode = '23514';
    end if;
    if exists (
      select 1
        from pg_catalog.jsonb_array_elements(v_teams) as t(team)
       where pg_catalog.jsonb_typeof(t.team) <> 'array'
    ) then
      raise exception 'Candidate teams are malformed' using errcode = '23514';
    end if;
    if exists (
      select 1
        from pg_catalog.jsonb_array_elements(v_teams) as t(team),
             pg_catalog.jsonb_array_elements(t.team) as m(member)
       where pg_catalog.jsonb_typeof(m.member) <> 'string'
    ) then
      raise exception 'Candidate members are malformed' using errcode = '23514';
    end if;

    select pg_catalog.array_agg(m.member order by m.member)
      into v_members
      from pg_catalog.jsonb_array_elements(v_teams) as t(team),
           pg_catalog.jsonb_array_elements_text(t.team) as m(member);
    if v_members is distinct from v_participants then
      raise exception 'Candidate is not an exact partition of the snapshot participants'
        using errcode = '23514';
    end if;

    if exists (
      select 1
        from pg_catalog.jsonb_each(v_locks) as l(participant, team_index)
       where l.participant = any (v_participants)
         and app_private.team_index_of(v_teams, l.participant)
             is distinct from (l.team_index #>> '{}')::integer
    ) then
      raise exception 'Candidate breaks a locked participant' using errcode = '23514';
    end if;
    if exists (
      select 1
        from pg_catalog.jsonb_array_elements(v_together) as pr(pair)
       where (pr.pair ->> 0) = any (v_participants)
         and (pr.pair ->> 1) = any (v_participants)
         and app_private.team_index_of(v_teams, pr.pair ->> 0)
             <> app_private.team_index_of(v_teams, pr.pair ->> 1)
    ) then
      raise exception 'Candidate splits a pair that must play together' using errcode = '23514';
    end if;
    if exists (
      select 1
        from pg_catalog.jsonb_array_elements(v_separated) as pr(pair)
       where (pr.pair ->> 0) = any (v_participants)
         and (pr.pair ->> 1) = any (v_participants)
         and app_private.team_index_of(v_teams, pr.pair ->> 0)
             = app_private.team_index_of(v_teams, pr.pair ->> 1)
    ) then
      raise exception 'Candidate joins a pair that must be separated' using errcode = '23514';
    end if;

    select coalesce(
             pg_catalog.jsonb_agg(
               coalesce(
                 (select pg_catalog.jsonb_agg(m.member order by m.member)
                    from pg_catalog.jsonb_array_elements_text(t.team) as m(member)),
                 '[]'::jsonb
               )
               order by t.ordinality
             ),
             '[]'::jsonb
           )
      into v_assignment
      from pg_catalog.jsonb_array_elements(v_teams) with ordinality as t(team, ordinality);

    v_assignments := pg_catalog.array_append(v_assignments, v_assignment);
    v_claims := pg_catalog.array_append(v_claims, v_claimed);
    v_fingerprints := pg_catalog.array_append(v_fingerprints, pg_catalog.md5(v_assignment::text));
  end loop;

  v_set_fingerprint := pg_catalog.md5(
    pg_catalog.jsonb_build_object(
      'snapshot_id', v_snapshot.id,
      'team_count', v_team_count,
      'hard_constraints', v_normalized_constraints,
      'contract_version', p_set ->> 'contractVersion',
      'algorithm_version', p_set ->> 'algorithmVersion',
      'objective_policy_version', p_set ->> 'objectivePolicyVersion',
      'candidates', pg_catalog.to_jsonb(v_fingerprints)
    )::text
  );

  insert into app_private.team_candidate_sets (
    id, session_id, roster_revision_id, snapshot_id, created_by, team_count, hard_constraints,
    contract_version, algorithm_version, objective_policy_version, set_fingerprint, client_claimed
  ) values (
    p_command_id, v_session.id, v_snapshot.roster_revision_id, v_snapshot.id, v_uid,
    v_team_count, v_normalized_constraints, p_set ->> 'contractVersion',
    p_set ->> 'algorithmVersion', p_set ->> 'objectivePolicyVersion', v_set_fingerprint,
    v_set_claimed
  );

  insert into app_private.team_candidate_solutions (
    set_id, candidate_index, candidate_fingerprint, assignment, client_claimed
  )
  select p_command_id, i - 1, v_fingerprints[i], v_assignments[i], v_claims[i]
    from pg_catalog.generate_subscripts(v_fingerprints, 1) as i;

  v_result := pg_catalog.jsonb_build_object(
    'set_id', p_command_id,
    'set_fingerprint', v_set_fingerprint
  );
  perform app_private.record_command_receipt(
    p_command_id, v_uid, 'publish_team_candidate_set', v_session.id, v_result, 'TEAM_CANDIDATE_SET'
  );

  return v_result;
end;
$$;

revoke all on function public.publish_team_candidate_set(uuid, uuid, uuid, jsonb)
  from public, anon;
grant execute on function public.publish_team_candidate_set(uuid, uuid, uuid, jsonb)
  to authenticated;

create function public.read_team_candidate_set(p_set_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_set app_private.team_candidate_sets;
  v_session public.sessions;
begin
  if (select auth.uid()) is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_set_id is null then
    raise exception 'set_id is required' using errcode = '23514';
  end if;

  select * into v_set from app_private.team_candidate_sets s where s.id = p_set_id;
  if not found then
    raise exception 'Team candidate set not found' using errcode = 'P0002';
  end if;

  select * into v_session from public.sessions s where s.id = v_set.session_id;
  perform public.assert_target_session_write_authorized(v_session);

  return pg_catalog.jsonb_build_object(
    'set_id', v_set.id,
    'session_id', v_set.session_id,
    'roster_revision_id', v_set.roster_revision_id,
    'snapshot_id', v_set.snapshot_id,
    'published_at', v_set.published_at,
    'team_count', v_set.team_count,
    'hard_constraints', v_set.hard_constraints,
    'contract_version', v_set.contract_version,
    'algorithm_version', v_set.algorithm_version,
    'objective_policy_version', v_set.objective_policy_version,
    'set_fingerprint', v_set.set_fingerprint,
    'client_claimed', v_set.client_claimed,
    'candidates', coalesce(
      (select pg_catalog.jsonb_agg(
                pg_catalog.jsonb_build_object(
                  'candidate_index', c.candidate_index,
                  'candidate_fingerprint', c.candidate_fingerprint,
                  'assignment', c.assignment,
                  'client_claimed', c.client_claimed
                )
                order by c.candidate_index
              )
         from app_private.team_candidate_solutions c
        where c.set_id = v_set.id),
      '[]'::jsonb
    )
  );
end;
$$;

revoke all on function public.read_team_candidate_set(uuid) from public, anon;
grant execute on function public.read_team_candidate_set(uuid) to authenticated;
