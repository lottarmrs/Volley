-- Sua noite (spec 2026-10-05-sua-noite-design.md).
--
-- 1. A carta e publica com os numeros da avaliacao: qualquer membro ativo le a media por
--    fundamento de cada atleta do elenco. Cobertura e contagem continuam so na aba Avaliacao
--    (get_community_player_skill_profile, que nao muda).
-- 2. A noite do atleta: a pelada mais recente que ele jogou (career_events.session_played) nos
--    ultimos 7 dias, se ainda nao a viu. Vista a mais recente, as anteriores nao voltam; no
--    empate de horario vale a pelada criada por ultimo. O "ja vi" fica no servidor para dois
--    aparelhos nao revelarem a mesma noite.

create or replace function public.get_community_card_stats(p_community_id uuid)
returns table (player_id uuid, dimension_key text, value numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_community_id is null then
    raise exception 'Community is required' using errcode = '23514';
  end if;
  if not public.current_user_has_community_role(p_community_id)
     and not exists (
       select 1
         from public.community_members cm
        where cm.community_id = p_community_id
          and cm.user_id = (select auth.uid())
          and cm.status = 'active'
     ) then
    raise exception 'Not a member of this Community' using errcode = '42501';
  end if;

  return query
  select cp.player_id,
         d.value ->> 'dimension_key',
         (d.value ->> 'value')::numeric
    from public.community_players cp
    join public.players p
      on p.id = cp.player_id
     and p.deleted_at is null
     and p.active
   cross join lateral pg_catalog.jsonb_array_elements(
     app_private.compute_community_player_skill_profile(
       p_community_id,
       cp.player_id,
       'v0-legacy-11'
     ) -> 'dimensions'
   ) as d(value)
   where cp.community_id = p_community_id
     and cp.deleted_at is null
     and cp.active
     and d.value ->> 'value' is not null;
end;
$$;

revoke all on function public.get_community_card_stats(uuid) from public, anon;
grant execute on function public.get_community_card_stats(uuid) to authenticated;

create table public.athlete_night_views (
  player_id uuid not null references public.players(id) on delete cascade,
  session_id uuid not null references public.sessions(id) on delete cascade,
  seen_at timestamptz not null default now(),
  primary key (player_id, session_id)
);

alter table public.athlete_night_views enable row level security;

create policy "Athlete reads own night views"
  on public.athlete_night_views
  for select to authenticated
  using (
    exists (
      select 1 from public.players p
       where p.id = athlete_night_views.player_id
         and p.user_id = (select auth.uid())
    )
  );

revoke all on public.athlete_night_views from public, anon;
grant select on public.athlete_night_views to authenticated;

create or replace function public.get_my_pending_night()
returns table (session_id uuid, community_id uuid, occurred_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  with latest as (
    select e.player_id, e.session_id, e.community_id, e.occurred_at
      from public.career_events e
      join public.players p
        on p.id = e.player_id
       and p.user_id = (select auth.uid())
       and p.deleted_at is null
      join public.sessions s
        on s.id = e.session_id
     where e.type = 'session_played'
       and e.occurred_at >= pg_catalog.now() - interval '7 days'
     order by e.occurred_at desc, s.created_at desc
     limit 1
  )
  select l.session_id, l.community_id, l.occurred_at
    from latest l
   where not exists (
     select 1 from public.athlete_night_views v
      where v.player_id = l.player_id
        and v.session_id = l.session_id
   );
$$;

revoke all on function public.get_my_pending_night() from public, anon;
grant execute on function public.get_my_pending_night() to authenticated;

create or replace function public.mark_my_night_seen(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  select e.player_id into v_player
    from public.career_events e
    join public.players p
      on p.id = e.player_id
     and p.user_id = (select auth.uid())
   where e.type = 'session_played'
     and e.session_id = p_session_id
   limit 1;
  if v_player is null then
    raise exception 'This account did not play this Session' using errcode = '42501';
  end if;
  insert into public.athlete_night_views (player_id, session_id)
  values (v_player, p_session_id)
  on conflict do nothing;
end;
$$;

revoke all on function public.mark_my_night_seen(uuid) from public, anon;
grant execute on function public.mark_my_night_seen(uuid) to authenticated;
