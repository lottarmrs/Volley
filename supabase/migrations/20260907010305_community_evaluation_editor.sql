create table app_private.community_evaluation_cutovers (
  community_id uuid primary key references public.communities(id) on delete cascade,
  activated_at timestamptz not null default pg_catalog.now(),
  activated_by uuid references auth.users(id) on delete set null
);

revoke all on app_private.community_evaluation_cutovers from public, anon, authenticated;

create function public.activate_community_evaluation_model(p_community_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  if p_community_id is null or not public.current_user_has_community_capability(p_community_id, 'community.members.manage') then
    raise exception 'Not authorized to manage this Community' using errcode = '42501';
  end if;
  perform 1 from public.communities where id = p_community_id for update;
  if not found then raise exception 'Community not found' using errcode = 'P0002'; end if;
  insert into app_private.community_evaluation_cutovers (community_id, activated_by)
  values (p_community_id, (select auth.uid())) on conflict (community_id) do nothing;
end;
$$;

create function public.set_community_evaluator(p_community_id uuid, p_user_id uuid, p_enabled boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  if p_enabled is null then raise exception 'enabled is required' using errcode = '23514'; end if;
  if p_community_id is null or p_user_id is null or not public.current_user_has_community_capability(p_community_id, 'community.members.manage') then
    raise exception 'Not authorized to manage evaluators in this Community' using errcode = '42501';
  end if;
  if not exists (select 1 from public.community_memberships where community_id = p_community_id and user_id = p_user_id and status = 'active') then
    raise exception 'Evaluator must be an active Community member' using errcode = '23514';
  end if;
  if not exists (select 1 from app_private.community_evaluation_cutovers where community_id = p_community_id) then
    raise exception 'Community evaluation model is not activated' using errcode = '23514';
  end if;
  if not p_enabled then
    update public.community_responsibilities
       set revoked_at = pg_catalog.now()
     where community_id = p_community_id and user_id = p_user_id and responsibility = 'EVALUATOR'
       and revoked_at is null;
    return;
  end if;
  insert into public.community_responsibilities (community_id, user_id, responsibility, assigned_by)
  values (p_community_id, p_user_id, 'EVALUATOR', (select auth.uid()))
  on conflict (community_id, user_id, responsibility) do update
    set revoked_at = null,
        assigned_at = pg_catalog.now(),
        assigned_by = (select auth.uid());
end;
$$;

create function public.get_community_evaluation_editor(p_community_id uuid, p_player_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_target boolean; v_profile jsonb;
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  if p_community_id is null or p_player_id is null then raise exception 'Community and Player are required' using errcode = '23514'; end if;
  if not exists (select 1 from public.community_memberships where community_id=p_community_id and user_id=v_uid and status='active') then
    raise exception 'Not authorized to read this Community' using errcode = '42501';
  end if;
  if not app_private.registration_player_standing_alive(p_community_id, p_player_id) then
    raise exception 'Player has no living roster standing in this Community' using errcode = '23514';
  end if;
  select exists(select 1 from app_private.community_evaluation_cutovers where community_id=p_community_id) into v_target;
  select jsonb_build_object(
    'community_id', p_community_id, 'player_id', p_player_id,
    'authority_model', case when v_target then 'target' else 'legacy' end,
    'can_evaluate', public.current_user_has_community_capability(p_community_id, 'player.evaluate') and v_target,
    'can_manage_evaluators', public.current_user_has_community_capability(p_community_id, 'community.members.manage'),
    'rubric_version', 'v0-legacy-11',
    'own_evaluation', (select jsonb_build_object('contribution_id', c.id, 'rubric_version', c.rubric_version, 'dimensions', coalesce((select jsonb_object_agg(s.dimension_key, s.value) from public.player_evaluation_dimension_scores s where s.contribution_id=c.id), '{}'::jsonb)) from public.player_evaluation_contributions c where c.community_id=p_community_id and c.player_id=p_player_id and c.evaluator_user_id=v_uid and c.superseded_at is null),
    'members', case when public.current_user_has_community_capability(p_community_id, 'community.members.manage') then coalesce((select jsonb_agg(jsonb_build_object('user_id', m.user_id, 'label', coalesce(nullif(pg_catalog.btrim(p.name), ''), p.email, m.user_id::text), 'is_evaluator', exists(select 1 from public.community_responsibilities r where r.community_id=m.community_id and r.user_id=m.user_id and r.responsibility='EVALUATOR' and r.revoked_at is null))) from public.community_memberships m join public.profiles p on p.id=m.user_id where m.community_id=p_community_id and m.status='active'), '[]'::jsonb) else '[]'::jsonb end
  ) into v_profile;
  return v_profile;
end;
$$;

create function public.record_community_player_evaluation(
  p_command_id uuid, p_contribution_id uuid, p_community_id uuid, p_player_id uuid,
  p_rubric_version text, p_dimension_scores jsonb, p_expected_contribution_id uuid
)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_current uuid; v_receipt jsonb;
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  if p_command_id is null or p_contribution_id is null or p_community_id is null or p_player_id is null then
    raise exception 'Command, contribution, Community and Player are required' using errcode = '23514';
  end if;
  perform 1 from public.players where id=p_player_id for update;
  if not found then raise exception 'Player not found' using errcode = 'P0002'; end if;
  if not exists (select 1 from app_private.community_evaluation_cutovers where community_id=p_community_id) then raise exception 'Community evaluation model is not activated' using errcode = '23514'; end if;
  if not public.current_user_has_community_capability(p_community_id, 'player.evaluate') then raise exception 'Not authorized to evaluate Players in this Community' using errcode = '42501'; end if;
  v_receipt := app_private.find_command_receipt(p_command_id, 'record_player_evaluation', p_contribution_id);
  if v_receipt is not null then
    if not exists (
      select 1 from public.player_evaluation_contributions
       where id = p_contribution_id and community_id = p_community_id and player_id = p_player_id
         and evaluator_user_id = v_uid
    ) then
      raise exception 'Evaluation receipt does not belong to this context' using errcode = '42501';
    end if;
    return;
  end if;
  select c.id into v_current from public.player_evaluation_contributions c where c.community_id=p_community_id and c.player_id=p_player_id and c.evaluator_user_id=v_uid and c.superseded_at is null;
  if v_current is distinct from p_expected_contribution_id then raise exception 'Evaluation changed since it was loaded' using errcode = '40001'; end if;
  perform public.record_player_evaluation(p_command_id, p_contribution_id, p_community_id, p_player_id, p_rubric_version, p_dimension_scores);
end;
$$;

create function public.community_evaluation_target_ids(p_community_ids uuid[])
returns setof uuid language plpgsql stable security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  return query select c.community_id from app_private.community_evaluation_cutovers c
  where c.community_id = any(p_community_ids)
    and public.current_user_is_active_community_member(c.community_id);
end;
$$;

create function app_private.reject_legacy_evaluation_target()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_community_id uuid;
begin
  if tg_op = 'INSERT' then
    perform 1 from public.communities where id = new.community_id for update;
  else
    for v_community_id in
      select distinct community_id
      from (values (old.community_id), (new.community_id)) as affected(community_id)
      where community_id is not null
      order by community_id
    loop
      perform 1 from public.communities where id = v_community_id for update;
    end loop;
  end if;
  if exists (select 1 from app_private.community_evaluation_cutovers where community_id=new.community_id)
     or (tg_op = 'UPDATE' and exists (
       select 1 from app_private.community_evaluation_cutovers where community_id=old.community_id
     )) then
    raise exception 'Legacy evaluation writes are disabled for this Community' using errcode = '23514';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger player_evaluations_target_guard
before insert or update on public.player_evaluations
for each row execute function app_private.reject_legacy_evaluation_target();

revoke all on function public.activate_community_evaluation_model(uuid), public.set_community_evaluator(uuid,uuid,boolean), public.get_community_evaluation_editor(uuid,uuid), public.record_community_player_evaluation(uuid,uuid,uuid,uuid,text,jsonb,uuid), public.community_evaluation_target_ids(uuid[]) from public, anon;
grant execute on function public.activate_community_evaluation_model(uuid), public.set_community_evaluator(uuid,uuid,boolean), public.get_community_evaluation_editor(uuid,uuid), public.record_community_player_evaluation(uuid,uuid,uuid,uuid,text,jsonb,uuid), public.community_evaluation_target_ids(uuid[]) to authenticated;
