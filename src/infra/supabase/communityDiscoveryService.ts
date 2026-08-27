import { supabase } from '../../lib/supabaseClient';

export interface PublicCommunityResult {
  id: string;
  name: string;
  description: string | null;
  memberCount: number;
  /** Status da minha filiação nesta comunidade (null = não sou membro). */
  myStatus: string | null;
}

/**
 * Descoberta de comunidades PÚBLICAS (Fase E2). Opt-in: só aparecem comunidades
 * que o dono marcou como 'public'. Entrar continua passando por aprovação
 * (cria filiação 'pending'). Tudo via RPCs SECURITY DEFINER.
 */
export const communityDiscoveryService = {
  /** Dono/admin marca a comunidade como pública ou privada. */
  async setVisibility(communityCloudId: string, visibility: 'private' | 'public'): Promise<void> {
    const { error } = await supabase.rpc('set_community_visibility', {
      target_community_id: communityCloudId,
      p_visibility: visibility,
    });
    if (error) throw error;
  },

  /** Busca comunidades públicas por nome (vazio = lista as públicas). */
  async searchPublic(query: string): Promise<PublicCommunityResult[]> {
    const { data, error } = await supabase.rpc('search_public_communities', { p_query: query });
    if (error) throw error;
    return (data || []).map((r: Record<string, unknown>) => ({
      id: r.id as string,
      name: r.name as string,
      description: (r.description as string) ?? null,
      memberCount: Number(r.member_count ?? 0),
      myStatus: (r.my_status as string) ?? null,
    }));
  },

  /** Pede entrada numa comunidade pública (cria filiação pendente). */
  async requestToJoinPublic(communityCloudId: string): Promise<void> {
    const { error } = await supabase.rpc('request_to_join_public', {
      target_community_id: communityCloudId,
    });
    if (error) throw error;
  },
};
