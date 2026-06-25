import { communityCloudService } from './communityCloudService';
import { playerCloudService } from './playerCloudService';
import { communityPlayerCloudService, CommunityPlayerDb } from './communityPlayerCloudService';
import { communityRulesCloudService } from './communityRulesCloudService';
import { whatsappTemplateCloudService } from './whatsappTemplateCloudService';
import { operationalCloudService, OperationalSyncPayload } from './operationalCloudService';
import { playerEvaluationCloudService } from './playerEvaluationCloudService';
import { playerLinkProposalCloudService } from './playerLinkProposalCloudService';
import { applyEvaluationAggregate } from '../../logic/playerEvaluations';
import {
  CloudSyncStatus,
  Community,
  CommunityPresence,
  CommunityRules,
  Game,
  GameReport,
  Player,
  PlayerLinkProposal,
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
  linkProposals?: PlayerLinkProposal[];
}

export interface SyncOptions {
  /**
   * Reporta uma falha por item SEM abortar a operação inteira. O item que
   * falhou é mantido como `pending` para uma próxima tentativa.
   */
  onIssue?: (context: string, error: unknown) => void;
}

interface UploadOptions extends SyncOptions {
  /**
   * Só reconcilia (deleta) relações community_players órfãs quando o payload
   * representa o estado MESCLADO (syncNow). Num upload puro o estado local pode
   * estar incompleto e a deleção apagaria vínculos válidos da nuvem.
   */
  reconcileRelations?: boolean;
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

  const norm = (s: string | undefined) => s?.trim().toLowerCase() || '';

  for (const localEntity of localEntities) {
    const localCloudId = localEntity.cloudId;
    const localId = options.getId(localEntity);
    const normLocalCloudId = norm(localCloudId);
    const normLocalId = norm(localId);

    const cloudEntity = cloudEntities.find(
      (cloud) =>
        (!!normLocalCloudId && norm(cloud.cloudId) === normLocalCloudId) ||
        norm(options.getId(cloud)) === normLocalId,
    );

    if (cloudEntity) {
      processedCloudKeys.add(norm(cloudEntity.cloudId || options.getId(cloudEntity)));

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
      if (localEntity.deletedAt) {
        merged.push({
          ...localEntity,
          syncStatus: 'pending',
        });
      } else {
        merged.push(localEntity);
      }
    } else {
      merged.push({
        ...localEntity,
        syncStatus: 'pending',
      });
    }
  }

  for (const cloudEntity of cloudEntities) {
    const cloudKey = cloudEntity.cloudId || options.getId(cloudEntity);
    if (!processedCloudKeys.has(norm(cloudKey))) {
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

function makeCloudIdLookup<T extends { id: string; cloudId?: string }>(items: T[]) {
  return new Map(items.map((item) => [item.id.toLowerCase(), item.cloudId || item.id]));
}

function resolveCloudId(
  localOrCloudId: string | null | undefined,
  lookup: Map<string, string>,
): string | null | undefined {
  if (!localOrCloudId) return localOrCloudId;
  return lookup.get(localOrCloudId.toLowerCase()) || localOrCloudId;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True para um uuid nativo (id de nuvem); false para ids locais/temporários. */
export function isUuid(value: string | null | undefined): boolean {
  return !!value && UUID_RE.test(value);
}

/**
 * Decide quais relações community_players da nuvem são órfãs (devem ser deletadas)
 * na reconciliação. Regra de segurança (C1): só considera relações de players
 * REPRESENTADOS no payload — nunca apaga vínculos de atletas que este device não
 * carregou —, e só apaga as que não estão no conjunto desejado.
 */
export function computeStaleRelationIds(
  ownedRelations: { id?: string; community_id: string; player_id: string }[],
  desiredRelationKeys: Set<string>,
  payloadPlayerCloudIds: Set<string>,
): string[] {
  return ownedRelations
    .filter((relation) => {
      const playerKey = relation.player_id.toLowerCase();
      if (!payloadPlayerCloudIds.has(playerKey)) return false;
      const key = `${relation.community_id.toLowerCase()}:${playerKey}`;
      return !desiredRelationKeys.has(key);
    })
    .map((relation) => relation.id)
    .filter(Boolean) as string[];
}

async function bulkUploadSessionChildren<T extends Syncable>(
  items: T[],
  sessionsById: Map<string, Session>,
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
    const session = sessionsById.get(sessionId?.toLowerCase());
    if (!session) {
      updated.push(item);
      continue;
    }

    itemsToUpsert.push(item);
    const key = (item.id || item.cloudId || 'temp').toLowerCase();
    itemMap.set(key, item);
  }

  try {
    if (itemsToDelete.length > 0) {
      await operationalCloudService.bulkSoftDelete(softDeleteTable, itemsToDelete);
    }

    if (itemsToUpsert.length > 0) {
      const uploadedResults = await bulkUpsertFn(itemsToUpsert);
      for (const result of uploadedResults) {
        const key = (result.id || '').toLowerCase();
        const originalItem = itemMap.get(key);
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
    options: UploadOptions = {},
  ): Promise<LocalSyncPayload> {
    const onIssue = options.onIssue || (() => {});
    const syncedAt = nowIso();

    const updatedCommunities: Community[] = [];
    for (const community of local.communities) {
      try {
        if (community.deletedAt) {
          if (community.cloudId) {
            await communityCloudService.softDelete(community.cloudId);
          }
          updatedCommunities.push(markSynced(community, community.cloudId, syncedAt));
          continue;
        }

        // Comunidade de OUTRO dono (entrei como membro): não reenviar — só o
        // dono/admin pode escrever (RLS), e o estado autoritativo vem do download.
        const isSharedCommunity =
          !!community.cloudId && !!community.cloudOwnerId && community.cloudOwnerId !== ownerId;
        if (isSharedCommunity) {
          updatedCommunities.push(markSynced(community, community.cloudId, syncedAt));
          continue;
        }

        const uploaded = await communityCloudService.upsert(community, ownerId);
        updatedCommunities.push(
          markSynced({ ...community, cloudOwnerId: ownerId }, uploaded.cloudId, syncedAt),
        );
      } catch (error) {
        onIssue(`comunidade "${community.name}"`, error);
        updatedCommunities.push(community);
      }
    }

    const updatedPlayers: Player[] = [];
    for (const player of local.players) {
      try {
        if (player.deletedAt) {
          const canDeleteGlobalPlayer =
            player.cloudId && (!player.cloudOwnerId || player.cloudOwnerId === ownerId);
          if (canDeleteGlobalPlayer) {
            await playerCloudService.softDelete(player.cloudId);
          }
          updatedPlayers.push(markSynced(player, player.cloudId, syncedAt));
          continue;
        }

        const isSharedPlayer =
          !!player.cloudId && !!player.cloudOwnerId && player.cloudOwnerId !== ownerId;

        if (isSharedPlayer) {
          updatedPlayers.push(markSynced(player, player.cloudId, syncedAt));
          continue;
        }

        const uploaded = await playerCloudService.upsert(player, ownerId);
        updatedPlayers.push(markSynced({ ...player, cloudOwnerId: ownerId }, uploaded.cloudId, syncedAt));
      } catch (error) {
        onIssue(`atleta "${player.nome}"`, error);
        updatedPlayers.push(player);
      }
    }

    const communityCloudIds = makeCloudIdLookup(updatedCommunities);
    const playerCloudIds = makeCloudIdLookup(updatedPlayers);

    try {
      await playerEvaluationCloudService.bulkUpsertForPlayers(updatedPlayers, ownerId);
    } catch (error) {
      onIssue('avaliações de atletas', error);
    }

    const updatedRules: CommunityRules[] = [];
    for (const rule of local.rules) {
      try {
        const communityCloudId = resolveCloudId(rule.communityId, communityCloudIds);
        if (!communityCloudId) {
          updatedRules.push(rule);
          continue;
        }

        const uploaded = await communityRulesCloudService.upsert(rule, ownerId, communityCloudId);
        updatedRules.push(markSynced(rule, uploaded.cloudId, syncedAt));
      } catch (error) {
        onIssue('regras de comunidade', error);
        updatedRules.push(rule);
      }
    }

    const updatedTemplates: WhatsAppListTemplate[] = [];
    for (const template of local.templates) {
      try {
        if (template.deletedAt) {
          if (template.cloudId) {
            await whatsappTemplateCloudService.softDelete(template.cloudId);
          }
          updatedTemplates.push(markSynced(template, template.cloudId, syncedAt));
          continue;
        }

        const communityCloudId = resolveCloudId(template.communityId, communityCloudIds);
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
      } catch (error) {
        onIssue(`modelo "${template.title || template.id}"`, error);
        updatedTemplates.push(template);
      }
    }

    const updatedSessions: Session[] = [];
    for (const session of local.sessions) {
      try {
        if (session.deletedAt) {
          if (session.cloudId) {
            await operationalCloudService.softDelete('sessions', session.cloudId);
          }
          updatedSessions.push(markSynced(session, session.cloudId, syncedAt));
          continue;
        }

        const sessionForUpload = {
          ...session,
          communityId: resolveCloudId(session.communityId, communityCloudIds) || null,
        };
        const uploaded = await operationalCloudService.upsertSession(
          sessionForUpload,
          ownerId,
        );
        updatedSessions.push(markSynced(session, uploaded.cloudId, syncedAt));
      } catch (error) {
        onIssue(`sessão "${session.name}"`, error);
        updatedSessions.push(session);
      }
    }

    const sessionsById = new Map(
      updatedSessions.map((session) => [
        session.id.toLowerCase(),
        {
          ...session,
          communityId: resolveCloudId(session.communityId, communityCloudIds) || null,
        },
      ]),
    );

    const updatedTeams = await bulkUploadSessionChildren<Team>(
      local.teams,
      sessionsById,
      'teams',
      (items) =>
        operationalCloudService.bulkUpsertTeams(
          items,
          ownerId,
          sessionsById,
        ),
    );

    const updatedGames = await bulkUploadSessionChildren<Game>(
      local.games,
      sessionsById,
      'games',
      (items) =>
        operationalCloudService.bulkUpsertGames(
          items,
          ownerId,
          sessionsById,
        ),
    );

    const updatedPointEvents = await bulkUploadSessionChildren<PointEvent>(
      local.pointEvents,
      sessionsById,
      'point_events',
      (items) =>
        operationalCloudService.bulkUpsertPointEvents(
          items,
          ownerId,
          sessionsById,
        ),
    );

    const updatedGameReports = await bulkUploadSessionChildren<GameReport>(
      local.gameReports,
      sessionsById,
      'game_reports',
      (items) =>
        operationalCloudService.bulkUpsertGameReports(
          items,
          ownerId,
          sessionsById,
        ),
    );

    const updatedSessionReports = await bulkUploadSessionChildren<SessionReport>(
      local.sessionReports,
      sessionsById,
      'session_reports',
      (items) =>
        operationalCloudService.bulkUpsertSessionReports(
          items,
          ownerId,
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

      const communityCloudId = resolveCloudId(presence.communityId, communityCloudIds);
      if (!communityCloudId) {
        updatedPresenceRecords.push(presence);
        continue;
      }

      presenceToUpsert.push({ ...presence, communityId: communityCloudId });
      presenceMap.set(`${communityCloudId.toLowerCase()}:${presence.date}`, presence);
    }

    try {
      if (presenceToDelete.length > 0) {
        await operationalCloudService.bulkSoftDelete('community_presence', presenceToDelete);
      }
      if (presenceToUpsert.length > 0) {
        const uploadedResults = await operationalCloudService.bulkUpsertPresence(
          presenceToUpsert,
          ownerId,
        );
        for (const result of uploadedResults) {
          const key = `${result.communityId.toLowerCase()}:${result.date}`;
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
          !updatedPresenceRecords.some((u) => u.communityId.toLowerCase() === p.communityId.toLowerCase() && u.date === p.date)
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

      const communityCloudId = resolveCloudId(draft.communityId, communityCloudIds);
      if (!communityCloudId) {
        updatedDrafts.push(draft);
        continue;
      }

      draftsToUpsert.push({ ...draft, communityId: communityCloudId });
      draftsMap.set(draft.id.toLowerCase(), draft);
    }

    try {
      if (draftsToDelete.length > 0) {
        await operationalCloudService.bulkSoftDelete('whatsapp_list_drafts', draftsToDelete);
      }
      if (draftsToUpsert.length > 0) {
        const uploadedResults = await operationalCloudService.bulkUpsertDrafts(
          draftsToUpsert,
          ownerId,
        );
        for (const result of uploadedResults) {
          const original = draftsMap.get(result.id.toLowerCase());
          if (original) {
            updatedDrafts.push(markSynced(original, result.cloudId, syncedAt));
          }
        }
      }
    } catch (error) {
      console.error('Falha no envio em lote para whatsapp_list_drafts', error);
      local.drafts.forEach((d) => {
        if (!updatedDrafts.some((u) => u.id.toLowerCase() === d.id.toLowerCase())) {
          updatedDrafts.push(d);
        }
      });
    }

    const relationsToUpload: Omit<CommunityPlayerDb, 'id'>[] = [];
    for (const player of updatedPlayers) {
      if (player.deletedAt) continue;
      const playerCloudId = resolveCloudId(player.id, playerCloudIds);
      if (!playerCloudId) continue;

      for (const localCommunityId of player.communityIds || []) {
        const communityCloudId = resolveCloudId(localCommunityId, communityCloudIds);
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
      try {
        await communityPlayerCloudService.bulkUpsert(relationsToUpload);
      } catch (error) {
        onIssue('vínculos atleta↔comunidade', error);
      }
    }

    // Reconciliação de vínculos órfãos: só quando o payload representa o estado
    // MESCLADO (syncNow). Num upload puro o estado local pode estar incompleto e
    // a deleção apagaria vínculos válidos da nuvem (perda de dados entre devices).
    if (options.reconcileRelations) {
      try {
        const desiredRelationKeys = new Set(
          relationsToUpload.map((relation) =>
            `${relation.community_id.toLowerCase()}:${relation.player_id.toLowerCase()}`,
          ),
        );
        // Só tratamos como órfãs as relações de players REPRESENTADOS no payload;
        // nunca apagamos vínculos de atletas que este device sequer carregou.
        const payloadPlayerCloudIds = new Set(
          updatedPlayers
            .filter((player) => !player.deletedAt)
            .map((player) => resolveCloudId(player.id, playerCloudIds))
            .filter(Boolean)
            .map((id) => (id as string).toLowerCase()),
        );
        const currentOwnedRelations = (await communityPlayerCloudService.fetchAll()).filter(
          (relation) => relation.owner_id === ownerId,
        );
        const staleRelationIds = computeStaleRelationIds(
          currentOwnedRelations,
          desiredRelationKeys,
          payloadPlayerCloudIds,
        );
        await communityPlayerCloudService.deleteByIdsForUser(ownerId, staleRelationIds);
      } catch (error) {
        onIssue('reconciliação de vínculos', error);
      }
    }

    const updatedProposals: PlayerLinkProposal[] = [];
    for (const proposal of local.linkProposals || []) {
      try {
        const playerCloudId =
          proposal.playerCloudId ||
          resolveCloudId(proposal.playerId, playerCloudIds);
        if (!playerCloudId) {
          updatedProposals.push(proposal);
          continue;
        }
        if (proposal.deletedAt) {
          updatedProposals.push({ ...proposal, syncStatus: 'synced', lastSyncedAt: syncedAt });
          continue;
        }

        if (isUuid(proposal.id)) {
          // Já existe na nuvem: o status é gerido pelos RPCs approve/reject/cancel
          // (chamados pelo hook) e o download traz o estado autoritativo. Não
          // reupsertamos — evita brigar com os triggers e o índice único de
          // proposta pendente.
          updatedProposals.push({
            ...proposal,
            playerCloudId,
            syncStatus: 'synced',
            lastSyncedAt: syncedAt,
          });
        } else {
          // Proposta local que nunca chegou à nuvem (id temporário). Cria via RPC,
          // que aplica a lógica de aprovação correta no servidor. (Antes o id temp
          // era enviado como uuid e quebrava o upsert — erro 22P02, o bug I2.)
          const cloudId = await playerLinkProposalCloudService.propose(playerCloudId);
          updatedProposals.push({
            ...proposal,
            id: cloudId,
            playerCloudId,
            syncStatus: 'synced',
            lastSyncedAt: syncedAt,
          });
        }
      } catch (error) {
        onIssue('proposta de vínculo', error);
        updatedProposals.push(proposal);
      }
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
      linkProposals: visible(updatedProposals),
    };
  },

  async downloadCloudDataToLocal(ownerId?: string): Promise<LocalSyncPayload> {
    const cloudCommunities = await communityCloudService.fetchAll();
    const cloudPlayers = await playerCloudService.fetchAll();

    const [cloudRules, cloudTemplates, cloudRelations, cloudEvaluations, operational, cloudProposals] = await Promise.all([
      communityRulesCloudService.fetchAll(),
      whatsappTemplateCloudService.fetchAll(),
      communityPlayerCloudService.fetchAll(),
      playerEvaluationCloudService.fetchAll(),
      operationalCloudService.fetchAll(),
      playerLinkProposalCloudService.fetchAll(),
    ]);

    const playerMemberships: Record<string, string[]> = {};
    for (const relation of cloudRelations) {
      const localPlayerId = relation.player_id;
      const localCommunityId = relation.community_id;
      if (localPlayerId && localCommunityId && relation.active) {
        const key = localPlayerId.toLowerCase();
        playerMemberships[key] = playerMemberships[key] || [];
        playerMemberships[key].push(localCommunityId);
      }
    }

    const mappedPlayers = cloudPlayers.map((player) => {
      const playerEvaluations = cloudEvaluations.filter((evaluation) => evaluation.playerId?.toLowerCase() === player.id.toLowerCase());
      return applyEvaluationAggregate(
        {
          ...player,
          communityIds: playerMemberships[player.id.toLowerCase()] || [],
        },
        playerEvaluations,
        ownerId,
      );
    });

    return {
      communities: cloudCommunities,
      players: mappedPlayers,
      rules: cloudRules,
      templates: cloudTemplates,
      linkProposals: cloudProposals,
      ...operational,
    };
  },

  async syncNow(
    local: LocalSyncPayload,
    ownerId: string,
    options: SyncOptions = {},
  ): Promise<LocalSyncPayload> {
    const cloud = await this.downloadCloudDataToLocal(ownerId);

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
      linkProposals: mergeEntityLists(local.linkProposals || [], cloud.linkProposals || [], {
        getId: (item) => item.id,
      }),
    };

    return this.uploadLocalDataToCloud(merged, ownerId, {
      ...options,
      reconcileRelations: true,
    });
  },
};
