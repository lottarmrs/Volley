import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient';
import type { CardStatRow } from '@app/cardStats';
import type { CommunitySkillProfile, CommunitySkillProfileRequest } from '@shared/types';

export const communitySkillProfileCloudService = {
  async fetchProfile(input: CommunitySkillProfileRequest): Promise<CommunitySkillProfile> {
    if (!isSupabaseConfigured) {
      throw Object.assign(new Error('Cloud unavailable'), { code: 'CLOUD_UNAVAILABLE' });
    }
    const { data, error } = await supabase.rpc('get_community_player_skill_profile', {
      p_community_id: input.communityId,
      p_player_id: input.playerId,
      p_rubric_version: input.rubricVersion,
    });
    if (error) throw error;
    if (!data || !Array.isArray(data.dimensions)) throw new Error('Invalid profile response');
    return data as CommunitySkillProfile;
  },
  async fetchCardStats(communityCloudId: string): Promise<CardStatRow[]> {
    if (!isSupabaseConfigured) {
      throw Object.assign(new Error('Cloud unavailable'), { code: 'CLOUD_UNAVAILABLE' });
    }
    const { data, error } = await supabase.rpc('get_community_card_stats', {
      p_community_id: communityCloudId,
    });
    if (error) throw error;
    return (data ?? []).map((row: Record<string, unknown>) => ({
      playerId: String(row.player_id),
      dimensionKey: String(row.dimension_key),
      value: Number(row.value),
    }));
  },
};
