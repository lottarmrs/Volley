import { supabase } from '../../lib/supabaseClient';

export interface CommunityPlayerDb {
  id?: string;
  owner_id: string;
  community_id: string;
  player_id: string;
  active: boolean;
  status?: 'active' | 'inactive' | 'banned';
  role?: 'owner' | 'admin' | 'player' | 'guest';
  sync_version?: number;
  deleted_at?: string | null;
}

function isCardinalityViolation(error: any): boolean {
  return (
    error?.code === '21000' ||
    error?.message?.includes('ON CONFLICT DO UPDATE command cannot affect row a second time')
  );
}

export const communityPlayerCloudService = {
  async fetchAll(): Promise<CommunityPlayerDb[]> {
    const { data, error } = await supabase
      .from('community_players')
      .select(
        'id, owner_id, community_id, player_id, active, status, role, sync_version, deleted_at',
      );

    if (error) throw error;
    return data || [];
  },

  async bulkUpsert(relations: Omit<CommunityPlayerDb, 'id'>[]): Promise<void> {
    if (relations.length === 0) return;
    const seen = new Set<string>();
    const deduplicated = relations.filter((r) => {
      const key = `${r.community_id.trim().toLowerCase()}:${r.player_id.trim().toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const { error } = await supabase
      .from('community_players')
      .upsert(deduplicated, { onConflict: 'community_id,player_id' });

    if (!error) return;
    if (!isCardinalityViolation(error)) throw error;

    console.warn(
      'Bulk community_players upsert contained duplicate conflict keys. Falling back to individual upserts.',
    );
    for (const relation of deduplicated) {
      const { error: individualError } = await supabase
        .from('community_players')
        .upsert(relation, { onConflict: 'community_id,player_id' });
      if (individualError) throw individualError;
    }
  },

  async linkPlayer(
    communityCloudId: string,
    playerCloudId: string,
    ownerId: string,
  ): Promise<void> {
    await this.bulkUpsert([
      { owner_id: ownerId, community_id: communityCloudId, player_id: playerCloudId, active: true },
    ]);
  },

  async removeRelation(communityId: string, playerId: string): Promise<void> {
    const { error } = await supabase
      .from('community_players')
      .delete()
      .eq('community_id', communityId)
      .eq('player_id', playerId);

    if (error) throw error;
  },

  async clearAllForUser(ownerId: string): Promise<void> {
    const { error } = await supabase.from('community_players').delete().eq('owner_id', ownerId);

    if (error) throw error;
  },

  async deleteByIdsForUser(ownerId: string, ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const { error } = await supabase
      .from('community_players')
      .delete()
      .eq('owner_id', ownerId)
      .in('id', ids);

    if (error) throw error;
  },
};
