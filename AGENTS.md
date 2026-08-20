# AGENTS.md — Panelinha Team Balancer

## Commands

| Task | Command |
|------|---------|
| Dev server | `npm run dev` (port 3000, 0.0.0.0) |
| Type check | `npm run lint` (alias: `npm run typecheck` — both are `tsc --noEmit`) |
| ESLint | `npm run lint:eslint` |
| Format check | `npm run format:check` |
| Format write | `npm run format` |
| All tests | `npm test` (runs `test:unit` + `test:ui` in sequence) |
| Unit tests only | `npm run test:unit` (Node test runner + tsx → `src/**/*.test.ts`) |
| UI tests only | `npm run test:ui` (Vitest + jsdom + RTL → `src/**/*.spec.{ts,tsx}`) |
| Production build | `npm run build` (Vite, outputs to `dist/`) |

**CI verification order:** `typecheck → lint:eslint → format:check → test → build`.

## Node Version

Node >= 20 (22 recommended — see `.nvmrc`). Node < 20.6 fails: Vite 6 + `node --import tsx` both require >= 20.6. Run `nvm use` if anything errors.

## Two Test Runners (Do Not Confuse)

- **`test:unit`** — Node's built-in test runner + tsx. Glob: `src/**/*.test.ts`. Pure-logic/domain/application tests, zero DOM.
- **`test:ui`** — Vitest with jsdom. Glob: `src/**/*.spec.{ts,tsx}`. Hook/component tests using Testing Library. Config: `vitest.config.ts`. `globals: true` is required so RTL auto-cleanup runs in `afterEach`.
- File naming enforced by glob patterns: `.test.ts` for unit, `.spec.ts(x)` for UI. Create a `.spec` for hooks/components, a `.test` for logic/use-cases.

## Architecture

Local-first React 19 + Vite 6 app. Optional Supabase sync (disabled by default; requires `.env`). All data persists to `localStorage` unless cloud sync is configured.

### Vertical slice structure (enforced via `tsconfig.json` + `vite.config.ts` path aliases)

| Alias | Directory | Purpose |
|-------|-----------|---------|
| `@domain/*` | `src/domain/` | Pure domain logic (permissions, session setup) |
| `@logic/*` | `src/logic/` | Business logic (balancing, calculations, sync, migrations) |
| `@app/*` | `src/application/` | Use cases & view models (orchestrate domain <→ infra/hooks) |
| `@infra/*` | `src/infra/` | Supabase cloud services & auth client |
| `@hooks/*` | `src/hooks/` | React hooks wrapping state + domain logic |
| `@ui/*` | `src/ui/` | Shared UI primitives |
| `@storage/*` | `src/storage/` | `localStorage` repository |
| `@shared/types` | `src/types.ts` | Barrel re-export from `src/shared/types/` |
| `@shared/types/*` | `src/shared/types/` | Type definitions (player, session, community, sync) |

`src/components/` — page-level view components (dashboard, player, session, community, etc).
`src/app/` — router + auth guards/pages.
`src/constants.ts` — position weights, initial demo players, tooltip text.

**All types flow through `src/types.ts`** which re-exports from `src/shared/types/`. Import from `@shared/types` or relative `../types`, not directly from `src/shared/types/*` unless you need a non-exported member.

### Entry flow

`src/main.tsx` → BrowserRouter → AuthSessionProvider → AppRouter → AuthGuard → `App.tsx` (legacy monolithic shell, currently being refactored into routed views).

`App.tsx` is the primary state orchestrator — it wires hooks (`usePlayers`, `useSessions`, etc.), cloud sync, and navigation, then renders the current module via `renderActiveContent()`. Application use cases in `src/application/` are pure functions that domain logic/state changes flow through (they return `{ ok, value }` or `{ ok: false, ... }` results — see `appResult.ts`).

### Team balancer

The balancing algorithm runs in a Web Worker: `src/logic/balancer.worker.ts`. Messages are exchanged via `balancerMessages.ts`. `balancing.ts` coordinates worker spawning and result handling.

## Supabase

Optional. Without `.env`, app runs in local mode (console warning, cloud features disabled).

### Migrations

All migrations in `supabase/migrations/` must be applied in chronological filename order for cloud features to work. Running only `schema.sql` leaves RBAC, join requests, player linking, avatar approval, and sync incomplete. New Supabase projects may need Data API exposure confirmation even when SQL grants are correct.

Sensitive membership mutations use RPCs (`set_community_member_role`, `remove_community_member`), not direct table update/delete from the browser. Migrations use RLS, `SECURITY DEFINER` with `set search_path = public`, grants to `authenticated`, and revokes for `public/anon`.

### Cloud services

`src/infra/supabase/` has individual cloud services per entity (accountCloudService, careerCloudService, championshipCloudService, communityCloudService, etc.) and a `syncService.ts` that orchestrates them. `authClient.ts` provides the shared Supabase client and auth methods.

### Optional data backfill

`scripts/backfill-global-from-backup.ts` — standalone utility for backfilling global state from a backup JSON. Not part of the app; invoked independently.

## Conventions

### Code style

- Prettier: single quotes, 100 char print width (`.prettierrc`).
- TypeScript has `strictNullChecks: true` but NOT `strict: true` — permissive compiler.
- Imports use aliases (`@app`, `@domain`, etc.) configured in both `tsconfig.json` and `vite.config.ts`/`vitest.config.ts` — keep all three in sync if adding a new alias.
- No comments in source unless asked.
- UI language is Portuguese (pt-BR): labels, toast messages, error text, domain model fields (`nome`, `apelido`, `genero`, `posicaoPrincipal`, `saque`, `recepcao`...).
- App is `"type": "module"` (ESM).

### ESLint

Two config files exist: `eslint.config.js` (active) and `eslint.config.mjs` (stub using `strictTypeChecked`, not picked up). ESLint resolves `.js` over `.mjs`. The active config covers JS, TS, JSON, Markdown, CSS with React plugin. `lint:eslint` produces ~347 warnings — acceptable, fix only errors.

### `vite.config.ts` specifics

- `DISABLE_HMR=true` disables HMR — use during AI agent edits when file watching causes issues.
- Manual chunks separate react, supabase, motion, and recharts for bundle optimization.

## Known Tech Debt

- `src/logic/migrations.ts` — large file with many `any` casts (compatibility/import layer).
- `src/components/session/SessionWizard.tsx` — large component, candidate for splitting.
- `src/App.tsx` — monolithic shell being refactored toward routed views in `src/app/`.

## Deployment

- Docker: `Dockerfile` (Node 22-alpine build → nginx static serve). `docker-compose.yml` maps port 80.
- Production build goes to `dist/`; nginx config in `nginx.conf` (SPA routing fallback + security headers).
- Vite env vars prefixed with `VITE_` (e.g., `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`).

## Related Docs

- `README.md` — setup, scripts, Supabase migration list, schema overview.
- `HANDOFF.md` — current status, known debt, recommended order of work.
- `GEMINI.md` — coding philosophy guidelines (think before coding, simplicity, surgical changes, goal-driven execution).
- `docs/architecture/domain-model.md` — domain layer definitions and identity model.
- `docs/operations/schema-drift-check.md` — manual procedure for verifying `schema.sql` against production DB.
