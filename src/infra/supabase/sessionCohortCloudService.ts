import type {
  SessionCohortInspectionGateway,
  SessionCutoverInspection,
} from '@app/sessionCohortCutover';
import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient';

export interface RpcClient {
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): Promise<{
    data: unknown;
    error: { code?: string; message: string } | null;
  }>;
}

function inspectionFromResponse(data: unknown): SessionCutoverInspection {
  if (Array.isArray(data) && data.length !== 1) {
    throw new Error('Invalid Session cutover inspection response');
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    throw new Error('Invalid Session cutover inspection response');
  }

  const value = row as Record<string, unknown>;
  if (
    typeof value.eligible !== 'boolean' ||
    !Array.isArray(value.blockers) ||
    !value.blockers.every((blocker) => typeof blocker === 'string') ||
    typeof value.source_fingerprint !== 'string' ||
    typeof value.selected_player_count !== 'number' ||
    !Number.isInteger(value.selected_player_count)
  ) {
    throw new Error('Invalid Session cutover inspection response');
  }

  return {
    eligible: value.eligible,
    blockers: value.blockers,
    sourceFingerprint: value.source_fingerprint,
    selectedPlayerCount: value.selected_player_count,
  };
}

export function createSessionCohortCloudService(client: RpcClient): SessionCohortInspectionGateway {
  return {
    async inspect(sessionId) {
      const { data, error } = await client.rpc('inspect_legacy_session_cutover', {
        p_session_id: sessionId,
      });
      if (error) throw error;
      return inspectionFromResponse(data);
    },
  };
}

export const sessionCohortCloudService = isSupabaseConfigured
  ? createSessionCohortCloudService(supabase)
  : createSessionCohortCloudService({
      rpc: async () => {
        throw new Error('Supabase is not configured.');
      },
    });
