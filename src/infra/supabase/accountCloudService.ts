import type { AccountGateway, AccountSnapshot } from '@app/accountUseCases';
import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient';

interface RpcClient {
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): Promise<{
    data: unknown;
    error: { code?: string; message: string } | null;
  }>;
}

export function createAccountCloudService(client: RpcClient): AccountGateway {
  return {
    async ensureReady(username) {
      const { data, error } = await client.rpc('ensure_account_ready', {
        p_username: username ?? null,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row || typeof row !== 'object') throw new Error('Invalid account bootstrap response');
      const value = row as Record<string, unknown>;
      return {
        state: String(value.state) as AccountSnapshot['state'],
        profile: {
          id: String(value.profile_id),
          name: value.profile_name == null ? null : String(value.profile_name),
          email: String(value.profile_email),
          role: String(value.profile_role) as AccountSnapshot['profile']['role'],
          createdAt: String(value.profile_created_at),
          updatedAt: String(value.profile_updated_at),
        },
        playerId: String(value.player_id),
        username: value.username == null ? null : String(value.username),
        requiresAal2: Boolean(value.requires_aal2),
      };
    },
  };
}

export const accountCloudService = isSupabaseConfigured
  ? createAccountCloudService(supabase)
  : createAccountCloudService({
      rpc: async () => {
        throw new Error('Supabase is not configured.');
      },
    });
