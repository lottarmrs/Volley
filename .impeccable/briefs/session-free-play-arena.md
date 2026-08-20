# Surface Brief: Live Free-Play Session Arena

## 1. Job and Audience
- **Visitor Mode:** Operate
- **Audience:** Amateur volleyball organizers ("chapéus") running weekly free-play sessions ("peladas de vôlei misto") at court-side.
- **Context:** Fast-moving matches (up to 15 or 25 points), winner-stays rotation rules, rapid team swapping between games, and noisy court environments.

## 2. Outcome and Proof
- **Primary Task:** Score points with 1-tap accuracy, monitor free-play queue rotation, preview the next match-up, reorder queue teams if needed, and export match summaries to WhatsApp.
- **Success Criteria:** Zero operational lag, high-contrast touch controls (`min-height: 44px`), prominent rotation queue status, tabular monospace score display, and clear multi-device ownership status warnings.

## 3. Selected Direction
- **Visual Authority:** Grounded in [DESIGN.md](file:///c:/Users/Matheus%20Silva/antigravity/Volley/DESIGN.md) — *"The Technical Volleyball Arena"*
- **Focal Moment:** The Live Scorecard Pair (`TeamScoreCard`) and the Collapsible Rotation Queue Bar (`Fila de Espera / Próximo Confronto`).
- **Layout Topology:** Sticky Navbar with device control banner → Current Game Header (Game # / Match Point Indicator) → Twin Scorecards (`TeamScoreCard` with `+1 Ponto` in `#f97316`) → Collapsible Rotation Queue & Next Match Preview Bar → Tabbed Telemetry (Event Log, Top Scorers / MVP, Team Stats).

## 4. Scope and Boundaries
- **Primary Target:** `src/components/live/SessionActiveView.tsx` and child components (`TeamScoreCard.tsx`, `PointModal.tsx`).
- **Touch Limits:** Modify layout structure, queue controls, responsiveness, state badges, and DaisyUI styling. Preserve `useLiveSession` hook, domain state orchestration, session ownership heartbeats, and Supabase cloud sync logic.
- **Explicit Anti-Goals:** Do not alter free-play queue rotation math (`logic/match.ts`), do not break multi-device control handling (`sessionOwnershipUseCases.ts`).

## 5. States and Ranges
- **Session Types:** `free_play` (with rotation queue, winner-stays, next match preview).
- **Match States:**
  - `active`: Live scoring enabled, high-contrast `+1 Ponto` active.
  - `finished`: Match outcome card, next match preview, and WhatsApp sharing options.
  - `no_current_game`: Initial state prompting "Começar Primeira Partida".
  - `held_by_other_device`: Session control warning banner with "Tomar Controle" action.
- **Data Ranges:** 2 to 8 teams, 10 to 30 points per game.

## 6. Interaction and Layout
- **Navbar:** Sticky dark top bar (`#14171c`) with session status badge (`Sessão Ativa`), max points indicator (e.g. `Até 25 pts · Vai a 2`), and exit/finish actions.
- **Queue Panel:** A dedicated collapsible card for free-play sessions showing:
  - Próxima Partida (Team A vs Team B) with 1-tap WhatsApp broadcast.
  - Fila de Espera (Ordered list of waiting teams with move UP/DOWN and remove controls).
- **Scorecards:** High-contrast score numerals (`JetBrains Mono`), `+1 PONTO` buttons (`#f97316`), and live player performance ratings.
- **Telemetry Tabs:** Clean tab switcher between:
  1. Eventos da Partida (Real-time point log)
  2. Destaques & Artilharia (MVP parcial, Maestro, Muralha, Top Scorers)
  3. Estatísticas dos Times (Win rates, points for/against)

## 7. Constraints and Language
- **Language:** Portuguese (pt-BR) mandatory for all UI text, badges, and alerts.
- **Design Tokens:** Strict adherence to `DESIGN.md` tokens (`#0b0c0e`, `#14171c`, `#1e222a`, `#2563eb`, `#f97316`).
- **Touch Ergonomics:** All touch targets in court-side controls must have `min-height: 44px`.
