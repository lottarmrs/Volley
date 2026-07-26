-- Preserve every fixture in rounds that contain more than one match, persist the
-- materialized session-team bridge, and keep all round references in one scope.

update public.championship_rounds
set local_id = id::text
where local_id is null;

alter table public.championship_rounds
  alter column local_id set not null,
  drop constraint if exists championship_rounds_championship_id_round_key;

alter table public.championship_rounds
  add constraint championship_rounds_championship_id_local_id_key
  unique (championship_id, local_id);

alter table public.championship_teams
  add constraint championship_teams_championship_id_id_key
  unique (championship_id, id);

alter table public.teams
  add column if not exists championship_team_id uuid
    references public.championship_teams(id) on delete set null;

create index if not exists teams_championship_team_id_idx
  on public.teams (championship_team_id);

alter table public.championship_rounds
  add constraint championship_rounds_distinct_teams_check
    check (team_a_id <> team_b_id),
  add constraint championship_rounds_team_a_scope_fkey
    foreign key (championship_id, team_a_id)
    references public.championship_teams(championship_id, id) on delete cascade,
  add constraint championship_rounds_team_b_scope_fkey
    foreign key (championship_id, team_b_id)
    references public.championship_teams(championship_id, id) on delete cascade;

create or replace function public.validate_championship_round_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  championship_community_id uuid;
  session_community_id uuid;
begin
  if new.session_id is null then
    return new;
  end if;

  select community_id
  into championship_community_id
  from public.championships
  where id = new.championship_id;

  select community_id
  into session_community_id
  from public.sessions
  where id = new.session_id;

  if championship_community_id is null
     or session_community_id is distinct from championship_community_id then
    raise exception 'championship round session must belong to the championship community'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.validate_championship_round_scope() from public, anon, authenticated;

drop trigger if exists validate_championship_round_scope_trigger
  on public.championship_rounds;

create trigger validate_championship_round_scope_trigger
before insert or update of championship_id, session_id
on public.championship_rounds
for each row execute function public.validate_championship_round_scope();
