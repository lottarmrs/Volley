import type { ReactNode } from 'react';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCommunityRealtime } from './useCommunityRealtime';

type Handler = (payload: unknown) => void;

const canal = vi.hoisted(() => ({
  handlers: [] as Array<{ table: string; filter?: string; handler: Handler }>,
  onStatus: null as null | ((status: string) => void),
  removed: 0,
}));

vi.mock('./useAuth', () => ({
  useAuth: () => ({ user: { id: 'u1' }, isSupabaseConfigured: true }),
}));

vi.mock('../lib/supabaseClient', () => {
  const channel = {
    on: (_type: string, opts: { table: string; filter?: string }, handler: Handler) => {
      canal.handlers.push({ table: opts.table, filter: opts.filter, handler });
      return channel;
    },
    subscribe: (cb: (status: string) => void) => {
      canal.onStatus = cb;
      return channel;
    },
  };
  return {
    isSupabaseConfigured: true,
    supabase: {
      channel: vi.fn(() => channel),
      removeChannel: vi.fn(() => {
        canal.removed += 1;
      }),
    },
  };
});

function montar() {
  const client = new QueryClient();
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  const setData = vi.spyOn(client, 'setQueryData');
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const view = renderHook(() => useCommunityRealtime('c1'), { wrapper });
  return { invalidate, setData, view };
}

function avisar(table: string) {
  canal.handlers.find((entry) => entry.table === table)!.handler({ new: { nome: 'x' } });
}

describe('useCommunityRealtime', () => {
  beforeEach(() => {
    canal.handlers = [];
    canal.onStatus = null;
    canal.removed = 0;
  });

  it('assina as cinco tabelas, com filtro de comunidade onde ha coluna', () => {
    montar();
    expect(canal.handlers.map(({ table }) => table).sort()).toEqual([
      'communities',
      'community_members',
      'community_players',
      'community_rules',
      'game_reports',
      'games',
      'players',
      'point_events',
      'session_reports',
      'sessions',
      'teams',
    ]);
    expect(canal.handlers.find(({ table }) => table === 'players')?.filter).toBeUndefined();
    expect(canal.handlers.find(({ table }) => table === 'community_rules')?.filter).toBe(
      'community_id=eq.c1',
    );
  });

  it('aviso de players invalida so o elenco e nao usa o payload', () => {
    const { invalidate, setData } = montar();
    avisar('players');
    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['atletas', 'u1'] });
    expect(setData).not.toHaveBeenCalled();
  });

  it('reconectar depois de erro invalida as cinco chaves', () => {
    const { invalidate } = montar();
    canal.onStatus!('SUBSCRIBED');
    expect(invalidate).not.toHaveBeenCalled();
    canal.onStatus!('CHANNEL_ERROR');
    canal.onStatus!('SUBSCRIBED');
    expect(invalidate).toHaveBeenCalledTimes(5);
  });

  it('desmontar remove o canal', () => {
    const { view } = montar();
    view.unmount();
    expect(canal.removed).toBe(1);
  });
});
