import type {
  BalanceInputSnapshot,
  BalanceInputSnapshotParticipant,
  FormationParticipant,
  FreePlayConfig,
  Gender,
  PlayerBalanceSnapshot,
  TeamFormationRequest,
  TournamentConfig,
} from '@shared/types';
import { TEAM_FORMATION_CONTRACT_VERSION, TEAM_FORMATION_OBJECTIVE_POLICY } from '@shared/types';
import {
  BALANCE_ALGORITHM_VERSION,
  deriveFormationBudget,
  resolveBalanceWeights,
} from '../logic/balancing';

type SolverConfig = TournamentConfig | FreePlayConfig;

export class InvalidAuthorizedSnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidAuthorizedSnapshotError';
  }
}

function objectiveFrom(config: SolverConfig | undefined) {
  return {
    policyVersion: TEAM_FORMATION_OBJECTIVE_POLICY,
    mode: config?.balanceMode ?? 'balanced',
    rotationType: config?.rotationType ?? ('6x0' as const),
    repetitionWeight: typeof config?.repetitionWeight === 'number' ? config.repetitionWeight : 0.8,
    weights: resolveBalanceWeights(config),
  };
}

export function fromLocalSnapshots(input: {
  snapshots: readonly PlayerBalanceSnapshot[];
  teamCount: number;
  config?: SolverConfig;
}): TeamFormationRequest {
  return {
    contractVersion: TEAM_FORMATION_CONTRACT_VERSION,
    algorithmVersion: BALANCE_ALGORITHM_VERSION,
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

const RUBRIC_DIMENSIONS = [
  ['ataque', 'attack'],
  ['defesa', 'defense'],
  ['saque', 'serve'],
  ['recepcao', 'reception'],
  ['levantamento', 'setting'],
  ['bloqueio', 'block'],
  ['velocidade', 'speed'],
  ['resistencia', 'stamina'],
  ['leituraDeJogo', 'gameVision'],
  ['regularidade', 'consistency'],
  ['controleEmocional', 'emotionalControl'],
] as const;

function readRubricDimension(
  vector: Record<string, number>,
  rubricKey: string,
  participantId: string,
): number {
  const value = vector[rubricKey];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new InvalidAuthorizedSnapshotError(
      `Dimensão "${rubricKey}" ausente ou inválida no snapshot do atleta ${participantId}.`,
    );
  }
  return value;
}

function readGender(gender: string | null, participantId: string): Gender | null {
  if (gender === null) return null;
  if (gender === 'M' || gender === 'F') return gender;
  throw new InvalidAuthorizedSnapshotError(
    `Gênero "${gender}" inesperado no snapshot do atleta ${participantId}.`,
  );
}

function toFormationParticipant(
  participant: BalanceInputSnapshotParticipant,
): FormationParticipant {
  const vector = participant.attribute_vector;
  const id = participant.participant_id;
  const dimensions = Object.fromEntries(
    RUBRIC_DIMENSIONS.map(([rubricKey, field]) => [
      field,
      readRubricDimension(vector, rubricKey, id),
    ]),
  ) as Record<(typeof RUBRIC_DIMENSIONS)[number][1], number>;

  return {
    participantId: id,
    ...dimensions,
    heightCm: participant.height_cm,
    gender: readGender(participant.gender, id),
    position: participant.primary_position,
    secondaryPositions: participant.secondary_positions,
    isInjured: participant.is_injured,
    isEstimated: participant.is_estimated,
  };
}

export function fromAuthorizedSnapshot(input: {
  snapshot: BalanceInputSnapshot;
  teamCount: number;
  config?: SolverConfig;
}): TeamFormationRequest {
  const participants = input.snapshot.participants.map(toFormationParticipant);

  return {
    contractVersion: TEAM_FORMATION_CONTRACT_VERSION,
    algorithmVersion: BALANCE_ALGORITHM_VERSION,
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
