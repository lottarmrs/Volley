import { supabase } from '../../lib/supabaseClient';
import { Community } from '../../types';

export function mapCommunityToDb(local: Community, ownerId: string) {
  return {
    id: local.cloudId || undefined,
    owner_id: ownerId,
    name: local.name,
    description: local.description || null,
    default_location: local.defaultLocation || null,
    default_day: local.defaultDay || null,
    default_start_time: local.defaultStartTime || null,
    default_end_time: local.defaultEndTime || null,
    default_format: local.defaultFormat || 'free_play',
    color: local.color || null,
    icon: local.icon || null,
    archived: !!local.archived,
    local_id: local.id,
    deleted_at: local.deletedAt || null,
    updated_at: local.updatedAt || new Date().toISOString(),
  };
}

export function mapDbToCommunity(db: any): Community {
  return {
    id: db.local_id || db.id,
    name: db.name,
    description: db.description || undefined,
    defaultLocation: db.default_location || undefined,
    defaultDay: db.default_day || undefined,
    defaultStartTime: db.default_start_time || undefined,
    defaultEndTime: db.default_end_time || undefined,
    defaultFormat: db.default_format || 'free_play',
    color: db.color || undefined,
    icon: db.icon || undefined,
    archived: db.archived,
    createdAt: db.created_at,
    updatedAt: db.updated_at,
    cloudId: db.id,
    syncStatus: 'synced',
    lastSyncedAt: new Date().toISOString(),
    deletedAt: db.deleted_at || undefined,
  };
}

export const communityCloudService = {
  async fetchAll(): Promise<Community[]> {
    const { data, error } = await supabase
      .from('communities')
      .select('*')
      .is('deleted_at', null);

    if (error) throw error;
    return (data || []).map(mapDbToCommunity);
  },

  async upsert(local: Community, ownerId: string): Promise<Community> {
    const dbRecord = mapCommunityToDb(local, ownerId);
    const { data, error } = await supabase
      .from('communities')
      .upsert(dbRecord)
      .select()
      .single();

    if (error) throw error;
    return mapDbToCommunity(data);
  },

  async softDelete(cloudId: string): Promise<void> {
    const { error } = await supabase
      .from('communities')
      .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', cloudId);

    if (error) throw error;
  }
};
