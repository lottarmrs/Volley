import type {
  Attributes,
  BalanceCandidate,
  BalanceDiagnostics,
  Division,
  FreePlayConfig,
  Player,
  PlayerBalanceSnapshot,
  Position,
  TeamMetrics,
  TeamSolution,
  TeamStrengthSnapshot,
  TournamentConfig,
} from '../types';
import {
  balanceSnapshots,
  calculateTeamMetrics,
  evaluateTeamSolution,
  getQualityLabel,
} from './balancing';
import { calculateGeneralOverall, calculatePositionOverall } from './calculations';
import type { PartnershipMatrix } from './partnershipHistory';
import { generateUUID } from './uuid';

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

export type OverallProjection = (player: Player, position?: Position) => number;

function average(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function spread(values: number[]): number {
  return values.length ? Math.max(...values) - Math.min(...values) : 0;
}

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
  return !ATTRIBUTE_KEYS.some(
    (key) => typeof player.atributos?.[key] === 'number' && Number.isFinite(player.atributos[key]),
  );
}

export function mapPlayerToBalanceSnapshot(
  player: Player,
  sessionPosition?: Position,
  fallback?: Attributes,
): PlayerBalanceSnapshot {
  const resolve = (key: (typeof ATTRIBUTE_KEYS)[number]) =>
    (typeof player.atributos?.[key] === 'number' && Number.isFinite(player.atributos[key])
      ? player.atributos[key]
      : undefined) ??
    (typeof fallback?.[key] === 'number' && Number.isFinite(fallback[key])
      ? fallback[key]
      : undefined) ??
    MID_SCALE;

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

export function calculateDisplayOverall(player: Player, position?: Position): number {
  const raw =
    position && position !== player.posicaoPrincipal
      ? calculatePositionOverall(player, position)
      : calculateGeneralOverall(player);
  if (Number.isFinite(raw)) return raw;
  const snapshot = mapPlayerToBalanceSnapshot(player, position);
  return (
    (snapshot.attack +
      snapshot.defense +
      snapshot.serve +
      snapshot.reception +
      snapshot.setting +
      snapshot.block +
      snapshot.speed +
      snapshot.stamina +
      snapshot.gameVision +
      snapshot.consistency +
      snapshot.emotionalControl) /
    11
  );
}

function buildTeamStrengthSnapshot(metrics: TeamMetrics, overall: number): TeamStrengthSnapshot {
  return {
    overall,
    attack: metrics.attack,
    reception: metrics.reception,
    setting: metrics.setting,
    defense: metrics.defense,
    block: metrics.block,
    serve: metrics.serve,
    regularity: metrics.consistency,
    stamina: metrics.stamina,
    gameReading: metrics.gameVision,
    averageHeight: metrics.averageHeight,
    netPresence: metrics.netPresence,
    maleCount: metrics.maleCount,
    femaleCount: metrics.femaleCount,
  };
}

function attachDisplayDiagnostics(
  candidate: BalanceCandidate,
  teamOveralls: number[],
  teamForms: number[],
): BalanceDiagnostics {
  const overallSpread = spread(teamOveralls) / 10;
  const warnings = [...candidate.diagnostics.warnings];
  if (overallSpread > 1) {
    warnings.push(
      `Desequilíbrio de nível geral elevado (${overallSpread.toFixed(1)} pts de diferença máxima).`,
    );
  }
  return {
    ...candidate.diagnostics,
    overallSpread,
    formSpread: spread(teamForms),
    warnings,
  };
}

function assignLabelsToDivisions(divisions: Division[]): void {
  if (divisions.length !== 3) return;

  let bestOverallIndex = 0;
  let minimumOverall = Infinity;
  let bestFundamentalsIndex = 0;
  let minimumFundamentals = Infinity;
  let bestHeightIndex = 0;
  let minimumHeight = Infinity;

  divisions.forEach((division, index) => {
    const diagnostics = division.diagnostics;
    if (!diagnostics) return;
    if (diagnostics.overallSpread < minimumOverall) {
      minimumOverall = diagnostics.overallSpread;
      bestOverallIndex = index;
    }
    const fundamentalsSpread = diagnostics.attackSpread + diagnostics.defenseSpread;
    if (fundamentalsSpread < minimumFundamentals) {
      minimumFundamentals = fundamentalsSpread;
      bestFundamentalsIndex = index;
    }
    if (diagnostics.heightSpread < minimumHeight) {
      minimumHeight = diagnostics.heightSpread;
      bestHeightIndex = index;
    }
  });

  const assigned = new Set<number>();
  const label = (index: number, reason: string, quality: string) => {
    const division = divisions[index];
    division.explanation = [reason, ...(division.explanation ?? [])];
    division.qualityLabel = quality;
  };

  label(
    bestOverallIndex,
    'Divisão com menor variação de força geral entre as equipes.',
    'Melhor Equilíbrio Geral',
  );
  assigned.add(bestOverallIndex);

  let fundamentalsIndex = bestFundamentalsIndex;
  if (assigned.has(fundamentalsIndex)) {
    let nextMinimum = Infinity;
    divisions.forEach((division, index) => {
      if (assigned.has(index) || !division.diagnostics) return;
      const value = division.diagnostics.attackSpread + division.diagnostics.defenseSpread;
      if (value < nextMinimum) {
        nextMinimum = value;
        fundamentalsIndex = index;
      }
    });
  }
  label(
    fundamentalsIndex,
    'Divisão focada no equilíbrio perfeito de fundamentos (ataque e defesa).',
    'Melhor Equilíbrio Técnico',
  );
  assigned.add(fundamentalsIndex);

  let heightIndex = bestHeightIndex;
  if (assigned.has(heightIndex)) {
    heightIndex = divisions.findIndex((_, index) => !assigned.has(index));
  }
  label(
    heightIndex,
    'Divisão com melhor balanceamento de altura média e presença de rede.',
    'Melhor Distribuição Física',
  );
}

function displayContext(
  solution: TeamSolution,
  players: Player[],
  positionOverrides: Partial<Record<string, Position>>,
  overallProjection: OverallProjection,
): {
  overalls: number[];
  forms: number[];
  metrics: TeamMetrics[];
} {
  const playerById = new Map(players.map((player) => [player.id, player]));
  const overallByParticipant = new Map(
    players.map((player) => [player.id, overallProjection(player, positionOverrides[player.id])]),
  );
  const overalls = solution.teams.map((snapshots) => {
    const values = snapshots.map((snapshot) => {
      const value = overallByParticipant.get(snapshot.participantId);
      if (value === undefined) {
        throw new Error(`Projeção de Overall ausente para ${snapshot.participantId}.`);
      }
      return value;
    });
    return average(values);
  });
  const forms = solution.teams.map((snapshots) =>
    average(
      snapshots.map((snapshot) => {
        const value = playerById.get(snapshot.participantId)?.formaAtual?.valor;
        return typeof value === 'number' && Number.isFinite(value) ? value : 0;
      }),
    ),
  );
  return {
    overalls,
    forms,
    metrics: solution.teams.map((team, index) => calculateTeamMetrics(index, team)),
  };
}

export function adaptBalanceCandidatesToDivisions(input: {
  candidates: BalanceCandidate[];
  players: Player[];
  sessionId: string;
  config?: TournamentConfig | FreePlayConfig;
  overallProjection?: OverallProjection;
}): Division[] {
  const positionOverrides = input.config?.playerPositions ?? {};
  const overallProjection = input.overallProjection ?? calculateDisplayOverall;
  const divisions = input.candidates.map((candidate) => {
    const context = displayContext(
      candidate.solution,
      input.players,
      positionOverrides,
      overallProjection,
    );
    const diagnostics = attachDisplayDiagnostics(candidate, context.overalls, context.forms);
    return {
      teams: candidate.solution.teams.map((team, index) => ({
        id: generateUUID(),
        sessionId: input.sessionId,
        name: `Time ${index + 1}`,
        playerIds: team.map((snapshot) => snapshot.participantId),
        generatedByAlgorithm: true,
        locked: false,
        strengthSnapshot: buildTeamStrengthSnapshot(
          context.metrics[index],
          context.overalls[index],
        ),
      })),
      penalty: candidate.score,
      score: candidate.score,
      explanation: [
        ...diagnostics.warnings,
        ...(diagnostics.warnings.length === 0
          ? ['Divisão equilibrada conforme todos os critérios técnicos.']
          : []),
      ],
      diagnostics,
      algorithm: candidate.algorithm,
      seed: candidate.seed,
      iterations: candidate.iterations,
      runtimeMillis: candidate.runtimeMillis,
      rawSolution: candidate.solution,
    };
  });
  assignLabelsToDivisions(divisions);
  return divisions;
}

export function balanceTeams(
  players: Player[],
  numTeams: number,
  sessionId: string,
  config?: TournamentConfig | FreePlayConfig,
  onProgress?: (percent: number, bestScore: number) => void,
  partnershipMatrix?: PartnershipMatrix,
): Division[] {
  const positionOverrides = config?.playerPositions ?? {};
  const snapshots = mapPlayersToBalanceSnapshots(players, positionOverrides);
  const candidates = balanceSnapshots(snapshots, numTeams, config, onProgress, partnershipMatrix);
  return adaptBalanceCandidatesToDivisions({ candidates, players, sessionId, config });
}

export function findRosterDivergence(
  division: Division,
  selectedPlayerIds: string[],
): { missing: string[]; duplicated: string[] } | null {
  const seen = new Map<string, number>();
  for (const team of division.teams) {
    for (const id of team.playerIds) seen.set(id, (seen.get(id) ?? 0) + 1);
  }
  const missing = selectedPlayerIds.filter((id) => !seen.has(id));
  const duplicated = [...seen.entries()].filter(([, count]) => count > 1).map(([id]) => id);
  return missing.length || duplicated.length ? { missing, duplicated } : null;
}

export function recalculateDivisionDiagnostics(
  division: Division,
  allPlayers: Player[],
  config: TournamentConfig | FreePlayConfig | undefined,
  partnershipMatrix?: PartnershipMatrix,
): Division {
  const positionOverrides = config?.playerPositions ?? {};
  const snapshots = mapPlayersToBalanceSnapshots(allPlayers, positionOverrides);
  const snapshotById = new Map(snapshots.map((snapshot) => [snapshot.participantId, snapshot]));
  const solution: TeamSolution = {
    teams: division.teams.map((team) =>
      team.playerIds
        .map((participantId) => snapshotById.get(participantId))
        .filter((snapshot): snapshot is PlayerBalanceSnapshot => snapshot !== undefined),
    ),
  };
  const evaluated = evaluateTeamSolution(solution, config, partnershipMatrix);
  const candidate: BalanceCandidate = {
    solution,
    score: evaluated.score,
    diagnostics: evaluated.diagnostics,
    algorithm: division.algorithm ?? 'Simulated Annealing (Smart Balance Engine)',
    seed: division.seed ?? config?.balanceSeed ?? 42,
    iterations: division.iterations ?? 0,
    runtimeMillis: division.runtimeMillis ?? 0,
  };
  const context = displayContext(solution, allPlayers, positionOverrides, calculateDisplayOverall);
  const diagnostics = attachDisplayDiagnostics(candidate, context.overalls, context.forms);
  const explanation = [
    ...diagnostics.warnings,
    ...(diagnostics.warnings.length === 0
      ? ['Divisão equilibrada conforme todos os critérios técnicos.']
      : []),
  ];

  return {
    ...division,
    teams: division.teams.map((team, index) => ({
      ...team,
      strengthSnapshot: buildTeamStrengthSnapshot(context.metrics[index], context.overalls[index]),
    })),
    score: evaluated.score,
    penalty: evaluated.score,
    explanation,
    diagnostics,
    qualityLabel: getQualityLabel(evaluated.score),
    rawSolution: solution,
  };
}
