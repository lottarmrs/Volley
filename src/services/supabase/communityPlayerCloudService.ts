import { supabase } from '../../lib/supabaseClient';

export interface CommunityPlayerDb {
  id?: string;
  owner_id: string;
  community_id: string;
  player_id: string;
  active: boolean;
}

export const communityPlayerCloudService = {
  async fetchAll(): Promise<CommunityPlayerDb[]> {
    const { data, error } = await supabase
      .from('community_players')
      .select('id, owner_id, community_id, player_id, active');

    if (error) throw error;
    return data || [];
  },

  async bulkUpsert(relations: Omit<CommunityPlayerDb, 'id'>[]): Promise<void> {
    if (relations.length === 0) return;
    const { error } = await supabase
      .from('community_players')
      .upsert(relations, { onConflict: 'community_id,player_id' });

    if (error) throw error;
  },

  async removeRelation(communityId: string, playerId: string): Promise<void> {
    const { error } = await supabase
      .from('community_players')
      .delete()
      .eq('community_id', communityId)
      .eq('player_id', playerId);

    if (error) throw error;
  },

  async clearAllForUser(): Promise<void> {
    // RLS will ensure we only delete our own rows anyway, but this is a clean helper
    const { error } = await supabase
      .from('community_players')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete everything we have access to

    if (error) throw error;
  }
};
