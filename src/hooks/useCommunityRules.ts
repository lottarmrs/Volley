import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Community, CommunityRules } from '../types';
import { STORAGE_KEYS, loadFromStorage, saveToStorage } from '../storage/localStorageRepository';
import {
  createDefaultLocalCommunityRules,
  removeLocalCommunityRules,
  saveLocalCommunityRules,
  selectVisibleCommunityRules,
} from '../application/localCommunityRulesUseCases';
import { fetchMyCommunities, fetchRules } from '../application/communityDataQueries';
import { queryKeys } from '../application/queryKeys';
import { communityRulesCloudService } from '../infra/supabase/communityRulesCloudService';
import { useOnlineAccount, useOnlineList } from './useOnlineList';

export function createDefaultCommunityRules(community: Community): CommunityRules {
  return createDefaultLocalCommunityRules({ community, now: new Date().toISOString() });
}

export function useCommunityRules() {
  const { online, userId, settled } = useOnlineAccount();
  const queryClient = useQueryClient();
  const [localRules, setLocalRules] = useState<CommunityRules[]>(() =>
    loadFromStorage<CommunityRules[]>(STORAGE_KEYS.communityRules, []),
  );
  const remote = useOnlineList<CommunityRules>({
    enabled: online,
    queryKey: queryKeys.regras(userId ?? ''),
    fetch: async () =>
      fetchRules(
        await queryClient.ensureQueryData<Community[]>({
          queryKey: queryKeys.comunidades(userId ?? ''),
          queryFn: fetchMyCommunities,
        }),
      ),
  });
  const rules = online ? remote.data : localRules;

  useEffect(() => {
    if (settled && !online) saveToStorage(STORAGE_KEYS.communityRules, localRules);
  }, [localRules, online, settled]);

  const getRules = useCallback(
    (community: Community) => {
      return (
        rules.find((rule) => rule.communityId === community.id) ||
        createDefaultCommunityRules(community)
      );
    },
    [rules],
  );

  const { write } = remote;
  const saveRules = useCallback(
    (next: CommunityRules, allowed = true) => {
      const now = new Date().toISOString();
      if (!online || !userId) {
        setLocalRules((prev) => saveLocalCommunityRules({ rules: prev, next, allowed, now }));
        return;
      }
      if (!allowed) throw new Error('PERMISSION_DENIED');
      const community = (
        queryClient.getQueryData<Community[]>(queryKeys.comunidades(userId)) ?? []
      ).find((item) => item.id === next.communityId);
      if (!community?.cloudId) return;
      const saved = { ...next, updatedAt: now };
      void write(
        (list) =>
          list.some((rule) => rule.communityId === saved.communityId)
            ? list.map((rule) => (rule.communityId === saved.communityId ? saved : rule))
            : [...list, saved],
        () =>
          communityRulesCloudService.upsert(
            saved,
            community.cloudOwnerId ?? userId,
            community.cloudId!,
          ),
      );
    },
    [online, queryClient, userId, write],
  );

  const removeRules = useCallback(
    (communityId: string) => {
      if (online) return;
      setLocalRules((prev) => removeLocalCommunityRules({ rules: prev, communityId }));
    },
    [online],
  );

  return useMemo(
    () => ({
      rules: selectVisibleCommunityRules(rules),
      rawRules: rules,
      online,
      status: remote.status,
      replaceLocalRules: setLocalRules,
      getRules,
      saveRules,
      removeRules,
    }),
    [rules, online, remote.status, getRules, saveRules, removeRules],
  );
}
