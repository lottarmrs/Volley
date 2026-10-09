import { useCallback } from 'react';
import { useQueries, type UseQueryResult } from '@tanstack/react-query';
import { queryKeys } from '@app/queryKeys';
import { toSkillValuesMap } from '@app/cardStats';
import { communitySkillProfileCloudService } from '@infra/supabase/communitySkillProfileCloudService';
import { isSupabaseConfigured } from '../lib/supabaseClient';
import type { Attributes, Community, Player } from '@shared/types';

type CardRows = Awaited<ReturnType<typeof communitySkillProfileCloudService.fetchCardStats>>;

export interface CardStatsForCommunities {
  valores: Map<string, Map<string, Partial<Attributes>> | undefined>;
  erros: Set<string>;
  tentarDeNovo: (communityId: string) => void;
}

export function useCardStatsForCommunities(
  communities: Community[],
  players: Player[],
): CardStatsForCommunities {
  const queries = (isSupabaseConfigured ? communities.filter((c) => !!c.cloudId) : []).map(
    (community) => ({
      queryKey: queryKeys.numerosDaCarta(community.cloudId as string),
      refetchOnWindowFocus: true,
      queryFn: () => communitySkillProfileCloudService.fetchCardStats(community.cloudId as string),
    }),
  );
  const combine = useCallback(
    (results: UseQueryResult<CardRows>[]) => {
      const valores = new Map<string, Map<string, Partial<Attributes>> | undefined>();
      const erros = new Set<string>();
      const refazer = new Map<string, () => unknown>();
      for (const community of communities) valores.set(community.id, new Map());
      const comNuvem = isSupabaseConfigured ? communities.filter((c) => !!c.cloudId) : [];
      comNuvem.forEach((community, i) => {
        const resultado = results[i];
        const linhas = resultado?.data;
        valores.set(community.id, linhas ? toSkillValuesMap(linhas, players) : undefined);
        if (!resultado) return;
        refazer.set(community.id, resultado.refetch);
        if (!linhas && (resultado.isError || resultado.fetchStatus === 'paused'))
          erros.add(community.id);
      });
      const tentarDeNovo = (communityId: string) => {
        void refazer.get(communityId)?.();
      };
      return { valores, erros, tentarDeNovo };
    },
    [communities, players],
  );
  return useQueries({ queries, combine });
}
