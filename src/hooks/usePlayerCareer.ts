import { useCallback, useEffect, useState } from 'react';
import { careerCloudService } from '@infra/supabase/careerCloudService';
import { isSupabaseConfigured } from '../lib/supabaseClient';
import type { CareerEvent, CareerTotals } from '@shared/types/career';

interface UsePlayerCareerOptions {
  /** Id de NUVEM do jogador. career_events.player_id referencia players.id, e o
   *  Player.id do cliente e o id LOCAL — passar o id errado devolve carreira vazia
   *  em silencio. */
  playerCloudId?: string;
  enabled: boolean;
}

/** Carrega a carreira confirmada (livro-razao no servidor). Um jogador que nunca
 *  sincronizou nao tem cloudId e portanto nao tem carreira confirmada — quem chama
 *  trata isso como progresso provisorio, nao como erro. */
export function usePlayerCareer({ playerCloudId, enabled }: UsePlayerCareerOptions) {
  const [events, setEvents] = useState<CareerEvent[]>([]);
  const [totals, setTotals] = useState<CareerTotals | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!enabled || !playerCloudId || !isSupabaseConfigured) {
      setEvents([]);
      setTotals(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [loadedEvents, loadedTotals] = await Promise.all([
        careerCloudService.fetchEventsByPlayer(playerCloudId),
        careerCloudService.fetchTotals(playerCloudId),
      ]);
      setEvents(loadedEvents);
      setTotals(loadedTotals);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Nao foi possivel carregar a carreira.');
    } finally {
      setLoading(false);
    }
  }, [enabled, playerCloudId]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { events, totals, loading, error, reload };
}
