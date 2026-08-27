create table if not exists public.player_claim_codes (
  player_id uuid primary key references public.players(id) on delete cascade,
  code text not null unique,
  created_at timestamptz not null default now()
);

alter table public.player_claim_codes enable row level security;

drop policy if exists "Owner or staff can read claim codes" on public.player_claim_codes;
create policy "Owner or staff can read claim codes"
  on public.player_claim_codes
  for select to authenticated
  using (
    exists (
      select 1 from public.players p
      where p.id = player_claim_codes.player_id
        and p.owner_id = (select auth.uid())
    )
    or public.is_app_staff()
  );

revoke all on table public.player_claim_codes from public, anon, authenticated;
grant select on public.player_claim_codes to authenticated;

create or replace function public.generate_player_claim_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
begin
  if new.user_id is not null then
    return new;
  end if;

  loop
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    exit when not exists (
      select 1 from public.player_claim_codes where code = v_code
    );
  end loop;

  insert into public.player_claim_codes (player_id, code)
  values (new.id, v_code);

  return new;
end;
$$;

revoke execute on function public.generate_player_claim_code()
  from public, anon, authenticated;

drop trigger if exists trg_generate_player_claim_code on public.players;
create trigger trg_generate_player_claim_code
  after insert on public.players
  for each row execute function public.generate_player_claim_code();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1));
  v_username text := public.normalize_account_username(new.raw_user_meta_data->>'username');
  v_claim_code text := upper(trim(new.raw_user_meta_data->>'claim_code'));
  v_claimed_player_id uuid;
begin
  insert into public.profiles (id, name, email, role)
  values (new.id, v_name, new.email, 'user')
  on conflict (id) do nothing;

  if nullif(v_claim_code, '') is not null then
    select player_id into v_claimed_player_id
      from public.player_claim_codes
     where code = v_claim_code
     for update;

    if v_claimed_player_id is not null then
      perform set_config('app.allow_user_link_promotion', 'on', true);

      update public.players
         set user_id = new.id,
             owner_id = new.id,
             has_account_identity_history = true,
             updated_at = now()
       where id = v_claimed_player_id
         and user_id is null;

      if found then
        delete from public.player_claim_codes where player_id = v_claimed_player_id;
      else
        v_claimed_player_id := null;
      end if;
    end if;
  end if;

  if v_claimed_player_id is null then
    insert into public.players (
      owner_id,
      user_id,
      name,
      username,
      has_account_identity_history
    )
    values (new.id, new.id, v_name, null, true)
    on conflict (user_id) where user_id is not null do nothing;
  end if;

  if public.is_valid_account_username(v_username) then
    begin
      update public.players
         set username = v_username,
             updated_at = now()
       where user_id = new.id
         and deleted_at is null
         and username is null;
    exception
      when unique_violation then
        null;
    end;
  end if;

  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
