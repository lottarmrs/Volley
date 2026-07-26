import { supabase } from '../../lib/supabaseClient';
import type { Championship, ChampionshipRound, ChampionshipTeam } from '../../types';

type DbRecord = Record<string, any>;

export function mapChampionshipToDb(local: Championship, ownerId: string): DbRecord {
  return {
    id: local.cloudId || undefined,
    owner_id: ownerId,
    community_id: local.communityId,
    name: local.name,
    format: local.format,
    classification_points: local.classificationPoints || {},
    recurrence_days_of_week: local.recurrenceRule.daysOfWeek,
    recurrence_time: local.recurrenceRule.time,
    recurrence_start_date: local.recurrenceRule.startDate,
    recurrence_end_date: local.recurrenceRule.endDate || null,
    local_id: local.id,
    deleted_at: local.deletedAt || null,
    created_at: local.createdAt,
    updated_at: local.updatedAt || new Date().toISOString(),
  };
}

export function mapDbToChampionship(db: DbRecord): Championship {
  return {
    id: db.local_id || db.id,
    communityId: db.community_id,
    name: db.name,
    format: db.format,
    classificationPoints: db.classification_points || {},
    recurrenceRule: {
      daysOfWeek: db.recurrence_days_of_week || [],
      time: db.recurrence_time,
      startDate: db.recurrence_start_date,
      endDate: db.recurrence_end_date || null,
    },
    cloudId: db.id,
    syncStatus: 'synced',
    lastSyncedAt: new Date().toISOString(),
    deletedAt: db.deleted_at || undefined,
    createdAt: db.created_at,
    updatedAt: db.updated_at,
  };
}

export function mapChampionshipTeamToDb(
  local: ChampionshipTeam,
  championshipCloudId: string,
): DbRecord {
  return {
    id: local.cloudId || undefined,
    championship_id: championshipCloudId,
    name: local.name,
    player_ids: local.playerIds || [],
    local_id: local.id,
    deleted_at: local.deletedAt || null,
    updated_at: local.updatedAt || new Date().toISOString(),
  };
}

export function mapDbToChampionshipTeam(db: DbRecord): ChampionshipTeam {
  return {
    id: db.local_id || db.id,
    championshipId: db.championship_id,
    name: db.name,
    playerIds: db.player_ids || [],
    cloudId: db.id,
    syncStatus: 'synced',
    lastSyncedAt: new Date().toISOString(),
    deletedAt: db.deleted_at || undefined,
    updatedAt: db.updated_at,
  };
}

export function mapChampionshipRoundToDb(
  local: ChampionshipRound,
  championshipCloudId: string,
  teamACloudId: string,
  teamBCloudId: string,
): DbRecord {
  return {
    id: local.cloudId || undefined,
    championship_id: championshipCloudId,
    round: local.round,
    team_a_id: teamACloudId,
    team_b_id: teamBCloudId,
    scheduled_date: local.scheduledDate,
    skipped: !!local.skipped,
    session_id: local.sessionId || null,
    local_id: local.id,
    deleted_at: local.deletedAt || null,
    updated_at: local.updatedAt || new Date().toISOString(),
  };
}

export function mapDbToChampionshipRound(db: DbRecord): ChampionshipRound {
  return {
    id: db.local_id || db.id,
    championshipId: db.championship_id,
    round: db.round,
    teamAId: db.team_a_id,
    teamBId: db.team_b_id,
    scheduledDate: db.scheduled_date,
    skipped: db.skipped,
    sessionId: db.session_id || undefined,
    cloudId: db.id,
    syncStatus: 'synced',
    lastSyncedAt: new Date().toISOString(),
    deletedAt: db.deleted_at || undefined,
    updatedAt: db.updated_at,
  };
}

export const championshipCloudService = {
  async fetchAll(): Promise<Championship[]> {
    const { data, error } = await supabase.from('championships').select('*');

    if (error) throw error;
    return (data || []).map(mapDbToChampionship);
  },

  async fetchTeams(championshipCloudId: string): Promise<ChampionshipTeam[]> {
    const { data, error } = await supabase
      .from('championship_teams')
      .select('*')
      .eq('championship_id', championshipCloudId);

    if (error) throw error;
    return (data || []).map(mapDbToChampionshipTeam);
  },

  async fetchRounds(championshipCloudId: string): Promise<ChampionshipRound[]> {
    const { data, error } = await supabase
      .from('championship_rounds')
      .select('*')
      .eq('championship_id', championshipCloudId);

    if (error) throw error;
    return (data || []).map(mapDbToChampionshipRound);
  },

  async upsertChampionship(local: Championship, ownerId: string): Promise<Championship> {
    const { data, error } = await supabase
      .from('championships')
      .upsert(mapChampionshipToDb(local, ownerId), { onConflict: 'id' })
      .select()
      .single();

    if (error) throw error;
    return mapDbToChampionship(data);
  },

  async upsertTeam(
    local: ChampionshipTeam,
    championshipCloudId: string,
  ): Promise<ChampionshipTeam> {
    const { data, error } = await supabase
      .from('championship_teams')
      .upsert(mapChampionshipTeamToDb(local, championshipCloudId), { onConflict: 'id' })
      .select()
      .single();

    if (error) throw error;
    return mapDbToChampionshipTeam(data);
  },

  async upsertRound(
    local: ChampionshipRound,
    championshipCloudId: string,
    teamACloudId: string,
    teamBCloudId: string,
  ): Promise<ChampionshipRound> {
    const { data, error } = await supabase
      .from('championship_rounds')
      .upsert(mapChampionshipRoundToDb(local, championshipCloudId, teamACloudId, teamBCloudId), {
        onConflict: 'championship_id,local_id',
      })
      .select()
      .single();

    if (error) throw error;
    return mapDbToChampionshipRound(data);
  },
};
