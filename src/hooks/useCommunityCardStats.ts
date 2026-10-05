import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@app/queryKeys';
import { toSkillValuesMap } from '@app/cardStats';
import { communitySkillProfileCloudService } from '@infra/supabase/communitySkillProfileCloudService';
import { isSupabaseConfigured } from '../lib/supabaseClient';
import type { Attributes, Player } from '@shared/types';

export function useCommunityCardStats(
  communityCloudId: string | null,
  players: Player[],
): Map<string, Partial<Attributes>> | undefined {
  const enabled = isSupabaseConfigured && !!communityCloudId;
  const query = useQuery({
    queryKey: queryKeys.numerosDaCarta(communityCloudId ?? ''),
    enabled,
    refetchOnWindowFocus: true,
    queryFn: () => communitySkillProfileCloudService.fetchCardStats(communityCloudId as string),
  });
  return useMemo(
    () => (enabled && query.data ? toSkillValuesMap(query.data, players) : undefined),
    [enabled, query.data, players],
  );
}
