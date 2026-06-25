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
    visibility: db.visibility || 'private',
    joinCode: db.join_code ?? null,
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
    const { data, error } = await supabase.from('communities').select('*');

    if (error) throw error;
    return (data || []).map(mapDbToCommunity);
  },

  async upsert(local: Community, ownerId: string): Promise<Community> {
    const dbRecord = mapCommunityToDb(local, ownerId);
    if (local.cloudId) {
      const updateRecord = { ...dbRecord };
      delete (updateRecord as any).id;

      const { data, error } = await supabase
        .from('communities')
        .update(updateRecord)
        .eq('id', local.cloudId)
        .select()
        .maybeSingle();

      if (error) throw error;
      if (data) return mapDbToCommunity(data);
    }

    try {
      const { data, error } = await supabase
        .from('communities')
        .upsert(dbRecord, { onConflict: 'owner_id,local_id' })
        .select()
        .single();

      if (error) throw error;
      return mapDbToCommunity(data);
    } catch (error: any) {
      if (
        error &&
        (error.code === '23505' || error.statusCode === '23505') &&
        error.message?.includes('communities_pkey')
      ) {
        // PK collision means the row already exists in the cloud with this id
        // but has a different local_id (pre-migration value). Update it in place
        // so that local_id is aligned with the new UUID scheme.
        console.warn(`Primary key collision for community ${local.name}. Updating existing row by PK.`);
        const updateRecord = { ...dbRecord };
        delete (updateRecord as any).id;

        const { data: fallbackData, error: fallbackError } = await supabase
          .from('communities')
          .update(updateRecord)
          .eq('id', dbRecord.id)
          .select()
          .single();

        if (fallbackError) throw fallbackError;
        return mapDbToCommunity(fallbackData);
      }
      throw error;
    }
  },

  async softDelete(cloudId: string): Promise<void> {
    const { error } = await supabase
      .from('communities')
      .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', cloudId);

    if (error) throw error;
  },
};
