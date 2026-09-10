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

### Task 5: The conversion action

**Files:**

- Modify: `src/components/session/SessionSetupSummary.tsx`
- Create: `src/components/session/SessionSetupSummary.spec.tsx`

The host is decided: `SessionSetupSummary` already receives the `Session` and is rendered by
`SessionWizard.tsx:2594` in the setup step — which is exactly when conversion is legal, since
`NOT_DRAFT` blocks it later. Do NOT add this to `SessionWizard.tsx`: `AGENTS.md` lists that file as
an oversized split candidate, and it is 2600+ lines already.

**Interfaces:**

- Consumes: `inspectLegacySessionCutover`, `transitionLegacySessionCommand`, `executeSessionCohortTransition` from `src/application/sessionCohortCutover.ts`, and `isTargetCohortSession` from Task 2.

- [ ] **Step 1: Write the failing spec**

Three behaviors, each its own test:

```tsx
it('mostra os bloqueios traduzidos quando a Session nao e elegivel', async () => {
  // inspection returns eligible: false, blockers: ['NOT_DRAFT', 'HAS_TEAM_EVIDENCE']
  // assert both appear as pt-BR sentences, not as raw codes
});

it('avisa que a conversao nao tem volta antes de executar', async () => {
  // assert the irreversibility copy is on screen before any command runs
});

it('marca a Session como target quando a transicao conclui', async () => {
  // assert the persisted Session carries authorityModel 'target'
});
```

- [ ] **Step 2: Run and watch them fail**

Run: `npx vitest run <your spec path>`

- [ ] **Step 3: Implement**

Translate every blocker code the database can return. Get the list with:

`grep -oE "'[A-Z_]+'" supabase/migrations/20260829120000_target_session_cohort_cutover.sql | sort -u`

An untranslated code must still render something honest rather than vanishing — fall back to the raw code with a generic sentence, never to an empty list, or an ineligible Session will look eligible.

Offer conversion only when the Session's community context is COMMUNITY. Pass `'COMMUNITY'` as `p_session_context`; do not expose a `QUICK` option.

On success, persist `authorityModel: 'target'` on the local Session before anything else. That marker is the only client-side record that the Session exists in the target cohort — if it is lost, the Session disappears from the app on the next device.

- [ ] **Step 4: Run the specs and the UI suite**

Run: `npx vitest run <your spec path>` then `npm run test:ui`

- [ ] **Step 5: Commit**

```bash
npx prettier --write <files you touched>
git add -A
git commit -m "feat: acao de converter a Session para a coorte target"
```

---

### Task 6: Verification and handoff

**Files:**

- Modify: `HANDOFF.md`, `docs/architecture/execution/C6.02-W3-W6-SESSION-REGISTRATION-RATING-TEAM.md`

- [ ] **Step 1: Run every gate**

```bash
npm run typecheck
npm test
VOLLEY_TEST_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:55500/postgres' node scripts/db-harness.mjs
npm run build
npx eslint <every file you created or modified>
npx prettier --check <every file you created or modified>
git diff --check
```

- [ ] **Step 2: Prove the new guards are load-bearing**

For each, break the line, run the named test, confirm the failures, restore, confirm green. Report the actual failing test names.

- remove the `revision_number desc` ordering from the new subquery → the DB suite's supersession and agreement assertions
- remove the converted-root filter from the upload → the sync test from Task 3
- make `isTargetCohortSession` return true for an absent marker → the Task 2 tests

- [ ] **Step 3: Record the slice**

In the C6.02 execution doc, add a section for `XS-W3-08` explaining that it was **inserted** into the sequence, and why: the pack assumed target Sessions existed, and nothing created them. Name the four slices it unblocks.

In `HANDOFF.md`, add the slice to the table, a delivery section, and evidence with the real numbers. It must state plainly:

- what a converted Session can and cannot do today (roster, rules, lifecycle, formation — but match execution stays on the legacy path);
- that the conversion is irreversible;
- that **a converted Session is only findable through the local marker**, so a new device or cleared storage loses sight of it until a `list_target_sessions` RPC exists, and that this is a decided trade-off, not an oversight;
- that this slice does NOT wire capture or publication — that is XS-W6-03.

- [ ] **Step 4: Commit**

```bash
npx prettier --write HANDOFF.md docs/architecture/execution/C6.02-W3-W6-SESSION-REGISTRATION-RATING-TEAM.md
git add -A
git commit -m "docs: registrar a XS-W3-08 e sua evidencia de verificacao"
```
