import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient';
import type { BalanceInputSnapshot, BalanceInputSnapshotCaptureRequest } from '@shared/types';

function assertSnapshot(data: unknown): BalanceInputSnapshot {
  if (
    !data ||
    typeof data !== 'object' ||
    !Array.isArray((data as BalanceInputSnapshot).participants)
  ) {
    throw new Error('Invalid balance input snapshot response');
  }
  return data as BalanceInputSnapshot;
}

export const balanceInputSnapshotCloudService = {
  async capture(input: BalanceInputSnapshotCaptureRequest): Promise<BalanceInputSnapshot> {
    if (!isSupabaseConfigured) {
      throw Object.assign(new Error('Cloud unavailable'), { code: 'CLOUD_UNAVAILABLE' });
    }
    const { data, error } = await supabase.rpc('capture_balance_input_snapshot', {
      p_command_id: input.commandId,
      p_session_id: input.sessionId,
      p_roster_revision_id: input.rosterRevisionId,
    });
    if (error) throw error;
    return assertSnapshot(data);
  },

  async read(snapshotId: string): Promise<BalanceInputSnapshot> {
    if (!isSupabaseConfigured) {
      throw Object.assign(new Error('Cloud unavailable'), { code: 'CLOUD_UNAVAILABLE' });
    }
    const { data, error } = await supabase.rpc('read_balance_input_snapshot', {
      p_snapshot_id: snapshotId,
    });
    if (error) throw error;
    return assertSnapshot(data);
  },
};
