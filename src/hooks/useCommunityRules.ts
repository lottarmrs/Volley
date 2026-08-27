import { useCallback, useEffect, useMemo, useState } from 'react';
import { Community, CommunityRules } from '../types';
import { STORAGE_KEYS, loadFromStorage, saveToStorage } from '../storage/localStorageRepository';
import {
  createDefaultLocalCommunityRules,
  removeLocalCommunityRules,
  saveLocalCommunityRules,
  selectVisibleCommunityRules,
} from '../application/localCommunityRulesUseCases';

export function createDefaultCommunityRules(community: Community): CommunityRules {
  return createDefaultLocalCommunityRules({ community, now: new Date().toISOString() });
}

export function useCommunityRules() {
  const [rules, setRules] = useState<CommunityRules[]>(() =>
    loadFromStorage<CommunityRules[]>(STORAGE_KEYS.communityRules, []),
  );

  useEffect(() => saveToStorage(STORAGE_KEYS.communityRules, rules), [rules]);

  const getRules = useCallback(
    (community: Community) => {
      return (
        rules.find((rule) => rule.communityId === community.id) ||
        createDefaultCommunityRules(community)
      );
    },
    [rules],
  );

  const saveRules = useCallback((next: CommunityRules, allowed = true) => {
    setRules((prev) =>
      saveLocalCommunityRules({
        rules: prev,
        next,
        allowed,
        now: new Date().toISOString(),
      }),
    );
  }, []);

  const removeRules = useCallback((communityId: string) => {
    setRules((prev) => removeLocalCommunityRules({ rules: prev, communityId }));
  }, []);

  return useMemo(
    () => ({
      rules: selectVisibleCommunityRules(rules),
      rawRules: rules, // Expose full list for syncService
      setRules,
      getRules,
      saveRules,
      removeRules,
    }),
    [rules, getRules, saveRules, removeRules],
  );
}
