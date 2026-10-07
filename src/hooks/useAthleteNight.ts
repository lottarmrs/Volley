import { useCallback, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@app/queryKeys';
import { buildAthleteNight, type AthleteNight } from '@app/athleteNight';
import { careerCloudService } from '@infra/supabase/careerCloudService';
import type { BuildVutCardContext } from '@logic/futCards';
import type { Community, Player } from '@shared/types';
import { isSupabaseConfigured } from '../lib/supabaseClient';
import { useCommunityCardStats } from './useCommunityCardStats';

type Held = { userId: string; sessionId: string; communityId: string };

export function useAthleteNight(input: {
  userId: string | null;
  players: Player[];
  communities: Community[];
  history: BuildVutCardContext;
}): {
  night: AthleteNight | null;
  communityName: string | null;
  communityId: string | null;
  sessionDate: string;
  markSeen: () => void;
  dismiss: () => void;
} {
  const { userId, players, communities, history } = input;
  const queryClient = useQueryClient();
  const [held, setHeld] = useState<Held | null>(null);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const enabled = isSupabaseConfigured && !!userId;

  const pending = useQuery({
    queryKey: queryKeys.noite(userId ?? ''),
    enabled,
    refetchOnWindowFocus: true,
    queryFn: () => careerCloudService.fetchPendingNight(),
  });

  const target = enabled ? (pending.data ?? null) : null;
  const heldNow = held && held.userId === userId ? held : null;
  const candidate: Held | null =
    heldNow ??
    (target && userId && !dismissed.includes(`${userId}:${target.sessionId}`)
      ? { userId, sessionId: target.sessionId, communityId: target.communityId }
      : null);
  const candidateSessionId = candidate?.sessionId ?? null;
  const candidateCommunityId = candidate?.communityId ?? null;

  const skillValues = useCommunityCardStats(candidateCommunityId, players);

  const built = useMemo(() => {
    if (!candidateSessionId || !skillValues) return null;
    const me = players.find((player) => player.userId === userId);
    const session = history.sessions.find(
      (s) => s.cloudId === candidateSessionId || s.id === candidateSessionId,
    );
    if (!me || !session) return null;
    const night = buildAthleteNight({ player: me, session, history: { ...history, skillValues } });
    return night ? { night, session } : null;
  }, [candidateSessionId, skillValues, players, userId, history]);

  if (built && candidate && heldNow?.sessionId !== candidate.sessionId) setHeld(candidate);

  const community = candidateCommunityId
    ? (communities.find((c) => (c.cloudId ?? c.id) === candidateCommunityId) ?? null)
    : null;

  const { mutate } = useMutation({
    mutationFn: (sessionCloudId: string) => careerCloudService.markNightSeen(sessionCloudId),
    onSettled: () => {
      if (userId) void queryClient.invalidateQueries({ queryKey: queryKeys.noite(userId) });
    },
  });

  const markSeen = useCallback(() => {
    if (candidateSessionId) mutate(candidateSessionId);
  }, [mutate, candidateSessionId]);

  const dismiss = useCallback(() => {
    if (userId && candidateSessionId) {
      setDismissed((current) => [...current, `${userId}:${candidateSessionId}`]);
    }
    setHeld(null);
  }, [userId, candidateSessionId]);

  return {
    night: built?.night ?? null,
    communityName: community?.name ?? null,
    communityId: built?.session.communityId ?? null,
    sessionDate: built?.session.date ?? '',
    markSeen,
    dismiss,
  };
}
