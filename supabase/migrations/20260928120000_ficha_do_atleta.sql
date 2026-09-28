-- Ficha do atleta (spec 2026-09-28-ficha-do-atleta-design.md).
--
-- Decisao do usuario em 2026-09-28: quem tem conta preenche a propria ficha no cadastro,
-- com genero, posicao principal, altura e mao dominante obrigatorios; ninguem alem da conta
-- altera essa ficha. Em producao, as 6 fichas com conta tinham so o nome.

create or replace function app_private.athlete_profile_complete(p_player_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.players p
     where p.id = p_player_id
       and p.gender is not null
       and p.primary_position is not null
       and p.height is not null
       and p.dominant_hand is not null
  );
$$;

revoke all on function app_private.athlete_profile_complete(uuid) from public, anon, authenticated;

create or replace function public.ensure_account_ready(p_username text default null)
returns table (
  state text,
  profile_id uuid,
  profile_name text,
  profile_email text,
  profile_role text,
  profile_created_at timestamptz,
  profile_updated_at timestamptz,
  player_id uuid,
  username text,
  requires_aal2 boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  v_email text;
  v_name text;
  v_username text := public.normalize_account_username(p_username);
  v_profile public.profiles%rowtype;
  v_player public.players%rowtype;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select email, coalesce(raw_user_meta_data->>'name', split_part(email, '@', 1))
    into v_email, v_name
    from auth.users
   where id = v_uid;

  insert into public.profiles (id, name, email, role)
  values (v_uid, v_name, v_email, 'user')
  on conflict (id) do update
    set email = excluded.email,
        updated_at = now();

  select * into v_profile from public.profiles where id = v_uid;

  select * into v_player
    from public.players
   where user_id = v_uid and deleted_at is null
   order by created_at
   limit 1
   for update;

  if nullif(v_username, '') is not null
     and not public.is_valid_account_username(v_username) then
    raise exception 'Invalid username' using errcode = '22023';
  end if;

  if v_player.id is null then
    insert into public.players (
      owner_id,
      user_id,
      name,
      username,
      has_account_identity_history
    )
    values (v_uid, v_uid, v_name, nullif(v_username, ''), true)
    on conflict (user_id) where user_id is not null
    do update set updated_at = now()
    returning * into v_player;
  elsif (
    v_player.username is null
    or v_player.username <> public.normalize_account_username(v_player.username)
    or not public.is_valid_account_username(v_player.username)
  ) and nullif(v_username, '') is not null then
    if not public.is_valid_account_username(v_username) then
      raise exception 'Invalid username' using errcode = '22023';
    end if;
    update public.players
       set username = v_username, updated_at = now()
     where id = v_player.id
     returning * into v_player;
  end if;

  if v_player.username is null
     or v_player.username <> public.normalize_account_username(v_player.username)
     or not public.is_valid_account_username(v_player.username) then
    return query select
      'needs_username'::text,
      v_profile.id,
      v_profile.name,
      v_profile.email,
      v_profile.role,
      v_profile.created_at,
      v_profile.updated_at,
      v_player.id,
      null::text,
      public.account_requires_aal2(v_uid);
  else
    return query select
      case
        when app_private.athlete_profile_complete(v_player.id) then 'ready'
        else 'needs_athlete_profile'
      end::text,
      v_profile.id,
      v_profile.name,
      v_profile.email,
      v_profile.role,
      v_profile.created_at,
      v_profile.updated_at,
      v_player.id,
      v_player.username,
      public.account_requires_aal2(v_uid);
  end if;
exception
  when unique_violation then
    raise exception 'Username unavailable' using errcode = '23505';
end;
$$;

revoke execute on function public.ensure_account_ready(text) from public, anon;
grant execute on function public.ensure_account_ready(text) to authenticated;

create or replace function public.update_my_athlete_profile(
  p_gender text,
  p_primary_position text,
  p_height_cm numeric,
  p_dominant_hand text,
  p_nickname text,
  p_secondary_positions text[],
  p_injured boolean,
  p_physical_limitation text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_player public.players%rowtype;
  v_positions constant text[] := array['levantador','oposto','ponteiro','central','libero','all-rounder'];
  v_secondary text[] := coalesce(p_secondary_positions, array[]::text[]);
  v_status jsonb;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select * into v_player
    from public.players
   where user_id = v_uid and deleted_at is null
   order by created_at
   limit 1
   for update;
  if v_player.id is null then
    raise exception 'Athlete profile not found for this account' using errcode = 'P0002';
  end if;

  if p_gender is null or p_gender not in ('M', 'F') then
    raise exception 'Gender must be M or F' using errcode = '23514';
  end if;
  if p_primary_position is null or not (p_primary_position = any (v_positions)) then
    raise exception 'Primary position is not valid' using errcode = '23514';
  end if;
  if p_height_cm is null or p_height_cm < 120 or p_height_cm > 230 then
    raise exception 'Height must be between 120 and 230 cm' using errcode = '23514';
  end if;
  if p_dominant_hand is null or p_dominant_hand not in ('direita', 'esquerda') then
    raise exception 'Dominant hand must be direita or esquerda' using errcode = '23514';
  end if;
  if exists (select 1 from pg_catalog.unnest(v_secondary) s where not (s = any (v_positions)))
     or pg_catalog.cardinality(v_secondary) <> (select pg_catalog.count(distinct s) from pg_catalog.unnest(v_secondary) s)
     or p_primary_position = any (v_secondary) then
    raise exception 'Secondary positions must be valid, distinct and different from the primary'
      using errcode = '23514';
  end if;

  v_status := coalesce(v_player.status, '{}'::jsonb);
  if p_injured is not null then
    v_status := v_status || pg_catalog.jsonb_build_object('lesionado', p_injured);
  end if;
  if p_physical_limitation is not null then
    v_status := v_status || pg_catalog.jsonb_build_object(
      'limitacaoFisica', nullif(pg_catalog.btrim(p_physical_limitation), '')
    );
  end if;

  update public.players
     set gender = p_gender,
         primary_position = p_primary_position,
         height = p_height_cm,
         dominant_hand = p_dominant_hand,
         nickname = nullif(pg_catalog.btrim(coalesce(p_nickname, '')), ''),
         secondary_positions = v_secondary,
         status = v_status,
         updated_at = pg_catalog.now()
   where id = v_player.id;

  return case
    when v_player.username is null then 'needs_username'
    when app_private.athlete_profile_complete(v_player.id) then 'ready'
    else 'needs_athlete_profile'
  end;
end;
$$;

revoke all on function public.update_my_athlete_profile(text, text, numeric, text, text, text[], boolean, text)
  from public, anon;
grant execute on function public.update_my_athlete_profile(text, text, numeric, text, text, text[], boolean, text)
  to authenticated;
