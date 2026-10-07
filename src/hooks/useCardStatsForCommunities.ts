import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { queryKeys } from '@app/queryKeys';
import { toSkillValuesMap } from '@app/cardStats';
import { communitySkillProfileCloudService } from '@infra/supabase/communitySkillProfileCloudService';
import { isSupabaseConfigured } from '../lib/supabaseClient';
import type { Attributes, Community, Player } from '@shared/types';

export function useCardStatsForCommunities(
  communities: Community[],
  players: Player[],
): Map<string, Map<string, Partial<Attributes>> | undefined> {
  const comNuvem = isSupabaseConfigured ? communities.filter((c) => !!c.cloudId) : [];
  const resultados = useQueries({
    queries: comNuvem.map((community) => ({
      queryKey: queryKeys.numerosDaCarta(community.cloudId as string),
      refetchOnWindowFocus: true,
      queryFn: () => communitySkillProfileCloudService.fetchCardStats(community.cloudId as string),
    })),
  });
  const assinatura = resultados.map((r) => `${r.status}:${r.dataUpdatedAt}`).join('|');
  return useMemo(() => {
    const mapa = new Map<string, Map<string, Partial<Attributes>> | undefined>();
    for (const community of communities) mapa.set(community.id, new Map());
    comNuvem.forEach((community, i) => {
      const linhas = resultados[i]?.data;
      mapa.set(community.id, linhas ? toSkillValuesMap(linhas, players) : undefined);
    });
    return mapa;
  }, [communities, players, assinatura]);
}
