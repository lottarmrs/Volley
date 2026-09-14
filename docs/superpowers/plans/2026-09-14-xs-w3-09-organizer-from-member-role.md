# XS-W3-09 — ORGANIZER from the Organizador role — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Anyone promoted to Organizador in the members panel can create a target Session, and the
target membership model stops drifting from `community_members`.

**Architecture:** One migration adds an `after` row trigger on `public.community_members` that
projects each legacy write into `community_memberships` and `community_responsibilities`, a drift
function that measures what the projection should have produced, and a one-time reconciliation of
the drift accumulated since `20260827140000`. No client code changes.

**Tech Stack:** PostgreSQL (plpgsql, `security definer`, `search_path = ''`), Node test runner +
`pg` against a real database (`npm run test:db`).

**Spec:** `docs/superpowers/specs/2026-09-14-xs-w3-09-organizer-from-member-role-design.md`

## Global Constraints

- Migration file: `supabase/migrations/20260914120000_mirror_community_members_to_target.sql`.
- New functions live in `app_private`, are `security definer` with `set search_path = ''`, every
  object schema-qualified, and have `execute` revoked from `public, anon, authenticated`.
- Role mapping: `owner → owner`, `admin → admin`, `moderator`/`organizador`/`member → member`.
- Target-authority Communities (`communities.authority_model = 'target'`) are never mirrored.
- The trigger skips a Community with **no** active legacy owner; the reconciliation skips a Community
  without **exactly one** and records an anomaly.
- DB tests never mock the database; they need `VOLLEY_TEST_DATABASE_URL` (container
  `volley_test_pg2`, `127.0.0.1:55500`).
- No new source comments unless matching local density; SQL migrations in this repo carry explanatory
  headers, so the migration does too.

---

### Task 1: Failing test — a panel promotion cannot create a target Session today

**Files:**

- Create: `src/test/db/communityMembershipMirror.dbtest.ts`

**Interfaces:**

- Consumes: `asIdentityCommitting`, `connect`, `isTestDatabaseConfigured`, `rebuildFromMigrations`,
  `splitSqlStatements` from `./harness`.
- Produces: helpers `user`, `legacyCommunity`, `rpc`, `memberRowId`, `setRole`, `createSession`,
  `membership`, `activeResponsibilities`, `drift`, `panelContext` used by Tasks 2–3.

- [ ] **Step 1: Write the suite skeleton and the first test**

```ts
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import type { Client } from 'pg';
import {
  asIdentityCommitting,
  connect,
  isTestDatabaseConfigured,
  rebuildFromMigrations,
  splitSqlStatements,
} from './harness';

const MIGRATION = '20260914120000_mirror_community_members_to_target.sql';

if (!isTestDatabaseConfigured()) {
  test('community membership mirror requires VOLLEY_TEST_DATABASE_URL', () =>
    assert.fail('database is not configured'));
} else {
  let client: Client;
  test.before(async () => {
    client = await connect();
    const result = await rebuildFromMigrations(client);
    assert.equal(result.failures.filter(({ migration }) => migration === MIGRATION).length, 0);
  });
  test.after(async () => client.end());

  async function user(name: string) {
    const email = `${name}-${randomUUID()}@test.local`.toLowerCase();
    const { rows } = await client.query<{ id: string }>(
      'insert into auth.users (email) values ($1) returning id',
      [email],
    );
    await client.query(
      'insert into public.profiles (id,email,name) values ($1,$2,$3) on conflict (id) do update set email=excluded.email,name=excluded.name',
      [rows[0].id, email, name],
    );
    return { id: rows[0].id, email };
  }

  async function legacyCommunity(ownerId: string) {
    const { rows } = await client.query<{ id: string }>(
      'insert into public.communities (name, owner_id) values ($1, $2) returning id',
      [`Mirror ${randomUUID()}`, ownerId],
    );
    return rows[0].id;
  }

  async function rpc(actor: string | null, sql: string, args: unknown[] = []) {
    return asIdentityCommitting(client, actor, async () => {
      await client.query('select set_config($1, $2, true)', [
        'request.jwt.claims',
        JSON.stringify({ sub: actor, role: actor ? 'authenticated' : 'anon', aal: 'aal2' }),
      ]);
      return client.query(sql, args);
    });
  }

  async function memberRowId(community: string, userId: string) {
    const { rows } = await client.query<{ id: string }>(
      'select id from public.community_members where community_id = $1 and user_id = $2',
      [community, userId],
    );
    return rows[0].id;
  }

  async function setRole(actor: string, community: string, userId: string, role: string) {
    await rpc(actor, 'select public.set_community_member_role($1, $2)', [
      await memberRowId(community, userId),
      role,
    ]);
  }

  async function createSession(actor: string, community: string) {
    return rpc(
      actor,
      "select public.create_target_session($1,$2,'COMMUNITY','FREE_PLAY',$3,null,null) as id",
      [randomUUID(), community, 'Sessão espelhada'],
    );
  }

  async function membership(community: string, userId: string) {
    const { rows } = await client.query<{ role: string; status: string }>(
      'select role, status from public.community_memberships where community_id = $1 and user_id = $2',
      [community, userId],
    );
    return rows[0] ?? null;
  }

  async function activeResponsibilities(community: string, userId: string) {
    const { rows } = await client.query<{ responsibility: string }>(
      `select responsibility from public.community_responsibilities
        where community_id = $1 and user_id = $2 and revoked_at is null
        order by responsibility`,
      [community, userId],
    );
    return rows.map((row) => row.responsibility);
  }

  async function drift(community: string) {
    const { rows } = await client.query<{ user_id: string | null; issue: string }>(
      'select user_id, issue from app_private.community_membership_drift() where community_id = $1',
      [community],
    );
    return rows;
  }

  async function panelContext() {
    const owner = await user('Owner');
    const member = await user('Member');
    const community = await legacyCommunity(owner.id);
    await rpc(owner.id, 'select public.add_community_member_by_identifier($1, $2)', [
      community,
      member.email,
    ]);
    return { owner, member, community };
  }

  test('promoting a panel member to organizador lets them create a target Session', async () => {
    const c = await panelContext();
    await setRole(c.owner.id, c.community, c.member.id, 'organizador');
    const { rows } = await createSession(c.member.id, c.community);
    assert.ok(rows[0].id);
    assert.deepEqual(await drift(c.community), []);
  });
}
```

- [ ] **Step 2: Run it and watch it fail**

Run: `VOLLEY_TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55500/postgres node --import tsx --test src/test/db/communityMembershipMirror.dbtest.ts`
Expected: FAIL with `42501` (`Active Community Membership is required`) from `create_target_session`.

- [ ] **Step 3: Commit the red test**

```bash
git add src/test/db/communityMembershipMirror.dbtest.ts
git commit -m "test: promover a Organizador pelo painel nao cria Session target (XS-W3-09)"
```

### Task 2: The mirror trigger and the drift function

**Files:**

- Create: `supabase/migrations/20260914120000_mirror_community_members_to_target.sql`
- Modify: `src/test/db/communityMembershipMirror.dbtest.ts` (tests 2–10)

**Interfaces:**

- Produces: `app_private.legacy_membership_mirrored(uuid) returns boolean`,
  `app_private.project_legacy_community_membership(uuid, uuid) returns void`,
  `app_private.mirror_community_member_to_target() returns trigger`,
  `app_private.community_membership_drift() returns table (community_id uuid, user_id uuid, issue text)`.

- [ ] **Step 1: Write the migration (mirror + drift, no reconciliation yet)**

```sql
-- C6 XS-W3-09 — Mirror legacy community_members into the target membership model
--
-- The split of 20260827140000 was expand-only: community_members stayed authoritative, and every
-- RPC the members panel calls still writes only there. Everything C6 reads -- community_capabilities,
-- set_community_organizer, set_community_evaluator, create_target_session -- requires an active row
-- in community_memberships. A member added after the split had none, a removed member kept theirs,
-- and a promotion to organizador never became an ORGANIZER responsibility.
--
-- DUAL WRITE, C6 master §10.4. community_members is canonical for legacy Communities; one trigger
-- owns the second write for every legacy writer, in the same transaction; drift is measured by
-- app_private.community_membership_drift(); the trigger is removed by the W2 membership cutover.
-- Target-cohort Communities are not mirrored: their semantic commands write memberships directly.

create or replace function app_private.legacy_membership_mirrored(p_community_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.communities c
     where c.id = p_community_id
       and c.authority_model = 'legacy'
       and exists (
         select 1 from public.community_members m
          where m.community_id = c.id and m.role = 'owner' and m.status = 'active'
       )
  );
$$;

-- Idempotent: derives the target rows for one (community, user) from the current legacy row, so the
-- trigger and the reconciliation share one definition of "what the projection should be".
create or replace function app_private.project_legacy_community_membership(
  p_community_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_legacy_role text;
  v_target_role text;
begin
  if not app_private.legacy_membership_mirrored(p_community_id) then
    return;
  end if;

  select m.role into v_legacy_role
    from public.community_members m
   where m.community_id = p_community_id and m.user_id = p_user_id and m.status = 'active';

  if v_legacy_role is null then
    -- Losing the membership ends every duty tied to it; otherwise rejoining would silently
    -- restore them.
    delete from public.community_memberships
     where community_id = p_community_id and user_id = p_user_id;
    update public.community_responsibilities
       set revoked_at = pg_catalog.now()
     where community_id = p_community_id and user_id = p_user_id and revoked_at is null;
    return;
  end if;

  v_target_role := case v_legacy_role
    when 'owner' then 'owner'
    when 'admin' then 'admin'
    else 'member'
  end;

  -- The legacy transfer promotes the new owner before demoting the old one, and
  -- community_memberships_one_active_owner is immediate. Demoting first matches the legacy
  -- transfer's next statement; the deferred owner invariant judges the final state.
  if v_target_role = 'owner' then
    update public.community_memberships
       set role = 'admin', updated_at = pg_catalog.now()
     where community_id = p_community_id
       and user_id <> p_user_id
       and role = 'owner'
       and status = 'active';
  end if;

  insert into public.community_memberships (community_id, user_id, role, status)
  values (p_community_id, p_user_id, v_target_role, 'active')
  on conflict (community_id, user_id) do update
    set role = excluded.role, status = 'active', updated_at = pg_catalog.now()
    where public.community_memberships.role is distinct from excluded.role
       or public.community_memberships.status <> 'active';
end;
$$;

create or replace function app_private.mirror_community_member_to_target()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_was_organizer boolean := false;
  v_is_organizer boolean := false;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    v_was_organizer := old.role = 'organizador' and old.status = 'active';
    perform app_private.project_legacy_community_membership(old.community_id, old.user_id);
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    v_is_organizer := new.role = 'organizador' and new.status = 'active';
    perform app_private.project_legacy_community_membership(new.community_id, new.user_id);

    -- Only the organizador transition touches ORGANIZER, so a responsibility granted through
    -- set_community_organizer survives an unrelated change such as member -> admin.
    if v_is_organizer and not v_was_organizer
       and app_private.legacy_membership_mirrored(new.community_id) then
      insert into public.community_responsibilities (
        community_id, user_id, responsibility, assigned_by
      )
      values (new.community_id, new.user_id, 'ORGANIZER', (select auth.uid()))
      on conflict (community_id, user_id, responsibility) do update
        set revoked_at = null,
            assigned_at = pg_catalog.now(),
            assigned_by = (select auth.uid())
        where public.community_responsibilities.revoked_at is not null;
    end if;
  end if;

  if tg_op = 'UPDATE' and v_was_organizer and not v_is_organizer
     and new.status = 'active'
     and app_private.legacy_membership_mirrored(old.community_id) then
    update public.community_responsibilities
       set revoked_at = pg_catalog.now()
     where community_id = old.community_id
       and user_id = old.user_id
       and responsibility = 'ORGANIZER'
       and revoked_at is null;
  end if;

  return null;
end;
$$;

drop trigger if exists mirror_community_member_to_target on public.community_members;
create trigger mirror_community_member_to_target
  after insert or update or delete on public.community_members
  for each row execute function app_private.mirror_community_member_to_target();

-- Measures the dual write: every row is a place where the target model differs from what the
-- projection of community_members says it should be.
create or replace function app_private.community_membership_drift()
returns table (community_id uuid, user_id uuid, issue text)
language sql
stable
security definer
set search_path = ''
as $$
  with mirrored as (
    select c.id
      from public.communities c
     where app_private.legacy_membership_mirrored(c.id)
  ),
  legacy as (
    select m.community_id, m.user_id, m.role,
           case m.role when 'owner' then 'owner' when 'admin' then 'admin' else 'member' end
             as target_role
      from public.community_members m
      join mirrored on mirrored.id = m.community_id
     where m.status = 'active'
  )
  select l.community_id, l.user_id, 'MISSING_MEMBERSHIP'
    from legacy l
   where not exists (
     select 1 from public.community_memberships t
      where t.community_id = l.community_id and t.user_id = l.user_id and t.status = 'active'
   )
  union all
  select l.community_id, l.user_id, 'ROLE_MISMATCH'
    from legacy l
    join public.community_memberships t
      on t.community_id = l.community_id and t.user_id = l.user_id and t.status = 'active'
   where t.role <> l.target_role
  union all
  select t.community_id, t.user_id, 'ORPHAN_MEMBERSHIP'
    from public.community_memberships t
    join mirrored on mirrored.id = t.community_id
   where not exists (
     select 1 from legacy l where l.community_id = t.community_id and l.user_id = t.user_id
   )
  union all
  select l.community_id, l.user_id, 'MISSING_ORGANIZER'
    from legacy l
   where l.role = 'organizador'
     and not exists (
       select 1 from public.community_responsibilities r
        where r.community_id = l.community_id and r.user_id = l.user_id
          and r.responsibility = 'ORGANIZER' and r.revoked_at is null
     )
  union all
  select r.community_id, r.user_id, 'ORPHAN_RESPONSIBILITY'
    from public.community_responsibilities r
    join mirrored on mirrored.id = r.community_id
   where r.revoked_at is null
     and not exists (
       select 1 from legacy l where l.community_id = r.community_id and l.user_id = r.user_id
     )
  union all
  select c.id, null::uuid, 'OWNERLESS_COMMUNITY'
    from public.communities c
   where c.authority_model = 'legacy'
     and not exists (
       select 1 from public.community_members m
        where m.community_id = c.id and m.role = 'owner' and m.status = 'active'
     );
$$;

revoke all on function app_private.legacy_membership_mirrored(uuid) from public, anon, authenticated;
revoke all on function app_private.project_legacy_community_membership(uuid, uuid)
  from public, anon, authenticated;
revoke all on function app_private.mirror_community_member_to_target() from public, anon, authenticated;
revoke all on function app_private.community_membership_drift() from public, anon, authenticated;
```

- [ ] **Step 2: Run Task 1's test and watch it pass**

Run: the command from Task 1, Step 2. Expected: PASS.

- [ ] **Step 3: Add tests 2–10 inside the `else` block, after the first test**

```ts
  test('returning to member revokes ORGANIZER and create_target_session raises 42501', async () => {
    const c = await panelContext();
    await setRole(c.owner.id, c.community, c.member.id, 'organizador');
    await setRole(c.owner.id, c.community, c.member.id, 'member');
    assert.deepEqual(await membership(c.community, c.member.id), { role: 'member', status: 'active' });
    assert.deepEqual(await activeResponsibilities(c.community, c.member.id), []);
    await assert.rejects(createSession(c.member.id, c.community), { code: '42501' });
    assert.deepEqual(await drift(c.community), []);
  });

  test('remove_community_member deletes the membership and revokes every responsibility', async () => {
    const c = await panelContext();
    await setRole(c.owner.id, c.community, c.member.id, 'organizador');
    await client.query(
      "insert into public.community_responsibilities (community_id, user_id, responsibility) values ($1, $2, 'EVALUATOR')",
      [c.community, c.member.id],
    );
    await rpc(c.owner.id, 'select public.remove_community_member($1)', [
      await memberRowId(c.community, c.member.id),
    ]);
    assert.equal(await membership(c.community, c.member.id), null);
    assert.deepEqual(await activeResponsibilities(c.community, c.member.id), []);
    await assert.rejects(createSession(c.member.id, c.community), { code: '42501' });
    assert.deepEqual(await drift(c.community), []);
  });

  test('leave_community deletes the membership and revokes ORGANIZER', async () => {
    const c = await panelContext();
    await setRole(c.owner.id, c.community, c.member.id, 'organizador');
    await rpc(c.member.id, 'select public.leave_community($1)', [c.community]);
    assert.equal(await membership(c.community, c.member.id), null);
    assert.deepEqual(await activeResponsibilities(c.community, c.member.id), []);
    assert.deepEqual(await drift(c.community), []);
  });

  test('a join request becomes a membership only when approved, never when rejected', async () => {
    const owner = await user('JoinOwner');
    const approved = await user('Approved');
    const rejected = await user('Rejected');
    const community = await legacyCommunity(owner.id);
    const { rows } = await rpc(owner.id, 'select public.generate_join_code($1) as code', [community]);
    const code = rows[0].code as string;

    for (const applicant of [approved, rejected]) {
      await rpc(applicant.id, 'select public.request_to_join_community($1)', [code]);
      assert.equal(await membership(community, applicant.id), null);
    }

    await rpc(owner.id, 'select public.approve_join_request($1)', [
      await memberRowId(community, approved.id),
    ]);
    await rpc(owner.id, 'select public.reject_join_request($1)', [
      await memberRowId(community, rejected.id),
    ]);

    assert.deepEqual(await membership(community, approved.id), { role: 'member', status: 'active' });
    assert.equal(await membership(community, rejected.id), null);
    assert.deepEqual(await drift(community), []);
  });

  test('a moderator mirrors as member, never above it', async () => {
    const c = await panelContext();
    await setRole(c.owner.id, c.community, c.member.id, 'moderator');
    assert.deepEqual(await membership(c.community, c.member.id), { role: 'member', status: 'active' });
    assert.deepEqual(await activeResponsibilities(c.community, c.member.id), []);
  });

  test('an ORGANIZER granted by set_community_organizer survives member -> admin', async () => {
    const c = await panelContext();
    await rpc(c.owner.id, 'select public.set_community_organizer($1, $2, true)', [
      c.community,
      c.member.id,
    ]);
    await setRole(c.owner.id, c.community, c.member.id, 'admin');
    assert.deepEqual(await membership(c.community, c.member.id), { role: 'admin', status: 'active' });
    assert.deepEqual(await activeResponsibilities(c.community, c.member.id), ['ORGANIZER']);
  });

  test('the legacy ownership transfer leaves exactly one active owner membership', async () => {
    const c = await panelContext();
    const master = await user('Master');
    await client.query("update public.profiles set role = 'master' where id = $1", [master.id]);
    await rpc(master.id, 'select public.transfer_community_ownership($1, $2)', [
      c.community,
      await memberRowId(c.community, c.member.id),
    ]);
    assert.deepEqual(await membership(c.community, c.member.id), { role: 'owner', status: 'active' });
    assert.deepEqual(await membership(c.community, c.owner.id), { role: 'admin', status: 'active' });
    assert.deepEqual(await drift(c.community), []);
  });

  test('a target Community is not mirrored and create_community_with_owner still works', async () => {
    const owner = await user('TargetOwner');
    const legacyOrganizer = await user('LegacyOrganizer');
    const { rows } = await rpc(owner.id, 'select public.create_community_with_owner($1) as id', [
      'Target mirror fence',
    ]);
    const community = rows[0].id as string;
    await client.query(
      "insert into public.community_members (community_id, user_id, role, status) values ($1, $2, 'organizador', 'active')",
      [community, legacyOrganizer.id],
    );
    assert.equal(await membership(community, legacyOrganizer.id), null);
    assert.deepEqual(await activeResponsibilities(community, legacyOrganizer.id), []);
  });

  test('deleting a legacy Community cascades through the mirror without error', async () => {
    const c = await panelContext();
    await setRole(c.owner.id, c.community, c.member.id, 'organizador');
    await client.query('delete from public.communities where id = $1', [c.community]);
    const { rows } = await client.query<{ n: number }>(
      'select count(*)::int as n from public.community_memberships where community_id = $1',
      [c.community],
    );
    assert.equal(rows[0].n, 0);
  });

  test('no mirror function is executable by anon or authenticated', async () => {
    for (const fn of [
      'app_private.legacy_membership_mirrored(uuid)',
      'app_private.project_legacy_community_membership(uuid, uuid)',
      'app_private.mirror_community_member_to_target()',
      'app_private.community_membership_drift()',
    ]) {
      for (const role of ['anon', 'authenticated']) {
        const { rows } = await client.query<{ ok: boolean }>(
          'select has_function_privilege($1, $2, $3) as ok',
          [role, fn, 'execute'],
        );
        assert.equal(rows[0].ok, false, `${role} must not execute ${fn}`);
      }
    }
  });
```

- [ ] **Step 4: Run the suite**

Run: the command from Task 1, Step 2. Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260914120000_mirror_community_members_to_target.sql src/test/db/communityMembershipMirror.dbtest.ts
git commit -m "feat: espelhar community_members no modelo de membership target (XS-W3-09)"
```

### Task 3: One-time reconciliation

**Files:**

- Modify: `supabase/migrations/20260914120000_mirror_community_members_to_target.sql` (append)
- Modify: `src/test/db/communityMembershipMirror.dbtest.ts` (last test)

- [ ] **Step 1: Write the failing reconciliation test as the LAST test of the file**

It rebuilds without the migration, so it must stay last.

```ts
  test('the migration reconciles drift accumulated before it and quarantines ownerless Communities', async () => {
    await rebuildFromMigrations(client, { excludeMigrationNames: [MIGRATION] });
    const owner = await user('ReconOwner');
    const admin = await user('ReconAdmin');
    const organizer = await user('ReconOrganizer');
    const removed = await user('ReconRemoved');
    const community = await legacyCommunity(owner.id);
    await client.query(
      "insert into public.community_memberships (community_id, user_id, role, status) values ($1, $2, 'owner', 'active'), ($1, $3, 'member', 'active')",
      [community, owner.id, removed.id],
    );
    await client.query(
      "insert into public.community_responsibilities (community_id, user_id, responsibility) values ($1, $2, 'ORGANIZER')",
      [community, removed.id],
    );
    await client.query(
      "insert into public.community_members (community_id, user_id, role, status) values ($1, $2, 'admin', 'active'), ($1, $3, 'organizador', 'active')",
      [community, admin.id, organizer.id],
    );

    const ghostOwner = await user('GhostOwner');
    const ownerless = await legacyCommunity(ghostOwner.id);
    await client.query(
      'alter table public.community_members disable trigger prevent_last_community_owner_delete',
    );
    await client.query('delete from public.community_members where community_id = $1', [ownerless]);
    await client.query(
      'alter table public.community_members enable trigger prevent_last_community_owner_delete',
    );

    const sql = readFileSync(join(process.cwd(), 'supabase', 'migrations', MIGRATION), 'utf8');
    for (const statement of splitSqlStatements(sql)) await client.query(statement);

    assert.deepEqual(await membership(community, owner.id), { role: 'owner', status: 'active' });
    assert.deepEqual(await membership(community, admin.id), { role: 'admin', status: 'active' });
    assert.deepEqual(await membership(community, organizer.id), { role: 'member', status: 'active' });
    assert.deepEqual(await activeResponsibilities(community, organizer.id), ['ORGANIZER']);
    assert.equal(await membership(community, removed.id), null);
    assert.deepEqual(await activeResponsibilities(community, removed.id), []);
    assert.deepEqual(await drift(community), []);

    const { rows: anomalies } = await client.query<{ source_id: string }>(
      `select a.source_id from app_private.migration_anomalies a
         join app_private.migration_runs r on r.run_id = a.run_id
        where r.name = 'mirror_community_members_to_target' and a.source_id = $1`,
      [ownerless],
    );
    assert.equal(anomalies.length, 1);
    const { rows: runs } = await client.query<{ status: string; notes: string }>(
      "select status, notes from app_private.migration_runs where name = 'mirror_community_members_to_target'",
    );
    assert.equal(runs.length, 1);
    assert.equal(runs[0].status, 'COMPLETED');
    assert.match(runs[0].notes, /drift before: \d+; after: 0/);
  });
```

- [ ] **Step 2: Run and watch it fail**

Expected: FAIL — `membership(community, admin.id)` is `null` (nothing reconciles existing rows).

- [ ] **Step 3: Append the reconciliation to the migration**

```sql
-- ── One-time reconciliation ─────────────────────────────────────────────────
-- Replays the projection over every (community, user) that either model mentions, for legacy
-- Communities with exactly one active owner. A Community without exactly one is left untouched and
-- quarantined: forcing an owner onto it would be guessing.
do $$
declare
  v_run_id uuid;
  v_before integer;
  v_after integer;
  v_pair record;
begin
  if to_regclass('app_private.migration_runs') is null then
    return;
  end if;

  insert into app_private.migration_runs (name, source_release, status)
  values ('mirror_community_members_to_target', 'XS-W3-09', 'RUNNING')
  returning run_id into v_run_id;

  select count(*) into v_before
    from app_private.community_membership_drift() d
   where d.issue <> 'OWNERLESS_COMMUNITY';

  insert into app_private.migration_anomalies (run_id, source_type, source_id, reason, details)
  select v_run_id, 'communities', c.id::text,
         'legacy community without exactly one active owner is not mirrored',
         jsonb_build_object('active_owners', o.n)
    from public.communities c
    cross join lateral (
      select count(*) as n from public.community_members m
       where m.community_id = c.id and m.role = 'owner' and m.status = 'active'
    ) o
   where c.authority_model = 'legacy' and o.n <> 1
  on conflict do nothing;

  for v_pair in
    with eligible as (
      select c.id
        from public.communities c
       where c.authority_model = 'legacy'
         and (select count(*) from public.community_members m
               where m.community_id = c.id and m.role = 'owner' and m.status = 'active') = 1
    )
    select k.community_id, k.user_id
      from (
        select m.community_id, m.user_id from public.community_members m
        union
        select t.community_id, t.user_id from public.community_memberships t
        union
        select r.community_id, r.user_id from public.community_responsibilities r
         where r.revoked_at is null
      ) k
      join eligible e on e.id = k.community_id
  loop
    perform app_private.project_legacy_community_membership(v_pair.community_id, v_pair.user_id);
  end loop;

  insert into public.community_responsibilities (community_id, user_id, responsibility)
  select m.community_id, m.user_id, 'ORGANIZER'
    from public.community_members m
   where m.role = 'organizador'
     and m.status = 'active'
     and app_private.legacy_membership_mirrored(m.community_id)
     and (select count(*) from public.community_members o
           where o.community_id = m.community_id and o.role = 'owner' and o.status = 'active') = 1
  on conflict (community_id, user_id, responsibility) do update
    set revoked_at = null, assigned_at = pg_catalog.now()
    where public.community_responsibilities.revoked_at is not null;

  select count(*) into v_after
    from app_private.community_membership_drift() d
   where d.issue <> 'OWNERLESS_COMMUNITY';

  update app_private.migration_runs
     set status = 'COMPLETED',
         finished_at = pg_catalog.now(),
         notes = pg_catalog.format('drift before: %s; after: %s', v_before, v_after)
   where run_id = v_run_id;
end $$;
```

- [ ] **Step 4: Run the suite** — Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260914120000_mirror_community_members_to_target.sql src/test/db/communityMembershipMirror.dbtest.ts
git commit -m "feat: reconciliar a divergencia de membership acumulada desde o split (XS-W3-09)"
```

### Task 4: Existing suites that encoded the drift

**Files:**

- Modify: `src/test/db/authCascadeSafety.dbtest.ts:262-265`
- Modify: `src/test/db/securityAuditRemediation.dbtest.ts:67-70`
- Modify: `src/test/db/playerEvaluationContributions.dbtest.ts:114-117`
- Modify: `src/test/db/governanceCapabilities.dbtest.ts:352-356`
- Modify: `src/test/db/communitySemanticWrites.dbtest.ts:85`

- [ ] **Step 1: Run the full DB suite and record every failure**

Run: `VOLLEY_TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55500/postgres npm run test:db`
Expected failures, and only these:

- the three fixtures that hand-insert the owner membership of a directly inserted (legacy) Community
  now hit `23505` on `community_memberships_community_id_user_id_key`: the mirror already wrote it;
- `governanceCapabilities` "a legacy moderator is quarantined" asserts no membership row exists; the
  mirror now writes `member`, as the spec decides.

Any other failure is a finding: stop and diagnose before editing.

- [ ] **Step 2: Fix the three fixtures by tolerating the mirrored owner row**

In each of the three owner-membership inserts, append `on conflict (community_id, user_id) do nothing`:

```ts
      `insert into public.community_memberships (community_id, user_id, role, status)
       values ($1, $2, 'owner', 'active')
       on conflict (community_id, user_id) do nothing`,
```

- [ ] **Step 3: Restate the moderator assertion as "no rank above member"**

```ts
    // No governance rank above member was invented for them either way.
    const rank = await client.query<{ role: string }>(
      'select role from public.community_memberships where community_id = $1 and user_id = $2',
      [community, mod],
    );
    assert.equal(
      rank.rows.some((r) => r.role === 'admin' || r.role === 'owner'),
      false,
      'no rank above member may be guessed for an unresolved moderator',
    );
```

- [ ] **Step 4: Correct the now-false helper comment in `communitySemanticWrites.dbtest.ts`**

```ts
  /** A row written the legacy way: legacy authority model, membership mirrored from community_members. */
```

- [ ] **Step 5: Run the full DB suite** — Expected: zero failures.

- [ ] **Step 6: Commit**

```bash
git add src/test/db/authCascadeSafety.dbtest.ts src/test/db/securityAuditRemediation.dbtest.ts src/test/db/playerEvaluationContributions.dbtest.ts src/test/db/governanceCapabilities.dbtest.ts src/test/db/communitySemanticWrites.dbtest.ts
git commit -m "test: fixtures de comunidade legada passam a conviver com o espelho de membership"
```

### Task 5: Mutation proofs, gates and records

**Files:**

- Modify: `README.md` (after the `20260910100000_set_community_organizer.sql` paragraph)
- Modify: `HANDOFF.md`, `docs/architecture/execution/C6-REACHABILITY-MAP.md`

- [ ] **Step 1: Prove three guards by mutation, restoring each with `git checkout` of the migration**

1. In `legacy_membership_mirrored`, drop `and c.authority_model = 'legacy'` → expect exactly
   "a target Community is not mirrored…" to fail.
2. In `project_legacy_community_membership`, delete the owner-demotion `update` → expect exactly "the
   legacy ownership transfer…" to fail (`23505`).
3. In the trigger's revoke condition, replace `v_was_organizer and not v_is_organizer` with
   `not v_is_organizer` (revoke on any update that is not organizador) → expect exactly "an ORGANIZER
   granted by set_community_organizer survives…" to fail.

Record which test each mutation killed.

- [ ] **Step 2: Add the README paragraph**

```markdown
`20260914120000_mirror_community_members_to_target.sql` espelha `community_members` em
`community_memberships` e `community_responsibilities` por trigger, para Comunidades legadas: todo RPC
do painel de membros continuava escrevendo só na tabela antiga, então membro novo não tinha membership,
membro removido mantinha a sua e promover a Organizador nunca concedia `ORGANIZER`. O cargo
`organizador` agora concede e revoga `ORGANIZER`; perder a membership revoga todas as
responsabilidades. A migration reconcilia a divergência acumulada desde `20260827140000` e registra
em `app_private.migration_anomalies` as Comunidades legadas sem exatamente um dono, que ficam fora.
`app_private.community_membership_drift()` mede a divergência. Comunidades target não são espelhadas.
```

- [ ] **Step 3: Run every gate**

Run, in order: `npm run typecheck`, `npm test`, `npm run test:db` (full), `npm run build`,
`npx prettier --check` on the touched files, `npx eslint --quiet` on the touched TS files,
`git diff --check`. Expected: all pass.

- [ ] **Step 4: Update HANDOFF and the reachability map** with the slice row, what it delivered, the
  verification evidence from Steps 1 and 3, and the remaining known issue (owners and admins still get
  `42501`). Re-derive wall 3 of the map.

- [ ] **Step 5: Commit**

```bash
git add README.md HANDOFF.md docs/architecture/execution/C6-REACHABILITY-MAP.md
git commit -m "docs: registrar a XS-W3-09 e sua evidencia de verificacao"
```
