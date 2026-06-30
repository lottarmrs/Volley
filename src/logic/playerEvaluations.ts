import { Attributes, Player, PlayerEvaluation } from '../types';

export const ATTRIBUTE_KEYS: Array<keyof Attributes> = [
  'saque',
  'recepcao',
  'levantamento',
  'ataque',
  'bloqueio',
  'defesa',
  'velocidade',
  'resistencia',
  'leituraDeJogo',
  'regularidade',
  'controleEmocional',
];

function clampAttribute(value: number): number {
  if (!Number.isFinite(value)) return 5;
  return Math.max(0, Math.min(10, value));
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

function roundAttribute(value: number): number {
  return Math.round(value * 10) / 10;
}

function includedValues(values: number[]): number[] {
  if (values.length < 4) return values;

  const center = median(values);
  const deviations = values.map((value) => Math.abs(value - center));
  const mad = median(deviations);
  const threshold = Math.max(1.75, mad * 2.5);
  const included = values.filter((value) => Math.abs(value - center) <= threshold);

  return included.length >= 2 ? included : values;
}

export function aggregatePlayerEvaluations(
  evaluations: Pick<PlayerEvaluation, 'attributes' | 'updatedAt'>[],
  fallback: Attributes,
) {
  const attributes = {} as Attributes;
  let includedValueCount = 0;
  let outlierValueCount = 0;
  let updatedAt: string | undefined;

  for (const key of ATTRIBUTE_KEYS) {
    const values = evaluations
      .map((evaluation) => clampAttribute(Number(evaluation.attributes?.[key])))
      .filter((value) => Number.isFinite(value));

    const source = values.length > 0 ? values : [clampAttribute(fallback[key])];
    const included = includedValues(source);
    const sum = included.reduce((total, value) => total + value, 0);
    attributes[key] = roundAttribute(sum / included.length);
    includedValueCount += included.length;
    outlierValueCount += Math.max(0, source.length - included.length);
  }

  for (const evaluation of evaluations) {
    if (!evaluation.updatedAt) continue;
    if (!updatedAt || new Date(evaluation.updatedAt).getTime() > new Date(updatedAt).getTime()) {
      updatedAt = evaluation.updatedAt;
    }
  }

  return {
    attributes,
    evaluatorCount: evaluations.length,
    includedValueCount,
    outlierValueCount,
    updatedAt,
  };
}

export function applyEvaluationAggregate(
  player: Player,
  evaluations: PlayerEvaluation[],
  currentUserId?: string | null,
): Player {
  const activeEvaluations = evaluations.filter((evaluation) => !evaluation.deletedAt);
  if (activeEvaluations.length === 0) {
    return {
      ...player,
      personalAttributes: player.personalAttributes || player.atributos,
      hasOwnEvaluation: false,
    };
  }

  const aggregate = aggregatePlayerEvaluations(activeEvaluations, player.atributos);
  const ownEvaluation = currentUserId
    ? activeEvaluations.find((evaluation) => evaluation.ownerId === currentUserId)
    : undefined;

  return {
    ...player,
    atributos: aggregate.attributes,
    personalAttributes: ownEvaluation?.attributes || player.personalAttributes || player.atributos,
    evaluationAggregate: aggregate,
    hasOwnEvaluation: !!ownEvaluation,
  };
}

export function simulateLocalConsensus(
  player: Player,
  newPersonalAttributes: Attributes,
): Pick<Player, 'atributos' | 'evaluationAggregate' | 'hasOwnEvaluation'> {
  const isNewPlayer = !player.cloudId;
  const oldPersonal = player.personalAttributes;
  const oldConsensus = player.atributos;
  const oldAggregate = player.evaluationAggregate;
  const oldEvaluatorCount = oldAggregate?.evaluatorCount ?? 0;
  const hasOwn = !!player.hasOwnEvaluation;

  const newConsensus = {} as Attributes;

  for (const key of ATTRIBUTE_KEYS) {
    const pNew = clampAttribute(Number(newPersonalAttributes[key]));
    const aOld = clampAttribute(Number(oldConsensus[key]));

    let newVal: number;

    if (isNewPlayer || oldEvaluatorCount === 0) {
      // Jogador novo/local sem avaliações de terceiros
      newVal = pNew;
    } else if (hasOwn) {
      // Cenário A: Usuário já avaliou. Substitui peso da nota anterior.
      const pOld = clampAttribute(Number(oldPersonal ? oldPersonal[key] : aOld));
      const divisor = oldEvaluatorCount > 0 ? oldEvaluatorCount : 1;
      newVal = (aOld * divisor - pOld + pNew) / divisor;
    } else {
      // Cenário B: Usuário não havia avaliado. Adiciona nova avaliação ao peso.
      const divisor = oldEvaluatorCount + 1;
      newVal = (aOld * oldEvaluatorCount + pNew) / divisor;
    }

    newConsensus[key] = roundAttribute(clampAttribute(newVal));
  }

  const newEvaluatorCount =
    isNewPlayer || oldEvaluatorCount === 0 ? 1 : hasOwn ? oldEvaluatorCount : oldEvaluatorCount + 1;

  return {
    atributos: newConsensus,
    hasOwnEvaluation: true,
    evaluationAggregate: {
      attributes: newConsensus,
      evaluatorCount: newEvaluatorCount,
      includedValueCount: newEvaluatorCount * ATTRIBUTE_KEYS.length,
      outlierValueCount: oldAggregate?.outlierValueCount ?? 0,
      updatedAt: new Date().toISOString(),
    },
  };
}
