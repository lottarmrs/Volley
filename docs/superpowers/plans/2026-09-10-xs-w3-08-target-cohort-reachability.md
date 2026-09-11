# XS-W3-08 Target Cohort Reachability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a transitioned Session usable in the client, so the target cohort stops being unreachable infrastructure and the W6-01 capture becomes callable.

**Architecture:** One `create or replace` on an existing read function; a local cohort marker on the Session model; sync learns to skip the root of converted Sessions on upload and fetch them by id on download; a conversion action on the Session screen using the command layer that already exists.

**Tech Stack:** PostgreSQL, TypeScript, Node test runner (`*.test.ts`), Vitest (`*.spec.tsx`) for the UI, `.dbtest.ts` against a real PostgreSQL.

**Spec:** `docs/superpowers/specs/2026-09-10-xs-w3-08-target-cohort-reachability-design.md`

## Global Constraints

- Node >= 20. Prettier: single quotes, 100 char width. Run `npx prettier --write` on every file you touch.
- No comments in source unless the plan's code shows one. No `@license` headers.
- UI language is pt-BR: labels, toasts, errors.
- Imports use aliases (`@app`, `@domain`, `@infra`, `@shared/types`); `src/logic/` uses relative imports — follow the file you are editing.
- All types flow through `src/types.ts`.
- **A non-converted Session must behave byte-for-byte as it does today.** That is the regression that matters most.
- `npm run test:db` needs a real PostgreSQL. Set `VOLLEY_TEST_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:55500/postgres'` and use the preserved `volley_test_pg2` container. Never mock it.
- Create branch `exec/c6-w3-08-target-cohort-reachability` before Task 1. Never commit to `main`.

---

### Task 1: `read_target_session` returns the current roster revision

**Files:**

- Create: `supabase/migrations/<new timestamp>_target_session_current_roster_revision.sql`
- Create: `src/test/db/targetSessionCurrentRosterRevision.dbtest.ts`
- Modify: `README.md` (add the migration to the ordered list and describe it)

**Interfaces:**

- Produces: `read_target_session(p_session_id uuid)` with one additional returned column, `current_roster_revision_id uuid`.

- [ ] **Step 1: Write the failing test**

Create `src/test/db/targetSessionCurrentRosterRevision.dbtest.ts`. Model its fixture setup on `src/test/db/balanceInputSnapshots.dbtest.ts`, which already builds a target COMMUNITY Session with an organizer and roster revisions — read that file first and reuse its helper shapes rather than inventing new ones.

The suite must assert:

```ts
// 1. no revision yet -> null
assert.equal(row.current_roster_revision_id, null);

// 2. one revision -> that revision
assert.equal(row.current_roster_revision_id, firstRevisionId);

// 3. a second revision supersedes the first
assert.equal(row.current_roster_revision_id, secondRevisionId);

// 4. it agrees with what capture accepts, asserted directly rather than assumed:
//    capture with the id the read returned succeeds; capture with the older id is 40001.
```

Assertion 4 is the point of the task — write it, do not skip it because assertion 3 looks equivalent.

- [ ] **Step 2: Run the test to verify it fails**

Run: `VOLLEY_TEST_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:55500/postgres' node scripts/db-harness.mjs targetSessionCurrentRosterRevision.dbtest.ts`
Expected: FAIL — the column does not exist.

- [ ] **Step 3: Create the migration**

Create the migration with a timestamp AFTER `20260908170000`. Copy the current definition from `supabase/migrations/20260828135831_target_session_rules_snapshot.sql:132-190` verbatim, then make exactly two changes: add `current_roster_revision_id uuid` as the last entry in the `returns table (...)` list, and add this as the last expression of the final `select`:

```sql
      (
        select r.id
          from public.roster_revisions r
         where r.session_id = v_session.id
         order by r.revision_number desc
         limit 1
      );
```

Keep `security definer`, `set search_path = ''`, the `authority_model = 'target'` filter, the `P0002` not-found, the `current_user_can_read_target_session` check and the existing revoke/grant lines exactly as they are. Re-issue the revoke and grant after the `create or replace`.

Do not touch `capture_balance_input_snapshot`. Its definition of "current" is `max(revision_number)`; yours must match it, which is why the subquery orders by `revision_number` and not by `created_at`.

- [ ] **Step 4: Run the test to verify it passes**

Run the same command as Step 2. Expected: PASS.

- [ ] **Step 5: Run the full DB suite**

Run: `VOLLEY_TEST_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:55500/postgres' node scripts/db-harness.mjs`
Expected: the previous total plus your new cases, zero failures. Pre-existing tests calling `read_target_session` must pass unchanged — if one fails, you changed behavior beyond adding a column.

- [ ] **Step 6: Commit**

```bash
npx prettier --write src/test/db/targetSessionCurrentRosterRevision.dbtest.ts README.md
git add -A
git commit -m "feat: read_target_session devolve a revisao corrente de elenco"
```

---

### Task 2: The local cohort marker

**Files:**

- Modify: `src/shared/types/session.ts` (add the field to the `Session` interface)
- Test: `src/logic/migrations.test.ts` if one exists for Session shape; otherwise `src/application/sessionCohortCutover.test.ts` (create)

**Interfaces:**

- Produces: `Session.authorityModel?: 'legacy' | 'target'`.

- [ ] **Step 1: Write the failing test**

The behavior to pin is that an absent marker means legacy, so that every Session stored before this slice keeps working. Write a test asserting a helper:

```ts
import { isTargetCohortSession } from './sessionCohortCutover';

test('uma Session sem marcador continua sendo legada', () => {
  assert.equal(isTargetCohortSession({ authorityModel: undefined } as never), false);
  assert.equal(isTargetCohortSession({} as never), false);
});

test('so o marcador target muda a coorte', () => {
  assert.equal(isTargetCohortSession({ authorityModel: 'target' } as never), true);
  assert.equal(isTargetCohortSession({ authorityModel: 'legacy' } as never), false);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `node --import tsx --test src/application/sessionCohortCutover.test.ts`
Expected: FAIL — `isTargetCohortSession` is not exported.

- [ ] **Step 3: Add the field and the helper**

In `src/shared/types/session.ts`, add to the `Session` interface:

```ts
  authorityModel?: 'legacy' | 'target';
```

It is optional deliberately: every Session already in `localStorage` predates this field, and `src/logic/migrations.ts` must not need a new migration step for an absent optional field. Do not add a default anywhere — absence means legacy, and the helper is the single place that decides.

In `src/application/sessionCohortCutover.ts`, add:

```ts
export function isTargetCohortSession(session: { authorityModel?: string }): boolean {
  return session.authorityModel === 'target';
}
```

- [ ] **Step 4: Run the test and the unit suite**

Run: `node --import tsx --test src/application/sessionCohortCutover.test.ts` then `npm run test:unit`
Expected: both pass; the suite total grows by your new tests only.

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/shared/types/session.ts src/application/sessionCohortCutover.ts src/application/sessionCohortCutover.test.ts
git add -A
git commit -m "feat: marcador local de coorte na Session"
```

---

### Task 3: Sync stops uploading a converted root

**Files:**

- Modify: `src/infra/supabase/syncService.ts`
- Test: `src/infra/supabase/syncService.test.ts`

**Interfaces:**

- Consumes: `isTargetCohortSession` from Task 2.

- [ ] **Step 1: Find the upload site**

Run: `grep -n "local.sessions" src/infra/supabase/syncService.ts`
The upload loop over `local.sessions` is the one that maps them for `bulkUpsert`. Read it and the surrounding function before editing.

- [ ] **Step 2: Write the failing test**

In `src/infra/supabase/syncService.test.ts`, follow the shape of the existing test named `uploadLocalDataToCloud only forwards players with a known evaluationCommunityId to bulkUpsertForPlayers` — it stubs a cloud service, captures what it received, and asserts on the ids. Write the equivalent for Sessions:

```ts
test('uploadLocalDataToCloud nao sobe a raiz de uma Session convertida', async () => {
  // one legacy Session and one with authorityModel: 'target'
  // assert the captured upload payload contains only the legacy Session's id
});
```

Fill it in following the neighbouring test's exact stubbing pattern; do not invent a new harness.

- [ ] **Step 3: Run it and watch it fail**

Run: `node --import tsx --test src/infra/supabase/syncService.test.ts`
Expected: FAIL — both Sessions are uploaded today.

- [ ] **Step 4: Skip converted roots**

Filter the Session upload by `!isTargetCohortSession(session)`. A converted Session must still keep its local row, its `cloudId` and its `syncStatus` untouched — you are skipping the upload, not marking it synced and not dropping it. Its teams, games, point events and reports keep uploading exactly as before: `scopeOperationalFetch` special-cases only `sessions`, and this slice does not change that.

- [ ] **Step 5: Run the tests**

Run: `node --import tsx --test src/infra/supabase/syncService.test.ts` then `npm run test:unit`
Expected: pass, with every pre-existing sync test green and unedited.

- [ ] **Step 6: Commit**

```bash
npx prettier --write src/infra/supabase/syncService.ts src/infra/supabase/syncService.test.ts
git add -A
git commit -m "fix: sync para de tentar subir a raiz de Session convertida"
```

---

### Task 4: Sync reads converted Sessions by id

**Files:**

- Modify: `src/infra/supabase/sessionCohortCloudService.ts` (add a read)
- Modify: `src/infra/supabase/syncService.ts` (merge on download)
- Test: `src/infra/supabase/syncService.test.ts`

**Interfaces:**

- Produces: `readTargetSession(sessionCloudId: string): Promise<TargetSessionRead>` on the cohort
  gateway, with this exact type exported from `src/application/sessionCohortCutover.ts` so the
  gateway interface and the sync agree on one definition:

```ts
export interface TargetSessionRead {
  readonly id: string;
  readonly communityId: string | null;
  readonly name: string;
  readonly sessionContext: string;
  readonly playMode: string;
  readonly lifecycleStatus: string;
  readonly publicationState: string;
  readonly revision: number;
  readonly currentRosterRevisionId: string | null;
}
```

Those are the columns `read_target_session` returns after Task 1, minus the four timestamp columns
and `compatibility_type`, which the local Session model already carries from its own fields and
which the sync must not overwrite.

- [ ] **Step 1: Write the failing test**

```ts
test('o download mescla a Session convertida lida por id', async () => {
  // local: one Session with authorityModel 'target' and a cloudId
  // stub the cohort gateway's readTargetSession to return a different name
  // assert the merged local Session carries the server's name
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `node --import tsx --test src/infra/supabase/syncService.test.ts`

- [ ] **Step 3: Add the gateway read**

In `src/infra/supabase/sessionCohortCloudService.ts`, add a `readTargetSession` that calls `read_target_session` with `{ p_session_id: sessionCloudId }` and validates the response the same way `inspectionFromResponse` validates its own — that file already rejects a malformed shape loudly rather than coercing, and yours must match. The RPC returns a one-row table, so the response is an array of one.

- [ ] **Step 4: Merge on download**

After the legacy bulk download completes, for each local Session where `isTargetCohortSession(session)` and a `cloudId` exists, read it by id and merge the server's fields into the local row. Merge only the fields the read returns; never overwrite local fields the server does not own.

A failed read must not lose the local Session: report it through `onIssue` with a pt-BR context and keep the local row as-is. A converted Session is only recoverable from the local marker, so dropping it on a transient error would lose it for good.

- [ ] **Step 5: Run the tests**

Run: `node --import tsx --test src/infra/supabase/syncService.test.ts` then `npm run test:unit`

- [ ] **Step 6: Commit**

```bash
npx prettier --write src/infra/supabase/sessionCohortCloudService.ts src/infra/supabase/syncService.ts src/infra/supabase/syncService.test.ts
git add -A
git commit -m "feat: sync le a Session convertida por id e mescla"
```

---

### Task 5: Grant and revoke the ORGANIZER responsibility

**Files:**

- Create: `supabase/migrations/<timestamp after 20260909090000>_set_community_organizer.sql`
- Create: `src/test/db/setCommunityOrganizer.dbtest.ts`
- Modify: `README.md` (describe the new migration in the explanation list)

**Interfaces:**

- Produces: `public.set_community_organizer(p_community_id uuid, p_user_id uuid, p_enabled boolean) returns void`.

**Why this exists:** `create_target_session` requires an `ORGANIZER` row in
`community_responsibilities`. Those rows come only from a one-time backfill in `20260827150000`,
seeded from legacy `community_members.role = 'organizador'`. `set_community_member_role` never
writes that table. So target Sessions are creatable by grandfathered organizers and by nobody
promoted since -- a capability that decays silently.

- [ ] **Step 1: Write the failing test**

Create `src/test/db/setCommunityOrganizer.dbtest.ts`. Read
`src/test/db/communityEvaluationEditor.dbtest.ts` first and reuse its fixture shapes -- it already
builds a Community with an owner and members and exercises `set_community_evaluator`, the function
this one mirrors.

Cases, each its own test:

```text
1. before any grant, create_target_session by that member raises 42501
2. the owner grants it, and the same create_target_session call now succeeds
3. revoking it (p_enabled false) makes create_target_session raise 42501 again
4. a plain member cannot grant it: 42501
5. granting to a non-member raises 23514
6. a null p_enabled raises 23514
7. anonymous raises 42501
```

Case 1 must run before case 2's grant -- it is what proves the function is load-bearing rather than
decorative. Exercise `create_target_session` through the authenticated RPC, not as owner.

- [ ] **Step 2: Run it and watch it fail**

Run: `VOLLEY_TEST_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:55500/postgres' node scripts/db-harness.mjs setCommunityOrganizer.dbtest.ts`
Expected: FAIL with 42883 -- the function does not exist.

- [ ] **Step 3: Write the migration**

```sql
create function public.set_community_organizer(
  p_community_id uuid,
  p_user_id uuid,
  p_enabled boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_enabled is null then
    raise exception 'enabled is required' using errcode = '23514';
  end if;
  if p_community_id is null or p_user_id is null
     or not public.current_user_has_community_capability(p_community_id, 'community.members.manage')
  then
    raise exception 'Not authorized to manage organizers in this Community' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.community_memberships
     where community_id = p_community_id and user_id = p_user_id and status = 'active'
  ) then
    raise exception 'Organizer must be an active Community member' using errcode = '23514';
  end if;

  if not p_enabled then
    update public.community_responsibilities
       set revoked_at = pg_catalog.now()
     where community_id = p_community_id
       and user_id = p_user_id
       and responsibility = 'ORGANIZER'
       and revoked_at is null;
    return;
  end if;

  insert into public.community_responsibilities (
    community_id, user_id, responsibility, assigned_by
  )
  values (p_community_id, p_user_id, 'ORGANIZER', (select auth.uid()))
  on conflict (community_id, user_id, responsibility) do update
    set revoked_at = null,
        assigned_at = pg_catalog.now(),
        assigned_by = (select auth.uid());
end;
$$;

revoke all on function public.set_community_organizer(uuid, uuid, boolean) from public, anon;
grant execute on function public.set_community_organizer(uuid, uuid, boolean) to authenticated;
```

Confirm the conflict target and the column names against the real table before running -- read the
`community_responsibilities` definition in `20260827150000_normalize_governance_and_organizer.sql`
and adjust if `assigned_by` or the unique constraint differ.

Note what this deliberately does NOT check, unlike `set_community_evaluator`: it does not require
the Community to have activated the evaluation model. Organizing a Session and evaluating players
are independent responsibilities, and coupling them would make the evaluation cutover a
precondition for running a match.

- [ ] **Step 4: Run the test, then the full DB suite**

Focused file first, then the whole suite. Expected: previous total plus your cases, zero failures.

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/test/db/setCommunityOrganizer.dbtest.ts README.md
git add -A
git commit -m "feat: conceder e revogar a responsabilidade ORGANIZER"
```

---

### Task 6: The sync creates eligible Sessions in the target model

**Files:**

- Modify: `src/infra/supabase/syncService.ts`
- Modify: `src/infra/supabase/sessionCohortCloudService.ts`
- Modify: `src/application/sessionCohortCutover.ts`
- Test: `src/infra/supabase/syncService.test.ts`

**Interfaces:**

- Consumes: `isTargetCohortSession` (Task 2), the cohort gateway (Task 4).
- Produces: `createTargetSession(input)` on the cohort gateway.

**The defect that killed the previous attempt, so you do not repeat it:** the local marker must ride
back on the payload the sync already returns and persists -- never by writing `localStorage`
directly. `useSessions` rewrites both storage keys wholesale from React state on the next
interaction, so a raw write is erased by the next click. Because the bulk download is filtered to
`legacy`, an erased marker means the Session is gone from the app for good.

- [ ] **Step 1: Write the failing tests**

In `syncService.test.ts`, following the stubbing pattern of the neighbouring upload tests:

```ts
test('uma Session de comunidade ativada nasce no modelo target', async () => {
  // stub the cohort gateway's createTargetSession to record what it received
  // stub the activated-community resolver so the community counts as activated
  // assert createTargetSession was called, the legacy upsert was NOT,
  // and the returned Session carries authorityModel: 'target'
});

test('uma Session de comunidade nao ativada continua no caminho legado', async () => {
  // assert the legacy upsert received it, createTargetSession did not,
  // and the returned Session has no authorityModel
});

test('falha ao criar no modelo target nao cai para o legado em silencio', async () => {
  // make createTargetSession reject; assert the legacy upsert was NOT called,
  // one issue was reported, and the Session stays pending for the next sync
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `node --import tsx --test src/infra/supabase/syncService.test.ts`

- [ ] **Step 3: Add the gateway call**

In `sessionCohortCloudService.ts`, add `createTargetSession` calling `create_target_session` with
`p_session_id`, `p_community_id`, `p_session_context: 'COMMUNITY'`, `p_play_mode`, `p_name`.
Validate the response the way that file's existing readers do -- throw loudly on a malformed shape
rather than coercing.

- [ ] **Step 4: Decide the cohort at upload**

In the Session upload loop, before the legacy upsert: if the Session belongs to a Community whose
cloud id is in the activated set, call `createTargetSession` and push the Session with
`authorityModel: 'target'` instead of the legacy result.

The sync already resolves the activated set for evaluations, through
`community_evaluation_target_ids`. Reuse that resolution -- do not add a second round trip for the
same question.

A failure of `create_target_session` must NOT fall back to the legacy upsert. Report it through
`onIssue` with a pt-BR context and leave the Session pending so the next sync retries. A silent
fallback would put the Session in the wrong cohort permanently, and nothing later would notice.

- [ ] **Step 5: Prove the marker survives a state-driven persist**

Add a test that the marker is still present after the sync's returned payload goes through the
normal persistence route. The previous attempt's test proved only that a write happened, and that is
exactly why the defect shipped.

- [ ] **Step 6: Run everything**

`node --import tsx --test src/infra/supabase/syncService.test.ts`, then `npm run test:unit`,
`npm run typecheck`, `npm run test:ui`.

- [ ] **Step 7: Commit**

```bash
npx prettier --write src/infra/supabase/sessionCohortCloudService.ts src/application/sessionCohortCutover.ts
git add -A
git commit -m "feat: sync cria Session de comunidade ativada no modelo target"
```

---

### Task 7: Verification and handoff

- [ ] **Step 1: Run every gate**

```bash
npm run typecheck
npm test
VOLLEY_TEST_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:55500/postgres' node scripts/db-harness.mjs
npm run build
npx playwright test
git diff --check
```

- [ ] **Step 2: Prove the new guards are load-bearing**

Break each line, run the named test, confirm the expected failures, restore, confirm green. Report
the actual failing test names.

- remove the `revision_number desc` ordering from Task 1's subquery -> the DB agreement assertion
- remove the converted-root filter from the upload (Task 3) -> its sync test
- make `isTargetCohortSession` return true for an absent marker (Task 2) -> its two tests
- make `set_community_organizer` a no-op when enabling -> case 2 of its DB suite
- make the sync fall back to the legacy upsert when the create fails -> the Task 6 failure test

- [ ] **Step 3: Re-derive the reachability map**

`docs/architecture/execution/C6-REACHABILITY-MAP.md` must be re-derived, not edited by hand. Re-run
the command it documents, redo the three-level check for the commands this slice touches, and move
whatever actually became reachable. If `capture_balance_input_snapshot` is still unreachable, say so
plainly -- this slice opens the road, it does not walk it.

- [ ] **Step 4: Update HANDOFF and the execution doc**

Record the slice, its evidence with real numbers, that the cutover path is dead and why, and that
this slice does NOT wire capture or publication.

- [ ] **Step 5: Commit**

```bash
npx prettier --write HANDOFF.md docs/architecture/execution/C6-REACHABILITY-MAP.md docs/architecture/execution/C6.02-W3-W6-SESSION-REGISTRATION-RATING-TEAM.md
git add -A
git commit -m "docs: registrar a XS-W3-08 e sua evidencia de verificacao"
```
