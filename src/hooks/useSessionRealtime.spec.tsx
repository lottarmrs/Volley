import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useSessionRealtime } from './useSessionRealtime';

const canal = vi.hoisted(() => ({
  filtro: '' as string | undefined,
  aviso: null as null | (() => void),
  removido: false,
}));

vi.mock('../lib/supabaseClient', () => {
  const channel = {
    on: (_tipo: string, opts: { filter?: string }, handler: () => void) => {
      canal.filtro = opts.filter;
      canal.aviso = handler;
      return channel;
    },
    subscribe: () => channel,
  };
  return {
    isSupabaseConfigured: true,
    supabase: {
      channel: vi.fn(() => channel),
      removeChannel: vi.fn(() => {
        canal.removido = true;
      }),
    },
  };
});

describe('useSessionRealtime', () => {
  it('escuta a janela da lista da pelada e chama a releitura', () => {
    const reler = vi.fn();
    const { unmount } = renderHook(() => useSessionRealtime('s1', reler));
    expect(canal.filtro).toBe('session_id=eq.s1');
    canal.aviso!();
    expect(reler).toHaveBeenCalledTimes(1);
    unmount();
    expect(canal.removido).toBe(true);
  });
});
