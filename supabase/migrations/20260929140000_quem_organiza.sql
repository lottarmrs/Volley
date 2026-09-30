-- Quem organiza (spec 2026-09-29-quem-organiza-design.md): o quadro da inscricao mostra o nome
-- de quem organiza a pelada a todos os membros da comunidade. Le quem a policy de leitura de
-- session_organizer_assignments ja deixa ler: membro ativo da comunidade de uma sessao COMMUNITY.

create or replace function public.get_session_organizer(p_session_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_organizer uuid;
  v_name text;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if not exists (
    select 1
      from public.sessions s
      join public.community_memberships m on m.community_id = s.community_id
     where s.id = p_session_id
       and s.session_context = 'COMMUNITY'
       and m.user_id = v_uid
       and m.status = 'active'
  ) then
    raise exception 'Not a member of this session''s Community' using errcode = '42501';
  end if;

  select a.organizer_user_id into v_organizer
    from public.session_organizer_assignments a
   where a.session_id = p_session_id
     and a.revoked_at is null
     and a.organizer_user_id is not null
   order by a.assigned_at desc
   limit 1;
  if v_organizer is null then
    return null;
  end if;

  select coalesce(nullif(pg_catalog.btrim(p.nickname), ''), p.name) into v_name
    from public.players p
   where p.user_id = v_organizer and p.deleted_at is null
   limit 1;
  if v_name is null then
    select pr.name into v_name from public.profiles pr where pr.id = v_organizer;
  end if;

  return pg_catalog.jsonb_build_object('user_id', v_organizer, 'name', coalesce(v_name, 'Membro'));
end;
$$;

revoke all on function public.get_session_organizer(uuid) from public, anon;
grant execute on function public.get_session_organizer(uuid) to authenticated;
