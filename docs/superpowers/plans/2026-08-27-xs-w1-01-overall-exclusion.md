# XS-W1-01 Overall Exclusion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove derived Overall from every canonical Team Formation influence path while preserving it as a post-selection display projection.

**Architecture:** A legacy input adapter maps current `Player[]` records to compact `PlayerBalanceSnapshot[]`. `src/logic/balancing.ts` becomes an Overall-free canonical solver that returns `BalanceCandidate[]`; `src/logic/balancingCompatibility.ts` converts those fixed candidates to legacy `Division[]` and attaches Overall presentation afterward. The Worker transports snapshots and canonical candidates, while application code retains the original players only as display context.

**Tech Stack:** TypeScript 5.8, Node test runner with tsx, React 19, Web Workers, Vite 6, architecture fitness tests.

**Spec:** `docs/superpowers/specs/2026-08-27-xs-w1-01-overall-exclusion-design.md`

## Global Constraints

- Overall is absent from canonical solver input, weights, metrics, initialization, objective, candidate ranking, portfolio selection, and canonical diagnostics.
- Overall may be calculated only after candidate assignments and order are fixed.
- No replacement aggregate skill score may be introduced.
- Missing attributes use the finite per-dimension roster mean, or `5` when no finite value exists.
- Worker and synchronous fallback consume the same prepared snapshots.
- `OPEN-BAL-001`, `OPEN-BAL-002`, and `OPEN-BAL-003` remain open.
- Authority change: none.
- Schema phase: none.
- New source code contains no comments.
- UI copy remains pt-BR.

## File Structure

- `src/shared/types/session.ts` owns the canonical snapshot, candidate, solution, metric, and diagnostic contracts plus the legacy display `Division` contract.
- `src/logic/balancing.ts` owns only canonical scoring, deterministic search, feasibility, portfolio selection, and canonical diagnostics.
- `src/logic/balancingCompatibility.ts` owns legacy `Player[]` input mapping, post-selection Overall/form projection, `Division[]` construction, manual diagnostic recalculation, and roster divergence checks.
- `src/logic/balancerMessages.ts` and `src/logic/balancer.worker.ts` own the compact snapshot/candidate transport.
- `src/application/sessionLifecycleUseCases.ts` prepares snapshots once and retains players only as display context.
- `src/hooks/useSessionWizard.ts` sends the prepared request and supplies the same plan to Worker completion or synchronous fallback.
- `src/architecture/legacyExpansionRules.ts`, `legacyExpansionGuard.test.ts`, and `fitnessManifest.ts` own the target structural exclusion contract.

---

### Task 1: Introduce the compact snapshot input adapter

**Files:**

- Create: `src/logic/balancingCompatibility.ts`
- Create: `src/logic/balancingCompatibility.test.ts`
- Modify: `src/shared/types/session.ts:556`
- Modify: `src/types.ts:35`

**Interfaces:**

- Consumes: current `Player`, `Attributes`, and optional `Position` overrides.
- Produces: `PlayerBalanceSnapshot`, `computeAttributeFallback(players)`, `isPlayerEstimated(player)`, `mapPlayerToBalanceSnapshot(player, sessionPosition?, fallback?)`, and `mapPlayersToBalanceSnapshots(players, positionOverrides?)`.

- [ ] **Step 1: Write the failing adapter tests**

Add `src/logic/balancingCompatibility.test.ts` with exhaustive literal expectations. The production mutation these tests catch is copying mutable/display fields or an Overall projection into the canonical payload.

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import type { Attributes, FreePlayConfig, Player } from '../types';
import {
  computeAttributeFallback,
  mapPlayerToBalanceSnapshot,
  mapPlayersToBalanceSnapshots,
} from './balancingCompatibility';

const attributes: Attributes = {
  saque: 6,
  recepcao: 7,
  levantamento: 8,
  ataque: 9,
  bloqueio: 5,
  defesa: 4,
  velocidade: 6,
  resistencia: 7,
  leituraDeJogo: 8,
  regularidade: 9,
  controleEmocional: 5,
};

const player = {
  id: 'player-1',
  nome: 'Ana',
  apelido: 'Aninha',
  genero: 'F',
  posicaoPrincipal: 'ponteiro',
  posicoesSecundarias: ['oposto'],
  alturaCm: 181,
  atributos: attributes,
  formaAtual: { valor: 10 },
  status: { lesionado: true },
} as Player;

const compatibilityConfig: FreePlayConfig = {
  type: 'free_play',
  teamCount: 2,
  maxPoints: 15,
  tieBreakMethod: 'win_by_2',
  rotationSystem: 'winner_stays',
  initialCourtTeams: ['', ''],
  initialQueue: [],
  queuePolicy: 'fifo',
  balanceSpeed: 'fast',
  balanceSeed: 91,
};

test('mapPlayerToBalanceSnapshot emits only canonical participant facts', () => {
  const snapshot = mapPlayerToBalanceSnapshot(player, 'levantador');

  assert.deepEqual(snapshot, {
    participantId: 'player-1',
    attack: 9,
    defense: 4,
    serve: 6,
    reception: 7,
    setting: 8,
    block: 5,
    speed: 6,
    stamina: 7,
    gameVision: 8,
    consistency: 9,
    emotionalControl: 5,
    heightCm: 181,
    gender: 'F',
    position: 'levantador',
    secondaryPositions: ['oposto'],
    isInjured: true,
    isEstimated: false,
  });
  assert.equal('overall' in snapshot, false);
  assert.equal('name' in snapshot, false);
  assert.equal('currentForm' in snapshot, false);
});

test('mapPlayersToBalanceSnapshots resolves missing dimensions before the boundary', () => {
  const unrated = {
    ...player,
    id: 'player-2',
    atributos: {},
    status: {},
  } as Player;

  const fallback = computeAttributeFallback([player, unrated]);
  const snapshots = mapPlayersToBalanceSnapshots([player, unrated], {
    'player-2': 'central',
  });

  assert.equal(fallback.ataque, 9);
  assert.equal(snapshots[1].attack, 9);
  assert.equal(snapshots[1].serve, 6);
  assert.equal(snapshots[1].position, 'central');
  assert.equal(snapshots[1].isEstimated, true);
});
```

- [ ] **Step 2: Run the adapter tests and verify RED**

Run:

```powershell
node --import tsx --test src/logic/balancingCompatibility.test.ts
```

Expected: FAIL because `balancingCompatibility.ts` and `PlayerBalanceSnapshot` do not exist.

- [ ] **Step 3: Add the canonical snapshot type**

Add this readonly contract immediately before the existing `AthleteVector` in `src/shared/types/session.ts`. Leave the existing `AthleteVector` and `TeamSolution` unchanged until Task 2 so the legacy solver remains compilable between commits.

```ts
export interface PlayerBalanceSnapshot {
  readonly participantId: string;
  readonly attack: number;
  readonly defense: number;
  readonly serve: number;
  readonly reception: number;
  readonly setting: number;
  readonly block: number;
  readonly speed: number;
  readonly stamina: number;
  readonly gameVision: number;
  readonly consistency: number;
  readonly emotionalControl: number;
  readonly heightCm: number | null;
  readonly gender: Gender | null;
  readonly position: string | null;
  readonly secondaryPositions?: readonly string[];
  readonly isInjured: boolean;
  readonly isEstimated: boolean;
}

```

Export `PlayerBalanceSnapshot` from `src/types.ts` beside the existing balance types.

- [ ] **Step 4: Implement the input adapter minimally**

Create `src/logic/balancingCompatibility.ts` with these functions. Do not import Overall calculators yet.

```ts
import type { Attributes, Player, PlayerBalanceSnapshot, Position } from '../types';

const ATTRIBUTE_KEYS = [
  'ataque',
  'defesa',
  'saque',
  'recepcao',
  'levantamento',
  'bloqueio',
  'velocidade',
  'resistencia',
  'leituraDeJogo',
  'regularidade',
  'controleEmocional',
] as const;

const MID_SCALE = 5;

export function computeAttributeFallback(players: Player[]): Attributes {
  const fallback = {} as Attributes;
  for (const key of ATTRIBUTE_KEYS) {
    const values = players
      .map((player) => player.atributos?.[key])
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
    fallback[key] = values.length
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : MID_SCALE;
  }
  return fallback;
}

export function isPlayerEstimated(player: Player): boolean {
  return !ATTRIBUTE_KEYS.some((key) => typeof player.atributos?.[key] === 'number');
}

export function mapPlayerToBalanceSnapshot(
  player: Player,
  sessionPosition?: Position,
  fallback?: Attributes,
): PlayerBalanceSnapshot {
  const resolve = (key: (typeof ATTRIBUTE_KEYS)[number]) =>
    player.atributos?.[key] ?? fallback?.[key] ?? MID_SCALE;

  return {
    participantId: player.id,
    attack: resolve('ataque'),
    defense: resolve('defesa'),
    serve: resolve('saque'),
    reception: resolve('recepcao'),
    setting: resolve('levantamento'),
    block: resolve('bloqueio'),
    speed: resolve('velocidade'),
    stamina: resolve('resistencia'),
    gameVision: resolve('leituraDeJogo'),
    consistency: resolve('regularidade'),
    emotionalControl: resolve('controleEmocional'),
    heightCm: player.alturaCm ?? null,
    gender: player.genero ?? null,
    position: sessionPosition ?? player.posicaoPrincipal ?? null,
    secondaryPositions: player.posicoesSecundarias ?? [],
    isInjured: player.status?.lesionado ?? false,
    isEstimated: isPlayerEstimated(player),
  };
}

export function mapPlayersToBalanceSnapshots(
  players: Player[],
  positionOverrides: Partial<Record<string, Position>> = {},
): PlayerBalanceSnapshot[] {
  const fallback = computeAttributeFallback(players);
  return players.map((player) =>
    mapPlayerToBalanceSnapshot(player, positionOverrides[player.id], fallback),
  );
}
```

- [ ] **Step 5: Run the adapter tests and typecheck**

Run:

```powershell
node --import tsx --test src/logic/balancingCompatibility.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit the snapshot boundary**

```powershell
git add -- src/shared/types/session.ts src/types.ts src/logic/balancingCompatibility.ts src/logic/balancingCompatibility.test.ts
git commit -m "feat(domain): add Overall-free balance snapshots"
```

---

### Task 2: Cut over the canonical solver, Worker transport, and target guard atomically

**Files:**

- Modify: `src/shared/types/session.ts:531-647`
- Modify: `src/types.ts:35-71`
- Modify: `src/logic/balancing.ts`
- Modify: `src/logic/balancingConstants.ts`
- Modify: `src/logic/balancingCompatibility.ts`
- Modify: `src/logic/balancingCompatibility.test.ts`
- Create: `src/logic/balancingCanonical.test.ts`
- Modify: `src/logic/balancing.test.ts`
- Modify: `src/application/sessionLifecycleUseCases.ts:1-20`
- Modify: `src/components/session/SessionWizard.tsx:25-33`
- Modify: `src/logic/balancer.worker.ts:1-12`
- Modify: `src/infra/supabase/mappers.test.ts:188`

**Interfaces:**

- Consumes: `PlayerBalanceSnapshot[]`, team count, existing balance config, seed/work profile, constraints, and partnership matrix.
- Produces: `balanceSnapshots(...) => BalanceCandidate[]`, `evaluateTeamSolution(...)`, canonical metrics/diagnostics, `adaptBalanceCandidatesToDivisions(...)`, legacy `balanceTeams(...)`, legacy `recalculateDivisionDiagnostics(...)`, compact Worker messages, application adaptation, and the target `AF-FREEZE-008` contract.

Tasks in this cutover are phases of one reviewer gate. Do not commit between phases: the W0 import freeze is expected to fail after the runtime extraction and becomes green again only when Phase C records the final target surface.

#### Phase A: Canonical solver and display compatibility

- [ ] **Step 1: Write RED tests for canonical behavior and post-selection display**

Create `src/logic/balancingCanonical.test.ts`. The first test catches wall-clock or mutable ordering changing an otherwise identical run. The second catches pair constraints being accepted as soft penalties.

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import type { FreePlayConfig, PlayerBalanceSnapshot } from '../types';
import { balanceSnapshots } from './balancing';

const config: FreePlayConfig = {
  type: 'free_play',
  teamCount: 2,
  maxPoints: 15,
  tieBreakMethod: 'win_by_2',
  rotationSystem: 'winner_stays',
  initialCourtTeams: ['', ''],
  initialQueue: [],
  queuePolicy: 'fifo',
  balanceSpeed: 'fast',
  balanceSeed: 77,
};

function snapshot(participantId: string, attack: number): PlayerBalanceSnapshot {
  return {
    participantId,
    attack,
    defense: 10 - attack,
    serve: 5,
    reception: 5,
    setting: 5,
    block: 5,
    speed: 5,
    stamina: 5,
    gameVision: 5,
    consistency: 5,
    emotionalControl: 5,
    heightCm: 175,
    gender: 'M',
    position: 'ponteiro',
    secondaryPositions: [],
    isInjured: false,
    isEstimated: false,
  };
}

function fingerprints(candidates: ReturnType<typeof balanceSnapshots>): string[] {
  return candidates.map((candidate) =>
    candidate.solution.teams
      .map((team) => team.map((item) => item.participantId).sort().join(','))
      .sort()
      .join('|'),
  );
}

test('balanceSnapshots is deterministic for equal snapshots seed and work profile', () => {
  const snapshots = [snapshot('a', 9), snapshot('b', 8), snapshot('c', 2), snapshot('d', 1)];

  const first = balanceSnapshots(snapshots, 2, config);
  const second = balanceSnapshots(snapshots, 2, config);

  assert.deepEqual(fingerprints(first), fingerprints(second));
  assert.deepEqual(
    first.map(({ score, seed, iterations }) => ({ score, seed, iterations })),
    second.map(({ score, seed, iterations }) => ({ score, seed, iterations })),
  );
});

test('balanceSnapshots never returns a candidate that violates a separated pair', () => {
  const snapshots = [snapshot('a', 9), snapshot('b', 8), snapshot('c', 2), snapshot('d', 1)];
  const candidates = balanceSnapshots(snapshots, 2, {
    ...config,
    balanceConstraints: { pairsSeparated: [['a', 'b']] },
  });

  for (const candidate of candidates) {
    assert.equal(
      candidate.solution.teams.some((team) => {
        const ids = team.map((item) => item.participantId);
        return ids.includes('a') && ids.includes('b');
      }),
      false,
    );
  }
});
```

Append two compatibility tests. The first catches an Overall calculator running before candidate selection. The second catches loss of the current display contract.

```ts
import { balanceSnapshots } from './balancing';
import {
  adaptBalanceCandidatesToDivisions,
  balanceTeams,
  mapPlayersToBalanceSnapshots,
} from './balancingCompatibility';

function divisionFingerprints(divisions: ReturnType<typeof balanceTeams>): string[] {
  return divisions.map((division) =>
    division.teams
      .map((team) => [...team.playerIds].sort().join(','))
      .sort()
      .join('|'),
  );
}

test('changing only derived Overall inputs cannot change candidate assignments', () => {
  const roster = ['a', 'b', 'c', 'd'].map((id, index) => ({
    ...player,
    id,
    atributos: { ...attributes, ataque: index + 4 },
    formaAtual: { valor: 0 },
  })) as Player[];
  const changedForm = roster.map((item, index) => ({
    ...item,
    formaAtual: { valor: index === 0 ? 10 : 0 },
  }));
  const localConfig = { ...compatibilityConfig, teamCount: 2, balanceSeed: 91 };

  const baseline = balanceTeams(roster, 2, 'session-1', localConfig);
  const changed = balanceTeams(changedForm, 2, 'session-1', localConfig);

  assert.deepEqual(divisionFingerprints(changed), divisionFingerprints(baseline));
  assert.notEqual(
    changed[0].teams.find((team) => team.playerIds.includes('a'))?.strengthSnapshot?.overall,
    baseline[0].teams.find((team) => team.playerIds.includes('a'))?.strengthSnapshot?.overall,
  );
});

test('display adaptation preserves assignments and exposes Overall diagnostics afterward', () => {
  const divisions = balanceTeams(
    ['a', 'b', 'c', 'd'].map((id) => ({ ...player, id })) as Player[],
    2,
    'session-1',
    compatibilityConfig,
  );

  assert.equal(typeof divisions[0].diagnostics?.overallSpread, 'number');
  assert.ok(
    divisions[0].teams.every(
      (team) =>
        typeof team.strengthSnapshot?.overall === 'number' &&
        Number.isFinite(team.strengthSnapshot.overall),
    ),
  );
  assert.ok(divisions[0].rawSolution?.teams.flat().every((item) => !('overall' in item)));
});

test('different display projections cannot change fixed candidate assignments or order', () => {
  const roster = ['a', 'b', 'c', 'd'].map((id) => ({ ...player, id })) as Player[];
  const candidates = balanceSnapshots(
    mapPlayersToBalanceSnapshots(roster),
    2,
    compatibilityConfig,
  );
  const low = adaptBalanceCandidatesToDivisions({
    candidates,
    players: roster,
    sessionId: 'session-1',
    config: compatibilityConfig,
    overallProjection: (item) => (item.id === 'a' ? 10 : 20),
  });
  const high = adaptBalanceCandidatesToDivisions({
    candidates,
    players: roster,
    sessionId: 'session-1',
    config: compatibilityConfig,
    overallProjection: (item) => (item.id === 'a' ? 90 : 20),
  });

  assert.deepEqual(divisionFingerprints(high), divisionFingerprints(low));
  assert.deepEqual(
    high.map(({ score, seed, iterations }) => ({ score, seed, iterations })),
    low.map(({ score, seed, iterations }) => ({ score, seed, iterations })),
  );
  assert.notEqual(
    high[0].teams.find((team) => team.playerIds.includes('a'))?.strengthSnapshot?.overall,
    low[0].teams.find((team) => team.playerIds.includes('a'))?.strengthSnapshot?.overall,
  );
});
```

- [ ] **Step 2: Run the new tests and verify RED**

Run:

```powershell
node --import tsx --test src/logic/balancingCanonical.test.ts src/logic/balancingCompatibility.test.ts
```

Expected: FAIL because `balanceSnapshots` and the compatibility wrapper do not exist in the required form.

- [ ] **Step 3: Replace the legacy balance types with canonical and display types**

In `src/shared/types/session.ts`, delete the legacy `AthleteVector` interface, remove `overall` from `BalanceWeights`, remove `overall` and `averageForm` from `TeamMetrics`, and replace the solution/diagnostic types with:

```ts
export interface TeamSolution {
  teams: PlayerBalanceSnapshot[][];
}

export type BalanceQuality = 'EXCELLENT' | 'GOOD' | 'ACCEPTABLE' | 'UNBALANCED';

export interface CanonicalBalanceDiagnostics {
  objectiveScore: number;
  qualityLabel: BalanceQuality;
  attackSpread: number;
  defenseSpread: number;
  settingSpread: number;
  blockSpread: number;
  receptionSpread: number;
  heightSpread: number;
  genderBalancePenalty: number;
  genderSpread: number;
  injuredPenalty: number;
  injuredSpread: number;
  roleCoveragePenalty: number;
  teamSizePenalty: number;
  warnings: string[];
}

export interface BalanceCandidate {
  solution: TeamSolution;
  score: number;
  diagnostics: CanonicalBalanceDiagnostics;
  algorithm: string;
  seed: number;
  iterations: number;
  runtimeMillis: number;
}

export interface BalanceDiagnostics extends CanonicalBalanceDiagnostics {
  overallSpread: number;
  formSpread: number;
}
```

Export `BalanceCandidate`, `CanonicalBalanceDiagnostics`, and `PlayerBalanceSnapshot` from `src/types.ts`; remove `AthleteVector`.

Change the mapper fixture at `src/infra/supabase/mappers.test.ts:188` from `balanceWeights: { overall: 2 }` to `balanceWeights: { attack: 2 }`, preserving the passthrough behavior without retaining a forbidden canonical weight.

- [ ] **Step 4: Make `balancing.ts` the canonical core**

Perform these exact mechanical replacements throughout `src/logic/balancing.ts`:

```text
AthleteVector -> PlayerBalanceSnapshot
a.id / player.id / p.id inside canonical solutions -> participantId
BalanceDiagnostics return from canonical builder -> CanonicalBalanceDiagnostics
Division candidate arrays -> BalanceCandidate arrays
rawSolution -> solution on BalanceCandidate
```

Delete all `Player`, `Division`, `Team`, `TeamStrengthSnapshot`, `Attributes`, `Position`, Overall calculator, `OVERALL_SCALE`, and `generateUUID` imports. Delete `ATTRIBUTE_KEYS`, `MID_SCALE`, `computeAttributeFallback`, `hasAnyAttribute`, `isPlayerEstimated`, `mapPlayerToAthleteVector`, and `adjustedOverall` from this module.

Remove `overall` from all four `MODE_WEIGHTS` objects. Remove Overall calculation and addition from `ObjectiveScorer.score`. Remove Overall and form calculations/warnings/return fields from canonical metrics and diagnostics.

Replace the initial ordering and placement tie-breaks with stable explicit tuples:

```ts
const remaining = athletes
  .filter((athlete) => !lockedParticipantIds.has(athlete.participantId))
  .sort((left, right) => left.participantId.localeCompare(right.participantId));

const chooseByTuple = (candidates: Array<{ index: number; tuple: number[] }>): number =>
  candidates.sort((left, right) => {
    for (let index = 0; index < left.tuple.length; index++) {
      const difference = left.tuple[index] - right.tuple[index];
      if (difference !== 0) return difference;
    }
    return left.index - right.index;
  })[0]?.index ?? 0;
```

For setter placement, use tuple `[setterCount, team.length, teamIndex]`. For other participants, use `[team.length, teamIndex]`. Keep locked placement, role buckets, gender buckets, and capacity checks unchanged.

Extend `isFeasible` so hard pair constraints are actual feasibility rules:

```ts
if (constraints?.pairsSeparated) {
  for (const [left, right] of constraints.pairsSeparated) {
    if (
      solution.teams.some((team) => {
        const ids = team.map((item) => item.participantId);
        return ids.includes(left) && ids.includes(right);
      })
    ) {
      return false;
    }
  }
}

if (constraints?.pairsTogether) {
  for (const [left, right] of constraints.pairsTogether) {
    if (
      !solution.teams.some((team) => {
        const ids = team.map((item) => item.participantId);
        return ids.includes(left) && ids.includes(right);
      })
    ) {
      return false;
    }
  }
}
```

Remove `timeLimitMillis` and the wall-clock condition from `SimulatedAnnealingBalancer.balance`. Its loop becomes:

```ts
while (iterations < maxIterations && iterationsWithoutImprovement < maxNoImprovement) {
```

Export these canonical entry points:

```ts
export function evaluateTeamSolution(
  solution: TeamSolution,
  config: TournamentConfig | FreePlayConfig | undefined,
  partnershipMatrix?: PartnershipMatrix,
): { score: number; diagnostics: CanonicalBalanceDiagnostics };

export function balanceSnapshots(
  snapshots: PlayerBalanceSnapshot[],
  numTeams: number,
  config?: TournamentConfig | FreePlayConfig,
  onProgress?: (percent: number, bestScore: number) => void,
  partnershipMatrix?: PartnershipMatrix,
): BalanceCandidate[];
```

`balanceSnapshots` retains the existing seed/work-profile selection and simulated annealing behavior, builds `BalanceCandidate` objects, selects the diverse portfolio, and sorts by canonical score. It does not accept `sessionId` and does not build `Team` or `Division` objects.

Remove `OVERALL_SCALE` from `src/logic/balancingConstants.ts`.

- [ ] **Step 5: Complete the compatibility adapter**

In `src/logic/balancingCompatibility.ts`, import `calculateGeneralOverall`, `calculatePositionOverall`, `generateUUID`, and the canonical functions. Add:

```ts
export type OverallProjection = (player: Player, position?: Position) => number;

export function calculateDisplayOverall(player: Player, position?: Position): number {
  const raw =
    position && position !== player.posicaoPrincipal
      ? calculatePositionOverall(player, position)
      : calculateGeneralOverall(player);
  if (Number.isFinite(raw)) return raw;
  const snapshot = mapPlayerToBalanceSnapshot(player, position);
  return (
    snapshot.attack +
    snapshot.defense +
    snapshot.serve +
    snapshot.reception +
    snapshot.setting +
    snapshot.block +
    snapshot.speed +
    snapshot.stamina +
    snapshot.gameVision +
    snapshot.consistency +
    snapshot.emotionalControl
  ) / 11;
}

export function adaptBalanceCandidatesToDivisions(input: {
  candidates: BalanceCandidate[];
  players: Player[];
  sessionId: string;
  config?: TournamentConfig | FreePlayConfig;
  overallProjection?: OverallProjection;
}): Division[];

export function balanceTeams(
  players: Player[],
  numTeams: number,
  sessionId: string,
  config?: TournamentConfig | FreePlayConfig,
  onProgress?: (percent: number, bestScore: number) => void,
  partnershipMatrix?: PartnershipMatrix,
): Division[];
```

Inside `adaptBalanceCandidatesToDivisions`, compute a display Overall map from the original players and session position overrides. For each fixed candidate team:

```ts
const participantIds = snapshots.map((snapshot) => snapshot.participantId);
const overallValues = participantIds.map((participantId) => {
  const value = overallByParticipant.get(participantId);
  if (value === undefined) {
    throw new Error(`Projeção de Overall ausente para ${participantId}.`);
  }
  return value;
});
const overall = average(overallValues);
```

Use canonical `calculateTeamMetrics` for attribute strength fields. Compute `overallSpread` as the maximum difference between team display Overall averages divided by `10`, and compute `formSpread` from the original players after assignments are fixed. Add the existing high-level imbalance warning only in this adapter. Preserve canonical candidate order; do not sort in the adapter.

Move `assignLabelsToDivisions`, `buildTeamStrengthSnapshot`, `findRosterDivergence`, and `recalculateDivisionDiagnostics` from `balancing.ts` into this compatibility module. `assignLabelsToDivisions` remains presentation-only and runs after `BalanceCandidate[]` portfolio selection and canonical score ordering.

`balanceTeams` must be only this composition:

```ts
const positionOverrides = config?.playerPositions ?? {};
const snapshots = mapPlayersToBalanceSnapshots(players, positionOverrides);
const candidates = balanceSnapshots(
  snapshots,
  numTeams,
  config,
  onProgress,
  partnershipMatrix,
);
return adaptBalanceCandidatesToDivisions({ candidates, players, sessionId, config });
```

- [ ] **Step 6: Update existing imports and unit fixtures**

Update `src/logic/balancing.test.ts`:

```ts
import {
  balanceTeams,
  computeAttributeFallback,
  findRosterDivergence,
  isPlayerEstimated,
  mapPlayerToBalanceSnapshot,
  recalculateDivisionDiagnostics,
} from './balancingCompatibility';
import {
  getQualityLabel,
  resolveComposition,
  solutionDistance,
  selectPortfolio,
  ObjectiveScorer,
} from './balancing';
```

Rename every test fixture field `id` to `participantId` where it constructs a canonical snapshot; remove `name`, `overall`, and `currentForm`. Rename `mapPlayerToAthleteVector` calls to `mapPlayerToBalanceSnapshot`. Update the finite-value test to assert only the eleven canonical dimensions and `isEstimated`.

Update imports in `src/application/sessionLifecycleUseCases.ts` so `balanceTeams` and `findRosterDivergence` come from `../logic/balancingCompatibility`. Update `SessionWizard.tsx` so the mapping, estimated-player helper, and manual recalculation come from `../../logic/balancingCompatibility`, while `resolveComposition` remains imported from `../../logic/balancing`.

Temporarily update `balancer.worker.ts` to import `balanceTeams` from `./balancingCompatibility`; Phase B replaces this temporary compatibility transport with snapshots before the atomic commit.

- [ ] **Step 7: Run focused runtime verification**

Run:

```powershell
node --import tsx --test src/logic/balancingCanonical.test.ts src/logic/balancingCompatibility.test.ts src/logic/balancing.test.ts
npm run typecheck
```

Expected: focused tests and typecheck PASS. Confirm the differential test fails if `overallSpread` is restored to `ObjectiveScorer.score` or if the initial builder sorts by the display projection.

- [ ] **Step 8: Confirm the transitional freeze fired before continuing**

```powershell
node --import tsx --test src/architecture/legacyExpansionGuard.test.ts
```

Expected: FAIL only because the W0 `AF-FREEZE-008` census, key sets, and import surface still describe the removed legacy dependency. This is the removal trigger, not a production regression. Continue immediately to Phases B and C without committing.

#### Phase B: Compact Worker and fallback transport

**Files:**

- Modify: `src/logic/balancerMessages.ts`
- Modify: `src/logic/balancer.worker.ts`
- Modify: `src/application/sessionLifecycleUseCases.ts:460-650`
- Modify: `src/application/sessionLifecycleUseCases.test.ts:635-865`
- Modify: `src/hooks/useSessionWizard.ts:180-235`

**Interfaces:**

- Consumes: one prepared `DivisionGenerationPlan` containing display players and a canonical `BalanceRequest`.
- Produces: Worker/fallback parity, `BalanceResponse` with canonical candidates, and application conversion to `Division[]` on completion.

- [ ] **Step 1: Rewrite the application tests to the target request and watch RED**

Change the generation-plan assertion in `sessionLifecycleUseCases.test.ts` to:

```ts
assert.deepEqual(result?.request, {
  type: 'balance',
  snapshots: result.snapshots,
  numTeams: 2,
  config: result.updatedConfig,
  partnershipMatrix: { 'player-1|player-3': 2 },
});
assert.deepEqual(
  result?.request.snapshots.map((snapshot) => snapshot.participantId),
  ['player-1', 'player-3'],
);
assert.equal('players' in result!.request, false);
assert.equal('sessionId' in result!.request, false);
```

Change the fallback-input assertion to prove object identity:

```ts
const input = buildDivisionFallbackBalanceInput(plan);
assert.equal(input?.snapshots, plan?.request.snapshots);
assert.deepEqual(input, plan?.request);
```

Change the done-message test to pass canonical candidates and the plan:

```ts
const candidates = balanceSnapshots(plan!.snapshots, 2, plan!.updatedConfig);
const action = buildDivisionWorkerMessageResult(
  { type: 'done', candidates },
  plan,
);
assert.equal(action.type, 'done');
if (action.type === 'done') {
  assert.deepEqual(
    action.divisions[0].teams.flatMap((team) => team.playerIds).sort(),
    ['player-1', 'player-2'],
  );
}
```

Run:

```powershell
node --import tsx --test src/application/sessionLifecycleUseCases.test.ts
```

Expected: FAIL because the request still contains `Player[]` and the done response still contains `Division[]`.

- [ ] **Step 2: Change the Worker message contract**

Replace `src/logic/balancerMessages.ts` with:

```ts
import type {
  BalanceCandidate,
  FreePlayConfig,
  PlayerBalanceSnapshot,
  TournamentConfig,
} from '../types';
import type { PartnershipMatrix } from './partnershipHistory';

export interface BalanceRequest {
  type: 'balance';
  snapshots: PlayerBalanceSnapshot[];
  numTeams: number;
  config?: TournamentConfig | FreePlayConfig;
  partnershipMatrix?: PartnershipMatrix;
}

export type BalanceResponse =
  | { type: 'progress'; percent: number; bestScore: number }
  | { type: 'done'; candidates: BalanceCandidate[] }
  | { type: 'error'; message: string };
```

Replace the Worker call with:

```ts
import { balanceSnapshots } from './balancing';
import type { BalanceRequest, BalanceResponse } from './balancerMessages';

self.onmessage = (event: MessageEvent<BalanceRequest>) => {
  const { snapshots, numTeams, config, partnershipMatrix } = event.data;
  const post = (message: BalanceResponse) => self.postMessage(message);
  try {
    const candidates = balanceSnapshots(
      snapshots,
      numTeams,
      config,
      (percent, bestScore) => post({ type: 'progress', percent, bestScore }),
      partnershipMatrix,
    );
    post({ type: 'done', candidates });
  } catch (error) {
    post({ type: 'error', message: (error as Error).message });
  }
};
```

- [ ] **Step 3: Prepare snapshots once in the application plan**

Change `DivisionGenerationPlan` to:

```ts
export type DivisionGenerationPlan = {
  sessionId: string;
  sessionPlayers: Player[];
  snapshots: PlayerBalanceSnapshot[];
  updatedConfig: FreePlayConfig | TournamentConfig;
  sessionPatch: Pick<Session, 'config'>;
  request: BalanceRequest;
};
```

In `buildDivisionGenerationPlan`, compute:

```ts
const snapshots = mapPlayersToBalanceSnapshots(
  sessionPlayers,
  updatedConfig.playerPositions ?? {},
);
```

Return `sessionId`, `sessionPlayers`, `snapshots`, and this request:

```ts
request: {
  type: 'balance',
  snapshots,
  numTeams: updatedConfig.teamCount,
  config: updatedConfig,
  partnershipMatrix: input.partnershipMatrix,
}
```

Make `buildDivisionFallbackBalanceInput(plan)` return `plan?.request ?? null` without rebuilding snapshots.

Make `buildDivisionFallbackBalanceResult` call `balanceSnapshots` with the request, then call `adaptBalanceCandidatesToDivisions` with `plan.sessionPlayers`, `plan.sessionId`, and `plan.updatedConfig`.

Change `buildDivisionWorkerMessageResult` to accept `(message, plan)`. On `done`, adapt `message.candidates` using the same plan; if the plan is null, return `{ type: 'fallback', message: 'Plano de geração indisponível.' }`.

- [ ] **Step 4: Pass the plan through the hook completion path**

In `useSessionWizard.ts`, replace:

```ts
const action = buildDivisionWorkerMessageResult(e.data);
```

with:

```ts
const action = buildDivisionWorkerMessageResult(e.data, plan);
```

The fallback closure continues to call `buildDivisionFallbackBalanceResult(plan)`, proving both paths use the same prepared snapshots.

- [ ] **Step 5: Run application, UI, and build verification**

Run:

```powershell
node --import tsx --test src/application/sessionLifecycleUseCases.test.ts
npm run typecheck
npm run test:ui -- src/hooks/useSessionWizard.spec.ts
npm run build
```

Expected: all PASS. The request assertion must fail if `players` or `sessionId` is reintroduced into `BalanceRequest`.

- [ ] **Step 6: Re-run the application checkpoint without committing**

```powershell
node --import tsx --test src/application/sessionLifecycleUseCases.test.ts
npm run typecheck
```

Expected: PASS. Keep the runtime and transport changes uncommitted until the target guard is green in Phase C.

#### Phase C: Target architecture fitness contract

**Files:**

- Modify: `src/architecture/legacyExpansionRules.ts:143-272`
- Modify: `src/architecture/legacyExpansionGuard.test.ts:86-150`
- Modify: `src/architecture/fitnessManifest.ts:133-142`

**Interfaces:**

- Consumes: final canonical type/import surface from Tasks 2 and 3.
- Produces: target `AF-FREEZE-008` guard with zero Overall census and exact target key/import contracts.

- [ ] **Step 1: Write the target fitness assertions and watch RED**

Replace the transitional Overall-entry-point assertion with:

```ts
test('AF-FREEZE-008: canonical Team Formation has zero Overall entry points', () => {
  const rule = legacyExpansionRules.find((item) => item.id === 'AF-FREEZE-008');
  assert.ok(rule);
  assert.deepEqual(censusFor(rule), {});

  const overallImports = Object.values(FROZEN_SOLVER_IMPORTS)
    .flat()
    .filter((binding) => /overall/i.test(binding));
  assert.deepEqual(overallImports, []);
});

test('AF-FREEZE-008: target snapshot excludes aggregate optimizer authority', () => {
  const observed = interfaceKeys('src/shared/types/session.ts', 'PlayerBalanceSnapshot');
  assert.deepEqual(observed, [...FROZEN_PLAYER_BALANCE_SNAPSHOT_KEYS]);
  assert.equal(observed.some((key) => /overall/i.test(key)), false);
});

test('AF-FREEZE-008: Overall exclusion is now a target fitness contract', () => {
  const fitness = architectureFitnessManifest.find((item) => item.id === 'AF-FREEZE-008');
  assert.equal(fitness?.lifecycle, 'TARGET');
});
```

Import `architectureFitnessManifest` and `FROZEN_PLAYER_BALANCE_SNAPSHOT_KEYS` in the test.

Run:

```powershell
node --import tsx --test src/architecture/legacyExpansionGuard.test.ts
```

Expected: FAIL because the rule still records transitional debt and the target snapshot key contract does not exist.

- [ ] **Step 2: Update the target rule and structural key sets**

Set the `AF-FREEZE-008` rule to:

```ts
{
  id: 'AF-FREEZE-008',
  slice: 'XS-W1-01',
  title: 'Overall is absent from canonical Team Formation',
  include: [
    'src/logic/balancing.ts',
    'src/logic/balancer.worker.ts',
    'src/logic/balancerMessages.ts',
    'src/logic/balancingConstants.ts',
  ],
  exclude: [],
  pattern: /[Oo]verall/,
  rationale:
    'GINV-BAL-001 / ADR-BAL-001: canonical Team Formation is attribute-driven and Overall is a post-selection display projection only.',
  baseline: {},
}
```

Set the target key arrays to these sorted values:

```ts
export const FROZEN_BALANCE_WEIGHT_KEYS = [
  'attack',
  'block',
  'consistency',
  'defense',
  'emotionalControl',
  'gender',
  'height',
  'injured',
  'netPresence',
  'reception',
  'repetition',
  'roleCoverage',
  'serve',
  'setting',
  'teamSize',
] as const;

export const FROZEN_TEAM_METRIC_KEYS = [
  'attack',
  'averageHeight',
  'block',
  'consistency',
  'defense',
  'emotionalControl',
  'femaleCount',
  'gameVision',
  'hasDefensiveReference',
  'hasSetter',
  'hasStrongAttacker',
  'injuredCount',
  'maleCount',
  'netPresence',
  'reception',
  'serve',
  'setting',
  'size',
  'speed',
  'stamina',
  'teamIndex',
] as const;

export const FROZEN_PLAYER_BALANCE_SNAPSHOT_KEYS = [
  'attack',
  'block',
  'consistency',
  'defense',
  'emotionalControl',
  'gameVision',
  'gender',
  'heightCm',
  'isEstimated',
  'isInjured',
  'participantId',
  'position',
  'reception',
  'secondaryPositions',
  'serve',
  'setting',
  'speed',
  'stamina',
] as const;
```

- [ ] **Step 3: Freeze the final canonical import surface**

Set `FROZEN_SOLVER_IMPORTS` to:

```ts
export const FROZEN_SOLVER_IMPORTS: Readonly<Record<string, readonly string[]>> = {
  'src/logic/balancing.ts': [
    '../types:BalanceCandidate',
    '../types:BalanceConstraints',
    '../types:BalanceQuality',
    '../types:BalanceWeights',
    '../types:CanonicalBalanceDiagnostics',
    '../types:FreePlayConfig',
    '../types:PlayerBalanceSnapshot',
    '../types:RoleComposition',
    '../types:RotationType',
    '../types:TeamMetrics',
    '../types:TeamSolution',
    '../types:TournamentConfig',
    './balancingConstants:PENALTIES',
    './balancingConstants:QUALITY',
    './balancingConstants:THRESHOLDS',
    './calculations:calculateGenderDistribution',
    './calculations:calculateTeamSizes',
    './partnershipHistory:PartnershipMatrix',
  ],
  'src/logic/balancer.worker.ts': [
    './balancerMessages:BalanceRequest',
    './balancerMessages:BalanceResponse',
    './balancing:balanceSnapshots',
  ],
  'src/logic/balancerMessages.ts': [
    '../types:BalanceCandidate',
    '../types:FreePlayConfig',
    '../types:PlayerBalanceSnapshot',
    '../types:TournamentConfig',
    './partnershipHistory:PartnershipMatrix',
  ],
  'src/logic/balancingConstants.ts': [],
};
```

Shape the implementation imports to match this declared boundary exactly; do not expand the frozen list. Type-only and value imports are intentionally normalized by `moduleImports`.

- [ ] **Step 4: Promote the fitness manifest record**

Change `AF-FREEZE-008` in `fitnessManifest.ts` to:

```ts
{
  id: 'AF-FREEZE-008',
  slice: 'XS-W1-01',
  owner: 'Team Formation',
  lifecycle: 'TARGET',
  protects:
    'Canonical Team Formation accepts only participant snapshots with explicit attributes and constraints. Overall is absent from the input, objective, initialization, candidate selection, Worker contract and canonical diagnostics; display adapters remain outside the guarded modules.',
  removalOrReplacementTrigger:
    'Replace only with an equal or stronger GINV-BAL-001 contract that preserves structural exclusion plus the Overall-only differential property.',
}
```

- [ ] **Step 5: Run fitness and mutation-oriented verification**

Run:

```powershell
node --import tsx --test src/architecture/legacyExpansionGuard.test.ts
npm run check:architecture
npm run typecheck
```

Expected: PASS. Mentally verify these mutations each fail at least one committed test: add `overall` to `PlayerBalanceSnapshot`; add it to `BalanceWeights`; add an Overall calculator import to any frozen module; add an Overall reference inline; restore Overall-only candidate changes.

- [ ] **Step 6: Commit the atomic XS-W1-01 cutover**

```powershell
git add -- src/shared/types/session.ts src/types.ts src/logic/balancing.ts src/logic/balancingConstants.ts src/logic/balancingCompatibility.ts src/logic/balancingCompatibility.test.ts src/logic/balancingCanonical.test.ts src/logic/balancing.test.ts src/logic/balancerMessages.ts src/logic/balancer.worker.ts src/application/sessionLifecycleUseCases.ts src/application/sessionLifecycleUseCases.test.ts src/hooks/useSessionWizard.ts src/components/session/SessionWizard.tsx src/infra/supabase/mappers.test.ts src/architecture/legacyExpansionRules.ts src/architecture/legacyExpansionGuard.test.ts src/architecture/fitnessManifest.ts
git commit -m "feat(domain): exclude Overall from canonical balancing"
```

---

### Task 3: Verify the complete slice and document its release evidence

**Files:**

- Modify only if verification finds a defect: files already listed in Tasks 1-4.
- Do not create a separate completion document; use the commit history and final handoff report.

**Interfaces:**

- Consumes: all committed slice changes.
- Produces: evidence for the `XS-W1-01` exit gate and a clean worktree.

- [ ] **Step 1: Run changed-file formatting**

Run:

```powershell
npx prettier --check src/shared/types/session.ts src/types.ts src/logic/balancing.ts src/logic/balancingConstants.ts src/logic/balancingCompatibility.ts src/logic/balancingCompatibility.test.ts src/logic/balancingCanonical.test.ts src/logic/balancing.test.ts src/logic/balancerMessages.ts src/logic/balancer.worker.ts src/application/sessionLifecycleUseCases.ts src/application/sessionLifecycleUseCases.test.ts src/hooks/useSessionWizard.ts src/components/session/SessionWizard.tsx src/architecture/legacyExpansionRules.ts src/architecture/legacyExpansionGuard.test.ts src/architecture/fitnessManifest.ts src/infra/supabase/mappers.test.ts
```

Expected: PASS. If it fails, run `npx prettier --write` with the identical explicit file list, then rerun the check.

- [ ] **Step 2: Run repository CI order**

Run each command separately and retain its exit status:

```powershell
npm run typecheck
npm run lint:eslint
npm run format:check
npm test
npm run build
```

Expected: typecheck, tests, and build PASS; ESLint has zero errors. The repository-wide format check may continue to report the known 20-file baseline, but no changed file may appear in that list.

- [ ] **Step 3: Run architecture and database safety checks**

Run:

```powershell
npm run check:architecture
npm run test:db
```

Expected: both PASS. The running PostgreSQL/Supabase Docker environment supplied by the user may be reused. If the sandbox cannot reach Docker's API but the published database port is reachable, run the DB harness directly without container lifecycle commands.

- [ ] **Step 4: Inspect final diff and history**

Run:

```powershell
git status --short
git diff --check eaf4f4e..HEAD
git log --oneline --decorate -6
```

Expected: clean status, no whitespace errors, and one design commit plus the snapshot and atomic cutover implementation commits. If a verification fix was necessary, commit it separately with a message that names the defect.

- [ ] **Step 5: Report the exit gate**

The final handoff must state:

```text
Slice: XS-W1-01
Branch: exec/c6-w1-01-overall-exclusion
Authority change: NONE
Schema phase: NONE
Exit gate: Overall-only changes cannot alter canonical candidate fingerprints
Open decisions preserved: OPEN-BAL-001, OPEN-BAL-002, OPEN-BAL-003
```

Include the exact test counts, architecture result, build result, DB harness result, format baseline comparison, commit hashes, and the worktree path. Do not merge or push without a separate user instruction.
