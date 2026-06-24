-- ============================================================================
-- Gestão de papéis globais (módulo de administração do app).
--
-- Necessário para o painel de Gestão (staff):
--   1. Staff (master|programmer) precisa LER todos os profiles para listar
--      usuários e seus papéis.
--   2. Só master pode ALTERAR o papel de outro usuário — via RPC controlada.
--
-- Hardening de brinde (corrige escalonamento de privilégio):
--   A policy de UPDATE de profiles é `id = auth.uid()` sem restrição de coluna,
--   ou seja, um usuário poderia trocar o PRÓPRIO `role` para 'master' num update
--   normal. Travamos a coluna `role` com um trigger: ela só muda quando a flag
--   transação-local `app.allow_role_change` está ligada, e isso só acontece
--   dentro do RPC `set_user_role` (master-only). Edição de nome/etc. segue livre.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Leitura de todos os profiles para staff
-- ----------------------------------------------------------------------------
drop policy if exists "App staff can read all profiles" on public.profiles;
create policy "App staff can read all profiles" on public.profiles
  for select to authenticated
  using (public.is_app_staff());

-- ----------------------------------------------------------------------------
-- 2. Trava de coluna: profiles.role só muda dentro do fluxo administrativo
-- ----------------------------------------------------------------------------
create or replace function public.guard_profile_role()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.role is distinct from old.role
     and coalesce(current_setting('app.allow_role_change', true), '') <> 'on' then
    raise exception 'O papel só pode ser alterado por um administrador (master).'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function public.guard_profile_role() from public, anon, authenticated;

drop trigger if exists trg_guard_profile_role on public.profiles;
create trigger trg_guard_profile_role
  before update on public.profiles
  for each row execute function public.guard_profile_role();

-- ----------------------------------------------------------------------------
-- 3. RPC: alterar o papel de um usuário (somente master)
--    - valida o novo papel
--    - impede rebaixar o ÚLTIMO master (evita travar o sistema sem superadmin)
-- ----------------------------------------------------------------------------
create or replace function public.set_user_role(
  target_user_id uuid,
  new_role text
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  updated public.profiles;
begin
  if not public.is_superadmin() then
    raise exception 'Apenas um master pode alterar papéis.' using errcode = '42501';
  end if;

  if new_role not in ('master', 'programmer', 'user') then
    raise exception 'Papel inválido: %', new_role using errcode = '22023';
  end if;

  -- Protege o último master: não permite rebaixá-lo.
  if new_role <> 'master'
     and exists (select 1 from public.profiles where id = target_user_id and role = 'master')
     and (select count(*) from public.profiles where role = 'master') <= 1 then
    raise exception 'Não é possível rebaixar o último master.' using errcode = '42501';
  end if;

  perform set_config('app.allow_role_change', 'on', true);

  update public.profiles
     set role = new_role,
         updated_at = now()
   where id = target_user_id
   returning * into updated;

  if updated.id is null then
    raise exception 'Usuário não encontrado.' using errcode = '22023';
  end if;

  return updated;
end;
$$;

revoke execute on function public.set_user_role(uuid, text) from public, anon;
grant execute on function public.set_user_role(uuid, text) to authenticated;
