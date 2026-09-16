# XS-W6-08a Mandatory Evaluation Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Activate the versioned evaluation model for every Community and give the legacy organizing roles the `ORGANIZER` responsibility, then make the app stop members from starting Community Sessions and drop the activation control from the editor.

**Architecture:** One migration activates existing Communities, adds an `after insert` trigger for new ones, redefines the XS-W3-09 mirror so the legacy `manage_sessions` roles (owner, admin, moderator, organizador) hold `ORGANIZER`, redefines the drift check to match, and backfills. The client exposes whether Community members are resolved, a pure access decision gates `SessionWizardRoute`, and `CommunityEvaluationEditor` loses its legacy activation block.

**Tech Stack:** PostgreSQL migrations (Supabase), Node test runner + `pg` for `.dbtest.ts`, React 19 + Vitest + Testing Library, TypeScript.

**Spec:** `docs/superpowers/specs/2026-09-15-xs-w6-08a-mandatory-evaluation-model-design.md`

## Global Constraints

- Work only in the worktree `C:\Volley-xs-w6-08`, branch `exec/c6-authorized-team-formation`. Never switch branches or stage files in `C:\Volley` (other sessions share it). Stage explicit paths only.
- Do not commit `docs/superpowers/specs/2026-09-15-xs-w6-08-authorized-team-formation-design.md`; its uncommitted edits belong to XS-W6-08c.
- Migration file name: `supabase/migrations/20260915180000_mandatory_evaluation_model.sql`.
- Organizing roles, exactly: `('owner', 'admin', 'moderator', 'organizador')`.
- Target-model Communities keep `GINV-CAP-002`: no rank-derived `ORGANIZER`. `governanceCapabilities.dbtest.ts`, `playerEvaluationContributions.dbtest.ts` and `sessionTargetRoot.dbtest.ts` must not change.
- The migration only redefines functions (`create or replace`) and never re-creates the mirror trigger: `communityMembershipMirror.dbtest.ts` rebuilds without `20260914120000`, and this migration must not add statement failures that matter there.
- Blocked-route copy, exactly: "Só dono, admin, moderador ou Organizador criam sessões nesta comunidade." Button: "Voltar à comunidade". Heading: "Nova sessão indisponível".
- No comments in TypeScript source unless the surrounding file already explains a non-obvious rule in the same place.
- Database: container `volley_test_pg2`; `VOLLEY_TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55500/volley_test`.
- Commit messages in Portuguese without accents, ending with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- Do not apply the migration to the Supabase project; production waits for the user.

---

### Task 1: Migration, its database suite and the fixtures it changes

**Files:**
- Create: `supabase/migrations/20260915180000_mandatory_evaluation_model.sql`
- Create: `src/test/db/mandatoryEvaluationModel.dbtest.ts`
- Modify: `src/test/db/communityEvaluationEditor.dbtest.ts:51-52` (Community fixture)
- Modify: `src/test/db/balanceInputSnapshots.dbtest.ts:84-89` (Community fixture)
- Modify: `src/test/db/communityMembershipMirror.dbtest.ts:218-226` (moderator test)

**Interfaces:**
- Consumes: `app_private.legacy_membership_mirrored(uuid)` and `app_private.project_legacy_community_membership(uuid, uuid)` from `20260914120000_mirror_community_members_to_target.sql`.
- Produces: `app_private.activate_evaluation_model_for_new_community()` trigger function; trigger `activate_evaluation_model_on_community_insert` on `public.communities`; redefined `app_private.mirror_community_member_to_target()` and `app_private.community_membership_drift()`.

- [ ] **Step 1: Prepare the worktree**

The worktree has no `node_modules`. Link the main checkout's, then confirm the database container is up.

```bash
cd /c/Volley-xs-w6-08 && [ -e node_modules ] || cmd //c mklink //J node_modules C:\\Volley\\node_modules
docker start volley_test_pg2
git -C /c/Volley-xs-w6-08 status --short
```

Expected: `git status` lists only ` M docs/superpowers/specs/2026-09-15-xs-w6-08-authorized-team-formation-design.md` (`node_modules` is ignored).

- [ ] **Step 2: Write the failing database suite**

Create `src/test/db/mandatoryEvaluationModel.dbtest.ts`:

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

const MIGRATION = '20260915180000_mandatory_evaluation_model.sql';

if (!isTestDatabaseConfigured()) {
  test('mandatory evaluation model requires VOLLEY_TEST_DATABASE_URL', () =>
    assert.fail('database is not configured'));
} else {
  let client: Client;
  test.before(async () => {
    client = await connect();
    const result = await rebuildFromMigrations(client);
    assert.deepEqual(
      result.failures.filter(({ migration }) => migration === MIGRATION),
      [],
    );
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
      [`Mandatory ${randomUUID()}`, ownerId],
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
      [randomUUID(), community, 'Sessão obrigatória'],
    );
  }

  async function inTransactionWith(setting: string, sql: string, args: unknown[]) {
    await client.query('begin');
    try {
      await client.query('select set_config($1, $2, true)', [setting, 'on']);
      await client.query(sql, args);
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    }
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

  async function activated(community: string) {
    const { rows } = await client.query<{ n: number }>(
      'select count(*)::int as n from app_private.community_evaluation_cutovers where community_id = $1',
      [community],
    );
    return rows[0].n === 1;
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

  test('a legacy Community is activated as soon as it is inserted', async () => {
    const owner = await user('LegacyOwner');
    const community = await legacyCommunity(owner.id);
    assert.equal(await activated(community), true);
  });

  test('create_community_with_owner activates the target Community without rank-derived ORGANIZER', async () => {
    const owner = await user('TargetOwner');
    const { rows } = await rpc(owner.id, 'select public.create_community_with_owner($1) as id', [
      'Target activated',
    ]);
    const community = rows[0].id as string;
    assert.equal(await activated(community), true);
    assert.deepEqual(await activeResponsibilities(community, owner.id), []);
  });

  test('the legacy owner holds ORGANIZER and creates a target Session; a member cannot', async () => {
    const c = await panelContext();
    assert.deepEqual(await activeResponsibilities(c.community, c.owner.id), ['ORGANIZER']);
    const { rows } = await createSession(c.owner.id, c.community);
    assert.equal(rows.length, 1);
    await assert.rejects(createSession(c.member.id, c.community), { code: '42501' });
    assert.deepEqual(await drift(c.community), []);
  });

  for (const role of ['admin', 'moderator', 'organizador']) {
    test(`${role} grants ORGANIZER and returning to member revokes it`, async () => {
      const c = await panelContext();
      await setRole(c.owner.id, c.community, c.member.id, role);
      assert.deepEqual(await activeResponsibilities(c.community, c.member.id), ['ORGANIZER']);
      await setRole(c.owner.id, c.community, c.member.id, 'member');
      assert.deepEqual(await activeResponsibilities(c.community, c.member.id), []);
      await assert.rejects(createSession(c.member.id, c.community), { code: '42501' });
      assert.deepEqual(await drift(c.community), []);
    });
  }

  test('an ownership transfer keeps ORGANIZER for both parties', async () => {
    const c = await panelContext();
    const master = await user('Master');
    await inTransactionWith(
      'app.allow_role_change',
      "update public.profiles set role = 'master' where id = $1",
      [master.id],
    );
    await rpc(master.id, 'select public.transfer_community_ownership($1, $2)', [
      c.community,
      await memberRowId(c.community, c.member.id),
    ]);
    assert.deepEqual(await activeResponsibilities(c.community, c.member.id), ['ORGANIZER']);
    assert.deepEqual(await activeResponsibilities(c.community, c.owner.id), ['ORGANIZER']);
    assert.deepEqual(await drift(c.community), []);
  });

  test('drift reports MISSING_ORGANIZER for an admin whose ORGANIZER was revoked by hand', async () => {
    const c = await panelContext();
    await setRole(c.owner.id, c.community, c.member.id, 'admin');
    await client.query(
      "update public.community_responsibilities set revoked_at = now() where community_id = $1 and user_id = $2 and responsibility = 'ORGANIZER'",
      [c.community, c.member.id],
    );
    assert.deepEqual(await drift(c.community), [
      { user_id: c.member.id, issue: 'MISSING_ORGANIZER' },
    ]);
  });

  test('the migration activates and backfills Communities that existed before it', async () => {
    await rebuildFromMigrations(client, { excludeMigrationNames: [MIGRATION] });
    const owner = await user('BeforeOwner');
    const admin = await user('BeforeAdmin');
    const community = await legacyCommunity(owner.id);
    await client.query(
      "insert into public.community_members (community_id, user_id, role, status) values ($1, $2, 'admin', 'active')",
      [community, admin.id],
    );
    assert.equal(await activated(community), false);
    assert.deepEqual(await activeResponsibilities(community, owner.id), []);
    assert.deepEqual(await activeResponsibilities(community, admin.id), []);

    const sql = readFileSync(join(process.cwd(), 'supabase', 'migrations', MIGRATION), 'utf8');
    for (const statement of splitSqlStatements(sql)) await client.query(statement);

    assert.equal(await activated(community), true);
    assert.deepEqual(await activeResponsibilities(community, owner.id), ['ORGANIZER']);
    assert.deepEqual(await activeResponsibilities(community, admin.id), ['ORGANIZER']);
    assert.deepEqual(await drift(community), []);
  });
}
```

- [ ] **Step 3: Run it and watch it fail**

```bash
cd /c/Volley-xs-w6-08 && VOLLEY_TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55500/volley_test node scripts/db-harness.mjs mandatoryEvaluationModel.dbtest.ts
```

Expected: FAIL. The first test fails with `false !== true` (no activation), the owner test with `[] !== ['ORGANIZER']`, and the last test fails reading the migration file (`ENOENT`).

- [ ] **Step 4: Write the migration**

Create `supabase/migrations/20260915180000_mandatory_evaluation_model.sql`:

```sql
-- XS-W6-08a: the versioned evaluation model is mandatory for every Community, and the legacy
-- roles that already carry manage_sessions (owner, admin, moderator, organizador) hold ORGANIZER.
-- Target-model Communities keep GINV-CAP-002: no operational duty from governance rank.

insert into app_private.community_evaluation_cutovers (community_id, activated_by)
select c.id, null
  from public.communities c
on conflict (community_id) do nothing;

create or replace function app_private.activate_evaluation_model_for_new_community()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into app_private.community_evaluation_cutovers (community_id, activated_by)
  values (new.id, (select auth.uid()))
  on conflict (community_id) do nothing;
  return null;
end;
$$;

revoke all on function app_private.activate_evaluation_model_for_new_community()
  from public, anon, authenticated;

drop trigger if exists activate_evaluation_model_on_community_insert on public.communities;
create trigger activate_evaluation_model_on_community_insert
  after insert on public.communities
  for each row execute function app_private.activate_evaluation_model_for_new_community();

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
    v_was_organizer := old.role in ('owner', 'admin', 'moderator', 'organizador')
      and old.status = 'active';
    perform app_private.project_legacy_community_membership(old.community_id, old.user_id);
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    v_is_organizer := new.role in ('owner', 'admin', 'moderator', 'organizador')
      and new.status = 'active';
    perform app_private.project_legacy_community_membership(new.community_id, new.user_id);

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

revoke all on function app_private.mirror_community_member_to_target()
  from public, anon, authenticated;

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
   where l.role in ('owner', 'admin', 'moderator', 'organizador')
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

revoke all on function app_private.community_membership_drift() from public, anon, authenticated;

insert into public.community_responsibilities (community_id, user_id, responsibility)
select m.community_id, m.user_id, 'ORGANIZER'
  from public.community_members m
 where m.role in ('owner', 'admin', 'moderator', 'organizador')
   and m.status = 'active'
   and app_private.legacy_membership_mirrored(m.community_id)
on conflict (community_id, user_id, responsibility) do update
  set revoked_at = null, assigned_at = pg_catalog.now()
  where public.community_responsibilities.revoked_at is not null;
```

- [ ] **Step 5: Run the new suite and watch it pass**

```bash
cd /c/Volley-xs-w6-08 && VOLLEY_TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55500/volley_test node scripts/db-harness.mjs mandatoryEvaluationModel.dbtest.ts
```

Expected: PASS, 9 tests (`ℹ pass 9`, `ℹ fail 0`).

- [ ] **Step 6: Restore the unactivated starting state in the editor and snapshot fixtures**

In `src/test/db/communityEvaluationEditor.dbtest.ts`, inside `context()`, replace:

```ts
    const community = rows[0].id;
    const member = await user('Evaluator');
```

with:

```ts
    const community = rows[0].id;
    await client.query('delete from app_private.community_evaluation_cutovers where community_id = $1', [
      community,
    ]);
    const member = await user('Evaluator');
```

In `src/test/db/balanceInputSnapshots.dbtest.ts`, replace the body end of `newCommunity`:

```ts
      client.query<{ id: string }>('select public.create_community_with_owner($1) as id', [name]),
    );
    return rows[0].id;
  }
```

with:

```ts
      client.query<{ id: string }>('select public.create_community_with_owner($1) as id', [name]),
    );
    await client.query('delete from app_private.community_evaluation_cutovers where community_id = $1', [
      rows[0].id,
    ]);
    return rows[0].id;
  }
```

- [ ] **Step 7: Update the mirror suite's moderator expectation**

In `src/test/db/communityMembershipMirror.dbtest.ts`, replace:

```ts
  test('a moderator mirrors as member, never above it', async () => {
    const c = await panelContext();
    await setRole(c.owner.id, c.community, c.member.id, 'moderator');
    assert.deepEqual(await membership(c.community, c.member.id), {
      role: 'member',
      status: 'active',
    });
    assert.deepEqual(await activeResponsibilities(c.community, c.member.id), []);
  });
```

with:

```ts
  test('a moderator mirrors as member on governance and holds ORGANIZER from manage_sessions', async () => {
    const c = await panelContext();
    await setRole(c.owner.id, c.community, c.member.id, 'moderator');
    assert.deepEqual(await membership(c.community, c.member.id), {
      role: 'member',
      status: 'active',
    });
    assert.deepEqual(await activeResponsibilities(c.community, c.member.id), ['ORGANIZER']);
  });
```

- [ ] **Step 8: Run the three touched suites**

```bash
cd /c/Volley-xs-w6-08 && for s in communityEvaluationEditor balanceInputSnapshots communityMembershipMirror; do VOLLEY_TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55500/volley_test node scripts/db-harness.mjs $s.dbtest.ts 2>&1 | grep -E "^ℹ (pass|fail)"; done
```

Expected: every suite reports `ℹ fail 0`.

- [ ] **Step 9: Run the full database suite in the background**

```bash
cd /c/Volley-xs-w6-08 && VOLLEY_TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55500/volley_test npm run test:db > /tmp/xs-w6-08a-db.log 2>&1; grep -E "^ℹ (tests|pass|fail)" /tmp/xs-w6-08a-db.log; grep -B2 -A12 "^not ok" /tmp/xs-w6-08a-db.log | head -120
```

Expected: `ℹ fail 0`. If a suite fails, read the assertion. When it depends on a Community starting **unactivated**, apply the Step 6 deletion in that suite's Community fixture and rerun it. Any other failure means the migration changed behavior the spec did not plan for: stop and report it with the output, without editing the expectation.

- [ ] **Step 10: Commit**

```bash
cd /c/Volley-xs-w6-08 && git add -- supabase/migrations/20260915180000_mandatory_evaluation_model.sql src/test/db/mandatoryEvaluationModel.dbtest.ts src/test/db/communityEvaluationEditor.dbtest.ts src/test/db/balanceInputSnapshots.dbtest.ts src/test/db/communityMembershipMirror.dbtest.ts && git commit -q -F - <<'EOF'
feat: modelo de avaliacao obrigatorio e ORGANIZER pelos cargos legados

A migration ativa todas as comunidades e um gatilho ativa as novas. O espelho
de membros concede ORGANIZER a dono, admin, moderador e organizador, os cargos
que ja tem manage_sessions no modelo legado, e o drift passa a cobrir os quatro.
Backfill para quem ja tem esses cargos. Comunidades target seguem o GINV-CAP-002.

As suites do editor e do snapshot removem a ativacao no fixture, porque foram
escritas contra comunidades que nascem sem ativacao; o teste do moderador no
espelho passa a esperar ORGANIZER.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 2: Expose whether Community members are resolved

**Files:**
- Modify: `src/hooks/useCommunityMembers.ts:47-75, 188-192`
- Modify: `src/hooks/useCommunityPermissions.ts`
- Test: `src/hooks/useCommunityPermissions.spec.tsx` (create)

**Interfaces:**
- Consumes: `deriveCommunityPermissions` and `CommunityPermissions` from `src/domain/communityPermissions.ts`.
- Produces: `useCommunityMembers(...)` returns an extra `resolved: boolean`; `useCommunityPermissions(community: Community | null): CommunityPermissions & { membersResolved: boolean }`.

- [ ] **Step 1: Write the failing spec**

Create `src/hooks/useCommunityPermissions.spec.tsx`:

```tsx
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Community } from '../types';
import { useCommunityPermissions } from './useCommunityPermissions';

const state = vi.hoisted(() => ({
  auth: {
    isSupabaseConfigured: true,
    user: { id: 'user-1' } as { id: string } | null,
    profile: { role: 'user' },
  },
  members: { members: [] as unknown[], resolved: false },
}));

vi.mock('./useAuth', () => ({ useAuth: () => state.auth }));
vi.mock('./useCommunityMembers', () => ({ useCommunityMembers: () => state.members }));

const synced: Community = {
  id: 'community-1',
  name: 'Pelada',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  cloudId: '11111111-1111-4111-8111-111111111111',
};

describe('useCommunityPermissions membersResolved', () => {
  beforeEach(() => {
    state.auth.isSupabaseConfigured = true;
    state.auth.user = { id: 'user-1' };
    state.members = { members: [], resolved: false };
  });

  it('is false while the members of a synced Community are loading', () => {
    const { result } = renderHook(() => useCommunityPermissions(synced));
    expect(result.current.membersResolved).toBe(false);
    expect(result.current.canCreateSession).toBe(false);
  });

  it('resolves a plain member without session creation', () => {
    state.members = {
      members: [{ userId: 'user-1', role: 'member', status: 'active' }],
      resolved: true,
    };
    const { result } = renderHook(() => useCommunityPermissions(synced));
    expect(result.current.membersResolved).toBe(true);
    expect(result.current.canCreateSession).toBe(false);
  });

  it('resolves an owner with session creation', () => {
    state.members = {
      members: [{ userId: 'user-1', role: 'owner', status: 'active' }],
      resolved: true,
    };
    const { result } = renderHook(() => useCommunityPermissions(synced));
    expect(result.current.membersResolved).toBe(true);
    expect(result.current.canCreateSession).toBe(true);
  });

  it('is resolved at once for a local Community and for a signed-out user', () => {
    const local = renderHook(() => useCommunityPermissions({ ...synced, cloudId: undefined }));
    expect(local.result.current.membersResolved).toBe(true);
    expect(local.result.current.canCreateSession).toBe(true);

    state.auth.user = null;
    const signedOut = renderHook(() => useCommunityPermissions(synced));
    expect(signedOut.result.current.membersResolved).toBe(true);
    expect(signedOut.result.current.canCreateSession).toBe(true);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd /c/Volley-xs-w6-08 && npx vitest run src/hooks/useCommunityPermissions.spec.tsx
```

Expected: FAIL — `expected undefined to be false` on `membersResolved`.

- [ ] **Step 3: Track resolution in `useCommunityMembers`**

In `src/hooks/useCommunityMembers.ts`, replace:

```ts
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!enabled || !communityCloudId) {
      setMembers([]);
      return;
    }
    setLoading(true);
    setError(null);
```

with:

```ts
  const [error, setError] = useState<string | null>(null);
  const [resolved, setResolved] = useState(false);

  const reload = useCallback(async () => {
    if (!enabled || !communityCloudId) {
      setMembers([]);
      setResolved(true);
      return;
    }
    setResolved(false);
    setLoading(true);
    setError(null);
```

Replace:

```ts
      setMembers(result.value.members);
```

with:

```ts
      setMembers(result.value.members);
      setResolved(true);
```

In the returned object, replace:

```ts
    loading,
    error,
```

with:

```ts
    loading,
    resolved,
    error,
```

- [ ] **Step 4: Return `membersResolved` from `useCommunityPermissions`**

Replace the whole content of `src/hooks/useCommunityPermissions.ts` with:

```ts
import { useAuth } from './useAuth';
import { useCommunityMembers } from './useCommunityMembers';
import { Community } from '../types';
import {
  deriveCommunityPermissions,
  type CommunityPermissions,
} from '../domain/communityPermissions';

export function useCommunityPermissions(
  community: Community | null,
): CommunityPermissions & { membersResolved: boolean } {
  const auth = useAuth();
  const enabled = auth.isSupabaseConfigured && !!community?.cloudId;

  const { members, resolved } = useCommunityMembers({
    communityCloudId: community?.cloudId,
    communityLocalId: community?.id,
    currentUserId: auth.user?.id ?? null,
    enabled,
  });

  return {
    ...deriveCommunityPermissions({
      isSupabaseConfigured: auth.isSupabaseConfigured,
      userId: auth.user?.id ?? null,
      globalRole: auth.profile?.role ?? null,
      community,
      members,
    }),
    membersResolved: !enabled || !auth.user || resolved,
  };
}
```

- [ ] **Step 5: Run the spec and the typecheck**

```bash
cd /c/Volley-xs-w6-08 && npx vitest run src/hooks/useCommunityPermissions.spec.tsx && npm run typecheck
```

Expected: 4 tests pass; typecheck prints nothing and exits 0.

- [ ] **Step 6: Commit**

```bash
cd /c/Volley-xs-w6-08 && git add -- src/hooks/useCommunityMembers.ts src/hooks/useCommunityPermissions.ts src/hooks/useCommunityPermissions.spec.tsx && git commit -q -F - <<'EOF'
feat: permissoes da comunidade dizem quando os membros ja foram lidos

useCommunityMembers expoe resolved, e useCommunityPermissions devolve
membersResolved: verdadeiro sem busca (comunidade local ou sem conta) e depois
que a lista chega. A rota do wizard usa isso para nao bloquear o dono enquanto
os membros carregam.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 3: Block Community Session creation for members

**Files:**
- Create: `src/application/sessionCreationAccess.ts`
- Test: `src/application/sessionCreationAccess.test.ts` (create)
- Create: `src/components/session/SessionCreationBlocked.tsx`
- Test: `src/components/session/SessionCreationBlocked.spec.tsx` (create)
- Modify: `src/app/routes/sessionRoutes.tsx:1-16, 98-139`

**Interfaces:**
- Consumes: `useCommunityPermissions(community)` → `CommunityPermissions & { membersResolved: boolean }` (Task 2).
- Produces: `resolveSessionCreationAccess(input: { membersResolved: boolean; canCreateSession: boolean }): 'pending' | 'allowed' | 'blocked'`; `SessionCreationBlocked({ onBack }: { onBack: () => void })`.

- [ ] **Step 1: Write the failing unit test**

Create `src/application/sessionCreationAccess.test.ts`:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveSessionCreationAccess } from './sessionCreationAccess';

test('espera enquanto os membros nao foram lidos, mesmo sem permissao ainda', () => {
  assert.equal(
    resolveSessionCreationAccess({ membersResolved: false, canCreateSession: false }),
    'pending',
  );
  assert.equal(
    resolveSessionCreationAccess({ membersResolved: false, canCreateSession: true }),
    'pending',
  );
});

test('libera quem pode criar sessao depois de ler os membros', () => {
  assert.equal(
    resolveSessionCreationAccess({ membersResolved: true, canCreateSession: true }),
    'allowed',
  );
});

test('bloqueia quem nao pode criar sessao depois de ler os membros', () => {
  assert.equal(
    resolveSessionCreationAccess({ membersResolved: true, canCreateSession: false }),
    'blocked',
  );
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd /c/Volley-xs-w6-08 && node --import tsx --test src/application/sessionCreationAccess.test.ts
```

Expected: FAIL — `Cannot find module './sessionCreationAccess'`.

- [ ] **Step 3: Implement the decision**

Create `src/application/sessionCreationAccess.ts`:

```ts
export type SessionCreationAccess = 'pending' | 'allowed' | 'blocked';

export function resolveSessionCreationAccess(input: {
  membersResolved: boolean;
  canCreateSession: boolean;
}): SessionCreationAccess {
  if (!input.membersResolved) return 'pending';
  return input.canCreateSession ? 'allowed' : 'blocked';
}
```

- [ ] **Step 4: Run it and watch it pass**

```bash
cd /c/Volley-xs-w6-08 && node --import tsx --test src/application/sessionCreationAccess.test.ts
```

Expected: 3 tests pass.

- [ ] **Step 5: Write the failing component spec**

Create `src/components/session/SessionCreationBlocked.spec.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SessionCreationBlocked } from './SessionCreationBlocked';

describe('SessionCreationBlocked', () => {
  it('explains who can create sessions and returns to the Community', () => {
    const onBack = vi.fn();
    render(<SessionCreationBlocked onBack={onBack} />);

    expect(screen.getByRole('heading', { name: 'Nova sessão indisponível' })).toBeDefined();
    expect(screen.getByRole('alert').textContent).toBe(
      'Só dono, admin, moderador ou Organizador criam sessões nesta comunidade.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Voltar à comunidade' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 6: Run it and watch it fail**

```bash
cd /c/Volley-xs-w6-08 && npx vitest run src/components/session/SessionCreationBlocked.spec.tsx
```

Expected: FAIL — cannot resolve `./SessionCreationBlocked`.

- [ ] **Step 7: Implement the component**

Create `src/components/session/SessionCreationBlocked.tsx`:

```tsx
interface SessionCreationBlockedProps {
  onBack: () => void;
}

export function SessionCreationBlocked({ onBack }: SessionCreationBlockedProps) {
  return (
    <section className="mx-auto max-w-md space-y-4 rounded-xl border border-base-300 bg-base-200 p-6 text-center">
      <h2 className="text-lg font-semibold">Nova sessão indisponível</h2>
      <p role="alert" className="text-sm">
        Só dono, admin, moderador ou Organizador criam sessões nesta comunidade.
      </p>
      <button type="button" className="btn btn-primary btn-sm" onClick={onBack}>
        Voltar à comunidade
      </button>
    </section>
  );
}
```

- [ ] **Step 8: Run it and watch it pass**

```bash
cd /c/Volley-xs-w6-08 && npx vitest run src/components/session/SessionCreationBlocked.spec.tsx
```

Expected: 1 test passes.

- [ ] **Step 9: Gate `SessionWizardRoute`**

In `src/app/routes/sessionRoutes.tsx`, replace:

```ts
import { buildManualSessionStartResult, selectSessionTeams } from '@app/sessionLifecycleUseCases';
import { getCommunitySessions } from '@logic/community';
import { generateUUID } from '@logic/uuid';
import { useCommunityShell } from '../shellContext';
```

with:

```ts
import { resolveSessionCreationAccess } from '@app/sessionCreationAccess';
import { buildManualSessionStartResult, selectSessionTeams } from '@app/sessionLifecycleUseCases';
import { getCommunitySessions } from '@logic/community';
import { generateUUID } from '@logic/uuid';
import { SessionCreationBlocked } from '../../components/session/SessionCreationBlocked';
import { useCommunityPermissions } from '../../hooks/useCommunityPermissions';
import { useCommunityShell } from '../shellContext';
```

Replace:

```tsx
export function SessionWizardRoute() {
  const shell = useCommunityShell();
  const [searchParams] = useSearchParams();
  const { community, sess, play, comm, wizard } = shell;
```

with:

```tsx
export function SessionWizardRoute() {
  const shell = useCommunityShell();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { community, sess, play, comm, wizard } = shell;
  const permissions = useCommunityPermissions(community);
  const access = resolveSessionCreationAccess({
    membersResolved: permissions.membersResolved,
    canCreateSession: permissions.canCreateSession,
  });
```

Replace:

```tsx
  useEffect(() => {
    if (bootstrapped.current) return;
    if (resolution.kind === 'create') {
```

with:

```tsx
  useEffect(() => {
    if (bootstrapped.current) return;
    if (access !== 'allowed') return;
    if (resolution.kind === 'create') {
```

Replace:

```tsx
  }, [resolution.kind, community.id, type]);

  if (resolution.kind === 'redirect') return <Navigate to={resolution.to} replace />;
```

with:

```tsx
  }, [resolution.kind, community.id, type, access]);

  if (resolution.kind === 'redirect') return <Navigate to={resolution.to} replace />;
  if (access === 'blocked' && !bootstrapDone) {
    return <SessionCreationBlocked onBack={() => navigate(paths.comunidade(community.id))} />;
  }
```

- [ ] **Step 10: Run typecheck, the route's neighbors and ESLint on the touched files**

```bash
cd /c/Volley-xs-w6-08 && npm run typecheck && npx vitest run src/app && npx eslint --quiet src/app/routes/sessionRoutes.tsx src/application/sessionCreationAccess.ts src/components/session/SessionCreationBlocked.tsx
```

Expected: typecheck silent; every `src/app` spec passes; ESLint prints no errors.

- [ ] **Step 11: Commit**

```bash
cd /c/Volley-xs-w6-08 && git add -- src/application/sessionCreationAccess.ts src/application/sessionCreationAccess.test.ts src/components/session/SessionCreationBlocked.tsx src/components/session/SessionCreationBlocked.spec.tsx src/app/routes/sessionRoutes.tsx && git commit -q -F - <<'EOF'
feat: so dono, admin, moderador ou organizador comecam sessao de comunidade

Com o modelo obrigatorio, a sessao de um membro comum ficaria presa em 42501 a
cada sync. A rota do wizard espera os membros serem lidos e, para quem nao pode
criar sessao, nao cria o rascunho e mostra quem pode, com volta a comunidade.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 4: Remove the activation control from the evaluation editor

**Files:**
- Modify: `src/components/player/CommunityEvaluationEditor.tsx:3-9, 37, 55, 128, 140-201`
- Test: `src/components/player/CommunityEvaluationEditor.spec.tsx:4-17, 35, 102-136, 261-297`

**Interfaces:**
- Consumes: `setCommunityEvaluator(communityId, userId, enabled)` from `@app/communityEvaluationUseCases` (unchanged).
- Produces: no new export. `activateCommunityEvaluation` stays in `communityEvaluationUseCases.ts`, now unused by screens.

- [ ] **Step 1: Rewrite the specs that exercised activation**

In `src/components/player/CommunityEvaluationEditor.spec.tsx`, replace:

```tsx
import {
  loadCommunityEvaluationEditor,
  submitCommunityEvaluation,
  activateCommunityEvaluation,
  setCommunityEvaluator,
} from '@app/communityEvaluationUseCases';

vi.mock('@app/communityEvaluationUseCases', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@app/communityEvaluationUseCases')>()),
  loadCommunityEvaluationEditor: vi.fn(),
  submitCommunityEvaluation: vi.fn(),
  activateCommunityEvaluation: vi.fn(),
  setCommunityEvaluator: vi.fn(),
}));
```

with:

```tsx
import {
  loadCommunityEvaluationEditor,
  submitCommunityEvaluation,
  setCommunityEvaluator,
} from '@app/communityEvaluationUseCases';

vi.mock('@app/communityEvaluationUseCases', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@app/communityEvaluationUseCases')>()),
  loadCommunityEvaluationEditor: vi.fn(),
  submitCommunityEvaluation: vi.fn(),
  setCommunityEvaluator: vi.fn(),
}));
```

Delete the line:

```tsx
    vi.mocked(activateCommunityEvaluation).mockResolvedValue({ ok: true, value: undefined });
```

Replace the whole test `it('requires separate acknowledgement and evaluator assignment for managers', ...)` with:

```tsx
  it('offers managers no activation and assigns evaluators in the target model', async () => {
    vi.mocked(loadCommunityEvaluationEditor).mockResolvedValue({
      ok: true,
      value: {
        ...context,
        authority_model: 'legacy',
        can_evaluate: false,
        can_manage_evaluators: true,
        members: [{ user_id: 'member', label: 'Bia', is_evaluator: false }],
      },
    });
    const legacy = render(<CommunityEvaluationEditor {...props} />);
    expect(
      await screen.findByText('Este modelo ainda não foi ativado nesta comunidade.'),
    ).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Ativar novo modelo' })).toBeNull();
    expect(screen.queryByRole('checkbox')).toBeNull();
    legacy.unmount();

    vi.mocked(loadCommunityEvaluationEditor).mockResolvedValue({
      ok: true,
      value: {
        ...context,
        can_evaluate: false,
        can_manage_evaluators: true,
        members: [{ user_id: 'member', label: 'Bia', is_evaluator: false }],
      },
    });
    render(<CommunityEvaluationEditor {...props} />);
    fireEvent.change(await screen.findByLabelText('Avaliador'), { target: { value: 'member' } });
    fireEvent.click(screen.getByRole('button', { name: 'Autorizar avaliador' }));
    await waitFor(() =>
      expect(setCommunityEvaluator).toHaveBeenCalledWith('community', 'member', true),
    );
  });
```

Replace the whole `it.each(['community', 'account', 'unmount'])('ignores late management success after %s change', ...)` block with:

```tsx
  it.each(['community', 'account', 'unmount'])(
    'ignores late management success after %s change',
    async (change) => {
      let finish!: (value: Awaited<ReturnType<typeof setCommunityEvaluator>>) => void;
      vi.mocked(setCommunityEvaluator).mockReturnValueOnce(
        new Promise((resolve) => {
          finish = resolve;
        }),
      );
      vi.mocked(loadCommunityEvaluationEditor).mockResolvedValue({
        ok: true,
        value: {
          ...context,
          can_evaluate: false,
          can_manage_evaluators: true,
          members: [{ user_id: 'member', label: 'Bia', is_evaluator: false }],
        },
      });
      const view = render(<CommunityEvaluationEditor {...props} currentUserId="a" />);
      fireEvent.change(await screen.findByLabelText('Avaliador'), {
        target: { value: 'member' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Autorizar avaliador' }));
      if (change === 'unmount') view.unmount();
      else {
        view.rerender(
          <CommunityEvaluationEditor
            {...props}
            communityId={change === 'community' ? 'other' : props.communityId}
            currentUserId={change === 'account' ? 'b' : 'a'}
          />,
        );
        await screen.findByLabelText('Avaliador');
      }
      const loads = vi.mocked(loadCommunityEvaluationEditor).mock.calls.length;
      await act(async () => finish({ ok: true, value: undefined }));
      expect(loadCommunityEvaluationEditor).toHaveBeenCalledTimes(loads);
    },
  );
```

- [ ] **Step 2: Run the spec and watch the legacy test fail**

```bash
cd /c/Volley-xs-w6-08 && npx vitest run src/components/player/CommunityEvaluationEditor.spec.tsx
```

Expected: FAIL in "offers managers no activation…" — the "Ativar novo modelo" button is still rendered (`expected <button> to be null`). The late-success cases pass.

- [ ] **Step 3: Remove the activation block from the editor**

In `src/components/player/CommunityEvaluationEditor.tsx`, replace:

```tsx
import {
  activateCommunityEvaluation,
  loadCommunityEvaluationEditor,
```

with:

```tsx
import {
  loadCommunityEvaluationEditor,
```

Delete the line:

```tsx
  const [managerAcknowledged, setManagerAcknowledged] = useState(false);
```

Delete the line:

```tsx
      setManagerAcknowledged(false);
```

Replace:

```tsx
  async function manage(action: () => ReturnType<typeof activateCommunityEvaluation>) {
```

with:

```tsx
  async function manage(action: () => ReturnType<typeof setCommunityEvaluator>) {
```

Replace the whole `management` constant (from `const management = context.can_manage_evaluators && (` through its closing `);` before `const mismatch =`) with:

```tsx
  const management = context.can_manage_evaluators && context.authority_model === 'target' && (
    <fieldset disabled={managing || !!pending} className="space-y-3">
      <label className="text-sm">
        Avaliador
        <select
          aria-label="Avaliador"
          className="select select-bordered select-sm w-full"
          value={selectedEvaluator}
          onChange={(event) => setSelectedEvaluator(event.target.value)}
        >
          <option value="">Selecione</option>
          {context.members.map((member) => (
            <option key={member.user_id} value={member.user_id}>
              {member.label}
            </option>
          ))}
        </select>
      </label>
      <button
        className="btn btn-outline btn-sm"
        disabled={!selectedEvaluator || managing}
        onClick={() =>
          void manage(() =>
            setCommunityEvaluator(
              communityId,
              selectedEvaluator,
              !context.members.find((member) => member.user_id === selectedEvaluator)
                ?.is_evaluator,
            ),
          )
        }
      >
        {context.members.find((member) => member.user_id === selectedEvaluator)?.is_evaluator
          ? 'Revogar avaliador'
          : 'Autorizar avaliador'}
      </button>
    </fieldset>
  );
```

- [ ] **Step 4: Run the spec, typecheck and ESLint**

```bash
cd /c/Volley-xs-w6-08 && npx vitest run src/components/player/CommunityEvaluationEditor.spec.tsx && npm run typecheck && npx eslint --quiet src/components/player/CommunityEvaluationEditor.tsx src/components/player/CommunityEvaluationEditor.spec.tsx
```

Expected: all editor tests pass; typecheck silent; no ESLint errors.

- [ ] **Step 5: Commit**

```bash
cd /c/Volley-xs-w6-08 && git add -- src/components/player/CommunityEvaluationEditor.tsx src/components/player/CommunityEvaluationEditor.spec.tsx && git commit -q -F - <<'EOF'
feat: editor de avaliacao sem o botao de ativar o modelo novo

Toda comunidade ja nasce ativada, entao a confirmacao do "modelo experimental"
e o botao "Ativar novo modelo" nao tem mais uso. A gestao de avaliadores so
aparece no modelo novo. Os testes que simulavam a ativacao passam a usar a
autorizacao de avaliador.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 5: Documentation and full gates

**Files:**
- Modify: `docs/architecture/execution/C6.02-W3-W6-SESSION-REGISTRATION-RATING-TEAM.md` (before `## XS-W6-03 — CandidateSet publication`)
- Modify: `docs/architecture/execution/C6-REACHABILITY-MAP.md` (wall 3 paragraph)
- Modify: `HANDOFF.md` (header note, slice table, new section before `### O que a XS-W3-08 entregou — Session target alcançável por sync`)

**Interfaces:**
- Consumes: commits from Tasks 1–4.
- Produces: documentation only.

- [ ] **Step 1: C6.02 note**

In `docs/architecture/execution/C6.02-W3-W6-SESSION-REGISTRATION-RATING-TEAM.md`, replace:

```markdown
## XS-W6-03 — CandidateSet publication
```

with:

```markdown
## XS-W6-08a — Mandatory evaluation model (inserted)

Implemented per the
[XS-W6-08a spec](../../superpowers/specs/2026-09-15-xs-w6-08a-mandatory-evaluation-model-design.md).
By user direction on 2026-09-15 the versioned evaluation model is mandatory: migration
`20260915180000_mandatory_evaluation_model.sql` activates every Community and every new one, and
the XS-W3-09 mirror grants `ORGANIZER` to the legacy roles that carry `manage_sessions` (owner,
admin, moderator, organizador). Target-model Communities keep `GINV-CAP-002`. First of XS-W6-08a
(mandatory model), XS-W6-08b (attribute import) and XS-W6-08c (wizard draws from the authorized
snapshot).

## XS-W6-03 — CandidateSet publication
```

- [ ] **Step 2: Reachability map, wall 3**

In `docs/architecture/execution/C6-REACHABILITY-MAP.md`, replace:

```markdown
   Organizador** pela XS-W3-09 (integrada em 2026-09-14): o trigger que espelha `community_members`
   concede `ORGANIZER` a quem recebe o cargo pelo painel. Continua de pé para dono e admin, que o N2.03
   não trata como organizadores; `set_community_organizer` segue sem chamador.
```

with:

```markdown
   Organizador** pela XS-W3-09 (integrada em 2026-09-14): o trigger que espelha `community_members`
   concede `ORGANIZER` a quem recebe o cargo pelo painel. **Derrubada também para dono, admin e
   moderador** pela XS-W6-08a, em comunidades legadas: o espelho traduz o `manage_sessions` que esses
   cargos já têm. Continua de pé em comunidades target (`GINV-CAP-002`), que o app não cria;
   `set_community_organizer` segue sem chamador. A mesma fatia ativa o modelo de avaliação em toda
   comunidade, então a ativação deixa de ser parede para captura e editor.
```

- [ ] **Step 3: HANDOFF**

In `HANDOFF.md`, replace:

```markdown
| XS-W3-09 | `ORGANIZER` pelo cargo Organizador (espelho de membros) | concluída |
```

with:

```markdown
| XS-W3-09 | `ORGANIZER` pelo cargo Organizador (espelho de membros) | concluída |
| XS-W6-08a | Modelo de avaliação obrigatório; `ORGANIZER` por cargo legado | concluída |
```

Replace:

```markdown
### O que a XS-W3-08 entregou — Session target alcançável por sync
```

with:

```markdown
### O que a XS-W6-08a entregou — modelo de avaliação obrigatório

Branch `exec/c6-authorized-team-formation`, worktree `C:\Volley-xs-w6-08`. Primeira de três fatias
(08a obrigatoriedade, 08b importação de atributos, 08c sorteio pelo snapshot autorizado). Ver a
[spec](docs/superpowers/specs/2026-09-15-xs-w6-08a-mandatory-evaluation-model-design.md) e o
[plano](docs/superpowers/plans/2026-09-16-xs-w6-08a-mandatory-evaluation-model.md).

- `20260915180000_mandatory_evaluation_model.sql`: ativa todas as comunidades e um gatilho ativa as
  novas; o espelho concede `ORGANIZER` a dono, admin, moderador e organizador (os cargos legados com
  `manage_sessions`) e revoga quando saem desse conjunto; o drift cobre os quatro; backfill.
  Comunidades target seguem o `GINV-CAP-002`.
- A rota do wizard espera os membros serem lidos e, para membro comum, mostra "Só dono, admin,
  moderador ou Organizador criam sessões nesta comunidade." sem criar rascunho.
- O editor de avaliação perdeu a confirmação do modelo experimental e o botão de ativar.

**Não aplicado em produção.** A ativação é irreversível e recusa escrita legada de avaliação; aplicar
no Panelinha espera o ok do usuário. Overrides de capacidade por comunidade não são respeitados pelo
espelho (produção tem 0).

### O que a XS-W3-08 entregou — Session target alcançável por sync
```

- [ ] **Step 4: Run every gate**

```bash
cd /c/Volley-xs-w6-08 && npm run typecheck \
&& git ls-files -z -- '*.ts' '*.tsx' | xargs -0 -n 100 npx eslint --quiet --no-warn-ignored \
&& git ls-files -z | xargs -0 -n 150 npx prettier --check --ignore-unknown 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E '^\[warn\]' | grep -v 'Code style issues' ; \
npm test > /tmp/xs-w6-08a-test.log 2>&1; grep -E "^ℹ (pass|fail)|Tests +[0-9]" /tmp/xs-w6-08a-test.log; \
npm run check:architecture && npm run build > /tmp/xs-w6-08a-build.log 2>&1 && echo BUILD ok
```

Expected: typecheck silent; ESLint no errors; no Prettier `[warn]` lines; unit `ℹ fail 0` and Vitest all passed; `check:architecture` passes; `BUILD ok`. If Prettier warns on a file this plan touched, run `npx prettier --write` on that file and rerun the check. The full `npm run test:db` already ran in Task 1 Step 9; rerun it only if Tasks 2–4 changed SQL (they do not).

- [ ] **Step 5: Commit**

```bash
cd /c/Volley-xs-w6-08 && git add -- docs/architecture/execution/C6.02-W3-W6-SESSION-REGISTRATION-RATING-TEAM.md docs/architecture/execution/C6-REACHABILITY-MAP.md HANDOFF.md && git commit -q -F - <<'EOF'
docs: registra a XS-W6-08a no C6.02, no mapa de alcancabilidade e no HANDOFF

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
git log --oneline -6
```

Expected: five XS-W6-08a commits on top of `4671c3b`, and `git status --short` still shows only the uncommitted XS-W6-08c spec edit.
