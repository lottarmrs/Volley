import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { allCommunityKeys, invalidationKeysFor, REALTIME_TABLES } from '@app/realtimeInvalidation';
import { createInvalidationBatcher } from '@app/invalidationBatcher';
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient';
import { useAuth } from './useAuth';

const QUEDAS = new Set(['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED']);

export function useCommunityRealtime(communityCloudId: string | null): void {
  const queryClient = useQueryClient();
  const userId = useAuth().user?.id ?? null;

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase || !userId || !communityCloudId) return;
    const ctx = { userId, communityCloudId };
    const lote = createInvalidationBatcher(
      (keys) => {
        for (const queryKey of keys) void queryClient.invalidateQueries({ queryKey });
      },
      { delayMs: 400, maxWaitMs: 1500 },
    );
    const invalidar = (keys: ReadonlyArray<readonly string[]>) => lote.add(keys);
    let caiu = false;
    let channel = supabase.channel(`comunidade:${communityCloudId}`);
    for (const { table, filterColumn } of REALTIME_TABLES) {
      channel = channel.on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table,
          ...(filterColumn ? { filter: `${filterColumn}=eq.${communityCloudId}` } : {}),
        },
        () => invalidar(invalidationKeysFor(table, ctx)),
      );
    }
    channel.subscribe((status: string) => {
      if (QUEDAS.has(status)) {
        caiu = true;
        return;
      }
      if (status === 'SUBSCRIBED' && caiu) {
        caiu = false;
        invalidar(allCommunityKeys(ctx));
      }
    });
    return () => {
      lote.cancel();
      void supabase.removeChannel(channel);
    };
  }, [communityCloudId, queryClient, userId]);
}
