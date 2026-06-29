import { supabase } from '../../lib/supabaseClient';
import {
  CommunityPresence,
  Game,
  GameReport,
  PointEvent,
  Session,
  SessionReport,
  Team,
  WhatsAppListDraft,
} from '../../types';

type DbRecord = Record<string, any>;

export interface OperationalSyncPayload {
  sessions: Session[];
  teams: Team[];
  games: Game[];
  pointEvents: PointEvent[];
  gameReports: GameReport[];
  sessionReports: SessionReport[];
  presenceRecords: CommunityPresence[];
  drafts: WhatsAppListDraft[];
}

type OperationalTable =
  | 'sessions'
  | 'teams'
  | 'games'
  | 'point_events'
  | 'game_reports'
  | 'session_reports'
  | 'community_presence'
  | 'whatsapp_list_drafts';

const syncedAt = () => new Date().toISOString();
const arrayOrEmpty = <T>(value: T[] | null | undefined): T[] => (Array.isArray(value) ? value : []);

function timestampMs(value: unknown): number {
  const time = typeof value === 'string' ? new Date(value).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}

function isCardinalityViolation(error: any): boolean {
  return (
    error?.code === '21000' ||
    error?.message?.includes('ON CONFLICT DO UPDATE command cannot affect row a second time')
  );
}

function withoutCloudMeta<T extends DbRecord>(entity: T) {
  const { cloudId, syncStatus, lastSyncedAt, deletedAt, updatedAt, ...rest } = entity;
  return rest;
}

export function mapSessionToDb(local: Session, ownerId: string) {
  return {
    id: local.id,
    owner_id: ownerId,
    community_id: local.communityId || null,
    name: local.name,
    date: local.date,
    location: local.location || null,
    notes: local.notes || null,
    status: local.status,
    type: local.type || local.config?.type || 'free_play',
    selected_player_ids: local.selectedPlayerIds || [],
    team_ids: local.teamIds || [],
    config: local.config || {},
    local_id: local.id,
    deleted_at: local.deletedAt || null,
    created_at: local.createdAt,
    updated_at: local.updatedAt || new Date().toISOString(),
  };
}

export function mapDbToSession(db: DbRecord): Session {
  return {
    id: db.local_id || db.id,
    communityId: db.community_id || null,
    name: db.name,
    date: db.date,
    location: db.location || null,
    notes: db.notes || null,
    status: db.status,
    type: db.type,
    selectedPlayerIds: arrayOrEmpty<string>(db.selected_player_ids),
    teamIds: arrayOrEmpty<string>(db.team_ids),
    config: db.config || undefined,
    createdAt: db.created_at,
    updatedAt: db.updated_at,
    cloudId: db.id,
    syncStatus: 'synced',
    lastSyncedAt: syncedAt(),
    deletedAt: db.deleted_at || undefined,
  };
}

export function mapTeamToDb(local: Team, ownerId: string, communityId?: string | null) {
  return {
    id: local.id,
    owner_id: ownerId,
    community_id: communityId || null,
    session_id: local.sessionId,
    name: local.name,
    color: local.color || null,
    player_ids: local.playerIds || [],
    generated_by_algorithm: !!local.generatedByAlgorithm,
    locked: !!local.locked,
    strength_snapshot: local.strengthSnapshot || {},
    local_id: local.id,
    deleted_at: local.deletedAt || null,
    updated_at: local.updatedAt || new Date().toISOString(),
  };
}

export function mapDbToTeam(db: DbRecord): Team {
  return {
    id: db.local_id || db.id,
    sessionId: db.session_id,
    name: db.name,
    color: db.color || undefined,
    playerIds: arrayOrEmpty<string>(db.player_ids),
    generatedByAlgorithm: db.generated_by_algorithm,
    locked: db.locked,
    strengthSnapshot: db.strength_snapshot || {},
    cloudId: db.id,
    syncStatus: 'synced',
    lastSyncedAt: syncedAt(),
    deletedAt: db.deleted_at || undefined,
    updatedAt: db.updated_at,
  };
}

export function mapGameToDb(local: Game, ownerId: string, communityId?: string | null) {
  const metadata = {
    ...(local.metadata || {}),
    sets: local.sets || null,
    setTargets: local.setTargets || null,
  };
  return {
    id: local.id,
    owner_id: ownerId,
    community_id: communityId || null,
    session_id: local.sessionId,
    type: local.type,
    sequence_number: local.sequenceNumber,
    round: local.round || null,
    stage: local.stage || null,
    group_id: local.groupId || null,
    team_a_id: local.teamAId,
    team_b_id: local.teamBId,
    score_a: local.scoreA,
    score_b: local.scoreB,
    winner_team_id: local.winnerTeamId || null,
    loser_team_id: local.loserTeamId || null,
    status: local.status,
    started_at: local.startedAt || null,
    finished_at: local.finishedAt || null,
    finish_reason: local.finishReason || null,
    point_ids: local.pointIds || [],
    metadata,
    local_id: local.id,
    deleted_at: local.deletedAt || null,
    updated_at: local.updatedAt || local.finishedAt || local.startedAt || new Date().toISOString(),
  };
}

export function mapDbToGame(db: DbRecord): Game {
  const metadata = db.metadata || {};
  return {
    id: db.local_id || db.id,
    sessionId: db.session_id,
    type: db.type,
    sequenceNumber: db.sequence_number,
    round: db.round ?? undefined,
    stage: db.stage ?? undefined,
    groupId: db.group_id || null,
    teamAId: db.team_a_id,
    teamBId: db.team_b_id,
    scoreA: db.score_a,
    scoreB: db.score_b,
    winnerTeamId: db.winner_team_id || null,
    loserTeamId: db.loser_team_id || null,
    status: db.status,
    startedAt: db.started_at || null,
    finishedAt: db.finished_at || null,
    finishReason: db.finish_reason || null,
    pointIds: arrayOrEmpty<string>(db.point_ids),
    sets: metadata.sets || undefined,
    setTargets: metadata.setTargets || undefined,
    metadata,
    cloudId: db.id,
    syncStatus: 'synced',
    lastSyncedAt: syncedAt(),
    deletedAt: db.deleted_at || undefined,
    updatedAt: db.updated_at,
  };
}

export function mapPointEventToDb(local: PointEvent, ownerId: string, communityId?: string | null) {
  return {
    id: local.id,
    owner_id: ownerId,
    community_id: communityId || null,
    session_id: local.sessionId,
    game_id: local.gameId,
    sequence_number: local.sequenceNumber,
    scoring_team_id: local.scoringTeamId,
    conceding_team_id: local.concedingTeamId,
    player_id: local.playerId || null,
    reason: local.reason || 'unknown',
    point_type: local.pointType || null,
    skill: local.skill || null,
    fault: local.fault || null,
    event_kind: local.eventKind || 'point',
    assist_player_id: local.assistPlayerId || null,
    player_team_id: local.playerTeamId || null,
    score_before: local.scoreBefore,
    score_after: local.scoreAfter,
    occurred_at: local.timestamp,
    local_id: local.id,
    deleted_at: local.deletedAt || null,
    updated_at: local.updatedAt || local.timestamp || new Date().toISOString(),
  };
}

export function mapDbToPointEvent(db: DbRecord): PointEvent {
  return {
    id: db.local_id || db.id,
    sessionId: db.session_id,
    gameId: db.game_id,
    sequenceNumber: db.sequence_number,
    scoringTeamId: db.scoring_team_id,
    concedingTeamId: db.conceding_team_id,
    playerId: db.player_id || null,
    reason: db.reason || 'unknown',
    pointType: db.point_type || undefined,
    skill: db.skill || undefined,
    fault: db.fault || undefined,
    eventKind: db.event_kind || undefined,
    assistPlayerId: db.assist_player_id || undefined,
    playerTeamId: db.player_team_id || undefined,
    scoreBefore: db.score_before || { teamA: 0, teamB: 0 },
    scoreAfter: db.score_after || { teamA: 0, teamB: 0 },
    timestamp: db.occurred_at,
    cloudId: db.id,
    syncStatus: 'synced',
    lastSyncedAt: syncedAt(),
    deletedAt: db.deleted_at || undefined,
    updatedAt: db.updated_at,
  };
}

export function mapGameReportToDb(local: GameReport, ownerId: string, communityId?: string | null) {
  return {
    id: local.id,
    owner_id: ownerId,
    community_id: communityId || null,
    session_id: local.sessionId,
    game_id: local.gameId,
    sequence_number: local.sequenceNumber,
    generated_at: local.generatedAt,
    report: withoutCloudMeta(local),
    local_id: local.id,
    deleted_at: local.deletedAt || null,
    updated_at: local.updatedAt || local.generatedAt || new Date().toISOString(),
  };
}

export function mapDbToGameReport(db: DbRecord): GameReport {
  const report = db.report || {};
  return {
    ...report,
    id: db.local_id || db.id,
    sessionId: db.session_id,
    gameId: report.gameId || db.game_id,
    sequenceNumber: report.sequenceNumber ?? db.sequence_number,
    generatedAt: report.generatedAt || db.generated_at,
    cloudId: db.id,
    syncStatus: 'synced',
    lastSyncedAt: syncedAt(),
    deletedAt: db.deleted_at || undefined,
    updatedAt: db.updated_at,
  };
}

export function mapSessionReportToDb(
  local: SessionReport,
  ownerId: string,
  communityId?: string | null,
) {
  return {
    id: local.id,
    owner_id: ownerId,
    community_id: communityId || null,
    session_id: local.sessionId,
    generated_at: local.generatedAt,
    report: withoutCloudMeta(local),
    local_id: local.id,
    deleted_at: local.deletedAt || null,
    updated_at: local.updatedAt || local.generatedAt || new Date().toISOString(),
  };
}

export function mapDbToSessionReport(db: DbRecord): SessionReport {
  const report = db.report || {};
  return {
    ...report,
    id: db.local_id || db.id,
    sessionId: db.session_id,
    generatedAt: report.generatedAt || db.generated_at,
    cloudId: db.id,
    syncStatus: 'synced',
    lastSyncedAt: syncedAt(),
    deletedAt: db.deleted_at || undefined,
    updatedAt: db.updated_at,
  };
}

export function mapPresenceToDb(local: CommunityPresence, ownerId: string) {
  return {
    id: local.cloudId || undefined,
    owner_id: ownerId,
    community_id: local.communityId,
    date: local.date,
    items: local.items || [],
    local_id: `${local.communityId}:${local.date}`,
    deleted_at: local.deletedAt || null,
    updated_at: local.updatedAt || new Date().toISOString(),
  };
}

export function mapDbToPresence(db: DbRecord): CommunityPresence {
  return {
    communityId: db.community_id,
    date: db.date,
    items: arrayOrEmpty(db.items),
    updatedAt: db.updated_at,
    cloudId: db.id,
    syncStatus: 'synced',
    lastSyncedAt: syncedAt(),
    deletedAt: db.deleted_at || undefined,
  };
}

export function mapDraftToDb(local: WhatsAppListDraft, ownerId: string) {
  return {
    id: local.id,
    owner_id: ownerId,
    community_id: local.communityId,
    template_id: local.templateId || null,
    title: local.title,
    date: local.date,
    location: local.location || null,
    start_time: local.startTime || null,
    end_time: local.endTime || null,
    value: local.value ?? null,
    pix_key: local.pixKey || null,
    pix_holder: local.pixHolder || null,
    pix_bank: local.pixBank || null,
    payment_deadline: local.paymentDeadline || null,
    payment_note: local.paymentNote || null,
    setters: local.setters || [],
    main_slots: local.mainSlots || [],
    reserve_slots: local.reserveSlots || [],
    setters_section_title: local.settersSectionTitle,
    reserve_section_title: local.reserveSectionTitle,
    show_lock_icon: !!local.showLockIcon,
    payment_symbol: local.paymentSymbol,
    extra_text: local.extraText || null,
    local_id: local.id,
    deleted_at: local.deletedAt || null,
    created_at: local.createdAt,
    updated_at: local.updatedAt || new Date().toISOString(),
  };
}

export function mapDbToDraft(db: DbRecord): WhatsAppListDraft {
  return {
    id: db.local_id || db.id,
    communityId: db.community_id,
    templateId: db.template_id || undefined,
    title: db.title,
    date: db.date,
    location: db.location || undefined,
    startTime: db.start_time || undefined,
    endTime: db.end_time || undefined,
    value: db.value !== null && db.value !== undefined ? Number(db.value) : undefined,
    pixKey: db.pix_key || undefined,
    pixHolder: db.pix_holder || undefined,
    pixBank: db.pix_bank || undefined,
    paymentDeadline: db.payment_deadline || undefined,
    paymentNote: db.payment_note || undefined,
    setters: arrayOrEmpty(db.setters),
    mainSlots: arrayOrEmpty(db.main_slots),
    reserveSlots: arrayOrEmpty(db.reserve_slots),
    settersSectionTitle: db.setters_section_title,
    reserveSectionTitle: db.reserve_section_title,
    showLockIcon: db.show_lock_icon,
    paymentSymbol: db.payment_symbol,
    extraText: db.extra_text || undefined,
    createdAt: db.created_at,
    updatedAt: db.updated_at,
    cloudId: db.id,
    syncStatus: 'synced',
    lastSyncedAt: syncedAt(),
    deletedAt: db.deleted_at || undefined,
  };
}

async function fetchRows(table: OperationalTable): Promise<DbRecord[]> {
  const pageSize = 1000;
  let allData: DbRecord[] = [];
  let from = 0;
  let to = pageSize - 1;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .range(from, to);

    if (error) throw error;
    if (data && data.length > 0) {
      allData = allData.concat(data);
      if (data.length < pageSize) {
        hasMore = false;
      } else {
        from += pageSize;
        to += pageSize;
      }
    } else {
      hasMore = false;
    }
  }
  return allData;
}

async function upsertRow(table: OperationalTable, record: DbRecord): Promise<DbRecord> {
  try {
    const { data, error } = await supabase
      .from(table)
      .upsert(record, { onConflict: 'owner_id,local_id' })
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error: any) {
    if (
      error &&
      (error.code === '23505' || error.statusCode === '23505') &&
      error.message?.includes('_pkey')
    ) {
      // PK collision: the row exists with this id but has a different local_id
      // (pre-migration value). Update it in place to align local_id.
      console.warn(`Primary key collision in table ${table}. Updating existing row by PK.`);
      const updateRecord = { ...record };
      delete updateRecord.id;

      const { data: fallbackData, error: fallbackError } = await supabase
        .from(table)
        .update(updateRecord)
        .eq('id', record.id)
        .select()
        .single();

      if (fallbackError) throw fallbackError;
      return fallbackData;
    }
    throw error;
  }
}

async function bulkUpsertRows(table: OperationalTable, records: DbRecord[]): Promise<DbRecord[]> {
  if (!records || records.length === 0) return [];

  const byOwnerAndLocalId = new Map<string, DbRecord>();
  for (const r of records) {
    const ownerId = String(r.owner_id || '').trim().toLowerCase();
    const localId = String(r.local_id || '').trim().toLowerCase();
    if (!ownerId || !localId) continue;
    const key = `${ownerId}:${localId}`;
    const existing = byOwnerAndLocalId.get(key);
    if (!existing || timestampMs(r.updated_at) >= timestampMs(existing.updated_at)) {
      byOwnerAndLocalId.set(key, r);
    }
  }
  const deduplicated = Array.from(byOwnerAndLocalId.values());
  if (deduplicated.length === 0) return [];

  try {
    const { data, error } = await supabase
      .from(table)
      .upsert(deduplicated, { onConflict: 'owner_id,local_id' })
      .select();

    if (error) throw error;
    return data || [];
  } catch (error: any) {
    if (isCardinalityViolation(error)) {
      console.warn(`[Bulk] Duplicate conflict keys in ${table}. Falling back to individual upserts.`);
      const results: DbRecord[] = [];
      const fallbackErrors: unknown[] = [];

      for (const record of deduplicated) {
        try {
          const row = await upsertRow(table, record);
          results.push(row);
        } catch (individualError) {
          fallbackErrors.push(individualError);
        }
      }

      if (fallbackErrors.length > 0) {
        throw new AggregateError(fallbackErrors,
          `[Bulk] ${fallbackErrors.length} individual upserts failed in ${table}`,
          { cause: error },
        );
      }

      return results;
    }

    if (
      error &&
      (error.code === '23505' || error.statusCode === '23505') &&
      error.message?.includes('_pkey')
    ) {
      // PK collision in bulk: some rows exist with these ids but have different
      // local_id values (pre-migration). Fall back to individual upserts so
      // each row gets an UPDATE-by-PK if needed.
      console.warn(`[Bulk] PK collision in ${table}. Falling back to individual upserts.`);
      const results: DbRecord[] = [];
      const fallbackErrors: unknown[] = [];

      for (const record of deduplicated) {
        try {
          const row = await upsertRow(table, record);
          results.push(row);
        } catch (individualError) {
          fallbackErrors.push(individualError);
        }
      }

      if (fallbackErrors.length > 0) {
        throw new AggregateError(fallbackErrors,
          `[Bulk] ${fallbackErrors.length} individual upserts failed in ${table}`,
          { cause: error },
        );
      }

      return results;
    }
    throw error;
  }
}

export const operationalCloudService = {
  async fetchAll(): Promise<OperationalSyncPayload> {
    const [
      sessionRows,
      teamRows,
      gameRows,
      pointRows,
      gameReportRows,
      sessionReportRows,
      presenceRows,
      draftRows,
    ] = await Promise.all([
      fetchRows('sessions'),
      fetchRows('teams'),
      fetchRows('games'),
      fetchRows('point_events'),
      fetchRows('game_reports'),
      fetchRows('session_reports'),
      fetchRows('community_presence'),
      fetchRows('whatsapp_list_drafts'),
    ]);

    return {
      sessions: sessionRows.map(mapDbToSession),
      teams: teamRows.map(mapDbToTeam),
      games: gameRows.map(mapDbToGame),
      pointEvents: pointRows.map(mapDbToPointEvent),
      gameReports: gameReportRows.map(mapDbToGameReport),
      sessionReports: sessionReportRows.map(mapDbToSessionReport),
      presenceRecords: presenceRows.map(mapDbToPresence),
      drafts: draftRows.map(mapDbToDraft),
    };
  },

  async upsertSession(local: Session, ownerId: string): Promise<Session> {
    const data = await upsertRow('sessions', mapSessionToDb(local, ownerId));
    return mapDbToSession(data);
  },

  async upsertTeam(
    local: Team,
    ownerId: string,
    communityId?: string | null,
  ): Promise<Team> {
    const data = await upsertRow(
      'teams',
      mapTeamToDb(local, ownerId, communityId),
    );
    return mapDbToTeam(data);
  },

  async upsertGame(
    local: Game,
    ownerId: string,
    communityId?: string | null,
  ): Promise<Game> {
    const data = await upsertRow(
      'games',
      mapGameToDb(local, ownerId, communityId),
    );
    return mapDbToGame(data);
  },

  async upsertPointEvent(
    local: PointEvent,
    ownerId: string,
    communityId?: string | null,
  ): Promise<PointEvent> {
    const data = await upsertRow(
      'point_events',
      mapPointEventToDb(local, ownerId, communityId),
    );
    return mapDbToPointEvent(data);
  },

  async upsertGameReport(
    local: GameReport,
    ownerId: string,
    communityId?: string | null,
  ): Promise<GameReport> {
    const data = await upsertRow(
      'game_reports',
      mapGameReportToDb(local, ownerId, communityId),
    );
    return mapDbToGameReport(data);
  },

  async upsertSessionReport(
    local: SessionReport,
    ownerId: string,
    communityId?: string | null,
  ): Promise<SessionReport> {
    const data = await upsertRow(
      'session_reports',
      mapSessionReportToDb(local, ownerId, communityId),
    );
    return mapDbToSessionReport(data);
  },

  async upsertPresence(
    local: CommunityPresence,
    ownerId: string,
  ): Promise<CommunityPresence> {
    const data = await upsertRow(
      'community_presence',
      mapPresenceToDb(local, ownerId),
    );
    return mapDbToPresence(data);
  },

  async upsertDraft(
    local: WhatsAppListDraft,
    ownerId: string,
  ): Promise<WhatsAppListDraft> {
    const data = await upsertRow(
      'whatsapp_list_drafts',
      mapDraftToDb(local, ownerId),
    );
    return mapDbToDraft(data);
  },

  async softDelete(table: OperationalTable, cloudId: string): Promise<void> {
    const { error } = await supabase
      .from(table)
      .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', cloudId);

    if (error) throw error;
  },

  async bulkSoftDelete(table: OperationalTable, cloudIds: string[]): Promise<void> {
    if (cloudIds.length === 0) return;
    const { error } = await supabase
      .from(table)
      .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .in('id', cloudIds);

    if (error) throw error;
  },

  async bulkUpsertTeams(
    locals: Team[],
    ownerId: string,
    sessionsById: Map<string, Session>,
  ): Promise<Team[]> {
    if (locals.length === 0) return [];
    const records = locals.map((local) => {
      const session = sessionsById.get(local.sessionId?.toLowerCase());
      return mapTeamToDb(local, ownerId, session?.communityId || null);
    });
    const data = await bulkUpsertRows('teams', records);
    return data.map(mapDbToTeam);
  },

  async bulkUpsertGames(
    locals: Game[],
    ownerId: string,
    sessionsById: Map<string, Session>,
  ): Promise<Game[]> {
    if (locals.length === 0) return [];
    const records = locals.map((local) => {
      const session = sessionsById.get(local.sessionId?.toLowerCase());
      return mapGameToDb(local, ownerId, session?.communityId || null);
    });
    const data = await bulkUpsertRows('games', records);
    return data.map(mapDbToGame);
  },

  async bulkUpsertPointEvents(
    locals: PointEvent[],
    ownerId: string,
    sessionsById: Map<string, Session>,
  ): Promise<PointEvent[]> {
    if (locals.length === 0) return [];
    const records = locals.map((local) => {
      const session = sessionsById.get(local.sessionId?.toLowerCase());
      return mapPointEventToDb(local, ownerId, session?.communityId || null);
    });
    const data = await bulkUpsertRows('point_events', records);
    return data.map(mapDbToPointEvent);
  },

  async bulkUpsertGameReports(
    locals: GameReport[],
    ownerId: string,
    sessionsById: Map<string, Session>,
  ): Promise<GameReport[]> {
    if (locals.length === 0) return [];
    const records = locals.map((local) => {
      const session = sessionsById.get(local.sessionId?.toLowerCase());
      return mapGameReportToDb(local, ownerId, session?.communityId || null);
    });
    const data = await bulkUpsertRows('game_reports', records);
    return data.map(mapDbToGameReport);
  },

  async bulkUpsertSessionReports(
    locals: SessionReport[],
    ownerId: string,
    sessionsById: Map<string, Session>,
  ): Promise<SessionReport[]> {
    if (locals.length === 0) return [];
    const records = locals.map((local) => {
      const session = sessionsById.get(local.sessionId?.toLowerCase());
      return mapSessionReportToDb(local, ownerId, session?.communityId || null);
    });
    const data = await bulkUpsertRows('session_reports', records);
    return data.map(mapDbToSessionReport);
  },

  async bulkUpsertPresence(
    locals: CommunityPresence[],
    ownerId: string,
  ): Promise<CommunityPresence[]> {
    if (locals.length === 0) return [];
    const records = locals.map((local) => mapPresenceToDb(local, ownerId));
    const data = await bulkUpsertRows('community_presence', records);
    return data.map(mapDbToPresence);
  },

  async bulkUpsertDrafts(
    locals: WhatsAppListDraft[],
    ownerId: string,
  ): Promise<WhatsAppListDraft[]> {
    if (locals.length === 0) return [];
    const records = locals.map((local) => mapDraftToDb(local, ownerId));
    const data = await bulkUpsertRows('whatsapp_list_drafts', records);
    return data.map(mapDbToDraft);
  },

  async executeBulkUpsert(table: OperationalTable, payloads: DbRecord[]): Promise<DbRecord[]> {
    return await bulkUpsertRows(table, payloads);
  },
};
