import { STORAGE_KEYS, removeFromStorage } from '@storage/localStorageRepository';

const ONLINE_KEYS = [STORAGE_KEYS.communities, STORAGE_KEYS.players, STORAGE_KEYS.communityRules];

export function clearAccountEntitiesFromStorage(
  userId: string | null,
  remove: (key: string) => void = removeFromStorage,
): boolean {
  if (!userId) return false;
  for (const key of ONLINE_KEYS) remove(key);
  return true;
}
