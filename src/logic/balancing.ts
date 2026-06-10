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
} from '../types';
import {
  calculateTeamStrength,
  calculateGenderDistribution,
  calculateTeamSizes,
  calculateGeneralOverall,
} from './calculations';

// ─── Weight Profiles ─────────────────────────────────────────────────────────

const MODE_WEIGHTS: Record<'balanced' | 'competitive' | 'social' | 'mixed', BalanceWeights> = {
  balanced: {
    overall: 1.4,
    attack: 1.15,
    defense: 1.1,
    setting: 1.25,
    block: 0.9,
    reception: 0.95,
    serve: 0.65,
    height: 0.55,
    gender: 0.75,
    injured: 1.2,
    teamSize: 2.0,
    roleCoverage: 1.5,
    consistency: 0.7,
    emotionalControl: 0.5,
    netPresence: 1.0,
  },
  competitive: {
    overall: 2.0,
    attack: 1.8,
    defense: 1.7,
    setting: 1.9,
    block: 1.5,
    reception: 1.6,
    serve: 1.0,
    height: 0.8,
    gender: 0.2,
    injured: 0.5,
    teamSize: 2.0,
    roleCoverage: 2.0,
    consistency: 1.2,
    emotionalControl: 1.0,
    netPresence: 1.5,
  },
  social: {
    overall: 1.0,
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
    roleCoverage: 0.5,
    consistency: 0.4,
    emotionalControl: 0.3,
    netPresence: 0.4,
  },
  mixed: {
    overall: 1.2,
    attack: 0.8,
    defense: 0.8,
    setting: 1.0,
    block: 0.6,
    reception: 0.7,
    serve: 0.5,
    height: 0.4,
    gender: 3.0,
    injured: 1.0,
    teamSize: 2.5,
    roleCoverage: 1.0,
    consistency: 0.6,
    emotionalControl: 0.5,
    netPresence: 0.6,
  },
};

const SPEED_CONFIG: Record<
  'fast' | 'normal' | 'advanced',
  { maxIterations: number; timeLimitMillis: number }
> = {
  fast: { maxIterations: 3000, timeLimitMillis: 500 },
  normal: { maxIterations: 8000, timeLimitMillis: 1500 },
  advanced: { maxIterations: 25000, timeLimitMillis: 3000 },
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

function calculateHeightImpact(heightCm: number | null): number {
  if (!heightCm) return 0;
  if (heightCm > 190) return 0.5;
  if (heightCm > 180) return 0.25;
  if (heightCm < 170) return -0.25;
  return 0;
}

export function adjustedOverall(a: AthleteVector): number {
  const injuryPenalty = a.isInjured ? 1.5 : 0.0;
  const formModifier = a.currentForm * 0.25;
  const heightBonus = calculateHeightImpact(a.heightCm);
  return a.overall + formModifier + heightBonus - injuryPenalty;
}

export function netPresence(a: AthleteVector): number {
  const heightFactor = ((a.heightCm || 170) - 160) / 30;
  const blockWeight = a.block * 0.45;
  const attackWeight = a.attack * 0.35;
  const positionBonus = a.position === 'central' || a.position === 'oposto' ? 0.75 : 0.0;
  return blockWeight + attackWeight + heightFactor * 2.0 + positionBonus;
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
    };
  }

  const sum = (fn: (a: AthleteVector) => number) => athletes.reduce((acc, a) => acc + fn(a), 0);
  const avg = (fn: (a: AthleteVector) => number) => sum(fn) / size;

  const maleCount = athletes.filter((a) => a.gender === 'M').length;
  const femaleCount = athletes.filter((a) => a.gender === 'F').length;
  const injuredCount = athletes.filter((a) => a.isInjured).length;

  const hasSetter = athletes.some(
    (a) =>
      a.setting >= 7.0 ||
      a.position === 'levantador' ||
      a.secondaryPositions?.includes('levantador'),
  );
  const hasStrongAttacker = athletes.some((a) => a.attack >= 7.0);
  const hasDefensiveReference = athletes.some(
    (a) => a.defense >= 7.0 || a.reception >= 7.0 || a.position === 'libero',
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
            penalty += 10000;
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
          penalty += 10000;
        }
      }
    }

    // 3. Hard Constraints: Locked Assignments
    if (constraints?.lockedPlayerIdxs) {
      for (const [pid, targetIdx] of Object.entries(constraints.lockedPlayerIdxs)) {
        const currentIdx = solution.teams.findIndex((t) => t.some((a) => a.id === pid));
        if (currentIdx !== -1 && currentIdx !== targetIdx) {
          penalty += 10000;
        }
      }
    }

    // 4. Hard Constraints: Team Size Limit Difference
    const teamSizes = teamsMetrics.map((m) => m.size);
    const minSize = Math.min(...teamSizes);
    const maxSize = Math.max(...teamSizes);
    if (maxSize - minSize > 1) {
      penalty += (maxSize - minSize) * 2000;
    }

    // Spreads calculation
    const weightedSpread = (values: number[], weight: number) => {
      if (values.length === 0) return 0;
      return (Math.max(...values) - Math.min(...values)) * weight;
    };

    const overallSpread = weightedSpread(
      teamsMetrics.map((m) => m.overall),
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
          penalty += (minP - pCount) * 8000;
        } else if (pCount > maxP) {
          penalty += (pCount - maxP) * 8000;
        }
        if (pCount === 0) {
          penalty += 15000;
        }
      });
    } else {
      solution.teams.forEach((t) => {
        const pCount = t.filter((a) => a.position === 'levantador').length;
        if (pCount > 1) {
          penalty += (pCount - 1) * 8000;
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
            penalty += (minT - tCount) * 8000;
          } else if (tCount > maxT) {
            penalty += (tCount - maxT) * 8000;
          }

          if (tCount === 0 && totalSetters >= this.numTeams) {
            penalty += 15000;
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

    // 5. Duplicate penalty (avoid repeating options)
    if (!ignoreDuplicates && this.previousFingerprints && this.previousFingerprints.length > 0) {
      const fp = getSolutionFingerprint(solution);
      if (this.previousFingerprints.includes(fp)) {
        penalty += 5000.0;
      }
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
      roleCoveragePenalty
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

function getQualityLabel(score: number): BalanceQuality {
  if (score < 15.0) return 'EXCELLENT';
  if (score < 30.0) return 'GOOD';
  if (score < 60.0) return 'ACCEPTABLE';
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

  const overallSpread = getSpread(metrics.map((m) => m.overall));
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

  if (overallSpread > 3.0) {
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
    injuredPenalty,
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

    while (
      iterations < maxIterations &&
      Date.now() - startTime < timeLimitMillis &&
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

// ─── Entry Point Wrapper ─────────────────────────────────────────────────────

export const balanceTeams = (
  players: Player[],
  numTeams: number,
  sessionId: string,
  config?: TournamentConfig | FreePlayConfig,
): Division[] => {
  const startTime = Date.now();
  const balanceMode = config?.balanceMode || 'balanced';
  const balanceSpeed = config?.balanceSpeed || 'advanced';
  const constraints = config?.balanceConstraints || {};

  const weights = MODE_WEIGHTS[balanceMode] || MODE_WEIGHTS.balanced;
  const speed = SPEED_CONFIG[balanceSpeed] || SPEED_CONFIG.advanced;

  // Map players to vectors
  const athletes = players.map(mapPlayerToAthleteVector);

  const totalFemales = athletes.filter((a) => a.gender === 'F').length;
  const totalMales = athletes.filter((a) => a.gender === 'M').length;
  const totalInjured = athletes.filter((a) => a.isInjured).length;

  const scorer = new ObjectiveScorer(weights, totalFemales, totalMales, totalInjured, numTeams);
  const initialBuilder = new InitialTeamBuilder(numTeams);
  const balancer = new SimulatedAnnealingBalancer(initialBuilder, scorer);

  // Generate 3 options using deterministic seeds: base, base + 101, base + 202
  const baseSeed = 42;
  const seeds = [baseSeed, baseSeed + 101, baseSeed + 202];

  const results: Division[] = seeds.map((seed) => {
    const runStartTime = Date.now();
    const { solution, score, iterations } = balancer.balance(
      athletes,
      constraints,
      speed.maxIterations,
      speed.timeLimitMillis,
      seed,
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
    };
  });

  // Assign distinct labels to options
  assignLabelsToDivisions(results);

  // Return sorted by score ascending (best first)
  return results.sort((a, b) => a.score - b.score);
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
