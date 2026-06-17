import { communityCloudService } from './communityCloudService';
import { playerCloudService } from './playerCloudService';
import { communityPlayerCloudService, CommunityPlayerDb } from './communityPlayerCloudService';
import { communityRulesCloudService } from './communityRulesCloudService';
import { whatsappTemplateCloudService } from './whatsappTemplateCloudService';
import { operationalCloudService, OperationalSyncPayload } from './operationalCloudService';
import {
  CloudSyncStatus,
  Community,
  CommunityPresence,
  CommunityRules,
  Game,
  GameReport,
  Player,
  PointEvent,
  Session,
  SessionReport,
  Team,
  WhatsAppListDraft,
  WhatsAppListTemplate,
} from '../../types';

export interface LocalSyncPayload extends OperationalSyncPayload {
  communities: Community[];
  players: Player[];
  rules: CommunityRules[];
  templates: WhatsAppListTemplate[];
}

type Syncable = {
  cloudId?: string;
  syncStatus?: CloudSyncStatus;
  lastSyncedAt?: string;
  deletedAt?: string;
  [key: string]: any;
};

interface MergeOptions<T> {
  getId: (entity: T) => string;
  getUpdatedAt?: (entity: T) => string | undefined;
}

const nowIso = () => new Date().toISOString();

export function getSyncTimestamp(entity: any): string | undefined {
  return (
    entity?.updatedAt ||
    entity?.metadata?.atualizadoEm ||
    entity?.generatedAt ||
    entity?.timestamp ||
    entity?.createdAt ||
    entity?.date
  );
}

function timestampMs(value: string | undefined) {
  const time = value ? new Date(value).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}

function preserveLocalIdentity<T extends Syncable>(cloudEntity: T, localEntity: T): T {
  const merged = { ...cloudEntity } as any;
  for (const key of ['id', 'communityId', 'sessionId']) {
    if (localEntity[key] !== undefined && merged[key] !== undefined) {
      merged[key] = localEntity[key];
    }
  }
  return merged;
}

export function mergeEntityLists<T extends Syncable>(
  localEntities: T[],
  cloudEntities: T[],
  options: MergeOptions<T>,
): T[] {
  const getUpdatedAt = options.getUpdatedAt || getSyncTimestamp;
  const processedCloudKeys = new Set<string>();
  const merged: T[] = [];

  for (const localEntity of localEntities) {
    const localCloudId = localEntity.cloudId;
    const localId = options.getId(localEntity);
    const cloudEntity = cloudEntities.find(
      (cloud) =>
        (!!localCloudId && cloud.cloudId === localCloudId) || options.getId(cloud) === localId,
    );

    if (cloudEntity) {
      processedCloudKeys.add(cloudEntity.cloudId || options.getId(cloudEntity));

      if (localEntity.deletedAt || cloudEntity.deletedAt) {
        merged.push({
          ...localEntity,
          cloudId: cloudEntity.cloudId || localEntity.cloudId,
          deletedAt: localEntity.deletedAt || cloudEntity.deletedAt,
          syncStatus: 'pending',
        });
        continue;
      }

      const localTime = timestampMs(getUpdatedAt(localEntity));
      const cloudTime = timestampMs(getUpdatedAt(cloudEntity));

      if (localTime >= cloudTime) {
        merged.push({
          ...localEntity,
          cloudId: cloudEntity.cloudId || localEntity.cloudId,
          syncStatus: 'pending',
        });
      } else {
        merged.push({
          ...preserveLocalIdentity(cloudEntity, localEntity),
          syncStatus: 'synced',
        });
      }
      continue;
    }

    if (localEntity.cloudId) {
      merged.push({
        ...localEntity,
        deletedAt: localEntity.deletedAt || nowIso(),
        syncStatus: 'synced',
      });
    } else {
      merged.push({
        ...localEntity,
        syncStatus: 'pending',
      });
    }
  }

  for (const cloudEntity of cloudEntities) {
    const cloudKey = cloudEntity.cloudId || options.getId(cloudEntity);
    if (!processedCloudKeys.has(cloudKey)) {
      merged.push(cloudEntity);
    }
  }

  return merged;
}

function markSynced<T extends Syncable>(
  local: T,
  cloudId: string | undefined,
  lastSyncedAt: string,
): T {
  return {
    ...local,
    cloudId: cloudId || local.cloudId,
    syncStatus: 'synced',
    lastSyncedAt,
  };
}

function visible<T extends Syncable>(items: T[]) {
  return items.filter((item) => !item.deletedAt);
}

function createCommunityCloudIdResolver(
  local: LocalSyncPayload,
  uploadedMap: Record<string, string>,
) {
  return (communityLocalId?: string | null) => {
    if (!communityLocalId) return null;
    return (
      uploadedMap[communityLocalId] ||
      local.communities.find((community) => community.id === communityLocalId)?.cloudId ||
      null
    );
  };
}

function getSessionCommunityCloudId(
  session: Session | undefined,
  resolveCommunityCloudId: (communityLocalId?: string | null) => string | null,
) {
  return session?.communityId ? resolveCommunityCloudId(session.communityId) : null;
}

async function bulkUploadSessionChildren<T extends Syncable>(
  items: T[],
  sessionsById: Map<string, Session>,
  sessionCloudIds: Record<string, string>,
  resolveCommunityCloudId: (communityLocalId?: string | null) => string | null,
  softDeleteTable: Parameters<typeof operationalCloudService.bulkSoftDelete>[0],
  bulkUpsertFn: (itemsToUpsert: T[]) => Promise<T[]>,
): Promise<T[]> {
  const syncedAt = nowIso();
  const updated: T[] = [];

  const itemsToDelete: string[] = [];
  const itemsToUpsert: T[] = [];
  const itemMap = new Map<string, T>();

  for (const item of items) {
    if (item.deletedAt) {
      if (item.cloudId) itemsToDelete.push(item.cloudId);
      updated.push(markSynced(item, item.cloudId, syncedAt));
      continue;
    }

    const sessionId = item.sessionId;
    const session = sessionsById.get(sessionId);
    const sessionCloudId = sessionCloudIds[sessionId] || session?.cloudId;
    if (!sessionCloudId) {
      updated.push(item);
      continue;
    }

    itemsToUpsert.push(item);
    itemMap.set(item.id || item.cloudId || 'temp', item);
  }

  try {
    if (itemsToDelete.length > 0) {
      await operationalCloudService.bulkSoftDelete(softDeleteTable, itemsToDelete);
    }

    if (itemsToUpsert.length > 0) {
      const uploadedResults = await bulkUpsertFn(itemsToUpsert);
      for (const result of uploadedResults) {
        const originalItem = itemMap.get(result.id);
        if (originalItem) {
          updated.push(markSynced(originalItem, result.cloudId, syncedAt));
        }
      }
    }
  } catch (error) {
    console.error(`Falha no envio em lote para a tabela ${softDeleteTable}`, error);
    return items;
  }

  return visible(updated);
}

export const syncService = {
  async uploadLocalDataToCloud(
    local: LocalSyncPayload,
    ownerId: string,
  ): Promise<LocalSyncPayload> {
    const syncedAt = nowIso();

    const updatedCommunities: Community[] = [];
    const communityLocalToCloudIdMap: Record<string, string> = {};

    for (const community of local.communities) {
      if (community.deletedAt) {
        if (community.cloudId) {
          await communityCloudService.softDelete(community.cloudId);
        }
        updatedCommunities.push(markSynced(community, community.cloudId, syncedAt));
        continue;
      }

      const uploaded = await communityCloudService.upsert(community, ownerId);
      if (uploaded.cloudId) {
        communityLocalToCloudIdMap[community.id] = uploaded.cloudId;
      }
      updatedCommunities.push(markSynced(community, uploaded.cloudId, syncedAt));
    }

    const resolveCommunityCloudId = createCommunityCloudIdResolver(
      local,
      communityLocalToCloudIdMap,
    );

    const updatedPlayers: Player[] = [];
    const playerLocalToCloudIdMap: Record<string, string> = {};

    for (const player of local.players) {
      if (player.deletedAt) {
        if (player.cloudId) {
          await playerCloudService.softDelete(player.cloudId);
        }
        updatedPlayers.push(markSynced(player, player.cloudId, syncedAt));
        continue;
      }

      const uploaded = await playerCloudService.upsert(player, ownerId);
      if (uploaded.cloudId) {
        playerLocalToCloudIdMap[player.id] = uploaded.cloudId;
      }
      updatedPlayers.push(markSynced(player, uploaded.cloudId, syncedAt));
    }

    const updatedRules: CommunityRules[] = [];
    for (const rule of local.rules) {
      const communityCloudId = resolveCommunityCloudId(rule.communityId);
      if (!communityCloudId) {
        updatedRules.push(rule);
        continue;
      }

      const uploaded = await communityRulesCloudService.upsert(rule, ownerId, communityCloudId);
      updatedRules.push(markSynced(rule, uploaded.cloudId, syncedAt));
    }

    const updatedTemplates: WhatsAppListTemplate[] = [];
    for (const template of local.templates) {
      if (template.deletedAt) {
        if (template.cloudId) {
          await whatsappTemplateCloudService.softDelete(template.cloudId);
        }
        updatedTemplates.push(markSynced(template, template.cloudId, syncedAt));
        continue;
      }

      const communityCloudId = resolveCommunityCloudId(template.communityId);
      if (!communityCloudId) {
        updatedTemplates.push(template);
        continue;
      }

      const uploaded = await whatsappTemplateCloudService.upsert(
        template,
        ownerId,
        communityCloudId,
      );
      updatedTemplates.push(markSynced(template, uploaded.cloudId, syncedAt));
    }

    const updatedSessions: Session[] = [];
    const sessionLocalToCloudIdMap: Record<string, string> = {};
    for (const session of local.sessions) {
      if (session.deletedAt) {
        if (session.cloudId) {
          await operationalCloudService.softDelete('sessions', session.cloudId);
        }
        updatedSessions.push(markSynced(session, session.cloudId, syncedAt));
        continue;
      }

      const uploaded = await operationalCloudService.upsertSession(
        session,
        ownerId,
        resolveCommunityCloudId(session.communityId),
      );
      if (uploaded.cloudId) {
        sessionLocalToCloudIdMap[session.id] = uploaded.cloudId;
      }
      updatedSessions.push(markSynced(session, uploaded.cloudId, syncedAt));
    }

    const sessionsById = new Map(updatedSessions.map((session) => [session.id, session]));

    const updatedTeams = await bulkUploadSessionChildren<Team>(
      local.teams,
      sessionsById,
      sessionLocalToCloudIdMap,
      resolveCommunityCloudId,
      'teams',
      (items) =>
        operationalCloudService.bulkUpsertTeams(
          items,
          ownerId,
          sessionLocalToCloudIdMap,
          resolveCommunityCloudId,
          sessionsById,
        ),
    );

    const updatedGames = await bulkUploadSessionChildren<Game>(
      local.games,
      sessionsById,
      sessionLocalToCloudIdMap,
      resolveCommunityCloudId,
      'games',
      (items) =>
        operationalCloudService.bulkUpsertGames(
          items,
          ownerId,
          sessionLocalToCloudIdMap,
          resolveCommunityCloudId,
          sessionsById,
        ),
    );

    const updatedPointEvents = await bulkUploadSessionChildren<PointEvent>(
      local.pointEvents,
      sessionsById,
      sessionLocalToCloudIdMap,
      resolveCommunityCloudId,
      'point_events',
      (items) =>
        operationalCloudService.bulkUpsertPointEvents(
          items,
          ownerId,
          sessionLocalToCloudIdMap,
          resolveCommunityCloudId,
          sessionsById,
        ),
    );

    const updatedGameReports = await bulkUploadSessionChildren<GameReport>(
      local.gameReports,
      sessionsById,
      sessionLocalToCloudIdMap,
      resolveCommunityCloudId,
      'game_reports',
      (items) =>
        operationalCloudService.bulkUpsertGameReports(
          items,
          ownerId,
          sessionLocalToCloudIdMap,
          resolveCommunityCloudId,
          sessionsById,
        ),
    );

    const updatedSessionReports = await bulkUploadSessionChildren<SessionReport>(
      local.sessionReports,
      sessionsById,
      sessionLocalToCloudIdMap,
      resolveCommunityCloudId,
      'session_reports',
      (items) =>
        operationalCloudService.bulkUpsertSessionReports(
          items,
          ownerId,
          sessionLocalToCloudIdMap,
          resolveCommunityCloudId,
          sessionsById,
        ),
    );

    const updatedPresenceRecords: CommunityPresence[] = [];
    const presenceToDelete: string[] = [];
    const presenceToUpsert: CommunityPresence[] = [];
    const presenceMap = new Map<string, CommunityPresence>();

    for (const presence of local.presenceRecords) {
      if (presence.deletedAt) {
        if (presence.cloudId) presenceToDelete.push(presence.cloudId);
        updatedPresenceRecords.push(markSynced(presence, presence.cloudId, syncedAt));
        continue;
      }

      const communityCloudId = resolveCommunityCloudId(presence.communityId);
      if (!communityCloudId) {
        updatedPresenceRecords.push(presence);
        continue;
      }

      presenceToUpsert.push(presence);
      presenceMap.set(`${presence.communityId}:${presence.date}`, presence);
    }

    try {
      if (presenceToDelete.length > 0) {
        await operationalCloudService.bulkSoftDelete('community_presence', presenceToDelete);
      }
      if (presenceToUpsert.length > 0) {
        const uploadedResults = await operationalCloudService.bulkUpsertPresence(
          presenceToUpsert,
          ownerId,
          resolveCommunityCloudId,
        );
        for (const result of uploadedResults) {
          const key = `${result.communityId}:${result.date}`;
          const original = presenceMap.get(key);
          if (original) {
            updatedPresenceRecords.push(markSynced(original, result.cloudId, syncedAt));
          }
        }
      }
    } catch (error) {
      console.error('Falha no envio em lote para community_presence', error);
      local.presenceRecords.forEach((p) => {
        if (
          !updatedPresenceRecords.some((u) => u.communityId === p.communityId && u.date === p.date)
        ) {
          updatedPresenceRecords.push(p);
        }
      });
    }

    const updatedDrafts: WhatsAppListDraft[] = [];
    const draftsToDelete: string[] = [];
    const draftsToUpsert: WhatsAppListDraft[] = [];
    const draftsMap = new Map<string, WhatsAppListDraft>();

    for (const draft of local.drafts) {
      if (draft.deletedAt) {
        if (draft.cloudId) draftsToDelete.push(draft.cloudId);
        updatedDrafts.push(markSynced(draft, draft.cloudId, syncedAt));
        continue;
      }

      const communityCloudId = resolveCommunityCloudId(draft.communityId);
      if (!communityCloudId) {
        updatedDrafts.push(draft);
        continue;
      }

      draftsToUpsert.push(draft);
      draftsMap.set(draft.id, draft);
    }

    try {
      if (draftsToDelete.length > 0) {
        await operationalCloudService.bulkSoftDelete('whatsapp_list_drafts', draftsToDelete);
      }
      if (draftsToUpsert.length > 0) {
        const uploadedResults = await operationalCloudService.bulkUpsertDrafts(
          draftsToUpsert,
          ownerId,
          resolveCommunityCloudId,
        );
        for (const result of uploadedResults) {
          const original = draftsMap.get(result.id);
          if (original) {
            updatedDrafts.push(markSynced(original, result.cloudId, syncedAt));
          }
        }
      }
    } catch (error) {
      console.error('Falha no envio em lote para whatsapp_list_drafts', error);
      local.drafts.forEach((d) => {
        if (!updatedDrafts.some((u) => u.id === d.id)) {
          updatedDrafts.push(d);
        }
      });
    }

    const relationsToUpload: Omit<CommunityPlayerDb, 'id'>[] = [];
    for (const player of local.players) {
      if (player.deletedAt) continue;
      const playerCloudId = playerLocalToCloudIdMap[player.id] || player.cloudId;
      if (!playerCloudId) continue;

      for (const localCommunityId of player.communityIds || []) {
        const communityCloudId = resolveCommunityCloudId(localCommunityId);
        if (!communityCloudId) continue;

        relationsToUpload.push({
          owner_id: ownerId,
          community_id: communityCloudId,
          player_id: playerCloudId,
          active: true,
        });
      }
    }

    if (relationsToUpload.length > 0) {
      await communityPlayerCloudService.clearAllForUser(ownerId);
      await communityPlayerCloudService.bulkUpsert(relationsToUpload);
    }

    return {
      communities: visible(updatedCommunities),
      players: visible(updatedPlayers),
      rules: visible(updatedRules),
      templates: visible(updatedTemplates),
      sessions: visible(updatedSessions),
      teams: updatedTeams,
      games: updatedGames,
      pointEvents: updatedPointEvents,
      gameReports: updatedGameReports,
      sessionReports: updatedSessionReports,
      presenceRecords: visible(updatedPresenceRecords),
      drafts: visible(updatedDrafts),
    };
  },

  async downloadCloudDataToLocal(): Promise<LocalSyncPayload> {
    const cloudCommunities = await communityCloudService.fetchAll();
    const cloudPlayers = await playerCloudService.fetchAll();

    const communityCloudToLocalIdMap: Record<string, string> = {};
    cloudCommunities.forEach((community) => {
      if (community.cloudId) {
        communityCloudToLocalIdMap[community.cloudId] = community.id;
      }
    });

    const playerCloudToLocalIdMap: Record<string, string> = {};
    cloudPlayers.forEach((player) => {
      if (player.cloudId) {
        playerCloudToLocalIdMap[player.cloudId] = player.id;
      }
    });

    const [cloudRules, cloudTemplates, cloudRelations, operational] = await Promise.all([
      communityRulesCloudService.fetchAll(communityCloudToLocalIdMap),
      whatsappTemplateCloudService.fetchAll(communityCloudToLocalIdMap),
      communityPlayerCloudService.fetchAll(),
      operationalCloudService.fetchAll(communityCloudToLocalIdMap),
    ]);

    const playerMemberships: Record<string, string[]> = {};
    for (const relation of cloudRelations) {
      const localPlayerId = playerCloudToLocalIdMap[relation.player_id];
      const localCommunityId = communityCloudToLocalIdMap[relation.community_id];
      if (localPlayerId && localCommunityId && relation.active) {
        playerMemberships[localPlayerId] = playerMemberships[localPlayerId] || [];
        playerMemberships[localPlayerId].push(localCommunityId);
      }
    }

    const mappedPlayers = cloudPlayers.map((player) => ({
      ...player,
      communityIds: playerMemberships[player.id] || [],
    }));

    return {
      communities: cloudCommunities,
      players: mappedPlayers,
      rules: cloudRules,
      templates: cloudTemplates,
      ...operational,
    };
  },

  async syncNow(local: LocalSyncPayload, ownerId: string): Promise<LocalSyncPayload> {
    const cloud = await this.downloadCloudDataToLocal();

    const merged: LocalSyncPayload = {
      communities: mergeEntityLists(local.communities, cloud.communities, {
        getId: (item) => item.id,
      }),
      players: mergeEntityLists(local.players, cloud.players, {
        getId: (item) => item.id,
        getUpdatedAt: (item) => item.updatedAt || item.metadata?.atualizadoEm,
      }),
      rules: mergeEntityLists(local.rules, cloud.rules, { getId: (item) => item.communityId }),
      templates: mergeEntityLists(local.templates, cloud.templates, { getId: (item) => item.id }),
      sessions: mergeEntityLists(local.sessions, cloud.sessions, { getId: (item) => item.id }),
      teams: mergeEntityLists(local.teams, cloud.teams, { getId: (item) => item.id }),
      games: mergeEntityLists(local.games, cloud.games, { getId: (item) => item.id }),
      pointEvents: mergeEntityLists(local.pointEvents, cloud.pointEvents, {
        getId: (item) => item.id,
      }),
      gameReports: mergeEntityLists(local.gameReports, cloud.gameReports, {
        getId: (item) => item.id,
      }),
      sessionReports: mergeEntityLists(local.sessionReports, cloud.sessionReports, {
        getId: (item) => item.id,
      }),
      presenceRecords: mergeEntityLists(local.presenceRecords, cloud.presenceRecords, {
        getId: (item) => `${item.communityId}:${item.date}`,
      }),
      drafts: mergeEntityLists(local.drafts, cloud.drafts, { getId: (item) => item.id }),
    };

    return this.uploadLocalDataToCloud(merged, ownerId);
  },
};
