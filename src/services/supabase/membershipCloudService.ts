import { supabase } from '../../lib/supabaseClient';
import { CommunityMember, CommunityMemberRole } from '../../types';

type DbRecord = Record<string, any>;

const MEMBER_COLUMNS =
  'id, community_id, user_id, role, status, invited_by, created_at, updated_at, profiles(name, email)';

export function mapDbToCommunityMember(db: DbRecord, communityLocalId?: string): CommunityMember {
  const profile = Array.isArray(db.profiles) ? db.profiles[0] : db.profiles;
  return {
    id: db.id,
    communityId: communityLocalId || db.community_id,
    userId: db.user_id,
    role: db.role,
    status: db.status ?? 'active',
    invitedBy: db.invited_by ?? null,
    name: profile?.name ?? null,
    email: profile?.email ?? null,
    createdAt: db.created_at,
    updatedAt: db.updated_at,
  };
}

export const membershipCloudService = {
  async fetchByCommunity(
    communityCloudId: string,
    communityLocalId?: string,
  ): Promise<CommunityMember[]> {
    const { data, error } = await supabase
      .from('community_members')
      .select(MEMBER_COLUMNS)
      .eq('community_id', communityCloudId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return (data || []).map((row) => mapDbToCommunityMember(row, communityLocalId));
  },

  async addOrganizerByEmail(
    communityCloudId: string,
    email: string,
    role: CommunityMemberRole = 'moderator',
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
      .select(MEMBER_COLUMNS)
      .single();

    if (error) throw error;
    return mapDbToCommunityMember(data);
  },

  async removeMember(memberId: string): Promise<void> {
    const { error } = await supabase.from('community_members').delete().eq('id', memberId);

    if (error) throw error;
  },

  // ── Sistema de entrada (link/código + pedido/aprovação) ───────────────────

  /** Gera (ou rotaciona) o código de convite. Retorna o novo código. */
  async generateJoinCode(communityCloudId: string): Promise<string> {
    const { data, error } = await supabase.rpc('generate_join_code', {
      target_community_id: communityCloudId,
    });
    if (error) throw error;
    return data as string;
  },

  /** Desativa o código de convite da comunidade. */
  async disableJoinCode(communityCloudId: string): Promise<void> {
    const { error } = await supabase.rpc('disable_join_code', {
      target_community_id: communityCloudId,
    });
    if (error) throw error;
  },

  /** Preview da comunidade a partir de um código (sem entrar). */
  async findByCode(
    code: string,
  ): Promise<{ id: string; name: string; description: string | null; memberCount: number; myStatus: string | null } | null> {
    const { data, error } = await supabase.rpc('find_community_by_code', { p_code: code });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      description: row.description ?? null,
      memberCount: Number(row.member_count ?? 0),
      myStatus: row.my_status ?? null,
    };
  },

  /** Solicita entrada via código (cria filiação pendente). */
  async requestToJoin(code: string, communityLocalId?: string): Promise<CommunityMember> {
    const { data, error } = await supabase.rpc('request_to_join_community', { p_code: code });
    if (error) throw error;
    return mapDbToCommunityMember(data, communityLocalId);
  },

  /** Aprova um pedido pendente (dono/admin). */
  async approveRequest(memberId: string): Promise<void> {
    const { error } = await supabase.rpc('approve_join_request', { p_member_id: memberId });
    if (error) throw error;
  },

  /** Rejeita um pedido pendente (dono/admin). */
  async rejectRequest(memberId: string): Promise<void> {
    const { error } = await supabase.rpc('reject_join_request', { p_member_id: memberId });
    if (error) throw error;
  },

  /** O usuário sai da comunidade (owner não pode sair). */
  async leaveCommunity(communityCloudId: string): Promise<void> {
    const { error } = await supabase.rpc('leave_community', {
      target_community_id: communityCloudId,
    });
    if (error) throw error;
  },
};
