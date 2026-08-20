# Surface Brief: Tournament & Championship Live Arena

## 1. Job and Audience
- **Visitor Mode:** Operate
- **Audience:** Amateur volleyball group organizers ("chapéus") and tournament referees operating the app on smartphones or tablets court-side.
- **Context:** Loud, outdoor or indoor volleyball court environments under natural sunlight or gym floodlights. Fast-paced action requiring rapid 1-tap scoring, instant set tracking, and clear status feedback.

## 2. Outcome and Proof
- **Primary Task:** Register match points smoothly, monitor set progression/tiebreaks, track current round matches, and view live standings/brackets without losing operational context.
- **Success Criteria:** Zero operational lag, high-contrast touch targets (`min-height: 44px`), tabular score stability with JetBrains Mono, clear visual distinction between system actions (Electric Blue `#2563eb`) and live point events (Volleyball Orange `#f97316`).

## 3. Selected Direction
- **Visual Authority:** Grounded in [DESIGN.md](file:///c:/Users/Matheus%20Silva/antigravity/Volley/DESIGN.md) — *"The Technical Volleyball Arena"*
- **Focal Moment:** The live match score card area (`TeamScoreCard`) with high-contrast score counters, 1-tap point trigger buttons, setter/assist indicator, and set-point status badges.
- **Layout Topology:** Live-first layout hierarchy. Sticky navbar with phase indicator and action bar at top → Live Match Scorecards / Standby banner → Quick Action controls (Undo / Manual Finish) → Tabbed / Collapsible Telemetry (Standings Table, Bracket Visualization, Round Games List, Scorers Ranking).

## 4. Scope and Boundaries
- **Primary Target:** `src/components/live/TournamentActiveView.tsx` and child components (`TeamScoreCard.tsx`, `TournamentBracket.tsx`, `PointModal.tsx`).
- **Touch Limits:** Modify UI layout, state transitions, spacing, typography, and DaisyUI/Tailwind styling. Preserve domain logic, session state hooks, and Supabase cloud sync compatibility.
- **Explicit Anti-Goals:** Do not change domain rules (`derivePhase`, tournament calculations in `src/logic/tournament.ts`), do not break existing test contracts.

## 5. States and Ranges
- **Session States:**
  - `active` / `in_progress`: Current match active with live point buttons enabled.
  - `paused`: Tournament paused alert banner displayed, controls disabled.
  - `waiting_standings`: Match finished or waiting for prior bracket match results.
  - `tournament_complete`: Final standings, MVP showcase, and WhatsApp export cards.
- **Data Ranges:** 2 to 16 teams, 1 to 4 groups, 1 to 5 sets per match.

## 6. Interaction and Layout
- **Navbar:** Sticky dark top bar (`#14171c`) with phase badge (`PHASE_LABEL`), session title, game progress counter (`finished/total`), and quick actions (Edit, Pause/Resume, Exit).
- **Scorecards:** Twin high-contrast team cards (`#14171c`) with team color pill, monospace live set scores (`JetBrains Mono`), set target indicator (e.g., "Até 25 - Vai a 2"), and 1-tap point trigger (`+1 PONTO` in Volleyball Orange `#f97316`).
- **Telemetry Tabs:** Clean tab navigation for switching between:
  1. Classificação (Group A / Group B / Overall Standings)
  2. Chaves / Mata-Mata (Interactive Bracket Stage)
  3. Tabela de Jogos (Scheduled & Finished Games)
  4. Artilharia & Prêmios (MVP & Scorer ranking)

## 7. Constraints and Language
- **Language:** Portuguese (pt-BR) mandatory for all UI text, tooltips, and badges.
- **Design Tokens:** Strict adherence to `DESIGN.md` tokens (`#0b0c0e`, `#14171c`, `#1e222a`, `#2563eb`, `#f97316`).
- **Touch Ergonomics:** All clickable elements in live operational zones must have at least `44px` touch height.
