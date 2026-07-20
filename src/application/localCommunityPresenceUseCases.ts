import { addGuestToPresence, setPresenceItemStatus } from '../logic/communityPresence';
import type { CommunityPresence, CommunityPresenceStatus } from '../types';

export function createLocalPresence(input: {
  communityId: string;
  date: string;
  now: string;
}): CommunityPresence {
  return {
    communityId: input.communityId,
    date: input.date,
    items: [],
    updatedAt: input.now,
    syncStatus: 'pending',
  };
}

export function upsertLocalPresence(input: {
  records: CommunityPresence[];
  presence: CommunityPresence;
  now: string;
}): CommunityPresence[] {
  const next: CommunityPresence = {
    ...input.presence,
    updatedAt: input.now,
    syncStatus: 'pending',
  };
  const exists = input.records.some(
    (record) => record.communityId === next.communityId && record.date === next.date,
  );

  if (!exists) return [...input.records, next];

  return input.records.map((record) =>
    record.communityId === next.communityId && record.date === next.date ? next : record,
  );
}

function getLocalPresence(
  records: CommunityPresence[],
  communityId: string,
  date: string,
): CommunityPresence | null {
  return (
    records.find((record) => record.communityId === communityId && record.date === date) ?? null
  );
}

function ensureLocalPresence(input: {
  records: CommunityPresence[];
  communityId: string;
  date: string;
  now: string;
}): CommunityPresence {
  return (
    getLocalPresence(input.records, input.communityId, input.date) ??
    createLocalPresence({
      communityId: input.communityId,
      date: input.date,
      now: input.now,
    })
  );
}

export function applyLocalPresenceStatus(input: {
  records: CommunityPresence[];
  communityId: string;
  playerId: string;
  status: CommunityPresenceStatus;
  date: string;
  now: string;
}): CommunityPresence[] {
  const presence = ensureLocalPresence(input);
  return upsertLocalPresence({
    records: input.records,
    presence: setPresenceItemStatus(presence, input.playerId, input.status),
    now: input.now,
  });
}

export function clearLocalPresence(input: {
  records: CommunityPresence[];
  communityId: string;
  date: string;
  now: string;
}): CommunityPresence[] {
  return upsertLocalPresence({
    records: input.records,
    presence: createLocalPresence(input),
    now: input.now,
  });
}

export function addLocalPresenceGuest(input: {
  records: CommunityPresence[];
  communityId: string;
  temporaryName: string;
  date: string;
  now: string;
}): CommunityPresence[] {
  const presence = ensureLocalPresence(input);
  const next = addGuestToPresence(presence, input.temporaryName);
  if (next === presence) return input.records;

  return upsertLocalPresence({
    records: input.records,
    presence: next,
    now: input.now,
  });
}
