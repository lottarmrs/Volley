import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useCardStatsForCommunities } from './useCardStatsForCommunities';

const fetchCardStats = vi.fn();
vi.mock('@infra/supabase/communitySkillProfileCloudService', () => ({
  communitySkillProfileCloudService: { fetchCardStats: (id: string) => fetchCardStats(id) },
}));
vi.mock('../lib/supabaseClient', () => ({ isSupabaseConfigured: true, supabase: {} }));

const players = [{ id: 'ana', cloudId: 'uuid-ana' }] as never;
let client: QueryClient;
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useCardStatsForCommunities', () => {
  beforeEach(() => {
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    fetchCardStats.mockReset();
  });

  it('uma consulta por comunidade com cloudId, e o mapa por id do app', async () => {
    fetchCardStats.mockImplementation(async (id: string) =>
      id === 'uuid-c1' ? [{ playerId: 'uuid-ana', dimensionKey: 'ataque', value: 8 }] : [],
    );
    const comunidades = [
      { id: 'c1', cloudId: 'uuid-c1', name: 'Terça' },
      { id: 'c2', cloudId: 'uuid-c2', name: 'Quinta' },
    ] as never;
    const { result } = renderHook(() => useCardStatsForCommunities(comunidades, players), {
      wrapper,
    });
    expect(result.current.get('c1')).toBeUndefined();
    await waitFor(() => expect(result.current.get('c1')?.get('ana')).toEqual({ ataque: 8 }));
    expect(result.current.get('c2')?.size).toBe(0);
    expect(fetchCardStats).toHaveBeenCalledTimes(2);
  });

  it('comunidade sem cloudId vira mapa vazio, sem consulta', () => {
    const { result } = renderHook(
      () => useCardStatsForCommunities([{ id: 'local', name: 'Local' }] as never, players),
      { wrapper },
    );
    expect(result.current.get('local')?.size).toBe(0);
    expect(fetchCardStats).not.toHaveBeenCalled();
  });
});
