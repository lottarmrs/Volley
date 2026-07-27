# Roles, Permissions & Auth Security Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the auth/RBAC gaps found in the auth audit and approved in brainstorm
(`.superpowers/brainstorm/2204-1784730543` session, roles/permissions follow-up):
global capabilities for `master`/`programmer` (with a hard guard so `programmer` can
never touch a community `owner`), a new `organizador` community role, per-community
capability overrides, hidden member email (visible only to capability holders), an
8-character password minimum, session invalidation on password change, and mandatory
TOTP for `master`/`programmer`/community `owner` — enforced both client-side and at
the database layer.

**Architecture:** Two new capability tables (`global_role_capabilities`,
`community_role_capabilities` + `community_role_capability_overrides`) replace
hardcoded role arrays in the RPCs and RLS policies this plan touches. Existing
`is_app_staff()`/`is_superadmin()` checks are **not** retrofitted — only the
functions/policies this plan adds or rewrites use the new capability layer. Mandatory
MFA is derived server-side (`ensure_account_ready` gains a `requires_aal2` column) and
consumed by the existing typed auth-state machine (`authSession.ts`), reusing the
`MfaSetupPage`/`/configurar-mfa` route that already exists for optional enrollment.
Email privacy is enforced by tightening the `profiles` SELECT policy plus a
column-limited `community_profile_summary` view — RLS decides who gets which shape,
not client-side hiding.

**Tech Stack:** Same TypeScript/React/Supabase stack as every prior plan. No new
dependencies.

## Global Constraints

- Existing `is_app_staff()`/`is_superadmin()` checks elsewhere in the schema are left
  untouched. Only the RPCs/policies this plan explicitly names are rewritten to use
  the new capability functions.
- `programmer` must never be able to promote a member to `owner` or demote/remove an
  `owner`, in any RPC this plan touches — verified by a negative test per RPC, not just
  documented.
- `community_players.role` is annotated as deprecated (Task 8) and otherwise
  untouched. No task may add new logic that reads it.
- Client-side permission helpers (`communityPermissions.ts`) do **not** account for
  per-community capability overrides (Task 2's override table) — they stay
  role-based for UI gating. The RPCs are the real enforcement. This is a deliberate
  scope cut: an owner who grants an override to e.g. `moderator` will not see that
  reflected in button visibility, only in whether the RPC actually succeeds.
- Every migration needs positive and negative RLS/RPC tests before being applied to
  the real project, per this program's standing rule.
- Migrations are applied to the real Supabase project (`csoslatxjjazrtrtylke`) via the
  Supabase MCP `apply_migration` tool, then verified with `list_tables`/`execute_sql`/
  `get_advisors`, matching how every prior plan in this program applied migrations.
- No new routes are introduced. The one new auth state (Task 5) reuses the existing
  `/configurar-mfa` route and `MfaSetupPage` component.

---

### Task 1: Global role capabilities

**Status: ✅ Concluída.** Aplicada em produção como `20260726124909_global_role_capabilities`,
arquivo e `schema.sql` no repo, commit `0483091`.

**Files:**
- Create: `supabase/migrations/20260726090000_global_role_capabilities.sql`
- Modify: `supabase/migrations/schema.sql`
- Modify: `src/infra/supabase/schema.test.ts`

**Interfaces:**
- Consumes: `public.profiles.role` (existing).
- Produces: `public.global_role_capabilities` table, `public.has_capability(text)`
  function. Task 4 depends on `master` (not `programmer`) holding
  `manage_community_ownership`.

- [ ] **Step 1: Read the existing RBAC migration pattern first**

Read `supabase/migrations/20260624133529_rbac_global_roles_and_hardening.sql` and the
`is_superadmin`/`is_app_staff`/`current_user_has_community_role` block in
`supabase/migrations/schema.sql` (~lines 117-227) to match this codebase's existing
`security definer`/`revoke`+`grant to authenticated` convention exactly.

- [ ] **Step 2: Write the migration**

Create `supabase/migrations/20260726090000_global_role_capabilities.sql`:

```sql
-- Capability layer for global roles. Existing is_app_staff()/is_superadmin() checks
-- are untouched; only new/rewritten checks in this plan use has_capability(). See
-- docs/superpowers/plans/2026-07-26-roles-permissions-security-hardening.md.

create table public.global_role_capabilities (
  role text not null check (role in ('master', 'programmer', 'user')),
  capability text not null,
  primary key (role, capability)
);

-- 'manage_community_ownership' is intentionally master-only: it gates
-- transfer_community_ownership (Task 2) so programmer can never become or remove a
-- community owner, per the approved design.
insert into public.global_role_capabilities (role, capability) values
  ('master', 'manage_global_roles'),
  ('master', 'manage_community_ownership'),
  ('master', 'view_all_profiles'),
  ('master', 'manage_communities_any'),
  ('programmer', 'view_all_profiles'),
  ('programmer', 'manage_communities_any')
on conflict do nothing;

alter table public.global_role_capabilities enable row level security;

create policy "Authenticated users can read global role capabilities"
  on public.global_role_capabilities
  for select to authenticated
  using (true);

revoke all on table public.global_role_capabilities from public, anon;
grant select on table public.global_role_capabilities to authenticated;

create or replace function public.has_capability(capability text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    join public.global_role_capabilities c on c.role = p.role
    where p.id = (select auth.uid())
      and c.capability = has_capability.capability
  );
$$;

revoke execute on function public.has_capability(text) from public, anon;
grant execute on function public.has_capability(text) to authenticated;
```

- [ ] **Step 3: Apply the migration to the real Supabase project**

Use the Supabase MCP `apply_migration` tool against project `csoslatxjjazrtrtylke`.
Verify with `list_tables` that `global_role_capabilities` exists with RLS enabled, and
`execute_sql` (`select * from global_role_capabilities order by role, capability`) to
confirm the seed rows. Run `get_advisors` (security + performance) and confirm no new
advisories.

- [ ] **Step 4: Update the consolidated schema.sql**

Append the table + policy + function to `supabase/migrations/schema.sql`, placed near
the existing `is_superadmin`/`is_app_staff` block (~line 227), matching this file's
formatting conventions.

- [ ] **Step 5: Write schema tests**

Following this file's existing pattern (see how a recent migration's test block is
structured — e.g. `20260724150000_evaluation_community_authorization.sql`'s test),
add to `src/infra/supabase/schema.test.ts`:
- A test reading the new migration file asserting the seed includes
  `('master', 'manage_community_ownership')` and does **not** include
  `('programmer', 'manage_community_ownership')` anywhere in the insert statement
  (regex/string assertion — this is the test that would catch a future accidental
  privilege grant).
- A test asserting the consolidated `schema.sql` includes the table with RLS enabled
  and the `has_capability` function.

- [ ] **Step 6: Run the tests**

```bash
npm test
```

Expected: all pass, including the new ones.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260726090000_global_role_capabilities.sql supabase/migrations/schema.sql src/infra/supabase/schema.test.ts
git commit -m "feat(db): add global role capabilities table and has_capability()"
```

---

### Task 2: Community role capabilities, `organizador`, overrides, and RPC rewrites

**Status: ✅ Concluída, com duas correções fora do texto original.**

Aplicada em produção como `20260726153631_community_role_capabilities`. Duas coisas
deram errado e foram corrigidas depois:

1. **O arquivo da migration foi perdido.** Ficou untracked e sumiu numa limpeza de
   worktree; o `schema.sql` também nunca recebeu os objetos da task. Produção tinha a
   camada de capabilities inteira sem nenhum registro no repo. Recuperado byte a byte
   de `supabase_migrations.schema_migrations` (10581 caracteres, conferido) para
   `supabase/migrations/20260726100000_community_role_capabilities.sql`.
2. **O `drop policy` do Step 2 era no-op e deixou um bypass ativo.** O plano mandava
   dropar `"Users can update own communities"`, mas produção já tinha renomeado essa
   policy em `20260610161203` para `"Community owners and admins can update
   communities"`. Como o Postgres faz OR entre policies permissivas, a policy legada
   continuou viva ao lado da nova e furava qualquer override com `granted = false`.
   Corrigido por `20260726160000_drop_legacy_communities_update_policy.sql` (aplicado;
   produção tinha zero comunidades, então sem impacto em dados). O Completion Gate
   deste plano partia de uma premissa errada aqui: dizia que `admin` estava *bloqueado*
   de editar comunidade, mas isso só valia para o `schema.sql` (defasado) — em produção
   `admin` já conseguia editar pela policy legada.

**Files:**
- Create: `supabase/migrations/20260726100000_community_role_capabilities.sql`
- Modify: `supabase/migrations/schema.sql`
- Modify: `src/infra/supabase/schema.test.ts`

**Interfaces:**
- Consumes: `public.has_capability(text)` (Task 1), `public.is_superadmin()`
  (existing), `public.prevent_last_community_owner_change` trigger (existing — read
  before writing `transfer_community_ownership`).
- Produces: `organizador` added to `community_members.role`;
  `public.community_role_capabilities`, `public.community_role_capability_overrides`
  tables; `public.community_has_capability(uuid, text)` function;
  `set_community_member_role`/`remove_community_member` rewritten to use it;
  new `public.transfer_community_ownership(uuid, uuid)` RPC (master-only). Task 6 and
  Task 7 depend on `community_has_capability` existing.

- [ ] **Step 1: Read what this migration must not break**

Read, in full:
- `supabase/migrations/20260722162234_account_identity_foundation.sql` for
  `set_community_member_role`/`remove_community_member` — the exact current bodies
  this task rewrites.
- The `prevent_last_community_owner_change` trigger and the community-owner-seeding
  block (`supabase/migrations/20260610161203_backend_operational_sync.sql`,
  ~lines 400-455) — `transfer_community_ownership` must promote the new owner
  **before** demoting the old one in the same transaction, or the trigger will reject
  the demote (last-owner guard fires if, at demote time, no other `owner` row exists
  yet).
- The `communities` table's current UPDATE policy (`"Users can update own
  communities"`, `schema.sql` ~line 569) — it is `owner_id`-only today, meaning
  **no** `admin` community member can edit community info yet, even though the
  approved design expects `admin` to have `edit_community_info`. This task must
  replace that policy, not just add capabilities.

- [ ] **Step 2: Write the migration**

Create `supabase/migrations/20260726100000_community_role_capabilities.sql`:

```sql
-- Community-level capability layer + new 'organizador' role. See
-- docs/superpowers/plans/2026-07-26-roles-permissions-security-hardening.md.

alter table public.community_members drop constraint community_members_role_check;
alter table public.community_members add constraint community_members_role_check
  check (role in ('owner', 'admin', 'moderator', 'organizador', 'member'));

create table public.community_role_capabilities (
  role text not null check (role in ('owner', 'admin', 'moderator', 'organizador', 'member')),
  capability text not null check (capability in (
    'edit_community_info', 'manage_members', 'approve_members',
    'remove_members', 'manage_sessions', 'manage_evaluations'
  )),
  primary key (role, capability)
);

insert into public.community_role_capabilities (role, capability) values
  ('owner', 'edit_community_info'), ('owner', 'manage_members'),
  ('owner', 'approve_members'), ('owner', 'remove_members'),
  ('owner', 'manage_sessions'), ('owner', 'manage_evaluations'),
  ('admin', 'edit_community_info'), ('admin', 'manage_members'),
  ('admin', 'approve_members'), ('admin', 'remove_members'),
  ('admin', 'manage_sessions'), ('admin', 'manage_evaluations'),
  ('moderator', 'approve_members'), ('moderator', 'manage_sessions'),
  ('organizador', 'manage_sessions')
on conflict do nothing;
-- 'member' intentionally has no rows: no capabilities by default.

alter table public.community_role_capabilities enable row level security;
create policy "Authenticated users can read community role capabilities"
  on public.community_role_capabilities for select to authenticated using (true);
revoke all on table public.community_role_capabilities from public, anon;
grant select on table public.community_role_capabilities to authenticated;

create table public.community_role_capability_overrides (
  community_id uuid not null references public.communities(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'moderator', 'organizador', 'member')),
  capability text not null check (capability in (
    'edit_community_info', 'manage_members', 'approve_members',
    'remove_members', 'manage_sessions', 'manage_evaluations'
  )),
  granted boolean not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  primary key (community_id, role, capability)
);

alter table public.community_role_capability_overrides enable row level security;

create policy "Community members can read overrides for their community"
  on public.community_role_capability_overrides for select to authenticated
  using (
    public.is_superadmin() or exists (
      select 1 from public.community_members cm
      where cm.community_id = community_role_capability_overrides.community_id
        and cm.user_id = (select auth.uid())
        and cm.status = 'active'
    )
  );

-- Overrides are owner-only to write, hardcoded (not routed through
-- community_has_capability itself) to avoid a self-referential capability granting
-- override-editing rights to itself.
create policy "Only community owner can write overrides"
  on public.community_role_capability_overrides for all to authenticated
  using (
    public.is_superadmin() or exists (
      select 1 from public.community_members cm
      where cm.community_id = community_role_capability_overrides.community_id
        and cm.user_id = (select auth.uid())
        and cm.status = 'active'
        and cm.role = 'owner'
    )
  )
  with check (
    public.is_superadmin() or exists (
      select 1 from public.community_members cm
      where cm.community_id = community_role_capability_overrides.community_id
        and cm.user_id = (select auth.uid())
        and cm.status = 'active'
        and cm.role = 'owner'
    )
  );

revoke all on table public.community_role_capability_overrides from public, anon;
grant select, insert, update, delete on table public.community_role_capability_overrides to authenticated;

create or replace function public.community_has_capability(
  target_community_id uuid,
  capability text
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
      and cm.status = 'active'
      and coalesce(
        (
          select o.granted
          from public.community_role_capability_overrides o
          where o.community_id = target_community_id
            and o.role = cm.role
            and o.capability = community_has_capability.capability
        ),
        exists (
          select 1 from public.community_role_capabilities c
          where c.role = cm.role and c.capability = community_has_capability.capability
        )
      )
  );
$$;

revoke execute on function public.community_has_capability(uuid, text) from public, anon;
grant execute on function public.community_has_capability(uuid, text) to authenticated;

-- Rewrite set_community_member_role / remove_community_member to use the capability
-- function instead of a hardcoded array['owner','admin']. The pre-existing guard
-- "target_member.role = 'owner' -> reject" is untouched and is what makes these two
-- RPCs unable to ever touch an owner, for anyone, including programmer/master.
create or replace function public.set_community_member_role(
  p_member_id uuid,
  p_role text
)
returns public.community_members
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  target_member public.community_members;
  updated_member public.community_members;
begin
  if v_uid is null then
    raise exception 'Nao autenticado' using errcode = '42501';
  end if;

  if p_role not in ('admin', 'moderator', 'organizador', 'member') then
    raise exception 'Invalid community member role: %', p_role using errcode = '22023';
  end if;

  select * into target_member from public.community_members where id = p_member_id;

  if target_member.id is null then
    raise exception 'Membro da comunidade nao encontrado' using errcode = '22023';
  end if;

  if target_member.role = 'owner' then
    raise exception 'O papel owner nao pode ser alterado por esta acao' using errcode = '42501';
  end if;

  if not public.community_has_capability(target_member.community_id, 'manage_members') then
    raise exception 'Apenas quem tem manage_members pode alterar papeis de membros' using errcode = '42501';
  end if;

  update public.community_members
     set role = p_role, updated_at = now()
   where id = p_member_id
   returning * into updated_member;

  return updated_member;
end;
$$;

create or replace function public.remove_community_member(
  p_member_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  target_member public.community_members;
begin
  if v_uid is null then
    raise exception 'Nao autenticado' using errcode = '42501';
  end if;

  select * into target_member from public.community_members where id = p_member_id;

  if target_member.id is null then
    raise exception 'Membro da comunidade nao encontrado' using errcode = '22023';
  end if;

  if target_member.role = 'owner' then
    raise exception 'Owner nao pode ser removido por esta acao' using errcode = '42501';
  end if;

  if not public.community_has_capability(target_member.community_id, 'remove_members') then
    raise exception 'Apenas quem tem remove_members pode remover membros' using errcode = '42501';
  end if;

  delete from public.community_members where id = p_member_id;
end;
$$;

-- New: master-only ownership transfer. Deliberately NOT granted to programmer (only
-- 'master' holds the 'manage_community_ownership' global capability from Task 1).
create or replace function public.transfer_community_ownership(
  p_community_id uuid,
  p_new_owner_member_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_owner public.community_members;
  new_owner public.community_members;
begin
  if not public.has_capability('manage_community_ownership') then
    raise exception 'Apenas master pode transferir a posse de uma comunidade' using errcode = '42501';
  end if;

  select * into new_owner
    from public.community_members
   where id = p_new_owner_member_id and community_id = p_community_id;
  if new_owner.id is null then
    raise exception 'Membro alvo nao encontrado nesta comunidade' using errcode = '22023';
  end if;

  select * into current_owner
    from public.community_members
   where community_id = p_community_id and role = 'owner';
  if current_owner.id is null then
    raise exception 'Comunidade sem owner atual' using errcode = '22023';
  end if;
  if current_owner.id = new_owner.id then
    raise exception 'Membro alvo ja e owner' using errcode = '22023';
  end if;

  -- Promote first so there are briefly two owners, never zero — the
  -- prevent_last_community_owner_change trigger only rejects a demote when it is the
  -- last owner row at that instant.
  update public.community_members set role = 'owner', updated_at = now()
   where id = new_owner.id;
  update public.community_members set role = 'admin', updated_at = now()
   where id = current_owner.id;
end;
$$;

revoke execute on function public.set_community_member_role(uuid, text) from public, anon;
revoke execute on function public.remove_community_member(uuid) from public, anon;
revoke execute on function public.transfer_community_ownership(uuid, uuid) from public, anon;
grant execute on function public.set_community_member_role(uuid, text) to authenticated;
grant execute on function public.remove_community_member(uuid) to authenticated;
grant execute on function public.transfer_community_ownership(uuid, uuid) to authenticated;

-- Fix the stale owner_id-only UPDATE policy: admin (and owner) can now edit
-- community info, which was previously impossible for anyone but the literal
-- creator row (owner_id), a pre-existing gap this task closes.
drop policy if exists "Users can update own communities" on public.communities;
create policy "Community capability holders can update communities"
  on public.communities for update to authenticated
  using (public.community_has_capability(id, 'edit_community_info'))
  with check (public.community_has_capability(id, 'edit_community_info'));
-- INSERT/DELETE policies on communities are intentionally untouched — not part of
-- the approved design scope.
```

- [ ] **Step 3: Apply the migration to the real Supabase project**

Use `apply_migration` against `csoslatxjjazrtrtylke`. Verify via `execute_sql` that:
inserting a `community_members` row with `role = 'organizador'` succeeds; the seed
rows in `community_role_capabilities` match the table above; `get_advisors` shows no
new advisories.

- [ ] **Step 4: Update the consolidated schema.sql**

Apply the same set of changes (constraint change, two new tables + policies +
function, the two rewritten RPC bodies, the new `transfer_community_ownership`
function, the replaced `communities` UPDATE policy) to
`supabase/migrations/schema.sql` in place, so a fresh paste of that file matches the
real project.

- [ ] **Step 5: Write schema tests**

Add to `src/infra/supabase/schema.test.ts`:
- Constraint includes `organizador`.
- `set_community_member_role`/`remove_community_member` bodies reference
  `community_has_capability`, not a hardcoded `array['owner','admin']`, and still
  contain the `target_member.role = 'owner'` rejection.
- `transfer_community_ownership` body checks `has_capability('manage_community_ownership')`
  and promotes the new owner **before** demoting the old one (assert statement order
  in the migration text).
- The `communities` UPDATE policy no longer references `owner_id = (select
  auth.uid())` and instead references `community_has_capability(id,
  'edit_community_info')`.

- [ ] **Step 6: Run the tests**

```bash
npm test
```

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260726100000_community_role_capabilities.sql supabase/migrations/schema.sql src/infra/supabase/schema.test.ts
git commit -m "feat(db): add community role capabilities, organizador role, and ownership transfer RPC"
```

---

### Task 3: Password minimum length + session invalidation on password change

**Status: ✅ Concluída** (commit `de2f926`, revisada). Uma pendência humana: o
**Step 7 continua aberto** — `password_min_length = 8` é configuração do painel
Supabase (Authentication → Policies), não SQL, e precisa ser feita por você.

Nota da revisão: o comando de teste sugerido no Step 2/4 (`npx vitest run
src/infra/supabase/authClient.test.ts`) estava errado — esse arquivo roda no runner
nativo do Node (`npm run test:unit`), e o `vitest.config.ts` só inclui `*.spec.*`.
Rodado como sugerido, o teste casaria zero arquivos e passaria sem executar nada.

**Files:**
- Modify: `src/infra/supabase/authClient.ts`
- Modify: `src/infra/supabase/authClient.test.ts`
- Modify: `src/app/auth/AuthPages.tsx`
- Modify: `src/app/auth/AuthPages.spec.tsx`
- Modify: `docs/operations/auth-production-checklist.md`

**Interfaces:**
- Consumes: none new.
- Produces: `AuthClient.signOutOthers(): Promise<void>`. No other task depends on
  this.

- [ ] **Step 1: Write the failing test for `signOutOthers`**

Read `src/infra/supabase/authClient.test.ts` first to match its existing mock-`auth`
convention exactly, then add:

```typescript
// append to src/infra/supabase/authClient.test.ts
it('signOutOthers calls auth.signOut with scope "others"', async () => {
  const signOut = vi.fn().mockResolvedValue({ error: null });
  const client = createAuthClient({ signOut } as any);
  await client.signOutOthers();
  expect(signOut).toHaveBeenCalledWith({ scope: 'others' });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/infra/supabase/authClient.test.ts`
Expected: FAIL — `signOutOthers` does not exist.

- [ ] **Step 3: Implement `signOutOthers`**

In `authClient.ts`, add to the `AuthClient` interface: `signOutOthers(): Promise<void>;`
Implement in `createAuthClient`:

```typescript
async signOutOthers() {
  const { error } = await auth.signOut({ scope: 'others' });
  fail(error);
},
```

Add `signOutOthers: async () => {}` to `unavailableAuthClient`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/infra/supabase/authClient.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire it into the password-change flow**

In `AuthPages.tsx`'s `PasswordRecoveryPage`, in the submit handler (currently at
~line 111, `await supabaseAuthClient.updatePassword(newPassword)`), call
`await supabaseAuthClient.signOutOthers()` immediately after `updatePassword`
succeeds, before `setUpdated(true)`. If `signOutOthers` throws, do not block the
success message (the password change itself already succeeded) — catch and ignore or
log, matching this file's existing error-handling style for non-critical follow-ups.

- [ ] **Step 6: Test the wiring**

In `AuthPages.spec.tsx`, extend the existing password-recovery test (find it first —
read the file to match its mocking pattern) to assert `signOutOthers` is called
exactly once after a successful `updatePassword`, and that a rejection from
`signOutOthers` does not prevent the "Senha atualizada com sucesso." message from
showing.

- [ ] **Step 7: Set the password minimum length on the real project**

This is an Auth configuration change, not a migration — Supabase's password policy
lives in the project's Auth settings, not the database schema. Set
`password_min_length` to `8` via the Supabase dashboard (Authentication → Policies) or
Management API for project `csoslatxjjazrtrtylke`. Verify by attempting a signup with
a 7-character password against the real project and confirming it is rejected with a
password-length error.

- [ ] **Step 8: Update the checklist**

Add a line to `docs/operations/auth-production-checklist.md`:
`- [ ] Senha minima configurada em 8 caracteres (Authentication -> Policies).`

- [ ] **Step 9: Run the full suite, typecheck, lint**

```bash
npm test
npx tsc --noEmit
npm run lint:eslint
```

- [ ] **Step 10: Commit**

```bash
git add src/infra/supabase/authClient.ts src/infra/supabase/authClient.test.ts src/app/auth/AuthPages.tsx src/app/auth/AuthPages.spec.tsx docs/operations/auth-production-checklist.md
git commit -m "feat(auth): invalidate other sessions on password change; document 8-char minimum"
```

---

### Task 4: Mandatory MFA — database layer

**Status: ✅ Concluída** (commit `427ee7b`, aplicada em produção como
`20260726223946`; correções de revisão em `65781c0`). A revisão comparou os sete
corpos de função com produção via md5 e recuperou o corpo anterior de
`ensure_account_ready` de `supabase_migrations` para provar que só os três trechos
pretendidos mudaram. Login verificado funcionando depois do drop/recreate.

Duas observações operacionais que valem registro:

- **JWT de service-role não tem claim `aal`.** `require_aal2()` compara
  `auth.jwt() ->> 'aal'` com `'aal2'`; um token de service role não traz essa claim,
  então qualquer script de backend passa a receber 42501 nas quatro RPCs. Hoje não há
  chamador assim em `src/`, mas o erro falaria de "verificação em duas etapas" para
  algo que não tem nada a ver com MFA.
- **Um único `master`, recuperação só pelo painel.** `set_user_role` agora exige aal2 e
  é o único caminho para conceder papéis globais. Se o autenticador for perdido, a
  saída é o SQL editor (`set_config('app.allow_role_change','on',true)` + `update
  public.profiles`). Risco aceito conscientemente; vale promover um segundo
  `programmer` antes de abrir para mais gente.

**Files:**
- Create: `supabase/migrations/20260726110000_mandatory_mfa_and_aal2_enforcement.sql`
- Modify: `supabase/migrations/schema.sql`
- Modify: `src/infra/supabase/schema.test.ts`

**Interfaces:**
- Consumes: `set_user_role` (existing), `set_community_member_role`,
  `remove_community_member`, `transfer_community_ownership` (Task 2).
- Produces: `ensure_account_ready` gains a `requires_aal2 boolean` output column; the
  four sensitive RPCs above reject calls without `aal2` at the database layer. Task 5
  depends on the exact new `ensure_account_ready` column name/position.

- [ ] **Step 1: Read the current `ensure_account_ready` signature**

Read `supabase/migrations/20260722162234_account_identity_foundation.sql` (~lines
271-382) in full. Postgres cannot `create or replace` a function with a different
return-table shape — this migration must `drop function
public.ensure_account_ready(text)` before recreating it with the extra column.

- [ ] **Step 2: Write the migration**

Create `supabase/migrations/20260726110000_mandatory_mfa_and_aal2_enforcement.sql`.

Nota de ordem: `ensure_account_ready` chama `account_requires_aal2`. Como o corpo é
plpgsql, o Postgres não resolve a referência na criação, então a ordem abaixo funciona;
ainda assim, se preferir, mova o bloco de `account_requires_aal2` para antes do
`drop function`. O que **não** pode mudar é o `drop function` vir antes do `create` —
Postgres recusa `create or replace` quando a tabela de retorno muda de forma.

```sql
-- Mandatory MFA determination + AAL2 enforcement at the database layer for sensitive
-- role/ownership RPCs. See
-- docs/superpowers/plans/2026-07-26-roles-permissions-security-hardening.md.

drop function public.ensure_account_ready(text);

create or replace function public.ensure_account_ready(p_username text default null)
returns table (
  state text,
  profile_id uuid,
  profile_name text,
  profile_email text,
  profile_role text,
  profile_created_at timestamptz,
  profile_updated_at timestamptz,
  player_id uuid,
  username text,
  requires_aal2 boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  v_email text;
  v_name text;
  v_username text := public.normalize_account_username(p_username);
  v_profile public.profiles%rowtype;
  v_player public.players%rowtype;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select email, coalesce(raw_user_meta_data->>'name', split_part(email, '@', 1))
    into v_email, v_name
    from auth.users
   where id = v_uid;

  insert into public.profiles (id, name, email, role)
  values (v_uid, v_name, v_email, 'user')
  on conflict (id) do update
    set email = excluded.email,
        updated_at = now();

  select * into v_profile from public.profiles where id = v_uid;

  select * into v_player
    from public.players
   where user_id = v_uid and deleted_at is null
   order by created_at
   limit 1
   for update;

  if nullif(v_username, '') is not null
     and not public.is_valid_account_username(v_username) then
    raise exception 'Invalid username' using errcode = '22023';
  end if;

  if v_player.id is null then
    insert into public.players (
      owner_id,
      user_id,
      name,
      username,
      has_account_identity_history
    )
    values (v_uid, v_uid, v_name, nullif(v_username, ''), true)
    on conflict (user_id) where user_id is not null
    do update set updated_at = now()
    returning * into v_player;
  elsif (
    v_player.username is null
    or v_player.username <> public.normalize_account_username(v_player.username)
    or not public.is_valid_account_username(v_player.username)
  ) and nullif(v_username, '') is not null then
    if not public.is_valid_account_username(v_username) then
      raise exception 'Invalid username' using errcode = '22023';
    end if;
    update public.players
       set username = v_username, updated_at = now()
     where id = v_player.id
     returning * into v_player;
  end if;

  if v_player.username is null
     or v_player.username <> public.normalize_account_username(v_player.username)
     or not public.is_valid_account_username(v_player.username) then
    return query select
      'needs_username'::text,
      v_profile.id,
      v_profile.name,
      v_profile.email,
      v_profile.role,
      v_profile.created_at,
      v_profile.updated_at,
      v_player.id,
      null::text,
      public.account_requires_aal2(v_uid);
  else
    return query select
      'ready'::text,
      v_profile.id,
      v_profile.name,
      v_profile.email,
      v_profile.role,
      v_profile.created_at,
      v_profile.updated_at,
      v_player.id,
      v_player.username,
      public.account_requires_aal2(v_uid);
  end if;
exception
  when unique_violation then
    raise exception 'Username unavailable' using errcode = '23505';
end;
$$;

revoke execute on function public.ensure_account_ready(text) from public, anon;
grant execute on function public.ensure_account_ready(text) to authenticated;

-- PRE-FLIGHT CORRECTION (decidida antes da execução): 'admin' entra aqui.
-- O texto original desta task exigia aal2 em set_community_member_role e
-- remove_community_member, mas só obrigava MFA para master/programmer/owner —
-- e o seed de capabilities dá manage_members/remove_members ao admin. Um admin
-- nunca seria mandado enrolar TOTP, nunca chegaria a aal2, e toda chamada dele
-- a essas duas RPCs falharia com 42501 para sempre. Incluir 'admin' fecha a
-- contradição mantendo as quatro RPCs sob require_aal2().
create or replace function public.account_requires_aal2(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (
      select 1 from public.profiles
      where id = p_uid and role in ('master', 'programmer')
    )
    or exists (
      select 1 from public.community_members
      where user_id = p_uid and role in ('owner', 'admin') and status = 'active'
    );
$$;

revoke execute on function public.account_requires_aal2(uuid) from public, anon;
grant execute on function public.account_requires_aal2(uuid) to authenticated;

-- AAL2 enforcement at the DB layer for sensitive role/ownership RPCs, independent of
-- client-side gating (per "Operacoes administrativas sensiveis exigem aal2 no banco",
-- docs/superpowers/specs/2026-07-22-scalable-product-restructure-design.md).
-- PRE-FLIGHT CORRECTION: `set search_path = public` adicionado. Sem isso o
-- advisor function_search_path_mutable acusa uma nova advertência, o que o
-- Completion Gate deste plano proíbe ("get_advisors showing no new advisories").
create or replace function public.require_aal2()
returns void
language plpgsql
stable
set search_path = public
as $$
begin
  if coalesce((select auth.jwt() ->> 'aal'), '') <> 'aal2' then
    raise exception 'Esta operacao exige verificacao em duas etapas (AAL2).' using errcode = '42501';
  end if;
end;
$$;

-- Add `perform public.require_aal2();` as the first statement in each function body
-- below (after the `v_uid is null` check where present), then create or replace them
-- with that one added line — do not otherwise change their logic:
--   - public.set_user_role(uuid, text)
--   - public.set_community_member_role(uuid, text)
--   - public.remove_community_member(uuid)
--   - public.transfer_community_ownership(uuid, uuid)
```

Write out the four full `create or replace function` statements (copying each
function's current body from `schema.sql` after Task 2's rewrite, inserting
`perform public.require_aal2();` as the first line inside the `begin` block) rather
than leaving them as a comment — the comment above describes the change, but the
migration file itself must contain the complete, runnable statements.

- [ ] **Step 3: Apply the migration to the real Supabase project**

Use `apply_migration` against `csoslatxjjazrtrtylke`. Verify via `execute_sql`:
`select requires_aal2 from ensure_account_ready()` style check is not directly
callable via SQL editor as the authenticated user context, so instead verify by
reading back the function definition (`\sf public.ensure_account_ready` equivalent via
`execute_sql` against `pg_get_functiondef`) and confirming the new column and the
`account_requires_aal2` call appear. Run `get_advisors`.

- [ ] **Step 4: Update schema.sql**

Apply the same changes to `supabase/migrations/schema.sql`: the new
`ensure_account_ready` signature and body, the new `account_requires_aal2` and
`require_aal2` functions, and the `perform public.require_aal2();` line added to the
four sensitive RPCs in place.

- [ ] **Step 5: Write schema tests**

Add to `src/infra/supabase/schema.test.ts`:
- `ensure_account_ready`'s new signature includes `requires_aal2 boolean` and calls
  `account_requires_aal2`.
- `account_requires_aal2`'s body checks both `role in ('master','programmer')` and an
  active `community_members` row with `role = 'owner'`.
- Each of the four sensitive RPCs' bodies contains `perform public.require_aal2();`.

- [ ] **Step 6: Run the tests**

```bash
npm test
```

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260726110000_mandatory_mfa_and_aal2_enforcement.sql supabase/migrations/schema.sql src/infra/supabase/schema.test.ts
git commit -m "feat(db): derive mandatory-MFA requirement and enforce AAL2 on sensitive RPCs"
```

---

### Task 5: Mandatory MFA — client wiring

**Status: ✅ Concluída** (commit `0f036ef`, mais correções bloqueantes em `6b992c3`).

O Step 10 era pergunta aberta e a resposta foi empírica: `verifyTotp` **não** move o
estado do provider, então `MfaSetupPage` chama `retry()` antes de navegar. Sem isso o
enrollment terminava e o `AuthGuard` devolvia o usuário para `/configurar-mfa`.

**A verificação no app real achou três defeitos que os testes não pegavam** — juntos,
`/configurar-mfa` era um beco sem saída, e com MFA obrigatório essa é a única porta
para master/programmer/owner/admin:

1. O Supabase responde 422 ("A factor with the friendly name ... already exists")
   enquanto existir um fator TOTP não verificado. Quem começasse a configuração e não
   terminasse ficava travado para sempre. `enrollTotp` agora descarta fator não
   verificado e refaz o enroll (só depois de uma falha — o caminho felizmente não paga
   chamada extra), e nunca toca em fator verificado.
2. `MfaSetupPage` renderizava o spinner sempre que `enrollment` era nulo, e o `error` só
   aparecia **dentro do formulário**, que por sua vez dependia de `enrollment`. Falha de
   enroll = "Carregando Sessão..." eterno, sem mensagem e sem saída — a mesma forma do
   bug corrigido em `f55d06c`, em outro componente. Agora há estado de erro com botão
   de tentar novamente.
3. `enrollTotp` cria recurso no servidor, não é idempotente, e o StrictMode montava o
   efeito duas vezes: duas inscrições disputavam o mesmo `friendly_name` vazio e a
   perdedora matava a tela. O enroll roda uma vez por instância da página —
   deliberadamente **sem** flag de cancelamento, porque junto com o guard o cleanup do
   StrictMode cancelaria justamente a única inscrição em voo.

**Files:**
- Modify: `src/application/accountUseCases.ts`
- Modify: `src/infra/supabase/accountCloudService.ts`
- Modify: `src/infra/supabase/accountCloudService.test.ts`
- Modify: `src/application/authSession.ts`
- Modify: `src/application/authSession.test.ts`
- Modify: `src/app/auth/authRoutes.ts`
- Modify: `src/app/auth/AuthSessionProvider.tsx`
- Modify: `src/app/auth/AuthSessionProvider.spec.tsx`
- Modify: `src/app/auth/AuthPages.tsx` (only if Step 6 finds a reconcile gap)

**Interfaces:**
- Consumes: `ensure_account_ready`'s `requires_aal2` column (Task 4).
- Produces: `AccountSnapshot.requiresAal2: boolean`; new `AuthSessionState` kind
  `'mfa_setup_required'`. No other task depends on this.

- [ ] **Step 1: Write the failing test for `AccountSnapshot.requiresAal2`**

In `src/infra/supabase/accountCloudService.test.ts` (read it first to match its
existing RPC-row mocking style), add a test asserting `ensureReady` maps
`value.requires_aal2` (a boolean or Postgres `'t'`/`'f'`/boolean-ish value — check
what the existing `profile_role` mapping in this file does for precedent) to
`AccountSnapshot.requiresAal2`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/infra/supabase/accountCloudService.test.ts`
Expected: FAIL — `requiresAal2` not present on the returned snapshot.

- [ ] **Step 3: Add `requiresAal2` to `AccountSnapshot` and the mapper**

In `src/application/accountUseCases.ts`, add `requiresAal2: boolean;` to the
`AccountSnapshot` interface. In `accountCloudService.ts`'s `ensureReady`, add
`requiresAal2: Boolean(value.requires_aal2),` to the returned object.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/infra/supabase/accountCloudService.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing tests for the new `mfa_setup_required` state**

Read `src/application/authSession.test.ts` in full first to match its existing table
of scenarios. Add cases to `resolveAuthSessionState`'s test suite:
- `account.requiresAal2 = true`, `aal.next = null` (no factor enrolled at all) →
  `{ kind: 'mfa_setup_required', ... }`.
- `account.requiresAal2 = true`, `aal.next = 'aal2'`, `aal.current = 'aal1'` (factor
  exists, needs step-up) → `{ kind: 'mfa_required', ... }` (existing behavior
  preserved, enrollment not required again).
- `account.requiresAal2 = false`, `aal.next = 'aal2'`, `aal.current = 'aal1'` (an
  ordinary user who voluntarily enrolled) → still `{ kind: 'mfa_required', ... }` —
  this is the regression case: mandatory-MFA logic must not weaken the existing
  optional step-up behavior for non-staff users.
- `account.requiresAal2 = true`, `aal.current = 'aal2'` → `{ kind: 'ready', ... }`.

- [ ] **Step 6: Run tests to verify they fail**

Run: `npx vitest run src/application/authSession.test.ts`
Expected: FAIL — `mfa_setup_required` kind does not exist yet.

- [ ] **Step 7: Implement the new state**

In `authSession.ts`, add `| { kind: 'mfa_setup_required'; userId: string; account: AccountSnapshot }`
to the `AuthSessionState` union. Replace the existing single `if` block with:

```typescript
if (input.aal?.next === 'aal2' && input.aal.current !== 'aal2') {
  return { kind: 'mfa_required', userId: input.session.userId, account: input.account };
}
if (input.account.requiresAal2 && input.aal?.next !== 'aal2') {
  return { kind: 'mfa_setup_required', userId: input.session.userId, account: input.account };
}
return { kind: 'ready', userId: input.session.userId, account: input.account };
```

Remove the now-unused `requireAal2` input parameter only if Step 5's tests still pass
without it being read anywhere — check `AuthSessionProvider.tsx`'s call site (Step 9)
before deciding; the parameter may still be worth keeping as an explicit opt-out for
tests even if production always passes `true`/omits it.

- [ ] **Step 8: Run tests to verify they pass**

Run: `npx vitest run src/application/authSession.test.ts`
Expected: all pass, including the regression case from Step 5.

- [ ] **Step 9: Wire the new state to the existing `/configurar-mfa` route**

In `src/app/auth/authRoutes.ts`, add:

```typescript
case 'mfa_setup_required':
  return '/configurar-mfa';
```

Confirm in `src/components/account/AccountSyncView.tsx` (or wherever `AppRouter.tsx`'s
routes are actually declared — re-check, this may live in `AppRouter.tsx` itself, see
Task discovery: `<Route path="/configurar-mfa" element={<MfaSetupPage />} />` already
exists) that this route is reachable from the `AuthGuard` redirect (i.e. it isn't
nested behind a guard that itself requires `ready` state, which would create a
redirect loop).

- [ ] **Step 10: Verify `MfaSetupPage` actually reaches `ready` after enrollment**

Read `MfaSetupPage` in `AuthPages.tsx` (~lines 217-262). Its `handleSubmit` currently
calls `navigate(destinationFromLocationState(...))` directly after `verifyTotp`
succeeds, without calling `retry()` from `useAuthSession()`. Determine whether
Supabase's `onAuthStateChange` fires on an AAL transition (it may, via an `MFA_*`
event) by writing a test in `AuthSessionProvider.spec.tsx` that: sets up a state where
`resolveAuthSessionState` would currently return `mfa_setup_required`, simulates a
successful `verifyTotp`, and asserts the provider's `state` eventually becomes
`ready` without a manual page reload. If the test shows `state` does **not** update
(no auth event fires from `verifyTotp` alone in the test double), change
`MfaSetupPage.handleSubmit` to call `await retry()` (already exposed by
`useAuthSession()`) before `navigate(...)`, and re-run the test to confirm it passes.

- [ ] **Step 11: Run the full suite, typecheck, lint**

```bash
npm test
npx tsc --noEmit
npm run lint:eslint
```

- [ ] **Step 12: Commit**

```bash
git add src/application/accountUseCases.ts src/infra/supabase/accountCloudService.ts src/infra/supabase/accountCloudService.test.ts src/application/authSession.ts src/application/authSession.test.ts src/app/auth/authRoutes.ts src/app/auth/AuthSessionProvider.tsx src/app/auth/AuthSessionProvider.spec.tsx src/app/auth/AuthPages.tsx
git commit -m "feat(auth): require mandatory TOTP enrollment for staff and community owners"
```

---

### Task 6: `organizador` role in types, permissions, and community UI

**Status: ✅ Concluída** (commit `8562c5f`, revisada; correção em `31ae5a4`).

A revisão conferiu a matriz de permissões do cliente contra o seed de capabilities que
já está em produção e achou uma divergência **anterior a esta task**:
`canEvaluatePlayer` liberava `moderator`, mas a RLS de `player_evaluations` exige
`current_user_has_community_role(community_id, array['owner','admin'])` — ou seja, o app
mostrava a ação e o banco recusava depois. O Step 4 mandava deixar `canEvaluatePlayer`
"owner/admin-only (unchanged)": a intenção estava certa, o "unchanged" é que não era
verdade. Corrigido para `isOwner || isAdmin`.

Pendência deliberada: `canApproveMembers` existe, mas o painel de membros ainda gateia
a aprovação por `canManageMembers`, então `moderator` ainda não aprova pela UI. O brief
proibia mexer no componente nesta task.

**Files:**
- Modify: `src/shared/types/community.ts`
- Modify: `src/domain/communityPermissions.ts`
- Modify: `src/domain/communityPermissions.test.ts` (check exact filename first)
- Modify: `src/application/communityMembersViewModel.ts`
- Modify: `src/application/communityMembersViewModel.test.ts`
- Modify: `src/components/community/CommunityMembersPanel.tsx` (test only, expected
  to need no production-code change — see Step 5)
- Modify: `src/components/community/CommunityMembersPanel.spec.tsx` (check exact
  filename first)

**Interfaces:**
- Consumes: `organizador` accepted by `set_community_member_role` (Task 2).
- Produces: `CommunityMemberRole` includes `'organizador'` everywhere it's
  exhaustively matched. No other task depends on this.

- [ ] **Step 1: Add `organizador` to the type**

In `src/shared/types/community.ts`, change:
`export type CommunityMemberRole = 'owner' | 'admin' | 'moderator' | 'member';`
to include `'organizador'`. Let the TypeScript compiler find every exhaustive
`switch`/lookup object that now needs an `organizador` entry (`communityPermissions.ts`'s
`permissionsForRole` does not exhaustively switch today — it uses boolean flags, so it
will **not** error; you must find its call sites deliberately, not rely on `tsc`
alone).

- [ ] **Step 2: Write the failing tests for community permissions**

Read `src/domain/communityPermissions.ts` in full (already read during brainstorm:
`permissionsForRole` currently derives booleans from `isOwner`/`isAdmin`/`isModerator`
only). Find or create its test file and add cases:
- `role: 'organizador'` → `canManageSessions`/`canCreateSession: true`,
  `canManageMembers: false`, `canEditCommunityInfo`/`canEditRules: false`,
  `canEvaluatePlayer: false`.
- `role: 'moderator'` → confirm (still) `canManageMembers: false`,
  `canEditRules: false`, and add `canApproveMembers: true` (new field — moderator's
  actual job per the approved design is approving members + creating sessions, not
  general "manage members").

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/domain/communityPermissions.test.ts` (adjust path to the
file's real name)
Expected: FAIL — `organizador` case and `canApproveMembers` field don't exist.

- [ ] **Step 4: Implement**

Add `canApproveMembers: boolean;` to the `CommunityPermissions` interface (distinct
from `canManageMembers`, which stays owner/admin-only for role changes and removal).
Update `permissionsForRole`:

```typescript
const isOrganizador = role === 'organizador';
// ...
canManageMembers: isOwner || isAdmin,
canApproveMembers: isOwner || isAdmin || isModerator,
canCreateSession: isOwner || isAdmin || isModerator || isOrganizador,
```

Leave `canEditRules`, `canEditPlayerProfile`, `canEvaluatePlayer`,
`canDeleteCommunity`, `canClearHistory` as owner/admin-only (unchanged) —
`organizador` and `moderator` do not gain these per the approved design.

- [ ] **Step 5: Run tests to verify they pass, then check `CommunityMembersPanel.tsx`'s email line**

Run: `npx vitest run src/domain/communityPermissions.test.ts`
Expected: PASS. Separately, re-read `CommunityMembersPanel.tsx` line ~358
(`{member.email && member.name && (<p>{member.email}</p>)}`) — this line needs no
change for Task 6 (it's already conditional on `member.email` truthiness, which Task
7 will make `null` for unprivileged viewers). Note this in the commit message; do not
touch this file's production code in this task.

- [ ] **Step 6: Add `organizador` to labels/badges/assignable roles**

In `src/application/communityMembersViewModel.ts`:
- `COMMUNITY_ROLE_LABELS`: add `organizador: 'Organizador'`.
- `COMMUNITY_ROLE_BADGE_CLASSES`: add `organizador: 'badge-outline badge-soft'` (or
  whatever this file's existing convention uses for a fourth tier — check the
  `daisyUI` badge classes already used by `moderator`/`member` before picking).
- `ASSIGNABLE_COMMUNITY_MEMBER_ROLES`: add `'organizador'` (order: `admin`,
  `moderator`, `organizador`, `member`).
- `ROLE_ORDER`: insert `organizador: 3, member: 4` (shifting `member` down one),
  updating any code that hardcodes the old `member: 3`.

- [ ] **Step 7: Test**

Add a test to `communityMembersViewModel.test.ts` asserting a member with
`role: 'organizador'` gets `roleLabel: 'Organizador'` and that
`ASSIGNABLE_COMMUNITY_MEMBER_ROLES` includes `'organizador'`. Add a component test to
`CommunityMembersPanel`'s spec file asserting the role `<select>` renders an
"Organizador" option when the viewer can manage members.

- [ ] **Step 8: Run the full suite, typecheck, lint**

```bash
npm test
npx tsc --noEmit
npm run lint:eslint
```

- [ ] **Step 9: Commit**

```bash
git add src/shared/types/community.ts src/domain/communityPermissions.ts src/application/communityMembersViewModel.ts
git add -u
git commit -m "feat(community): add organizador role to types, permissions, and member UI"
```

---

### Task 7: Hide member email from non-privileged viewers

**Files:**
- Create: `supabase/migrations/20260726170000_community_profile_privacy.sql`
- Modify: `supabase/migrations/schema.sql`
- Modify: `src/infra/supabase/schema.test.ts`
- Modify: `src/infra/supabase/membershipCloudService.ts`
- Modify: `src/infra/supabase/membershipCloudService.test.ts`

**Interfaces:**
- Consumes: `community_has_capability` (Task 2), `current_user_shares_profile`
  (existing — read its definition first, Step 1).
- Produces: `public.community_profile_summary` view (id, name — no email); tightened
  `profiles` SELECT policy. No other task depends on this.

- [ ] **Step 1: Read the current leak and its authorization helper**

Read `public.current_user_shares_profile` wherever it's actually defined (search
`supabase/migrations/` — it's referenced but its own definition wasn't inspected
during brainstorm; confirm it is `security definer`, since the view in Step 2 relies
on being able to evaluate it regardless of the caller's row-level access). Also
re-confirm the exact leaking policy: `"Profiles are readable by self or shared
communities"` (`supabase/migrations/20260610161203_backend_operational_sync.sql`,
~line 459) grants full-row `select` — including `email` — to any shared-community
member. This is the policy this task replaces.

- [ ] **Step 2: Write the migration**

Create `supabase/migrations/20260726170000_community_profile_privacy.sql`:

```sql
-- Hide profiles.email from ordinary community members; visible only to self, app
-- staff, or a viewer holding 'manage_members' in a community shared with the target.
-- See docs/superpowers/plans/2026-07-26-roles-permissions-security-hardening.md.

drop policy if exists "Profiles are readable by self or shared communities" on public.profiles;

create policy "Profiles are readable by self, staff, or member managers"
  on public.profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or public.is_app_staff()
    or exists (
      select 1
      from public.community_members viewer
      join public.community_members target
        on target.community_id = viewer.community_id
      where viewer.user_id = (select auth.uid())
        and viewer.status = 'active'
        and target.user_id = profiles.id
        and target.status = 'active'
        and public.community_has_capability(viewer.community_id, 'manage_members')
    )
  );

-- Column-limited view for ordinary members: never selects email, so it cannot leak
-- it regardless of the RLS bypass implied by view ownership. Authorization is
-- current_user_shares_profile(id), the same helper the old (too-broad) profiles
-- policy used.
create or replace view public.community_profile_summary as
select p.id, p.name
from public.profiles p
where public.current_user_shares_profile(p.id);

grant select on public.community_profile_summary to authenticated;
revoke all on public.community_profile_summary from anon;
```

Confirm during Step 1 whether `current_user_shares_profile` is itself `security
definer` (required for this view to see rows regardless of the caller's now-narrower
`profiles` RLS) — if it is not, this task must also mark it `security definer` (a
one-line `alter function ... security definer`, added to this same migration) before
the view will work correctly for non-privileged viewers.

- [ ] **Step 3: Apply the migration to the real Supabase project**

Use `apply_migration` against `csoslatxjjazrtrtylke`. Verify: as a test user who is an
ordinary `member` in a shared community, `select * from profiles where id =
'<other-member>'` returns zero rows (or a row with `email` null, per whichever
variant you implemented — the migration above returns zero rows), while `select * from
community_profile_summary where id = '<other-member>'` returns the row with `name`
and no `email` column at all. Run `get_advisors`.

- [ ] **Step 4: Update schema.sql**

Apply the same policy replacement and new view to `supabase/migrations/schema.sql`.

- [ ] **Step 5: Write schema tests**

Add to `src/infra/supabase/schema.test.ts`: the old policy name is gone; the new
policy references `community_has_capability(..., 'manage_members')`; the new view's
`select` list is exactly `p.id, p.name` (regex assertion that `email` does not appear
in the view definition — this is the test that would catch a future accidental
column addition).

- [ ] **Step 6: Write the failing test for capability-aware profile fetching**

Read `src/infra/supabase/membershipCloudService.ts` in full (the
`fetchProfilesByUserIds` function found during brainstorm, `PROFILE_COLUMNS = 'id,
name, email'`). Add a test asserting: given a list of user ids, if the first query
(against `profiles`) returns fewer rows than requested, the missing ids are re-fetched
from `community_profile_summary`, and the merged result has `email: null` for the
ids that came from the summary view. Follow this file's existing Supabase-client
mocking convention.

- [ ] **Step 7: Run test to verify it fails**

Run: `npx vitest run src/infra/supabase/membershipCloudService.test.ts`
Expected: FAIL — no fallback fetch exists yet.

- [ ] **Step 8: Implement the two-step fetch**

In `fetchProfilesByUserIds`, after the existing `profiles` query, compute
`missingIds = ids.filter(id => !returnedIds.has(id))`. If non-empty, query
`community_profile_summary` for those (`select id, name`) and merge into the
returned `Map<string, ProfileRecord>` with `email: null`. This relies entirely on
RLS/the view to determine who gets which shape — no client-side role/capability
check is needed in this function, matching how every other RLS-backed fetch in this
codebase already trusts the database as the source of truth.

- [ ] **Step 9: Run test to verify it passes**

Run: `npx vitest run src/infra/supabase/membershipCloudService.test.ts`
Expected: PASS.

- [ ] **Step 10: Manual/integration verification of the UI**

Per Task 6 Step 5's note: `CommunityMembersPanel.tsx`'s email line is already
conditional on `member.email` truthiness, so no component change should be needed.
Add or extend a component test confirming the email line does not render when
`fetchByCommunity` returns a member with `email: null`.

- [ ] **Step 11: Run the full suite, typecheck, lint**

```bash
npm test
npx tsc --noEmit
npm run lint:eslint
```

- [ ] **Step 12: Commit**

```bash
git add supabase/migrations/20260726170000_community_profile_privacy.sql supabase/migrations/schema.sql src/infra/supabase/schema.test.ts src/infra/supabase/membershipCloudService.ts src/infra/supabase/membershipCloudService.test.ts
git commit -m "feat(privacy): hide member email from non-privileged community viewers"
```

---

### Task 8: Deprecate `community_players.role`

**Files:**
- Create: `supabase/migrations/20260726130000_deprecate_community_players_role.sql`
- Modify: `supabase/migrations/schema.sql`
- Modify: `docs/operations/auth-production-checklist.md`

**Interfaces:**
- Consumes: none.
- Produces: a documented deprecation, no functional change. No other task depends on
  this; this task must not be blocked by or block anything else.

- [ ] **Step 1: Confirm the column is still unused**

Grep the current `src/` tree for `community_players` usages and confirm — as found
during brainstorm — that `.role` on this table is selected/typed
(`communityPlayerCloudService.ts`) but never read for any authorization or UI
decision (no `.role ===` branch on a `community_players` row anywhere). If a new
usage was introduced by an earlier task in this plan (it should not have been — check
the diff), stop and re-scope this task instead of deprecating a column now in active
use.

- [ ] **Step 2: Write the migration**

Create `supabase/migrations/20260726130000_deprecate_community_players_role.sql`:

```sql
-- community_players.role is superseded by community_members.role (the actual RBAC
-- table). Confirmed unused by any RLS policy or application logic as of this
-- migration. Not removed — removal is a separate, future decision. See
-- docs/superpowers/plans/2026-07-26-roles-permissions-security-hardening.md.
comment on column public.community_players.role is
  'DEPRECATED (2026-07-26): unused by RLS or application logic; superseded by community_members.role. Do not build new features on this column.';
```

- [ ] **Step 3: Apply the migration to the real Supabase project**

Use `apply_migration` against `csoslatxjjazrtrtylke`. Verify via `execute_sql`
(`select col_description('public.community_players'::regclass, (select
attnum from pg_attribute where attrelid = 'public.community_players'::regclass and
attname = 'role'))`) that the comment is set.

- [ ] **Step 4: Update schema.sql and the checklist**

Add the same `comment on column` statement to `supabase/migrations/schema.sql`, near
the `community_players` table definition. Add a line to
`docs/operations/auth-production-checklist.md`:
`- [ ] community_players.role permanece marcado como legado (nao usar em novas features).`

- [ ] **Step 5: Run the full suite, typecheck, lint**

```bash
npm test
npx tsc --noEmit
npm run lint:eslint
```

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260726130000_deprecate_community_players_role.sql supabase/migrations/schema.sql docs/operations/auth-production-checklist.md
git commit -m "docs(db): mark community_players.role as deprecated"
```

---

## Achado aberto: `schema.sql` está longe de reproduzir produção

Descoberto ao fazer o Step 4 da Task 2. **24 das 48 funções de produção não existem no
`schema.sql`** — não é só a Task 2. Faltam, entre outras, o sistema de entrada em
comunidade inteiro (`request_to_join_community`, `request_to_join_public`,
`approve_join_request`, `reject_join_request`, `generate_join_code`,
`disable_join_code`, `find_community_by_code`, `search_public_communities`,
`leave_community`, `add_community_member_by_email`, `set_community_visibility`),
a aprovação de avatar (`propose_player_avatar`, `approve_player_avatar`,
`reject_player_avatar`), e guards como `prevent_last_community_owner_change` e
`guard_community_member_owner_role`.

O backfill anterior (`3191f24`) cobriu apenas **tabelas**, não funções. Enquanto isso
não for fechado, `schema.sql` não serve para o propósito declarado dele ("paste this
schema directly into the Supabase SQL Editor"): um projeto novo criado a partir dele
sobe sem metade dos RPCs. Vale um plano próprio, com o mesmo cuidado de verificação
contra produção usado aqui.

## Completion Gate

- [ ] `programmer` holds every `global_role_capabilities` grant except
      `manage_community_ownership`; a test proves `transfer_community_ownership`
      rejects a `programmer` caller and `set_community_member_role`/
      `remove_community_member` reject any attempt to touch a `role = 'owner'` row,
      for any caller including `programmer`/`master`.
- [ ] `organizador` exists as a `community_members.role`, limited to
      `manage_sessions`; `moderator` is limited to `approve_members` +
      `manage_sessions` (no `edit_community_info`, no `manage_members`) — both
      verified by capability-table tests and `communityPermissions.ts` tests.
- [ ] A `community_role_capability_overrides` row can grant an extra capability to a
      role in one community without affecting the same role in a different
      community — verified by a test with two communities.
- [ ] `admin` can now update community core info via RLS (previously blocked by the
      stale `owner_id`-only policy) — verified by a positive RLS test.
- [ ] An ordinary community member cannot read another member's email (via `profiles`
      or `community_profile_summary`); a `manage_members` capability holder can —
      verified by positive and negative RLS tests.
- [ ] Password minimum of 8 is set on the real project (`csoslatxjjazrtrtylke`) and
      verified by a rejected signup attempt.
- [ ] A successful password change calls `signOutOthers`.
- [ ] `master`, `programmer`, and any community `owner` without a verified TOTP
      factor land on `mfa_setup_required` (routed to `/configurar-mfa`); after
      enrolling, they reach `ready`. An ordinary user's existing optional step-up
      (`mfa_required`) behavior is unchanged — verified by the regression test in
      Task 5 Step 5.
- [ ] `set_user_role`, `set_community_member_role`, `remove_community_member`, and
      `transfer_community_ownership` all reject calls without `aal2` at the database
      layer, independent of any client-side gating.
- [ ] `community_players.role` carries a deprecation comment in the real project and
      is not read by any code touched in this plan's diff.
- [ ] Full suite green (`npm test`), typecheck clean (`npx tsc --noEmit`), lint clean
      (`npm run lint:eslint`).
- [ ] All five new migrations have been applied to and verified against the real
      Supabase project (`csoslatxjjazrtrtylke`), each with `get_advisors` showing no
      new advisories.
