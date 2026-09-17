-- The roster row created by enroll_approved_member was owned by the athlete's account. Client sync
-- upserts community_players with the syncing organizer as owner_id, and RLS only lets a user update
-- rows it owns, so every later sync of whoever approved failed with 42501. The row now belongs to
-- the approver, or to the Community owner when no one is authenticated (backfill).

create or replace function app_private.enroll_approved_member(
  p_community_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player public.players%rowtype;
  v_name text;
  v_roster_owner uuid;
begin
  select coalesce(nullif(name, ''), split_part(email, '@', 1), 'Atleta') into v_name
    from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'Conta do membro não encontrada.' using errcode = '23503';
  end if;

  select coalesce((select auth.uid()), c.owner_id) into v_roster_owner
    from public.communities c where c.id = p_community_id;
  if v_roster_owner is null then
    raise exception 'Comunidade não encontrada.' using errcode = '23503';
  end if;

  select * into v_player from public.players where user_id = p_user_id for update;
  if found and v_player.deleted_at is not null then
    raise exception 'O perfil de atleta desta conta precisa ser recuperado antes da aprovação.'
      using errcode = '23514';
  end if;

  if v_player.id is null then
    insert into public.players (owner_id, user_id, name, has_account_identity_history)
    values (p_user_id, p_user_id, v_name, true)
    on conflict (user_id) where user_id is not null
    do update set updated_at = public.players.updated_at
    returning * into v_player;
  end if;

  if v_player.deleted_at is not null then
    raise exception 'O perfil de atleta desta conta precisa ser recuperado antes da aprovação.'
      using errcode = '23514';
  end if;

  insert into public.community_players as cp (
    owner_id, community_id, player_id, active, status
  )
  values (v_roster_owner, p_community_id, v_player.id, true, 'active')
  on conflict (community_id, player_id) do update
    set active = true, status = 'active', deleted_at = null, updated_at = now()
    where cp.status <> 'banned';

  if not found then
    raise exception 'Este atleta está banido do elenco. Resolva o banimento antes de aprovar a entrada.'
      using errcode = '23514';
  end if;
end;
$$;

revoke all on function app_private.enroll_approved_member(uuid, uuid)
  from public, anon, authenticated;

update public.community_players cp
   set owner_id = c.owner_id, updated_at = now()
  from public.communities c, public.players p
 where c.id = cp.community_id
   and p.id = cp.player_id
   and cp.owner_id = p.user_id
   and cp.owner_id <> c.owner_id
   and not exists (
     select 1 from public.community_members m
      where m.community_id = cp.community_id
        and m.user_id = cp.owner_id
        and m.status = 'active'
        and m.role in ('owner', 'admin', 'organizer')
   );
