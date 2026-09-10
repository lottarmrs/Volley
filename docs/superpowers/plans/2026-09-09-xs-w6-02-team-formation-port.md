# XS-W6-02 Team Formation Port Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the existing team-balancing engine a versioned, normalized application port and a canonical fingerprint, with both existing call sites routed through it and no change to what any user sees.

**Architecture:** Contract types in `src/shared/types/`, pure canonicalization/fingerprint/precheck in `src/domain/`, the port and its two drivers in `src/application/`. `buildDivisionGenerationPlan` is the single seam: it already builds one request object that both the Worker and the direct path consume.

**Tech Stack:** TypeScript, Node test runner (`*.test.ts`) for pure logic, Vitest (`*.spec.tsx`) only if a hook changes, existing `src/logic/balancing.ts` engine untouched in behavior.

**Spec:** `docs/superpowers/specs/2026-09-09-xs-w6-02-team-formation-port-design.md`

## Global Constraints

- Node >= 20. Run `nvm use` if anything errors.
- Prettier: single quotes, 100 char width. Run `npx prettier --write` on every file you touch.
- No comments in source unless the plan's code shows one.
- Imports use aliases (`@app`, `@domain`, `@shared/types`), not deep relative paths, except inside `src/logic/` which uses relative imports today — follow the file you are editing.
- All types flow through `src/types.ts`.
- UI language is pt-BR. This slice adds no UI, but any user-facing message string stays pt-BR.
- **No behavior change.** The same options, from the same engine, with the same numbers. `npm test` must stay green without editing existing assertions, except where a task explicitly says otherwise.
- Do not run `npm run test:db`; this slice touches no SQL.
- Do not commit to `main` directly — create a branch `exec/c6-w6-02-team-formation-port` before Task 1.

---

### Task 1: Contract types

**Files:**

- Create: `src/shared/types/teamFormation.ts`
- Modify: `src/types.ts` (add re-export next to the `BalanceInputSnapshot` block near the top)
- Test: none (types only; Task 2 exercises them)

**Interfaces:**

- Consumes: `BalanceConstraints`, `RotationType`, `BalanceWeights` from `./session` and `./player`.
- Produces: `TeamFormationRequest`, `FormationParticipant`, `FormationBudget`, `FormationObjective`, `FormationProvenance`, `TEAM_FORMATION_CONTRACT_VERSION`.

- [ ] **Step 1: Create the contract file**

```ts
import type { BalanceConstraints, BalanceWeights } from './session';
import type { Gender, RotationType } from './player';

export const TEAM_FORMATION_CONTRACT_VERSION = 'v1' as const;
export const TEAM_FORMATION_OBJECTIVE_POLICY = 'v0-legacy-weights' as const;

export interface FormationParticipant {
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
  readonly secondaryPositions: readonly string[];
  readonly isInjured: boolean;
  readonly isEstimated: boolean;
}

export interface FormationBudget {
  readonly seeds: number;
  readonly maxIterations: number;
}

export interface FormationObjective {
  readonly policyVersion: typeof TEAM_FORMATION_OBJECTIVE_POLICY;
  readonly mode: string;
  readonly rotationType: RotationType;
  readonly repetitionWeight: number;
  readonly weights: BalanceWeights;
}

export type FormationProvenance =
  | { readonly kind: 'LOCAL' }
  | {
      readonly kind: 'AUTHORIZED_SNAPSHOT';
      readonly snapshotId: string;
      readonly inputFingerprint: string;
    };

export interface TeamFormationRequest {
  readonly contractVersion: typeof TEAM_FORMATION_CONTRACT_VERSION;
  readonly algorithmVersion: string;
  readonly participants: readonly FormationParticipant[];
  readonly teamCount: number;
  readonly objective: FormationObjective;
  readonly hardConstraints: BalanceConstraints;
  readonly budget: FormationBudget;
  readonly seed: number;
  readonly provenance: FormationProvenance;
}
```

- [ ] **Step 2: Re-export through the barrel**

In `src/types.ts`, directly below the existing `BalanceInputSnapshot` export block, add:

```ts
export type {
  FormationBudget,
  FormationObjective,
  FormationParticipant,
  FormationProvenance,
  TeamFormationRequest,
} from './shared/types/teamFormation';
export {
  TEAM_FORMATION_CONTRACT_VERSION,
  TEAM_FORMATION_OBJECTIVE_POLICY,
} from './shared/types/teamFormation';
```

- [ ] **Step 3: Verify it compiles**

Run: `npm run typecheck`
Expected: no output beyond the tsc banner. If `Gender` or `BalanceWeights` is not exported from where the import says, find the real path with `grep -rn "export type Gender\|export interface BalanceWeights" src/shared/types/` and fix the import.

- [ ] **Step 4: Commit**

```bash
git add src/shared/types/teamFormation.ts src/types.ts
git commit -m "feat: contrato versionado do pedido de formacao de times"
```

---

### Task 2: Canonicalization, fingerprint and precheck (pure)

**Files:**

- Create: `src/domain/teamFormation.ts`
- Create: `src/domain/teamFormation.test.ts`
- Modify: `src/domain/index.ts` (add `export * from './teamFormation';`)

**Interfaces:**

- Consumes: `TeamFormationRequest`, `FormationParticipant` from Task 1; `BalanceCandidate` from `@shared/types`.
- Produces: `canonicalizeRequest(request): unknown`, `canonicalizeCandidates(candidates): unknown`, `fingerprintFormation(request, candidates, partnershipSummary): string`, `summarizePartnershipMatrix(matrix): { count: number; hash: string }`, `precheckFormation(request): FormationRefusal | null`, `type FormationRefusal = { code: FormationRefusalCode; message: string }`, `FORMATION_REFUSAL_CODES`.

- [ ] **Step 1: Write the failing tests**

Create `src/domain/teamFormation.test.ts`:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import type { BalanceCandidate, TeamFormationRequest } from '@shared/types';
import {
  canonicalizeCandidates,
  fingerprintFormation,
  precheckFormation,
} from './teamFormation';

function participant(id: string, overrides: Record<string, unknown> = {}) {
  return {
    participantId: id,
    attack: 5,
    defense: 5,
    serve: 5,
    reception: 5,
    setting: 5,
    block: 5,
    speed: 5,
    stamina: 5,
    gameVision: 5,
    consistency: 5,
    emotionalControl: 5,
    heightCm: null,
    gender: null,
    position: null,
    secondaryPositions: [],
    isInjured: false,
    isEstimated: false,
    ...overrides,
  };
}

function request(overrides: Partial<TeamFormationRequest> = {}): TeamFormationRequest {
  return {
    contractVersion: 'v1',
    algorithmVersion: 'simulated-annealing-v1',
    participants: [participant('a'), participant('b')],
    teamCount: 2,
    objective: {
      policyVersion: 'v0-legacy-weights',
      mode: 'balanced',
      rotationType: '6x0',
      repetitionWeight: 0.8,
      weights: { gender: 1, repetition: 0.8 } as never,
    },
    hardConstraints: {},
    budget: { seeds: 3, maxIterations: 2000 },
    seed: 42,
    provenance: { kind: 'LOCAL' },
    ...overrides,
  } as TeamFormationRequest;
}

function candidate(overrides: Partial<BalanceCandidate> = {}): BalanceCandidate {
  return {
    solution: { teams: [['a'], ['b']] },
    score: 1.5,
    diagnostics: {},
    algorithm: 'simulated-annealing-v1',
    seed: 42,
    iterations: 100,
    runtimeMillis: 7,
    ...overrides,
  } as unknown as BalanceCandidate;
}

test('a impressao digital ignora runtimeMillis', () => {
  const fast = fingerprintFormation(request(), [candidate({ runtimeMillis: 1 })], null);
  const slow = fingerprintFormation(request(), [candidate({ runtimeMillis: 999 })], null);
  assert.equal(fast, slow);
});

test('a projecao canonica nao carrega runtimeMillis', () => {
  const projected = JSON.stringify(canonicalizeCandidates([candidate()]));
  assert.equal(projected.includes('runtimeMillis'), false);
  assert.equal(projected.includes('"iterations":100'), true);
});

test('a ordem dos participantes muda a impressao digital', () => {
  const forward = request();
  const reversed = request({ participants: [...forward.participants].reverse() });
  assert.notEqual(
    fingerprintFormation(forward, [candidate()], null),
    fingerprintFormation(reversed, [candidate()], null),
  );
});

test('a proveniencia entra na impressao digital', () => {
  const local = fingerprintFormation(request(), [candidate()], null);
  const authorized = fingerprintFormation(
    request({
      provenance: { kind: 'AUTHORIZED_SNAPSHOT', snapshotId: 's1', inputFingerprint: 'abc' },
    }),
    [candidate()],
    null,
  );
  assert.notEqual(local, authorized);
});

test('o precheck recusa contradicao mecanica, nao dificuldade', () => {
  assert.equal(precheckFormation(request()), null);

  assert.equal(precheckFormation(request({ participants: [] }))?.code, 'EMPTY_ROSTER');
  assert.equal(precheckFormation(request({ teamCount: 0 }))?.code, 'INVALID_TEAM_COUNT');
  assert.equal(
    precheckFormation(request({ participants: [participant('a')], teamCount: 2 }))?.code,
    'NOT_ENOUGH_PARTICIPANTS',
  );
  assert.equal(
    precheckFormation(
      request({
        hardConstraints: { pairsTogether: [['a', 'b']], pairsSeparated: [['b', 'a']] },
      }),
    )?.code,
    'CONTRADICTORY_PAIR',
  );
  assert.equal(
    precheckFormation(request({ hardConstraints: { lockedPlayerIdxs: { a: 5 } } }))?.code,
    'LOCKED_TEAM_OUT_OF_RANGE',
  );
  assert.equal(
    precheckFormation(request({ hardConstraints: { lockedPlayerIdxs: { zz: 0 } } }))?.code,
    'UNKNOWN_PARTICIPANT_IN_CONSTRAINTS',
  );
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --import tsx --test src/domain/teamFormation.test.ts`
Expected: FAIL — the module does not exist yet.

- [ ] **Step 3: Implement the pure module**

Create `src/domain/teamFormation.ts`:

```ts
import type { BalanceCandidate, TeamFormationRequest } from '@shared/types';

export const FORMATION_REFUSAL_CODES = [
  'EMPTY_ROSTER',
  'INVALID_TEAM_COUNT',
  'NOT_ENOUGH_PARTICIPANTS',
  'CONTRADICTORY_PAIR',
  'LOCKED_TEAM_OUT_OF_RANGE',
  'UNKNOWN_PARTICIPANT_IN_CONSTRAINTS',
] as const;

export type FormationRefusalCode = (typeof FORMATION_REFUSAL_CODES)[number];

export interface FormationRefusal {
  readonly code: FormationRefusalCode;
  readonly message: string;
}

export interface PartnershipSummary {
  readonly count: number;
  readonly hash: string;
}

// FNV-1a. Nao e hash criptografico: serve para comparar duas execucoes da mesma
// entrada, e SubtleCrypto obrigaria a porta inteira a virar assincrona por nada.
function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

export function canonicalizeRequest(request: TeamFormationRequest): unknown {
  return {
    contractVersion: request.contractVersion,
    algorithmVersion: request.algorithmVersion,
    teamCount: request.teamCount,
    seed: request.seed,
    budget: { seeds: request.budget.seeds, maxIterations: request.budget.maxIterations },
    objective: request.objective,
    hardConstraints: request.hardConstraints,
    provenance: request.provenance,
    participants: request.participants.map((participant) => ({ ...participant })),
  };
}

export function canonicalizeCandidates(candidates: readonly BalanceCandidate[]): unknown {
  return candidates.map((candidate) => ({
    solution: candidate.solution,
    score: candidate.score,
    diagnostics: candidate.diagnostics,
    algorithm: candidate.algorithm,
    seed: candidate.seed,
    iterations: candidate.iterations,
  }));
}

export function summarizePartnershipMatrix(matrix: unknown): PartnershipSummary | null {
  if (!matrix || typeof matrix !== 'object') return null;
  const serialized = JSON.stringify(matrix);
  return { count: Object.keys(matrix as Record<string, unknown>).length, hash: fnv1a(serialized) };
}

export function fingerprintFormation(
  request: TeamFormationRequest,
  candidates: readonly BalanceCandidate[],
  partnership: PartnershipSummary | null,
): string {
  return fnv1a(
    JSON.stringify({
      request: canonicalizeRequest(request),
      result: canonicalizeCandidates(candidates),
      partnership,
    }),
  );
}

export function precheckFormation(request: TeamFormationRequest): FormationRefusal | null {
  if (request.teamCount < 1) {
    return { code: 'INVALID_TEAM_COUNT', message: 'Informe pelo menos um time.' };
  }
  if (request.participants.length === 0) {
    return { code: 'EMPTY_ROSTER', message: 'Nenhum atleta selecionado para formar times.' };
  }
  if (request.participants.length < request.teamCount) {
    return {
      code: 'NOT_ENOUGH_PARTICIPANTS',
      message: 'Há menos atletas do que times.',
    };
  }

  const known = new Set(request.participants.map((participant) => participant.participantId));
  const constraints = request.hardConstraints ?? {};

  const together = constraints.pairsTogether ?? [];
  const separated = constraints.pairsSeparated ?? [];
  const pairKey = (pair: readonly [string, string]) => [...pair].sort().join(' ');
  const separatedKeys = new Set(separated.map(pairKey));
  for (const pair of together) {
    if (separatedKeys.has(pairKey(pair))) {
      return {
        code: 'CONTRADICTORY_PAIR',
        message: 'A mesma dupla foi marcada para jogar junta e separada.',
      };
    }
  }

  for (const pair of [...together, ...separated]) {
    for (const id of pair) {
      if (!known.has(id)) {
        return {
          code: 'UNKNOWN_PARTICIPANT_IN_CONSTRAINTS',
          message: 'Uma restrição aponta para um atleta fora da lista.',
        };
      }
    }
  }

  for (const [id, teamIndex] of Object.entries(constraints.lockedPlayerIdxs ?? {})) {
    if (!known.has(id)) {
      return {
        code: 'UNKNOWN_PARTICIPANT_IN_CONSTRAINTS',
        message: 'Uma restrição aponta para um atleta fora da lista.',
      };
    }
    if (teamIndex < 0 || teamIndex >= request.teamCount) {
      return {
        code: 'LOCKED_TEAM_OUT_OF_RANGE',
        message: 'Um atleta foi fixado em um time que não existe.',
      };
    }
  }

  return null;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --import tsx --test src/domain/teamFormation.test.ts`
Expected: PASS, 5 tests.

If the `UNKNOWN_PARTICIPANT_IN_CONSTRAINTS` case fails because `lockedPlayerIdxs: { a: 5 }` hits the range check first: the test uses id `a`, which IS known, so it must return `LOCKED_TEAM_OUT_OF_RANGE`; the `zz` case must return the unknown-participant code. Both orders are asserted — do not reorder the checks to make one pass and break the other.

- [ ] **Step 5: Export from the domain barrel**

In `src/domain/index.ts`, add `export * from './teamFormation';` on its own line after the existing exports.

- [ ] **Step 6: Verify the whole unit suite still passes**

Run: `npm run test:unit`
Expected: previous total + 5, zero failures.

- [ ] **Step 7: Commit**

```bash
npx prettier --write src/domain/teamFormation.ts src/domain/teamFormation.test.ts src/domain/index.ts
git add src/domain/teamFormation.ts src/domain/teamFormation.test.ts src/domain/index.ts
git commit -m "feat: canonicalizacao, impressao digital e precheck da formacao"
```

---

### Task 3: Explicit budget in the engine

**Files:**

- Modify: `src/logic/balancing.ts:1253-1296` (the `balanceSnapshots` signature and the budget block)
- Test: `src/logic/balancing.test.ts` (append)

**Interfaces:**

- Consumes: nothing from earlier tasks.
- Produces: `balanceSnapshots(snapshots, numTeams, config?, onProgress?, partnershipMatrix?, budget?)` where `budget` is `{ seeds: number; maxIterations: number } | undefined`, and `deriveFormationBudget(balanceSpeed, rosterSize): { seeds: number; maxIterations: number }` exported from the same file.

- [ ] **Step 1: Write the failing test**

Append to `src/logic/balancing.test.ts`:

```ts
test('deriveFormationBudget reproduz exatamente a formula de hoje', () => {
  assert.deepEqual(deriveFormationBudget('fast', 12), { seeds: 3, maxIterations: 4800 });
  assert.deepEqual(deriveFormationBudget('fast', 2), { seeds: 3, maxIterations: 2000 });
  assert.deepEqual(deriveFormationBudget('fast', 100), { seeds: 3, maxIterations: 10000 });
  assert.deepEqual(deriveFormationBudget('normal', 12), { seeds: 6, maxIterations: 12000 });
  assert.deepEqual(deriveFormationBudget('normal', 2), { seeds: 6, maxIterations: 8000 });
  assert.deepEqual(deriveFormationBudget('advanced', 12), { seeds: 10, maxIterations: 48000 });
  assert.deepEqual(deriveFormationBudget('advanced', 2), { seeds: 10, maxIterations: 20000 });
});

test('um orcamento explicito substitui o derivado do balanceSpeed', () => {
  const snapshots = makeBalanceSnapshots(4);
  const derived = balanceSnapshots(snapshots, 2, { balanceSpeed: 'advanced' } as never);
  const budgeted = balanceSnapshots(snapshots, 2, { balanceSpeed: 'advanced' } as never, undefined, undefined, {
    seeds: 2,
    maxIterations: 500,
  });
  assert.equal(derived.length, 10);
  assert.equal(budgeted.length, 2);
  assert.ok(budgeted[0].iterations <= 500);
});
```

Add `deriveFormationBudget` to the existing import from `./balancing` at the top of the test file. If `makeBalanceSnapshots` does not exist in that file, find the helper the file already uses to build snapshots (`grep -n "PlayerBalanceSnapshot" src/logic/balancing.test.ts | head`) and use it instead — do not invent a second helper.

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --import tsx --test src/logic/balancing.test.ts`
Expected: FAIL — `deriveFormationBudget` is not exported.

- [ ] **Step 3: Extract the derivation and accept an override**

In `src/logic/balancing.ts`, above `balanceSnapshots`, add:

```ts
export function deriveFormationBudget(
  balanceSpeed: 'fast' | 'normal' | 'advanced' | undefined,
  rosterSize: number,
): { seeds: number; maxIterations: number } {
  const clamp = (value: number, minimum: number, maximum: number) =>
    Math.max(minimum, Math.min(maximum, value));
  if (balanceSpeed === 'fast') {
    return { seeds: 3, maxIterations: clamp(rosterSize * 400, 2000, 10000) };
  }
  if (balanceSpeed === 'normal') {
    return { seeds: 6, maxIterations: clamp(rosterSize * 1000, 8000, 30000) };
  }
  return { seeds: 10, maxIterations: clamp(rosterSize * 4000, 20000, 120000) };
}
```

Then change the signature to add a sixth parameter `budget?: { seeds: number; maxIterations: number }`, and replace the block that currently computes `maxIterations`/`numSeeds` (the `let maxIterations = 40000; let numSeeds = 10; if (balanceSpeed === 'fast') { ... }` sequence) with:

```ts
  const resolvedBudget = budget ?? deriveFormationBudget(balanceSpeed, snapshots.length);
  const maxIterations = resolvedBudget.maxIterations;
  const numSeeds = resolvedBudget.seeds;
```

Leave the existing `clamp` local in place if other code below still uses it; if nothing else uses it, delete it.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --import tsx --test src/logic/balancing.test.ts`
Expected: PASS, including every pre-existing test in the file unchanged. If a pre-existing test now fails, the derivation does not match the original formula — fix `deriveFormationBudget`, never the old test.

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/logic/balancing.ts src/logic/balancing.test.ts
git add src/logic/balancing.ts src/logic/balancing.test.ts
git commit -m "feat: orcamento explicito de busca no motor de balanceamento"
```

---

### Task 4: Adapters

**Files:**

- Create: `src/application/teamFormationAdapters.ts`
- Create: `src/application/teamFormationAdapters.test.ts`

**Interfaces:**

- Consumes: Task 1 types, `deriveFormationBudget` from Task 3, `BalanceInputSnapshot` from `@shared/types`.
- Produces: `fromLocalSnapshots(input): TeamFormationRequest` and `fromAuthorizedSnapshot(input): TeamFormationRequest`.

- [ ] **Step 1: Write the failing tests**

Create `src/application/teamFormationAdapters.test.ts`:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import type { BalanceInputSnapshot } from '@shared/types';
import { fromAuthorizedSnapshot, fromLocalSnapshots } from './teamFormationAdapters';

const localSnapshot = {
  participantId: 'p1',
  attack: 7,
  defense: 6,
  serve: 5,
  reception: 4,
  setting: 3,
  block: 2,
  speed: 1,
  stamina: 0,
  gameVision: 8,
  consistency: 9,
  emotionalControl: 10,
  heightCm: 180,
  gender: 'F' as const,
  position: 'oposto',
  secondaryPositions: ['ponteiro'],
  isInjured: false,
  isEstimated: true,
};

test('o adaptador local preserva ordem, orcamento e proveniencia', () => {
  const request = fromLocalSnapshots({
    snapshots: [localSnapshot, { ...localSnapshot, participantId: 'p2' }],
    teamCount: 2,
    config: { balanceSpeed: 'fast', balanceSeed: 7, rotationType: '5x1' } as never,
    algorithmVersion: 'simulated-annealing-v1',
  });

  assert.deepEqual(
    request.participants.map((participant) => participant.participantId),
    ['p1', 'p2'],
  );
  assert.deepEqual(request.budget, { seeds: 3, maxIterations: 2000 });
  assert.equal(request.seed, 7);
  assert.deepEqual(request.provenance, { kind: 'LOCAL' });
  assert.equal(request.contractVersion, 'v1');
});

test('o adaptador autorizado traduz a chave pt da rubric e leva a digital da origem', () => {
  const snapshot = {
    snapshot_id: 'snap-1',
    session_id: 's',
    roster_revision_id: 'r',
    rubric_version: 'v0-legacy-11',
    resolver_version: 'v0-global-roster-mean-5',
    global_policy_version: 'v0-equal-community-mean',
    community_policy_version: 'v0-legacy-mad-mean',
    captured_at: '2026-09-09T00:00:00.000Z',
    input_fingerprint: 'fp-1',
    participants: [
      {
        participant_id: 'a',
        identity_kind: 'PLAYER' as const,
        display_name_at_time: 'Ana',
        attribute_vector: {
          saque: 1,
          recepcao: 2,
          levantamento: 3,
          ataque: 4,
          bloqueio: 5,
          defesa: 6,
          velocidade: 7,
          resistencia: 8,
          leituraDeJogo: 9,
          regularidade: 10,
          controleEmocional: 0,
        },
        estimated_dimensions: ['saque'],
        is_estimated: true,
        source_profile_revision: 'rev',
        height_cm: 175,
        gender: 'F',
        primary_position: 'central',
        secondary_positions: [],
        is_injured: true,
      },
    ],
  } as unknown as BalanceInputSnapshot;

  const request = fromAuthorizedSnapshot({
    snapshot,
    teamCount: 2,
    config: { balanceSpeed: 'normal' } as never,
    algorithmVersion: 'simulated-annealing-v1',
  });

  const [participant] = request.participants;
  assert.equal(participant.participantId, 'a');
  assert.equal(participant.serve, 1);
  assert.equal(participant.reception, 2);
  assert.equal(participant.setting, 3);
  assert.equal(participant.attack, 4);
  assert.equal(participant.block, 5);
  assert.equal(participant.defense, 6);
  assert.equal(participant.speed, 7);
  assert.equal(participant.stamina, 8);
  assert.equal(participant.gameVision, 9);
  assert.equal(participant.consistency, 10);
  assert.equal(participant.emotionalControl, 0);
  assert.equal(participant.heightCm, 175);
  assert.equal(participant.isInjured, true);
  assert.equal(participant.isEstimated, true);
  assert.deepEqual(request.provenance, {
    kind: 'AUTHORIZED_SNAPSHOT',
    snapshotId: 'snap-1',
    inputFingerprint: 'fp-1',
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --import tsx --test src/application/teamFormationAdapters.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the adapters**

Create `src/application/teamFormationAdapters.ts`:

```ts
import type {
  BalanceInputSnapshot,
  FormationParticipant,
  FreePlayConfig,
  PlayerBalanceSnapshot,
  TeamFormationRequest,
  TournamentConfig,
} from '@shared/types';
import { TEAM_FORMATION_CONTRACT_VERSION, TEAM_FORMATION_OBJECTIVE_POLICY } from '@shared/types';
import { deriveFormationBudget, resolveBalanceWeightsForRequest } from '../logic/balancing';

type SolverConfig = TournamentConfig | FreePlayConfig;

function objectiveFrom(config: SolverConfig | undefined) {
  return {
    policyVersion: TEAM_FORMATION_OBJECTIVE_POLICY,
    mode: config?.balanceMode ?? 'balanced',
    rotationType: config?.rotationType ?? ('6x0' as const),
    repetitionWeight: typeof config?.repetitionWeight === 'number' ? config.repetitionWeight : 0.8,
    weights: resolveBalanceWeightsForRequest(config),
  };
}

export function fromLocalSnapshots(input: {
  snapshots: readonly PlayerBalanceSnapshot[];
  teamCount: number;
  config?: SolverConfig;
  algorithmVersion: string;
}): TeamFormationRequest {
  return {
    contractVersion: TEAM_FORMATION_CONTRACT_VERSION,
    algorithmVersion: input.algorithmVersion,
    participants: input.snapshots.map((snapshot) => ({
      ...snapshot,
      secondaryPositions: snapshot.secondaryPositions ?? [],
    })) as readonly FormationParticipant[],
    teamCount: input.teamCount,
    objective: objectiveFrom(input.config),
    hardConstraints: input.config?.balanceConstraints ?? {},
    budget: deriveFormationBudget(input.config?.balanceSpeed, input.snapshots.length),
    seed: input.config?.balanceSeed ?? 42,
    provenance: { kind: 'LOCAL' },
  };
}

export function fromAuthorizedSnapshot(input: {
  snapshot: BalanceInputSnapshot;
  teamCount: number;
  config?: SolverConfig;
  algorithmVersion: string;
}): TeamFormationRequest {
  const participants = input.snapshot.participants.map((participant) => {
    const vector = participant.attribute_vector;
    return {
      participantId: participant.participant_id,
      attack: vector.ataque,
      defense: vector.defesa,
      serve: vector.saque,
      reception: vector.recepcao,
      setting: vector.levantamento,
      block: vector.bloqueio,
      speed: vector.velocidade,
      stamina: vector.resistencia,
      gameVision: vector.leituraDeJogo,
      consistency: vector.regularidade,
      emotionalControl: vector.controleEmocional,
      heightCm: participant.height_cm,
      gender: participant.gender,
      position: participant.primary_position,
      secondaryPositions: participant.secondary_positions,
      isInjured: participant.is_injured,
      isEstimated: participant.is_estimated,
    };
  }) as readonly FormationParticipant[];

  return {
    contractVersion: TEAM_FORMATION_CONTRACT_VERSION,
    algorithmVersion: input.algorithmVersion,
    participants,
    teamCount: input.teamCount,
    objective: objectiveFrom(input.config),
    hardConstraints: input.config?.balanceConstraints ?? {},
    budget: deriveFormationBudget(input.config?.balanceSpeed, participants.length),
    seed: input.config?.balanceSeed ?? 42,
    provenance: {
      kind: 'AUTHORIZED_SNAPSHOT',
      snapshotId: input.snapshot.snapshot_id,
      inputFingerprint: input.snapshot.input_fingerprint,
    },
  };
}
```

`resolveBalanceWeightsForRequest` does not exist yet — `resolveBalanceWeights` in `src/logic/balancing.ts:1201` is module-private. Export it under the new name by adding, next to it:

```ts
export function resolveBalanceWeightsForRequest(
  config: TournamentConfig | FreePlayConfig | undefined,
): BalanceWeights {
  return resolveBalanceWeights(config);
}
```

The `gender` field type on `PlayerBalanceSnapshot` is `Gender | null` and on the authorized participant it is `string | null`. If typecheck rejects the assignment, narrow in the authorized adapter with `gender: (participant.gender as FormationParticipant['gender']) ?? null` and leave a one-line comment saying the server stores the gender as a source string.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --import tsx --test src/application/teamFormationAdapters.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Verify typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
npx prettier --write src/application/teamFormationAdapters.ts src/application/teamFormationAdapters.test.ts src/logic/balancing.ts
git add src/application/teamFormationAdapters.ts src/application/teamFormationAdapters.test.ts src/logic/balancing.ts
git commit -m "feat: adaptadores local e autorizado para o pedido de formacao"
```

---

### Task 5: The port and its two drivers

**Files:**

- Create: `src/application/teamFormationPort.ts`
- Create: `src/application/teamFormationPort.test.ts`
- Modify: `src/logic/balancerMessages.ts` (replace the `BalanceRequest` payload)
- Modify: `src/logic/balancer.worker.ts`
- Modify: `src/architecture/legacyExpansionRules.ts:293-298`

**Interfaces:**

- Consumes: Tasks 1-4.
- Produces: `solveTeamFormationDirect(request, partnershipMatrix?, onProgress?): FormationOutcome`, `type FormationOutcome = { ok: true; candidates: BalanceCandidate[]; fingerprint: string } | { ok: false; refusal: FormationRefusal }`, and `BalanceRequest` now shaped `{ type: 'balance'; request: TeamFormationRequest; partnershipMatrix?: PartnershipMatrix }`.

- [ ] **Step 1: Write the failing parity test**

Create `src/application/teamFormationPort.test.ts`:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { fromLocalSnapshots } from './teamFormationAdapters';
import { solveTeamFormationDirect } from './teamFormationPort';

function snapshots(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    participantId: `p${index}`,
    attack: 5 + (index % 3),
    defense: 5,
    serve: 4,
    reception: 6,
    setting: 5,
    block: 5,
    speed: 5,
    stamina: 5,
    gameVision: 5,
    consistency: 5,
    emotionalControl: 5,
    heightCm: null,
    gender: null,
    position: null,
    secondaryPositions: [],
    isInjured: false,
    isEstimated: false,
  }));
}

const request = fromLocalSnapshots({
  snapshots: snapshots(8),
  teamCount: 2,
  config: { balanceSpeed: 'fast', balanceSeed: 11 } as never,
  algorithmVersion: 'simulated-annealing-v1',
});

test('a mesma entrada produz a mesma impressao digital duas vezes', () => {
  const first = solveTeamFormationDirect(request);
  const second = solveTeamFormationDirect(request);
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  if (first.ok && second.ok) assert.equal(first.fingerprint, second.fingerprint);
});

test('o driver direto e o codigo do worker concordam na impressao digital', async () => {
  const direct = solveTeamFormationDirect(request);

  const posted: unknown[] = [];
  const fakeSelf = {
    onmessage: null as ((event: { data: unknown }) => void) | null,
    postMessage: (message: unknown) => posted.push(message),
  };
  const globalWithSelf = globalThis as { self?: unknown };
  const previous = globalWithSelf.self;
  globalWithSelf.self = fakeSelf;
  try {
    await import('../logic/balancer.worker');
    fakeSelf.onmessage?.({ data: { type: 'balance', request } });
  } finally {
    globalWithSelf.self = previous;
  }

  const done = posted.find(
    (message) => (message as { type?: string }).type === 'done',
  ) as { fingerprint: string } | undefined;

  assert.ok(done, 'o worker precisa responder done');
  assert.equal(direct.ok, true);
  if (direct.ok) assert.equal(done!.fingerprint, direct.fingerprint);
});

test('o precheck recusa antes de qualquer busca', () => {
  const empty = fromLocalSnapshots({
    snapshots: [],
    teamCount: 2,
    config: { balanceSpeed: 'fast' } as never,
    algorithmVersion: 'simulated-annealing-v1',
  });
  const outcome = solveTeamFormationDirect(empty);
  assert.equal(outcome.ok, false);
  if (!outcome.ok) assert.equal(outcome.refusal.code, 'EMPTY_ROSTER');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --import tsx --test src/application/teamFormationPort.test.ts`
Expected: FAIL — `./teamFormationPort` does not exist.

- [ ] **Step 3: Implement the port**

Create `src/application/teamFormationPort.ts`:

```ts
import type { BalanceCandidate, TeamFormationRequest } from '@shared/types';
import {
  fingerprintFormation,
  precheckFormation,
  summarizePartnershipMatrix,
  type FormationRefusal,
} from '@domain/teamFormation';
import { balanceSnapshots } from '../logic/balancing';
import type { PartnershipMatrix } from '../logic/partnershipHistory';

export type FormationOutcome =
  | { ok: true; candidates: BalanceCandidate[]; fingerprint: string }
  | { ok: false; refusal: FormationRefusal };

export function solveTeamFormationDirect(
  request: TeamFormationRequest,
  partnershipMatrix?: PartnershipMatrix,
  onProgress?: (percent: number, bestScore: number) => void,
): FormationOutcome {
  const refusal = precheckFormation(request);
  if (refusal) return { ok: false, refusal };

  const candidates = balanceSnapshots(
    request.participants as never,
    request.teamCount,
    {
      balanceMode: request.objective.mode,
      rotationType: request.objective.rotationType,
      repetitionWeight: request.objective.repetitionWeight,
      balanceConstraints: request.hardConstraints,
      balanceSeed: request.seed,
      teamCount: request.teamCount,
    } as never,
    onProgress,
    partnershipMatrix,
    request.budget,
  );

  const mismatched = candidates.find(
    (candidate) => candidate.algorithm !== request.algorithmVersion,
  );
  if (mismatched) {
    return {
      ok: false,
      refusal: {
        code: 'ALGORITHM_VERSION_MISMATCH',
        message: `O motor executou ${mismatched.algorithm}, e o pedido declara ${request.algorithmVersion}.`,
      },
    };
  }

  return {
    ok: true,
    candidates,
    fingerprint: fingerprintFormation(
      request,
      candidates,
      summarizePartnershipMatrix(partnershipMatrix ?? null),
    ),
  };
}
```

`ALGORITHM_VERSION_MISMATCH` does not exist yet — append it to `FORMATION_REFUSAL_CODES` in `src/domain/teamFormation.ts` before writing this file. Do not reuse a participant-constraint code for it.

One redundancy worth understanding rather than removing: the request carries `objective.weights`, and `balanceSnapshots` re-derives weights internally from `balanceMode` and `repetitionWeight`. Because the port passes exactly those two fields through, the derived weights equal the declared ones by construction. The declared value is what the fingerprint covers, which is the point — it records what the caller asked for, not what the engine happened to compute.

- [ ] **Step 4: Move the worker onto the port**

Replace the body of `src/logic/balancer.worker.ts` with:

```ts
import { solveTeamFormationDirect } from '../application/teamFormationPort';
import { buildBalanceErrorResponse } from './balancerMessages';
import type { BalanceRequest, BalanceResponse } from './balancerMessages';

self.onmessage = (event: MessageEvent<BalanceRequest>) => {
  const { request, partnershipMatrix } = event.data;
  const post = (message: BalanceResponse) => self.postMessage(message);
  try {
    const outcome = solveTeamFormationDirect(
      request,
      partnershipMatrix,
      (percent, bestScore) => post({ type: 'progress', percent, bestScore }),
    );
    if (!outcome.ok) {
      post({ type: 'error', code: 'INFEASIBLE_CONSTRAINTS', message: outcome.refusal.message });
      return;
    }
    post({ type: 'done', candidates: outcome.candidates, fingerprint: outcome.fingerprint });
  } catch (error) {
    post(buildBalanceErrorResponse(error));
  }
};
```

In `src/logic/balancerMessages.ts`, change `BalanceRequest` to `{ type: 'balance'; request: TeamFormationRequest; partnershipMatrix?: PartnershipMatrix }` and add `fingerprint: string` to the `done` variant of `BalanceResponse`.

In `src/architecture/legacyExpansionRules.ts`, replace the `'src/logic/balancer.worker.ts'` allowlist entry with:

```ts
  'src/logic/balancer.worker.ts': [
    './balancerMessages:BalanceRequest',
    './balancerMessages:BalanceResponse',
    './balancerMessages:buildBalanceErrorResponse',
    '../application/teamFormationPort:solveTeamFormationDirect',
  ],
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --import tsx --test src/application/teamFormationPort.test.ts`
Expected: PASS, 3 tests.

If the worker-import test fails because the module registers `self.onmessage` at import time and the module was already cached, give the test its own process by running only this file, or import with a cache-busting query (`await import('../logic/balancer.worker?parity')`). Do not weaken the assertion to make it pass.

- [ ] **Step 6: Commit**

```bash
npx prettier --write src/application/teamFormationPort.ts src/application/teamFormationPort.test.ts src/logic/balancer.worker.ts src/logic/balancerMessages.ts src/architecture/legacyExpansionRules.ts src/domain/teamFormation.ts
git add -A
git commit -m "feat: porta de formacao com driver direto e worker"
```

---

### Task 6: Route both existing call sites through the port

**Files:**

- Modify: `src/application/sessionLifecycleUseCases.ts:474-524` (`DivisionGenerationPlan`, `buildDivisionGenerationPlan`) and `:531-545` (`buildDivisionFallbackBalanceResult`)
- Modify: `src/hooks/useSessionWizard.ts` only if typecheck demands it
- Test: `src/application/sessionLifecycleUseCases.test.ts` (adjust the existing direct-call test)

**Interfaces:**

- Consumes: Tasks 4 and 5.
- Produces: `DivisionGenerationPlan.request` is now a `BalanceRequest` whose payload is a `TeamFormationRequest`.

- [ ] **Step 1: Change the plan builder**

In `buildDivisionGenerationPlan`, replace the `request` literal with:

```ts
    request: {
      type: 'balance',
      request: fromLocalSnapshots({
        snapshots,
        teamCount: updatedConfig.teamCount,
        config: updatedConfig,
        algorithmVersion: BALANCE_ALGORITHM_VERSION,
      }),
      partnershipMatrix: input.partnershipMatrix,
    },
```

`BALANCE_ALGORITHM_VERSION` must be the exact string the engine already reports in `BalanceCandidate.algorithm`. Find it with `grep -n "algorithm:" src/logic/balancing.ts` and export it as a named constant from `src/logic/balancing.ts`, then import it here — do not retype the literal in two places.

- [ ] **Step 2: Change the direct path**

In `buildDivisionFallbackBalanceResult`, replace the `balanceSnapshots(...)` call with:

```ts
  const outcome = solveTeamFormationDirect(input.request, input.partnershipMatrix);
  if (!outcome.ok) return null;
  const candidates = outcome.candidates;
```

- [ ] **Step 3: Run the full unit suite**

Run: `npm run test:unit`
Expected: the pre-existing `sessionLifecycleUseCases.test.ts:852` test calls `balanceSnapshots(plan!.snapshots, 2, plan!.updatedConfig)` directly and still passes — it exercises the engine, not the port. If any other test fails, the routing changed behavior; fix the routing, not the test.

- [ ] **Step 4: Run typecheck and the UI suite**

Run: `npm run typecheck && npm run test:ui`
Expected: both clean. `useSessionWizard.ts` posts `plan.request` unchanged, so it should need no edit; if typecheck complains about the `done` message now carrying `fingerprint`, add the field to the message handler's type and ignore the value for now — consuming it is XS-W6-03's job.

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/application/sessionLifecycleUseCases.ts src/hooks/useSessionWizard.ts
git add -A
git commit -m "feat: rotear o sorteio existente pela porta de formacao"
```

---

### Task 7: Full verification and handoff

**Files:**

- Modify: `HANDOFF.md`, `docs/architecture/execution/C6.02-W3-W6-SESSION-REGISTRATION-RATING-TEAM.md`

- [ ] **Step 1: Run every gate**

```bash
npm run typecheck
npm test
npm run build
npx eslint <every file you created or modified>
npx prettier --check <every file you created or modified>
git diff --check
```

Expected: all clean. ESLint warnings in files you did not touch are the pre-existing baseline; errors are not.

- [ ] **Step 2: Prove the new guards are load-bearing**

For each of these, break the line, run the named test, confirm exactly one test fails, then restore:

- delete the `runtimeMillis` exclusion in `canonicalizeCandidates` → `src/domain/teamFormation.test.ts`
- make `solveTeamFormationDirect` ignore the precheck refusal → `src/application/teamFormationPort.test.ts`
- make the worker call `balanceSnapshots` directly again → the parity test in `teamFormationPort.test.ts`

Record the result. A guard whose mutation kills no test is a guard with no test.

- [ ] **Step 3: Update the execution doc**

Add a "Scoped implementation decision (2026-09-09)" block under `## XS-W6-02` recording: the port defines its own normalized input with two adapters; both existing call sites route through it with no behavior change; the precheck detects mechanical contradiction only; and the parity gate covers the Worker's code path, not a real browser Worker.

- [ ] **Step 4: Update HANDOFF**

Add `XS-W6-02` to the slice table, a "O que a W6-02 entregou" section, and an evidence section with the real numbers from Step 1 and the mutation results from Step 2. State plainly what this slice did NOT do: no source cutover, no candidate publication, no UI change.

- [ ] **Step 5: Commit**

```bash
npx prettier --write HANDOFF.md docs/architecture/execution/C6.02-W3-W6-SESSION-REGISTRATION-RATING-TEAM.md
git add -A
git commit -m "docs: registrar a W6-02 e sua evidencia de verificacao"
```
