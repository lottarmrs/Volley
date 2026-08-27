import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BalanceResponse, BalanceRequest } from '../logic/balancerMessages';
import { makePlayer, makeSession } from '../test/fixtures';
import type { Player, Session } from '../types';
import { useSessionWizard } from './useSessionWizard';

const fallbackControl = vi.hoisted(() => ({ error: null as Error | null }));

vi.mock('../application/sessionLifecycleUseCases', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../application/sessionLifecycleUseCases')>();
  return {
    ...actual,
    buildDivisionFallbackBalanceResult: (
      ...args: Parameters<typeof actual.buildDivisionFallbackBalanceResult>
    ) => {
      if (fallbackControl.error) throw fallbackControl.error;
      return actual.buildDivisionFallbackBalanceResult(...args);
    },
  };
});

class FakeWorker {
  static instances: FakeWorker[] = [];

  onmessage: ((event: MessageEvent<BalanceResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  postedMessages: BalanceRequest[] = [];
  terminated = false;

  constructor() {
    FakeWorker.instances.push(this);
  }

  postMessage(message: BalanceRequest) {
    this.postedMessages.push(message);
  }

  terminate() {
    this.terminated = true;
  }

  emitMessage(message: BalanceResponse) {
    this.onmessage?.({ data: message } as MessageEvent<BalanceResponse>);
  }
}

function renderWizard(activeSession: Session, players: Player[]) {
  return renderHook(() =>
    useSessionWizard({
      players,
      activeSession,
      setActiveSession: vi.fn(),
      setSessions: vi.fn(),
      setTeams: vi.fn(),
      games: [],
      setGames: vi.fn(),
      setPage: vi.fn(),
      sessions: [],
      teams: [],
    }),
  );
}

describe('useSessionWizard division generation failures', () => {
  beforeEach(() => {
    localStorage.clear();
    FakeWorker.instances = [];
    vi.stubGlobal('Worker', FakeWorker);
    vi.spyOn(Math, 'random').mockReturnValue(0.123);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    fallbackControl.error = null;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('encerra a geração inviável e expõe a mensagem sem repetir o request no fallback', () => {
    const players = ['a', 'b', 'c', 'd'].map((id) => makePlayer(id));
    const activeSession = makeSession('session-1', {
      selectedPlayerIds: players.map((player) => player.id),
      config: {
        ...makeSession('config-source').config!,
        balanceSpeed: 'fast',
        balanceConstraints: {
          lockedPlayerIdxs: { a: 0, b: 1 },
          pairsTogether: [['a', 'b']],
        },
      },
    });
    const { result } = renderWizard(activeSession, players);

    act(() => result.current.generateDivisions());
    const worker = FakeWorker.instances[0];
    expect(worker.postedMessages).toHaveLength(1);
    expect(result.current.isGenerating).toBe(true);

    expect(() => {
      act(() =>
        worker.emitMessage({
          type: 'error',
          code: 'INFEASIBLE_CONSTRAINTS',
          message: 'Não existe solução viável para as restrições obrigatórias.',
        }),
      );
    }).not.toThrow();

    expect(worker.terminated).toBe(true);
    expect(worker.postedMessages).toHaveLength(1);
    expect(result.current.isGenerating).toBe(false);
    expect(result.current.validationErrors.generation).toBe(
      'Não existe solução viável para as restrições obrigatórias.',
    );
    expect(result.current.bestDivisions).toEqual([]);
  });

  it('preserva o fallback síncrono para erro técnico recuperável do Worker', () => {
    const players = ['a', 'b', 'c', 'd'].map((id) => makePlayer(id));
    const activeSession = makeSession('session-1', {
      selectedPlayerIds: players.map((player) => player.id),
      config: {
        ...makeSession('config-source').config!,
        balanceSpeed: 'fast',
      },
    });
    const { result } = renderWizard(activeSession, players);

    act(() => result.current.generateDivisions());
    const worker = FakeWorker.instances[0];
    act(() =>
      worker.emitMessage({
        type: 'error',
        code: 'TECHNICAL_ERROR',
        message: 'Falha técnica temporária.',
      }),
    );

    expect(worker.terminated).toBe(true);
    expect(result.current.isGenerating).toBe(false);
    expect(result.current.validationErrors.generation).toBeUndefined();
    expect(result.current.bestDivisions.length).toBeGreaterThan(0);
  });

  it('encerra com mensagem em português quando o Worker e o fallback técnico falham', () => {
    const players = ['a', 'b', 'c', 'd'].map((id) => makePlayer(id));
    const activeSession = makeSession('session-1', {
      selectedPlayerIds: players.map((player) => player.id),
      config: {
        ...makeSession('config-source').config!,
        balanceSpeed: 'fast',
      },
    });
    const { result } = renderWizard(activeSession, players);

    act(() => result.current.generateDivisions());
    const worker = FakeWorker.instances[0];
    fallbackControl.error = new Error('Falha síncrona inesperada.');

    expect(() => {
      act(() =>
        worker.emitMessage({
          type: 'error',
          code: 'TECHNICAL_ERROR',
          message: 'Falha técnica temporária.',
        }),
      );
    }).not.toThrow();

    expect(worker.terminated).toBe(true);
    expect(result.current.isGenerating).toBe(false);
    expect(result.current.validationErrors.generation).toBe(
      'Não foi possível gerar os times. Tente novamente.',
    );
    expect(result.current.bestDivisions).toEqual([]);
  });

  it('limpa o erro de inviabilidade ao tentar novamente e concluir pelo fallback', () => {
    const players = ['a', 'b', 'c', 'd'].map((id) => makePlayer(id));
    const activeSession = makeSession('session-1', {
      selectedPlayerIds: players.map((player) => player.id),
      config: {
        ...makeSession('config-source').config!,
        balanceSpeed: 'fast',
      },
    });
    const { result } = renderWizard(activeSession, players);

    act(() => result.current.generateDivisions());
    act(() =>
      FakeWorker.instances[0].emitMessage({
        type: 'error',
        code: 'INFEASIBLE_CONSTRAINTS',
        message: 'Não existe solução viável para as restrições obrigatórias.',
      }),
    );
    expect(result.current.validationErrors.generation).toBeDefined();

    act(() => result.current.generateDivisions());
    expect(result.current.validationErrors.generation).toBeUndefined();

    act(() =>
      FakeWorker.instances[1].emitMessage({
        type: 'error',
        code: 'TECHNICAL_ERROR',
        message: 'Falha técnica temporária.',
      }),
    );
    expect(result.current.isGenerating).toBe(false);
    expect(result.current.validationErrors.generation).toBeUndefined();
    expect(result.current.bestDivisions.length).toBeGreaterThan(0);
  });
});
