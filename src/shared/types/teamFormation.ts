/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

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
