import { supabase } from '../../lib/supabaseClient';
import { Player } from '../../types';

export function mapPlayerToDb(local: Player, ownerId: string) {
  return {
    id: local.cloudId || undefined,
    owner_id: ownerId,
    // Only send the handle when we have one, so an upload from a device whose
    // local copy still lacks a username never clobbers an existing cloud handle.
    ...(local.username ? { username: local.username } : {}),
    name: local.nome,
    nickname: local.apelido || null,
    gender: local.genero,
    height: local.alturaCm ?? null,
    dominant_hand: local.maoDominante,
    primary_position: local.posicaoPrincipal,
    secondary_positions: local.posicoesSecundarias || [],
    active: !!local.ativo,
    attributes: local.personalAttributes || local.atributos,
    profile: local.perfil,
    forma_atual: local.formaAtual,
    status: local.status,
    local_id: local.id,
    deleted_at: local.deletedAt || null,
    updated_at: local.updatedAt || local.metadata?.atualizadoEm || new Date().toISOString(),
  };
}

export function mapDbToPlayer(db: any): Player {
  return {
    id: db.local_id || db.id,
    username: db.username || undefined,
    // Read-only here. avatar_url is only ever written through the approval RPCs,
    // so it is deliberately NOT added to mapPlayerToDb (keeps the sync upsert from
    // tripping the guard_avatar_url trigger).
    avatarUrl: db.avatar_url || undefined,
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
    cloudOwnerId: db.owner_id,
    userId: db.user_id || undefined,
    syncStatus: 'synced',
    lastSyncedAt: new Date().toISOString(),
    deletedAt: db.deleted_at || undefined,
    updatedAt: db.updated_at,
  };
}

export const playerCloudService = {
  async fetchAll(): Promise<Player[]> {
    const { data, error } = await supabase.from('players').select('*');

    if (error) throw error;
    return (data || []).map(mapDbToPlayer);
  },

  async fetchByCloudId(cloudId: string): Promise<Player | null> {
    const { data, error } = await supabase.from('players').select('*').eq('id', cloudId).single();

    if (error) throw error;
    return data ? mapDbToPlayer(data) : null;
  },

  async fetchLinkedToUser(userId: string): Promise<Player | null> {
    const { data, error } = await supabase
      .from('players')
      .select('*')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    return data ? mapDbToPlayer(data) : null;
  },

  async upsert(local: Player, ownerId: string): Promise<Player> {
    const dbRecord = mapPlayerToDb(local, ownerId);
    if (local.cloudId) {
      const updateRecord = { ...dbRecord };
      delete (updateRecord as any).id;

      try {
        const { data, error } = await supabase
          .from('players')
          .update(updateRecord)
          .eq('id', local.cloudId)
          .select()
          .maybeSingle();

        if (error) throw error;
        if (data) return mapDbToPlayer(data);
      } catch (updateError: any) {
        if (
          updateError &&
          (updateError.code === '23505' || updateError.statusCode === '23505') &&
          updateError.message?.includes('players_username_lower_idx')
        ) {
          const ownerSuffix = ownerId.slice(0, 4);
          const fallbackUsername = local.username ? `${local.username}-${ownerSuffix}` : undefined;
          console.warn(
            `Username collision during cloud-id update for ${local.nome} (${local.username}). Retrying with fallback: ${fallbackUsername}`,
          );
          const retryRecord = { ...updateRecord };
          if (fallbackUsername) {
            retryRecord.username = fallbackUsername;
          } else {
            delete retryRecord.username;
          }
          const { data: retryData, error: retryError } = await supabase
            .from('players')
            .update(retryRecord)
            .eq('id', local.cloudId)
            .select()
            .single();
          if (retryError) throw retryError;
          return mapDbToPlayer(retryData);
        }
        throw updateError;
      }
    }

    try {
      const { data, error } = await supabase
        .from('players')
        .upsert(dbRecord, { onConflict: 'owner_id,local_id' })
        .select()
        .single();

      if (error) throw error;
      return mapDbToPlayer(data);
    } catch (error: any) {
      if (
        error &&
        (error.code === '23505' || error.statusCode === '23505') &&
        error.message?.includes('players_pkey')
      ) {
        // PK collision means the row already exists in the cloud with this id
        // but has a different local_id (pre-migration value). Update it in place.
        console.warn(
          `Primary key collision for player ${local.nome}. Updating existing row by PK.`,
        );
        const updateRecord = { ...dbRecord };
        delete (updateRecord as any).id;

        try {
          const { data: fallbackData, error: fallbackError } = await supabase
            .from('players')
            .update(updateRecord)
            .eq('id', dbRecord.id)
            .select()
            .single();

          if (fallbackError) throw fallbackError;
          return mapDbToPlayer(fallbackData);
        } catch (updateError: any) {
          // The update itself might hit a username collision
          if (
            updateError &&
            (updateError.code === '23505' || updateError.statusCode === '23505') &&
            updateError.message?.includes('players_username_lower_idx')
          ) {
            const ownerSuffix = ownerId.slice(0, 4);
            const fallbackUsername = local.username
              ? `${local.username}-${ownerSuffix}`
              : undefined;
            console.warn(
              `Username collision during PK-update for ${local.nome} (${local.username}). Retrying with fallback: ${fallbackUsername}`,
            );
            const retryRecord = { ...updateRecord };
            if (fallbackUsername) {
              retryRecord.username = fallbackUsername;
            } else {
              delete retryRecord.username;
            }
            const { data: retryData, error: retryError } = await supabase
              .from('players')
              .update(retryRecord)
              .eq('id', dbRecord.id)
              .select()
              .single();
            if (retryError) throw retryError;
            return mapDbToPlayer(retryData);
          }
          throw updateError;
        }
      }
      if (
        error &&
        (error.code === '23505' || error.statusCode === '23505') &&
        error.message?.includes('players_username_lower_idx')
      ) {
        const ownerSuffix = ownerId.slice(0, 4);
        const fallbackUsername = local.username ? `${local.username}-${ownerSuffix}` : undefined;
        console.warn(
          `Username collision for ${local.nome} (${local.username}). Retrying with fallback: ${fallbackUsername}`,
        );

        const fallbackRecord = {
          ...dbRecord,
          ...(fallbackUsername ? { username: fallbackUsername } : {}),
        };
        if (!fallbackUsername) {
          delete (fallbackRecord as any).username;
        }

        try {
          const { data: fallbackData, error: fallbackError } = await supabase
            .from('players')
            .upsert(fallbackRecord, { onConflict: 'owner_id,local_id' })
            .select()
            .single();

          if (fallbackError) throw fallbackError;
          return mapDbToPlayer(fallbackData);
        } catch {
          console.warn(
            `Secondary username collision for ${local.nome}. Retrying with null username.`,
          );
          const finalRecord = { ...dbRecord };
          delete (finalRecord as any).username;

          const { data: finalData, error: finalError } = await supabase
            .from('players')
            .upsert(finalRecord, { onConflict: 'owner_id,local_id' })
            .select()
            .single();

          if (finalError) throw finalError;
          return mapDbToPlayer(finalData);
        }
      }
      throw error;
    }
  },

  async softDelete(cloudId: string): Promise<void> {
    const { error } = await supabase
      .from('players')
      .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', cloudId);

    if (error) throw error;
  },

  /** Look up a global athlete by its unique handle (authenticated-only RPC). */
  async findByUsername(
    username: string,
  ): Promise<{ cloudId: string; username: string; name: string } | null> {
    const { data, error } = await supabase.rpc('find_player_by_username', {
      target_username: username.trim(),
    });

    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return null;
    return { cloudId: row.id, username: row.username, name: row.name };
  },
};
