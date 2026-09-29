-- Perfil do atleta (spec 2026-09-29-perfil-do-atleta-design.md).
--
-- 1. O atleta le a propria avaliacao da comunidade, alem de quem avalia.
-- 2. Foto: ficha com conta, so a propria conta troca; convidado, quem administra. Sempre na
--    hora: em producao, em 2026-09-29, player_avatar_proposals estava vazia, entao o fluxo de
--    aprovacao nunca foi usado.

create or replace function public.get_community_player_skill_profile(
  p_community_id uuid,
  p_player_id uuid,
  p_rubric_version text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_rubric_version text := pg_catalog.btrim(p_rubric_version);
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_community_id is null or p_player_id is null then
    raise exception 'Community and Player are required' using errcode = '23514';
  end if;
  if not public.current_user_has_community_capability(p_community_id, 'player.evaluate')
     and not public.player_is_linked_to_current_user(p_player_id) then
    raise exception 'Not authorized to read skill profiles in this Community'
      using errcode = '42501';
  end if;
  if not app_private.registration_player_standing_alive(p_community_id, p_player_id) then
    raise exception 'Player has no living roster standing in this Community'
      using errcode = '23514';
  end if;
  if not exists (
    select 1 from public.skill_rubric_versions r where r.rubric_version = v_rubric_version
  ) then
    raise exception 'Rubric version is not registered' using errcode = '23514';
  end if;
  return app_private.compute_community_player_skill_profile(
    p_community_id,
    p_player_id,
    v_rubric_version
  );
end;
$$;

create or replace function public.propose_player_avatar(
  p_player_id uuid,
  p_image_url text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid      uuid := (select auth.uid());
  v_proposal uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if not exists (select 1 from public.players where id = p_player_id) then
    raise exception 'Athlete not found' using errcode = '22023';
  end if;
  if public.player_has_account(p_player_id) then
    if not public.player_is_linked_to_current_user(p_player_id) then
      raise exception 'Only the athlete can change their own photo' using errcode = '42501';
    end if;
  elsif not public.current_user_is_player_admin(p_player_id) then
    raise exception 'Only owners/admins of this athlete can change the photo'
      using errcode = '42501';
  end if;

  insert into public.player_avatar_proposals (
    player_id, proposed_by, image_url, status, reviewed_by, reviewed_at
  )
  values (p_player_id, v_uid, p_image_url, 'approved', v_uid, now())
  returning id into v_proposal;

  perform set_config('app.allow_avatar_promotion', 'on', true);
  update public.players
     set avatar_url = p_image_url,
         updated_at = now()
   where id = p_player_id;

  update public.player_avatar_proposals
     set status = 'superseded'
   where player_id = p_player_id
     and status = 'pending'
     and id <> v_proposal;

  return v_proposal;
end;
$$;

revoke all on function public.get_community_player_skill_profile(uuid, uuid, text)
  from public, anon;
grant execute on function public.get_community_player_skill_profile(uuid, uuid, text)
  to authenticated;

revoke execute on function public.propose_player_avatar(uuid, text) from public, anon;
grant execute on function public.propose_player_avatar(uuid, text) to authenticated;
