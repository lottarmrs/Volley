-- Remove the old propose/approve player-link system. Plan A's claim-code
-- flow (player_claim_codes, migration 20260723230000) replaced its only
-- remaining production use case.

drop function if exists public.cancel_my_link_proposal(uuid);
drop function if exists public.reject_player_link(uuid);
drop function if exists public.approve_player_link(uuid);
drop function if exists public.propose_player_link(uuid);
drop function if exists public.merge_player_identity_claim(uuid, uuid);

drop trigger if exists trg_guard_aliased_player_reactivation on public.players;
drop function if exists public.guard_aliased_player_reactivation();

drop table if exists public.player_link_proposals cascade;
drop table if exists public.player_identity_aliases cascade;
drop table if exists public.player_identity_claims cascade;

-- guard_active_player_reference() stays: it still guards community_players,
-- player_evaluations, and player_avatar_proposals against referencing a
-- soft-deleted player. Only the alias-check and the (now-moot)
-- player_link_proposals status-transition exemption are removed from its
-- body.
create or replace function public.guard_active_player_reference()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted_at timestamptz;
begin
  select deleted_at
    into v_deleted_at
    from public.players
   where id = new.player_id
   for update;

  if v_deleted_at is not null then
    raise exception 'Player reference must target an active canonical player'
      using errcode = '23503';
  end if;

  return new;
end;
$$;

revoke execute on function public.guard_active_player_reference()
  from public, anon, authenticated;
