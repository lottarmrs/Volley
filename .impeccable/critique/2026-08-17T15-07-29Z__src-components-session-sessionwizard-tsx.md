---
timestamp: 2026-08-17T15-07-29Z
slug: src-components-session-sessionwizard-tsx
---
# Critique: src/components/session/SessionWizard.tsx

Method: degraded (single-context: no parallel sub-agent tool exposed)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Clear step progress stepper |
| 2 | Match System / Real World | 3 | Volleyball domain language (5x1, 6x0, vai a 2) |
| 3 | User Control and Freedom | 3 | Step back and reset functionality intact |
| 4 | Consistency and Standards | 3 | Cohesive dark mode theme and typography |
| 5 | Error Prevention | 3 | Validation warnings for roster sizes |
| 6 | Recognition Rather Than Recall | 2 | Constraint rules lack inline lock previews |
| 7 | Flexibility and Efficiency | 3 | Touch Click-to-Move & Desktop Drag-and-Drop |
| 8 | Aesthetic and Minimalist Design | 2 | High visual density on Step 1 filter controls |
| 9 | Error Recovery | 3 | Helpful validation error banners |
| 10 | Help and Documentation | 2 | Missing inline explainer for 5x1 setter balancing |
| **Total** | | **27/40** | **Acceptable** |

## Design Specificity Verdict
- **LLM Assessment**: Dedicated volleyball session setup wizard with 5x1/6x0 rotation support and team balancing.
- **Deterministic Scan**: 0 defects detected (`detect.mjs`).

## Priority Issues
- **[P2] Step 1 Filter Overload**: Consolidate 5 filter controls into a clean search & filter drawer.
- **[P2] Native Alert Popups on Swap Violations**: Replace `alert()` with inline toast notifications.
- **[P3] Rotation Cues**: Add inline info pills explaining 5x1 vs 6x0 setter rules.
