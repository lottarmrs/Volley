-- Remediacao da auditoria de seguranca de 2026-09-08.
--
-- Sete correcoes independentes, agrupadas porque saem do mesmo laudo e compartilham a
-- suite de prova (src/test/db/securityAuditRemediation.dbtest.ts). Cada bloco cita o
-- achado que fecha. Nada aqui reescreve funcao nao relacionada: C6.01 proibe a migration
-- unica de reescrita, entao o endurecimento de search_path so acontece nas funcoes que
-- este arquivo ja precisava tocar por outro motivo (ADR-SEC-003, "harden by touched
-- surface").

-- ─────────────────────────────────────────────────────────────────────────────
-- A1/A2/A3 — RPCs de carreira: bypass de RLS aberto a qualquer conta autenticada
-- ─────────────────────────────────────────────────────────────────────────────
-- As tres sao security definer, estavam concedidas a `authenticated` e nao continham
-- nenhuma verificacao de autorizacao: o alvo vinha inteiro do parametro do chamador
-- (array de session_id, ou player_id). Como career_events recebe apenas `grant select`
-- (20260727100000:30-31), a escrita direta pelo cliente ja era deliberadamente negada --
-- e estas funcoes a devolviam.
--
-- A correcao e revogar o grant, NAO adicionar guarda de auth.uid() no corpo.
-- recalculate_player_career e chamada por handle_new_user() (schema.sql:2606), o trigger
-- de signup: ali nao existe sessao ainda e auth.uid() e NULL, entao uma guarda baseada em
-- identidade quebraria o cadastro com claim code. handle_new_user e security definer de
-- postgres, e a chamada interna resolve com os privilegios da dona -- independe destes
-- grants, que existiam apenas para o cliente que nunca os usou.
revoke execute on function public.regenerate_career_events_for_sessions(uuid[]) from authenticated;
revoke execute on function public.regenerate_player_milestones(uuid) from authenticated;
revoke execute on function public.recalculate_player_career(uuid) from authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- A4 — reset_product_data apagava dados de TODOS os inquilinos
-- ─────────────────────────────────────────────────────────────────────────────
-- A assinatura recebe uma conta alvo, mas so os dois ultimos DELETE a usavam: os dezesseis
-- anteriores varriam as tabelas inteiras. Master + AAL2 continuam exigidos (nao havia furo
-- de privilegio), mas o raio de alcance passa a ser o que a assinatura promete.
--
-- A maior parte do escopo vem de graca das FKs: sessions, communities e players cascateiam
-- para games/teams/point_events/reports/career_events. As excecoes sao
-- player_evaluation_contributions e player_evaluation_dimension_scores, que referenciam
-- players/communities com `on delete restrict` e por isso precisam sair antes, escopadas
-- na mao -- mesma razao registrada em XS-W5-01.
create or replace function public.reset_product_data(target_account_uuid text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_account uuid;
begin
  if not public.has_capability('reset_product_data') then
    raise exception 'Not authorized: missing reset_product_data capability';
  end if;
  perform public.require_aal2();

  v_account := nullif(pg_catalog.btrim(coalesce(target_account_uuid, '')), '')::uuid;
  if v_account is null then
    raise exception 'Target account is required' using errcode = '23514';
  end if;

  -- Permite o bypass da guarda de ultimo dono apenas nesta transacao. security definer:
  -- a flag vive na transacao do caller do reset. O trigger de auditoria tambem observa
  -- esta flag e para de auditar enquanto o reset roda (20260801120000).
  perform pg_catalog.set_config('app.allow_reset_bypass', 'on', true);

  -- Filhos com `on delete restrict` primeiro, escopados pela conta alvo.
  delete from public.player_evaluation_dimension_scores s
   where s.contribution_id in (
     select c.id
       from public.player_evaluation_contributions c
      where c.community_id in (select id from public.communities where owner_id = v_account)
         or c.player_id in (select id from public.players where owner_id = v_account)
   );
  delete from public.player_evaluation_contributions c
   where c.community_id in (select id from public.communities where owner_id = v_account)
      or c.player_id in (select id from public.players where owner_id = v_account);

  -- Dados operacionais da conta. career_events nao tem owner_id: e alcancada pelas tres
  -- entidades que a originam, todas ja escopadas por dono.
  delete from public.point_events where owner_id = v_account;
  delete from public.game_reports where owner_id = v_account;
  delete from public.games where owner_id = v_account;
  delete from public.teams where owner_id = v_account;
  delete from public.session_reports where owner_id = v_account;
  delete from public.career_events e
   where e.player_id in (select id from public.players where owner_id = v_account)
      or e.session_id in (select id from public.sessions where owner_id = v_account)
      or e.community_id in (select id from public.communities where owner_id = v_account);

  delete from public.championship_rounds r
   where r.championship_id in (select id from public.championships where owner_id = v_account);
  delete from public.championship_teams t
   where t.championship_id in (select id from public.championships where owner_id = v_account);
  delete from public.championships where owner_id = v_account;

  delete from public.sessions where owner_id = v_account;
  delete from public.player_evaluations where owner_id = v_account;
  delete from public.self_evaluations se
   where se.player_id in (select id from public.players where owner_id = v_account);
  delete from public.community_players where owner_id = v_account;
  delete from public.whatsapp_list_drafts where owner_id = v_account;
  delete from public.community_presence where owner_id = v_account;

  -- Preserva o player canonico da conta (has_account_identity_history = true).
  -- Ver constraint players_account_identity_history_check.
  delete from public.players
   where owner_id = v_account
     and not has_account_identity_history;
  delete from public.communities where owner_id = v_account;
end;
$$;

revoke all on function public.reset_product_data(text) from public, anon, authenticated;
grant execute on function public.reset_product_data(text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- A5 — modification_logs aceitava INSERT forjado (with check (true))
-- ─────────────────────────────────────────────────────────────────────────────
-- Causa raiz: 20260801120000 recriou log_table_changes() para adicionar o bypass de reset
-- e, no `create or replace`, nao repetiu `security definer` -- que nao e herdado. O trigger
-- virou security invoker, passou a inserir como o usuario chamador e a esbarrar no RLS de
-- modification_logs. Tres semanas depois, 20260820110000 destravou isso com
-- `with check (true)`, o que abriu a tabela de auditoria para qualquer authenticated gravar
-- linha arbitraria, atribuindo acao a terceiros.
--
-- Restaurar o security definer remove a necessidade da policy: postgres e dono da tabela e
-- nao tem forcerowsecurity, entao o trigger grava sem depender de policy alguma. O corpo e
-- identico ao de 20260801120000, so muda o cabecalho (definer + search_path alvo) e a
-- qualificacao completa que o search_path vazio exige.
create or replace function public.log_table_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  record_owner uuid;
  record_community uuid;
begin
  -- Reset autorizado desativa a auditoria dentro da transacao.
  if coalesce(pg_catalog.current_setting('app.allow_reset_bypass', true), '') = 'on' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if (tg_op = 'INSERT') then
    record_owner := nullif(pg_catalog.to_jsonb(new)->>'owner_id', '')::uuid;
    record_community := coalesce(
      nullif(pg_catalog.to_jsonb(new)->>'community_id', '')::uuid,
      case when tg_table_name = 'communities' then new.id else null end
    );

    insert into public.modification_logs (
      owner_id, community_id, changed_by, table_name, record_id, action_type, old_data, new_data
    ) values (
      record_owner, record_community, (select auth.uid()), tg_table_name, new.id::text, tg_op,
      null, pg_catalog.to_jsonb(new)
    );
    return new;
  elsif (tg_op = 'UPDATE') then
    record_owner := coalesce(
      nullif(pg_catalog.to_jsonb(new)->>'owner_id', '')::uuid,
      nullif(pg_catalog.to_jsonb(old)->>'owner_id', '')::uuid
    );
    record_community := coalesce(
      nullif(pg_catalog.to_jsonb(new)->>'community_id', '')::uuid,
      nullif(pg_catalog.to_jsonb(old)->>'community_id', '')::uuid,
      case when tg_table_name = 'communities' then new.id else null end
    );

    insert into public.modification_logs (
      owner_id, community_id, changed_by, table_name, record_id, action_type, old_data, new_data
    ) values (
      record_owner, record_community, (select auth.uid()), tg_table_name, new.id::text, tg_op,
      pg_catalog.to_jsonb(old), pg_catalog.to_jsonb(new)
    );
    return new;
  elsif (tg_op = 'DELETE') then
    record_owner := nullif(pg_catalog.to_jsonb(old)->>'owner_id', '')::uuid;
    record_community := coalesce(
      nullif(pg_catalog.to_jsonb(old)->>'community_id', '')::uuid,
      case when tg_table_name = 'communities' then old.id else null end
    );

    insert into public.modification_logs (
      owner_id, community_id, changed_by, table_name, record_id, action_type, old_data, new_data
    ) values (
      record_owner, record_community, (select auth.uid()), tg_table_name, old.id::text, tg_op,
      pg_catalog.to_jsonb(old), null
    );
    return old;
  end if;
  return null;
end;
$$;

revoke all on function public.log_table_changes() from public, anon, authenticated;

-- Com o trigger de volta a security definer, nenhum papel de navegador precisa inserir
-- diretamente na trilha de auditoria.
drop policy if exists "Authenticated users can insert modification logs" on public.modification_logs;
revoke insert on table public.modification_logs from authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- A6 — find_player_by_username expunha o nome real de qualquer atleta
-- ─────────────────────────────────────────────────────────────────────────────
-- A funcao serve dois fluxos legitimos: a checagem de disponibilidade de username no
-- cadastro (AuthForm.tsx:109), que so precisa saber se a linha existe, e a busca de atleta
-- para vincular a uma comunidade (AthleteUsernameSearch.tsx), que precisa do nome para
-- confirmar a pessoa. Remover a funcao ou o `id` quebraria os dois.
--
-- O que sai e a divulgacao do nome para quem nao tem relacao nenhuma com o atleta: agora
-- `name` volta NULL a menos que o chamador compartilhe comunidade com ele
-- (current_user_can_access_player) ou administre alguma comunidade -- que e exatamente
-- quem usa a busca de vinculo. A disponibilidade de username segue funcionando porque
-- depende da presenca da linha, nao do nome.
create or replace function public.find_player_by_username(target_username text)
returns table (id uuid, username text, name text)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.id,
    p.username,
    case
      when public.current_user_can_access_player(p.id) then p.name
      when exists (
        select 1
          from public.community_memberships m
         where m.user_id = (select auth.uid())
           and m.status = 'active'
           and m.role = any(array['owner', 'admin'])
      ) then p.name
      else null
    end as name
  from public.players p
  where pg_catalog.lower(p.username) = pg_catalog.lower(pg_catalog.btrim(target_username))
    and p.deleted_at is null
  limit 1;
$$;

revoke all on function public.find_player_by_username(text) from public, anon, authenticated;
grant execute on function public.find_player_by_username(text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- A7 — community_capabilities revelava o grafo de papeis de qualquer usuario
-- ─────────────────────────────────────────────────────────────────────────────
-- O parametro target_user_id e livre e nunca foi comparado com auth.uid(), entao qualquer
-- authenticated podia sondar o par (comunidade, usuario) e descobrir quem administra o que.
-- O unico chamador e current_user_has_community_capability (20260827150000:184), que e
-- security definer e resolve a chamada interna com os privilegios da dona -- o grant a
-- authenticated nunca foi necessario. Mesmo tratamento ja dado a
-- assert_target_session_write_authorized (20260828034435:172-173).
revoke execute on function public.community_capabilities(uuid, uuid) from authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- A8 — ramo owner_id preservava privilegio de quem foi rebaixado
-- ─────────────────────────────────────────────────────────────────────────────
-- O INSERT destas tabelas exige as DUAS condicoes (`and`): a linha so nasce se o criador
-- for owner/admin/organizer naquele momento. UPDATE e DELETE aceitavam QUALQUER uma
-- (`or`), e como owner_id guarda quem criou a linha, o primeiro ramo permanecia verdadeiro
-- para sempre -- quem criou a regra como admin e depois virou membro comum continuava
-- podendo altera-la e apaga-la, embora a UI ja nao oferecesse a acao.
--
-- Alinhar ao INSERT e a correcao. Consequencia deliberada: um ex-organizador perde a
-- escrita sobre linhas que criou, inclusive pelo caminho de sync -- que e a semantica de
-- autorizacao correta, ja que ele nao administra mais aquela comunidade.
drop policy if exists "Community owners and admins can update community rules" on public.community_rules;
create policy "Community owners and admins can update community rules" on public.community_rules
  for update to authenticated
  using (owner_id = (select auth.uid()) and public.current_user_has_community_role(community_id, array['owner', 'admin']))
  with check (owner_id = (select auth.uid()) and public.current_user_has_community_role(community_id, array['owner', 'admin']));

drop policy if exists "Community owners and admins can delete community rules" on public.community_rules;
create policy "Community owners and admins can delete community rules" on public.community_rules
  for delete to authenticated
  using (owner_id = (select auth.uid()) and public.current_user_has_community_role(community_id, array['owner', 'admin']));

drop policy if exists "Community organizers can update whatsapp templates" on public.whatsapp_list_templates;
create policy "Community organizers can update whatsapp templates" on public.whatsapp_list_templates
  for update to authenticated
  using (owner_id = (select auth.uid()) and public.current_user_has_community_role(community_id))
  with check (owner_id = (select auth.uid()) and public.current_user_has_community_role(community_id));

drop policy if exists "Community organizers can delete whatsapp templates" on public.whatsapp_list_templates;
create policy "Community organizers can delete whatsapp templates" on public.whatsapp_list_templates
  for delete to authenticated
  using (owner_id = (select auth.uid()) and public.current_user_has_community_role(community_id));

drop policy if exists "Community organizers can update community players" on public.community_players;
create policy "Community organizers can update community players" on public.community_players
  for update to authenticated
  using (
    owner_id = (select auth.uid())
    and public.current_user_has_community_role(community_id, array['owner', 'admin', 'organizer'])
  )
  with check (
    owner_id = (select auth.uid())
    and public.current_user_has_community_role(community_id, array['owner', 'admin', 'organizer'])
  );

drop policy if exists "Community organizers can delete community players" on public.community_players;
create policy "Community organizers can delete community players" on public.community_players
  for delete to authenticated
  using (
    owner_id = (select auth.uid())
    and public.current_user_has_community_role(community_id, array['owner', 'admin', 'organizer'])
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- A9 — bucket de avatares tinha leitura anonima, inclusive das propostas
-- ─────────────────────────────────────────────────────────────────────────────
-- A policy de SELECT nao declarava clausula `to`, entao valia para o papel `public` --
-- inclusive anon -- sobre o bucket inteiro. As tres policies de escrita logo abaixo dela
-- ja eram restritas a `to authenticated` + current_user_is_player_admin, mas a leitura
-- cobria tambem o prefixo proposals/<player_id>/, isto e, as fotos que ainda NAO passaram
-- pela aprovacao. Avatar aprovado continua publico por design; a proposta deixa de ser.
drop policy if exists "Avatars are publicly readable" on storage.objects;
-- O harness de teste nao recria o schema `storage` entre builds, entao a policy nova
-- precisa ser idempotente como as demais deste arquivo.
drop policy if exists "Approved avatars are publicly readable" on storage.objects;
create policy "Approved avatars are publicly readable" on storage.objects
  for select
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] is distinct from 'proposals');

drop policy if exists "Player admins can read avatar candidates" on storage.objects;
create policy "Player admins can read avatar candidates" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = 'proposals'
    and public.current_user_is_player_admin(((storage.foldername(name))[2])::uuid)
  );
