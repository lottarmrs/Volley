create unique index if not exists players_username_lower_idx
  on public.players (lower(username));

create unique index if not exists players_user_id_active_unique_idx
  on public.players (user_id)
  where user_id is not null and deleted_at is null;

create or replace function public.normalize_account_username(value text)
returns text
language sql
immutable
set search_path = public
as $$
  select lower(trim(value));
$$;

create or replace function public.is_valid_account_username(value text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select public.normalize_account_username(value) ~ '^[a-z0-9][a-z0-9_-]{1,28}[a-z0-9]$';
$$;

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
  username text
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
    insert into public.players (owner_id, user_id, name, username)
    values (v_uid, v_uid, v_name, nullif(v_username, ''))
    on conflict (user_id) where user_id is not null and deleted_at is null
    do update set updated_at = now()
    returning * into v_player;
  elsif v_player.username is null and nullif(v_username, '') is not null then
    if not public.is_valid_account_username(v_username) then
      raise exception 'Invalid username' using errcode = '22023';
    end if;
    update public.players
       set username = v_username, updated_at = now()
     where id = v_player.id
     returning * into v_player;
  end if;

  if v_player.username is null then
    return query select
      'needs_username'::text,
      v_profile.id,
      v_profile.name,
      v_profile.email,
      v_profile.role,
      v_profile.created_at,
      v_profile.updated_at,
      v_player.id,
      null::text;
  else
    return query select
      'ready'::text,
      v_profile.id,
      v_profile.name,
      v_profile.email,
      v_profile.role,
      v_profile.created_at,
      v_profile.updated_at,
      v_player.id,
      v_player.username;
  end if;
exception
  when unique_violation then
    raise exception 'Username unavailable' using errcode = '23505';
end;
$$;

revoke execute on function public.ensure_account_ready(text) from public, anon;
grant execute on function public.ensure_account_ready(text) to authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1));
  v_username text := public.normalize_account_username(new.raw_user_meta_data->>'username');
begin
  insert into public.profiles (id, name, email, role)
  values (new.id, v_name, new.email, 'user')
  on conflict (id) do nothing;

  insert into public.players (owner_id, user_id, name, username)
  values (
    new.id,
    new.id,
    v_name,
    case
      when public.is_valid_account_username(v_username)
       and not exists (select 1 from public.players p where lower(p.username) = v_username)
      then v_username
      else null
    end
  )
  on conflict (user_id) where user_id is not null and deleted_at is null do nothing;
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
