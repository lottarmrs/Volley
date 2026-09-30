-- O membro le o historico (spec 2026-09-30-membro-le-o-historico-design.md).
-- 1. Membro ativo le toda pelada da comunidade que nao e rascunho, com times, jogos, pontos e
--    relatorios. PRIVATE/PUBLISHED e ignorado: nada no app publica sessao.
-- 2. Apagar historico (pelada nao rascunho) e apagar convidado sao so do dono da comunidade.

create or replace function public.current_user_can_read_community_session(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.sessions s
     where s.id = p_session_id
       and (
         s.owner_id = (select auth.uid())
         or (
           s.community_id is not null
           and public.current_user_has_community_role(s.community_id)
         )
         or (
           s.community_id is not null
           and s.deleted_at is null
           and (
             (s.authority_model = 'legacy' and s.status is distinct from 'draft')
             or (s.authority_model = 'target' and s.lifecycle_status is distinct from 'DRAFT')
           )
           and exists (
             select 1
               from public.community_members cm
              where cm.community_id = s.community_id
                and cm.user_id = (select auth.uid())
                and cm.status = 'active'
           )
         )
       )
  );
$$;

revoke all on function public.current_user_can_read_community_session(uuid) from public, anon;
grant execute on function public.current_user_can_read_community_session(uuid) to authenticated;

drop policy if exists "Community members can read sessions" on public.sessions;
create policy "Community members can read sessions" on public.sessions
  for select to authenticated
  using (public.current_user_can_read_community_session(id));

drop policy if exists "Community members can read teams" on public.teams;
create policy "Community members can read teams" on public.teams
  for select to authenticated
  using (owner_id = (select auth.uid()) or public.current_user_can_read_community_session(session_id));

drop policy if exists "Community members can read games" on public.games;
create policy "Community members can read games" on public.games
  for select to authenticated
  using (owner_id = (select auth.uid()) or public.current_user_can_read_community_session(session_id));

drop policy if exists "Community members can read point events" on public.point_events;
create policy "Community members can read point events" on public.point_events
  for select to authenticated
  using (owner_id = (select auth.uid()) or public.current_user_can_read_community_session(session_id));

drop policy if exists "Community members can read game reports" on public.game_reports;
create policy "Community members can read game reports" on public.game_reports
  for select to authenticated
  using (owner_id = (select auth.uid()) or public.current_user_can_read_community_session(session_id));

drop policy if exists "Community members can read session reports" on public.session_reports;
create policy "Community members can read session reports" on public.session_reports
  for select to authenticated
  using (owner_id = (select auth.uid()) or public.current_user_can_read_community_session(session_id));

create or replace function app_private.guard_history_delete_owner_only()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    return new;
  end if;
  if old.deleted_at is null and new.deleted_at is not null
     and new.community_id is not null
     and not (
       (new.authority_model = 'legacy' and new.status = 'draft')
       or (new.authority_model = 'target' and new.lifecycle_status = 'DRAFT')
     )
     and not public.current_user_has_community_role(new.community_id, array['owner']) then
    raise exception 'Only the Community owner can delete history' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function app_private.guard_history_delete_owner_only() from public, anon, authenticated;

drop trigger if exists zz_guard_history_delete_owner_only on public.sessions;
create trigger zz_guard_history_delete_owner_only
  before update on public.sessions
  for each row execute function app_private.guard_history_delete_owner_only();

create or replace function app_private.guard_guest_delete_owner_only()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    return new;
  end if;
  if old.deleted_at is null and new.deleted_at is not null
     and not public.player_has_account(new.id)
     and not exists (
       select 1
         from public.community_players cp
        where cp.player_id = new.id
          and cp.deleted_at is null
          and public.current_user_has_community_role(cp.community_id, array['owner'])
     ) then
    raise exception 'Only the Community owner can delete a guest' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function app_private.guard_guest_delete_owner_only() from public, anon, authenticated;

drop trigger if exists zz_guard_guest_delete_owner_only on public.players;
create trigger zz_guard_guest_delete_owner_only
  before update on public.players
  for each row execute function app_private.guard_guest_delete_owner_only();
