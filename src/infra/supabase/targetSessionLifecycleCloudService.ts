import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient';
import type { RpcClient } from './sessionCohortCloudService';

export interface TargetSessionLifecycleService {
  readRevision(sessionId: string): Promise<number>;
  freezeRules(sessionId: string, payload: object): Promise<void>;
  schedule(sessionId: string): Promise<void>;
  start(sessionId: string): Promise<void>;
  finish(sessionId: string): Promise<void>;
  cancel(sessionId: string, reason: string): Promise<void>;
}

export function createTargetSessionLifecycleCloudService(
  client: RpcClient,
  createId: () => string = () => crypto.randomUUID(),
): TargetSessionLifecycleService {
  async function call(name: string, args: Record<string, unknown>): Promise<unknown> {
    const { data, error } = await client.rpc(name, args);
    if (error) throw error;
    return data;
  }

  async function readRevision(sessionId: string): Promise<number> {
    const data = await call('read_target_session', { p_session_id: sessionId });
    const row = (Array.isArray(data) ? data[0] : data) as { revision?: unknown } | null;
    if (!row || typeof row.revision !== 'number') {
      throw new Error('Invalid read_target_session response');
    }
    return row.revision;
  }

  const transition = (name: string) => async (sessionId: string) => {
    await call(name, {
      p_command_id: createId(),
      p_session_id: sessionId,
      p_expected_revision: await readRevision(sessionId),
    });
  };

  return {
    readRevision,
    async freezeRules(sessionId, payload) {
      await call('freeze_target_session_rules_snapshot', {
        p_snapshot_id: createId(),
        p_session_id: sessionId,
        p_expected_revision: await readRevision(sessionId),
        p_rules_schema_version: 1,
        p_source_kind: 'SESSION_EXPLICIT',
        p_rules_payload: payload,
      });
    },
    schedule: transition('schedule_target_session'),
    start: transition('start_target_session'),
    finish: transition('finish_target_session'),
    async cancel(sessionId, reason) {
      await call('cancel_target_session', {
        p_command_id: createId(),
        p_session_id: sessionId,
        p_expected_revision: await readRevision(sessionId),
        p_cancel_reason: reason,
      });
    },
  };
}

export const targetSessionLifecycleCloudService = isSupabaseConfigured
  ? createTargetSessionLifecycleCloudService(supabase)
  : createTargetSessionLifecycleCloudService({
      rpc: async () => {
        throw new Error('Supabase is not configured.');
      },
    });
