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
