import { supabase } from '../../lib/supabaseClient';
import { Player, PlayerEvaluation } from '../../types';

type DbRecord = Record<string, any>;

export function mapPlayerEvaluationToDb(
  player: Player,
  ownerId: string,
  playerCloudId: string,
) {
  // NÃO incluir a chave `id`: Object.keys({id: undefined}) ainda contém 'id',
  // e o supabase-js (defaultToNull, sobretudo em upsert em lote) enviaria
  // id=null, sobrescrevendo o default gen_random_uuid() e violando o NOT NULL.
  return {
    owner_id: ownerId,
    player_id: playerCloudId,
    attributes: player.personalAttributes || player.atributos,
    profile: player.perfil || {},
    status: player.status || {},
    local_id: player.id,
    deleted_at: player.deletedAt || null,
    updated_at: player.updatedAt || player.metadata?.atualizadoEm || new Date().toISOString(),
  };
}

export function mapDbToPlayerEvaluation(
  db: DbRecord,
  playerCloudToLocalIdMap: Record<string, string> = {},
): PlayerEvaluation {
  return {
    id: db.local_id || db.id,
    playerId: playerCloudToLocalIdMap[db.player_id] || db.player_id,
    playerCloudId: db.player_id,
    ownerId: db.owner_id,
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
  async fetchAll(
    playerCloudToLocalIdMap: Record<string, string> = {},
  ): Promise<PlayerEvaluation[]> {
    const { data, error } = await supabase
      .from('player_evaluations')
      .select(
        'id, owner_id, player_id, attributes, profile, status, notes, local_id, deleted_at, created_at, updated_at',
      );

    if (error) throw error;
    return (data || []).map((row) => mapDbToPlayerEvaluation(row, playerCloudToLocalIdMap));
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
    return mapDbToPlayerEvaluation(data, { [playerCloudId]: player.id });
  },

  async bulkUpsertForPlayers(
    players: Player[],
    ownerId: string,
    playerLocalToCloudIdMap: Record<string, string>,
  ): Promise<void> {
    const records = players
      .map((player) => {
        const playerCloudId = playerLocalToCloudIdMap[player.id] || player.cloudId;
        return playerCloudId ? mapPlayerEvaluationToDb(player, ownerId, playerCloudId) : null;
      })
      .filter(Boolean) as DbRecord[];

    if (records.length === 0) return;

    const { error } = await supabase
      .from('player_evaluations')
      .upsert(records, { onConflict: 'owner_id,player_id' });

    if (error) throw error;
  },
};
