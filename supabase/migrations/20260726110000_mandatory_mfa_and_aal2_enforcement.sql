-- Mandatory MFA determination + AAL2 enforcement at the database layer for sensitive
-- role/ownership RPCs. See
-- docs/superpowers/plans/2026-07-26-roles-permissions-security-hardening.md.

drop function public.ensure_account_ready(text);

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
      'ready'::text,
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

-- PRE-FLIGHT CORRECTION (decidida antes da execução): 'admin' entra aqui.
-- O texto original desta task exigia aal2 em set_community_member_role e
-- remove_community_member, mas só obrigava MFA para master/programmer/owner —
-- e o seed de capabilities dá manage_members/remove_members ao admin. Um admin
-- nunca seria mandado enrolar TOTP, nunca chegaria a aal2, e toda chamada dele
-- a essas duas RPCs falharia com 42501 para sempre. Incluir 'admin' fecha a
-- contradição mantendo as quatro RPCs sob require_aal2().
create or replace function public.account_requires_aal2(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (
      select 1 from public.profiles
      where id = p_uid and role in ('master', 'programmer')
    )
    or exists (
      select 1 from public.community_members
      where user_id = p_uid and role in ('owner', 'admin') and status = 'active'
    );
$$;

revoke execute on function public.account_requires_aal2(uuid) from public, anon;
grant execute on function public.account_requires_aal2(uuid) to authenticated;

-- AAL2 enforcement at the DB layer for sensitive role/ownership RPCs, independent of
-- client-side gating (per "Operacoes administrativas sensiveis exigem aal2 no banco",
-- docs/superpowers/specs/2026-07-22-scalable-product-restructure-design.md).
-- PRE-FLIGHT CORRECTION: `set search_path = public` adicionado. Sem isso o
-- advisor function_search_path_mutable acusa uma nova advertência, o que o
-- Completion Gate deste plano proíbe ("get_advisors showing no new advisories").
create or replace function public.require_aal2()
returns void
language plpgsql
stable
set search_path = public
as $$
begin
  if coalesce((select auth.jwt() ->> 'aal'), '') <> 'aal2' then
    raise exception 'Esta operacao exige verificacao em duas etapas (AAL2).' using errcode = '42501';
  end if;
end;
$$;

-- Sensitive RPC #1: global role changes. No v_uid null-check exists in this function
-- (it authorizes via is_superadmin()), so require_aal2() is the first statement.
create or replace function public.set_user_role(
  target_user_id uuid,
  new_role text
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  updated public.profiles;
begin
  perform public.require_aal2();

  if not public.is_superadmin() then
    raise exception 'Apenas um master pode alterar papeis.' using errcode = '42501';
  end if;

  if new_role not in ('master', 'programmer', 'user') then
    raise exception 'Papel invalido: %', new_role using errcode = '22023';
  end if;

  if new_role <> 'master'
     and exists (select 1 from public.profiles where id = target_user_id and role = 'master')
     and (select count(*) from public.profiles where role = 'master') <= 1 then
    raise exception 'Nao e possivel rebaixar o ultimo master.' using errcode = '42501';
  end if;

  perform set_config('app.allow_role_change', 'on', true);

  update public.profiles
     set role = new_role,
         updated_at = now()
   where id = target_user_id
   returning * into updated;

  if updated.id is null then
    raise exception 'Usuario nao encontrado.' using errcode = '22023';
  end if;

  return updated;
end;
$$;

-- Sensitive RPC #2: community member role changes. require_aal2() goes after the
-- existing v_uid is null check, so unauthenticated callers still get 'Nao autenticado'.
create or replace function public.set_community_member_role(
  p_member_id uuid,
  p_role text
)
returns public.community_members
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  target_member public.community_members;
  updated_member public.community_members;
begin
  if v_uid is null then
    raise exception 'Nao autenticado' using errcode = '42501';
  end if;

  perform public.require_aal2();

  if p_role not in ('admin', 'moderator', 'organizador', 'member') then
    raise exception 'Invalid community member role: %', p_role using errcode = '22023';
  end if;

  select * into target_member from public.community_members where id = p_member_id;

  if target_member.id is null then
    raise exception 'Membro da comunidade nao encontrado' using errcode = '22023';
  end if;

  if target_member.role = 'owner' then
    raise exception 'O papel owner nao pode ser alterado por esta acao' using errcode = '42501';
  end if;

  if not public.community_has_capability(target_member.community_id, 'manage_members') then
    raise exception 'Apenas quem tem manage_members pode alterar papeis de membros' using errcode = '42501';
  end if;

  update public.community_members
     set role = p_role, updated_at = now()
   where id = p_member_id
   returning * into updated_member;

  return updated_member;
end;
$$;

-- Sensitive RPC #3: community member removal. Same ordering rule as above.
create or replace function public.remove_community_member(
  p_member_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  target_member public.community_members;
begin
  if v_uid is null then
    raise exception 'Nao autenticado' using errcode = '42501';
  end if;

  perform public.require_aal2();

  select * into target_member from public.community_members where id = p_member_id;

  if target_member.id is null then
    raise exception 'Membro da comunidade nao encontrado' using errcode = '22023';
  end if;

  if target_member.role = 'owner' then
    raise exception 'Owner nao pode ser removido por esta acao' using errcode = '42501';
  end if;

  if not public.community_has_capability(target_member.community_id, 'remove_members') then
    raise exception 'Apenas quem tem remove_members pode remover membros' using errcode = '42501';
  end if;

  delete from public.community_members where id = p_member_id;
end;
$$;

-- Sensitive RPC #4: community ownership transfer. No v_uid variable exists in this
-- function (it authorizes via has_capability()), so require_aal2() is the first
-- statement.
create or replace function public.transfer_community_ownership(
  p_community_id uuid,
  p_new_owner_member_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_owner public.community_members;
  new_owner public.community_members;
begin
  perform public.require_aal2();

  if not public.has_capability('manage_community_ownership') then
    raise exception 'Apenas master pode transferir a posse de uma comunidade' using errcode = '42501';
  end if;

  select * into new_owner
    from public.community_members
   where id = p_new_owner_member_id and community_id = p_community_id;
  if new_owner.id is null then
    raise exception 'Membro alvo nao encontrado nesta comunidade' using errcode = '22023';
  end if;

  select * into current_owner
    from public.community_members
   where community_id = p_community_id and role = 'owner';
  if current_owner.id is null then
    raise exception 'Comunidade sem owner atual' using errcode = '22023';
  end if;
  if current_owner.id = new_owner.id then
    raise exception 'Membro alvo ja e owner' using errcode = '22023';
  end if;

  -- Promote first so there are briefly two owners, never zero — the
  -- prevent_last_community_owner_change trigger only rejects a demote when it is the
  -- last owner row at that instant.
  update public.community_members set role = 'owner', updated_at = now()
   where id = new_owner.id;
  update public.community_members set role = 'admin', updated_at = now()
   where id = current_owner.id;
end;
$$;
