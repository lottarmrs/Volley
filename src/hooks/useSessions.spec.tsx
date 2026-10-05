import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STORAGE_KEYS } from '../storage/localStorageRepository';
import { makeGame, makeSession } from '../test/fixtures';
import type { Community, PointEvent } from '../types';
import { fetchMyCommunities } from '../application/communityDataQueries';
import { fetchMySessions, emptySessionBundle } from '../application/sessionDataQueries';
import { persistSessionBundleChanges } from '../application/sessionWrites';
import { fetchLiveScoreState } from '../infra/supabase/liveScoreCloudService';
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

vi.mock('../infra/supabase/liveScoreCloudService', () => ({
  fetchLiveScoreState: vi.fn(async () => ({
    controlledByUserId: 'u1',
    controllerName: null,
    pointIds: [],
    sessionEnded: false,
  })),
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
    vi.mocked(fetchMyCommunities).mockReset().mockResolvedValue([]);
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

  it('leitura que ja estava a caminho nao apaga o jogo recem-criado', async () => {
    const { result } = render();
    await waitFor(() => expect(result.current.status.loading).toBe(false));
    let soltar: (valor: ReturnType<typeof emptySessionBundle>) => void = () => {};
    vi.mocked(fetchMySessions).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          soltar = resolve;
        }),
    );
    const chamadas = vi.mocked(fetchMySessions).mock.calls.length;
    act(() => {
      void result.current.refresh();
    });
    await waitFor(() => expect(vi.mocked(fetchMySessions).mock.calls.length).toBe(chamadas + 1));
    const jogo = makeGame('g1', 's1', { status: 'active' });
    act(() => {
      result.current.setGames((prev) => [...prev, jogo]);
    });
    await act(async () => {
      soltar({ ...emptySessionBundle(), sessions: [emAndamento] });
    });
    await waitFor(() => expect(result.current.games.map((g) => g.id)).toEqual(['g1']));
  });

  it('releitura espera a gravacao do placar terminar, para o ponto nao voltar', async () => {
    const jogo = makeGame('g1', 's1', { status: 'active', scoreA: 0 });
    vi.mocked(fetchMySessions).mockResolvedValue({
      ...emptySessionBundle(),
      sessions: [emAndamento],
      games: [jogo],
    });
    const { result } = render();
    await waitFor(() => expect(result.current.games).toHaveLength(1));
    let terminar: () => void = () => {};
    vi.mocked(persistSessionBundleChanges).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          terminar = resolve;
        }),
    );
    const chamadas = vi.mocked(fetchMySessions).mock.calls.length;
    act(() => {
      result.current.setGames((prev) => prev.map((g) => ({ ...g, scoreA: 1 })));
    });
    act(() => {
      void result.current.refresh();
    });
    await new Promise((r) => setTimeout(r, 50));
    expect(vi.mocked(fetchMySessions).mock.calls.length).toBe(chamadas);
    expect(result.current.games[0].scoreA).toBe(1);
    vi.mocked(fetchMySessions).mockResolvedValue({
      ...emptySessionBundle(),
      sessions: [emAndamento],
      games: [{ ...jogo, scoreA: 1 }],
    });
    await act(async () => {
      terminar();
    });
    await waitFor(() =>
      expect(vi.mocked(fetchMySessions).mock.calls.length).toBeGreaterThan(chamadas),
    );
    expect(result.current.games[0].scoreA).toBe(1);
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
        result.current.setPointEvents([{ id: 'p1', sessionId: 's2' } as PointEvent]);
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

  describe('sem sinal', () => {
    const ponto = (id: string) => ({ id, sessionId: 's1', gameId: 'g1' }) as PointEvent;
    let semRede: { mockRestore(): void };

    beforeEach(() => {
      semRede = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    });
    afterEach(() => {
      semRede.mockRestore();
      onlineManager.setOnline(true);
    });

    function cairSinal() {
      semRede.mockRestore();
      semRede = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
      act(() => {
        window.dispatchEvent(new Event('offline'));
      });
    }
    function voltarSinal() {
      semRede.mockRestore();
      semRede = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
      window.dispatchEvent(new Event('online'));
    }

    it('o ponto entra na fila, aparece na tela e fica guardado no aparelho', async () => {
      const { result } = render();
      await waitFor(() => expect(result.current.activeSession?.id).toBe('s1'));
      cairSinal();
      act(() => result.current.setPointEvents((prev) => [...prev, ponto('p1')]));
      await waitFor(() => expect(result.current.pointEvents.map((p) => p.id)).toEqual(['p1']));
      await waitFor(() => expect(result.current.scoreQueue.queued).toBe(true));
      expect(persistSessionBundleChanges).not.toHaveBeenCalled();
      expect(localStorage.getItem('volley.placar.u1')).toContain('p1');
    });

    it('ao voltar o sinal envia em ordem, zera e rele', async () => {
      const { result } = render();
      await waitFor(() => expect(result.current.activeSession?.id).toBe('s1'));
      cairSinal();
      act(() => result.current.setPointEvents((prev) => [...prev, ponto('p1')]));
      act(() => result.current.setPointEvents((prev) => [...prev, ponto('p2')]));
      await waitFor(() => expect(result.current.scoreQueue.pending).toBe(2));
      vi.mocked(fetchMySessions).mockResolvedValue({
        ...emptySessionBundle(),
        sessions: [emAndamento],
        pointEvents: [ponto('p1'), ponto('p2')],
      });
      act(() => voltarSinal());
      await waitFor(() => expect(result.current.scoreQueue.queued).toBe(false));
      const enviados = vi
        .mocked(persistSessionBundleChanges)
        .mock.calls.map(([, depois]) => depois.pointEvents.map((p) => p.id));
      expect(enviados).toEqual([['p1'], ['p2']]);
      expect(localStorage.getItem('volley.placar.u1')).toBeNull();
      expect(result.current.pointEvents.map((p) => p.id)).toEqual(['p1', 'p2']);
    });

    it('releitura com fila pendente nao volta o placar', async () => {
      const { result } = render();
      await waitFor(() => expect(result.current.activeSession?.id).toBe('s1'));
      cairSinal();
      act(() => result.current.setPointEvents((prev) => [...prev, ponto('p1')]));
      await waitFor(() => expect(result.current.scoreQueue.queued).toBe(true));
      await act(async () => {
        await result.current.refresh();
      });
      expect(result.current.pointEvents.map((p) => p.id)).toEqual(['p1']);
    });

    it('conflito pergunta; descartar limpa a fila e rele', async () => {
      vi.mocked(fetchLiveScoreState).mockResolvedValueOnce({
        controlledByUserId: 'u2',
        controllerName: 'Bia',
        pointIds: ['x1'],
        sessionEnded: false,
      });
      const { result } = render();
      await waitFor(() => expect(result.current.activeSession?.id).toBe('s1'));
      cairSinal();
      act(() => result.current.setPointEvents((prev) => [...prev, ponto('p1')]));
      await waitFor(() => expect(result.current.scoreQueue.queued).toBe(true));
      act(() => voltarSinal());
      await waitFor(() =>
        expect(result.current.scoreQueue.conflict).toEqual({
          takenOverBy: 'Bia',
          foreignPoints: 1,
          myPoints: 1,
          sessionEnded: false,
        }),
      );
      expect(persistSessionBundleChanges).not.toHaveBeenCalled();
      act(() => result.current.scoreQueue.discard());
      await waitFor(() => expect(result.current.scoreQueue.queued).toBe(false));
      await waitFor(() => expect(result.current.pointEvents).toEqual([]));
    });

    it('conflito; enviar mesmo assim grava os meus', async () => {
      vi.mocked(fetchLiveScoreState).mockResolvedValueOnce({
        controlledByUserId: 'u2',
        controllerName: 'Bia',
        pointIds: [],
        sessionEnded: false,
      });
      const { result } = render();
      await waitFor(() => expect(result.current.activeSession?.id).toBe('s1'));
      cairSinal();
      act(() => result.current.setPointEvents((prev) => [...prev, ponto('p1')]));
      await waitFor(() => expect(result.current.scoreQueue.queued).toBe(true));
      act(() => voltarSinal());
      await waitFor(() => expect(result.current.scoreQueue.conflict).not.toBeNull());
      act(() => result.current.scoreQueue.sendAnyway());
      await waitFor(() => expect(result.current.scoreQueue.queued).toBe(false));
      expect(persistSessionBundleChanges).toHaveBeenCalledTimes(1);
    });

    it('com fila guardada, recarregar sem sinal reabre o placar', async () => {
      const { result, unmount } = render();
      await waitFor(() => expect(result.current.activeSession?.id).toBe('s1'));
      cairSinal();
      act(() => result.current.setPointEvents((prev) => [...prev, ponto('p1')]));
      await waitFor(() => expect(localStorage.getItem('volley.placar.u1')).toContain('p1'));
      unmount();
      onlineManager.setOnline(true);
      vi.mocked(fetchMySessions).mockRejectedValue(new TypeError('Failed to fetch'));
      const outra = render();
      await waitFor(() => expect(outra.result.current.activeSession?.id).toBe('s1'));
      expect(outra.result.current.pointEvents.map((p) => p.id)).toEqual(['p1']);
    });

    it('sem sinal, mudanca que nao e do placar continua recusada', async () => {
      const { result } = render();
      await waitFor(() => expect(result.current.activeSession?.id).toBe('s1'));
      cairSinal();
      act(() =>
        result.current.setSessions((prev) => prev.map((s) => ({ ...s, status: 'finished' }))),
      );
      await waitFor(() => expect(result.current.status.offline).toBe(true));
      expect(result.current.scoreQueue.queued).toBe(false);
      expect(result.current.sessions.find((s) => s.id === 's1')?.status).not.toBe('finished');
      expect(persistSessionBundleChanges).not.toHaveBeenCalled();
    });

    it('recusa do servidor ao enviar a fila avisa, limpa a fila e rele', async () => {
      const { result } = render();
      await waitFor(() => expect(result.current.activeSession?.id).toBe('s1'));
      cairSinal();
      act(() => result.current.setPointEvents((prev) => [...prev, ponto('p1')]));
      await waitFor(() => expect(result.current.scoreQueue.queued).toBe(true));
      vi.mocked(persistSessionBundleChanges).mockRejectedValueOnce(
        Object.assign(new Error('new row violates row-level security policy'), { code: '42501' }),
      );
      const leiturasAntes = vi.mocked(fetchMySessions).mock.calls.length;
      act(() => voltarSinal());
      await waitFor(() => expect(persistSessionBundleChanges).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(result.current.scoreQueue.queued).toBe(false));
      expect(localStorage.getItem('volley.placar.u1')).toBeNull();
      expect(result.current.status.error?.kind).toBe('authorization');
      await waitFor(() =>
        expect(vi.mocked(fetchMySessions).mock.calls.length).toBeGreaterThan(leiturasAntes),
      );
    });

    it('erro 5xx ao enviar a fila nao descarta: guarda e nao avisa recusa', async () => {
      const { result } = render();
      await waitFor(() => expect(result.current.activeSession?.id).toBe('s1'));
      cairSinal();
      act(() => result.current.setPointEvents((prev) => [...prev, ponto('p1')]));
      await waitFor(() => expect(result.current.scoreQueue.queued).toBe(true));
      vi.mocked(persistSessionBundleChanges).mockRejectedValueOnce({
        code: '',
        message: 'Internal Server Error',
      });
      act(() => voltarSinal());
      await waitFor(() => expect(persistSessionBundleChanges).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(result.current.scoreQueue.sending).toBe(false));
      expect(result.current.scoreQueue.queued).toBe(true);
      expect(localStorage.getItem('volley.placar.u1')).toContain('p1');
      expect(result.current.pointEvents.map((p) => p.id)).toEqual(['p1']);
    });

    it('pelada encerrada em outro lugar: pergunta so descartar, e enviar nao faz nada', async () => {
      vi.mocked(fetchLiveScoreState).mockResolvedValueOnce({
        controlledByUserId: 'u1',
        controllerName: null,
        pointIds: [],
        sessionEnded: true,
      });
      const { result } = render();
      await waitFor(() => expect(result.current.activeSession?.id).toBe('s1'));
      cairSinal();
      act(() => result.current.setPointEvents((prev) => [...prev, ponto('p1')]));
      await waitFor(() => expect(result.current.scoreQueue.queued).toBe(true));
      act(() => voltarSinal());
      await waitFor(() => expect(result.current.scoreQueue.conflict?.sessionEnded).toBe(true));
      act(() => result.current.scoreQueue.sendAnyway());
      await new Promise((r) => setTimeout(r, 30));
      expect(persistSessionBundleChanges).not.toHaveBeenCalled();
      expect(result.current.scoreQueue.conflict?.sessionEnded).toBe(true);
      expect(result.current.scoreQueue.queued).toBe(true);
      act(() => result.current.scoreQueue.discard());
      await waitFor(() => expect(result.current.scoreQueue.queued).toBe(false));
      expect(persistSessionBundleChanges).not.toHaveBeenCalled();
    });

    it('reabrir com sinal so envia depois que as comunidades chegam', async () => {
      const comComunidade = { ...emAndamento, communityId: 'c1' };
      vi.mocked(fetchMySessions).mockResolvedValue({
        ...emptySessionBundle(),
        sessions: [comComunidade],
      });
      const primeira = render();
      await waitFor(() => expect(primeira.result.current.activeSession?.id).toBe('s1'));
      cairSinal();
      act(() => primeira.result.current.setPointEvents((prev) => [...prev, ponto('p1')]));
      await waitFor(() => expect(localStorage.getItem('volley.placar.u1')).toContain('p1'));
      primeira.unmount();

      let entregar: (lista: Community[]) => void = () => {};
      vi.mocked(fetchMyCommunities).mockImplementation(
        () =>
          new Promise<Community[]>((resolve) => {
            entregar = resolve;
          }),
      );
      const vistos: (string | null)[] = [];
      vi.mocked(persistSessionBundleChanges).mockImplementation(async (_a, _b, contexto) => {
        vistos.push(contexto.communityCloudId('c1'));
      });
      voltarSinal();
      onlineManager.setOnline(true);
      const outra = render();
      await new Promise((r) => setTimeout(r, 50));
      expect(persistSessionBundleChanges).not.toHaveBeenCalled();
      await act(async () => {
        entregar([{ id: 'c1', cloudId: 'nuvem-c1' } as Community]);
      });
      await waitFor(() => expect(outra.result.current.scoreQueue.queued).toBe(false));
      expect(vistos).toEqual(['nuvem-c1']);
    });

    it('reabrir com sinal e falhar ao ler as comunidades guarda a fila', async () => {
      const primeira = render();
      await waitFor(() => expect(primeira.result.current.activeSession?.id).toBe('s1'));
      cairSinal();
      act(() => primeira.result.current.setPointEvents((prev) => [...prev, ponto('p1')]));
      await waitFor(() => expect(localStorage.getItem('volley.placar.u1')).toContain('p1'));
      primeira.unmount();

      vi.mocked(fetchMyCommunities).mockRejectedValue({ code: '', message: 'Bad Gateway' });
      voltarSinal();
      onlineManager.setOnline(true);
      const outra = render();
      await waitFor(() => expect(outra.result.current.scoreQueue.queued).toBe(true));
      await new Promise((r) => setTimeout(r, 50));
      await waitFor(() => expect(outra.result.current.scoreQueue.sending).toBe(false));
      expect(persistSessionBundleChanges).not.toHaveBeenCalled();
      expect(localStorage.getItem('volley.placar.u1')).toContain('p1');
    });
  });
});
