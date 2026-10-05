import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useAthleteNight } from './useAthleteNight';

const fetchPendingNight = vi.fn();
const markNightSeen = vi.fn();
vi.mock('@infra/supabase/careerCloudService', () => ({
  careerCloudService: {
    fetchPendingNight: () => fetchPendingNight(),
    markNightSeen: (id: string) => markNightSeen(id),
  },
}));
vi.mock('./useCommunityCardStats', () => ({ useCommunityCardStats: () => undefined }));
vi.mock('../lib/supabaseClient', () => ({ isSupabaseConfigured: true, supabase: {} }));

const ana = {
  id: 'ana',
  cloudId: 'uuid-ana',
  userId: 'conta-ana',
  nome: 'Ana',
  posicaoPrincipal: 'ponteiro',
  maoDominante: 'direita',
  atributos: {},
  formaAtual: { valor: 0, observacao: '', ultimasPartidas: [] },
} as never;

const history = {
  sessions: [{ id: 's1', cloudId: 'uuid-s1', name: 's1', date: '2026-10-04', status: 'finished' }],
  teams: [
    { id: 't1', sessionId: 's1', name: 'A', playerIds: ['ana'] },
    { id: 't2', sessionId: 's1', name: 'B', playerIds: ['bia'] },
  ],
  games: [],
  pointEvents: [],
  players: [ana],
  sessionReports: [],
} as never;

const communities = [{ id: 'c1', cloudId: 'uuid-c1', name: 'Vôlei de Terça' }] as never;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
}

describe('useAthleteNight', () => {
  beforeEach(() => {
    fetchPendingNight.mockReset();
    markNightSeen.mockReset().mockResolvedValue(undefined);
  });

  it('monta a noite pendente da pelada que o atleta jogou', async () => {
    fetchPendingNight.mockResolvedValue({ sessionId: 'uuid-s1', communityId: 'uuid-c1' });
    const { result } = renderHook(
      () => useAthleteNight({ userId: 'conta-ana', players: [ana], communities, history }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.night?.sessionId).toBe('s1'));
    expect(result.current.communityName).toBe('Vôlei de Terça');
  });

  it('sem pendente, sem noite', async () => {
    fetchPendingNight.mockResolvedValue(null);
    const { result } = renderHook(
      () => useAthleteNight({ userId: 'conta-ana', players: [ana], communities, history }),
      { wrapper },
    );
    await waitFor(() => expect(fetchPendingNight).toHaveBeenCalled());
    expect(result.current.night).toBeNull();
  });

  it('marcar vista chama o servidor com o id de nuvem da pelada', async () => {
    fetchPendingNight.mockResolvedValue({ sessionId: 'uuid-s1', communityId: 'uuid-c1' });
    const { result } = renderHook(
      () => useAthleteNight({ userId: 'conta-ana', players: [ana], communities, history }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.night).not.toBeNull());
    act(() => result.current.markSeen());
    await waitFor(() => expect(markNightSeen).toHaveBeenCalledWith('uuid-s1'));
  });

  it('sem conta nao pergunta ao servidor', () => {
    renderHook(() => useAthleteNight({ userId: null, players: [], communities, history }), {
      wrapper,
    });
    expect(fetchPendingNight).not.toHaveBeenCalled();
  });
});
