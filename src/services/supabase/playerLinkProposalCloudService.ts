import { supabase } from '../../lib/supabaseClient';
import { PlayerLinkProposal } from '../../types';

export function mapProposalToDb(local: PlayerLinkProposal) {
  return {
    id: local.id,
    player_id: local.playerId,
    user_id: local.userId,
    status: local.status,
    reviewed_by: local.reviewedBy || null,
    reviewed_at: local.reviewedAt || null,
    created_at: local.createdAt,
  };
}

export function mapDbToProposal(db: any): PlayerLinkProposal {
  return {
    id: db.id,
    playerId: db.player_id,
    userId: db.user_id,
    status: db.status,
    reviewedBy: db.reviewed_by || undefined,
    reviewedAt: db.reviewed_at || undefined,
    createdAt: db.created_at,
    syncStatus: 'synced',
    lastSyncedAt: new Date().toISOString(),
  };
}

export const playerLinkProposalCloudService = {
  async fetchAll(): Promise<PlayerLinkProposal[]> {
    const { data, error } = await supabase.from('player_link_proposals').select('*');
    if (error) throw error;
    return (data || []).map(mapDbToProposal);
  },

  // NOTA: escritas em player_link_proposals são feitas SOMENTE pelos RPCs abaixo
  // (SECURITY DEFINER). Não existe upsert/insert direto: a tabela não tem policy
  // de UPDATE/DELETE de propósito, e um upsert direto quebrava com RLS 42501.

  async propose(playerId: string): Promise<string> {
    const { data, error } = await supabase.rpc('propose_player_link', {
      p_player_id: playerId,
    });
    if (error) throw error;
    return data;
  },

  async approve(proposalId: string): Promise<void> {
    const { error } = await supabase.rpc('approve_player_link', {
      p_proposal_id: proposalId,
    });
    if (error) throw error;
  },

  async reject(proposalId: string): Promise<void> {
    const { error } = await supabase.rpc('reject_player_link', {
      p_proposal_id: proposalId,
    });
    if (error) throw error;
  },

  async cancel(proposalId: string): Promise<void> {
    const { error } = await supabase.rpc('cancel_my_link_proposal', {
      p_proposal_id: proposalId,
    });
    if (error) throw error;
  },

  async unlink(playerId: string): Promise<void> {
    const { error } = await supabase.rpc('unlink_player_user', {
      p_player_id: playerId,
    });
    if (error) throw error;
  },
};
