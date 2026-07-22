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

export interface DuplicateConsolidationSummary {
  communitiesMerged: number;
  playersMerged: number;
  referencesRemapped: number;
}

export interface DuplicateConsolidationResult {
  payload: LocalSyncPayload;
  summary: DuplicateConsolidationSummary;
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
  getSemanticKey?: (entity: T) => string | undefined;
}

const nowIso = () => new Date().toISOString();

function missingUploadResultError(table: string, id: string) {
  return new Error(`Bulk upload for ${table} did not return a result for ${id}`);
}

function reportIssue(onIssue: SyncOptions['onIssue'], context: string, error: unknown) {
  if (onIssue) onIssue(context, error);
}

function normalizeSemanticText(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export function communitySemanticKey(community: Pick<Community, 'name'>): string | undefined {
  const name = normalizeSemanticText(community.name);
  return name ? `community:${name}` : undefined;
}

export function playerSemanticKey(
  player: Pick<Player, 'username' | 'nome' | 'genero' | 'posicaoPrincipal' | 'alturaCm'>,
): string | undefined {
  const username = normalizeSemanticText(player.username);
  if (username) return `player:username:${username}`;

  const name = normalizeSemanticText(player.nome);
  if (!name) return undefined;

  return [
    'player:profile',
    name,
    normalizeSemanticText(player.genero),
    normalizeSemanticText(player.posicaoPrincipal),
    player.alturaCm ?? '',
  ].join(':');
}

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

function getPlayerLinkProposalSyncTimestamp(proposal: PlayerLinkProposal): string | undefined {
  return proposal.reviewedAt || proposal.createdAt;
}

function timestampMs(value: string | undefined) {
  const time = value ? new Date(value).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}

function normalizeIdValue(value: string | null | undefined): string {
  return value?.trim().toLowerCase() || '';
}

function canConsolidateOwnedEntity(
  entity: { cloudOwnerId?: string },
  ownerId: string | undefined,
): boolean {
  return !ownerId || !entity.cloudOwnerId || entity.cloudOwnerId === ownerId;
}

function addIdMapping(
  map: Map<string, string>,
  from: string | null | undefined,
  to: string | null | undefined,
) {
  const sourceKey = normalizeIdValue(from);
  if (!sourceKey || !to || sourceKey === normalizeIdValue(to)) return;
  map.set(sourceKey, to);
}

function remapId<T extends string | null | undefined>(
  value: T,
  map: Map<string, string>,
  summary?: DuplicateConsolidationSummary,
): T {
  const key = normalizeIdValue(value);
  const mapped = key ? map.get(key) : undefined;
  if (!mapped) return value;
  if (summary && mapped !== value) summary.referencesRemapped += 1;
  return mapped as T;
}

function remapIdArray(
  values: string[] | null | undefined,
  map: Map<string, string>,
  summary?: DuplicateConsolidationSummary,
): string[] {
  const unique = new Map<string, string>();
  for (const value of values || []) {
    const mapped = remapId(value, map, summary);
    const key = normalizeIdValue(mapped);
    if (key && !unique.has(key)) {
      unique.set(key, mapped);
    }
  }
  return Array.from(unique.values());
}

function remapRecordKeys<T>(
  record: Record<string, T> | undefined,
  map: Map<string, string>,
  summary?: DuplicateConsolidationSummary,
): Record<string, T> | undefined {
  if (!record) return record;
  const next: Record<string, T> = {};
  for (const [key, value] of Object.entries(record)) {
    next[remapId(key, map, summary)] = value;
  }
  return next;
}

function remapPlayerPairs(
  pairs: [string, string][] | undefined,
  map: Map<string, string>,
  summary?: DuplicateConsolidationSummary,
): [string, string][] | undefined {
  if (!pairs) return pairs;
  const unique = new Map<string, [string, string]>();
  for (const pair of pairs) {
    const first = remapId(pair[0], map, summary);
    const second = remapId(pair[1], map, summary);
    if (!first || !second || normalizeIdValue(first) === normalizeIdValue(second)) continue;
    const key = [first, second].map(normalizeIdValue).sort().join(':');
    if (!unique.has(key)) unique.set(key, [first, second]);
  }
  return Array.from(unique.values());
}

function remapSessionConfig<T extends Session['config']>(
  config: T,
  playerIdMap: Map<string, string>,
  summary: DuplicateConsolidationSummary,
): T {
  if (!config) return config;
  return {
    ...config,
    playerPositions: remapRecordKeys(config.playerPositions, playerIdMap, summary),
    balanceConstraints: config.balanceConstraints
      ? {
          ...config.balanceConstraints,
          lockedPlayerIdxs: remapRecordKeys(
            config.balanceConstraints.lockedPlayerIdxs,
            playerIdMap,
            summary,
          ),
          pairsTogether: remapPlayerPairs(
            config.balanceConstraints.pairsTogether,
            playerIdMap,
            summary,
          ),
          pairsSeparated: remapPlayerPairs(
            config.balanceConstraints.pairsSeparated,
            playerIdMap,
            summary,
          ),
        }
      : config.balanceConstraints,
  } as T;
}

function markDuplicateForMerge<T extends Syncable>(entity: T, deletedAt: string): T {
  return {
    ...entity,
    deletedAt: entity.deletedAt || deletedAt,
    updatedAt: deletedAt,
    syncStatus: 'pending',
  };
}

function isMappedDuplicate(
  entity: { id: string; cloudId?: string },
  map: Map<string, string>,
): boolean {
  return map.has(normalizeIdValue(entity.id)) || map.has(normalizeIdValue(entity.cloudId));
}

function chooseCommunityCanonical(group: Community[]): Community {
  return [...group].sort((a, b) => {
    const timeDelta = timestampMs(getSyncTimestamp(b)) - timestampMs(getSyncTimestamp(a));
    if (timeDelta !== 0) return timeDelta;
    return a.id.localeCompare(b.id);
  })[0];
}

function choosePlayerCanonical(local: LocalSyncPayload, group: Player[]): Player {
  return [...group].sort((a, b) => {
    const linkedDelta = Number(!!b.userId) - Number(!!a.userId);
    if (linkedDelta !== 0) return linkedDelta;

    const avatarDelta = Number(!!b.avatarUrl) - Number(!!a.avatarUrl);
    if (avatarDelta !== 0) return avatarDelta;

    const usernameDelta = Number(!!b.username) - Number(!!a.username);
    if (usernameDelta !== 0) return usernameDelta;

    const activityDelta = playerActivityScore(local, b.id) - playerActivityScore(local, a.id);
    if (activityDelta !== 0) return activityDelta;

    const timeDelta = timestampMs(getSyncTimestamp(b)) - timestampMs(getSyncTimestamp(a));
    if (timeDelta !== 0) return timeDelta;

    return a.id.localeCompare(b.id);
  })[0];
}

function groupActiveDuplicates<T extends Syncable>(
  items: T[],
  getSemanticKey: (item: T) => string | undefined,
  getScope: (item: T) => string,
): T[][] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    if (item.deletedAt) continue;
    const semanticKey = getSemanticKey(item);
    if (!semanticKey) continue;
    const key = `${getScope(item)}:${semanticKey}`;
    const current = groups.get(key) || [];
    current.push(item);
    groups.set(key, current);
  }
  return Array.from(groups.values()).filter((group) => group.length > 1);
}

function hasId(values: unknown, id: string): boolean {
  return Array.isArray(values) && values.includes(id);
}

function countRecordKey(record: unknown, id: string): number {
  return record && typeof record === 'object' && id in record ? 1 : 0;
}

function countPlayerPairs(pairs: unknown, id: string): number {
  if (!Array.isArray(pairs)) return 0;
  return pairs.filter((pair) => Array.isArray(pair) && pair.includes(id)).length;
}

function playerActivityScore(local: LocalSyncPayload, id: string): number {
  let score = 0;

  for (const point of local.pointEvents || []) {
    if (point.playerId === id) score += 20;
    if (point.assistPlayerId === id) score += 8;
  }

  for (const session of local.sessions || []) {
    if (hasId(session.selectedPlayerIds, id)) score += 2;
    score += countRecordKey(session.config?.playerPositions, id);
    score += countRecordKey(session.config?.balanceConstraints?.lockedPlayerIdxs, id);
    score += countPlayerPairs(session.config?.balanceConstraints?.pairsTogether, id);
    score += countPlayerPairs(session.config?.balanceConstraints?.pairsSeparated, id);
  }

  for (const team of local.teams || []) {
    if (hasId(team.playerIds, id)) score += 2;
  }

  for (const presence of local.presenceRecords || []) {
    score += (presence.items || []).filter((item) => item.playerId === id).length;
  }

  for (const draft of local.drafts || []) {
    for (const slot of [
      ...(draft.setters || []),
      ...(draft.mainSlots || []),
      ...(draft.reserveSlots || []),
    ]) {
      if (slot.playerId === id) score += 1;
    }
  }

  for (const report of local.gameReports || []) {
    if (hasId(report.teamA?.playerIds, id)) score += 1;
    if (hasId(report.teamB?.playerIds, id)) score += 1;
    score += (report.playerStats || []).filter((row) => row.playerId === id).length;
  }

  for (const report of local.sessionReports || []) {
    score += (report.playerRanking || []).filter((row) => row.playerId === id).length;
    for (const game of report.games || []) {
      if (hasId(game.teamA?.playerIds, id)) score += 1;
      if (hasId(game.teamB?.playerIds, id)) score += 1;
      score += (game.playerStats || []).filter((row) => row.playerId === id).length;
    }
  }

  return score;
}

function dedupeByLatest<T extends Syncable>(
  items: T[],
  getKey: (item: T) => string | undefined,
): T[] {
  const byKey = new Map<string, T>();
  const passthrough: T[] = [];

  for (const item of items) {
    const key = getKey(item);
    if (!key) {
      passthrough.push(item);
      continue;
    }

    const current = byKey.get(key);
    if (
      !current ||
      (!!current.deletedAt && !item.deletedAt) ||
      timestampMs(getSyncTimestamp(item)) >= timestampMs(getSyncTimestamp(current))
    ) {
      byKey.set(key, item);
    }
  }

  return [...passthrough, ...byKey.values()];
}

function remapGameReportPlayers(
  report: GameReport,
  playerIdMap: Map<string, string>,
  summary: DuplicateConsolidationSummary,
): GameReport {
  return {
    ...report,
    teamA: {
      ...report.teamA,
      playerIds: remapIdArray(report.teamA?.playerIds, playerIdMap, summary),
    },
    teamB: {
      ...report.teamB,
      playerIds: remapIdArray(report.teamB?.playerIds, playerIdMap, summary),
    },
    playerStats: (report.playerStats || []).map((stat) => ({
      ...stat,
      playerId: remapId(stat.playerId, playerIdMap, summary),
    })),
  };
}

function remapDraftSlots(
  slots: WhatsAppListDraft['mainSlots'],
  playerIdMap: Map<string, string>,
  summary: DuplicateConsolidationSummary,
): WhatsAppListDraft['mainSlots'] {
  return (slots || []).map((slot) => ({
    ...slot,
    playerId: remapId(slot.playerId, playerIdMap, summary),
  }));
}

function mergePresenceRecords(records: CommunityPresence[]): CommunityPresence[] {
  const byKey = new Map<string, CommunityPresence>();

  for (const record of records) {
    const key = `${normalizeIdValue(record.communityId)}:${record.date}`;
    const current = byKey.get(key);
    if (!current) {
      byKey.set(key, record);
      continue;
    }

    const items = new Map<string, CommunityPresence['items'][number]>();
    for (const item of current.items || []) {
      const itemKey = item.playerId
        ? `player:${normalizeIdValue(item.playerId)}`
        : `guest:${normalizeSemanticText(item.temporaryName)}`;
      items.set(itemKey, item);
    }
    for (const item of record.items || []) {
      const itemKey = item.playerId
        ? `player:${normalizeIdValue(item.playerId)}`
        : `guest:${normalizeSemanticText(item.temporaryName)}`;
      items.set(itemKey, item);
    }

    byKey.set(key, {
      ...(timestampMs(record.updatedAt) >= timestampMs(current.updatedAt) ? record : current),
      items: Array.from(items.values()),
      updatedAt:
        timestampMs(record.updatedAt) >= timestampMs(current.updatedAt)
          ? record.updatedAt
          : current.updatedAt,
    });
  }

  return Array.from(byKey.values());
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

    let cloudEntity = cloudEntities.find(
      (cloud) =>
        (!!normLocalCloudId && norm(cloud.cloudId) === normLocalCloudId) ||
        norm(options.getId(cloud)) === normLocalId,
    );

    if (!cloudEntity && !localEntity.cloudId && options.getSemanticKey) {
      const localSemanticKey = options.getSemanticKey(localEntity);
      if (localSemanticKey) {
        cloudEntity = cloudEntities.find(
          (cloud) => options.getSemanticKey?.(cloud) === localSemanticKey,
        );
      }
    }

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

function visibleOrPendingDelete<T extends Syncable>(items: T[]) {
  return items.filter((item) => !item.deletedAt || item.syncStatus === 'pending');
}

function makeCloudIdLookup<T extends { id: string; cloudId?: string }>(items: T[]) {
  return new Map(items.map((item) => [item.id.toLowerCase(), item.cloudId || item.id]));
}

function makePlayerCloudOwnerLookup(players: Player[]): Map<string, string> {
  const lookup = new Map<string, string>();

  for (const player of players) {
    if (!player.cloudOwnerId) continue;
    lookup.set(player.id.toLowerCase(), player.cloudOwnerId);
    if (player.cloudId) lookup.set(player.cloudId.toLowerCase(), player.cloudOwnerId);
  }

  return lookup;
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

export function isCloudBackedPlayerLinkProposal(
  proposal: Pick<PlayerLinkProposal, 'id' | 'syncStatus'>,
): boolean {
  return (
    isUuid(proposal.id) && proposal.syncStatus !== 'pending' && proposal.syncStatus !== 'local'
  );
}

function isPendingPlayerLinkIntent(proposal: PlayerLinkProposal): boolean {
  return proposal.syncStatus === 'pending' || proposal.syncStatus === 'local';
}

function markLinkProposalSynced(
  proposal: PlayerLinkProposal,
  playerCloudId: string,
  syncedAt: string,
  id: string = proposal.id,
): PlayerLinkProposal {
  return {
    ...proposal,
    id,
    playerCloudId,
    syncStatus: 'synced',
    lastSyncedAt: syncedAt,
  };
}

function markLinkProposalPending(
  proposal: PlayerLinkProposal,
  playerCloudId: string,
  id: string,
): PlayerLinkProposal {
  return {
    ...proposal,
    id,
    playerCloudId,
    syncStatus: 'pending',
  };
}

function shouldCancelRejectedProposal(proposal: PlayerLinkProposal): boolean {
  return proposal.status === 'rejected' && proposal.reviewedBy === proposal.userId;
}

function shouldSkipOwnerAutoApprovedProposal(
  proposal: PlayerLinkProposal,
  ownerId: string,
  playerCloudOwner: string | undefined,
): boolean {
  return (
    proposal.status === 'approved' && proposal.userId === ownerId && playerCloudOwner === ownerId
  );
}

function repairLegacyPlayerUnlinkIntent(player: Player): Player {
  return player.pendingUserLinkAction === 'unlink'
    ? { ...player, pendingUserLinkAction: undefined }
    : player;
}

class PlayerLinkProposalReplayError extends Error {
  readonly retryProposal: PlayerLinkProposal;
  readonly originalError: unknown;

  constructor(retryProposal: PlayerLinkProposal, originalError: unknown) {
    super(
      originalError instanceof Error
        ? originalError.message
        : 'Failed to replay player link proposal intent',
    );
    this.name = 'PlayerLinkProposalReplayError';
    this.retryProposal = retryProposal;
    this.originalError = originalError;
  }
}

async function syncPlayerLinkProposalIntent(
  proposal: PlayerLinkProposal,
  playerCloudIds: Map<string, string>,
  playerCloudOwners: Map<string, string>,
  ownerId: string,
  syncedAt: string,
): Promise<PlayerLinkProposal> {
  const playerCloudId = proposal.playerCloudId || resolveCloudId(proposal.playerId, playerCloudIds);
  if (!playerCloudId) return proposal;

  if (proposal.deletedAt) {
    return markLinkProposalSynced(proposal, playerCloudId, syncedAt);
  }

  const pendingIntent = isPendingPlayerLinkIntent(proposal);
  const cloudBacked =
    isCloudBackedPlayerLinkProposal(proposal) ||
    (isUuid(proposal.id) && pendingIntent && proposal.status !== 'pending');

  if (proposal.status === 'superseded') {
    return markLinkProposalSynced(proposal, playerCloudId, syncedAt);
  }

  if (cloudBacked && !pendingIntent) {
    return markLinkProposalSynced(proposal, playerCloudId, syncedAt);
  }

  if (!cloudBacked && proposal.userId !== ownerId) {
    throw new Error(
      `Cannot replay local player link proposal "${proposal.id}" for another user without a cloud proposal id`,
    );
  }

  let proposalId = proposal.id;
  const proposedNow = !cloudBacked;
  if (!cloudBacked) {
    proposalId = await playerLinkProposalCloudService.propose(playerCloudId);
  }

  try {
    const playerCloudOwner =
      playerCloudOwners.get(playerCloudId.toLowerCase()) ||
      playerCloudOwners.get(proposal.playerId.toLowerCase());

    if (
      proposal.status === 'approved' &&
      !(proposedNow && shouldSkipOwnerAutoApprovedProposal(proposal, ownerId, playerCloudOwner))
    ) {
      await playerLinkProposalCloudService.approve(proposalId);
    } else if (proposal.status === 'rejected') {
      if (shouldCancelRejectedProposal(proposal)) {
        await playerLinkProposalCloudService.cancel(proposalId);
      } else {
        await playerLinkProposalCloudService.reject(proposalId);
      }
    }
  } catch (error) {
    if (proposedNow) {
      throw new PlayerLinkProposalReplayError(
        markLinkProposalPending(proposal, playerCloudId, proposalId),
        error,
      );
    }
    throw error;
  }

  return markLinkProposalSynced(proposal, playerCloudId, syncedAt, proposalId);
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

export function consolidateDuplicateRecords(
  local: LocalSyncPayload,
  options: { ownerId?: string; deletedAt?: string } = {},
): DuplicateConsolidationResult {
  const deletedAt = options.deletedAt || nowIso();
  const summary: DuplicateConsolidationSummary = {
    communitiesMerged: 0,
    playersMerged: 0,
    referencesRemapped: 0,
  };

  const communityIdMap = new Map<string, string>();
  const duplicateCommunityIdMap = new Map<string, string>();
  const playerIdMap = new Map<string, string>();
  const duplicatePlayerIdMap = new Map<string, string>();
  const playerCloudIdMap = new Map<string, string>();
  const canonicalPlayerCommunityIds = new Map<string, string[]>();

  for (const community of local.communities) {
    if (!community.deletedAt) {
      addIdMapping(communityIdMap, community.cloudId, community.id);
    }
  }

  for (const player of local.players) {
    if (!player.deletedAt) {
      addIdMapping(playerIdMap, player.cloudId, player.id);
    }
  }

  const communityGroups = groupActiveDuplicates<Community>(
    local.communities.filter((community) => canConsolidateOwnedEntity(community, options.ownerId)),
    (community) => communitySemanticKey(community),
    (community) => community.cloudOwnerId || options.ownerId || 'local',
  );

  for (const group of communityGroups) {
    const canonical = chooseCommunityCanonical(group);
    summary.communitiesMerged += group.length - 1;
    for (const duplicate of group) {
      if (duplicate === canonical) continue;
      addIdMapping(communityIdMap, duplicate.id, canonical.id);
      addIdMapping(communityIdMap, duplicate.cloudId, canonical.id);
      addIdMapping(duplicateCommunityIdMap, duplicate.id, canonical.id);
      addIdMapping(duplicateCommunityIdMap, duplicate.cloudId, canonical.id);
    }
  }

  const playerGroups = groupActiveDuplicates<Player>(
    local.players.filter((player) => canConsolidateOwnedEntity(player, options.ownerId)),
    (player) => playerSemanticKey(player),
    (player) => player.cloudOwnerId || options.ownerId || 'local',
  ).filter((group) => {
    const linkedUsers = new Set(group.map((player) => player.userId).filter(Boolean));
    return linkedUsers.size <= 1;
  });

  for (const group of playerGroups) {
    const canonical = choosePlayerCanonical(local, group);
    const communityIds = new Set<string>();
    for (const player of group) {
      for (const communityId of player.communityIds || []) {
        const mappedCommunityId = remapId(communityId, communityIdMap);
        if (mappedCommunityId) communityIds.add(mappedCommunityId);
      }
    }
    canonicalPlayerCommunityIds.set(normalizeIdValue(canonical.id), Array.from(communityIds));
    summary.playersMerged += group.length - 1;

    for (const duplicate of group) {
      if (duplicate === canonical) continue;
      addIdMapping(playerIdMap, duplicate.id, canonical.id);
      addIdMapping(playerIdMap, duplicate.cloudId, canonical.id);
      addIdMapping(duplicatePlayerIdMap, duplicate.id, canonical.id);
      addIdMapping(duplicatePlayerIdMap, duplicate.cloudId, canonical.id);
      addIdMapping(playerCloudIdMap, duplicate.cloudId, canonical.cloudId || canonical.id);
    }
  }

  const communities = local.communities.map((community) => {
    if (isMappedDuplicate(community, duplicateCommunityIdMap)) {
      return markDuplicateForMerge(community, deletedAt);
    }
    return {
      ...community,
      syncStatus:
        communityIdMap.size > 0 && !community.deletedAt ? 'pending' : community.syncStatus,
    };
  });

  const players = local.players.map((player) => {
    if (isMappedDuplicate(player, duplicatePlayerIdMap)) {
      return markDuplicateForMerge(player, deletedAt);
    }

    const mergedCommunityIds =
      canonicalPlayerCommunityIds.get(normalizeIdValue(player.id)) ||
      remapIdArray(player.communityIds, communityIdMap, summary);

    return {
      ...player,
      communityIds: mergedCommunityIds,
      syncStatus:
        (playerIdMap.size > 0 || communityIdMap.size > 0) && !player.deletedAt
          ? 'pending'
          : player.syncStatus,
    };
  });

  const rules = dedupeByLatest(
    local.rules.map((rule) => {
      const communityId = remapId(rule.communityId, communityIdMap, summary);
      return {
        ...rule,
        communityId,
        cloudId: communityId !== rule.communityId ? undefined : rule.cloudId,
        syncStatus: communityId !== rule.communityId ? 'pending' : rule.syncStatus,
      };
    }),
    (rule) => normalizeIdValue(rule.communityId),
  );

  const templates = local.templates.map((template) => ({
    ...template,
    communityId: remapId(template.communityId, communityIdMap, summary),
    syncStatus: communityIdMap.size > 0 && !template.deletedAt ? 'pending' : template.syncStatus,
  }));

  const sessions = local.sessions.map((session) => ({
    ...session,
    communityId: remapId(session.communityId, communityIdMap, summary),
    selectedPlayerIds: remapIdArray(session.selectedPlayerIds, playerIdMap, summary),
    config: remapSessionConfig(session.config, playerIdMap, summary),
    syncStatus:
      (communityIdMap.size > 0 || playerIdMap.size > 0) && !session.deletedAt
        ? 'pending'
        : session.syncStatus,
  }));

  const teams = local.teams.map((team) => ({
    ...team,
    playerIds: remapIdArray(team.playerIds, playerIdMap, summary),
    syncStatus: playerIdMap.size > 0 && !team.deletedAt ? 'pending' : team.syncStatus,
  }));

  const pointEvents = local.pointEvents.map((point) => ({
    ...point,
    playerId: remapId(point.playerId, playerIdMap, summary),
    assistPlayerId: remapId(point.assistPlayerId, playerIdMap, summary),
    syncStatus: playerIdMap.size > 0 && !point.deletedAt ? 'pending' : point.syncStatus,
  }));

  const gameReports = local.gameReports.map((report) => ({
    ...remapGameReportPlayers(report, playerIdMap, summary),
    syncStatus: playerIdMap.size > 0 && !report.deletedAt ? 'pending' : report.syncStatus,
  }));

  const sessionReports = local.sessionReports.map((report) => ({
    ...report,
    playerRanking: (report.playerRanking || []).map((row) => ({
      ...row,
      playerId: remapId(row.playerId, playerIdMap, summary),
    })),
    games: (report.games || []).map((gameReport) =>
      remapGameReportPlayers(gameReport, playerIdMap, summary),
    ),
    syncStatus: playerIdMap.size > 0 && !report.deletedAt ? 'pending' : report.syncStatus,
  }));

  const presenceRecords = mergePresenceRecords(
    local.presenceRecords.map((presence) => ({
      ...presence,
      communityId: remapId(presence.communityId, communityIdMap, summary),
      items: (presence.items || []).map((item) => ({
        ...item,
        playerId: remapId(item.playerId, playerIdMap, summary),
      })),
      syncStatus:
        (communityIdMap.size > 0 || playerIdMap.size > 0) && !presence.deletedAt
          ? 'pending'
          : presence.syncStatus,
    })),
  );

  const drafts = local.drafts.map((draft) => ({
    ...draft,
    communityId: remapId(draft.communityId, communityIdMap, summary),
    setters: remapDraftSlots(draft.setters, playerIdMap, summary),
    mainSlots: remapDraftSlots(draft.mainSlots, playerIdMap, summary),
    reserveSlots: remapDraftSlots(draft.reserveSlots, playerIdMap, summary),
    syncStatus:
      (communityIdMap.size > 0 || playerIdMap.size > 0) && !draft.deletedAt
        ? 'pending'
        : draft.syncStatus,
  }));

  const linkProposals = (local.linkProposals || []).map((proposal) => ({
    ...proposal,
    playerId: remapId(proposal.playerId, playerIdMap, summary),
    playerCloudId: remapId(proposal.playerCloudId, playerCloudIdMap, summary),
    syncStatus:
      playerIdMap.size > 0 && !proposal.deletedAt && !isCloudBackedPlayerLinkProposal(proposal)
        ? 'pending'
        : proposal.syncStatus,
  }));

  return {
    payload: {
      communities,
      players,
      rules,
      templates,
      sessions,
      teams,
      games: local.games,
      pointEvents,
      gameReports,
      sessionReports,
      presenceRecords,
      drafts,
      linkProposals,
    },
    summary,
  };
}

async function bulkUploadSessionChildren<T extends Syncable>(
  items: T[],
  sessionsById: Map<string, Session>,
  softDeleteTable: Parameters<typeof operationalCloudService.bulkSoftDelete>[0],
  bulkUpsertFn: (itemsToUpsert: T[]) => Promise<T[]>,
  options: SyncOptions = {},
): Promise<T[]> {
  const syncedAt = nowIso();
  const updated: T[] = [];

  const itemsToDelete: string[] = [];
  const itemsToUpsert: T[] = [];
  const itemMap = new Map<string, T>();
  const uploadedItemKeys = new Set<string>();

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
          uploadedItemKeys.add(key);
          updated.push(markSynced(originalItem, result.cloudId, syncedAt));
        }
      }
      for (const item of itemsToUpsert) {
        const itemId = item.id || item.cloudId || 'sem-id';
        const key = itemId.toLowerCase();
        if (!uploadedItemKeys.has(key)) {
          reportIssue(
            options.onIssue,
            `upload ${softDeleteTable} "${itemId}"`,
            missingUploadResultError(softDeleteTable, itemId),
          );
          updated.push(item);
        }
      }
    }
  } catch (error) {
    console.error(`Falha no envio em lote para a tabela ${softDeleteTable}`, error);
    reportIssue(options.onIssue, `upload ${softDeleteTable}`, error);
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
    local = consolidateDuplicateRecords(local, { ownerId }).payload;

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
      const playerForUpload = repairLegacyPlayerUnlinkIntent(player);
      try {
        if (playerForUpload.deletedAt) {
          const canDeleteGlobalPlayer =
            playerForUpload.cloudId &&
            (!playerForUpload.cloudOwnerId || playerForUpload.cloudOwnerId === ownerId);
          if (canDeleteGlobalPlayer) {
            await playerCloudService.softDelete(playerForUpload.cloudId!);
          }
          updatedPlayers.push(
            markSynced(playerForUpload, playerForUpload.cloudId, syncedAt),
          );
          continue;
        }

        const isSharedPlayer =
          !!playerForUpload.cloudId &&
          !!playerForUpload.cloudOwnerId &&
          playerForUpload.cloudOwnerId !== ownerId;

        if (isSharedPlayer) {
          updatedPlayers.push(markSynced(playerForUpload, playerForUpload.cloudId, syncedAt));
          continue;
        }

        const uploaded = await playerCloudService.upsert(playerForUpload, ownerId);
        updatedPlayers.push(
          markSynced({ ...playerForUpload, cloudOwnerId: ownerId }, uploaded.cloudId, syncedAt),
        );
      } catch (error) {
        onIssue(`atleta "${player.nome}"`, error);
        updatedPlayers.push(playerForUpload);
      }
    }

    const communityCloudIds = makeCloudIdLookup(updatedCommunities);
    const playerCloudIds = makeCloudIdLookup(updatedPlayers);
    const playerCloudOwners = makePlayerCloudOwnerLookup(updatedPlayers);

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
        const uploaded = await operationalCloudService.upsertSession(sessionForUpload, ownerId);
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
      (items) => operationalCloudService.bulkUpsertTeams(items, ownerId, sessionsById),
      options,
    );

    const updatedGames = await bulkUploadSessionChildren<Game>(
      local.games,
      sessionsById,
      'games',
      (items) => operationalCloudService.bulkUpsertGames(items, ownerId, sessionsById),
      options,
    );

    const updatedPointEvents = await bulkUploadSessionChildren<PointEvent>(
      local.pointEvents,
      sessionsById,
      'point_events',
      (items) => operationalCloudService.bulkUpsertPointEvents(items, ownerId, sessionsById),
      options,
    );

    const updatedGameReports = await bulkUploadSessionChildren<GameReport>(
      local.gameReports,
      sessionsById,
      'game_reports',
      (items) => operationalCloudService.bulkUpsertGameReports(items, ownerId, sessionsById),
      options,
    );

    const updatedSessionReports = await bulkUploadSessionChildren<SessionReport>(
      local.sessionReports,
      sessionsById,
      'session_reports',
      (items) => operationalCloudService.bulkUpsertSessionReports(items, ownerId, sessionsById),
      options,
    );

    const updatedPresenceRecords: CommunityPresence[] = [];
    const presenceToDelete: CommunityPresence[] = [];
    const presenceToUpsert: CommunityPresence[] = [];
    const presenceMap = new Map<string, CommunityPresence>();
    const uploadedPresenceKeys = new Set<string>();

    for (const presence of local.presenceRecords) {
      if (presence.deletedAt) {
        if (presence.cloudId) {
          presenceToDelete.push(presence);
        } else {
          updatedPresenceRecords.push(markSynced(presence, presence.cloudId, syncedAt));
        }
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
        await operationalCloudService.bulkSoftDelete(
          'community_presence',
          presenceToDelete.map((presence) => presence.cloudId!),
        );
        presenceToDelete.forEach((presence) => {
          updatedPresenceRecords.push(markSynced(presence, presence.cloudId, syncedAt));
        });
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
            uploadedPresenceKeys.add(key);
            updatedPresenceRecords.push(markSynced(original, result.cloudId, syncedAt));
          }
        }
        for (const presence of presenceToUpsert) {
          const key = `${presence.communityId.toLowerCase()}:${presence.date}`;
          const original = presenceMap.get(key);
          if (original && !uploadedPresenceKeys.has(key)) {
            reportIssue(
              options.onIssue,
              `upload community_presence "${key}"`,
              missingUploadResultError('community_presence', key),
            );
            updatedPresenceRecords.push(original);
          }
        }
      }
    } catch (error) {
      console.error('Falha no envio em lote para community_presence', error);
      reportIssue(options.onIssue, 'upload community_presence', error);
      local.presenceRecords.forEach((p) => {
        if (
          !updatedPresenceRecords.some(
            (u) => u.communityId.toLowerCase() === p.communityId.toLowerCase() && u.date === p.date,
          )
        ) {
          updatedPresenceRecords.push(p);
        }
      });
    }

    const updatedDrafts: WhatsAppListDraft[] = [];
    const draftsToDelete: WhatsAppListDraft[] = [];
    const draftsToUpsert: WhatsAppListDraft[] = [];
    const draftsMap = new Map<string, WhatsAppListDraft>();
    const uploadedDraftKeys = new Set<string>();

    for (const draft of local.drafts) {
      if (draft.deletedAt) {
        if (draft.cloudId) {
          draftsToDelete.push(draft);
        } else {
          updatedDrafts.push(markSynced(draft, draft.cloudId, syncedAt));
        }
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
        await operationalCloudService.bulkSoftDelete(
          'whatsapp_list_drafts',
          draftsToDelete.map((draft) => draft.cloudId!),
        );
        draftsToDelete.forEach((draft) => {
          updatedDrafts.push(markSynced(draft, draft.cloudId, syncedAt));
        });
      }
      if (draftsToUpsert.length > 0) {
        const uploadedResults = await operationalCloudService.bulkUpsertDrafts(
          draftsToUpsert,
          ownerId,
        );
        for (const result of uploadedResults) {
          const key = result.id.toLowerCase();
          const original = draftsMap.get(key);
          if (original) {
            uploadedDraftKeys.add(key);
            updatedDrafts.push(markSynced(original, result.cloudId, syncedAt));
          }
        }
        for (const draft of draftsToUpsert) {
          const key = draft.id.toLowerCase();
          const original = draftsMap.get(key);
          if (original && !uploadedDraftKeys.has(key)) {
            reportIssue(
              options.onIssue,
              `upload whatsapp_list_drafts "${draft.id}"`,
              missingUploadResultError('whatsapp_list_drafts', draft.id),
            );
            updatedDrafts.push(original);
          }
        }
      }
    } catch (error) {
      console.error('Falha no envio em lote para whatsapp_list_drafts', error);
      reportIssue(options.onIssue, 'upload whatsapp_list_drafts', error);
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

    // Vínculos atleta↔comunidade são ADITIVOS no sync. A deleção automática de
    // vínculos "órfãos" foi DESATIVADA: ela apagava vínculos válidos quando um
    // device tinha estado local desatualizado (players sem communityIds vencendo
    // o merge por timestamp). Remover atleta de comunidade deve ser ação explícita.
    // (computeStaleRelationIds segue exportada/testada para uso futuro deliberado.)
    void options.reconcileRelations;

    const updatedProposals: PlayerLinkProposal[] = [];
    for (const proposal of local.linkProposals || []) {
      try {
        updatedProposals.push(
          await syncPlayerLinkProposalIntent(
            proposal,
            playerCloudIds,
            playerCloudOwners,
            ownerId,
            syncedAt,
          ),
        );
      } catch (error) {
        const replayError = error instanceof PlayerLinkProposalReplayError ? error : null;
        onIssue('proposta de vinculo', replayError?.originalError || error);
        updatedProposals.push(replayError?.retryProposal || proposal);
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
      presenceRecords: visibleOrPendingDelete(updatedPresenceRecords),
      drafts: visibleOrPendingDelete(updatedDrafts),
      linkProposals: visible(updatedProposals),
    };
  },

  async downloadCloudDataToLocal(ownerId?: string): Promise<LocalSyncPayload> {
    const cloudCommunities = await communityCloudService.fetchAll();
    const cloudPlayers = await playerCloudService.fetchAll();

    const [
      cloudRules,
      cloudTemplates,
      cloudRelations,
      cloudEvaluations,
      operational,
      cloudProposals,
    ] = await Promise.all([
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
      const playerEvaluations = cloudEvaluations.filter(
        (evaluation) => evaluation.playerId?.toLowerCase() === player.id.toLowerCase(),
      );
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
    const repairedLocal = consolidateDuplicateRecords(local, { ownerId }).payload;
    const cloud = await this.downloadCloudDataToLocal(ownerId);

    const merged: LocalSyncPayload = {
      communities: mergeEntityLists<Community>(repairedLocal.communities, cloud.communities, {
        getId: (item) => item.id,
        getSemanticKey: (community) => communitySemanticKey(community),
      }),
      players: mergeEntityLists<Player>(repairedLocal.players, cloud.players, {
        getId: (item) => item.id,
        getUpdatedAt: (item) => item.updatedAt || item.metadata?.atualizadoEm,
        getSemanticKey: (player) => playerSemanticKey(player),
      }),
      rules: mergeEntityLists(repairedLocal.rules, cloud.rules, {
        getId: (item) => item.communityId,
      }),
      templates: mergeEntityLists(repairedLocal.templates, cloud.templates, {
        getId: (item) => item.id,
      }),
      sessions: mergeEntityLists(repairedLocal.sessions, cloud.sessions, {
        getId: (item) => item.id,
      }),
      teams: mergeEntityLists(repairedLocal.teams, cloud.teams, { getId: (item) => item.id }),
      games: mergeEntityLists(repairedLocal.games, cloud.games, { getId: (item) => item.id }),
      pointEvents: mergeEntityLists(repairedLocal.pointEvents, cloud.pointEvents, {
        getId: (item) => item.id,
      }),
      gameReports: mergeEntityLists(repairedLocal.gameReports, cloud.gameReports, {
        getId: (item) => item.id,
      }),
      sessionReports: mergeEntityLists(repairedLocal.sessionReports, cloud.sessionReports, {
        getId: (item) => item.id,
      }),
      presenceRecords: mergeEntityLists(repairedLocal.presenceRecords, cloud.presenceRecords, {
        getId: (item) => `${item.communityId}:${item.date}`,
      }),
      drafts: mergeEntityLists(repairedLocal.drafts, cloud.drafts, { getId: (item) => item.id }),
      linkProposals: mergeEntityLists(
        repairedLocal.linkProposals || [],
        cloud.linkProposals || [],
        {
          getId: (item) => item.id,
          getUpdatedAt: getPlayerLinkProposalSyncTimestamp,
        },
      ),
    };

    return this.uploadLocalDataToCloud(merged, ownerId, {
      ...options,
      reconcileRelations: true,
    });
  },

  async repairDuplicateCloudData(
    ownerId: string,
    options: SyncOptions = {},
  ): Promise<LocalSyncPayload> {
    const cloud = await this.downloadCloudDataToLocal(ownerId);
    const { payload, summary } = consolidateDuplicateRecords(cloud, { ownerId });

    if (
      summary.communitiesMerged === 0 &&
      summary.playersMerged === 0 &&
      summary.referencesRemapped === 0
    ) {
      return cloud;
    }

    return this.uploadLocalDataToCloud(payload, ownerId, {
      ...options,
      reconcileRelations: true,
    });
  },
};
