# E2E Playwright Testing Strategy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a comprehensive, 100% complete E2E test suite using Playwright Test covering all screens, wizards, role-based access controls, and long-running points-based leagues (pontos corridos).

**Architecture:** Playwright Test configured to automatically launch the Vite dev server (`http://localhost:3000`). Local-first data is seeded via custom fixtures that pre-populate `localStorage`, and cloud sync / auth flows are validated through mocked and real authentication states. Test specs are constructed and verified strictly one-by-one.

**Tech Stack:** `@playwright/test` v1.62, TypeScript, React 19, Vite 6, Supabase auth/sync client.

**Spec:** [`docs/superpowers/specs/2026-08-20-e2e-playwright-strategy-design.md`](file:///c:/Users/Matheus%20Silva/antigravity/Volley/docs/superpowers/specs/2026-08-20-e2e-playwright-strategy-design.md)

## Global Constraints
- All test scripts must run against Node >= 20.6 (`npm run test:e2e`).
- Tests must be organized in the root `e2e/` folder.
- UI text assertions must be in Portuguese (pt-BR) matching existing UI copy.
- Tests must be deterministically isolated and clean `localStorage` before/after execution.

---

## File Structure & Dependencies

```
playwright.config.ts                     -> Playwright configuration (webServer, browsers, baseURL)
package.json                             -> Adds "test:e2e" and "test:e2e:ui" scripts
e2e/
  fixtures/
    auth.ts                              -> User auth state & role fixtures
    seed.ts                              -> LocalStorage seeding helpers for players, communities, leagues
  01-onboarding.spec.ts                  -> Onboarding & QuickStart test suite
  02-auth-and-account.spec.ts            -> Auth, Profile & Sync test suite
  03-roles-and-permissions.spec.ts      -> Complete Roles & Permission Matrix test suite
  04-player-management.spec.ts          -> Player Roster, Ratings & Guests test suite
  05-session-wizard.spec.ts              -> Session Setup, Worker Balancing & Drafts test suite
  06-live-session.spec.ts                -> Live Scoring, PointModal & Substitutions test suite
  07-community-management.spec.ts        -> Community Creation, Join Code & Rules test suite
  08-championship-and-tournament.spec.ts -> Long-running Points League, Standings, Rounds & Awards test suite
  09-ranking-and-history.spec.ts         -> Long-term Ranking, FutCards & Session Reports test suite
  10-settings-and-sync.spec.ts           -> Admin Panel, Backup JSON Import/Export & Sync Conflicts test suite
```

---

### Task 1: Playwright Setup & Test Fixtures

**Files:**
- Create: `playwright.config.ts`
- Create: `e2e/fixtures/auth.ts`
- Create: `e2e/fixtures/seed.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `@playwright/test`
- Produces: `test` fixture with pre-configured auth states and `seedLocalStorage` helper.

- [ ] **Step 1: Create `playwright.config.ts`**

```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
```

- [ ] **Step 2: Create `e2e/fixtures/seed.ts` and `e2e/fixtures/auth.ts`**

Create seed helper for setting up `localStorage` keys (`panelinha_players`, `panelinha_communities`, `panelinha_sessions`, `panelinha_championships`, `panelinha_active_user`).

- [ ] **Step 3: Update `package.json` with e2e scripts**

Add `"test:e2e": "playwright test"` and `"test:e2e:ui": "playwright test --ui"` to `package.json`.

- [ ] **Step 4: Run smoke test command to verify setup**

Run: `npx playwright test --help`  
Expected: Output showing Playwright CLI options without syntax error.

---

### Task 2: `e2e/01-onboarding.spec.ts` (QuickStart & Onboarding)

**Files:**
- Create: `e2e/01-onboarding.spec.ts`

**Interfaces:**
- Consumes: QuickStartView (`/comecar`), `localStorage` cleanup.
- Produces: Verified onboarding flow spec.

- [ ] **Step 1: Write E2E test for empty state redirect to `/comecar`**

Test navigating to `/` with clear storage, verifying auto-redirect to `/comecar`, filling express players form, clicking restore demo players button, and proceeding to the initial balanced session.

- [ ] **Step 2: Run test to verify clean pass**

Run: `npx playwright test e2e/01-onboarding.spec.ts`  
Expected: PASS.

---

### Task 3: `e2e/02-auth-and-account.spec.ts` (Auth, User Profile & Sync)

**Files:**
- Create: `e2e/02-auth-and-account.spec.ts`

**Interfaces:**
- Consumes: UserProfileView (`/perfil`), AccountSyncView (`/perfil/sync`).
- Produces: Verified auth, user profile, backup export/import and cloud sync spec.

- [ ] **Step 1: Write E2E test for profile, backup import/export, and cloud sync status**

Test navigating to `/perfil`, testing login/logout triggers, checking sync status badges (`synced`/`pending`/`error`), clicking backup export button, and simulating JSON file import.

- [ ] **Step 2: Run test to verify clean pass**

Run: `npx playwright test e2e/02-auth-and-account.spec.ts`  
Expected: PASS.

---

### Task 4: `e2e/03-roles-and-permissions.spec.ts` (Roles & Permissions Matrix)

**Files:**
- Create: `e2e/03-roles-and-permissions.spec.ts`

**Interfaces:**
- Consumes: `communityPermissions.ts` domain logic in UI.
- Produces: Verified permission matrix for all 7 user roles (`master`, `programmer`, `owner`, `admin`, `moderator`, `organizador`, `member`).

- [ ] **Step 1: Write E2E test for permission matrix UI visibility**

Seed users with different roles. Assert that:
- `programmer` sees read-only banner and no edit/create buttons.
- `master` & `owner` see all community delete, history clear, rules edit, and member management buttons.
- `admin` sees member management and rules edit, but NOT delete community.
- `moderator` sees member approval and session creation buttons.
- `organizador` sees session creation button only.
- `member` sees only ranking and history tabs.

- [ ] **Step 2: Run test to verify clean pass**

Run: `npx playwright test e2e/03-roles-and-permissions.spec.ts`  
Expected: PASS.

---

### Task 5: `e2e/04-player-management.spec.ts` (Player Roster, Ratings & Guests)

**Files:**
- Create: `e2e/04-player-management.spec.ts`

**Interfaces:**
- Consumes: PlayersView, PlayerEditView, GuestPlayerModal.
- Produces: Verified player CRUD spec.

- [ ] **Step 1: Write E2E test for player creation, ratings, guest modal, filters & deletion**

Test adding a new player with 5-star ratings across skills, assigning a position (e.g., Levantador), using `GuestPlayerModal` to quickly insert a temporary guest, filtering by position, searching by name, and deleting a player with confirmation dialog.

- [ ] **Step 2: Run test to verify clean pass**

Run: `npx playwright test e2e/04-player-management.spec.ts`  
Expected: PASS.

---

### Task 6: `e2e/05-session-wizard.spec.ts` (Session Wizard & Worker Balancing)

**Files:**
- Create: `e2e/05-session-wizard.spec.ts`

**Interfaces:**
- Consumes: SessionWizard component, Web Worker balancing.
- Produces: Verified session creation wizard spec.

- [ ] **Step 1: Write E2E test for session wizard 4-step workflow and draft resume/discard**

Test:
- Step 1: Attendance marking (present, absent, guest).
- Step 2: Format selection (Quadra, 6v6).
- Step 3: Triggering Web Worker balancing and verifying generated balanced teams.
- Step 4: Manual drag/move adjustment of players between teams.
- Saving draft, returning to dashboard, resuming draft and discarding draft.

- [ ] **Step 2: Run test to verify clean pass**

Run: `npx playwright test e2e/05-session-wizard.spec.ts`  
Expected: PASS.

---

### Task 7: `e2e/06-live-session.spec.ts` (Live Session Scoring, PointModal & Substitutions)

**Files:**
- Create: `e2e/06-live-session.spec.ts`

**Interfaces:**
- Consumes: SessionActiveView (`/comunidades/:id/sessao/ativa`), PointModal, SessionOwnershipNotice.
- Produces: Verified active game tracking spec.

- [ ] **Step 1: Write E2E test for live game score updates, PointModal skill attribution & MVP completion**

Test scoring points for Team A and Team B, opening `PointModal` to attribute an Ace to a player, recording player substitution mid-match, finishing the session, and selecting the MVP.

- [ ] **Step 2: Run test to verify clean pass**

Run: `npx playwright test e2e/06-live-session.spec.ts`  
Expected: PASS.

---

### Task 8: `e2e/07-community-management.spec.ts` (Community Creation, Join Code & Rules)

**Files:**
- Create: `e2e/07-community-management.spec.ts`

**Interfaces:**
- Consumes: CommunitiesView, CommunityGestaoRoute.
- Produces: Verified community management spec.

- [ ] **Step 1: Write E2E test for creating community, joinCode submission, editing balancing weights, and member role changes**

Test creating a new community with color/icon, entering via `joinCode`, editing custom balancing weights under Rules tab, approving pending member join requests, and changing member roles.

- [ ] **Step 2: Run test to verify clean pass**

Run: `npx playwright test e2e/07-community-management.spec.ts`  
Expected: PASS.

---

### Task 9: `e2e/08-championship-and-tournament.spec.ts` (Points League, Standings, Rounds & Awards)

**Files:**
- Create: `e2e/08-championship-and-tournament.spec.ts`

**Interfaces:**
- Consumes: ChampionshipsHubView, ChampionshipWizardView, ChampionshipDetailView.
- Produces: Verified long-running points league (pontos corridos) spec.

- [ ] **Step 1: Write E2E test for full points-based championship lifecycle**

Test:
- Creating a long-running points league in `ChampionshipWizardView` with custom classification points (3-0=3pts, 3-2=2pts).
- Navigating to `ChampionshipDetailView` Standings tab (`tabela`) to verify points, wins, losses, set balance, and recent form.
- Navigating to Rounds tab (`rodadas`), materializing round games (`materializeChampionshipRound`), and recording match scores.
- Checking Court Lineup tab (`elencos`).
- Checking Awards tab (`premios`) for position leaders (Ace King, Block King, Top Scorer).
- Verifying Governance tab (`governanca`) request approval flow for match reschedule requests.

- [ ] **Step 2: Run test to verify clean pass**

Run: `npx playwright test e2e/08-championship-and-tournament.spec.ts`  
Expected: PASS.

---

### Task 10: `e2e/09-ranking-and-history.spec.ts` (Long-Term Ranking, FutCards & Session Reports)

**Files:**
- Create: `e2e/09-ranking-and-history.spec.ts`

**Interfaces:**
- Consumes: RankingModule, HistoryView.
- Produces: Verified performance ranking and historical reports spec.

- [ ] **Step 1: Write E2E test for ranking filters, athlete statistics cards, and historical session reports**

Test filtering ranking by All, Month, Season, inspecting FutCards stats (win rate, regularity, highlights), viewing past session reports (`sessionReports`), and deleting an old session with confirmation.

- [ ] **Step 2: Run test to verify clean pass**

Run: `npx playwright test e2e/09-ranking-and-history.spec.ts`  
Expected: PASS.

---

### Task 11: `e2e/10-settings-and-sync.spec.ts` (Admin Panel, Sync Conflicts & Full Backup Restoration)

**Files:**
- Create: `e2e/10-settings-and-sync.spec.ts`

**Interfaces:**
- Consumes: GestaoView (`/admin`), SettingsModule (`/configuracoes`), Backup JSON importer.
- Produces: Verified admin management and disaster recovery spec.

- [ ] **Step 1: Write E2E test for global admin user management, theme/settings toggle, and JSON backup restoration**

Test accessing `/admin` as Master role, editing global user profiles, toggling application settings, and importing a full backup JSON payload to verify state restoration across the entire app.

- [ ] **Step 2: Run full E2E test suite across all 10 specs**

Run: `npx playwright test`  
Expected: PASS for all 10 specs.
