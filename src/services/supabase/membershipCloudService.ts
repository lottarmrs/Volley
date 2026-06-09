import { supabase } from '../../lib/supabaseClient';
import { CommunityMember, CommunityMemberRole } from '../../types';

type DbRecord = Record<string, any>;

export function mapDbToCommunityMember(db: DbRecord, communityLocalId?: string): CommunityMember {
  const profile = Array.isArray(db.profiles) ? db.profiles[0] : db.profiles;
  return {
    id: db.id,
    communityId: communityLocalId || db.community_id,
    userId: db.user_id,
    role: db.role,
    name: profile?.name ?? null,
    email: profile?.email ?? null,
    createdAt: db.created_at,
    updatedAt: db.updated_at,
  };
}

export const membershipCloudService = {
  async fetchByCommunity(communityCloudId: string, communityLocalId?: string): Promise<CommunityMember[]> {
    const { data, error } = await supabase
      .from('community_members')
      .select('id, community_id, user_id, role, created_at, updated_at, profiles(name, email)')
      .eq('community_id', communityCloudId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return (data || []).map(row => mapDbToCommunityMember(row, communityLocalId));
  },

  async addOrganizerByEmail(
    communityCloudId: string,
    email: string,
    role: CommunityMemberRole = 'organizer',
    communityLocalId?: string,
  ): Promise<CommunityMember> {
    const { data, error } = await supabase.rpc('add_community_member_by_email', {
      target_community_id: communityCloudId,
      target_email: email.trim().toLowerCase(),
      target_role: role,
    });

    if (error) throw error;
    return mapDbToCommunityMember(data, communityLocalId);
  },

  async updateRole(memberId: string, role: CommunityMemberRole): Promise<CommunityMember> {
    const { data, error } = await supabase
      .from('community_members')
      .update({ role, updated_at: new Date().toISOString() })
      .eq('id', memberId)
      .select('id, community_id, user_id, role, created_at, updated_at, profiles(name, email)')
      .single();

    if (error) throw error;
    return mapDbToCommunityMember(data);
  },

  async removeMember(memberId: string): Promise<void> {
    const { error } = await supabase
      .from('community_members')
      .delete()
      .eq('id', memberId);

    if (error) throw error;
  },
};
