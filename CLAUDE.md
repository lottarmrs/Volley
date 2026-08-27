# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Read these too

- **`AGENTS.md`** — the canonical agent guide: full command table, architecture, conventions, tech debt, deployment. This file summarizes; AGENTS.md has the detail.
- **`GEMINI.md`** — coding philosophy (think before coding, simplicity first, surgical changes, goal-driven execution). Follow it.
- **`HANDOFF.md`** — current project status and recommended order of work.
- **`README.md`** — setup, Supabase migration list, schema overview.

## Commands

| Task | Command |
|------|---------|
| Dev server | `npm run dev` (port 3000, 0.0.0.0) |
| Type check | `npm run lint` (= `npm run typecheck`, both `tsc --noEmit`) |
| ESLint | `npm run lint:eslint` |
| Format | `npm run format` / `npm run format:check` |
| All tests | `npm test` (`test:unit` + `test:ui` in sequence) |
| Unit tests | `npm run test:unit` (Node test runner + tsx → `src/**/*.test.ts`) |
| UI tests | `npm run test:ui` (Vitest + jsdom + RTL → `src/**/*.spec.{ts,tsx}`) |
| Build | `npm run build` (Vite → `dist/`) |

**CI verification order:** `typecheck → lint:eslint → format:check → test → build`.

### Running a single test

- Unit (Node runner): `node --import tsx --test src/logic/balancing.test.ts` — pass the file path explicitly.
- UI (Vitest): `npx vitest run src/hooks/useLiveSession.spec.tsx` — pass the file path to `vitest run`.

## Two test runners — do not confuse

Glob patterns enforce naming:

- `.test.ts` → unit tests, Node's built-in runner + tsx, pure logic/domain, **zero DOM**.
- `.spec.ts(x)` → UI tests, Vitest + jsdom + Testing Library. Config in `vitest.config.ts`; `globals: true` is required so RTL auto-cleanup runs in `afterEach`.

## Environment

- **Node ≥ 20** (22 recommended, see `.nvmrc`). Node < 20.6 breaks Vite 6 and `node --import tsx`. Run `nvm use` if anything errors.
- Supabase env (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`) is **optional**. Without `.env` the app runs fully local-first — a console warning is expected and cloud features stay disabled.
- Vite env vars must be prefixed `VITE_`. Set `DISABLE_HMR=true` during AI agent edits if file watching causes issues.

## Architecture

Local-first React 19 + Vite 6 + TypeScript app. All data persists to `localStorage` unless Supabase cloud sync is configured (off by default).

### Vertical slices (path aliases — keep `tsconfig.json`, `vite.config.ts`, `vitest.config.ts` in sync if adding one)

| Alias | Directory | Purpose |
|-------|-----------|---------|
| `@domain/*` | `src/domain/` | Pure domain logic (permissions, session setup) |
| `@logic/*` | `src/logic/` | Business logic (balancing, calculations, sync, migrations) |
| `@app/*` | `src/application/` | Use cases & view models — orchestrate domain ↔ infra/hooks |
| `@infra/*` | `src/infra/` | Supabase cloud services & auth client |
| `@hooks/*` | `src/hooks/` | React hooks wrapping state + domain logic |
| `@ui/*` | `src/ui/` | Shared UI primitives |
| `@storage/*` | `src/storage/` | `localStorage` repository |
| `@shared/types` | `src/types.ts` | Barrel re-export from `src/shared/types/` |
| `@shared/types/*` | `src/shared/types/` | Type definitions |

**All types flow through `src/types.ts`** (re-exports `src/shared/types/`). Import from `@shared/types` or relative `../types`, not deep into `src/shared/types/*` except for non-exported members.

`src/components/` holds page-level view components; `src/app/` holds router + auth guards/pages; `src/constants.ts` holds position weights, demo players, tooltip text.

### Entry flow

`src/main.tsx` → BrowserRouter → AuthSessionProvider → AppRouter → AuthGuard → `App.tsx`.

`App.tsx` is the primary state orchestrator — wires hooks (`usePlayers`, `useSessions`, …), cloud sync, and navigation, then renders the active module. It is a monolithic shell being refactored toward routed views in `src/app/`.

### Application layer result type

Use cases in `src/application/` are pure functions returning `AppResult<T>` (`src/application/appResult.ts`): `{ ok: true, value, issues? }` or `{ ok: false, error }` where `error` is a discriminated `AppError` (kinds: `product`, `technical`, `validation`, `authorization`, `conflict`, `offline_unavailable`, `unexpected`). Construct errors via the helpers (`productError`, `validationError`, `authorizationError`, `conflictError`, `offlineError`, `unexpectedError`). State changes and domain logic flow through these use cases — don't bypass with raw throws.

### Team balancer

The balancing algorithm runs in a Web Worker: `src/logic/balancer.worker.ts`, messages via `balancerMessages.ts`, coordinated by `balancing.ts`.

### Architecture tests

`src/architecture/importAliases.test.ts` enforces boundary placements (e.g. shared UI under `src/ui/common/`, Supabase services under `src/infra/supabase/`). These tests assert file **presence/absence** at specific paths — honor the settled locations when adding code.

## Conventions

- Prettier: single quotes, 100 char width (`.prettierrc`).
- TypeScript: `strictNullChecks: true` but **not** `strict: true` — permissive compiler.
- Imports use aliases (`@app`, `@domain`, …), not deep relative paths.
- **No comments in source unless asked.**
- UI language is Portuguese (pt-BR): labels, toasts, errors, and domain model fields (`nome`, `apelido`, `genero`, `posicaoPrincipal`, `saque`, `recepcao`…).
- App is `"type": "module"` (ESM).

### ESLint quirks

Two config files exist: `eslint.config.js` (active) and `eslint.config.mjs` (stub, not picked up — ESLint resolves `.js` over `.mjs`). `lint:eslint` yields ~347 warnings; that's acceptable — **fix only errors**.

## Supabase

Apply **all** migrations in `supabase/migrations/` in chronological filename order. `schema.sql` alone leaves RBAC, join requests, player linking, avatar approval, and sync incomplete. New projects may need Data API exposure confirmation even when SQL grants are correct.

Sensitive membership mutations go through RPCs (`set_community_member_role`, `remove_community_member`), never direct table update/delete from the browser. Migrations use RLS, `SECURITY DEFINER` with `set search_path = public`, grants to `authenticated`, revokes for `public/anon`.

`src/infra/supabase/` holds per-entity cloud services plus `syncService.ts` (orchestrator); `authClient.ts` is the shared client.

## Known tech debt

- `src/logic/migrations.ts` — large, many `any` casts (compat/import layer).
- `src/components/session/SessionWizard.tsx` — large component, split candidate.
- `src/App.tsx` — monolithic shell being refactored toward `src/app/` routed views.
