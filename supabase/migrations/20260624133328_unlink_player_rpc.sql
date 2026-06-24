-- ----------------------------------------------------------------------------
-- RPC to unlink a user from a player safely
-- ----------------------------------------------------------------------------
create or replace function public.unlink_player_user(
  p_player_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if not public.current_user_is_player_admin(p_player_id) then
    raise exception 'Only the athlete creator or community admins can unlink a player'
      using errcode = '42501';
  end if;

  -- Enable bypass flag for trigger-guard
  perform set_config('app.allow_user_link_promotion', 'on', true);

  update public.players
     set user_id = null,
         updated_at = now()
   where id = p_player_id;
end;
$$;

revoke execute on function public.unlink_player_user(uuid) from public, anon;
grant execute on function public.unlink_player_user(uuid) to authenticated;
