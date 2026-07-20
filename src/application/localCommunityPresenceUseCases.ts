import type { CommunityPresence } from '../types';

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
