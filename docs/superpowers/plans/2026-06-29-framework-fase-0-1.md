# Framework Fase 0/1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stabilize the project gates and make local-first cloud sync failures visible, recoverable, and test-covered before the deeper platform refactor.

**Architecture:** This plan keeps the existing React/Vite/Supabase structure and makes focused repairs in the current modules. Fase 0 fixes the release gates and setup docs; Fase 1 fixes date handling, Supabase Storage policy coverage, and silent/partial bulk sync behavior. No broad folder restructure or new runtime library is introduced in this plan.

**Tech Stack:** React 19, Vite 6, TypeScript, Node test runner with `tsx`, Vitest/Testing Library, Supabase/Postgres/RLS, PowerShell on Windows.

---

## Scope Check

The approved design spec covers Fase 0 through Fase 5. This implementation plan intentionally covers only:

- Fase 0 - Mapa e travas de qualidade.
- Fase 1 - Confiabilidade de dados.

Later work needs separate plans for the Domain Platform Model, application command/query layer, scalable product modules, and skeuomorphic UX/UI.

## File Structure

Create:

- `src/logic/date.ts` - local date helpers for form-safe `YYYY-MM-DD` strings.
- `src/logic/date.test.ts` - regression tests for local date formatting.

Modify:

- `package.json` - include `src/logic/date.test.ts` in `test:unit`.
- `src/services/supabase/syncService.ts` - fix generic inference; propagate bulk upload issues through `onIssue`; preserve pending items when uploads fail or return partial results.
- `src/services/supabase/syncService.test.ts` - add regression tests for bulk failure and partial result loss.
- `src/services/supabase/operationalCloudService.ts` - stop swallowing individual fallback upsert failures.
- `src/services/supabase/upsertConflict.test.ts` - add source-level guard that fallback upsert failures are not silently swallowed.
- `src/services/supabase/schema.test.ts` - add Storage policy guard for avatar update `WITH CHECK`.
- `supabase/migrations/20260624133117_player_avatars_approval.sql` - add `WITH CHECK` to the avatar candidate update policy.
- `src/App.tsx` - use local date helper for new sessions and tournaments.
- `src/hooks/useCommunityPresence.ts` - use local date helper for today's presence record.
- `src/components/community/CommunitiesView.tsx` - use local date helper for WhatsApp draft creation.
- `src/hooks/useLiveSession.ts` - fix ESLint `prefer-const`.
- `README.md` - fix the Supabase migration filename and setup guidance.

Do not modify unrelated dirty files unless a task below names them.

## Task 1: Baseline Verification

**Files:**
- Read only: `package.json`
- Read only: `docs/superpowers/specs/2026-06-29-framework-profundo-design.md`

- [ ] **Step 1: Confirm the dirty working tree**

Run:

```powershell
git status --short
```

Expected: existing local changes may be present. Do not revert or stage them unless a later step explicitly modifies the same file for this plan.

- [ ] **Step 2: Confirm the current typecheck failure**

Run:

```powershell
npm run lint
```

Expected: FAIL before Task 2, with TypeScript errors in `src/services/supabase/syncService.ts` around `communitySemanticKey`, `playerSemanticKey`, `groupActiveDuplicates`, or `mergeEntityLists`.

- [ ] **Step 3: Confirm the current ESLint failure**

Run:

```powershell
npm run lint:eslint -- --quiet
```

Expected: FAIL before Task 3, with `prefer-const` for `newSets` in `src/hooks/useLiveSession.ts`.

- [ ] **Step 4: Confirm existing tests still run**

Run:

```powershell
npm run test:unit
npm run test:ui
```

Expected: both should pass before implementation, based on the previous audit. If they fail, record the failure and stop before changing code.

## Task 2: Fix TypeScript Generic Inference in Sync Dedupe/Merge

**Files:**
- Modify: `src/services/supabase/syncService.ts`
- Test: existing `npm run lint`
- Test: existing `npm run test:unit`

- [ ] **Step 1: Apply explicit generic types and wrapper callbacks**

In `src/services/supabase/syncService.ts`, change the duplicate grouping calls to pin the entity type:

```ts
const communityGroups = groupActiveDuplicates<Community>(
  local.communities.filter((community) =>
    canConsolidateOwnedEntity(community, options.ownerId),
  ),
  (community) => communitySemanticKey(community),
  (community) => community.cloudOwnerId || options.ownerId || 'local',
);

const playerGroups = groupActiveDuplicates<Player>(
  local.players.filter((player) => canConsolidateOwnedEntity(player, options.ownerId)),
  (player) => playerSemanticKey(player),
  (player) => player.cloudOwnerId || options.ownerId || 'local',
).filter((group) => {
  const linkedUsers = new Set(group.map((player) => player.userId).filter(Boolean));
  return linkedUsers.size <= 1;
});
```

In the `syncNow` merge object, change the first two properties to explicit generic calls:

```ts
communities: mergeEntityLists<Community>(local.communities, cloud.communities, {
  getId: (item) => item.id,
  getSemanticKey: (community) => communitySemanticKey(community),
}),
players: mergeEntityLists<Player>(local.players, cloud.players, {
  getId: (item) => item.id,
  getUpdatedAt: (item) => item.updatedAt || item.metadata?.atualizadoEm,
  getSemanticKey: (player) => playerSemanticKey(player),
}),
```

- [ ] **Step 2: Verify typecheck gets past the original inference errors**

Run:

```powershell
npm run lint
```

Expected: the previous `Pick<Community, 'name'>` and `Pick<Player, ...>` inference errors are gone. If new type errors appear, fix only errors caused by this task.

- [ ] **Step 3: Verify sync regression tests still pass**

Run:

```powershell
npm run test:unit
```

Expected: PASS.

- [ ] **Step 4: Commit**

Run:

```powershell
git add -- src/services/supabase/syncService.ts
git commit -m "fix(sync): pin merge entity generics"
```

Expected: commit contains only `src/services/supabase/syncService.ts`.

## Task 3: Fix ESLint Prefer-Const Gate

**Files:**
- Modify: `src/hooks/useLiveSession.ts`
- Test: `npm run lint:eslint -- --quiet`

- [ ] **Step 1: Replace `let` with `const`**

In `src/hooks/useLiveSession.ts`, inside `undoLastPoint`, change:

```ts
let newSets = g.sets ? [...g.sets] : [];
```

to:

```ts
const newSets = g.sets ? [...g.sets] : [];
```

This is valid because the array is mutated with `.pop()`, but the binding is not reassigned.

- [ ] **Step 2: Verify ESLint quiet mode**

Run:

```powershell
npm run lint:eslint -- --quiet
```

Expected: PASS.

- [ ] **Step 3: Commit**

Run:

```powershell
git add -- src/hooks/useLiveSession.ts
git commit -m "fix(lint): use const for live session sets"
```

Expected: commit contains only `src/hooks/useLiveSession.ts`.

## Task 4: Add Local Date Helper and Replace UTC Date Inputs

**Files:**
- Create: `src/logic/date.ts`
- Create: `src/logic/date.test.ts`
- Modify: `package.json`
- Modify: `src/App.tsx`
- Modify: `src/hooks/useCommunityPresence.ts`
- Modify: `src/components/community/CommunitiesView.tsx`
- Test: `npm run test:unit`
- Test: `npm run lint`

- [ ] **Step 1: Write the failing date test**

Create `src/logic/date.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { formatLocalDateInput } from './date';

test('formatLocalDateInput uses the local calendar day for date inputs', () => {
  const localLateNight = new Date(2026, 5, 28, 22, 57, 25);

  assert.equal(formatLocalDateInput(localLateNight), '2026-06-28');
});

test('formatLocalDateInput zero-pads month and day', () => {
  const localMorning = new Date(2026, 0, 5, 8, 0, 0);

  assert.equal(formatLocalDateInput(localMorning), '2026-01-05');
});
```

- [ ] **Step 2: Add the test to `package.json`**

In `package.json`, add `src/logic/date.test.ts` to the `test:unit` command immediately after `src/logic/session.test.ts`:

```json
"test:unit": "node --import tsx --test src/logic/balancing.test.ts src/logic/tournament.test.ts src/logic/migrations.test.ts src/logic/statistics.test.ts src/logic/rating.test.ts src/logic/playerEvaluations.test.ts src/services/supabase/mappers.test.ts src/services/supabase/schema.test.ts src/services/supabase/syncService.test.ts src/services/supabase/upsertConflict.test.ts src/logic/syncStatus.test.ts src/logic/username.test.ts src/logic/session.test.ts src/logic/date.test.ts src/logic/futCards.test.ts",
```

- [ ] **Step 3: Run the new test and verify it fails**

Run:

```powershell
node --import tsx --test src/logic/date.test.ts
```

Expected: FAIL with module not found for `./date`.

- [ ] **Step 4: Implement the local date helper**

Create `src/logic/date.ts`:

```ts
export function formatLocalDateInput(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}
```

- [ ] **Step 5: Verify the date helper test passes**

Run:

```powershell
node --import tsx --test src/logic/date.test.ts
```

Expected: PASS.

- [ ] **Step 6: Update `src/App.tsx`**

Add this import near the other local logic imports:

```ts
import { formatLocalDateInput } from './logic/date';
```

In `createSessionFromCommunity`, replace the session creation date with a local date:

```ts
const now = new Date();
const today = formatLocalDateInput(now);
const type = rules.defaultFormat || community.defaultFormat || 'free_play';
```

and:

```ts
name: `${community.name} - ${now.toLocaleDateString('pt-BR')}`,
date: today,
```

In the dashboard `onNewSession`, replace the inline `new Date()` calls with:

```ts
const now = new Date();
const s: Session = {
  id: generateUUID(),
  name: `Sessao - ${now.toLocaleDateString('pt-BR')}`,
  date: formatLocalDateInput(now),
  status: 'draft',
  selectedPlayerIds: [],
  teamIds: [],
  createdAt: now.toISOString(),
  updatedAt: now.toISOString(),
};
```

Preserve the current display punctuation if the source file still contains the em dash text; only the date calculation must change.

In the tournament creation button, apply the same pattern:

```ts
const now = new Date();
const s: Session = {
  id: generateUUID(),
  name: `Torneio - ${now.toLocaleDateString('pt-BR')}`,
  date: formatLocalDateInput(now),
  status: 'draft',
  selectedPlayerIds: [],
  teamIds: [],
  createdAt: now.toISOString(),
  updatedAt: now.toISOString(),
  type: 'tournament',
  config: getDefaultTournamentConfig(),
};
```

Again, keep existing punctuation/text if it differs; the required behavior is `date: formatLocalDateInput(now)`.

- [ ] **Step 7: Update `src/hooks/useCommunityPresence.ts`**

Add:

```ts
import { formatLocalDateInput } from '../logic/date';
```

Replace the local helper body:

```ts
function today() {
  return formatLocalDateInput();
}
```

- [ ] **Step 8: Update `src/components/community/CommunitiesView.tsx`**

Add the import:

```ts
import { formatLocalDateInput } from '../../logic/date';
```

Replace:

```ts
createDraftFromTemplate(initialTemplate, new Date().toISOString().split('T')[0]),
```

with:

```ts
createDraftFromTemplate(initialTemplate, formatLocalDateInput()),
```

- [ ] **Step 9: Verify all unit tests and typecheck**

Run:

```powershell
npm run test:unit
npm run lint
```

Expected: PASS.

- [ ] **Step 10: Commit**

Run:

```powershell
git add -- package.json src/logic/date.ts src/logic/date.test.ts src/App.tsx src/hooks/useCommunityPresence.ts src/components/community/CommunitiesView.tsx
git commit -m "fix(date): use local calendar dates"
```

Expected: commit contains only the files listed above.

## Task 5: Fix README Supabase Migration Setup

**Files:**
- Modify: `README.md`
- Test: manual file existence check

- [ ] **Step 1: Verify the referenced migration path**

Run:

```powershell
Test-Path 'supabase/migrations/20260609120000_backend_operational_sync.sql'
Test-Path 'supabase/migrations/20260610161203_backend_operational_sync.sql'
```

Expected: first command prints `False`; second prints `True`.

- [ ] **Step 2: Update README setup instructions**

In `README.md`, replace:

```text
2. supabase/migrations/20260609120000_backend_operational_sync.sql
```

with:

```text
2. supabase/migrations/20260610161203_backend_operational_sync.sql
```

In the troubleshooting row for broken cloud sync, replace:

```text
Run `20260609120000_backend_operational_sync.sql`.
```

with:

```text
Run `20260610161203_backend_operational_sync.sql`.
```

- [ ] **Step 3: Commit**

Run:

```powershell
git add -- README.md
git commit -m "docs: fix Supabase migration path"
```

Expected: commit contains only `README.md`.

## Task 6: Harden Avatar Storage UPDATE Policy

**Files:**
- Modify: `src/services/supabase/schema.test.ts`
- Modify: `supabase/migrations/20260624133117_player_avatars_approval.sql`
- Test: `node --import tsx --test src/services/supabase/schema.test.ts`

- [ ] **Step 1: Write the failing policy regression test**

In `src/services/supabase/schema.test.ts`, add this `readFileSync` near the other migration constants:

```ts
const avatarApprovalMigration = readFileSync(
  new URL(
    '../../../supabase/migrations/20260624133117_player_avatars_approval.sql',
    import.meta.url,
  ),
  'utf8',
);
```

Add this test:

```ts
test('avatar candidate update policy includes WITH CHECK for Storage upserts', () => {
  const updatePolicy = avatarApprovalMigration.match(
    /create policy "Player admins can replace avatar candidates" on storage\.objects[\s\S]*?;\s*/i,
  )?.[0];

  assert.ok(updatePolicy, 'missing avatar candidate update policy');
  assert.match(updatePolicy, /for update to authenticated/i);
  assert.match(updatePolicy, /using\s*\(/i);
  assert.match(updatePolicy, /with check\s*\(/i);
  assert.match(updatePolicy, /bucket_id\s*=\s*'avatars'/i);
  assert.match(updatePolicy, /\(storage\.foldername\(name\)\)\[1\]\s*=\s*'proposals'/i);
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```powershell
node --import tsx --test src/services/supabase/schema.test.ts
```

Expected: FAIL because the update policy has `USING` but no `WITH CHECK`.

- [ ] **Step 3: Add `WITH CHECK` to the policy**

In `supabase/migrations/20260624133117_player_avatars_approval.sql`, replace the update policy with:

```sql
drop policy if exists "Player admins can replace avatar candidates" on storage.objects;
create policy "Player admins can replace avatar candidates" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = 'proposals'
    and public.current_user_is_player_admin(
          ((storage.foldername(name))[2])::uuid)
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = 'proposals'
    and public.current_user_is_player_admin(
          ((storage.foldername(name))[2])::uuid)
  );
```

If this migration has already been applied to a live Supabase project, run the same SQL block manually in the Supabase SQL Editor after code review. Do not invent a new migration filename unless the Supabase CLI is installed; when the CLI is available, use `supabase migration new harden_avatar_storage_update_policy`.

- [ ] **Step 4: Verify the policy test passes**

Run:

```powershell
node --import tsx --test src/services/supabase/schema.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```powershell
git add -- src/services/supabase/schema.test.ts supabase/migrations/20260624133117_player_avatars_approval.sql
git commit -m "fix(db): add avatar storage update check"
```

Expected: commit contains only the test and the avatar migration.

## Task 7: Stop Swallowing Individual Fallback Upsert Failures

**Files:**
- Modify: `src/services/supabase/upsertConflict.test.ts`
- Modify: `src/services/supabase/operationalCloudService.ts`
- Test: `node --import tsx --test src/services/supabase/upsertConflict.test.ts`

- [ ] **Step 1: Write the source guard test**

In `src/services/supabase/upsertConflict.test.ts`, add:

```ts
test('operational fallback upserts surface individual failures', () => {
  const source = readFileSync(new URL('./operationalCloudService.ts', import.meta.url), 'utf8');

  assert.match(source, /fallbackErrors:\s*unknown\[\]/);
  assert.match(source, /throw new AggregateError\(fallbackErrors/);
  assert.doesNotMatch(
    source,
    /catch \(individualError\) \{[\s\S]*?console\.error\(`\[Bulk\] Failed individual upsert in \$\{table\}:`, individualError\);[\s\S]*?\}[\s\S]*?return results;/,
  );
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```powershell
node --import tsx --test src/services/supabase/upsertConflict.test.ts
```

Expected: FAIL before implementation because fallback individual errors are logged and swallowed.

- [ ] **Step 3: Implement fallback error aggregation**

In `src/services/supabase/operationalCloudService.ts`, replace both fallback loops in `bulkUpsertRows` with this pattern.

For the cardinality violation branch:

```ts
if (isCardinalityViolation(error)) {
  console.warn(`[Bulk] Duplicate conflict keys in ${table}. Falling back to individual upserts.`);
  const results: DbRecord[] = [];
  const fallbackErrors: unknown[] = [];

  for (const record of deduplicated) {
    try {
      const row = await upsertRow(table, record);
      results.push(row);
    } catch (individualError) {
      fallbackErrors.push(individualError);
    }
  }

  if (fallbackErrors.length > 0) {
    throw new AggregateError(
      fallbackErrors,
      `[Bulk] ${fallbackErrors.length} individual upserts failed in ${table}`,
    );
  }

  return results;
}
```

For the primary-key collision branch, use the same loop and error aggregation:

```ts
if (
  error &&
  (error.code === '23505' || error.statusCode === '23505') &&
  error.message?.includes('_pkey')
) {
  console.warn(`[Bulk] PK collision in ${table}. Falling back to individual upserts.`);
  const results: DbRecord[] = [];
  const fallbackErrors: unknown[] = [];

  for (const record of deduplicated) {
    try {
      const row = await upsertRow(table, record);
      results.push(row);
    } catch (individualError) {
      fallbackErrors.push(individualError);
    }
  }

  if (fallbackErrors.length > 0) {
    throw new AggregateError(
      fallbackErrors,
      `[Bulk] ${fallbackErrors.length} individual upserts failed in ${table}`,
    );
  }

  return results;
}
```

- [ ] **Step 4: Verify the guard test passes**

Run:

```powershell
node --import tsx --test src/services/supabase/upsertConflict.test.ts
```

Expected: PASS.

- [ ] **Step 5: Verify typecheck**

Run:

```powershell
npm run lint
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```powershell
git add -- src/services/supabase/upsertConflict.test.ts src/services/supabase/operationalCloudService.ts
git commit -m "fix(sync): surface fallback upsert failures"
```

Expected: commit contains only the operational service and its test.

## Task 8: Report Bulk Sync Failures Through `onIssue`

**Files:**
- Modify: `src/services/supabase/syncService.test.ts`
- Modify: `src/services/supabase/syncService.ts`
- Test: `node --import tsx --test src/services/supabase/syncService.test.ts`
- Test: `npm run test:unit`

- [ ] **Step 1: Add imports for behavioral sync tests**

In `src/services/supabase/syncService.test.ts`, change the imports to include `syncService`, `LocalSyncPayload`, and `operationalCloudService`:

```ts
import {
  mergeEntityLists,
  computeStaleRelationIds,
  communitySemanticKey,
  isUuid,
  isCloudBackedPlayerLinkProposal,
  playerSemanticKey,
  consolidateDuplicateRecords,
  syncService,
  type LocalSyncPayload,
} from './syncService';
import { operationalCloudService } from './operationalCloudService';
import {
  CloudSyncStatus,
  Community,
  CommunityPresence,
  Session,
  Team,
  WhatsAppListDraft,
} from '../../types';
```

- [ ] **Step 2: Add test helpers**

Add these helpers after the `TestEntity` interface:

```ts
function emptyPayload(overrides: Partial<LocalSyncPayload> = {}): LocalSyncPayload {
  return {
    communities: [],
    players: [],
    rules: [],
    templates: [],
    sessions: [],
    teams: [],
    games: [],
    pointEvents: [],
    gameReports: [],
    sessionReports: [],
    presenceRecords: [],
    drafts: [],
    linkProposals: [],
    ...overrides,
  };
}

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 'session-local',
    name: 'Treino',
    date: '2026-06-28',
    status: 'draft',
    selectedPlayerIds: [],
    teamIds: [],
    createdAt: '2026-06-28T20:00:00.000Z',
    updatedAt: '2026-06-28T20:00:00.000Z',
    syncStatus: 'pending',
    ...overrides,
  };
}

function makeTeam(overrides: Partial<Team> = {}): Team {
  return {
    id: 'team-local',
    sessionId: 'session-local',
    name: 'Time A',
    playerIds: [],
    generatedByAlgorithm: true,
    locked: false,
    strengthSnapshot: {} as Team['strengthSnapshot'],
    updatedAt: '2026-06-28T20:00:00.000Z',
    syncStatus: 'pending',
    ...overrides,
  };
}

function makeSharedCommunity(overrides: Partial<Community> = {}): Community {
  return {
    id: 'community-local',
    cloudId: 'community-cloud',
    cloudOwnerId: 'other-owner',
    name: 'Terca do Volei',
    createdAt: '2026-06-28T20:00:00.000Z',
    updatedAt: '2026-06-28T20:00:00.000Z',
    syncStatus: 'synced',
    ...overrides,
  };
}
```

- [ ] **Step 3: Write failing test for thrown bulk child upload**

Add:

```ts
test('uploadLocalDataToCloud reports thrown bulk session child failures through onIssue', async () => {
  const originalUpsertSession = operationalCloudService.upsertSession;
  const originalBulkUpsertTeams = operationalCloudService.bulkUpsertTeams;

  const issues: string[] = [];
  const session = makeSession();
  const team = makeTeam();

  try {
    operationalCloudService.upsertSession = async (item: Session) => ({
      ...item,
      cloudId: 'session-cloud',
    });
    operationalCloudService.bulkUpsertTeams = async () => {
      throw new Error('network down');
    };

    const result = await syncService.uploadLocalDataToCloud(
      emptyPayload({ sessions: [session], teams: [team] }),
      'owner-1',
      { onIssue: (context) => issues.push(context) },
    );

    assert.equal(result.teams.length, 1);
    assert.equal(result.teams[0].id, 'team-local');
    assert.equal(result.teams[0].syncStatus, 'pending');
    assert.equal(issues.length, 1);
    assert.match(issues[0], /teams/i);
  } finally {
    operationalCloudService.upsertSession = originalUpsertSession;
    operationalCloudService.bulkUpsertTeams = originalBulkUpsertTeams;
  }
});
```

- [ ] **Step 4: Write failing test for partial bulk child result**

Add:

```ts
test('uploadLocalDataToCloud keeps child items pending when bulk returns no matching result', async () => {
  const originalUpsertSession = operationalCloudService.upsertSession;
  const originalBulkUpsertTeams = operationalCloudService.bulkUpsertTeams;

  const issues: string[] = [];
  const session = makeSession();
  const team = makeTeam();

  try {
    operationalCloudService.upsertSession = async (item: Session) => ({
      ...item,
      cloudId: 'session-cloud',
    });
    operationalCloudService.bulkUpsertTeams = async () => [];

    const result = await syncService.uploadLocalDataToCloud(
      emptyPayload({ sessions: [session], teams: [team] }),
      'owner-1',
      { onIssue: (context) => issues.push(context) },
    );

    assert.equal(result.teams.length, 1);
    assert.equal(result.teams[0].id, 'team-local');
    assert.equal(result.teams[0].syncStatus, 'pending');
    assert.equal(issues.length, 1);
    assert.match(issues[0], /teams/i);
  } finally {
    operationalCloudService.upsertSession = originalUpsertSession;
    operationalCloudService.bulkUpsertTeams = originalBulkUpsertTeams;
  }
});
```

- [ ] **Step 5: Write failing tests for presence and drafts catch paths**

Add:

```ts
test('uploadLocalDataToCloud reports presence bulk failures through onIssue', async () => {
  const originalBulkUpsertPresence = operationalCloudService.bulkUpsertPresence;
  const issues: string[] = [];
  const presence: CommunityPresence = {
    communityId: 'community-local',
    date: '2026-06-28',
    items: [],
    updatedAt: '2026-06-28T20:00:00.000Z',
    syncStatus: 'pending',
  };

  try {
    operationalCloudService.bulkUpsertPresence = async () => {
      throw new Error('presence upload failed');
    };

    const result = await syncService.uploadLocalDataToCloud(
      emptyPayload({
        communities: [makeSharedCommunity()],
        presenceRecords: [presence],
      }),
      'owner-1',
      { onIssue: (context) => issues.push(context) },
    );

    assert.equal(result.presenceRecords.length, 1);
    assert.equal(result.presenceRecords[0].communityId, 'community-local');
    assert.equal(result.presenceRecords[0].syncStatus, 'pending');
    assert.equal(issues.length, 1);
    assert.match(issues[0], /community_presence|presenca/i);
  } finally {
    operationalCloudService.bulkUpsertPresence = originalBulkUpsertPresence;
  }
});

test('uploadLocalDataToCloud reports WhatsApp draft bulk failures through onIssue', async () => {
  const originalBulkUpsertDrafts = operationalCloudService.bulkUpsertDrafts;
  const issues: string[] = [];
  const draft: WhatsAppListDraft = {
    id: 'draft-local',
    communityId: 'community-local',
    title: 'Lista',
    date: '2026-06-28',
    setters: [],
    mainSlots: [],
    reserveSlots: [],
    settersSectionTitle: 'Levantadores',
    reserveSectionTitle: 'Reserva',
    showLockIcon: true,
    paymentSymbol: '$',
    createdAt: '2026-06-28T20:00:00.000Z',
    updatedAt: '2026-06-28T20:00:00.000Z',
    syncStatus: 'pending',
  };

  try {
    operationalCloudService.bulkUpsertDrafts = async () => {
      throw new Error('draft upload failed');
    };

    const result = await syncService.uploadLocalDataToCloud(
      emptyPayload({
        communities: [makeSharedCommunity()],
        drafts: [draft],
      }),
      'owner-1',
      { onIssue: (context) => issues.push(context) },
    );

    assert.equal(result.drafts.length, 1);
    assert.equal(result.drafts[0].id, 'draft-local');
    assert.equal(result.drafts[0].syncStatus, 'pending');
    assert.equal(issues.length, 1);
    assert.match(issues[0], /whatsapp_list_drafts|rascunho/i);
  } finally {
    operationalCloudService.bulkUpsertDrafts = originalBulkUpsertDrafts;
  }
});
```

- [ ] **Step 6: Run the sync tests and verify they fail**

Run:

```powershell
node --import tsx --test src/services/supabase/syncService.test.ts
```

Expected: FAIL because thrown/partial bulk child uploads and presence/draft bulk catches do not call `onIssue`.

- [ ] **Step 7: Add missing upload error helpers**

In `src/services/supabase/syncService.ts`, near `nowIso`, add:

```ts
function missingUploadResultError(table: string, id: string) {
  return new Error(`Bulk upload for ${table} did not return a result for ${id}`);
}

function reportIssue(onIssue: SyncOptions['onIssue'], context: string, error: unknown) {
  if (onIssue) onIssue(context, error);
}
```

- [ ] **Step 8: Update `bulkUploadSessionChildren` signature and behavior**

Replace `bulkUploadSessionChildren` with this implementation:

```ts
async function bulkUploadSessionChildren<T extends Syncable>(
  items: T[],
  sessionsById: Map<string, Session>,
  softDeleteTable: Parameters<typeof operationalCloudService.bulkSoftDelete>[0],
  bulkUpsertFn: (itemsToUpsert: T[]) => Promise<T[]>,
  options: SyncOptions = {},
): Promise<T[]> {
  const syncedAt = nowIso();
  const updated: T[] = [];

  const itemsToDelete: string[] = [];
  const itemsToUpsert: T[] = [];
  const itemMap = new Map<string, T>();
  const uploadedItemKeys = new Set<string>();

  for (const item of items) {
    if (item.deletedAt) {
      if (item.cloudId) itemsToDelete.push(item.cloudId);
      updated.push(markSynced(item, item.cloudId, syncedAt));
      continue;
    }

    const sessionId = item.sessionId;
    const session = sessionsById.get(sessionId?.toLowerCase());
    if (!session) {
      updated.push(item);
      continue;
    }

    itemsToUpsert.push(item);
    const key = (item.id || item.cloudId || 'temp').toLowerCase();
    itemMap.set(key, item);
  }

  try {
    if (itemsToDelete.length > 0) {
      await operationalCloudService.bulkSoftDelete(softDeleteTable, itemsToDelete);
    }

    if (itemsToUpsert.length > 0) {
      const uploadedResults = await bulkUpsertFn(itemsToUpsert);
      for (const result of uploadedResults) {
        const key = (result.id || '').toLowerCase();
        const originalItem = itemMap.get(key);
        if (originalItem) {
          uploadedItemKeys.add(key);
          updated.push(markSynced(originalItem, result.cloudId, syncedAt));
        }
      }

      for (const item of itemsToUpsert) {
        const key = (item.id || item.cloudId || 'temp').toLowerCase();
        if (uploadedItemKeys.has(key)) continue;
        reportIssue(
          options.onIssue,
          `upload ${softDeleteTable} "${item.id || item.cloudId || 'sem-id'}"`,
          missingUploadResultError(softDeleteTable, item.id || item.cloudId || 'sem-id'),
        );
        updated.push(item);
      }
    }
  } catch (error) {
    reportIssue(options.onIssue, `upload ${softDeleteTable}`, error);
    return items;
  }

  return visible(updated);
}
```

- [ ] **Step 9: Pass options into all session child bulk calls**

In `uploadLocalDataToCloud`, add `options` as the final argument to each `bulkUploadSessionChildren` call:

```ts
const updatedTeams = await bulkUploadSessionChildren<Team>(
  local.teams,
  sessionsById,
  'teams',
  (items) => operationalCloudService.bulkUpsertTeams(items, ownerId, sessionsById),
  options,
);
```

Repeat the same final `options` argument for games, point events, game reports, and session reports.

- [ ] **Step 10: Report presence catch path through `onIssue`**

In the `community_presence` catch block, add:

```ts
reportIssue(options.onIssue, 'upload community_presence', error);
```

directly before preserving local records.

- [ ] **Step 11: Report draft catch path through `onIssue`**

In the `whatsapp_list_drafts` catch block, add:

```ts
reportIssue(options.onIssue, 'upload whatsapp_list_drafts', error);
```

directly before preserving local records.

- [ ] **Step 12: Verify sync tests pass**

Run:

```powershell
node --import tsx --test src/services/supabase/syncService.test.ts
```

Expected: PASS.

- [ ] **Step 13: Verify full unit suite**

Run:

```powershell
npm run test:unit
```

Expected: PASS.

- [ ] **Step 14: Commit**

Run:

```powershell
git add -- src/services/supabase/syncService.ts src/services/supabase/syncService.test.ts
git commit -m "fix(sync): report partial bulk upload failures"
```

Expected: commit contains only `syncService.ts` and `syncService.test.ts`.

## Task 9: Final Fase 0/1 Verification

**Files:**
- Read only: all changed files
- Test: all verification commands

- [ ] **Step 1: Run typecheck**

Run:

```powershell
npm run lint
```

Expected: PASS.

- [ ] **Step 2: Run ESLint quiet mode**

Run:

```powershell
npm run lint:eslint -- --quiet
```

Expected: PASS.

- [ ] **Step 3: Run unit tests**

Run:

```powershell
npm run test:unit
```

Expected: PASS.

- [ ] **Step 4: Run UI tests**

Run:

```powershell
npm run test:ui
```

Expected: PASS.

- [ ] **Step 5: Run production build**

Run:

```powershell
npm run build
```

Expected: PASS. Chunk-size warnings are acceptable if unchanged from the audit.

- [ ] **Step 6: Run dependency audit**

Run:

```powershell
npm audit --audit-level=moderate
```

Expected: may still FAIL because dependency upgrades are not part of this Fase 0/1 reliability plan. Record the advisories in the handoff.

- [ ] **Step 7: Review final diff**

Run:

```powershell
git status --short
git log --oneline -8
```

Expected: only intentional task changes are committed. Pre-existing unrelated dirty files remain untouched unless they were explicitly part of a task.

## Self-Review

Spec coverage:

- Fase 0 typecheck, ESLint, README, and gates are covered by Tasks 1, 2, 3, 5, and 9.
- Fase 1 local date reliability is covered by Task 4.
- Fase 1 Storage `WITH CHECK` is covered by Task 6.
- Fase 1 silent/partial bulk sync failures are covered by Tasks 7 and 8.
- Supabase current-docs discipline is covered by Task 6 notes and the required implementation-time Supabase skill usage.
- Deeper Domain Platform Model and UX work are intentionally excluded and require later plans.

Unfinished marker scan:

- This plan contains no unfinished markers or vague catch-all implementation steps.

Type consistency:

- `LocalSyncPayload`, `Session`, `Team`, `Community`, `CommunityPresence`, and `WhatsAppListDraft` match existing project types.
- `SyncOptions['onIssue']` already exists in `syncService.ts`.
- `operationalCloudService` methods are exported as mutable object properties and can be restored in tests.

Execution note:

- Before executing this plan, use `superpowers:test-driven-development` for bugfix tasks.
- For Supabase/RLS work, fetch the current Supabase changelog and docs again before applying SQL to a live project.
