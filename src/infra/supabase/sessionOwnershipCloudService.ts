import { supabase } from '../../lib/supabaseClient';

export interface SessionControlRow {
  controlled_by_user_id: string | null;
  control_claimed_at: string | null;
  control_device_id: string | null;
}

export const sessionOwnershipCloudService = {
  async claim(sessionCloudId: string, deviceId: string): Promise<SessionControlRow> {
    const { data, error } = await supabase.rpc('claim_session_ownership', {
      p_session_id: sessionCloudId,
      p_device_id: deviceId,
    });
    if (error) throw error;
    return data as unknown as SessionControlRow;
  },

  async transfer(sessionCloudId: string, deviceId: string): Promise<SessionControlRow> {
    const { data, error } = await supabase.rpc('transfer_session_ownership', {
      p_session_id: sessionCloudId,
      p_device_id: deviceId,
    });
    if (error) throw error;
    return data as unknown as SessionControlRow;
  },
};
