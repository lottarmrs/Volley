import type { PlayerIdentityAlias } from '../../application/playerClaim';
import { supabase } from '../../lib/supabaseClient';

type PlayerIdentityAliasQueryClient = {
  from(table: 'player_identity_aliases'): {
    select(columns: string): Promise<{
      data: Array<Record<string, unknown>> | null;
      error: unknown;
    }>;
  };
};

export function mapDbToPlayerIdentityAlias(db: Record<string, unknown>): PlayerIdentityAlias {
  return {
    legacyPlayerId: String(db.legacy_player_id),
    ...(typeof db.legacy_local_id === 'string' ? { legacyLocalId: db.legacy_local_id } : {}),
    canonicalPlayerId: String(db.canonical_player_id),
  };
}

export async function fetchPlayerIdentityAliases(
  client: PlayerIdentityAliasQueryClient = supabase,
): Promise<PlayerIdentityAlias[]> {
  if (!client) return [];

  const { data, error } = await client
    .from('player_identity_aliases')
    .select('legacy_player_id, legacy_local_id, canonical_player_id');

  if (error) throw error;
  return (data || []).map(mapDbToPlayerIdentityAlias);
}

export const playerIdentityAliasCloudService = {
  fetchAll: fetchPlayerIdentityAliases,
};
