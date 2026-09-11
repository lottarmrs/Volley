import { supabase } from '../../lib/supabaseClient';
import { Player, PlayerEvaluation } from '../../types';

type DbRecord = Record<string, any>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function normalizeUuid(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return UUID_PATTERN.test(normalized) ? normalized : null;
}

export function isMissingTargetLookup(error: { code?: string } | null): boolean {
  return error?.code === 'PGRST202' || error?.code === '42883';
}

async function resolveTargetCommunityIds(communityIds: string[]): Promise<Set<string>> {
  const distinctIds = Array.from(
    new Set(communityIds.map(normalizeUuid).filter((id): id is string => id !== null)),
  );
  if (distinctIds.length === 0) return new Set();

  const { data, error } = await supabase.rpc('community_evaluation_target_ids', {
    p_community_ids: distinctIds,
  });
  if (error) {
    if (isMissingTargetLookup(error)) return new Set();
    throw error;
  }
  if (!Array.isArray(data)) {
    throw new Error('Resposta inválida ao consultar Comunidades com avaliação versionada.');
  }

  const targets = data.map(normalizeUuid);
  if (targets.some((id) => id === null)) {
    throw new Error('Resposta inválida ao consultar Comunidades com avaliação versionada.');
  }
  return new Set(targets as string[]);
}

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
    const communityId = normalizeUuid(player.evaluationCommunityId);
    if (communityId) {
      const targetIds = await resolveTargetCommunityIds([communityId]);
      if (targetIds.has(communityId)) {
        throw new Error('Avaliações legadas estão desativadas para esta Comunidade.');
      }
    }

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

  /**
   * Devolve os atletas que ficaram de fora por a Comunidade ter migrado para o modelo
   * versionado. Antes isto era um no-op silencioso: a avaliacao feita offline sumia no
   * upload e o download seguinte reescrevia os valores locais com o agregado da nuvem,
   * sem nenhuma mensagem. Quem chama precisa poder contar isso ao usuario.
   */
  async bulkUpsertForPlayers(
    players: Player[],
    ownerId: string,
  ): Promise<{ omittedForTargetCohort: Player[] }> {
    const targetIds = await resolveTargetCommunityIds(
      players.flatMap((player) =>
        player.evaluationCommunityId ? [player.evaluationCommunityId] : [],
      ),
    );
    const isTargetCohort = (player: Player): boolean => {
      const communityId = normalizeUuid(player.evaluationCommunityId);
      return communityId !== null && targetIds.has(communityId);
    };
    const omittedForTargetCohort = players.filter(isTargetCohort);
    const legacyPlayers = players.filter((player) => !isTargetCohort(player));
    const records = legacyPlayers
      .map((player) => {
        const playerCloudId = player.cloudId || player.id;
        return playerCloudId ? mapPlayerEvaluationToDb(player, ownerId, playerCloudId) : null;
      })
      .filter(Boolean) as DbRecord[];

    if (records.length === 0) return { omittedForTargetCohort };

    const deduplicated = deduplicatePlayerEvaluationRecords(records);
    if (deduplicated.length === 0) return { omittedForTargetCohort };

    const { error } = await supabase
      .from('player_evaluations')
      .upsert(deduplicated, { onConflict: 'owner_id,player_id' });

    if (!error) return { omittedForTargetCohort };

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

    return { omittedForTargetCohort };
  },
};
