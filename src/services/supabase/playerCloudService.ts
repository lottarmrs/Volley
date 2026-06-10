import { supabase } from '../../lib/supabaseClient';
import { Player } from '../../types';

export function mapPlayerToDb(local: Player, ownerId: string) {
  return {
    id: local.cloudId || undefined,
    owner_id: ownerId,
    name: local.nome,
    nickname: local.apelido || null,
    gender: local.genero,
    height: local.alturaCm ?? null,
    dominant_hand: local.maoDominante,
    primary_position: local.posicaoPrincipal,
    secondary_positions: local.posicoesSecundarias || [],
    active: !!local.ativo,
    attributes: local.atributos,
    profile: local.perfil,
    forma_atual: local.formaAtual,
    status: local.status,
    local_id: local.id,
    deleted_at: local.deletedAt || null,
    updated_at: local.updatedAt || local.metadata.atualizadoEm || new Date().toISOString(),
  };
}

export function mapDbToPlayer(db: any): Player {
  return {
    id: db.local_id || db.id,
    nome: db.name,
    apelido: db.nickname || '',
    genero: db.gender,
    alturaCm: db.height !== null && db.height !== undefined ? Number(db.height) : undefined,
    maoDominante: db.dominant_hand,
    posicaoPrincipal: db.primary_position,
    posicoesSecundarias: db.secondary_positions || [],
    ativo: db.active,
    atributos: db.attributes,
    perfil: db.profile,
    formaAtual: db.forma_atual,
    status: db.status,
    metadata: {
      criadoEm: db.created_at,
      atualizadoEm: db.updated_at,
    },
    cloudId: db.id,
    syncStatus: 'synced',
    lastSyncedAt: new Date().toISOString(),
    deletedAt: db.deleted_at || undefined,
    updatedAt: db.updated_at,
  };
}

export const playerCloudService = {
  async fetchAll(): Promise<Player[]> {
    const { data, error } = await supabase.from('players').select('*').is('deleted_at', null);

    if (error) throw error;
    return (data || []).map(mapDbToPlayer);
  },

  async upsert(local: Player, ownerId: string): Promise<Player> {
    const dbRecord = mapPlayerToDb(local, ownerId);
    const { data, error } = await supabase.from('players').upsert(dbRecord).select().single();

    if (error) throw error;
    return mapDbToPlayer(data);
  },

  async softDelete(cloudId: string): Promise<void> {
    const { error } = await supabase
      .from('players')
      .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', cloudId);

    if (error) throw error;
  },
};
