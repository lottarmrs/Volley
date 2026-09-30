import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { STORAGE_KEYS } from '../storage/localStorageRepository';
import { makeGame, makeSession } from '../test/fixtures';
import type { PointEvent } from '../types';
import { fetchMySessions, emptySessionBundle } from '../application/sessionDataQueries';
import { persistSessionBundleChanges } from '../application/sessionWrites';
import { useSessions } from './useSessions';

const conta = vi.hoisted(() => ({ userId: null as string | null }));

vi.mock('./useAuth', () => ({
  useAuth: () => ({
    user: conta.userId ? { id: conta.userId } : null,
    isSupabaseConfigured: true,
  }),
}));

vi.mock('../application/communityDataQueries', () => ({
  fetchMyCommunities: vi.fn(async () => []),
}));

vi.mock('../application/sessionDataQueries', async (importOriginal) => {
  const original = await importOriginal<typeof import('../application/sessionDataQueries')>();
  return { ...original, fetchMySessions: vi.fn() };
});

vi.mock('../application/sessionWrites', () => ({
  persistSessionBundleChanges: vi.fn(),
  defaultSessionWriteGateway: {},
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function render() {
  return renderHook(() => useSessions(), { wrapper });
}

describe('useSessions sem conta', () => {
  beforeEach(() => {
    localStorage.clear();
    conta.userId = null;
  });

  it('inicia vazio quando não há dados no storage', () => {
    const { result } = render();
    expect(result.current.sessions).toEqual([]);
    expect(result.current.games).toEqual([]);
    expect(result.current.activeSession).toBeNull();
  });

  it('hidrata sessões gravadas no localStorage', () => {
    localStorage.setItem(STORAGE_KEYS.sessions, JSON.stringify([makeSession('s1')]));
    const { result } = render();
    expect(result.current.sessions).toHaveLength(1);
    expect(result.current.sessions[0].id).toBe('s1');
  });

  it('persiste sessões no localStorage quando o estado muda', () => {
    const { result } = render();
    act(() => {
      result.current.setSessions([makeSession('s1', { name: 'Persistida' })]);
    });
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEYS.sessions)!);
    expect(stored).toHaveLength(1);
    expect(stored[0].name).toBe('Persistida');
  });

  it('remove no startup jogos órfãos de sessões que não existem mais', () => {
    localStorage.setItem(STORAGE_KEYS.sessions, JSON.stringify([makeSession('s1')]));
    localStorage.setItem(
      STORAGE_KEYS.games,
      JSON.stringify([makeGame('g1', 's1'), makeGame('g2', 'sessao-fantasma')]),
    );
    const { result } = render();
    expect(result.current.games.map((g) => g.id)).toEqual(['g1']);
  });

  it('mantém jogos da sessão ativa mesmo fora da lista de sessões', () => {
    localStorage.setItem(STORAGE_KEYS.activeSession, JSON.stringify(makeSession('ativa')));
    localStorage.setItem(STORAGE_KEYS.games, JSON.stringify([makeGame('g1', 'ativa')]));
    const { result } = render();
    expect(result.current.games).toHaveLength(1);
  });

  it('updateActiveSession sincroniza a sessão ativa e a lista', () => {
    const session = makeSession('s1', { name: 'Original' });
    localStorage.setItem(STORAGE_KEYS.sessions, JSON.stringify([session]));
    localStorage.setItem(STORAGE_KEYS.activeSession, JSON.stringify(session));
    const { result } = render();
    act(() => {
      result.current.updateActiveSession({ ...result.current.activeSession!, name: 'Editada' });
    });
    expect(result.current.activeSession!.name).toBe('Editada');
    expect(result.current.sessions[0].name).toBe('Editada');
  });
});

describe('useSessions com conta', () => {
  const emAndamento = makeSession('s1', {
    status: 'active',
    controlledByUserId: 'u1',
    authorityModel: 'target',
  });

  beforeEach(() => {
    localStorage.clear();
    conta.userId = 'u1';
    vi.mocked(fetchMySessions)
      .mockReset()
      .mockResolvedValue({ ...emptySessionBundle(), sessions: [emAndamento] });
    vi.mocked(persistSessionBundleChanges).mockReset().mockResolvedValue();
  });

  it('le as peladas do banco e adota a que a pessoa controla', async () => {
    localStorage.setItem(STORAGE_KEYS.sessions, JSON.stringify([makeSession('do-aparelho')]));
    const { result } = render();
    expect(result.current.status.loading).toBe(true);
    await waitFor(() => expect(result.current.status.loading).toBe(false));
    expect(result.current.sessions.map((s) => s.id)).toEqual(['s1']);
    expect(result.current.activeSession?.id).toBe('s1');
  });

  it('ponto novo aparece na hora e grava so o que mudou', async () => {
    const { result } = render();
    await waitFor(() => expect(result.current.status.loading).toBe(false));
    const ponto = { id: 'p1', sessionId: 's1', gameId: 'g1' } as PointEvent;
    act(() => {
      result.current.setPointEvents((prev) => [...prev, ponto]);
    });
    await waitFor(() => expect(result.current.pointEvents).toEqual([ponto]));
    await waitFor(() => expect(persistSessionBundleChanges).toHaveBeenCalledTimes(1));
    const [antes, depois] = vi.mocked(persistSessionBundleChanges).mock.calls[0];
    expect(antes.pointEvents).toEqual([]);
    expect(depois.pointEvents).toEqual([ponto]);
  });

  it('recusa do banco avisa e rele do servidor', async () => {
    vi.mocked(persistSessionBundleChanges).mockRejectedValue({ code: '42501', message: 'nao' });
    const { result } = render();
    await waitFor(() => expect(result.current.status.loading).toBe(false));
    act(() => {
      result.current.setPointEvents([{ id: 'p1', sessionId: 's1' } as PointEvent]);
    });
    await waitFor(() => expect(result.current.status.error?.kind).toBe('authorization'));
    await waitFor(() => expect(result.current.pointEvents).toEqual([]));
  });

  it('sem conexao nao aplica e avisa', async () => {
    const { result } = render();
    await waitFor(() => expect(result.current.status.loading).toBe(false));
    const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    try {
      act(() => {
        result.current.setPointEvents([{ id: 'p1', sessionId: 's1' } as PointEvent]);
      });
      expect(result.current.pointEvents).toEqual([]);
      expect(result.current.status.offline).toBe(true);
      expect(persistSessionBundleChanges).not.toHaveBeenCalled();
    } finally {
      onLine.mockRestore();
    }
  });

  it('limpar a pelada ativa nao readota a em andamento', async () => {
    const { result } = render();
    await waitFor(() => expect(result.current.activeSession?.id).toBe('s1'));
    act(() => {
      result.current.setActiveSession(null);
    });
    expect(result.current.activeSession).toBeNull();
  });

  it('nao grava nada no aparelho', async () => {
    const { result } = render();
    await waitFor(() => expect(result.current.status.loading).toBe(false));
    expect(localStorage.getItem(STORAGE_KEYS.sessions)).toBeNull();
  });
});
