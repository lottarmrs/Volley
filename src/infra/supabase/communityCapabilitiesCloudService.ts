import { isSupabaseConfigured, supabase as client } from '../../lib/supabaseClient';

export const communityCapabilitiesCloudService = {
  async has(communityCloudId: string, capability: string): Promise<boolean> {
    if (!isSupabaseConfigured)
      throw Object.assign(new Error('Cloud unavailable'), { code: 'CLOUD_UNAVAILABLE' });
    const { data, error } = await client.rpc('current_user_has_community_capability', {
      target_community_id: communityCloudId,
      target_capability: capability,
    });
    if (error) throw error;
    return data === true;
  },
};
