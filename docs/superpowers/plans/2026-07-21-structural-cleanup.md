# Structural Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganize Panelinha into clearer application, domain, infrastructure, storage, and UI boundaries without breaking existing behavior.

**Architecture:** Keep the current React/Vite app working while we migrate incrementally. Start with import aliases, then move infrastructure and UI-facing code in small batches, leaving compatibility barrels where needed.

**Tech Stack:** React 19, Vite 6, TypeScript 5.8, Node test runner, Vitest, Supabase client, Prettier.

## Global Constraints

- Keep each change small enough to verify with `npm run lint`, `npm run format:check`, `npm run test:unit`, `npm run test:ui`, and `npm run build`.
- Do not stage unrelated local changes, especially the current `src/storage/localStorageRepository.ts` change.
- Prefer aliases over long relative imports after the alias baseline exists.
- Preserve current UI behavior until the later Experience/UI phase.
- Do not delete legacy docs or files until an import/reference scan proves they are unused.

---

## File Structure

Target shape after the migration:

- `src/app/`: React composition, providers, routing shell, app-level orchestration currently concentrated in `src/App.tsx`.
- `src/application/`: pure use cases and view models. Existing folder remains the main use-case layer during this phase.
- `src/domain/`: pure business rules with no React, browser, Supabase, or localStorage dependencies.
- `src/infra/supabase/`: Supabase gateways/services currently under `src/services/supabase`.
- `src/storage/`: local persistence adapters and browser storage contracts.
- `src/ui/`: UI components currently under `src/components`.
- `src/hooks/`: temporary React orchestration layer; gradually shrink hooks into app-specific adapters.
- `src/shared/`: shared types/constants if and when `src/types.ts` is split.

## Task 1: Add Architectural Import Aliases

**Files:**
- Modify: `tsconfig.json`
- Modify: `vite.config.ts`
- Create: `src/architecture/importAliases.test.ts`

**Interfaces:**
- Produces aliases: `@app/*`, `@domain/*`, `@ui/*`, `@hooks/*`, `@logic/*`, `@services/*`, `@storage/*`, `@shared/types`, `@shared/constants`, `@test/*`.

- [x] **Step 1: Write the failing type-level test**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import type { AppResult } from '@app/appResult';
import type { Session } from '@shared/types';

test('architecture aliases resolve through TypeScript', () => {
  const result: AppResult<Session | null> = { ok: true, value: null, issues: [] };
  assert.equal(result.ok, true);
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npm run lint`
Expected: FAIL with TypeScript unable to resolve `@app/appResult` and `@shared/types`.

- [x] **Step 3: Add aliases**

Update `tsconfig.json` paths:

```json
"@app/*": ["./src/application/*"],
"@domain/*": ["./src/domain/*"],
"@ui/*": ["./src/components/*"],
"@hooks/*": ["./src/hooks/*"],
"@logic/*": ["./src/logic/*"],
"@services/*": ["./src/services/*"],
"@storage/*": ["./src/storage/*"],
"@shared/types": ["./src/types.ts"],
"@shared/constants": ["./src/constants.ts"],
"@test/*": ["./src/test/*"]
```

Update `vite.config.ts` aliases with the same names pointing at absolute paths.

- [x] **Step 4: Run verification**

Run:

```bash
npm run lint
npm run format:check
npm run test:unit
npm run test:ui
npm run build
```

Expected: all pass, with only the known Vite chunk-size warning.

Verified on 2026-07-21:

- `npm run lint`
- `npm run format:check`
- `npm run test:unit` (392 passed)
- `npm run test:ui` (51 passed)
- `npm run build`

- [x] **Step 5: Commit**

```bash
git add tsconfig.json vite.config.ts src/architecture/importAliases.test.ts
git commit -m "refactor(app): adicionar aliases arquiteturais"
git push origin main
```

## Task 2: Create UI Compatibility Alias

**Files:**
- Move gradually from `src/components/*` to `src/ui/*`
- Keep temporary compatibility exports if needed.

**Interfaces:**
- Consumes aliases from Task 1.
- Produces a future home for presentational components: `@ui/...`.

- [x] **Step 1: Pick one low-risk component folder**

Start with `src/components/common` because it has low domain coupling.

- [x] **Step 2: Move files and update imports**

Move:

```text
src/components/common/ToastViewport.tsx -> src/ui/common/ToastViewport.tsx
```

Update imports from `./components/common/ToastViewport` or relative equivalents to `@ui/common/ToastViewport`.

- [x] **Step 3: Verify**

Run:

```bash
npm run lint
npm run format:check
npm run test:unit
npm run test:ui
npm run build
```

Verified on 2026-07-21:

- `npm run lint`
- `npm run format:check`
- `npm run test:unit` (393 passed)
- `npm run test:ui` (51 passed)
- `npm run build`

- [x] **Step 4: Commit**

```bash
git add src/ui/common/ToastViewport.tsx src/components/common/ToastViewport.tsx src/App.tsx tsconfig.json vite.config.ts src/architecture/importAliases.test.ts
git commit -m "refactor(ui): mover common para ui"
```

## Task 3: Move Supabase Services Under Infra

**Files:**
- Move: `src/services/supabase/*` to `src/infra/supabase/*`
- Modify imports in application/hooks/tests.

**Interfaces:**
- Consumes aliases from Task 1.
- Produces canonical infrastructure import root: `@infra/supabase/...` after adding alias in the same task.

- [ ] **Step 1: Add `@infra/*` alias test**

Extend `src/architecture/importAliases.test.ts`:

```ts
import type { LocalSyncPayload } from '@infra/supabase/syncService';
```

Run `npm run lint`; expect missing alias.

- [ ] **Step 2: Add alias and move files**

Add:

```json
"@infra/*": ["./src/infra/*"]
```

Move the Supabase folder and update imports from `../services/supabase/...` to `@infra/supabase/...`.

- [ ] **Step 3: Verify and commit**

Run full verification and commit:

```bash
git add src/infra src/application src/hooks src/logic src/services tsconfig.json vite.config.ts
git commit -m "refactor(infra): mover supabase para infra"
```

## Task 4: Split `src/types.ts` Only After Imports Are Stable

**Files:**
- Modify: `src/types.ts`
- Create: `src/shared/types/*.ts`

**Interfaces:**
- Keep `@shared/types` as the public compatibility surface.

- [ ] **Step 1: Identify type clusters**

Use the graph report god nodes: `Player`, `Team`, `Game`, `Session`, `PointEvent`, `Community`.

- [ ] **Step 2: Split one cluster at a time**

Start with community/member types because they already connect to RBAC and Supabase boundaries.

- [ ] **Step 3: Keep barrel compatibility**

`src/types.ts` should re-export moved types until every import migrates.

- [ ] **Step 4: Verify and commit each cluster**

Run full verification after each cluster.

## Task 5: Remove Defasados Only With Evidence

**Files:**
- Candidate docs: `PLANO_*.md`, `TAREFAS_MULTISET.md`, `GUIA_DE_IMPLEMENTACAO.md`
- Candidate generated folders: `audit-output`, stale graph artifacts only after checking.

**Interfaces:**
- Produces `docs/archive/` for historical documents still useful.

- [ ] **Step 1: Reference scan**

Run:

```bash
rg -n "PLANO_|TAREFAS_MULTISET|GUIA_DE_IMPLEMENTACAO|audit-output" .
```

- [ ] **Step 2: Classify**

Move still-useful historical docs to `docs/archive/`.
Delete only generated artifacts that are reproducible and unreferenced.

- [ ] **Step 3: Verify**

Run:

```bash
npm run lint
npm run format:check
npm run test:unit
npm run test:ui
npm run build
```

## Self-Review

- Spec coverage: covers aliases, app/domain/services/storage/ui separation, and defasado cleanup.
- Placeholder scan: no `TBD`, `TODO`, or vague implementation-only tasks.
- Type consistency: aliases and target folder names match the planned imports.

## Execution Choice

Recommended path: Subagent-Driven for Tasks 2-5. Task 1 is small enough to execute inline immediately.
