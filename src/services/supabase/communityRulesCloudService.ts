import { supabase } from '../../lib/supabaseClient';
import { CommunityRules } from '../../types';

export function mapRulesToDb(local: CommunityRules, ownerId: string, communityCloudId: string) {
  return {
    id: local.cloudId || undefined,
    owner_id: ownerId,
    community_id: communityCloudId,
    default_format: local.defaultFormat,
    default_location: local.defaultLocation || null,
    default_day: local.defaultDay || null,
    default_start_time: local.defaultStartTime || null,
    default_end_time: local.defaultEndTime || null,
    free_play_rules: local.freePlay || {},
    tournament_rules: local.tournament || {},
    balance_weights: local.balanceWeights || {},
    default_team_names: local.defaultTeamNames || [],
    default_team_colors: local.defaultTeamColors || [],
    updated_at: local.updatedAt || new Date().toISOString(),
  };
}

export function mapDbToRules(db: any, communityLocalId: string): CommunityRules {
  return {
    communityId: communityLocalId,
    defaultFormat: db.default_format || 'free_play',
    defaultLocation: db.default_location || undefined,
    defaultDay: db.default_day || undefined,
    defaultStartTime: db.default_start_time || undefined,
    defaultEndTime: db.default_end_time || undefined,
    freePlay: db.free_play_rules || {},
    tournament: db.tournament_rules || {},
    balanceWeights: db.balance_weights || {},
    defaultTeamNames: db.default_team_names || [],
    defaultTeamColors: db.default_team_colors || [],
    updatedAt: db.updated_at,
    cloudId: db.id,
    syncStatus: 'synced',
    lastSyncedAt: new Date().toISOString(),
  };
}

export const communityRulesCloudService = {
  async fetchAll(communityLocalIdMap: Record<string, string>): Promise<CommunityRules[]> {
    // communityLocalIdMap maps communityCloudId -> communityLocalId
    const { data, error } = await supabase.from('community_rules').select('*');

    if (error) throw error;

    return (data || [])
      .filter((db) => communityLocalIdMap[db.community_id])
      .map((db) => mapDbToRules(db, communityLocalIdMap[db.community_id]));
  },

  async upsert(
    local: CommunityRules,
    ownerId: string,
    communityCloudId: string,
  ): Promise<CommunityRules> {
    const dbRecord = mapRulesToDb(local, ownerId, communityCloudId);
    const { data, error } = await supabase
      .from('community_rules')
      .upsert(dbRecord, { onConflict: 'community_id' })
      .select()
      .single();

    if (error) throw error;
    return mapDbToRules(data, local.communityId);
  },
};
