import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@app/queryKeys';
import { buildAthleteNight, type AthleteNight } from '@app/athleteNight';
import { careerCloudService } from '@infra/supabase/careerCloudService';
import type { BuildVutCardContext } from '@logic/futCards';
import type { Community, Player } from '@shared/types';
import { isSupabaseConfigured } from '../lib/supabaseClient';
import { useCommunityCardStats } from './useCommunityCardStats';

export function useAthleteNight(input: {
  userId: string | null;
  players: Player[];
  communities: Community[];
  history: BuildVutCardContext;
}): {
  night: AthleteNight | null;
  communityName: string | null;
  markSeen: () => void;
  dismiss: () => void;
} {
  const { userId, players, communities, history } = input;
  const queryClient = useQueryClient();
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [shown, setShown] = useState<AthleteNight | null>(null);
  const enabled = isSupabaseConfigured && !!userId;

  const pending = useQuery({
    queryKey: queryKeys.noite(userId ?? ''),
    enabled,
    refetchOnWindowFocus: true,
    queryFn: () => careerCloudService.fetchPendingNight(),
  });

  const target = enabled ? (pending.data ?? null) : null;
  const skillValues = useCommunityCardStats(target?.communityId ?? null, players);

  const community = target
    ? (communities.find((c) => (c.cloudId ?? c.id) === target.communityId) ?? null)
    : null;

  const built = useMemo(() => {
    if (!target || dismissed.includes(target.sessionId)) return null;
    const me = players.find((player) => player.userId === userId);
    const session = history.sessions.find(
      (s) => s.cloudId === target.sessionId || s.id === target.sessionId,
    );
    if (!me || !session) return null;
    return buildAthleteNight({ player: me, session, history: { ...history, skillValues } });
  }, [target, dismissed, players, userId, history, skillValues]);

  const { mutate } = useMutation({
    mutationFn: (sessionCloudId: string) => careerCloudService.markNightSeen(sessionCloudId),
    onSettled: () => {
      if (userId) void queryClient.invalidateQueries({ queryKey: queryKeys.noite(userId) });
    },
  });

  useEffect(() => {
    if (built && !shown) setShown(built);
  }, [built, shown]);

  const targetSessionId = target?.sessionId ?? null;

  const markSeen = useCallback(() => {
    if (targetSessionId) mutate(targetSessionId);
  }, [mutate, targetSessionId]);

  const dismiss = useCallback(() => {
    const ids = [targetSessionId, shown?.sessionId].filter((id): id is string => !!id);
    setDismissed((current) => [...current, ...ids]);
    setShown(null);
  }, [targetSessionId, shown]);

  const night = shown ?? built;

  return { night, communityName: community?.name ?? null, markSeen, dismiss };
}
