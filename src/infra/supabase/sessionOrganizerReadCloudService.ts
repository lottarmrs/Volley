import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient';

export interface SessionOrganizer {
  userId: string;
  name: string;
}

export const sessionOrganizerReadCloudService = {
  async fetchOrganizer(sessionCloudId: string): Promise<SessionOrganizer | null> {
    if (!isSupabaseConfigured) {
      throw Object.assign(new Error('Cloud unavailable'), { code: 'CLOUD_UNAVAILABLE' });
    }
    const { data, error } = await supabase.rpc('get_session_organizer', {
      p_session_id: sessionCloudId,
    });
    if (error) throw error;
    if (!data) return null;
    return { userId: String(data.user_id), name: String(data.name) };
  },
};
