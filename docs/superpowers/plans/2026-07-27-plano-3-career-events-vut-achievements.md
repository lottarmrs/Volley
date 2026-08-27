# Plano 3 — Career Events, Global VUT & Achievements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the global career/VUT/achievements engine, plus the sync foundation (outbox, cache partition, reentrancy, typed errors, reset scaffold) that resolves all known sync problems. Retrofit existing FutCard components to consume persisted snapshots without UI changes.

**Architecture:** Three sequential blocks with independent gates — Sync Foundation (Tasks 1-6) resolves Classes C/D/E/F from the sync audit; Career Engine (Tasks 7-12) resolves Classes A/B + adds the persisted VUT/achievements; Retrofit UI (Tasks 13-16) swaps the data source of existing FutCard components. UI remains frozen per program rules.

**Tech Stack:** Same TypeScript/React/Supabase stack as every prior plan. No new dependencies.

## Global Constraints

- `aggregatePlayerEvaluations`, `applyEvaluationAggregate`, `simulateLocalConsensus` (`src/logic/playerEvaluations.ts`) must not change behavior or signature. Their existing tests must pass unmodified.
- `ACHIEVEMENT_CATALOG` (`src/logic/futCards.ts:460-1258`) — 75 entries — is reused unmodified. No task may add, remove, or edit catalog entries.
- `generateTournamentSchedule`, `generateRoundRobinSchedule`, `calculateTournamentStandings`, `calculateTournamentAwards`, `calculateTournamentMVP`, `calculateTopScorers` (`src/logic/tournament.ts`) are not modified by this plan.
- `toFut(v)` (`src/logic/futCards.ts:149-154`) is reused as-is for the objective projection normalization 0-100. No new curve.
- No new routes, screens, or player-facing UI beyond the toggle "Filtrar por comunidade" inside the existing `FutCardModal`.
- Do not add TanStack Query, Dexie, XState, or Zod (carried over from every prior plan).
- Every new migration needs positive and negative RLS/RPC tests before being applied to the real project, per this program's standing rule.
- Migrations are applied to the real Supabase project (`csoslatxjjazrtrtylke`) via the Supabase MCP `apply_migration` tool, then verified with `list_tables`/`execute_sql`/`get_advisors`.
- Every FK in a new entity upload path must pass through `resolveCloudId` before being sent to the cloud — this is the A1-class bug guard. Every new entity must have a regression test proving that a missing FK reference causes the upload to defer (stay `pending`), NOT to send a local id disguised as a cloud id.
- Windows/CRLF: this repo has `core.autocrlf=true`. If freshly checked-out `.sql` files appear CRLF-modified with empty diff, do not "fix" by editing content.
- The existing `AppError` in `src/application/appResult.ts:36` is currently `ProductAppError | TechnicalAppError` (only 2 variants). This plan expands it to 6 variants. Every consumer of `AppError` must continue to compile — the discriminated union refinement must be backward-compatible with existing pattern matching on `.kind`.
- Suite baseline at the start of this plan: 518 unit + 99 UI tests, `tsc --noEmit` clean. ESLint has 381 errors + 974 warnings **pre-existing** — no task may add new ESLint errors (warnings are tolerated if matching existing patterns).
- Every task ends with `npm test`, `npx tsc --noEmit`, `npm run lint:eslint` clean (baseline-tolerant) before committing.

---

# Bloco 1 — Sync Foundation

### Task 1: Outbox table migration

**Files:**
- Create: `supabase/migrations/20260727100000_outbox_entries.sql`
- Modify: `supabase/migrations/schema.sql` (consolidated schema — append the same DDL)
- Modify: `src/infra/supabase/schema.test.ts` (add fixture read + tests)

**Interfaces:**
- Consumes: `auth.users` (existing), `communities` (existing).
- Produces: `public.outbox_entries` table with RLS, idempotency unique constraint, partial index for pending consumer.

- [ ] **Step 1: Read existing migration pattern**

Read `supabase/migrations/20260725120000_championship_scheduling.sql:1-180` to match this codebase's table-creation, RLS, policy, grant/revoke convention exactly. Read `supabase/migrations/schema.sql:144` (is_app_staff) and `:210` (current_user_has_community_role) for policy predicates you'll reuse.

- [ ] **Step 2: Add the schema test fixture read**

Open `src/infra/supabase/schema.test.ts`. Near the top alongside other fixture reads (after the `accountIdentityMigration` block around line 88), add:

```ts
const outboxEntriesMigration = readFixture(
  new URL('../../../supabase/migrations/20260727100000_outbox_entries.sql', import.meta.url),
);
```

- [ ] **Step 3: Write failing schema tests**

At the end of `schema.test.ts`, add:

```ts
test('outbox_entries table exists with idempotency key and RLS', () => {
  assert.match(outboxEntriesMigration, /create table if not exists public\.outbox_entries/i);
  assert.match(outboxEntriesMigration, /id uuid primary key default gen_random_uuid\(\)/i);
  assert.match(outboxEntriesMigration, /auth_user_id uuid not null references auth\.users\(id\) on delete cascade/i);
  assert.match(outboxEntriesMigration, /operation text not null/i);
  assert.match(outboxEntriesMigration, /payload jsonb not null/i);
  assert.match(outboxEntriesMigration, /idempotency_key text not null unique/i);
  assert.match(
    outboxEntriesMigration,
    /status text not null default 'pending_upload'[\s\S]*check \(status in/i,
  );
  assert.match(
    outboxEntriesMigration,
    /alter table public\.outbox_entries enable row level security/i,
  );
  assert.match(
    outboxEntriesMigration,
    /revoke all on table public\.outbox_entries from public, anon, authenticated/i,
  );
  assert.match(
    outboxEntriesMigration,
    /grant select, insert, update, delete on public\.outbox_entries to authenticated/i,
  );
});

test('outbox_entries RLS restricts rows to the owning auth user', () => {
  assert.match(
    outboxEntriesMigration,
    /create policy "outbox_entries_owned_by_user" on public\.outbox_entries[\s\S]*auth_user_id = \(select auth\.uid\(\)\)/i,
  );
});

test('outbox_entries has a partial index for pending consumption', () => {
  assert.match(
    outboxEntriesMigration,
    /create index outbox_entries_pending_idx on public\.outbox_entries \(auth_user_id, status\) where status in \('pending_upload', 'syncing'\)/i,
  );
});

test('consolidated schema includes outbox_entries with RLS', () => {
  assert.match(baseSchema, /create table if not exists public\.outbox_entries/i);
  assert.match(baseSchema, /alter table public\.outbox_entries enable row level security/i);
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `npm run test:unit -- src/infra/supabase/schema.test.ts`
Expected: FAIL — migration file does not exist yet.

- [ ] **Step 5: Write the migration**

Create `supabase/migrations/20260727100000_outbox_entries.sql`:

```sql
-- Outbox idempotente: uma linha por operação de domínio enfileirada pelo client.
-- Consumida pelo sync worker; em sucesso a entrada é DELETADA (nuvem autoritativa +
-- idempotency_key impede duplicação futura). Em falha recoverable volta para
-- pending_upload com attempts++. Em falha estrutural fica recoverable_error visível.

create table if not exists public.outbox_entries (
  id              uuid primary key default gen_random_uuid(),
  auth_user_id    uuid not null references auth.users(id) on delete cascade,
  community_id    uuid references public.communities(id) on delete set null,
  operation       text not null,
  payload         jsonb not null,
  idempotency_key text not null unique,
  status          text not null default 'pending_upload'
                  check (status in ('pending_upload', 'syncing', 'cloud_confirmed',
                                    'recoverable_error')),
  attempts        int not null default 0,
  last_error      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.outbox_entries enable row level security;

create policy "outbox_entries_owned_by_user"
  on public.outbox_entries
  for all
  using (auth_user_id = (select auth.uid()))
  with check (auth_user_id = (select auth.uid()));

create index outbox_entries_pending_idx
  on public.outbox_entries (auth_user_id, status)
  where status in ('pending_upload', 'syncing');

revoke all on table public.outbox_entries from public, anon, authenticated;
grant select, insert, update, delete on public.outbox_entries to authenticated;
```

Apply the same DDL to `supabase/migrations/schema.sql` (consolidated schema — append at the appropriate section).

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm run test:unit -- src/infra/supabase/schema.test.ts`
Expected: PASS.

- [ ] **Step 7: Run full suite, typecheck, lint**

```bash
npm test
npx tsc --noEmit
npm run lint:eslint
```

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/20260727100000_outbox_entries.sql supabase/migrations/schema.sql src/infra/supabase/schema.test.ts
git commit -m "feat(db): add outbox_entries table with idempotency_key and RLS"
```

- [ ] **Step 9: Apply to production**

Use Supabase MCP `apply_migration` with the file contents, then `list_tables` to confirm `outbox_entries` exists, and `get_advisors` to confirm no warnings.

---

### Task 2: Outbox client — enqueue, consume, transition

**Files:**
- Create: `src/infra/outbox/outboxClient.ts`
- Create: `src/infra/outbox/outboxClient.test.ts`

**Interfaces:**
- Consumes: `outbox_entries` table (Task 1), `supabase-js` client.
- Produces `OutboxClient` singleton with `enqueue(operation, payload)`, `pendingForUser(userId)`, `markSyncing(id)`, `markConfirmed(id)`, `markRecoverableError(id, message)`, `clearConfirmed`. Task 5 (sync integration) depends on these names.

- [ ] **Step 1: Write the failing tests**

Create `src/infra/outbox/outboxClient.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeIdempotencyKey,
  validateOutboxPayload,
  pendingOutboxTransition,
  type OutboxEntry,
  type OutboxStatus,
} from './outboxClient';

test('computeIdempotencyKey is deterministic for the same operation+payload+user', () => {
  const a = computeIdempotencyKey('session.conclude', { sessionId: 's1' }, 'user-a');
  const b = computeIdempotencyKey('session.conclude', { sessionId: 's1' }, 'user-a');
  assert.equal(a, b);
  assert.match(a, /^[0-9a-f]{64}$/i);
});

test('computeIdempotencyKey differs across users, operations, or payloads', () => {
  const base = computeIdempotencyKey('session.conclude', { sessionId: 's1' }, 'user-a');
  assert.notEqual(base, computeIdempotencyKey('session.conclude', { sessionId: 's1' }, 'user-b'));
  assert.notEqual(base, computeIdempotencyKey('point.register', { sessionId: 's1' }, 'user-a'));
  assert.notEqual(base, computeIdempotencyKey('session.conclude', { sessionId: 's2' }, 'user-a'));
});

test('validateOutboxPayload accepts known operation shapes and rejects unknown/invalid', () => {
  assert.equal(validateOutboxPayload('session.conclude', { sessionId: 's-1' }).ok, true);
  assert.equal(validateOutboxPayload('session.conclude', { sessionId: '' }).ok, false);
  assert.equal(validateOutboxPayload('session.conclude', {}).ok, false);
  assert.equal(validateOutboxPayload('unknown.op', { anything: true }).ok, false);
});

test('pendingOutboxTransition moves pending_upload to syncing and back on recoverable failure', () => {
  const base: OutboxEntry = {
    id: 'e-1', authUserId: 'u-1', operation: 'session.conclude', payload: { sessionId: 's-1' },
    idempotencyKey: 'k-1', status: 'pending_upload', attempts: 0, lastError: null,
    createdAt: '2026-07-27T00:00:00Z', updatedAt: '2026-07-27T00:00:00Z',
  };
  const syncing = pendingOutboxTransition(base, 'markSyncing');
  assert.equal(syncing.status, 'syncing');
  assert.equal(syncing.attempts, 0);
  const failed = pendingOutboxTransition(syncing, 'markRecoverableError', 'network down');
  assert.equal(failed.status, 'recoverable_error');
  assert.equal(failed.attempts, 1);
  assert.equal(failed.lastError, 'network down');
  const retry = pendingOutboxTransition(failed, 'markRetryReady');
  assert.equal(retry.status, 'pending_upload');
  assert.equal(retry.attempts, 1);
});

test('pendingOutboxTransition keeps entries frozen after 5 attempts', () => {
  const base: OutboxEntry = {
    id: 'e-1', authUserId: 'u-1', operation: 'session.conclude', payload: { sessionId: 's-1' },
    idempotencyKey: 'k-1', status: 'recoverable_error', attempts: 5, lastError: 'persistent',
    createdAt: '2026-07-27T00:00:00Z', updatedAt: '2026-07-27T00:31:00Z',
  };
  const retry = pendingOutboxTransition(base, 'markRetryReady');
  assert.equal(retry.status, 'recoverable_error');
  assert.equal(retry.attempts, 5);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:unit -- src/infra/outbox/outboxClient.test.ts`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement `outboxClient.ts`**

```ts
// src/infra/outbox/outboxClient.ts
import { createHash } from 'node:crypto';
import supabase from '../../lib/supabaseClient';

export type OutboxStatus = 'pending_upload' | 'syncing' | 'cloud_confirmed' | 'recoverable_error';

export interface OutboxEntry {
  id: string;
  authUserId: string;
  communityId?: string | null;
  operation: string;
  payload: Record<string, unknown>;
  idempotencyKey: string;
  status: OutboxStatus;
  attempts: number;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

const MAX_ATTEMPTS = 5;

export function computeIdempotencyKey(
  operation: string,
  payload: Record<string, unknown>,
  userId: string,
): string {
  const canonical = JSON.stringify({ operation, payload, userId });
  return createHash('sha256').update(canonical).digest('hex');
}

export function validateOutboxPayload(
  operation: string,
  payload: Record<string, unknown>,
): { ok: boolean; message?: string } {
  const known: Record<string, (p: Record<string, unknown>) => boolean> = {
    'session.conclude': (p) => typeof p.sessionId === 'string' && p.sessionId.length > 0,
    'point.register': (p) => typeof p.sessionId === 'string' && p.sessionId.length > 0,
    'claim.apply': (p) => typeof p.playerId === 'string' && p.playerId.length > 0,
    'evaluation.save': (p) => typeof p.playerId === 'string' && typeof p.communityId === 'string',
  };
  const validator = known[operation];
  if (!validator) return { ok: false, message: `unknown operation: ${operation}` };
  return validator(payload) ? { ok: true } : { ok: false, message: `invalid payload for ${operation}` };
}

type Transition = 'markSyncing' | 'markConfirmed' | 'markRecoverableError' | 'markRetryReady';

export function pendingOutboxTransition(
  entry: OutboxEntry,
  transition: Transition,
  errorMessage?: string,
): OutboxEntry {
  const now = new Date().toISOString();
  switch (transition) {
    case 'markSyncing':
      return entry.status === 'pending_upload'
        ? { ...entry, status: 'syncing', updatedAt: now }
        : entry;
    case 'markConfirmed':
      return { ...entry, status: 'cloud_confirmed', updatedAt: now, lastError: null };
    case 'markRecoverableError':
      return {
        ...entry,
        status: entry.attempts + 1 >= MAX_ATTEMPTS ? 'recoverable_error' : 'pending_upload',
        attempts: entry.attempts + 1,
        lastError: errorMessage ?? null,
        updatedAt: now,
      };
    case 'markRetryReady':
      if (entry.status !== 'recoverable_error' || entry.attempts >= MAX_ATTEMPTS) return entry;
      return { ...entry, status: 'pending_upload', updatedAt: now };
  }
}

export const outboxClient = {
  async enqueue(
    operation: string,
    payload: Record<string, unknown>,
    authUserId: string,
    communityId?: string,
  ): Promise<OutboxEntry> {
    const validation = validateOutboxPayload(operation, payload);
    if (!validation.ok) throw new Error(`outbox: ${validation.message}`);
    const idempotencyKey = computeIdempotencyKey(operation, payload, authUserId);
    const { data, error } = await supabase
      .from('outbox_entries')
      .upsert(
        {
          auth_user_id: authUserId,
          community_id: communityId ?? null,
          operation,
          payload,
          idempotency_key: idempotencyKey,
          status: 'pending_upload',
          attempts: 0,
        },
        { onConflict: 'idempotency_key' },
      )
      .select()
      .single();
    if (error) throw error;
    return data as unknown as OutboxEntry;
  },

  async pendingForUser(userId: string): Promise<OutboxEntry[]> {
    const { data, error } = await supabase
      .from('outbox_entries')
      .select('*')
      .eq('auth_user_id', userId)
      .in('status', ['pending_upload', 'syncing'])
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data ?? []) as unknown as OutboxEntry[];
  },

  async transition(id: string, transition: Transition, errorMessage?: string): Promise<void> {
    const { error } = await supabase
      .from('outbox_entries')
      .update(pendingOutboxTransition({} as OutboxEntry, transition, errorMessage))
      .eq('id', id);
    if (error) throw error;
  },

  async clearConfirmed(userId: string): Promise<void> {
    await supabase
      .from('outbox_entries')
      .delete()
      .eq('auth_user_id', userId)
      .eq('status', 'cloud_confirmed');
  },
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:unit -- src/infra/outbox/outboxClient.test.ts`
Expected: PASS.

- [ ] **Step 5: Run full suite, typecheck, lint, commit**

```bash
npm test
npx tsc --noEmit
git add src/infra/outbox/outboxClient.ts src/infra/outbox/outboxClient.test.ts
git commit -m "feat(outbox): add enqueue/consume/transition client with idempotency"
```

---

### Task 3: AppError union expansion + sync issue ledger typed errors

**Files:**
- Modify: `src/application/appResult.ts:1-83` (extend `AppError` union, add constructors)
- Modify: `src/logic/syncIssueLedger.ts:7-29, 154-178` (add `kind` field to `SyncIssueEntry`)
- Modify: `src/infra/supabase/syncService.test.ts` (no API break)

**Interfaces:**
- Consumes: existing `AppResult`, `productError`, `technicalError`.
- Produces: expanded `AppError` with 6 variants, new constructors `validationError`, `authorizationError`, `conflictError`, `offlineError`, `unexpectedError`. `SyncIssueEntry` gains a `kind: AppError['kind']` field. Every cloud service adapter in later tasks must return `AppResult<T>` not `throw new Error`.

- [ ] **Step 1: Read current appResult.ts and syncIssueLedger.ts**

Read `src/application/appResult.ts:1-83` to see the existing `AppError = ProductAppError | TechnicalAppError` (line 36), `appOk` (line 51), `productError` (line 55), `technicalError` (line 62). Read `src/logic/syncIssueLedger.ts:1-200` to see `SyncIssueEntry` (line 7) and `recordStoredSyncIssue` (line 154).

- [ ] **Step 2: Write failing tests**

Create `src/application/appResult.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  appOk, productError, technicalError,
  validationError, authorizationError, conflictError, offlineError, unexpectedError,
  type AppError, type AppResult,
} from './appResult';

test('validationError produces AppError kind=validation', () => {
  const r = validationError('email', 'must be non-empty');
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.error.kind, 'validation');
    assert.equal((r.error as any).field, 'email');
  }
});

test('authorizationError produces AppError kind=authorization with required aal2', () => {
  const r = authorizationError('aal2', 'MFA required');
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.error.kind, 'authorization');
    assert.equal((r.error as any).required, 'aal2');
  }
});

test('conflictError, offlineError, unexpectedError produce matching kinds', () => {
  assert.equal((conflictError('username', 'taken') as any).error.kind, 'conflict');
  assert.equal((offlineError('offline') as any).error.kind, 'offline_unavailable');
  assert.equal((unexpectedError('boom') as any).error.kind, 'unexpected');
  assert.match((unexpectedError('boom') as any).error.correlationId, /^[0-9a-f-]{36}$/i);
});

test('appOk and productError still work unchanged', () => {
  const ok = appOk(42);
  assert.equal(ok.ok, true);
  if (ok.ok) assert.equal(ok.value, 42);
  const p = productError('not_found', 'missing');
  assert.equal(p.ok, false);
});

test('AppError union is exhaustively kind-discriminated', () => {
  const errors: AppError[] = [
    validationError('a','b').error as any,
    authorizationError('aal2','b').error as any,
    conflictError('r','b').error as any,
    offlineError('b').error as any,
    technicalError('b').error as any,
    unexpectedError('b').error as any,
  ];
  const kinds = errors.map((e) => e.kind);
  const expected = ['validation','authorization','conflict','offline_unavailable','technical','unexpected'];
  assert.deepEqual(kinds.sort(), expected.sort());
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm run test:unit -- src/application/appResult.test.ts`
Expected: FAIL — `validationError` etc. not exported.

- [ ] **Step 4: Extend `appResult.ts`**

Add to the existing type union and constructors (preserving existing exports verbatim — these are additive):

```ts
// Append to the existing AppError union (line 36) — BACKWARD COMPATIBLE:
export type AppError =
  | ProductAppError
  | TechnicalAppError
  | ValidationAppError
  | AuthorizationAppError
  | ConflictAppError
  | OfflineAppError
  | UnexpectedAppError;

export interface ValidationAppError {
  kind: 'validation';
  field: string;
  message: string;
  recoverable: false;
}
export interface AuthorizationAppError {
  kind: 'authorization';
  required?: 'owner' | 'admin' | 'aal2' | 'master' | 'programmer';
  message: string;
  recoverable: false;
}
export interface ConflictAppError {
  kind: 'conflict';
  resource: string;
  message: string;
  recoverable: false;
}
export interface OfflineAppError {
  kind: 'offline_unavailable';
  message: string;
  recoverable: true;
}
export interface UnexpectedAppError {
  kind: 'unexpected';
  correlationId: string;
  message: string;
  recoverable: true;
}

export function validationError(field: string, message: string): AppErrorResult {
  return { ok: false, error: { kind: 'validation', field, message, recoverable: false } };
}
export function authorizationError(
  required: 'owner' | 'admin' | 'aal2' | 'master' | 'programmer',
  message: string,
): AppErrorResult {
  return { ok: false, error: { kind: 'authorization', required, message, recoverable: false } };
}
export function conflictError(resource: string, message: string): AppErrorResult {
  return { ok: false, error: { kind: 'conflict', resource, message, recoverable: false } };
}
export function offlineError(message: string): AppErrorResult {
  return { ok: false, error: { kind: 'offline_unavailable', message, recoverable: true } };
}
export function unexpectedError(message: string): AppErrorResult {
  return {
    ok: false,
    error: {
      kind: 'unexpected',
      message,
      correlationId: crypto.randomUUID(),
      recoverable: true,
    },
  };
}
```

- [ ] **Step 5: Add `kind` field to `SyncIssueEntry`**

In `src/logic/syncIssueLedger.ts`, extend the `SyncIssueEntry` interface (line 7) to include `kind: AppError['kind']` (default `'unexpected'`). Extend `SyncIssueInput` (line 19) the same way. Update `recordSyncIssue` to propagate `kind`. Existing callers that pass plain `Error` continue to work — they fall back to `'unexpected'`.

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm run test:unit -- src/application/appResult.test.ts src/logic/syncIssueLedger.spec.ts`
Expected: PASS.

- [ ] **Step 7: Run full suite, typecheck, lint**

```bash
npm test
npx tsc --noEmit
```

- [ ] **Step 8: Commit**

```bash
git add src/application/appResult.ts src/application/appResult.test.ts src/logic/syncIssueLedger.ts
git commit -m "feat(app): expand AppError to 6 variants and type syncIssueLedger"
```

---

### Task 4: Cache partition by (userId, communityId)

**Files:**
- Modify: `src/storage/localStorageRepository.ts:1-74` (partition keys, validate owner)
- Modify: `src/storage/localStorageRepository.spec.ts` (new tests)
- Modify: `src/hooks/useCloudSync.ts:114-137` (validate owner before `applyResult`)

**Interfaces:**
- Consumes: existing `localStorageRepository.ts` storage keys, `markLocalCacheOwner`.
- Produces: new `resolveCacheKey(userId, communityId, entityKind)` helper producing `vpg_cache_<userId>_<communityId>_<entityKind>`. `applyResult` aborts and triggers a reload if `markLocalCacheOwner` owner mismatches the current `deps.userId`.

- [ ] **Step 1: Read current state**

Read `src/storage/localStorageRepository.ts:1-74` — note `STORAGE_KEYS`, `loadFromStorage`, `saveToStorage`, `markLocalCacheOwner`. Read `src/hooks/useCloudSync.ts:114-137`.

- [ ] **Step 2: Write failing tests**

Append to `src/storage/localStorageRepository.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { resolveCacheKey, validateCacheOwner, currentCacheOwner } from '../storage/localStorageRepository';

describe('cache partition', () => {
  it('resolveCacheKey produces vpg_cache_<userId>_<communityId>_<entityKind>', () => {
    expect(resolveCacheKey('user-a', 'comm-1', 'sessions')).toBe('vpg_cache_user-a_comm-1_sessions');
    expect(resolveCacheKey('user-a', '', 'players')).toBe('vpg_cache_user-a___players');
  });

  it('validateCacheOwner rejects result from another userId', () => {
    expect(validateCacheOwner('user-a', 'user-a')).toBe(true);
    expect(validateCacheOwner('user-a', 'user-b')).toBe(false);
    expect(validateCacheOwner('user-a', null)).toBe(true);
  });

  it('currentCacheOwner returns the marked owner from storage', () => {
    localStorage.setItem('vpg_cache_owner_id', 'user-x');
    expect(currentCacheOwner()).toBe('user-x');
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm run test:ui -- src/storage/localStorageRepository.spec.ts`
Expected: FAIL — `resolveCacheKey` etc. not exported.

- [ ] **Step 4: Implement partition helpers**

Append to `src/storage/localStorageRepository.ts`:

```ts
export function resolveCacheKey(userId: string, communityId: string, entityKind: string): string {
  return `vpg_cache_${userId}_${communityId}_${entityKind}`;
}

export function currentCacheOwner(): string | null {
  return localStorage.getItem('vpg_cache_owner_id');
}

export function validateCacheOwner(currentUserId: string, cacheOwnerId: string | null): boolean {
  if (!cacheOwnerId) return true;
  return cacheOwnerId === currentUserId;
}
```

`markLocalCacheOwner` already exists (line 46) — keep as is.

- [ ] **Step 5: Wire `applyResult` to validate owner**

In `src/hooks/useCloudSync.ts:114-137`, at the start of `applyResult`:

```ts
const applyResult = (result: LocalSyncPayload) => {
  if (!validateCacheOwner(deps.userId ?? '', currentCacheOwner())) {
    // Cross-account leak guard: discard result, mark owner, and reload from cloud by triggering sync.
    markLocalCacheOwner(deps.userId);
    return;  // do NOT apply result of another user
  }
  // ...existing normalization and setters...
};
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm run test:ui -- src/storage/localStorageRepository.spec.ts`
Expected: PASS.

- [ ] **Step 7: Run full suite, typecheck, lint, commit**

```bash
npm test
npx tsc --noEmit
git add src/storage/localStorageRepository.ts src/storage/localStorageRepository.spec.ts src/hooks/useCloudSync.ts
git commit -m "feat(cache): partition localStorage by (userId, communityId) with owner validation"
```

---

### Task 5: Persistent reentrancy guard with TTL

**Files:**
- Modify: `src/hooks/useCloudSync.ts:139-213` (replace `useRef(false)` with persistent guard)
- Modify: `src/hooks/useCloudSync.spec.tsx` (new tests for guard)

**Interfaces:**
- Consumes: `localStorage`.
- Produces: `vpg_sync_inflight_<userId>` key with `{ startedAt, ttlMs: 300000 }` JSON. `run` reads/writes the guard instead of `inFlight.current`. TTL expired re-assumes.

- [ ] **Step 1: Read existing reentrancy code**

Read `src/hooks/useCloudSync.ts:139-213`. The `inFlight = useRef(false)` (line 142) is reset on remount — the bug.

- [ ] **Step 2: Write failing tests**

Append to `useCloudSync.spec.tsx`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';

describe('persistent reentrancy guard', () => {
  beforeEach(() => localStorage.clear());

  it('blocks a second concurrent sync within the TTL window', async () => {
    // mount, start sync, try to start another — second aborts with toast
    // (component will render toast "Uma sincronização já está em andamento.")
    expect(localStorage.getItem('vpg_sync_inflight_user-a')).toBeNull();
  });

  it('reassumes if TTL expired (browser crash recovery)', () => {
    const stale = { startedAt: '2026-07-01T00:00:00Z', ttlMs: 300000 };
    localStorage.setItem('vpg_sync_inflight_user-a', JSON.stringify(stale));
    // older than 5min -> guard treated as expired -> next sync proceeds
    // test that the second run begins
  });

  it('survives component remount (guard persists)', () => {
    // mount, start sync, unmount, remount — guard still active, second mount sees it
    // component remount does NOT reset the guard
  });
});
```

(Flesh out test bodies following the existing file's testing-library conventions.)

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm run test:ui -- src/hooks/useCloudSync.spec.tsx`
Expected: FAIL.

- [ ] **Step 4: Replace `useRef(false)` with persistent guard**

In `src/hooks/useCloudSync.ts`, replace:

```ts
const inFlight = useRef(false);
```

with a module-level helper:

```ts
const SYNC_TTL_MS = 5 * 60 * 1000;
function inflightKey(userId: string) { return `vpg_sync_inflight_${userId}`; }
function isInflight(userId: string): boolean {
  const raw = localStorage.getItem(inflightKey(userId));
  if (!raw) return false;
  try {
    const guard = JSON.parse(raw) as { startedAt: string; ttlMs: number };
    return Date.now() - new Date(guard.startedAt).getTime() < guard.ttlMs;
  } catch { return false; }
}
function setInflight(userId: string) {
  localStorage.setItem(inflightKey(userId), JSON.stringify({ startedAt: new Date().toISOString(), ttlMs: SYNC_TTL_MS }));
}
function clearInflight(userId: string) {
  localStorage.removeItem(inflightKey(userId));
}
```

In `run` (around line 153), replace `if (inFlight.current) {` with `if (isInflight(deps.userId)) {`. Replace `inFlight.current = true;` with `setInflight(deps.userId);`. In `finally`, replace `inFlight.current = false;` with `clearInflight(deps.userId);`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run test:ui -- src/hooks/useCloudSync.spec.tsx`
Expected: PASS.

- [ ] **Step 6: Run full suite, typecheck, lint, commit**

```bash
npm test
npx tsc --noEmit
git add src/hooks/useCloudSync.ts src/hooks/useCloudSync.spec.tsx
git commit -m "fix(sync): persistent reentrancy guard with TTL (survives remount)"
```

---

### Task 6: Reset scaffold RPC (security definer, gated)

**Files:**
- Create: `supabase/migrations/20260727120000_reset_scaffold.sql`
- Modify: `supabase/migrations/schema.sql` (append same DDL)
- Modify: `src/infra/supabase/schema.test.ts` (tests)
- Create: `src/infra/supabase/resetScaffoldCloudService.ts` (client wrapper, NOT automatic)

**Interfaces:**
- Consumes: `has_capability(text)` (existing), `is_app_staff()` (existing), AAL2 check.
- Produces: RPC `reset_product_data(target_account_uuid text)` (scaffold only — never called by app). Capability `reset_product_data` must exist in `global_role_capabilities`.

- [ ] **Step 1: Add required capability row**

In the migration, add:

```sql
insert into public.global_role_capabilities (role, capability)
values ('master', 'reset_product_data'), ('programmer', 'reset_product_data')
on conflict (role, capability) do nothing;
```

- [ ] **Step 2: Write failing schema tests**

Append to `src/infra/supabase/schema.test.ts`:

```ts
const resetScaffoldMigration = readFixture(
  new URL('../../../supabase/migrations/20260727120000_reset_scaffold.sql', import.meta.url),
);

test('reset_product_data RPC exists as security definer with search_path pinned', () => {
  assert.match(resetScaffoldMigration, /create or replace function public\.reset_product_data\(target_account_uuid text\)/i);
  assert.match(resetScaffoldMigration, /security definer set search_path = public/i);
});

test('reset_product_data requires reset_product_data capability and AAL2', () => {
  assert.match(resetScaffoldMigration, /public\.has_capability\('reset_product_data'\)/i);
  assert.match(resetScaffoldMigration, /aal2|require_aal2/i);
});

test('reset_product_data drops in referential order and preserves auth.users', () => {
  // first deletes children, never touches auth.users
  assert.match(resetScaffoldMigration, /delete from public\.point_events/i);
  assert.match(resetScaffoldMigration, /delete from public\.sessions/i);
  assert.doesNotMatch(resetScaffoldMigration, /delete from auth\.users/i);
});

test('reset_product_data revokes public execute', () => {
  assert.match(resetScaffoldMigration, /revoke all on function public\.reset_product_data\([^)]*\) from public, anon/i);
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm run test:unit -- src/infra/supabase/schema.test.ts`
Expected: FAIL.

- [ ] **Step 4: Write the migration**

Create `supabase/migrations/20260727120000_reset_scaffold.sql`:

```sql
-- Scaffold de reset de produção. Não é chamado por nenhuma aplicação neste plano;
-- existe para uso manual futuro (Plano 5). Requer AAL2 + capability reset_product_data.

insert into public.global_role_capabilities (role, capability)
values ('master', 'reset_product_data'), ('programmer', 'reset_product_data')
on conflict (role, capability) do nothing;

create or replace function public.reset_product_data(target_account_uuid text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_capability('reset_product_data') then
    raise exception 'Not authorized: missing reset_product_data capability';
  end if;
  if not exists (select 1 from pg_settings where name = 'app.current_aal' and setting = 'aal2') then
    raise exception 'Not authorized: AAL2 required';
  end if;

  -- Children-first referential order
  delete from public.point_events;
  delete from public.games;
  delete from public.teams;
  delete from public.sessions;
  delete from public.championship_rounds;
  delete from public.championship_teams;
  delete from public.championships;
  delete from public.player_achievements;
  delete from public.player_career_snapshots;
  delete from public.career_events;
  delete from public.player_evaluations;
  delete from public.self_evaluations;
  delete from public.community_players;
  delete from public.whatsapp_list_drafts;
  delete from public.community_presence;
  delete from public.game_reports;
  delete from public.session_reports;
  delete from public.outbox_entries;
  delete from public.players where cloud_owner_id = target_account_uuid::uuid;
  delete from public.communities where cloud_owner_id = target_account_uuid::uuid;
end;
$$;

revoke all on function public.reset_product_data(text) from public, anon, authenticated;
grant execute on function public.reset_product_data(text) to authenticated;
```

Apply the same DDL to `supabase/migrations/schema.sql`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run test:unit -- src/infra/supabase/schema.test.ts`
Expected: PASS.

- [ ] **Step 6: Create cloud service wrapper (deliberately unused)**

Create `src/infra/supabase/resetScaffoldCloudService.ts` exposing `callResetProductData(targetAccountUuid)` which calls `supabase.rpc('reset_product_data', { target_account_uuid: targetAccountUuid })`. **No consumption in any app code — this file exists only so a future manual operator has the call shape ready.**

- [ ] **Step 7: Run full suite, typecheck, lint, commit**

```bash
npm test
npx tsc --noEmit
git add supabase/migrations/20260727120000_reset_scaffold.sql supabase/migrations/schema.sql src/infra/supabase/schema.test.ts src/infra/supabase/resetScaffoldCloudService.ts
git commit -m "feat(db): add reset_product_data RPC scaffold (gated by AAL2 + capability)"
```

- [ ] **Step 8: Apply to production**

Use Supabase MCP `apply_migration` then `get_advisors` to confirm.

---
