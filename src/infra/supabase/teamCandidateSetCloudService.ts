import type {
  PublishedTeamCandidateSet,
  PublishTeamCandidateSetRequest,
  TeamCandidateSetRead,
} from '@shared/types';
import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient';
import type { RpcClient } from './sessionCohortCloudService';

export interface TeamCandidateSetCloudService {
  publish(input: PublishTeamCandidateSetRequest): Promise<PublishedTeamCandidateSet>;
  read(setId: string): Promise<TeamCandidateSetRead>;
}

function invalid(label: string): Error {
  return new Error(`Invalid ${label} response`);
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid(label);
  return value as Record<string, unknown>;
}

function text(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) throw invalid(label);
  return value;
}

function integer(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) throw invalid(label);
  return value;
}

function assignment(value: unknown, label: string): string[][] {
  if (
    !Array.isArray(value) ||
    !value.every((team) => Array.isArray(team) && team.every((id) => typeof id === 'string'))
  ) {
    throw invalid(label);
  }
  return value as string[][];
}

export function createTeamCandidateSetCloudService(
  client: RpcClient,
): TeamCandidateSetCloudService {
  async function call(name: string, args: Record<string, unknown>): Promise<unknown> {
    const { data, error } = await client.rpc(name, args);
    if (error) throw error;
    return data;
  }

  return {
    async publish(input) {
      const label = 'publish_team_candidate_set';
      const row = record(
        await call(label, {
          p_command_id: input.commandId,
          p_session_id: input.sessionId,
          p_snapshot_id: input.snapshotId,
          p_set: input.set,
        }),
        label,
      );
      return {
        setId: text(row.set_id, label),
        setFingerprint: text(row.set_fingerprint, label),
      };
    },
    async read(setId) {
      const label = 'read_team_candidate_set';
      const row = record(await call(label, { p_set_id: setId }), label);
      if (!Array.isArray(row.candidates)) throw invalid(label);
      return {
        setId: text(row.set_id, label),
        sessionId: text(row.session_id, label),
        rosterRevisionId: text(row.roster_revision_id, label),
        snapshotId: text(row.snapshot_id, label),
        teamCount: integer(row.team_count, label),
        setFingerprint: text(row.set_fingerprint, label),
        candidates: row.candidates.map((value) => {
          const candidate = record(value, label);
          return {
            candidateIndex: integer(candidate.candidate_index, label),
            candidateFingerprint: text(candidate.candidate_fingerprint, label),
            assignment: assignment(candidate.assignment, label),
          };
        }),
      };
    },
  };
}

export const teamCandidateSetCloudService: TeamCandidateSetCloudService = isSupabaseConfigured
  ? createTeamCandidateSetCloudService(supabase)
  : createTeamCandidateSetCloudService({
      rpc: async () => {
        throw Object.assign(new Error('Cloud unavailable'), { code: 'CLOUD_UNAVAILABLE' });
      },
    });
