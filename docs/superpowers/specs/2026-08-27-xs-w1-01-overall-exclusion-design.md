# XS-W1-01 Overall Exclusion Design

## Context

`XS-W1-01` is the first W1 pure-domain correction in C6. The current Team Formation
implementation accepts mutable `Player[]` aggregates and lets derived Overall influence the
objective, initial greedy ordering, placement tie-breaks, option labels, diagnostics, and team
strength snapshots. This violates `GINV-BAL-001` and `ADR-BAL-001`, which make Overall a
display-only projection.

W0 froze the known coupling through `AF-FREEZE-008`. The freeze pins literal Overall
references, the `BalanceWeights` and `TeamMetrics` key sets, and every import into the four
solver modules. This slice deliberately breaks that transitional baseline and replaces it with
target contracts and behavioral evidence.

## Goals

- Make it impossible for canonical Team Formation assignments to depend on Player Overall.
- Give the solver a compact participant-centric input that has no Overall field.
- Send that compact input, rather than `Player[]`, through the Web Worker boundary.
- Preserve current Overall-based presentation only after candidate assignments are fixed.
- Keep Worker and synchronous fallback paths behaviorally equivalent.
- Close the `XS-W1-01` exit gate without closing `OPEN-BAL-001`, `OPEN-BAL-002`, or
  `OPEN-BAL-003`.

## Non-goals

- Do not define the final skill rubric, objective aggregation, or fairness model.
- Do not introduce roster revisions, source-profile versions, persisted snapshots, or server
  authority. Those belong to W5/W6.
- Do not migrate schema or data.
- Do not redesign the Session wizard or remove Overall from player-facing screens.
- Do not change Career/statistics behavior; that is `XS-W1-02`.
- Do not disguise Overall under a neutral name by adding a new aggregate skill score.

## Architectural boundary

The generation flow becomes:

```text
Player[]
  -> legacy input adapter
  -> PlayerBalanceSnapshot[] without Overall
  -> canonical solver or Worker
  -> canonical candidates with fixed assignments
  -> legacy display adapter
  -> Division[] with display-only Overall projections
```

The canonical boundary begins at `PlayerBalanceSnapshot[]`. Code on or beyond that boundary
cannot import Overall calculators, accept an Overall value, or derive a replacement aggregate
whose purpose is to stand in for Overall. Code before the boundary may read the current Player
shape to resolve attributes and positions. Code after candidate selection may calculate Overall
for display, but cannot reorder candidates, alter scores, change assignments, or decide portfolio
membership.

## Canonical input

`PlayerBalanceSnapshot` replaces `AthleteVector` as the solver participant type. The W1 shape is
the minimum compact contract needed by the current algorithm:

```ts
interface PlayerBalanceSnapshot {
  participantId: string;
  attack: number;
  defense: number;
  serve: number;
  reception: number;
  setting: number;
  block: number;
  speed: number;
  stamina: number;
  gameVision: number;
  consistency: number;
  emotionalControl: number;
  heightCm: number | null;
  gender: Gender | null;
  position: string | null;
  secondaryPositions?: string[];
  isInjured: boolean;
  isEstimated: boolean;
}
```

The participant identifier is the roster identity used in assignments and constraints. W1 does
not claim that the snapshot is yet tied to an authoritative `RosterRevision`; W6 adds that
provenance and immutability boundary.

Display name and current form do not cross the Worker boundary because the solver does not need
them. Missing attributes retain the existing explicit resolution rule: the adapter uses the
finite roster mean for each available dimension and otherwise uses the midpoint value `5`.
Missing values never become zero silently.

## Canonical solver changes

`BalanceWeights` and `TeamMetrics` lose their `overall` members. Objective scoring continues to
use the existing explicitly named dimensions and constraints. The slice does not recalibrate or
declare the current temporary weights final.

The initial builder stops sorting athletes or choosing teams by Overall. It uses deterministic,
explicit facts already present in the contract: role buckets, gender buckets, team capacity, and
stable participant identity/team index tie-breaks. It must not introduce an inline sum or weighted
average of attributes as a substitute aggregate. Simulated annealing and the existing
multidimensional scorer remain responsible for improving and ranking feasible candidates.

Canonical diagnostics exclude `overallSpread`. Candidate portfolio selection and final score
ordering use only canonical score, assignment distance, constraints, and the existing
attribute-level diagnostics. Overall cannot select which candidates survive or which candidate is
first.

## Worker contract

`BalanceRequest` carries `snapshots: PlayerBalanceSnapshot[]`, not `players: Player[]`. The
application prepares snapshots once and uses the same request for the Worker and synchronous
fallback. The Worker returns canonical candidates without Overall presentation fields.

Worker failure retains the existing user experience: terminate the failed worker and run the
same canonical request synchronously. The fallback must not rebuild snapshots from a different
Player state or apply a different objective path.

## Compatibility adapters

The input adapter remains the only bridge from the legacy `Player` aggregate to the W1 snapshot.
It applies session position overrides and attribute fallback before the canonical boundary.

The output adapter receives fixed canonical candidates plus the original display context. It
produces the current `Division[]` contract and may add:

- `TeamStrengthSnapshot.overall`;
- `BalanceDiagnostics.overallSpread`;
- the current Overall-oriented option label and explanation;
- display-only form diagnostics that are not part of the canonical score.

These values are calculated after assignments and portfolio membership are fixed. Varying the
Overall projection can change only these presentation fields. It cannot change `playerIds`, score,
penalty, seed, iterations, candidate order, or portfolio membership.

Manual division diagnostic recalculation follows the same split: canonical score and
attribute-level diagnostics come from snapshots; Overall presentation is attached afterward.

## Types and ownership

Canonical candidate and diagnostic types must be distinguishable from the legacy `Division`
presentation contract. The solver owns canonical snapshots, solutions, scores, and canonical
diagnostics. The compatibility adapter owns conversion to `Team`, `Division`, display strength
snapshots, and display-only diagnostics.

`CanonicalBalanceDiagnostics` contains the current attribute, constraint, quality, and warning
fields except `overallSpread` and `formSpread`. `BalanceCandidate` contains a `TeamSolution`,
canonical score and diagnostics, seed, iteration count, and runtime metadata. Neither type owns
`Team`, `Division`, display labels, or strength snapshots.

`src/logic/balancing.ts` remains the canonical core. A new
`src/logic/balancingCompatibility.ts` owns `Player[]` mapping, the public `balanceTeams`
compatibility wrapper, conversion from `BalanceCandidate[]` to `Division[]`, and manual legacy
diagnostic recalculation. Existing callers move their compatibility imports to that module.
The compatibility module prepares snapshots before invoking the canonical solver and attaches
display data only after it returns. It must preserve the candidate order returned by the core.

## Architecture fitness transition

`AF-FREEZE-008` changes from a transitional census of known debt to a target guard for
`GINV-BAL-001`:

- the Overall census baseline for the four solver modules becomes zero;
- `overall` is removed from frozen `BalanceWeights` and `TeamMetrics` keys;
- `OVERALL_SCALE`, `calculateGeneralOverall`, and `calculatePositionOverall` disappear from the
  frozen solver import surface;
- the target snapshot key contract explicitly excludes Overall;
- structural attacks that add an Overall field, import, weight, or team metric must fail;
- Overall remains legal outside the canonical solver as a derived display projection.

The old scale constant is removed from `balancingConstants.ts` if it has no non-solver consumer.

## Verification

The implementation follows red-green-refactor. Tests must prove:

1. `PlayerBalanceSnapshot`, `BalanceWeights`, and canonical `TeamMetrics` contain no Overall key.
2. The four frozen solver modules contain zero Overall references and no Overall-calculation
   imports.
3. Attempts to add an Overall field, objective weight, metric, or import fail the architecture
   guard.
4. Changing only legacy data that changes derived Overall while attributes, positions,
   constraints, config, seed, and work budget stay fixed yields identical candidate fingerprints.
5. Equal snapshots with equal seed and work budget yield identical candidate fingerprints.
6. `BalanceRequest` contains compact snapshots and no `Player[]` payload.
7. Worker and synchronous fallback consume the same prepared snapshot request.
8. Different display Overall projections change only display fields after assignments are fixed.
9. Locked assignments, role composition, roster completeness, portfolio diversity, missing-value
   fallback, and null gender/position regressions remain green.

Verification runs in repository CI order:

```text
npm run typecheck
npm run lint:eslint
npm run format:check
npm test
npm run build
```

`npm run check:architecture` and `npm run test:db` also run before completion. Database tests are
baseline safety evidence only; this slice has no schema phase.

## Exit gate

`XS-W1-01` is complete when no canonical Team Formation path can change an assignment by changing
only Overall, and the claim is supported by both structural exclusion and differential behavior
tests.

Authority change: none. Schema phase: none.
