---
target: src/components/dashboard/Dashboard.tsx
total_score: 30
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 1
timestamp: 2026-08-17T17-07-45Z
slug: src-components-dashboard-dashboard-tsx
---
### Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Pulsing live indicator is great, but background sync status is missing |
| 2 | Match System / Real World | 4 | Excellent domain sports terminology in Portuguese |
| 3 | User Control and Freedom | 3 | Discard actions have confirmation popups, but lacks instant undo |
| 4 | Consistency and Standards | 3 | "Ligas & Torneios" card points to 'communities' instead of 'ligas' route |
| 5 | Error Prevention | 3 | Discard requires explicit confirmation |
| 6 | Recognition Rather Than Recall | 4 | Iconography and descriptive copy make all features discoverable |
| 7 | Flexibility and Efficiency | 2 | No keyboard shortcuts for quick navigation |
| 8 | Aesthetic and Minimalist Design | 3 | High dark mode polish, but cards lack dynamic stats |
| 9 | Error Recovery | 3 | Clear phase labels for session recovery |
| 10 | Help and Documentation | 2 | Subtitle mentions Web Worker, but lacks onboarding hints |
| **Total** | | **30/40** | **Good** |

### Design Specificity Verdict
High specificity to volleyball session management. Dark mode gradients, live status indicators, and sports branding create a strong identity. However, routing inconsistencies in the "Ligas & Torneios" card create a navigational trap.

### Priority Issues
- **[P1] Bug / Inconsistent Route for Ligas Card**: Clicking "Ligas & Torneios" dispatches `kind: 'communities'`, misleading users.
- **[P2] Static Module Cards Lack Live Context**: Module cards display generic text instead of real counts (e.g. number of active communities or upcoming matches).
- **[P2] Lack of Keyboard Accelerators**: No hotkeys (`N` for new session, `Space` for live match) for power user organizers.
