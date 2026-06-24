-- ============================================================================
-- Hardening das funções de TRIGGER expostas indevidamente.
--
-- Advisors apontaram:
--   * function_search_path_mutable    -> guard_avatar_url, guard_player_user_id,
--                                        handle_player_soft_delete_user_unlink
--   * anon/authenticated_security_definer_function_executable
--                                     -> guard_community_member_owner_role
--
-- Funções de trigger não precisam ser chamáveis como RPC. Aqui:
--   1. Fixamos search_path = public (recriação não derruba os triggers).
--   2. Revogamos EXECUTE de public/anon/authenticated (o disparo por trigger
--      NÃO depende de EXECUTE, então os gatilhos continuam funcionando).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. guard_avatar_url
-- ----------------------------------------------------------------------------
create or replace function public.guard_avatar_url()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.avatar_url is distinct from old.avatar_url
     and coalesce(current_setting('app.allow_avatar_promotion', true), '') <> 'on' then
    raise exception 'avatar_url can only be changed through the avatar approval flow'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function public.guard_avatar_url() from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 2. guard_player_user_id
-- ----------------------------------------------------------------------------
create or replace function public.guard_player_user_id()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.user_id is distinct from old.user_id
     and coalesce(current_setting('app.allow_user_link_promotion', true), '') <> 'on'
     and not (new.deleted_at is not null and old.deleted_at is null) then
    raise exception 'user_id can only be changed through the player link approval flow'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function public.guard_player_user_id() from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3. handle_player_soft_delete_user_unlink
-- ----------------------------------------------------------------------------
create or replace function public.handle_player_soft_delete_user_unlink()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    new.user_id := null;
  end if;
  return new;
end;
$$;
revoke execute on function public.handle_player_soft_delete_user_unlink() from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 4. guard_community_member_owner_role (já tem search_path; só revoga acesso RPC)
-- ----------------------------------------------------------------------------
revoke execute on function public.guard_community_member_owner_role() from public, anon, authenticated;
