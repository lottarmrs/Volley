import {
  Player,
  Division,
  Team,
  TournamentConfig,
  FreePlayConfig,
  BalanceWeights,
  BalanceConstraints,
  AthleteVector,
  TeamMetrics,
  TeamSolution,
  BalanceQuality,
  BalanceDiagnostics,
  TeamStrengthSnapshot,
  RoleComposition,
  RotationType,
} from '../types';
import {
  calculateTeamStrength,
  calculateGenderDistribution,
  calculateTeamSizes,
  calculateGeneralOverall,
} from './calculations';
import { OVERALL_SCALE, PENALTIES, THRESHOLDS, QUALITY } from './balancingConstants';
import { PartnershipMatrix } from './partnershipHistory';

// ─── Weight Profiles ─────────────────────────────────────────────────────────

// Pesos recalibrados para a escala normalizada (Fase A): com overall e
// fundamentos na mesma faixa (0–10), os pesos passam a ter efeito real.
// O domínio do `overall` foi reduzido e os fundamentos ganharam peso de verdade.
// `gender` respeita um piso de GENDER_WEIGHT_FLOOR em todos os perfis (Fase B).
const MODE_WEIGHTS: Record<'balanced' | 'competitive' | 'social' | 'mixed', BalanceWeights> = {
  balanced: {
    overall: 1.0,
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
    overall: 1.0,
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
    overall: 0.8,
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
    overall: 0.9,
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

const SPEED_CONFIG: Record<
  'fast' | 'normal' | 'advanced',
  { maxIterations: number; timeLimitMillis: number }
> = {
  fast: { maxIterations: 3000, timeLimitMillis: 500 },
  normal: { maxIterations: 8000, timeLimitMillis: 1500 },
  // O cálculo roda em um Web Worker, então a UI não congela: cobrimos mais
  // possibilidades sem prejudicar a responsividade.
  advanced: { maxIterations: 40000, timeLimitMillis: 5000 },
};

// ─── Player Mapping & Technical Vectors ──────────────────────────────────────

export function mapPlayerToAthleteVector(p: Player): AthleteVector {
  return {
    id: p.id,
    name: p.apelido || p.nome,
    overall: calculateGeneralOverall(p),
    attack: p.atributos.ataque,
    defense: p.atributos.defesa,
    serve: p.atributos.saque,
    reception: p.atributos.recepcao,
    setting: p.atributos.levantamento,
    block: p.atributos.bloqueio,
    speed: p.atributos.velocidade,
    stamina: p.atributos.resistencia,
    gameVision: p.atributos.leituraDeJogo,
    consistency: p.atributos.regularidade,
    emotionalControl: p.atributos.controleEmocional,
    heightCm: p.alturaCm ?? null,
    gender: p.genero,
    position: p.posicaoPrincipal,
    secondaryPositions: p.posicoesSecundarias || [],
    isInjured: p.status.lesionado,
    currentForm: p.formaAtual.valor,
  };
}

export function adjustedOverall(a: AthleteVector): number {
  // overall (de calculateGeneralOverall) já incorpora forma e altura.
  // Lesão é tratada exclusivamente no termo injuredPenalty do scorer,
  // evitando dupla contagem.
  return a.overall;
}

export function netPresence(a: AthleteVector): number {
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
  athletes: AthleteVector[],
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
function computeCompositionDeficit(team: AthleteVector[], perTeam: RoleComposition): number {
  const pool = team.slice();
  let deficit = 0;
  for (const role of COMPOSITION_ROLES) {
    let want = perTeam[role];
    if (want <= 0) continue;
    const takeBy = (pred: (a: AthleteVector) => boolean) => {
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

export function calculateTeamMetrics(teamIndex: number, athletes: AthleteVector[]): TeamMetrics {
  const size = athletes.length;
  if (size === 0) {
    return {
      teamIndex,
      size: 0,
      overall: 0,
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
      averageForm: 0,
    };
  }

  const sum = (fn: (a: AthleteVector) => number) => athletes.reduce((acc, a) => acc + fn(a), 0);
  const avg = (fn: (a: AthleteVector) => number) => sum(fn) / size;

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
    overall: avg(adjustedOverall),
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
    averageForm: avg((a) => a.currentForm),
  };
}

function getSolutionFingerprint(solution: TeamSolution): string {
  const teamFingerprints = solution.teams.map((team) =>
    team
      .map((player) => player.id)
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
          const ids = t.map((a) => a.id);
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
          const ids = t.map((a) => a.id);
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
        const currentIdx = solution.teams.findIndex((t) => t.some((a) => a.id === pid));
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

    const overallSpread = weightedSpread(
      teamsMetrics.map((m) => m.overall / OVERALL_SCALE), // 0–100 → mesma faixa dos fundamentos (0–10)
      this.weights.overall,
    );
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
        compositionPenalty += computeCompositionDeficit(team, this.composition) * PENALTIES.compositionSlot;
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
        const ids = team.map((a) => a.id).sort();
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
      overallSpread +
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

  buildInitialSolution(athletes: AthleteVector[], constraints?: BalanceConstraints): TeamSolution {
    const teams: AthleteVector[][] = Array.from({ length: this.numTeams }, () => []);
    const lockedPlayerIds = new Set<string>();

    // 1. Constrain locks constructively
    if (constraints?.lockedPlayerIdxs) {
      for (const [pid, targetIdx] of Object.entries(constraints.lockedPlayerIdxs)) {
        if (targetIdx >= 0 && targetIdx < this.numTeams) {
          const athlete = athletes.find((a) => a.id === pid);
          if (athlete) {
            teams[targetIdx].push(athlete);
            lockedPlayerIds.add(pid);
          }
        }
      }
    }

    // 2. Sort remaining athletes by overall
    const remaining = athletes
      .filter((a) => !lockedPlayerIds.has(a.id))
      .sort((a, b) => adjustedOverall(b) - adjustedOverall(a));

    const remainingPrimarySetters = remaining.filter((a) => a.position === 'levantador');
    const remainingSecondarySetters = remaining.filter(
      (a) => a.position !== 'levantador' && a.secondaryPositions?.includes('levantador'),
    );
    const remainingOthers = remaining.filter(
      (a) => a.position !== 'levantador' && !a.secondaryPositions?.includes('levantador'),
    );

    const remainingPrimarySettersFemales = remainingPrimarySetters.filter((a) => a.gender === 'F');
    const remainingPrimarySettersMales = remainingPrimarySetters.filter((a) => a.gender === 'M');

    const remainingSecondarySettersFemales = remainingSecondarySetters.filter(
      (a) => a.gender === 'F',
    );
    const remainingSecondarySettersMales = remainingSecondarySetters.filter(
      (a) => a.gender === 'M',
    );

    const remainingOthersFemales = remainingOthers.filter((a) => a.gender === 'F');
    const remainingOthersMales = remainingOthers.filter((a) => a.gender === 'M');

    const totalFemales = athletes.filter((a) => a.gender === 'F').length;
    const expectedFemalesPerTeam = calculateGenderDistribution(totalFemales, this.numTeams);
    const expectedSizes = calculateTeamSizes(athletes.length, this.numTeams);

    // Place setter greedily trying to balance setter counts and total overall score
    const placeSetterGreedy = (athlete: AthleteVector, isPrimary: boolean) => {
      let bestIdx = 0;
      let minSetters = Infinity;
      let minOverallSum = Infinity;

      for (let i = 0; i < this.numTeams; i++) {
        const team = teams[i];
        const limitSize = expectedSizes[i] || 0;
        if (team.length >= limitSize) continue;

        const pCount = team.filter((a) => a.position === 'levantador').length;
        const sCount = team.filter(
          (a) => a.position !== 'levantador' && a.secondaryPositions?.includes('levantador'),
        ).length;
        const countToCompare = isPrimary ? pCount : pCount + sCount;

        const teamOverallSum = team.reduce((acc, a) => acc + adjustedOverall(a), 0);

        if (countToCompare < minSetters) {
          minSetters = countToCompare;
          minOverallSum = teamOverallSum;
          bestIdx = i;
        } else if (countToCompare === minSetters) {
          if (teamOverallSum < minOverallSum) {
            minOverallSum = teamOverallSum;
            bestIdx = i;
          }
        }
      }

      if (minSetters === Infinity) {
        // Fallback to min size team
        let minSize = Infinity;
        for (let i = 0; i < this.numTeams; i++) {
          if (teams[i].length < minSize) {
            minSize = teams[i].length;
            bestIdx = i;
          }
        }
      }

      teams[bestIdx].push(athlete);
    };

    // Place player greedily trying to balance total overall score
    const placeGreedy = (athlete: AthleteVector, isFemale: boolean) => {
      let bestIdx = 0;
      let minOverallSum = Infinity;

      for (let i = 0; i < this.numTeams; i++) {
        const team = teams[i];
        const limitSize = expectedSizes[i] || 0;
        if (team.length >= limitSize) continue;

        if (isFemale) {
          const femaleLimit = expectedFemalesPerTeam[i] || 0;
          const currentFemales = team.filter((a) => a.gender === 'F').length;
          // Try to preserve gender quotas
          if (currentFemales >= femaleLimit && team.length >= limitSize - 1) {
            // Deprioritized
          }
        }

        const teamOverallSum = team.reduce((acc, a) => acc + adjustedOverall(a), 0);
        const score = teamOverallSum + adjustedOverall(athlete);
        if (score < minOverallSum) {
          minOverallSum = score;
          bestIdx = i;
        }
      }

      if (minOverallSum === Infinity) {
        // Fallback to min size team
        let minSize = Infinity;
        for (let i = 0; i < this.numTeams; i++) {
          if (teams[i].length < minSize) {
            minSize = teams[i].length;
            bestIdx = i;
          }
        }
      }

      teams[bestIdx].push(athlete);
    };

    // Place primary setters (females then males)
    remainingPrimarySettersFemales.forEach((f) => placeSetterGreedy(f, true));
    remainingPrimarySettersMales.forEach((m) => placeSetterGreedy(m, true));

    // Place secondary setters (females then males)
    remainingSecondarySettersFemales.forEach((f) => placeSetterGreedy(f, false));
    remainingSecondarySettersMales.forEach((m) => placeSetterGreedy(m, false));

    // Place others (females then males)
    remainingOthersFemales.forEach((f) => placeGreedy(f, true));
    remainingOthersMales.forEach((m) => placeGreedy(m, false));

    return { teams };
  }
}

// ─── Neighbor Generation ─────────────────────────────────────────────────────

function generateNeighbor(
  current: TeamSolution,
  constraints: BalanceConstraints | undefined,
  random: () => number,
): TeamSolution {
  const numTeams = current.teams.length;
  const teams = current.teams.map((t) => [...t]);
  const moveVal = random();

  const getNonLocked = (tIdx: number) => {
    return teams[tIdx].filter((a) => {
      if (!constraints?.lockedPlayerIdxs) return true;
      return constraints.lockedPlayerIdxs[a.id] === undefined;
    });
  };

  if (moveVal < 0.8) {
    // Swap 1x1
    const t1 = Math.floor(random() * numTeams);
    const t2 = (t1 + Math.floor(random() * (numTeams - 1)) + 1) % numTeams;

    const p1List = getNonLocked(t1);
    const p2List = getNonLocked(t2);

    if (p1List.length > 0 && p2List.length > 0) {
      const p1 = p1List[Math.floor(random() * p1List.length)];
      const p2 = p2List[Math.floor(random() * p2List.length)];

      teams[t1] = teams[t1].map((a) => (a.id === p1.id ? p2 : a));
      teams[t2] = teams[t2].map((a) => (a.id === p2.id ? p1 : a));
    }
  } else if (moveVal < 0.95) {
    // Move one player
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

      const pList = getNonLocked(t1);
      if (pList.length > 0) {
        const p = pList[Math.floor(random() * pList.length)];
        teams[t1] = teams[t1].filter((a) => a.id !== p.id);
        teams[t2].push(p);
      }
    }
  } else {
    // Weakness-targeted swap
    const categories: (keyof AthleteVector)[] = [
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
      const pWeakList = getNonLocked(tWeak).sort((a, b) => (a[cat] as number) - (b[cat] as number));
      const pStrongList = getNonLocked(tStrong).sort(
        (a, b) => (b[cat] as number) - (a[cat] as number),
      );

      if (pWeakList.length > 0 && pStrongList.length > 0) {
        const pWeak = pWeakList[0];
        const pStrong = pStrongList[0];

        teams[tWeak] = teams[tWeak].map((a) => (a.id === pWeak.id ? pStrong : a));
        teams[tStrong] = teams[tStrong].map((a) => (a.id === pStrong.id ? pWeak : a));
      }
    }
  }

  return { teams };
}

function isFeasible(solution: TeamSolution, constraints: BalanceConstraints | undefined): boolean {
  if (solution.teams.some((t) => t.length === 0)) return false;

  if (constraints?.lockedPlayerIdxs) {
    for (const [pid, targetIdx] of Object.entries(constraints.lockedPlayerIdxs)) {
      const currentIdx = solution.teams.findIndex((t) => t.some((a) => a.id === pid));
      if (currentIdx !== -1 && currentIdx !== targetIdx) return false;
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
  constraints: BalanceConstraints | undefined,
): BalanceDiagnostics {
  const metrics = solution.teams.map((t, idx) => calculateTeamMetrics(idx, t));
  const getSpread = (values: number[]) => {
    if (values.length === 0) return 0;
    return Math.max(...values) - Math.min(...values);
  };

  // Normaliza o overall (0–100) para a faixa dos fundamentos (0–10),
  // para o diagnóstico bater com o score do scorer.
  const overallSpread = getSpread(metrics.map((m) => m.overall / OVERALL_SCALE));
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

  if (overallSpread > 1.0) {
    warnings.push(
      `Desequilíbrio de nível geral elevado (${overallSpread.toFixed(1)} pts de diferença máxima).`,
    );
  }

  if (objectiveScore > 5000) {
    warnings.push(
      'Não foi possível atender a todas as restrições obrigatórias com equilíbrio perfeito.',
    );
  }

  return {
    objectiveScore,
    qualityLabel: getQualityLabel(objectiveScore),
    overallSpread,
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
    formSpread: getSpread(metrics.map((m) => m.averageForm)),
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
    athletes: AthleteVector[],
    constraints: BalanceConstraints | undefined,
    maxIterations: number,
    timeLimitMillis: number,
    seed: number,
    onProgress?: (fraction: number, bestScore: number, best: TeamSolution) => void,
  ): { solution: TeamSolution; score: number; iterations: number } {
    const random = createSeededRandom(seed);
    const startTime = Date.now();

    let current = this.initialBuilder.buildInitialSolution(athletes, constraints);
    let currentScore = this.scorer.score(current, constraints);

    let best = current;
    let bestScore = currentScore;

    // Initial temperature: 25% of initial score, clamped between 1.0 and 50.0
    let temperature = Math.min(50.0, Math.max(1.0, currentScore * 0.25));

    let iterations = 0;
    let iterationsWithoutImprovement = 0;
    const maxNoImprovement = Math.max(2000, Math.floor(maxIterations * 0.8));
    // Emite progresso a cada ~2% das iterações (sem onProgress, nada muda).
    const progressEvery = Math.max(1, Math.floor(maxIterations / 50));

    while (
      iterations < maxIterations &&
      Date.now() - startTime < 45000 &&
      iterationsWithoutImprovement < maxNoImprovement
    ) {
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

      if (onProgress && iterations % progressEvery === 0) {
        onProgress(Math.min(1, iterations / maxIterations), bestScore, best);
      }
    }

    return { solution: best, score: this.scorer.score(best, constraints, true), iterations };
  }
}

// ─── Label Helper ────────────────────────────────────────────────────────────

function assignLabelsToDivisions(divisions: Division[]): void {
  if (divisions.length !== 3) return;

  let bestOverallIdx = 0;
  let minOverall = Infinity;

  let bestFundIdx = 0;
  let minFund = Infinity;

  let bestHeightIdx = 0;
  let minHeight = Infinity;

  divisions.forEach((div, idx) => {
    const diag = div.diagnostics;
    if (!diag) return;

    if (diag.overallSpread < minOverall) {
      minOverall = diag.overallSpread;
      bestOverallIdx = idx;
    }

    const fundSpread = diag.attackSpread + diag.defenseSpread;
    if (fundSpread < minFund) {
      minFund = fundSpread;
      bestFundIdx = idx;
    }

    if (diag.heightSpread < minHeight) {
      minHeight = diag.heightSpread;
      bestHeightIdx = idx;
    }
  });

  const assigned = new Set<string>();

  // 1. Overall
  divisions[bestOverallIdx].explanation = divisions[bestOverallIdx].explanation || [];
  divisions[bestOverallIdx].explanation.unshift(
    'Divisão com menor variação de força geral entre as equipes.',
  );
  divisions[bestOverallIdx].qualityLabel = 'Melhor Equilíbrio Geral';
  assigned.add(bestOverallIdx.toString());

  // 2. Fundamentals
  let fundTargetIdx = bestFundIdx;
  if (assigned.has(fundTargetIdx.toString())) {
    let minNextFund = Infinity;
    divisions.forEach((div, idx) => {
      if (idx === bestOverallIdx) return;
      const diag = div.diagnostics;
      if (!diag) return;
      const val = diag.attackSpread + diag.defenseSpread;
      if (val < minNextFund) {
        minNextFund = val;
        fundTargetIdx = idx;
      }
    });
  }
  divisions[fundTargetIdx].explanation = divisions[fundTargetIdx].explanation || [];
  divisions[fundTargetIdx].explanation.unshift(
    'Divisão focada no equilíbrio perfeito de fundamentos (ataque e defesa).',
  );
  divisions[fundTargetIdx].qualityLabel = 'Melhor Equilíbrio Técnico';
  assigned.add(fundTargetIdx.toString());

  // 3. Physical
  let heightTargetIdx = bestHeightIdx;
  if (assigned.has(heightTargetIdx.toString())) {
    for (let i = 0; i < 3; i++) {
      if (!assigned.has(i.toString())) {
        heightTargetIdx = i;
        break;
      }
    }
  }
  divisions[heightTargetIdx].explanation = divisions[heightTargetIdx].explanation || [];
  divisions[heightTargetIdx].explanation.unshift(
    'Divisão com melhor balanceamento de altura média e presença de rede.',
  );
  divisions[heightTargetIdx].qualityLabel = 'Melhor Distribuição Física';
}

// Quantos jogadores compartilham o mesmo time entre duas soluções (0 = idênticas)
export function solutionDistance(a: TeamSolution, b: TeamSolution): number {
  const numTeams = a.teams.length;
  const bTeams = b.teams.map(t => new Set(t.map(player => player.id)));
  const aTeams = a.teams.map(t => t.map(player => player.id));

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

export function selectPortfolio(candidates: Division[], k = 3, minDistance = 2): Division[] {
  const sorted = [...candidates].sort((a, b) => a.score - b.score);
  if (sorted.length === 0) return [];

  const chosen: Division[] = [sorted[0]]; // melhor de todos
  for (const c of sorted.slice(1)) {
    if (chosen.length >= k) break;
    const distinct = chosen.every(
      (s) => c.rawSolution && s.rawSolution && solutionDistance(c.rawSolution, s.rawSolution) >= minDistance
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

// ─── Entry Point Wrapper ─────────────────────────────────────────────────────

export const balanceTeams = (
  players: Player[],
  numTeams: number,
  sessionId: string,
  config?: TournamentConfig | FreePlayConfig,
  onProgress?: (percent: number, bestScore: number) => void,
  partnershipMatrix?: PartnershipMatrix,
): Division[] => {
  const balanceMode = config?.balanceMode || 'balanced';
  const balanceSpeed = config?.balanceSpeed || 'advanced';
  const constraints = config?.balanceConstraints || {};

  // Gênero é critério permanente: respeita um piso em todos os perfis (Fase B).
  const weights = { ...(MODE_WEIGHTS[balanceMode] || MODE_WEIGHTS.balanced) };
  weights.gender = Math.max(weights.gender, GENDER_WEIGHT_FLOOR);

  weights.repetition = config && typeof config.repetitionWeight === 'number' ? config.repetitionWeight : 0.8;

  // Map players to vectors
  const athletes = players.map(mapPlayerToAthleteVector);

  const totalFemales = athletes.filter((a) => a.gender === 'F').length;
  const totalMales = athletes.filter((a) => a.gender === 'M').length;
  const totalInjured = athletes.filter((a) => a.isInjured).length;

  const rotationType: RotationType = config?.rotationType ?? '6x0';
  const composition =
    rotationType === '5x1' ? resolveComposition(athletes, numTeams).perTeam : undefined;

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
  const initialBuilder = new InitialTeamBuilder(numTeams);
  const balancer = new SimulatedAnnealingBalancer(initialBuilder, scorer);

  // Iteration scaling based on speed profile
  const clamp = (val: number, min: number, max: number) => Math.max(min, Math.min(max, val));
  
  let maxIterations = 40000;
  let numSeeds = 10;
  
  if (balanceSpeed === 'fast') {
    maxIterations = clamp(athletes.length * 400, 2000, 10000);
    numSeeds = 3;
  } else if (balanceSpeed === 'normal') {
    maxIterations = clamp(athletes.length * 1000, 8000, 30000);
    numSeeds = 6;
  } else {
    maxIterations = clamp(athletes.length * 4000, 20000, 120000);
    numSeeds = 10;
  }

  // Generate options using seeds starting from config.balanceSeed
  const baseSeed = config?.balanceSeed ?? 42;
  const seeds = Array.from({ length: numSeeds }, (_, i) => baseSeed + i * 101);

  const results: Division[] = seeds.map((seed, seedIdx) => {
    const runStartTime = Date.now();
    const { solution, score, iterations } = balancer.balance(
      athletes,
      constraints,
      maxIterations,
      45000,
      seed,
      onProgress
        ? (fraction, bestScore) => {
            // Acumula o progresso global entre as seeds.
            const percent = Math.min(99, Math.round(((seedIdx + fraction) / numSeeds) * 100));
            onProgress(percent, bestScore);
          }
        : undefined,
    );
    const runRuntime = Date.now() - runStartTime;

    // Save solution fingerprint to prevent duplicates in subsequent options
    const fp = getSolutionFingerprint(solution);
    scorer.previousFingerprints.push(fp);

    const diagnostics = buildBalanceDiagnostics(
      solution,
      weights,
      score,
      totalFemales,
      totalMales,
      totalInjured,
      numTeams,
      constraints,
    );

    // Map AthleteVector[][] back to Team[]
    const divisionTeams: Team[] = solution.teams.map((teamAthletes, i) => {
      // Re-map back to actual Player object references
      const originalTeamPlayers = players.filter((p) => teamAthletes.some((ta) => ta.id === p.id));

      const teamMetrics = calculateTeamMetrics(i, teamAthletes);
      const strengthSnapshot = buildTeamStrengthSnapshot(teamMetrics);

      return {
        id: `team-${sessionId}-${seed}-${i}`,
        sessionId,
        name: `Time ${i + 1}`,
        playerIds: teamAthletes.map((a) => a.id),
        generatedByAlgorithm: true,
        locked: false,
        strengthSnapshot,
      };
    });

    const explanation = [
      ...diagnostics.warnings,
      ...(diagnostics.warnings.length === 0
        ? ['Divisão equilibrada conforme todos os critérios técnicos.']
        : []),
    ];

    return {
      teams: divisionTeams,
      penalty: score,
      score,
      explanation,
      diagnostics,
      algorithm: 'Simulated Annealing (Smart Balance Engine)',
      seed,
      iterations,
      runtimeMillis: runRuntime,
      rawSolution: solution,
    };
  });

  // Select diverse portfolio of top 3 options
  const portfolio = selectPortfolio(results, 3, 2);

  // Assign distinct labels to options
  assignLabelsToDivisions(portfolio);

  // Return sorted by score ascending (best first)
  const sorted = portfolio.sort((a, b) => a.score - b.score);
  if (onProgress) onProgress(100, sorted[0]?.score ?? 0);
  return sorted;
};

function buildTeamStrengthSnapshot(m: TeamMetrics): TeamStrengthSnapshot {
  return {
    overall: m.overall,
    attack: m.attack,
    reception: m.reception,
    setting: m.setting,
    defense: m.defense,
    block: m.block,
    serve: m.serve,
    regularity: m.consistency,
    stamina: m.stamina,
    gameReading: m.gameVision,
    averageHeight: m.averageHeight,
    netPresence: m.netPresence,
    maleCount: m.maleCount,
    femaleCount: m.femaleCount,
  };
}

export function recalculateDivisionDiagnostics(
  division: Division,
  allPlayers: Player[],
  config: TournamentConfig | FreePlayConfig | undefined,
  partnershipMatrix?: PartnershipMatrix,
): Division {
  const balanceMode = config?.balanceMode || 'balanced';
  const constraints = config?.balanceConstraints || {};
  const numTeams = config?.teamCount || division.teams.length;
  const rotationType = config?.rotationType || '6x0';

  const weights = { ...(MODE_WEIGHTS[balanceMode] || MODE_WEIGHTS.balanced) };
  weights.gender = Math.max(weights.gender, GENDER_WEIGHT_FLOOR);
  weights.repetition = config && typeof config.repetitionWeight === 'number' ? config.repetitionWeight : 0.8;

  // Map all players to athletes
  const athletes = allPlayers.map(mapPlayerToAthleteVector);
  const totalFemales = athletes.filter((a) => a.gender === 'F').length;
  const totalMales = athletes.filter((a) => a.gender === 'M').length;
  const totalInjured = athletes.filter((a) => a.isInjured).length;

  let composition: RoleComposition | undefined;
  if (rotationType === '5x1') {
    const { perTeam } = resolveComposition(athletes, numTeams);
    composition = perTeam;
  }

  // Reconstruct TeamSolution
  const solutionTeams: AthleteVector[][] = division.teams.map((t) => {
    return t.playerIds
      .map((pid) => athletes.find((a) => a.id === pid))
      .filter((a): a is AthleteVector => !!a);
  });
  const solution: TeamSolution = { teams: solutionTeams };

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

  const score = scorer.score(solution, constraints, true);
  const diagnostics = buildBalanceDiagnostics(
    solution,
    weights,
    score,
    totalFemales,
    totalMales,
    totalInjured,
    numTeams,
    constraints,
  );

  const explanation = [
    ...diagnostics.warnings,
    ...(diagnostics.warnings.length === 0
      ? ['Divisão equilibrada conforme todos os critérios técnicos.']
      : []),
  ];

  const updatedTeams = division.teams.map((t, i) => {
    const teamAthletes = solutionTeams[i] || [];
    const teamMetrics = calculateTeamMetrics(i, teamAthletes);
    const strengthSnapshot = buildTeamStrengthSnapshot(teamMetrics);
    return {
      ...t,
      strengthSnapshot,
    };
  });

  return {
    ...division,
    teams: updatedTeams,
    score,
    penalty: score,
    explanation,
    diagnostics,
    qualityLabel: getQualityLabel(score),
    rawSolution: solution,
  };
}
