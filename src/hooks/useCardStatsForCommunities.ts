import { useCallback } from 'react';
import { useQueries, type UseQueryResult } from '@tanstack/react-query';
import { queryKeys } from '@app/queryKeys';
import { toSkillValuesMap } from '@app/cardStats';
import { communitySkillProfileCloudService } from '@infra/supabase/communitySkillProfileCloudService';
import { isSupabaseConfigured } from '../lib/supabaseClient';
import type { Attributes, Community, Player } from '@shared/types';

type CardRows = Awaited<ReturnType<typeof communitySkillProfileCloudService.fetchCardStats>>;

export function useCardStatsForCommunities(
  communities: Community[],
  players: Player[],
): Map<string, Map<string, Partial<Attributes>> | undefined> {
  const queries = (isSupabaseConfigured ? communities.filter((c) => !!c.cloudId) : []).map(
    (community) => ({
      queryKey: queryKeys.numerosDaCarta(community.cloudId as string),
      refetchOnWindowFocus: true,
      queryFn: () => communitySkillProfileCloudService.fetchCardStats(community.cloudId as string),
    }),
  );
  const combine = useCallback(
    (results: UseQueryResult<CardRows>[]) => {
      const mapa = new Map<string, Map<string, Partial<Attributes>> | undefined>();
      for (const community of communities) mapa.set(community.id, new Map());
      const comNuvem = isSupabaseConfigured ? communities.filter((c) => !!c.cloudId) : [];
      comNuvem.forEach((community, i) => {
        const linhas = results[i]?.data;
        mapa.set(community.id, linhas ? toSkillValuesMap(linhas, players) : undefined);
      });
      return mapa;
    },
    [communities, players],
  );
  return useQueries({ queries, combine });
}
