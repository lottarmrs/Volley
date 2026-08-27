-- ============================================================================
-- RBAC: papéis globais (master / programmer / user) + endurecimento de segurança
-- ----------------------------------------------------------------------------
-- Objetivos:
--   1. Introduzir papéis GLOBAIS reais em public.profiles, de forma segura para
--      os dados já existentes (text + check, NÃO enum -- mantém o estilo do
--      schema e permite evoluir sem ALTER TYPE).
--   2. Criar uma fonte única de verdade para "staff" do app:
--        - is_superadmin()  -> apenas 'master'      (bypass de ESCRITA total)
--        - is_app_staff()   -> 'master'|'programmer' (bypass de LEITURA/suporte)
--   3. Injetar o bypass nos helpers de RLS já existentes (corrige o bug em que o
--      frontend liberava ações que o banco rejeitava -> travava a fila de sync).
--   4. Endurecer brechas reais encontradas na auditoria:
--        a) players UPDATE estava liberado para QUALQUER membro da comunidade.
--        b) admin de comunidade podia se auto-promover a 'owner' (escalonamento).
--   5. Manter os papéis de COMUNIDADE como estão (owner/admin/organizer) -- o
--      rename para admin/moderator/player foi descartado por quebrar dados e o
--      conceito de owner.
--
-- IMPORTANTE (ordem de aplicação):
--   As migrations locais de avatar/avaliação/vínculo (20260617/20260623/20260624)
--   ainda NÃO estão aplicadas no projeto remoto. Aplique-as ANTES desta. Esta
--   migration tem timestamp posterior de propósito, para rodar por último e
--   manter o bypass de superadmin nos helpers que aquelas migrations definem.
--   As partes que dependem de objetos opcionais estão protegidas por guardas.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Papéis globais em public.profiles  (admin/organizer -> master/user)
-- ----------------------------------------------------------------------------
do $$
declare
  c text;
begin
  -- remove qualquer check antigo sobre a coluna role (nome pode variar)
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%role%'
  loop
    execute format('alter table public.profiles drop constraint %I', c);
  end loop;
end $$;

alter table public.profiles alter column role drop default;

-- migra os dados existentes: 'admin' -> 'master', o resto -> 'user'
update public.profiles
   set role = case role
                when 'admin'     then 'master'
                when 'programmer' then 'programmer'
                when 'master'    then 'master'
                else 'user'
              end;

alter table public.profiles alter column role set default 'user';

alter table public.profiles
  add constraint profiles_role_check check (role in ('master', 'programmer', 'user'));

-- >>> AÇÃO MANUAL: promova a SUA conta a master (substitua o e-mail).
--     Hoje todos os 3 perfis estão como 'user'; ninguém é master por padrão.
-- update public.profiles set role = 'master' where lower(email) = lower('seu-email@exemplo.com');

-- ----------------------------------------------------------------------------
-- 2. Fonte única de verdade para staff do app
-- ----------------------------------------------------------------------------
create or replace function public.is_superadmin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'master'
  );
$$;
revoke execute on function public.is_superadmin() from public, anon;
grant execute on function public.is_superadmin() to authenticated;

create or replace function public.is_app_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role in ('master', 'programmer')
  );
$$;
revoke execute on function public.is_app_staff() from public, anon;
grant execute on function public.is_app_staff() to authenticated;

-- ----------------------------------------------------------------------------
-- 3. Bypass nos helpers de RLS existentes
--    - ESCRITA (community role) -> só superadmin (master)
--    - LEITURA de atleta        -> staff (master|programmer) para suporte
-- ----------------------------------------------------------------------------
create or replace function public.current_user_has_community_role(
  target_community_id uuid,
  allowed_roles text[] default array['owner', 'admin', 'organizer']
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_superadmin() or exists (
    select 1
    from public.community_members cm
    where cm.community_id = target_community_id
      and cm.user_id = (select auth.uid())
      and cm.role = any(allowed_roles)
  );
$$;

create or replace function public.current_user_can_access_player(target_player_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_app_staff()
  or exists (
    select 1 from public.players p
    where p.id = target_player_id
      and p.owner_id = (select auth.uid())
  )
  or exists (
    select 1
    from public.community_players cp
    join public.community_members cm on cm.community_id = cp.community_id
    where cp.player_id = target_player_id
      and cp.active = true
      and cm.user_id = (select auth.uid())
  );
$$;

-- current_user_is_player_admin: gate de ESCRITA da identidade global do atleta e
-- do fluxo de aprovação de vínculo/avatar. Recebe o bypass de superadmin.
-- (Definida aqui com timestamp posterior para sobrepor a versão sem bypass da
--  migration de avatares, caso ambas sejam aplicadas.)
create or replace function public.current_user_is_player_admin(target_player_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_superadmin()
  or exists (
    select 1 from public.players p
    where p.id = target_player_id
      and p.owner_id = (select auth.uid())
  )
  or exists (
    select 1
    from public.community_players cp
    join public.community_members cm on cm.community_id = cp.community_id
    where cp.player_id = target_player_id
      and cp.active = true
      and cm.user_id = (select auth.uid())
      and cm.role = any(array['owner', 'admin'])
  );
$$;
revoke execute on function public.current_user_is_player_admin(uuid) from public, anon;
grant execute on function public.current_user_is_player_admin(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 4a. HARDENING: players UPDATE só para dono/admin do atleta (não para qualquer
--     membro). A edição "pessoal" de organizadores deve ir para player_evaluations,
--     não para a linha canônica de public.players.
-- ----------------------------------------------------------------------------
drop policy if exists "Community members can update players" on public.players;
drop policy if exists "Player admins can update players" on public.players;
create policy "Player admins can update players" on public.players
  for update to authenticated
  using (
    owner_id = (select auth.uid())
    or public.current_user_is_player_admin(id)
  )
  with check (
    owner_id = (select auth.uid())
    or public.current_user_is_player_admin(id)
  );

-- ----------------------------------------------------------------------------
-- 4b. HARDENING: anti-escalonamento de papel 'owner' em community_members.
--     - Só o owner atual (ou o criador da comunidade no 1º vínculo, ou superadmin)
--       pode atribuir 'owner'.
--     - Admin não pode alterar/remover a linha do owner.
-- ----------------------------------------------------------------------------
create or replace function public.guard_community_member_owner_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid        uuid := (select auth.uid());
  v_actor_role text;
  v_is_creator boolean;
begin
  if public.is_superadmin() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  select role into v_actor_role
  from public.community_members
  where community_id = coalesce(new.community_id, old.community_id)
    and user_id = v_uid;

  if tg_op in ('INSERT', 'UPDATE') and new.role = 'owner' then
    v_is_creator := exists (
      select 1 from public.communities c
      where c.id = new.community_id and c.owner_id = v_uid
    );
    if not (v_actor_role = 'owner' or (new.user_id = v_uid and v_is_creator)) then
      raise exception 'Apenas o dono da comunidade pode atribuir o papel owner'
        using errcode = '42501';
    end if;
  end if;

  if tg_op in ('UPDATE', 'DELETE')
     and old.role = 'owner'
     and old.user_id <> v_uid
     and coalesce(v_actor_role, '') <> 'owner' then
    raise exception 'Apenas o dono pode modificar o vínculo do owner'
      using errcode = '42501';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists trg_guard_community_member_owner_role on public.community_members;
create trigger trg_guard_community_member_owner_role
  before insert or update or delete on public.community_members
  for each row execute function public.guard_community_member_owner_role();

-- ----------------------------------------------------------------------------
-- 5. RPC de convite: permitir também o superadmin (semeadura/suporte).
-- ----------------------------------------------------------------------------
create or replace function public.add_community_member_by_email(
  target_community_id uuid,
  target_email text,
  target_role text default 'organizer'
)
returns public.community_members
language plpgsql
security definer
set search_path = public
as $$
declare
  target_user_id uuid;
  inserted_member public.community_members;
begin
  if target_role not in ('owner', 'admin', 'organizer') then
    raise exception 'Invalid community member role: %', target_role using errcode = '22023';
  end if;

  if not (
    public.is_superadmin()
    or public.current_user_has_community_role(target_community_id, array['owner', 'admin'])
  ) then
    raise exception 'Only owners and admins can add community members' using errcode = '42501';
  end if;

  select p.id into target_user_id
  from public.profiles p
  where lower(p.email) = lower(trim(target_email))
  limit 1;

  if target_user_id is null then
    raise exception 'No registered user found for email %', target_email using errcode = '22023';
  end if;

  insert into public.community_members (community_id, user_id, role, created_by)
  values (target_community_id, target_user_id, target_role, (select auth.uid()))
  on conflict (community_id, user_id)
  do update set role = excluded.role, updated_at = now()
  returning * into inserted_member;

  return inserted_member;
end;
$$;

-- ----------------------------------------------------------------------------
-- 6. Acesso de LEITURA para suporte (programmer + master) nas tabelas
--    operacionais. Políticas PERMISSIVAS adicionais (OR), somente SELECT.
--    A escrita continua exigindo papel de comunidade / superadmin.
-- ----------------------------------------------------------------------------
do $$
declare
  t text;
  tables text[] := array[
    'communities', 'community_members', 'community_rules', 'community_players',
    'sessions', 'teams', 'games', 'point_events', 'game_reports', 'session_reports'
  ];
begin
  foreach t in array tables loop
    if to_regclass('public.' || t) is not null then
      execute format('drop policy if exists "App staff can read %1$s" on public.%1$I', t);
      execute format(
        'create policy "App staff can read %1$s" on public.%1$I for select to authenticated using (public.is_app_staff())',
        t
      );
    end if;
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- 7. Avaliações e vínculo de atleta (objetos opcionais -> guardas de existência)
--    - player_evaluations: leitura já cobre staff via current_user_can_access_player.
--    - player_link_proposals: adiciona leitura de staff para o painel de suporte.
-- ----------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.player_link_proposals') is not null then
    execute 'drop policy if exists "App staff can read link proposals" on public.player_link_proposals';
    execute 'create policy "App staff can read link proposals" on public.player_link_proposals
             for select to authenticated using (public.is_app_staff())';
  end if;
end $$;
