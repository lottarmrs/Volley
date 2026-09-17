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
begin
  select coalesce(nullif(name, ''), split_part(email, '@', 1), 'Atleta') into v_name
    from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'Conta do membro não encontrada.' using errcode = '23503';
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
  values (p_user_id, p_community_id, v_player.id, true, 'active')
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

create or replace function public.approve_join_request(p_member_id uuid)
returns public.community_members
language plpgsql
security definer
set search_path = public
as $$
declare
  v_comm uuid;
  v_row  public.community_members;
begin
  select community_id into v_comm from public.community_members where id = p_member_id;
  if v_comm is null then
    raise exception 'Solicitacao nao encontrada' using errcode = '22023';
  end if;
  if not (public.is_superadmin()
          or public.community_has_capability(v_comm, 'approve_members')) then
    raise exception 'Apenas quem tem approve_members pode aprovar solicitacoes' using errcode = '42501';
  end if;

  update public.community_members
     set status = 'active', updated_at = now()
   where id = p_member_id
   returning * into v_row;

  perform app_private.enroll_approved_member(v_row.community_id, v_row.user_id);
  return v_row;
end;
$$;

create or replace function public.approve_community_join_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_community_id uuid;
  v_applicant uuid;
  v_status text;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  select r.community_id, r.user_id, r.status
    into v_community_id, v_applicant, v_status
    from public.community_join_requests r
   where r.id = p_request_id
   for update;

  if v_community_id is null then
    raise exception 'Join request not found' using errcode = '23503';
  end if;

  if not public.current_user_has_community_capability(v_community_id, 'community.members.manage') then
    raise exception 'Missing capability community.members.manage' using errcode = '42501';
  end if;

  if v_status <> 'pending' then
    raise exception 'Join request is already %', v_status using errcode = '23514';
  end if;

  update public.community_join_requests
     set status = 'approved', decided_at = now(), decided_by = v_uid
   where id = p_request_id;
  insert into public.community_memberships (community_id, user_id, role, status)
  values (v_community_id, v_applicant, 'member', 'active')
  on conflict (community_id, user_id)
  do update set status = 'active', updated_at = now();
  perform app_private.enroll_approved_member(v_community_id, v_applicant);
end;
$$;

create or replace function public.add_community_member_by_identifier(
  target_community_id uuid,
  target_identifier text,
  target_role text default 'member'
)
returns public.community_members
language plpgsql
security definer
set search_path = public
as $$
declare
  v_identifier text := trim(target_identifier);
  v_user_id uuid;
  v_player_user_id uuid;
  v_existing public.community_members;
  inserted_member public.community_members;
begin
  if v_identifier is null or v_identifier = '' then
    raise exception 'Informe um e-mail ou username' using errcode = '22023';
  end if;

  if target_role not in ('owner', 'admin', 'moderator', 'organizador', 'member') then
    raise exception 'Invalid community member role: %', target_role using errcode = '22023';
  end if;

  if not (
    public.is_superadmin()
    or public.community_has_capability(target_community_id, 'manage_members')
  ) then
    raise exception 'Apenas quem tem manage_members pode adicionar membros'
      using errcode = '42501';
  end if;

  if position('@' in v_identifier) > 0 then
    select p.id into v_user_id
      from public.profiles p
     where lower(p.email) = lower(v_identifier)
     limit 1;

    if v_user_id is null then
      raise exception 'Nenhuma conta encontrada para o e-mail %', v_identifier
        using errcode = '22023';
    end if;
  else
    select pl.user_id into v_player_user_id
      from public.players pl
     where lower(pl.username) = lower(v_identifier)
       and pl.deleted_at is null
     limit 1;

    if not found then
      raise exception 'Nenhum atleta encontrado com o username %', v_identifier
        using errcode = '22023';
    end if;
    if v_player_user_id is null then
      raise exception 'O atleta % ainda nao tem conta vinculada. Use o codigo de claim para ele reivindicar o perfil.', v_identifier
        using errcode = '22023';
    end if;

    v_user_id := v_player_user_id;
  end if;

  select * into v_existing
    from public.community_members
   where community_id = target_community_id and user_id = v_user_id;

  if v_existing.id is not null and v_existing.status = 'active' then
    raise exception 'Ja e membro da comunidade' using errcode = '22023';
  end if;

  insert into public.community_members (community_id, user_id, role, status, created_by)
  values (target_community_id, v_user_id, target_role, 'active', (select auth.uid()))
  on conflict (community_id, user_id)
  do update set role = excluded.role, status = 'active', updated_at = now()
  returning * into inserted_member;

  perform app_private.enroll_approved_member(inserted_member.community_id, inserted_member.user_id);
  return inserted_member;
end;
$$;

do $$
declare
  v_member record;
begin
  for v_member in
    with effective_members as (
      select m.community_id, m.user_id
        from public.community_members m
        join public.communities c on c.id = m.community_id
       where m.status = 'active' and c.authority_model = 'legacy'
      union
      select m.community_id, m.user_id
        from public.community_memberships m
        join public.communities c on c.id = m.community_id
       where m.status = 'active' and c.authority_model = 'target'
    )
    select m.community_id, m.user_id
      from effective_members m
     where not exists (
       select 1 from public.players p
        where p.user_id = m.user_id and p.deleted_at is not null
     )
       and not exists (
         select 1 from public.community_players cp
         join public.players p on p.id = cp.player_id
          where cp.community_id = m.community_id and p.user_id = m.user_id
       )
     order by m.user_id, m.community_id
  loop
    perform app_private.enroll_approved_member(v_member.community_id, v_member.user_id);
  end loop;
end;
$$;
