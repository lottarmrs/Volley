import { supabase } from '../../lib/supabaseClient';
import { Player, PlayerEvaluation } from '../../types';

type DbRecord = Record<string, any>;

function timestampMs(value: unknown): number {
  const time = typeof value === 'string' ? new Date(value).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}

export function deduplicatePlayerEvaluationRecords(records: DbRecord[]): DbRecord[] {
  const byOwnerAndPlayer = new Map<string, DbRecord>();

  for (const record of records) {
    const ownerId = String(record.owner_id || '')
      .trim()
      .toLowerCase();
    const playerId = String(record.player_id || '')
      .trim()
      .toLowerCase();
    if (!ownerId || !playerId) continue;

    const key = `${ownerId}:${playerId}`;
    const existing = byOwnerAndPlayer.get(key);
    if (!existing || timestampMs(record.updated_at) >= timestampMs(existing.updated_at)) {
      byOwnerAndPlayer.set(key, record);
    }
  }

  return Array.from(byOwnerAndPlayer.values());
}

export function mapPlayerEvaluationToDb(player: Player, ownerId: string, playerCloudId: string) {
  // NÃO incluir a chave `id`: Object.keys({id: undefined}) ainda contém 'id',
  // e o supabase-js (defaultToNull, sobretudo em upsert em lote) enviaria
  // id=null, sobrescrevendo o default gen_random_uuid() e violando o NOT NULL.
  return {
    owner_id: ownerId,
    player_id: playerCloudId,
    community_id: player.evaluationCommunityId,
    attributes: player.personalAttributes || player.atributos,
    profile: player.perfil || {},
    status: player.status || {},
    local_id: player.id,
    deleted_at: player.deletedAt || null,
    updated_at: player.updatedAt || player.metadata?.atualizadoEm || new Date().toISOString(),
  };
}

export function mapDbToPlayerEvaluation(db: DbRecord): PlayerEvaluation {
  return {
    id: db.local_id || db.id,
    playerId: db.player_id,
    playerCloudId: db.player_id,
    ownerId: db.owner_id,
    communityId: db.community_id,
    attributes: db.attributes || {},
    profile: db.profile || undefined,
    status: db.status || undefined,
    notes: db.notes || undefined,
    cloudId: db.id,
    syncStatus: 'synced',
    lastSyncedAt: new Date().toISOString(),
    deletedAt: db.deleted_at || undefined,
    createdAt: db.created_at,
    updatedAt: db.updated_at,
  };
}

export const playerEvaluationCloudService = {
  async fetchAll(): Promise<PlayerEvaluation[]> {
    const { data, error } = await supabase
      .from('player_evaluations')
      .select(
        'id, owner_id, player_id, community_id, attributes, profile, status, notes, local_id, deleted_at, created_at, updated_at',
      );

    if (error) throw error;
    return (data || []).map(mapDbToPlayerEvaluation);
  },

  async upsertForPlayer(
    player: Player,
    ownerId: string,
    playerCloudId: string,
  ): Promise<PlayerEvaluation> {
    const { data, error } = await supabase
      .from('player_evaluations')
      .upsert(mapPlayerEvaluationToDb(player, ownerId, playerCloudId), {
        onConflict: 'owner_id,player_id',
      })
      .select()
      .single();

    if (error) throw error;
    return mapDbToPlayerEvaluation(data);
  },

  async bulkUpsertForPlayers(players: Player[], ownerId: string): Promise<void> {
    const records = players
      .map((player) => {
        const playerCloudId = player.cloudId || player.id;
        return playerCloudId ? mapPlayerEvaluationToDb(player, ownerId, playerCloudId) : null;
      })
      .filter(Boolean) as DbRecord[];

    if (records.length === 0) return;

    const deduplicated = deduplicatePlayerEvaluationRecords(records);
    if (deduplicated.length === 0) return;

    const { error } = await supabase
      .from('player_evaluations')
      .upsert(deduplicated, { onConflict: 'owner_id,player_id' });

    if (!error) return;

    if (error.code !== '21000') throw error;

    console.warn(
      'Bulk player_evaluations upsert contained duplicate conflict keys. Falling back to individual upserts.',
    );
    for (const record of deduplicated) {
      const { error: individualError } = await supabase
        .from('player_evaluations')
        .upsert(record, { onConflict: 'owner_id,player_id' });
      if (individualError) throw individualError;
    }
  },
};
