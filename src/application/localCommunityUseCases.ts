import type {
  Community,
  CommunityPresence,
  Player,
  Session,
  WhatsAppListDraft,
  WhatsAppListTemplate,
} from '../types';

export type LocalCommunityValidationErrors = Record<string, string>;
export type LocalCommunityUpdateResult =
  | { ok: true; communities: Community[] }
  | { ok: false; errors: LocalCommunityValidationErrors };

function normalizeCommunityName(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function uniqueCommunityName(baseName: string, communities: Community[]): string {
  const base = baseName.trim() || 'Nova comunidade';
  const existingNames = new Set(
    communities
      .filter((community) => !community.deletedAt && !community.archived)
      .map((community) => normalizeCommunityName(community.name)),
  );

  let candidate = base;
  let suffix = 2;
  while (existingNames.has(normalizeCommunityName(candidate))) {
    candidate = `${base} ${suffix}`;
    suffix += 1;
  }
  return candidate;
}

export function validateLocalCommunitySave(input: {
  communities: Community[];
  community: Community;
}): LocalCommunityValidationErrors {
  const errors: LocalCommunityValidationErrors = {};

  if (!input.community.name.trim()) {
    errors.name = 'O nome da comunidade é obrigatório.';
  }

  const duplicate = input.communities.find(
    (community) =>
      community.id !== input.community.id &&
      !community.deletedAt &&
      !community.archived &&
      normalizeCommunityName(community.name) === normalizeCommunityName(input.community.name),
  );
  if (duplicate && !errors.name) {
    errors.name = `Ja existe uma comunidade com esse nome: ${duplicate.name}.`;
  }

  return errors;
}

export function applyLocalCommunityDeletion(input: {
  communities: Community[];
  communityId: string;
  now: string;
}): Community[] {
  const community = input.communities.find((item) => item.id === input.communityId);
  if (!community) return input.communities;

  if (community.cloudId) {
    return input.communities.map((item) =>
      item.id === input.communityId
        ? { ...item, deletedAt: input.now, syncStatus: 'pending' as const }
        : item,
    );
  }

  return input.communities.filter((item) => item.id !== input.communityId);
}

export function applyLocalCommunityUpdate(input: {
  communities: Community[];
  communityId: string;
  patch: Partial<Community>;
  now: string;
}): LocalCommunityUpdateResult {
  const current = input.communities.find((community) => community.id === input.communityId);
  const nextName = input.patch.name ?? current?.name;
  const errors = nextName
    ? validateLocalCommunitySave({
        communities: input.communities,
        community: { ...(current ?? ({ id: input.communityId } as Community)), name: nextName },
      })
    : {};

  if (errors.name) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    communities: input.communities.map((community) =>
      community.id === input.communityId
        ? { ...community, ...input.patch, syncStatus: 'pending' as const, updatedAt: input.now }
        : community,
    ),
  };
}

export function createLocalCommunity(input: {
  communities: Community[];
  input: Partial<Community>;
  id: string;
  now: string;
}): Community {
  return {
    id: input.input.id || input.id,
    name: uniqueCommunityName(input.input.name || 'Nova comunidade', input.communities),
    description: input.input.description || '',
    defaultLocation: input.input.defaultLocation || '',
    defaultDay: input.input.defaultDay || '',
    defaultStartTime: input.input.defaultStartTime || '',
    defaultEndTime: input.input.defaultEndTime || '',
    defaultFormat: input.input.defaultFormat || 'free_play',
    color: input.input.color || 'primary',
    icon: input.input.icon || 'volleyball',
    archived: Boolean(input.input.archived),
    createdAt: input.input.createdAt || input.now,
    updatedAt: input.now,
    syncStatus: 'local',
  };
}

export function duplicateLocalCommunity(input: {
  communities: Community[];
  communityId: string;
  includeAthletes: boolean;
  id: string;
  now: string;
}): { duplicate: Community; includeAthletes: boolean } | null {
  const source = input.communities.find((community) => community.id === input.communityId);
  if (!source) return null;

  const duplicate: Community = {
    ...source,
    id: input.id,
    name: uniqueCommunityName(`${source.name} (copia)`, input.communities),
    archived: false,
    createdAt: input.now,
    updatedAt: input.now,
    cloudId: undefined,
    syncStatus: 'local',
  };

  return { duplicate, includeAthletes: input.includeAthletes };
}

type CommunityScopedRecord = {
  communityId: string;
  cloudId?: string;
  deletedAt?: string;
  syncStatus?: string;
  updatedAt?: string;
};

// Registro que ja existe na nuvem precisa continuar na lista com deletedAt: o upload so
// envia a exclusao do que ainda enxerga, e o download traria de volta o que sumiu daqui.
function deleteCommunityScopedRecords<T extends CommunityScopedRecord>(
  records: T[],
  communityId: string,
  now: string,
): T[] {
  return records.flatMap((record) => {
    if (record.communityId !== communityId) return [record];
    if (!record.cloudId) return [];
    return [
      { ...record, deletedAt: record.deletedAt ?? now, syncStatus: 'pending', updatedAt: now },
    ];
  });
}

export function applyCommunityDeletion(input: {
  communityId: string;
  communities: Community[];
  players: Player[];
  presenceRecords: CommunityPresence[];
  templates: WhatsAppListTemplate[];
  drafts: WhatsAppListDraft[];
  now: string;
}) {
  const { communityId, now } = input;
  return {
    communities: applyLocalCommunityDeletion({ communities: input.communities, communityId, now }),
    players: input.players.map((player) => ({
      ...player,
      communityIds: (player.communityIds ?? []).filter((id) => id !== communityId),
    })),
    presenceRecords: deleteCommunityScopedRecords(input.presenceRecords, communityId, now),
    templates: deleteCommunityScopedRecords(input.templates, communityId, now),
    drafts: deleteCommunityScopedRecords(input.drafts, communityId, now),
  };
}

export function applyCommunityMembershipDuplicate(
  players: Player[],
  input: { sourceCommunityId: string; duplicateCommunityId: string },
): Player[] {
  return players.map((player) => {
    const communityIds = player.communityIds ?? [];
    if (!communityIds.includes(input.sourceCommunityId)) return player;
    return {
      ...player,
      communityIds: Array.from(new Set([...communityIds, input.duplicateCommunityId])),
    };
  });
}

export function applyPlayerCommunityMemberships(
  players: Player[],
  communityId: string,
  memberPlayerIds: string[],
): Player[] {
  const memberIds = new Set(memberPlayerIds);
  return players.map((player) => {
    const currentIds = player.communityIds ?? [];
    const isMember = memberIds.has(player.id);
    const exists = currentIds.includes(communityId);
    if (isMember && !exists) return { ...player, communityIds: [...currentIds, communityId] };
    if (!isMember && exists) {
      return { ...player, communityIds: currentIds.filter((id) => id !== communityId) };
    }
    return player;
  });
}

export function applyCommunityHistoryClear(sessions: Session[], communityId: string): Session[] {
  return sessions.map((session) =>
    session.communityId === communityId ? { ...session, communityId: null } : session,
  );
}

export function applyLinkedCloudPlayer(
  players: Player[],
  player: Player,
  communityId: string,
): Player[] {
  const existingPlayer = players.find((item) => item.id === player.id);
  const updatedPlayer: Player = {
    ...player,
    communityIds: Array.from(
      new Set([
        ...(existingPlayer?.communityIds ?? []),
        ...(player.communityIds ?? []),
        communityId,
      ]),
    ),
    syncStatus: 'synced',
  };
  return players.some((item) => item.id === player.id)
    ? players.map((item) => (item.id === player.id ? updatedPlayer : item))
    : [...players, updatedPlayer];
}
