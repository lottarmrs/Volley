# AGENTS.md — Panelinha Team Balancer

## Commands

| Task             | Command                                                               |
| ---------------- | --------------------------------------------------------------------- |
| Dev server       | `npm run dev` (port 3000, 0.0.0.0)                                    |
| Type check       | `npm run lint` (alias: `npm run typecheck` — both are `tsc --noEmit`) |
| ESLint           | `npm run lint:eslint`                                                 |
| Format check     | `npm run format:check`                                                |
| Format write     | `npm run format`                                                      |
| All tests        | `npm test` (runs `test:unit` + `test:ui` in sequence)                 |
| Unit tests only  | `npm run test:unit` (Node test runner + tsx → `src/**/*.test.ts`)     |
| UI tests only    | `npm run test:ui` (Vitest + jsdom + RTL → `src/**/*.spec.{ts,tsx}`)   |
| Production build | `npm run build` (Vite, outputs to `dist/`)                            |

**CI verification order:** `typecheck → lint:eslint → format:check → test → build`.

## Node Version

Node >= 20 (22 recommended — see `.nvmrc`). Node < 20.6 fails: Vite 6 + `node --import tsx` both require >= 20.6. Run `nvm use` if anything errors.

## Design Bench (`preview/`)

Every community route sits behind `AuthGuard`, so a screen under `/comunidades`, `/ligas`, `/agenda`
or `/painel` cannot be opened in a browser without an account — and states like loading, read
failure or a locked list never show up on demand even with one. `preview/<screen>.html` +
`preview/<screen>.tsx` mount the real component with fake data, one state per block, and the dev
server serves them at `http://localhost:3100/preview/<screen>.html`.

`vite build` only emits the root `index.html`, so nothing under `preview/` reaches production —
verified against `dist/`. These files are dev-only scaffolding: no auth bypass, no flag, no
production code path. Keep them out of `src/`, and add one whenever a new screen lands.

Today: `inscricao`, `comunidade`, `aovivo`, `convite`, and `wizard`.

A tall screen with many states gets one state per page instead of a stack, chosen by `?i=<n>` —
`preview/wizard.html?i=6`. That is not cosmetic: without it a state that throws blanks the whole
bench and it stops telling you _which_ state broke. The wizard bench found two defects on its first
run this way — a 32px touch target in the athlete filters, and its own incomplete fake model.

## Two Test Runners (Do Not Confuse)

- **`test:unit`** — Node's built-in test runner + tsx. Glob: `src/**/*.test.ts`. Pure-logic/domain/application tests, zero DOM.
- **`test:ui`** — Vitest with jsdom. Glob: `src/**/*.spec.{ts,tsx}`. Hook/component tests using Testing Library. Config: `vitest.config.ts`. `globals: true` is required so RTL auto-cleanup runs in `afterEach`.
- File naming enforced by glob patterns: `.test.ts` for unit, `.spec.ts(x)` for UI. Create a `.spec` for hooks/components, a `.test` for logic/use-cases.

## Architecture

Local-first React 19 + Vite 6 app. Optional Supabase sync (disabled by default; requires `.env`). All data persists to `localStorage` unless cloud sync is configured.

### Vertical slice structure (enforced via `tsconfig.json` + `vite.config.ts` path aliases)

| Alias             | Directory           | Purpose                                                     |
| ----------------- | ------------------- | ----------------------------------------------------------- |
| `@domain/*`       | `src/domain/`       | Pure domain logic (permissions, session setup)              |
| `@logic/*`        | `src/logic/`        | Business logic (balancing, calculations, sync, migrations)  |
| `@app/*`          | `src/application/`  | Use cases & view models (orchestrate domain <→ infra/hooks) |
| `@infra/*`        | `src/infra/`        | Supabase cloud services & auth client                       |
| `@hooks/*`        | `src/hooks/`        | React hooks wrapping state + domain logic                   |
| `@ui/*`           | `src/ui/`           | Shared UI primitives                                        |
| `@storage/*`      | `src/storage/`      | `localStorage` repository                                   |
| `@shared/types`   | `src/types.ts`      | Barrel re-export from `src/shared/types/`                   |
| `@shared/types/*` | `src/shared/types/` | Type definitions (player, session, community, sync)         |

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

## Working Practices

These are how the work gets done here, not suggestions. Each exists because skipping it produced a
defect that reached production or a document that started lying.

**A new screen goes through `/impeccable shape` first.** Before writing the component, not after.
The skill forces the questions that decide the screen — who arrives, in what state, what the empty
and failure cases say — and a screen designed backwards from its markup gets those wrong. It also
loads this project's `PRODUCT.md` and `DESIGN.md`, so the result stays inside the existing visual
world instead of inventing a second one.

**A new screen gets a design bench in the same slice.** See the Design Bench section above. A screen
you have never seen rendered is not finished, and community routes cannot be opened in a browser
without an account.

**Database work is TDD against a real Postgres.** Write the `.dbtest.ts` that fails first, then the
migration. Two payoffs that keep recurring: the test states the intent in the repo's own language,
and a test that goes red on someone else's migration is how a behavioural change announces itself.
Never adjust a failing pre-existing test to make room for a new rule — read what it protects first.
Twice in one day that reading reversed the plan.

**Auditing a flow means writing the questions before the answers.** `docs/JORNADA.md` is the format:
per stage, four families of question — _where did the person come from, what if it is empty, is this
the right moment to ask for this, what happens when it fails_ — each answered with evidence or
marked ❓ unverified. The rule at the top is the whole point: **do not advance past a stage with a
red question open.** Ad-hoc auditing finds what you already suspected; the question bank found that
whoever creates a community could never play in it.

**Verify in production after applying a migration, with a read query.** Applying returns success
long before the data is what you expected. Two of this repo's fixes needed a backfill that only a
count revealed.

**When you fix something, fix the sentence that describes it.** Same commit, not later.

## Traps That Cost Real Time

Each of these was discovered the hard way, with the cost noted so you can judge whether to trust
this list over your instincts.

- **`tsc` does not catch unknown props on React components.** The JSX namespace in this repo is
  degraded, so passing a prop a component does not declare typechecks clean. Specs, not the
  typechecker, protect component prop contracts. Class components are affected worse: `Component`
  generics do not resolve, so `this.props` and `this.state` error — write function components.
- **A Tailwind utility beats a rule in `@layer base`.** The 44px touch floor lives in `@layer base`
  under `@media (pointer: coarse)`, so `sm:min-h-0` or a literal `min-h-[32px]` in a className
  silently cancels it. Measured in the browser, not deduced: 44px without the utility, 0px with it.
  `AF-TOUCH-001` bans the `sm:min-h-*` form; explicit sub-44px pins still exist in four screens.
- **Four independent things gate whether a person can play.** Community membership, a `players` row,
  an `ACTIVE` row in `player_account_links`, and a seat in `community_players`. They look like one
  concept and are not. `join_registration` refuses each with its own message and the same `42501`.
  `jornadaDoZero.dbtest.ts` pins the closed set of functions that can create an account link.
- **Policy does not belong in a shared use case.** `prepareAuthorizedTeamFormation` serves two
  paths — with a registration list and without — so a rule that applies to only one of them breaks
  the other. Gates like that belong at the route. See `drawGateUseCases.ts`.
- **A document that stops being true is worse than no document.** Both the reachability map and the
  roadmap drifted into stating the opposite of reality within days. When you fix something, fix the
  sentence that describes it in the same commit.

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
- `docs/JORNADA.md` — the journey as a question bank: what must be answered before each stage counts
  as done, with ❓ marking what was never verified. Read before planning user-facing work.
- `docs/ROADMAP.md` — routes, journeys and numbered findings, each with evidence.
