import {
  BalanceCandidate,
  BalanceConstraints,
  BalanceQuality,
  BalanceWeights,
  CanonicalBalanceDiagnostics,
  FreePlayConfig,
  PlayerBalanceSnapshot,
  RoleComposition,
  RotationType,
  TeamMetrics,
  TeamSolution,
  TournamentConfig,
} from '../types';
import { PENALTIES, QUALITY, THRESHOLDS } from './balancingConstants';
import { calculateGenderDistribution, calculateTeamSizes } from './calculations';
import { PartnershipMatrix } from './partnershipHistory';

/**
 * Raised when the mandatory constraints admit no valid division at all.
 *
 * This is a DOMAIN REJECTION, not a technical failure: the solver worked correctly and the
 * answer is "no such division exists". Carrying a stable `code` lets the transport and the
 * UI distinguish it from a crashed worker without parsing the message, which is what
 * XS-W0-05 means by bounded-context stable error codes. The message stays user-facing
 * pt-BR; the code is the contract.
 */
export class InfeasibleConstraintsError extends Error {
  readonly code = 'INFEASIBLE_CONSTRAINTS' as const;

  constructor(message = 'Não existe solução viável para as restrições obrigatórias.') {
    super(message);
    this.name = 'InfeasibleConstraintsError';
  }
}

export const BALANCE_ALGORITHM_VERSION = 'simulated-annealing-v1';

// ─── Weight Profiles ─────────────────────────────────────────────────────────

// `gender` respeita um piso de GENDER_WEIGHT_FLOOR em todos os perfis (Fase B).
const MODE_WEIGHTS: Record<'balanced' | 'competitive' | 'social' | 'mixed', BalanceWeights> = {
  balanced: {
    attack: 1.2,
    defense: 1.1,
    setting: 1.2,
    block: 0.9,
    reception: 1.0,
    serve: 0.65,
    height: 0.5,
    gender: 0.8,
    injured: 1.0,
    teamSize: 2.0,
    roleCoverage: 1.3,
    consistency: 0.7,
    emotionalControl: 0.5,
    netPresence: 0.9,
    repetition: 0.8,
  },
  competitive: {
    attack: 1.6,
    defense: 1.4,
    setting: 1.6,
    block: 1.2,
    reception: 1.3,
    serve: 0.8,
    height: 0.5,
    gender: 0.6,
    injured: 0.5,
    teamSize: 2.0,
    roleCoverage: 1.5,
    consistency: 0.8,
    emotionalControl: 0.6,
    netPresence: 1.0,
    repetition: 0.8,
  },
  social: {
    attack: 0.5,
    defense: 0.5,
    setting: 0.6,
    block: 0.3,
    reception: 0.4,
    serve: 0.3,
    height: 0.2,
    gender: 1.5,
    injured: 1.8,
    teamSize: 3.0,
    roleCoverage: 0.6,
    consistency: 0.4,
    emotionalControl: 0.3,
    netPresence: 0.4,
    repetition: 0.8,
  },
  mixed: {
    attack: 0.8,
    defense: 0.8,
    setting: 1.0,
    block: 0.6,
    reception: 0.7,
    serve: 0.5,
    height: 0.4,
    gender: 2.0,
    injured: 1.0,
    teamSize: 2.5,
    roleCoverage: 1.0,
    consistency: 0.6,
    emotionalControl: 0.5,
    netPresence: 0.6,
    repetition: 0.8,
  },
};

// Piso de gênero: o equilíbrio de gênero é critério permanente em todos os perfis (Fase B).
export const GENDER_WEIGHT_FLOOR = 0.6;

// ─── Player Mapping & Technical Vectors ──────────────────────────────────────

export function netPresence(a: PlayerBalanceSnapshot): number {
  const heightFactor = ((a.heightCm || 170) - 160) / 30;
  const blockWeight = a.block * 0.45;
  const attackWeight = a.attack * 0.35;
  const positionBonus = a.position === 'central' || a.position === 'oposto' ? 0.75 : 0.0;
  return blockWeight + attackWeight + heightFactor * 2.0 + positionBonus;
}

// ─── Role Composition (Fase B — 5x1) ─────────────────────────────────────────

const COMPOSITION_ROLES: (keyof RoleComposition)[] = [
  'levantador',
  'libero',
  'central',
  'oposto',
  'ponteiro',
];

/**
 * Decide a composição viável por time antes do annealing.
 * 1 líbero por time se houver o suficiente; senão, fallback 2 centrais / 0 líbero.
 */
export function resolveComposition(
  athletes: PlayerBalanceSnapshot[],
  numTeams: number,
): { perTeam: RoleComposition; warnings: string[] } {
  const liberos = athletes.filter((a) => a.position === 'libero').length;
  const warnings: string[] = [];
  const useLibero = liberos >= numTeams;
  if (!useLibero) warnings.push('Líberos insuficientes → usando 2 centrais por time.');
  return {
    perTeam: {
      levantador: 1,
      ponteiro: 2,
      oposto: 1,
      central: useLibero ? 1 : 2,
      libero: useLibero ? 1 : 0,
    },
    warnings,
  };
}

/**
 * Conta quantos slots da composição alvo ficam descobertos em um time.
 * Cada jogador preenche no máximo um slot, na ordem: posição principal →
 * posição secundária → coringa (all-rounder).
 */
function computeCompositionDeficit(
  team: PlayerBalanceSnapshot[],
  perTeam: RoleComposition,
): number {
  const pool = team.slice();
  let deficit = 0;
  for (const role of COMPOSITION_ROLES) {
    let want = perTeam[role];
    if (want <= 0) continue;
    const takeBy = (pred: (a: PlayerBalanceSnapshot) => boolean) => {
      for (let i = pool.length - 1; i >= 0 && want > 0; i--) {
        if (pred(pool[i])) {
          pool.splice(i, 1);
          want--;
        }
      }
    };
    takeBy((a) => a.position === role);
    takeBy((a) => !!a.secondaryPositions?.includes(role));
    takeBy((a) => a.position === 'all-rounder');
    deficit += want;
  }
  return deficit;
}

// ─── Team Metrics ────────────────────────────────────────────────────────────

export function calculateTeamMetrics(
  teamIndex: number,
  athletes: PlayerBalanceSnapshot[],
): TeamMetrics {
  const size = athletes.length;
  if (size === 0) {
    return {
      teamIndex,
      size: 0,
      attack: 0,
      defense: 0,
      serve: 0,
      reception: 0,
      setting: 0,
      block: 0,
      speed: 0,
      stamina: 0,
      gameVision: 0,
      consistency: 0,
      emotionalControl: 0,
      averageHeight: 0,
      maleCount: 0,
      femaleCount: 0,
      injuredCount: 0,
      hasSetter: false,
      hasStrongAttacker: false,
      hasDefensiveReference: false,
      netPresence: 0,
    };
  }

  const sum = (fn: (a: PlayerBalanceSnapshot) => number) =>
    athletes.reduce((acc, a) => acc + fn(a), 0);
  const avg = (fn: (a: PlayerBalanceSnapshot) => number) => sum(fn) / size;

  const maleCount = athletes.filter((a) => a.gender === 'M').length;
  const femaleCount = athletes.filter((a) => a.gender === 'F').length;
  const injuredCount = athletes.filter((a) => a.isInjured).length;

  const hasSetter = athletes.some(
    (a) =>
      a.setting >= THRESHOLDS.setter ||
      a.position === 'levantador' ||
      a.secondaryPositions?.includes('levantador'),
  );
  const hasStrongAttacker = athletes.some((a) => a.attack >= THRESHOLDS.strongAttacker);
  const hasDefensiveReference = athletes.some(
    (a) =>
      a.defense >= THRESHOLDS.defensiveRef ||
      a.reception >= THRESHOLDS.defensiveRef ||
      a.position === 'libero',
  );

  return {
    teamIndex,
    size,
    attack: avg((a) => a.attack),
    defense: avg((a) => a.defense),
    serve: avg((a) => a.serve),
    reception: avg((a) => a.reception),
    setting: avg((a) => a.setting),
    block: avg((a) => a.block),
    speed: avg((a) => a.speed),
    stamina: avg((a) => a.stamina),
    gameVision: avg((a) => a.gameVision),
    consistency: avg((a) => a.consistency),
    emotionalControl: avg((a) => a.emotionalControl),
    averageHeight: avg((a) => a.heightCm || 175),
    maleCount,
    femaleCount,
    injuredCount,
    hasSetter,
    hasStrongAttacker,
    hasDefensiveReference,
    netPresence: avg(netPresence),
  };
}

function getSolutionFingerprint(solution: TeamSolution): string {
  const teamFingerprints = solution.teams.map((team) =>
    team
      .map((player) => player.participantId)
      .sort()
      .join(','),
  );
  return teamFingerprints.sort().join('|');
}

// ─── Objective Scorer ────────────────────────────────────────────────────────

export class ObjectiveScorer {
  public previousFingerprints: string[] = [];

  constructor(
    public weights: BalanceWeights,
    public totalFemales: number,
    public totalMales: number,
    public totalInjured: number,
    public numTeams: number,
    public rotationType: RotationType = '6x0',
    public composition?: RoleComposition,
    public partnershipMatrix?: PartnershipMatrix,
  ) {}

  score(
    solution: TeamSolution,
    constraints?: BalanceConstraints,
    ignoreDuplicates = false,
  ): number {
    const teamsMetrics = solution.teams.map((t, idx) => calculateTeamMetrics(idx, t));
    let penalty = 0;

    // 1. Hard Constraints: Forbidden Pairs
    if (constraints?.pairsSeparated) {
      for (const [p1, p2] of constraints.pairsSeparated) {
        for (const t of solution.teams) {
          const ids = t.map((a) => a.participantId);
          if (ids.includes(p1) && ids.includes(p2)) {
            penalty += PENALTIES.forbiddenPair;
          }
        }
      }
    }

    // 2. Hard Constraints: Together Pairs
    if (constraints?.pairsTogether) {
      for (const [p1, p2] of constraints.pairsTogether) {
        let sameTeam = false;
        for (const t of solution.teams) {
          const ids = t.map((a) => a.participantId);
          if (ids.includes(p1) && ids.includes(p2)) {
            sameTeam = true;
            break;
          }
        }
        if (!sameTeam) {
          penalty += PENALTIES.togetherPair;
        }
      }
    }

    // 3. Hard Constraints: Locked Assignments
    if (constraints?.lockedPlayerIdxs) {
      for (const [pid, targetIdx] of Object.entries(constraints.lockedPlayerIdxs)) {
        const currentIdx = solution.teams.findIndex((t) => t.some((a) => a.participantId === pid));
        if (currentIdx !== -1 && currentIdx !== targetIdx) {
          penalty += PENALTIES.lockedAssignment;
        }
      }
    }

    // 4. Hard Constraints: Team Size Limit Difference
    const teamSizes = teamsMetrics.map((m) => m.size);
    const minSize = Math.min(...teamSizes);
    const maxSize = Math.max(...teamSizes);
    if (maxSize - minSize > 1) {
      penalty += (maxSize - minSize) * PENALTIES.teamSizeDiff;
    }

    // Spreads calculation
    const weightedSpread = (values: number[], weight: number) => {
      if (values.length === 0) return 0;
      return (Math.max(...values) - Math.min(...values)) * weight;
    };

    const attackSpread = weightedSpread(
      teamsMetrics.map((m) => m.attack),
      this.weights.attack,
    );
    const defenseSpread = weightedSpread(
      teamsMetrics.map((m) => m.defense),
      this.weights.defense,
    );
    const settingSpread = weightedSpread(
      teamsMetrics.map((m) => m.setting),
      this.weights.setting,
    );
    const blockSpread = weightedSpread(
      teamsMetrics.map((m) => m.block),
      this.weights.block,
    );
    const receptionSpread = weightedSpread(
      teamsMetrics.map((m) => m.reception),
      this.weights.reception,
    );
    const serveSpread = weightedSpread(
      teamsMetrics.map((m) => m.serve),
      this.weights.serve,
    );
    const heightSpread = weightedSpread(
      teamsMetrics.map((m) => m.averageHeight),
      this.weights.height,
    );
    const consistencySpread = weightedSpread(
      teamsMetrics.map((m) => m.consistency),
      this.weights.consistency,
    );
    const emotionalSpread = weightedSpread(
      teamsMetrics.map((m) => m.emotionalControl),
      this.weights.emotionalControl,
    );
    const netPresenceSpread = weightedSpread(
      teamsMetrics.map((m) => m.netPresence),
      this.weights.netPresence,
    );

    // Gender balance penalty
    const expectedFemalePerTeam = calculateGenderDistribution(this.totalFemales, this.numTeams);
    let genderBalancePenalty = 0;
    teamsMetrics.forEach((m, idx) => {
      const expected = expectedFemalePerTeam[idx] || 0;
      genderBalancePenalty += Math.abs(m.femaleCount - expected);
    });
    genderBalancePenalty *= this.weights.gender * 5.0;

    // Injured penalty
    const maxExpectedInjured = Math.ceil(this.totalInjured / this.numTeams);
    let injuredPenalty = 0;
    teamsMetrics.forEach((m) => {
      if (m.injuredCount > maxExpectedInjured) {
        injuredPenalty += m.injuredCount - maxExpectedInjured;
      }
    });
    injuredPenalty *= this.weights.injured * 5.0;

    // Size penalty
    const expectedSizes = calculateTeamSizes(
      solution.teams.reduce((acc, t) => acc + t.length, 0),
      this.numTeams,
    );
    let teamSizePenalty = 0;
    teamsMetrics.forEach((m, idx) => {
      const expected = expectedSizes[idx] || 0;
      teamSizePenalty += Math.abs(m.size - expected);
    });
    teamSizePenalty *= this.weights.teamSize * 10.0;

    // Setter distribution penalty (considering primary and secondary)
    const totalPrimarySetters = solution.teams.reduce(
      (acc, t) => acc + t.filter((a) => a.position === 'levantador').length,
      0,
    );
    const totalSecondarySetters = solution.teams.reduce(
      (acc, t) =>
        acc +
        t.filter((a) => a.position !== 'levantador' && a.secondaryPositions?.includes('levantador'))
          .length,
      0,
    );

    if (totalPrimarySetters >= this.numTeams) {
      const minP = Math.floor(totalPrimarySetters / this.numTeams);
      const maxP = Math.ceil(totalPrimarySetters / this.numTeams);

      solution.teams.forEach((t) => {
        const pCount = t.filter((a) => a.position === 'levantador').length;
        if (pCount < minP) {
          penalty += (minP - pCount) * PENALTIES.setterSlot;
        } else if (pCount > maxP) {
          penalty += (pCount - maxP) * PENALTIES.setterSlot;
        }
        if (pCount === 0) {
          penalty += PENALTIES.setterMissing;
        }
      });
    } else {
      solution.teams.forEach((t) => {
        const pCount = t.filter((a) => a.position === 'levantador').length;
        if (pCount > 1) {
          penalty += (pCount - 1) * PENALTIES.setterSlot;
        }
      });

      const totalSetters = totalPrimarySetters + totalSecondarySetters;
      if (totalSetters > 0) {
        const minT = Math.floor(totalSetters / this.numTeams);
        const maxT = Math.ceil(totalSetters / this.numTeams);

        solution.teams.forEach((t) => {
          const pCount = t.filter((a) => a.position === 'levantador').length;
          const sCount = t.filter(
            (a) => a.position !== 'levantador' && a.secondaryPositions?.includes('levantador'),
          ).length;
          const tCount = pCount + sCount;

          if (tCount < minT) {
            penalty += (minT - tCount) * PENALTIES.setterSlot;
          } else if (tCount > maxT) {
            penalty += (tCount - maxT) * PENALTIES.setterSlot;
          }

          if (tCount === 0 && totalSetters >= this.numTeams) {
            penalty += PENALTIES.setterMissing;
          }
        });
      }
    }

    // Role coverage penalty
    let roleCoveragePenalty = 0;
    teamsMetrics.forEach((m) => {
      if (!m.hasSetter) roleCoveragePenalty += 15.0;
      if (!m.hasStrongAttacker) roleCoveragePenalty += 10.0;
      if (!m.hasDefensiveReference) roleCoveragePenalty += 10.0;
    });
    roleCoveragePenalty *= this.weights.roleCoverage;

    // Composition penalty (Fase B — 5x1): penaliza slots de papel descobertos
    let compositionPenalty = 0;
    if (this.rotationType === '5x1' && this.composition) {
      for (const team of solution.teams) {
        compositionPenalty +=
          computeCompositionDeficit(team, this.composition) * PENALTIES.compositionSlot;
      }

      // Penalidade leve: evitar que todas as mulheres caiam no mesmo papel.
      const females = solution.teams.flat().filter((a) => a.gender === 'F');
      if (females.length >= 2) {
        const distinctRoles = new Set(females.map((a) => a.position));
        if (distinctRoles.size === 1) compositionPenalty += 200;
      }
    }

    // 5. Duplicate penalty (avoid repeating options)
    if (!ignoreDuplicates && this.previousFingerprints && this.previousFingerprints.length > 0) {
      const fp = getSolutionFingerprint(solution);
      if (this.previousFingerprints.includes(fp)) {
        penalty += PENALTIES.duplicateSolution;
      }
    }

    // 6. Partnership Repetition Penalty
    let repetitionPenalty = 0;
    if (this.partnershipMatrix) {
      for (const team of solution.teams) {
        const ids = team.map((a) => a.participantId).sort();
        for (let i = 0; i < ids.length; i++) {
          for (let j = i + 1; j < ids.length; j++) {
            const key = `${ids[i]}|${ids[j]}`;
            repetitionPenalty += this.partnershipMatrix[key] ?? 0;
          }
        }
      }
      repetitionPenalty *= this.weights.repetition ?? 0.8;
    }

    return (
      penalty +
      attackSpread +
      defenseSpread +
      settingSpread +
      blockSpread +
      receptionSpread +
      serveSpread +
      heightSpread +
      consistencySpread +
      emotionalSpread +
      netPresenceSpread +
      genderBalancePenalty +
      injuredPenalty +
      teamSizePenalty +
      roleCoveragePenalty +
      compositionPenalty +
      repetitionPenalty
    );
  }
}

// ─── Initial Greedy Solution Builder ─────────────────────────────────────────

export class InitialTeamBuilder {
  constructor(public numTeams: number) {}

  buildInitialSolution(
    athletes: PlayerBalanceSnapshot[],
    constraints?: BalanceConstraints,
  ): TeamSolution {
    const teams: PlayerBalanceSnapshot[][] = Array.from({ length: this.numTeams }, () => []);
    const lockedPlayerIds = new Set<string>();

    // 1. Constrain locks constructively
    if (constraints?.lockedPlayerIdxs) {
      for (const [pid, targetIdx] of Object.entries(constraints.lockedPlayerIdxs)) {
        if (targetIdx >= 0 && targetIdx < this.numTeams) {
          const athlete = athletes.find((a) => a.participantId === pid);
          if (athlete) {
            teams[targetIdx].push(athlete);
            lockedPlayerIds.add(pid);
          }
        }
      }
    }

    const remaining = athletes
      .filter((athlete) => !lockedPlayerIds.has(athlete.participantId))
      .sort((left, right) => left.participantId.localeCompare(right.participantId));

    const chooseByTuple = (candidates: Array<{ index: number; tuple: number[] }>): number =>
      candidates.sort((left, right) => {
        for (let index = 0; index < left.tuple.length; index++) {
          const difference = left.tuple[index] - right.tuple[index];
          if (difference !== 0) return difference;
        }
        return left.index - right.index;
      })[0]?.index ?? 0;

    const remainingPrimarySetters = remaining.filter((a) => a.position === 'levantador');
    const remainingSecondarySetters = remaining.filter(
      (a) => a.position !== 'levantador' && a.secondaryPositions?.includes('levantador'),
    );
    const remainingOthers = remaining.filter(
      (a) => a.position !== 'levantador' && !a.secondaryPositions?.includes('levantador'),
    );

    // Um atleta sem genero declarado (null, ex: conta recem-criada) nao entra
    // na cota de F nem de M — mas ainda precisa ser colocado em algum time.
    // O split abaixo particiona em 3 grupos (nao 2), garantindo que a uniao
    // sempre cubra o array de entrada, independente do genero.
    const byGender = (list: PlayerBalanceSnapshot[]) => ({
      females: list.filter((a) => a.gender === 'F'),
      males: list.filter((a) => a.gender === 'M'),
      unspecified: list.filter((a) => a.gender !== 'F' && a.gender !== 'M'),
    });

    const {
      females: remainingPrimarySettersFemales,
      males: remainingPrimarySettersMales,
      unspecified: remainingPrimarySettersUnspecified,
    } = byGender(remainingPrimarySetters);

    const {
      females: remainingSecondarySettersFemales,
      males: remainingSecondarySettersMales,
      unspecified: remainingSecondarySettersUnspecified,
    } = byGender(remainingSecondarySetters);

    const {
      females: remainingOthersFemales,
      males: remainingOthersMales,
      unspecified: remainingOthersUnspecified,
    } = byGender(remainingOthers);

    const expectedSizes = calculateTeamSizes(athletes.length, this.numTeams);

    const placeSetterGreedy = (athlete: PlayerBalanceSnapshot, isPrimary: boolean) => {
      const available = teams
        .map((team, teamIndex) => ({ team, teamIndex }))
        .filter(({ team, teamIndex }) => team.length < (expectedSizes[teamIndex] || 0));
      const candidates = (
        available.length ? available : teams.map((team, teamIndex) => ({ team, teamIndex }))
      ).map(({ team, teamIndex }) => {
        const primaryCount = team.filter((item) => item.position === 'levantador').length;
        const secondaryCount = team.filter(
          (item) =>
            item.position !== 'levantador' && item.secondaryPositions?.includes('levantador'),
        ).length;
        const setterCount = isPrimary ? primaryCount : primaryCount + secondaryCount;
        return { index: teamIndex, tuple: [setterCount, team.length, teamIndex] };
      });
      const bestIdx = chooseByTuple(candidates);
      teams[bestIdx].push(athlete);
    };

    const placeGreedy = (athlete: PlayerBalanceSnapshot) => {
      const available = teams
        .map((team, teamIndex) => ({ team, teamIndex }))
        .filter(({ team, teamIndex }) => team.length < (expectedSizes[teamIndex] || 0));
      const candidates = (
        available.length ? available : teams.map((team, teamIndex) => ({ team, teamIndex }))
      ).map(({ team, teamIndex }) => ({
        index: teamIndex,
        tuple: [team.length, teamIndex],
      }));
      const bestIdx = chooseByTuple(candidates);
      teams[bestIdx].push(athlete);
    };

    // Place primary setters (females then males then genero nao informado)
    remainingPrimarySettersFemales.forEach((f) => placeSetterGreedy(f, true));
    remainingPrimarySettersMales.forEach((m) => placeSetterGreedy(m, true));
    remainingPrimarySettersUnspecified.forEach((u) => placeSetterGreedy(u, true));

    // Place secondary setters (females then males then genero nao informado)
    remainingSecondarySettersFemales.forEach((f) => placeSetterGreedy(f, false));
    remainingSecondarySettersMales.forEach((m) => placeSetterGreedy(m, false));
    remainingSecondarySettersUnspecified.forEach((u) => placeSetterGreedy(u, false));

    // Place others (females then males then genero nao informado)
    remainingOthersFemales.forEach(placeGreedy);
    remainingOthersMales.forEach(placeGreedy);
    remainingOthersUnspecified.forEach(placeGreedy);

    return { teams };
  }
}

// ─── Neighbor Generation (Strategy-based) ────────────────────────────────────
//
// Cada movimento vizinho do Simulated Annealing é uma `MutationStrategy`
// isolada. Adicionar um movimento novo = criar a função + dar push no array
// `mutationStrategies`, sem tocar nos movimentos que já funcionam (Open/Closed).
// O `generateNeighbor` é o único dono do clone: as estratégias recebem a cópia
// e a mutam no lugar, nunca o `current`.

/** Jogadores de um time que não estão travados (locked) em uma equipe fixa. */
function getNonLocked(
  team: PlayerBalanceSnapshot[],
  constraints: BalanceConstraints | undefined,
): PlayerBalanceSnapshot[] {
  return team.filter((a) => {
    if (!constraints?.lockedPlayerIdxs) return true;
    return constraints.lockedPlayerIdxs[a.participantId] === undefined;
  });
}

interface MutationStrategy {
  /** Probabilidade relativa de a estratégia ser sorteada por iteração. */
  weight: number;
  /** Muta `teams` (já clonado) no lugar. Não deve tocar o `current` original. */
  execute: (
    teams: PlayerBalanceSnapshot[][],
    constraints: BalanceConstraints | undefined,
    random: () => number,
  ) => void;
}

const mutationStrategies: MutationStrategy[] = [
  {
    // Swap 1x1: troca um jogador não-travado entre dois times distintos.
    weight: 0.8,
    execute: (teams, constraints, random) => {
      const numTeams = teams.length;
      const t1 = Math.floor(random() * numTeams);
      const t2 = (t1 + Math.floor(random() * (numTeams - 1)) + 1) % numTeams;

      const p1List = getNonLocked(teams[t1], constraints);
      const p2List = getNonLocked(teams[t2], constraints);

      if (p1List.length > 0 && p2List.length > 0) {
        const p1 = p1List[Math.floor(random() * p1List.length)];
        const p2 = p2List[Math.floor(random() * p2List.length)];

        teams[t1] = teams[t1].map((a) => (a.participantId === p1.participantId ? p2 : a));
        teams[t2] = teams[t2].map((a) => (a.participantId === p2.participantId ? p1 : a));
      }
    },
  },
  {
    // Move: realoca um jogador de um time maior para um menor (mantém tamanhos).
    weight: 0.15,
    execute: (teams, constraints, random) => {
      const numTeams = teams.length;
      const teamSizes = teams.map((t) => t.length);
      const minSize = Math.min(...teamSizes);
      const maxSize = Math.max(...teamSizes);

      const t1Candidates: number[] = [];
      const t2Candidates: number[] = [];

      for (let i = 0; i < numTeams; i++) {
        if (teams[i].length > minSize) t1Candidates.push(i);
        if (teams[i].length < maxSize) t2Candidates.push(i);
      }

      if (t1Candidates.length > 0 && t2Candidates.length > 0) {
        const t1 = t1Candidates[Math.floor(random() * t1Candidates.length)];
        const t2 = t2Candidates[Math.floor(random() * t2Candidates.length)];

        const pList = getNonLocked(teams[t1], constraints);
        if (pList.length > 0) {
          const p = pList[Math.floor(random() * pList.length)];
          teams[t1] = teams[t1].filter((a) => a.participantId !== p.participantId);
          teams[t2].push(p);
        }
      }
    },
  },
  {
    // Weakness-targeted swap: equaliza um fundamento trocando o melhor jogador
    // do time forte pelo pior do time fraco naquele fundamento.
    weight: 0.05,
    execute: (teams, constraints, random) => {
      const numTeams = teams.length;
      const categories: (keyof PlayerBalanceSnapshot)[] = [
        'setting',
        'reception',
        'attack',
        'defense',
        'block',
      ];
      const cat = categories[Math.floor(random() * categories.length)];

      let tWeak = 0;
      let minCatVal = Infinity;
      let tStrong = 0;
      let maxCatVal = -Infinity;

      for (let i = 0; i < numTeams; i++) {
        const avgVal =
          teams[i].reduce((acc, a) => acc + (a[cat] as number), 0) / (teams[i].length || 1);
        if (avgVal < minCatVal) {
          minCatVal = avgVal;
          tWeak = i;
        }
        if (avgVal > maxCatVal) {
          maxCatVal = avgVal;
          tStrong = i;
        }
      }

      if (tWeak !== tStrong) {
        const pWeakList = getNonLocked(teams[tWeak], constraints).sort(
          (a, b) => (a[cat] as number) - (b[cat] as number),
        );
        const pStrongList = getNonLocked(teams[tStrong], constraints).sort(
          (a, b) => (b[cat] as number) - (a[cat] as number),
        );

        if (pWeakList.length > 0 && pStrongList.length > 0) {
          const pWeak = pWeakList[0];
          const pStrong = pStrongList[0];

          teams[tWeak] = teams[tWeak].map((a) =>
            a.participantId === pWeak.participantId ? pStrong : a,
          );
          teams[tStrong] = teams[tStrong].map((a) =>
            a.participantId === pStrong.participantId ? pWeak : a,
          );
        }
      }
    },
  },
];

// Soma dos pesos pré-computada: normaliza o sorteio sem exigir que somem 1.
const TOTAL_MUTATION_WEIGHT = mutationStrategies.reduce((acc, s) => acc + s.weight, 0);

/**
 * Sorteia uma estratégia por soma cumulativa, consumindo exatamente um random().
 * Com os pesos atuais (0.80 / 0.15 / 0.05) os limiares coincidem com os antigos
 * (< 0.80, < 0.95), então o resultado por seed é idêntico ao if/else anterior.
 */
function pickMutationStrategy(random: () => number): MutationStrategy {
  let r = random() * TOTAL_MUTATION_WEIGHT;
  for (const strategy of mutationStrategies) {
    r -= strategy.weight;
    if (r < 0) return strategy;
  }
  return mutationStrategies[mutationStrategies.length - 1];
}

function generateNeighbor(
  current: TeamSolution,
  constraints: BalanceConstraints | undefined,
  random: () => number,
): TeamSolution {
  // Único ponto de clone: a estratégia muta esta cópia, nunca o `current`.
  const teams = current.teams.map((t) => [...t]);
  const strategy = pickMutationStrategy(random);
  strategy.execute(teams, constraints, random);
  return { teams };
}

function isFeasible(solution: TeamSolution, constraints: BalanceConstraints | undefined): boolean {
  if (solution.teams.some((t) => t.length === 0)) return false;

  if (constraints?.lockedPlayerIdxs) {
    for (const [pid, targetIdx] of Object.entries(constraints.lockedPlayerIdxs)) {
      const currentIdx = solution.teams.findIndex((t) => t.some((a) => a.participantId === pid));
      if (currentIdx !== -1 && currentIdx !== targetIdx) return false;
    }
  }

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

  const sizes = solution.teams.map((t) => t.length);
  if (Math.max(...sizes) - Math.min(...sizes) > 1) return false;

  return true;
}

// ─── Seeded Random Generator ──────────────────────────────────────────────────

function createSeededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

// ─── Quality Labeling & Diagnostics ──────────────────────────────────────────

export function getQualityLabel(score: number): BalanceQuality {
  if (score < QUALITY.excellent) return 'EXCELLENT';
  if (score < QUALITY.good) return 'GOOD';
  if (score < QUALITY.acceptable) return 'ACCEPTABLE';
  return 'UNBALANCED';
}

function buildBalanceDiagnostics(
  solution: TeamSolution,
  weights: BalanceWeights,
  objectiveScore: number,
  totalFemales: number,
  totalMales: number,
  totalInjured: number,
  numTeams: number,
  _constraints: BalanceConstraints | undefined,
): CanonicalBalanceDiagnostics {
  const metrics = solution.teams.map((t, idx) => calculateTeamMetrics(idx, t));
  const getSpread = (values: number[]) => {
    if (values.length === 0) return 0;
    return Math.max(...values) - Math.min(...values);
  };

  const attackSpread = getSpread(metrics.map((m) => m.attack));
  const defenseSpread = getSpread(metrics.map((m) => m.defense));
  const settingSpread = getSpread(metrics.map((m) => m.setting));
  const blockSpread = getSpread(metrics.map((m) => m.block));
  const receptionSpread = getSpread(metrics.map((m) => m.reception));
  const heightSpread = getSpread(metrics.map((m) => m.averageHeight));

  const expectedFemalePerTeam = calculateGenderDistribution(totalFemales, numTeams);
  let genderBalancePenalty = 0;
  metrics.forEach((m, idx) => {
    const expected = expectedFemalePerTeam[idx] || 0;
    genderBalancePenalty += Math.abs(m.femaleCount - expected);
  });
  genderBalancePenalty *= weights.gender * 5.0;

  const maxExpectedInjured = Math.ceil(totalInjured / numTeams);
  let injuredPenalty = 0;
  metrics.forEach((m) => {
    if (m.injuredCount > maxExpectedInjured) {
      injuredPenalty += m.injuredCount - maxExpectedInjured;
    }
  });
  injuredPenalty *= weights.injured * 5.0;

  let roleCoveragePenalty = 0;
  metrics.forEach((m) => {
    if (!m.hasSetter) roleCoveragePenalty += 15.0;
    if (!m.hasStrongAttacker) roleCoveragePenalty += 10.0;
    if (!m.hasDefensiveReference) roleCoveragePenalty += 10.0;
  });
  roleCoveragePenalty *= weights.roleCoverage;

  const expectedSizes = calculateTeamSizes(
    solution.teams.reduce((acc, t) => acc + t.length, 0),
    numTeams,
  );
  let teamSizePenalty = 0;
  metrics.forEach((m, idx) => {
    const expected = expectedSizes[idx] || 0;
    teamSizePenalty += Math.abs(m.size - expected);
  });
  teamSizePenalty *= weights.teamSize * 10.0;

  const warnings: string[] = [];

  const totalPrimary = solution.teams.reduce(
    (acc, t) => acc + t.filter((a) => a.position === 'levantador').length,
    0,
  );
  const totalSecondary = solution.teams.reduce(
    (acc, t) =>
      acc +
      t.filter((a) => a.position !== 'levantador' && a.secondaryPositions?.includes('levantador'))
        .length,
    0,
  );

  metrics.forEach((m, idx) => {
    const teamAthletes = solution.teams[idx] || [];
    const mainSetterCount = teamAthletes.filter((a) => a.position === 'levantador').length;
    const secondarySetterCount = teamAthletes.filter(
      (a) => a.position !== 'levantador' && a.secondaryPositions?.includes('levantador'),
    ).length;
    const totalSetterCountForTeam = mainSetterCount + secondarySetterCount;

    if (totalPrimary >= numTeams) {
      if (mainSetterCount === 0) {
        warnings.push(`Time ${idx + 1} sem jogador cuja posição principal é Levantador.`);
      }
    } else {
      if (totalSetterCountForTeam === 0 && totalPrimary + totalSecondary >= numTeams) {
        warnings.push(`Time ${idx + 1} sem levantador (principal ou secundário).`);
      }
    }

    if (!m.hasSetter && totalSetterCountForTeam === 0) {
      warnings.push(`Time ${idx + 1} sem levantador forte ou atleta na posição de Levantador.`);
    }
    if (!m.hasStrongAttacker) {
      warnings.push(`Time ${idx + 1} sem atacante de referência (ataque >= 7.0).`);
    }
    if (!m.hasDefensiveReference) {
      warnings.push(
        `Time ${idx + 1} com vulnerabilidade defensiva (sem referência com defesa/recepção >= 7.0).`,
      );
    }
    if (m.injuredCount > 1) {
      warnings.push(`Time ${idx + 1} possui múltiplos jogadores lesionados (${m.injuredCount}).`);
    }
  });

  if (objectiveScore > 5000) {
    warnings.push(
      'Não foi possível atender a todas as restrições obrigatórias com equilíbrio perfeito.',
    );
  }

  return {
    objectiveScore,
    qualityLabel: getQualityLabel(objectiveScore),
    attackSpread,
    defenseSpread,
    settingSpread,
    blockSpread,
    receptionSpread,
    heightSpread,
    genderBalancePenalty,
    genderSpread: getSpread(metrics.map((m) => m.femaleCount)),
    injuredPenalty,
    injuredSpread: getSpread(metrics.map((m) => m.injuredCount)),
    roleCoveragePenalty,
    teamSizePenalty,
    warnings,
  };
}

// ─── Simulated Annealing Core Balancer ───────────────────────────────────────

export class SimulatedAnnealingBalancer {
  constructor(
    private initialBuilder: InitialTeamBuilder,
    private scorer: ObjectiveScorer,
  ) {}

  balance(
    athletes: PlayerBalanceSnapshot[],
    constraints: BalanceConstraints | undefined,
    maxIterations: number,
    seed: number,
    onProgress?: (fraction: number, bestScore: number, best: TeamSolution) => void,
  ): { solution: TeamSolution; score: number; iterations: number } {
    const random = createSeededRandom(seed);
    let current = this.initialBuilder.buildInitialSolution(athletes, constraints);
    let currentScore = this.scorer.score(current, constraints);

    let best: TeamSolution | undefined = isFeasible(current, constraints) ? current : undefined;
    let bestScore = best ? currentScore : Number.POSITIVE_INFINITY;

    // Initial temperature: 25% of initial score, clamped between 1.0 and 50.0
    let temperature = Math.min(50.0, Math.max(1.0, currentScore * 0.25));

    let iterations = 0;
    let iterationsWithoutImprovement = 0;
    const maxNoImprovement = Math.max(2000, Math.floor(maxIterations * 0.8));
    // Emite progresso a cada ~2% das iterações (sem onProgress, nada muda).
    const progressEvery = Math.max(1, Math.floor(maxIterations / 50));

    while (iterations < maxIterations && iterationsWithoutImprovement < maxNoImprovement) {
      const candidate = generateNeighbor(current, constraints, random);
      const candidateScore = this.scorer.score(candidate, constraints);

      // Decission criteria
      let accept = false;
      if (candidateScore < currentScore) {
        accept = true;
      } else {
        const delta = candidateScore - currentScore;
        const probability = Math.exp(-delta / temperature);
        if (random() < probability) {
          accept = true;
        }
      }

      if (accept) {
        current = candidate;
        currentScore = candidateScore;
      }

      // Track the absolute best feasible solution
      if (isFeasible(candidate, constraints) && candidateScore < bestScore) {
        best = candidate;
        bestScore = candidateScore;
        iterationsWithoutImprovement = 0;
      } else {
        iterationsWithoutImprovement++;
      }

      // Cooling rate
      temperature *= 0.995;
      iterations++;

      if (onProgress && best && iterations % progressEvery === 0) {
        onProgress(Math.min(1, iterations / maxIterations), bestScore, best);
      }
    }

    if (!best) {
      throw new InfeasibleConstraintsError();
    }

    return { solution: best, score: this.scorer.score(best, constraints, true), iterations };
  }
}

// Quantos jogadores compartilham o mesmo time entre duas soluções (0 = idênticas)
export function solutionDistance(a: TeamSolution, b: TeamSolution): number {
  const numTeams = a.teams.length;
  const bTeams = b.teams.map((t) => new Set(t.map((player) => player.participantId)));
  const aTeams = a.teams.map((t) => t.map((player) => player.participantId));

  let totalOverlap = 0;
  const matchedB = new Set<number>();

  for (let i = 0; i < numTeams; i++) {
    const aPlayers = aTeams[i];
    let bestOverlap = 0;
    let bestBIdx = -1;

    for (let j = 0; j < numTeams; j++) {
      if (matchedB.has(j)) continue;
      let overlap = 0;
      for (const pId of aPlayers) {
        if (bTeams[j].has(pId)) {
          overlap++;
        }
      }
      if (overlap > bestOverlap) {
        bestOverlap = overlap;
        bestBIdx = j;
      }
    }

    if (bestBIdx !== -1) {
      matchedB.add(bestBIdx);
      totalOverlap += bestOverlap;
    } else {
      // Find any unmatched team in B
      for (let j = 0; j < numTeams; j++) {
        if (!matchedB.has(j)) {
          matchedB.add(j);
          break;
        }
      }
    }
  }

  const totalPlayers = a.teams.reduce((acc, t) => acc + t.length, 0);
  return totalPlayers - totalOverlap;
}

export function selectPortfolio(
  candidates: BalanceCandidate[],
  k = 3,
  minDistance = 2,
): BalanceCandidate[] {
  const sorted = [...candidates].sort((a, b) => a.score - b.score);
  if (sorted.length === 0) return [];

  const chosen: BalanceCandidate[] = [sorted[0]]; // melhor de todos
  for (const c of sorted.slice(1)) {
    if (chosen.length >= k) break;
    const distinct = chosen.every(
      (selected) => solutionDistance(c.solution, selected.solution) >= minDistance,
    );
    if (distinct) {
      chosen.push(c);
    }
  }

  // se não achar k distintas, completa com as melhores restantes
  if (chosen.length < k) {
    for (const c of sorted) {
      if (chosen.length >= k) break;
      if (!chosen.some((s) => s.seed === c.seed)) {
        chosen.push(c);
      }
    }
  }
  return chosen;
}

export function resolveBalanceWeights(
  config: TournamentConfig | FreePlayConfig | undefined,
): BalanceWeights {
  const balanceMode = config?.balanceMode || 'balanced';
  const weights = { ...(MODE_WEIGHTS[balanceMode] || MODE_WEIGHTS.balanced) };
  weights.gender = Math.max(weights.gender, GENDER_WEIGHT_FLOOR);
  weights.repetition =
    config && typeof config.repetitionWeight === 'number' ? config.repetitionWeight : 0.8;
  return weights;
}

export function evaluateTeamSolution(
  solution: TeamSolution,
  config: TournamentConfig | FreePlayConfig | undefined,
  partnershipMatrix?: PartnershipMatrix,
): { score: number; diagnostics: CanonicalBalanceDiagnostics } {
  const snapshots = solution.teams.flat();
  const numTeams = config?.teamCount || solution.teams.length;
  const weights = resolveBalanceWeights(config);
  const totalFemales = snapshots.filter((snapshot) => snapshot.gender === 'F').length;
  const totalMales = snapshots.filter((snapshot) => snapshot.gender === 'M').length;
  const totalInjured = snapshots.filter((snapshot) => snapshot.isInjured).length;
  const rotationType: RotationType = config?.rotationType ?? '6x0';
  const composition =
    rotationType === '5x1' ? resolveComposition(snapshots, numTeams).perTeam : undefined;
  const scorer = new ObjectiveScorer(
    weights,
    totalFemales,
    totalMales,
    totalInjured,
    numTeams,
    rotationType,
    composition,
    partnershipMatrix,
  );
  const constraints = config?.balanceConstraints || {};
  const score = scorer.score(solution, constraints, true);
  return {
    score,
    diagnostics: buildBalanceDiagnostics(
      solution,
      weights,
      score,
      totalFemales,
      totalMales,
      totalInjured,
      numTeams,
      constraints,
    ),
  };
}

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

export function balanceSnapshots(
  snapshots: PlayerBalanceSnapshot[],
  numTeams: number,
  config?: TournamentConfig | FreePlayConfig,
  onProgress?: (percent: number, bestScore: number) => void,
  partnershipMatrix?: PartnershipMatrix,
  budget?: { seeds: number; maxIterations: number },
): BalanceCandidate[] {
  const balanceSpeed = config?.balanceSpeed || 'advanced';
  const constraints = config?.balanceConstraints || {};
  const weights = resolveBalanceWeights(config);
  const totalFemales = snapshots.filter((snapshot) => snapshot.gender === 'F').length;
  const totalMales = snapshots.filter((snapshot) => snapshot.gender === 'M').length;
  const totalInjured = snapshots.filter((snapshot) => snapshot.isInjured).length;
  const rotationType: RotationType = config?.rotationType ?? '6x0';
  const composition =
    rotationType === '5x1' ? resolveComposition(snapshots, numTeams).perTeam : undefined;
  const scorer = new ObjectiveScorer(
    weights,
    totalFemales,
    totalMales,
    totalInjured,
    numTeams,
    rotationType,
    composition,
    partnershipMatrix,
  );
  const balancer = new SimulatedAnnealingBalancer(new InitialTeamBuilder(numTeams), scorer);
  const resolvedBudget = budget ?? deriveFormationBudget(balanceSpeed, snapshots.length);
  const maxIterations = resolvedBudget.maxIterations;
  const numSeeds = resolvedBudget.seeds;

  const baseSeed = config?.balanceSeed ?? 42;
  const seeds = Array.from({ length: numSeeds }, (_, index) => baseSeed + index * 101);
  const results = seeds.map((seed, seedIndex): BalanceCandidate => {
    const runStartTime = Date.now();
    const { solution, score, iterations } = balancer.balance(
      snapshots,
      constraints,
      maxIterations,
      seed,
      onProgress
        ? (fraction, bestScore) => {
            const percent = Math.min(99, Math.round(((seedIndex + fraction) / numSeeds) * 100));
            onProgress(percent, bestScore);
          }
        : undefined,
    );
    scorer.previousFingerprints.push(getSolutionFingerprint(solution));
    return {
      solution,
      score,
      diagnostics: buildBalanceDiagnostics(
        solution,
        weights,
        score,
        totalFemales,
        totalMales,
        totalInjured,
        numTeams,
        constraints,
      ),
      algorithm: 'Simulated Annealing (Smart Balance Engine)',
      seed,
      iterations,
      runtimeMillis: Date.now() - runStartTime,
    };
  });

  const sorted = selectPortfolio(results, 3, 2).sort((left, right) => left.score - right.score);
  if (onProgress) onProgress(100, sorted[0]?.score ?? 0);
  return sorted;
}
