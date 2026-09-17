import {
  TEAM_FORMATION_CONTRACT_VERSION,
  TEAM_FORMATION_OBJECTIVE_POLICY,
  type BalanceConstraints,
  type Division,
  type Player,
  type TeamCandidateSetPayload,
} from '@shared/types';
import { BALANCE_ALGORITHM_VERSION } from '../logic/balancing';
import type { RosterRevisionRead } from './authorizedFormationGateways';

export interface CandidateSetMappingInput {
  readonly divisions: readonly Division[];
  readonly constraints: BalanceConstraints | undefined;
  readonly roster: RosterRevisionRead;
  readonly players: readonly Player[];
}

export type CandidateSetMapping =
  | { readonly ok: true; readonly set: TeamCandidateSetPayload }
  | { readonly ok: false; readonly unmappedPlayerIds: string[] };

export function buildTeamCandidateSetPayload(input: CandidateSetMappingInput): CandidateSetMapping {
  const participantByCloudId = new Map<string, string>();
  for (const entry of input.roster.entries) {
    if (entry.playerId) participantByCloudId.set(entry.playerId.toLowerCase(), entry.participantId);
  }
  const participantByPlayerId = new Map<string, string>();
  for (const player of input.players) {
    const participantId = player.cloudId
      ? participantByCloudId.get(player.cloudId.toLowerCase())
      : undefined;
    if (participantId) participantByPlayerId.set(player.id, participantId);
  }

  const unmapped = new Set<string>();
  const candidates = input.divisions.map((division) => ({
    teams: division.teams.map((team) =>
      team.playerIds.map((playerId) => {
        const participantId = participantByPlayerId.get(playerId);
        if (!participantId) unmapped.add(playerId);
        return participantId ?? '';
      }),
    ),
    clientClaimed: {
      score: division.score,
      penalty: division.penalty,
      seed: division.seed ?? null,
      iterations: division.iterations ?? null,
      qualityLabel: division.qualityLabel ?? null,
      algorithm: division.algorithm ?? null,
    },
  }));
  if (unmapped.size > 0) return { ok: false, unmappedPlayerIds: [...unmapped] };

  const lockedParticipantTeams: Record<string, number> = {};
  for (const [playerId, teamIndex] of Object.entries(input.constraints?.lockedPlayerIdxs ?? {})) {
    const participantId = participantByPlayerId.get(playerId);
    if (participantId) lockedParticipantTeams[participantId] = teamIndex;
  }
  const pairs = (list: [string, string][] | undefined): [string, string][] =>
    (list ?? []).flatMap(([left, right]) => {
      const first = participantByPlayerId.get(left);
      const second = participantByPlayerId.get(right);
      return first && second ? [[first, second] as [string, string]] : [];
    });

  return {
    ok: true,
    set: {
      teamCount: input.divisions[0]?.teams.length ?? 0,
      contractVersion: TEAM_FORMATION_CONTRACT_VERSION,
      algorithmVersion: BALANCE_ALGORITHM_VERSION,
      objectivePolicyVersion: TEAM_FORMATION_OBJECTIVE_POLICY,
      hardConstraints: {
        lockedParticipantTeams,
        pairsTogether: pairs(input.constraints?.pairsTogether),
        pairsSeparated: pairs(input.constraints?.pairsSeparated),
      },
      clientClaimed: { candidateCount: candidates.length },
      candidates,
    },
  };
}
