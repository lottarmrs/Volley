import type {
  CreateTargetSessionInput,
  SessionCohortCreationGateway,
  SessionCohortInspectionGateway,
  SessionCohortReadGateway,
  SessionCutoverInspection,
  TargetSessionRead,
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

function isStringOrNull(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function targetSessionFromResponse(data: unknown): TargetSessionRead {
  if (Array.isArray(data) && data.length !== 1) {
    throw new Error('Invalid target Session read response');
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    throw new Error('Invalid target Session read response');
  }

  const value = row as Record<string, unknown>;
  if (
    typeof value.id !== 'string' ||
    !isStringOrNull(value.community_id) ||
    typeof value.name !== 'string' ||
    typeof value.session_context !== 'string' ||
    typeof value.play_mode !== 'string' ||
    typeof value.lifecycle_status !== 'string' ||
    typeof value.publication_state !== 'string' ||
    typeof value.revision !== 'number' ||
    !Number.isInteger(value.revision) ||
    !isStringOrNull(value.current_roster_revision_id)
  ) {
    throw new Error('Invalid target Session read response');
  }

  return {
    id: value.id,
    communityId: value.community_id,
    name: value.name,
    sessionContext: value.session_context,
    playMode: value.play_mode,
    lifecycleStatus: value.lifecycle_status,
    publicationState: value.publication_state,
    revision: value.revision,
    currentRosterRevisionId: value.current_roster_revision_id,
  };
}

const TARGET_SESSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function targetSessionIdFromResponse(data: unknown): string {
  if (typeof data !== 'string' || !TARGET_SESSION_ID_PATTERN.test(data)) {
    throw new Error('Invalid create target Session response');
  }
  return data;
}

export function createSessionCohortCloudService(
  client: RpcClient,
): SessionCohortInspectionGateway & SessionCohortReadGateway & SessionCohortCreationGateway {
  return {
    async inspect(sessionId) {
      const { data, error } = await client.rpc('inspect_legacy_session_cutover', {
        p_session_id: sessionId,
      });
      if (error) throw error;
      return inspectionFromResponse(data);
    },
    async readTargetSession(sessionCloudId) {
      const { data, error } = await client.rpc('read_target_session', {
        p_session_id: sessionCloudId,
      });
      if (error) throw error;
      return targetSessionFromResponse(data);
    },
    async createTargetSession(input: CreateTargetSessionInput) {
      const { data, error } = await client.rpc('create_target_session', {
        p_session_id: input.sessionId,
        p_community_id: input.communityId,
        p_session_context: 'COMMUNITY',
        p_play_mode: input.playMode,
        p_name: input.name,
        p_planned_start_at: null,
        p_planned_end_at: null,
      });
      if (error) throw error;
      return { id: targetSessionIdFromResponse(data) };
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
