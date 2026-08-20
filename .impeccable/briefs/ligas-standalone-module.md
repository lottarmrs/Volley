# Surface Brief: Standalone Championships & Leagues Module

## 1. Job and Audience
- **Visitor Mode:** Operate
- **Audience:** Amateur volleyball group organizers ("chapéus") and team captains managing multi-week round-robin championships and standings.
- **Context:** Administrative court-side or post-game management on mobile/desktop. Fast league creation, reviewing standings, re-scheduling matches between captains, and setting up tactical lineups.

## 2. Outcome and Proof
- **Primary Task:** Create a new league in a structured 5-step wizard, manage team rosters with designated captains, review comprehensive standings (P, J, V, D, PP, PC, SP, %, and recent form badges V/D), visualize team lineups in a 3D perspective volleyball court with 6 positions and reserves, and handle captain-driven match rescheduling requests.
- **Success Criteria:** Cloud-first architecture (Supabase mandatory; clear connection warning if unconfigured), seamless transitions between hub, wizard, and detail view, 100% test coverage, and strict adherence to the "Technical Volleyball Arena" design system.

## 3. Selected Direction
- **Visual Authority:** Inherits [DESIGN.md](file:///c:/Users/Matheus%20Silva/antigravity/Volley/DESIGN.md) — *"The Technical Volleyball Arena"*
- **Focal Moment:** The interactive 3D Perspective Volleyball Court (`VolleyballCourtLineup`) featuring stylized jerseys, captain 'C' badges, and reserve substitution triggers, alongside the comprehensive Standings Table with green/red recent form badges.
- **Layout Topology:** 
  - **Hub (`/ligas`)**: Metrics summary bar → Filter controls (Community dropdown, search, status) → Grid of league cards with quick access.
  - **Wizard (`/ligas/nova`)**: 5-step guided flow (Basic Info → Recurrence & Schedule → Scoring Rules → Team Rosters & Court Lineups → Review & Confirm).
  - **Detail (`/ligas/:id`)**: Sticky Header with league status → Sub-tabs (Classificação, Rodadas & Confrontos, Elencos & Quadra 3D, Premiações & Estatísticas, Governança & Solicitações).

## 4. Scope and Boundaries
- **Primary Target:** `src/app/routes/championshipRoutes.tsx` and components under `src/components/championship/` (`ChampionshipsHubView.tsx`, `ChampionshipWizardView.tsx`, `ChampionshipDetailView.tsx`, `VolleyballCourtLineup.tsx`, `ChampionshipErrorBoundary.tsx`).
- **Touch Limits:** UI presentation, data orchestration via cloud-first services, and dedicated Error Boundary. Preserve local-first architecture for the rest of the application.
- **Explicit Anti-Goals:** Do not store league data in `localStorage` without Supabase sync. Do not expose league management inside non-cloud environments without an explicit connectivity notice.

## 5. States and Ranges
- **League States:**
  - `active`: Matches in progress, standings updated dynamically.
  - `finished`: Final awards, MVP showcase, and champion celebration card.
  - `no_cloud`: Supabase unconfigured warning banner with instructions.
- **Data Ranges:** 2 to 16 teams per league, 6 to 14 players per team roster.

## 6. Interaction and Layout
- **Navigation:** Primary sidebar entry for "Ligas" linking to `/ligas`.
- **Standings Table:** Monospace numerals (`JetBrains Mono`) for P, J, V, D, PP, PC, SP, and %, with colored badges for recent form (`V` green `#16a34a`, `D` red `#dc2626`).
- **Tactical Court:** Interactive court visualizer with net, 3m attack line, and 6 active player slots + horizontal reserve bench.

## 7. Constraints and Language
- **Language:** Portuguese (pt-BR) mandatory for all UI text, labels, and error messages.
- **Design Tokens:** Strict adherence to `DESIGN.md` tokens (`#0b0c0e`, `#14171c`, `#1e222a`, `#2563eb`, `#f97316`).
- **Touch Ergonomics:** All buttons and interactive slots must satisfy `min-height: 44px` on touch screens.
