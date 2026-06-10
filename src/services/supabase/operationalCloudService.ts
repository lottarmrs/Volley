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

function withoutCloudMeta<T extends DbRecord>(entity: T) {
  const { cloudId, syncStatus, lastSyncedAt, deletedAt, updatedAt, ...rest } = entity;
  return rest;
}

export function mapSessionToDb(local: Session, ownerId: string, communityCloudId?: string | null) {
  return {
    id: local.cloudId || undefined,
    owner_id: ownerId,
    community_id: communityCloudId || null,
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

export function mapDbToSession(db: DbRecord, communityLocalId?: string | null): Session {
  return {
    id: db.local_id || db.id,
    communityId: communityLocalId ?? null,
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

export function mapTeamToDb(
  local: Team,
  ownerId: string,
  sessionCloudId: string,
  communityCloudId?: string | null,
) {
  return {
    id: local.cloudId || undefined,
    owner_id: ownerId,
    community_id: communityCloudId || null,
    session_id: sessionCloudId,
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

export function mapDbToTeam(db: DbRecord, sessionLocalId: string): Team {
  return {
    id: db.local_id || db.id,
    sessionId: sessionLocalId,
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

export function mapGameToDb(
  local: Game,
  ownerId: string,
  sessionCloudId: string,
  communityCloudId?: string | null,
) {
  return {
    id: local.cloudId || undefined,
    owner_id: ownerId,
    community_id: communityCloudId || null,
    session_id: sessionCloudId,
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
    metadata: local.metadata || {},
    local_id: local.id,
    deleted_at: local.deletedAt || null,
    updated_at: local.updatedAt || local.finishedAt || local.startedAt || new Date().toISOString(),
  };
}

export function mapDbToGame(db: DbRecord, sessionLocalId: string): Game {
  return {
    id: db.local_id || db.id,
    sessionId: sessionLocalId,
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
    metadata: db.metadata || undefined,
    cloudId: db.id,
    syncStatus: 'synced',
    lastSyncedAt: syncedAt(),
    deletedAt: db.deleted_at || undefined,
    updatedAt: db.updated_at,
  };
}

export function mapPointEventToDb(
  local: PointEvent,
  ownerId: string,
  sessionCloudId: string,
  communityCloudId?: string | null,
) {
  return {
    id: local.cloudId || undefined,
    owner_id: ownerId,
    community_id: communityCloudId || null,
    session_id: sessionCloudId,
    game_id: local.gameId,
    sequence_number: local.sequenceNumber,
    scoring_team_id: local.scoringTeamId,
    conceding_team_id: local.concedingTeamId,
    player_id: local.playerId || null,
    reason: local.reason || 'unknown',
    score_before: local.scoreBefore,
    score_after: local.scoreAfter,
    occurred_at: local.timestamp,
    local_id: local.id,
    deleted_at: local.deletedAt || null,
    updated_at: local.updatedAt || local.timestamp || new Date().toISOString(),
  };
}

export function mapDbToPointEvent(db: DbRecord, sessionLocalId: string): PointEvent {
  return {
    id: db.local_id || db.id,
    sessionId: sessionLocalId,
    gameId: db.game_id,
    sequenceNumber: db.sequence_number,
    scoringTeamId: db.scoring_team_id,
    concedingTeamId: db.conceding_team_id,
    playerId: db.player_id || null,
    reason: db.reason || 'unknown',
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

export function mapGameReportToDb(
  local: GameReport,
  ownerId: string,
  sessionCloudId: string,
  communityCloudId?: string | null,
) {
  return {
    id: local.cloudId || undefined,
    owner_id: ownerId,
    community_id: communityCloudId || null,
    session_id: sessionCloudId,
    game_id: local.gameId,
    sequence_number: local.sequenceNumber,
    generated_at: local.generatedAt,
    report: withoutCloudMeta(local),
    local_id: local.id,
    deleted_at: local.deletedAt || null,
    updated_at: local.updatedAt || local.generatedAt || new Date().toISOString(),
  };
}

export function mapDbToGameReport(db: DbRecord, sessionLocalId: string): GameReport {
  const report = db.report || {};
  return {
    ...report,
    id: db.local_id || report.id || db.id,
    sessionId: sessionLocalId,
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
  sessionCloudId: string,
  communityCloudId?: string | null,
) {
  return {
    id: local.cloudId || undefined,
    owner_id: ownerId,
    community_id: communityCloudId || null,
    session_id: sessionCloudId,
    generated_at: local.generatedAt,
    report: withoutCloudMeta(local),
    local_id: local.id,
    deleted_at: local.deletedAt || null,
    updated_at: local.updatedAt || local.generatedAt || new Date().toISOString(),
  };
}

export function mapDbToSessionReport(db: DbRecord, sessionLocalId: string): SessionReport {
  const report = db.report || {};
  return {
    ...report,
    id: db.local_id || report.id || db.id,
    sessionId: sessionLocalId,
    generatedAt: report.generatedAt || db.generated_at,
    cloudId: db.id,
    syncStatus: 'synced',
    lastSyncedAt: syncedAt(),
    deletedAt: db.deleted_at || undefined,
    updatedAt: db.updated_at,
  };
}

export function mapPresenceToDb(
  local: CommunityPresence,
  ownerId: string,
  communityCloudId: string,
) {
  return {
    id: local.cloudId || undefined,
    owner_id: ownerId,
    community_id: communityCloudId,
    date: local.date,
    items: local.items || [],
    local_id: `${local.communityId}:${local.date}`,
    deleted_at: local.deletedAt || null,
    updated_at: local.updatedAt || new Date().toISOString(),
  };
}

export function mapDbToPresence(db: DbRecord, communityLocalId: string): CommunityPresence {
  return {
    communityId: communityLocalId,
    date: db.date,
    items: arrayOrEmpty(db.items),
    updatedAt: db.updated_at,
    cloudId: db.id,
    syncStatus: 'synced',
    lastSyncedAt: syncedAt(),
    deletedAt: db.deleted_at || undefined,
  };
}

export function mapDraftToDb(local: WhatsAppListDraft, ownerId: string, communityCloudId: string) {
  return {
    id: local.cloudId || undefined,
    owner_id: ownerId,
    community_id: communityCloudId,
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

export function mapDbToDraft(db: DbRecord, communityLocalId: string): WhatsAppListDraft {
  return {
    id: db.local_id || db.id,
    communityId: communityLocalId,
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
  const { data, error } = await supabase.from(table).select('*').is('deleted_at', null);

  if (error) throw error;
  return data || [];
}

async function upsertRow(table: OperationalTable, record: DbRecord): Promise<DbRecord> {
  const { data, error } = await supabase
    .from(table)
    .upsert(record, { onConflict: 'owner_id,local_id' })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export const operationalCloudService = {
  async fetchAll(
    communityCloudToLocalIdMap: Record<string, string>,
  ): Promise<OperationalSyncPayload> {
    const sessionRows = await fetchRows('sessions');
    const sessions = sessionRows.map((row) =>
      mapDbToSession(row, row.community_id ? communityCloudToLocalIdMap[row.community_id] : null),
    );

    const sessionCloudToLocalIdMap: Record<string, string> = {};
    const sessionCommunityCloudIds: Record<string, string | null> = {};
    sessions.forEach((session, index) => {
      const cloudId = session.cloudId;
      if (!cloudId) return;
      sessionCloudToLocalIdMap[cloudId] = session.id;
      sessionCommunityCloudIds[cloudId] = sessionRows[index]?.community_id || null;
    });

    const mapSessionChild = <T>(
      rows: DbRecord[],
      mapper: (row: DbRecord, sessionLocalId: string) => T,
    ) =>
      rows
        .filter((row) => sessionCloudToLocalIdMap[row.session_id])
        .map((row) => mapper(row, sessionCloudToLocalIdMap[row.session_id]));

    const [
      teamRows,
      gameRows,
      pointRows,
      gameReportRows,
      sessionReportRows,
      presenceRows,
      draftRows,
    ] = await Promise.all([
      fetchRows('teams'),
      fetchRows('games'),
      fetchRows('point_events'),
      fetchRows('game_reports'),
      fetchRows('session_reports'),
      fetchRows('community_presence'),
      fetchRows('whatsapp_list_drafts'),
    ]);

    return {
      sessions,
      teams: mapSessionChild(teamRows, mapDbToTeam),
      games: mapSessionChild(gameRows, mapDbToGame),
      pointEvents: mapSessionChild(pointRows, mapDbToPointEvent),
      gameReports: mapSessionChild(gameReportRows, mapDbToGameReport),
      sessionReports: mapSessionChild(sessionReportRows, mapDbToSessionReport),
      presenceRecords: presenceRows
        .filter((row) => communityCloudToLocalIdMap[row.community_id])
        .map((row) => mapDbToPresence(row, communityCloudToLocalIdMap[row.community_id])),
      drafts: draftRows
        .filter((row) => communityCloudToLocalIdMap[row.community_id])
        .map((row) => mapDbToDraft(row, communityCloudToLocalIdMap[row.community_id])),
    };
  },

  async upsertSession(
    local: Session,
    ownerId: string,
    communityCloudId?: string | null,
  ): Promise<Session> {
    const data = await upsertRow('sessions', mapSessionToDb(local, ownerId, communityCloudId));
    return mapDbToSession(data, local.communityId ?? null);
  },

  async upsertTeam(
    local: Team,
    ownerId: string,
    sessionCloudId: string,
    communityCloudId?: string | null,
  ): Promise<Team> {
    const data = await upsertRow(
      'teams',
      mapTeamToDb(local, ownerId, sessionCloudId, communityCloudId),
    );
    return mapDbToTeam(data, local.sessionId);
  },

  async upsertGame(
    local: Game,
    ownerId: string,
    sessionCloudId: string,
    communityCloudId?: string | null,
  ): Promise<Game> {
    const data = await upsertRow(
      'games',
      mapGameToDb(local, ownerId, sessionCloudId, communityCloudId),
    );
    return mapDbToGame(data, local.sessionId);
  },

  async upsertPointEvent(
    local: PointEvent,
    ownerId: string,
    sessionCloudId: string,
    communityCloudId?: string | null,
  ): Promise<PointEvent> {
    const data = await upsertRow(
      'point_events',
      mapPointEventToDb(local, ownerId, sessionCloudId, communityCloudId),
    );
    return mapDbToPointEvent(data, local.sessionId);
  },

  async upsertGameReport(
    local: GameReport,
    ownerId: string,
    sessionCloudId: string,
    communityCloudId?: string | null,
  ): Promise<GameReport> {
    const data = await upsertRow(
      'game_reports',
      mapGameReportToDb(local, ownerId, sessionCloudId, communityCloudId),
    );
    return mapDbToGameReport(data, local.sessionId);
  },

  async upsertSessionReport(
    local: SessionReport,
    ownerId: string,
    sessionCloudId: string,
    communityCloudId?: string | null,
  ): Promise<SessionReport> {
    const data = await upsertRow(
      'session_reports',
      mapSessionReportToDb(local, ownerId, sessionCloudId, communityCloudId),
    );
    return mapDbToSessionReport(data, local.sessionId);
  },

  async upsertPresence(
    local: CommunityPresence,
    ownerId: string,
    communityCloudId: string,
  ): Promise<CommunityPresence> {
    const data = await upsertRow(
      'community_presence',
      mapPresenceToDb(local, ownerId, communityCloudId),
    );
    return mapDbToPresence(data, local.communityId);
  },

  async upsertDraft(
    local: WhatsAppListDraft,
    ownerId: string,
    communityCloudId: string,
  ): Promise<WhatsAppListDraft> {
    const data = await upsertRow(
      'whatsapp_list_drafts',
      mapDraftToDb(local, ownerId, communityCloudId),
    );
    return mapDbToDraft(data, local.communityId);
  },

  async softDelete(table: OperationalTable, cloudId: string): Promise<void> {
    const { error } = await supabase
      .from(table)
      .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', cloudId);

    if (error) throw error;
  },
};
