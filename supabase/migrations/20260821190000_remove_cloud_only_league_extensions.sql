-- Remove as extensoes de liga aplicadas direto no projeto em 2026-08-21 e que nunca
-- entraram no repositorio: championship_team_identity, league_organizer_can_run_rounds,
-- championship_requests_and_reschedule_guard e captain_accepts_reschedule.
--
-- Nenhum cliente deste repositorio usa essas estruturas, e duas delas quebravam o sync:
--   * current_user_can_manage_championship exigia deleted_at is null, entao o tombstone de
--     rodada ou time de uma liga ja excluida era recusado com 42501 a cada sync;
--   * championship_rounds_date_guard recusava toda mudanca de scheduled_date sem uma
--     solicitacao aprovada, e o app remarca rodada localmente e sobe pelo sync.
-- O cargo `organizador` tambem deixa de administrar liga: a partir de 20260827150000 ele
-- vira a responsabilidade ORGANIZER, e administracao de competicao pertence a W8.
--
-- As colunas de identidade do time (sigla, cores, escudo) ficam: ja guardam dado em
-- producao. Declaradas aqui com if not exists, um banco novo termina igual ao projeto.
-- O bucket team-crests fica vazio e sem policy; storage.buckets recusa DELETE por SQL,
-- entao removê-lo e pelo painel ou pela Storage API.
--
-- Em um banco construido so pelo repositorio, tudo abaixo que remove e no-op.

drop policy if exists "Team crests are publicly readable" on storage.objects;
drop policy if exists "League organizers can upload team crests" on storage.objects;
drop policy if exists "League organizers can replace team crests" on storage.objects;
drop policy if exists "League organizers can delete team crests" on storage.objects;

drop trigger if exists championship_rounds_date_guard on public.championship_rounds;
drop function if exists public.enforce_round_date_via_approval();

drop table if exists public.championship_requests;
drop function if exists public.championship_request_transition_guard();
drop function if exists public.opponent_team_of_request(uuid);
drop function if exists public.current_user_is_team_captain(uuid);

drop index if exists public.championship_teams_captain_idx;
alter table public.championship_teams drop column if exists captain_player_id;

drop policy if exists "League organizers can update championship teams"
  on public.championship_teams;
drop policy if exists "Community owner or admin can update championship teams"
  on public.championship_teams;
create policy "Community owner or admin can update championship teams"
  on public.championship_teams
  for update to authenticated
  using (
    exists (
      select 1 from public.championships c
      where c.id = championship_teams.championship_id
        and public.current_user_has_community_role(c.community_id, array['owner', 'admin'])
    )
  )
  with check (
    exists (
      select 1 from public.championships c
      where c.id = championship_teams.championship_id
        and public.current_user_has_community_role(c.community_id, array['owner', 'admin'])
    )
  );

drop policy if exists "League organizers can update championship rounds"
  on public.championship_rounds;
drop policy if exists "Community owner or admin can update championship rounds"
  on public.championship_rounds;
create policy "Community owner or admin can update championship rounds"
  on public.championship_rounds
  for update to authenticated
  using (
    exists (
      select 1 from public.championships c
      where c.id = championship_rounds.championship_id
        and public.current_user_has_community_role(c.community_id, array['owner', 'admin'])
    )
  )
  with check (
    exists (
      select 1 from public.championships c
      where c.id = championship_rounds.championship_id
        and public.current_user_has_community_role(c.community_id, array['owner', 'admin'])
    )
  );

drop function if exists public.current_user_can_manage_championship(uuid);

alter table public.championship_teams
  add column if not exists short_name text,
  add column if not exists color text,
  add column if not exists secondary_color text,
  add column if not exists crest_url text;

alter table public.championship_teams
  drop constraint if exists championship_teams_short_name_len;
alter table public.championship_teams
  add constraint championship_teams_short_name_len
  check (short_name is null or char_length(short_name) between 2 and 4);
