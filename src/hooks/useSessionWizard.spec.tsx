import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BalanceResponse, BalanceRequest } from '../logic/balancerMessages';
import { fromLocalSnapshots } from '../application/teamFormationAdapters';
import { mapPlayersToBalanceSnapshots } from '../logic/balancingCompatibility';
import { makePlayer, makeSession } from '../test/fixtures';
import type { Community, Player, Session } from '../types';
import { useSessionWizard } from './useSessionWizard';

const fallbackControl = vi.hoisted(() => ({ error: null as Error | null }));
const chain = vi.hoisted(() => ({ prepare: vi.fn() }));

vi.mock('../application/authorizedTeamFormationUseCases', () => ({
  prepareAuthorizedTeamFormation: chain.prepare,
}));

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

function renderWizard(
  activeSession: Session,
  players: Player[],
  extra: { communities?: Community[]; setActiveSession?: (session: Session | null) => void } = {},
) {
  return renderHook(() =>
    useSessionWizard({
      players,
      activeSession,
      communities: extra.communities,
      setActiveSession: extra.setActiveSession ?? vi.fn(),
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

describe('useSessionWizard synchronous fallback (no Worker global)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(Math, 'random').mockReturnValue(0.123);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    fallbackControl.error = null;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('encerra a geracao sincrona com mensagem quando o precheck recusa, em vez de girar para sempre', () => {
    const players = ['a', 'b'].map((id) => makePlayer(id));
    const activeSession = makeSession('session-1', {
      selectedPlayerIds: players.map((player) => player.id),
      config: {
        ...makeSession('config-source').config!,
        teamCount: 2,
        balanceConstraints: { lockedPlayerIdxs: { a: 5 } },
      },
    });
    const { result } = renderWizard(activeSession, players);

    expect(() => {
      act(() => result.current.generateDivisions());
    }).not.toThrow();

    expect(result.current.isGenerating).toBe(false);
    expect(result.current.validationErrors.generation).toBeDefined();
    expect(result.current.bestDivisions).toEqual([]);
  });
});

const COMMUNITY: Community = {
  id: 'community-1',
  name: 'Pelada',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  cloudId: '11111111-1111-4111-8111-111111111111',
};

function syncedPlayers(): Player[] {
  return ['a', 'b', 'c', 'd'].map((id) =>
    makePlayer(id, { cloudId: `cloud-${id}`, communityIds: ['community-1'] }),
  );
}

function communitySession(players: Player[]): Session {
  return makeSession('session-1', {
    communityId: 'community-1',
    selectedPlayerIds: players.map((player) => player.id),
    config: { ...makeSession('config-source').config!, balanceSpeed: 'fast' },
  });
}

function authorizedRequest(players: readonly Player[]) {
  return {
    ...fromLocalSnapshots({
      snapshots: mapPlayersToBalanceSnapshots([...players], {}),
      teamCount: 2,
    }),
    provenance: {
      kind: 'AUTHORIZED_SNAPSHOT' as const,
      snapshotId: 'snap',
      inputFingerprint: 'fp',
    },
  };
}

describe('useSessionWizard authorized formation', () => {
  beforeEach(() => {
    localStorage.clear();
    FakeWorker.instances = [];
    vi.stubGlobal('Worker', FakeWorker);
    vi.spyOn(Math, 'random').mockReturnValue(0.123);
    fallbackControl.error = null;
    chain.prepare.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('keeps a local Session on the synchronous path without calling the chain', () => {
    const players = ['a', 'b', 'c', 'd'].map((id) => makePlayer(id));
    const session = makeSession('session-1', {
      selectedPlayerIds: players.map((player) => player.id),
      config: { ...makeSession('config-source').config!, balanceSpeed: 'fast' },
    });
    const { result } = renderWizard(session, players, { communities: [COMMUNITY] });

    act(() => result.current.generateDivisions());

    expect(FakeWorker.instances[0].postedMessages).toHaveLength(1);
    expect(chain.prepare).not.toHaveBeenCalled();
    expect(result.current.authorizedDraw).toBeNull();
  });

  it('draws a synced Community Session from the authorized request', async () => {
    const players = syncedPlayers();
    const setActiveSession = vi.fn();
    chain.prepare.mockImplementation(async (input) => {
      input.onStage?.('roster');
      return {
        session: { ...input.session, cloudId: 'session-1', authorityModel: 'target' },
        result: {
          ok: true,
          value: {
            request: authorizedRequest(input.players),
            estimatedCount: 4,
            participantCount: 4,
          },
        },
      };
    });
    const { result } = renderWizard(communitySession(players), players, {
      communities: [COMMUNITY],
      setActiveSession,
    });

    await act(async () => {
      result.current.generateDivisions();
    });

    expect(chain.prepare).toHaveBeenCalledTimes(1);
    expect(chain.prepare.mock.calls[0][0].communityCloudId).toBe(COMMUNITY.cloudId);
    const posted = FakeWorker.instances[0].postedMessages[0];
    expect(posted.request.provenance.kind).toBe('AUTHORIZED_SNAPSHOT');
    expect(result.current.authorizedDraw).toEqual({ estimatedCount: 4, participantCount: 4 });
    expect(result.current.generationStage).toBeNull();
    expect(setActiveSession).toHaveBeenCalled();
  });

  it('shows the chain error and starts no Worker', async () => {
    const players = syncedPlayers();
    chain.prepare.mockImplementation(async (input) => ({
      session: input.session,
      result: {
        ok: false,
        error: {
          kind: 'product',
          code: 'permission_denied',
          message:
            'Só dono, admin, moderador ou Organizador desta comunidade podem gerar os times.',
          recoverable: false,
        },
      },
    }));
    const { result } = renderWizard(communitySession(players), players, {
      communities: [COMMUNITY],
    });

    await act(async () => {
      result.current.generateDivisions();
    });

    expect(FakeWorker.instances).toHaveLength(0);
    expect(result.current.isGenerating).toBe(false);
    expect(result.current.validationErrors.generation).toBe(
      'Só dono, admin, moderador ou Organizador desta comunidade podem gerar os times.',
    );
  });

  it('refuses an unsynced Player before calling the chain', async () => {
    const players = [
      ...syncedPlayers().slice(0, 3),
      makePlayer('d', { communityIds: ['community-1'] }),
    ];
    const { result } = renderWizard(communitySession(players), players, {
      communities: [COMMUNITY],
    });

    await act(async () => {
      result.current.generateDivisions();
    });

    expect(chain.prepare).not.toHaveBeenCalled();
    expect(result.current.validationErrors.generation).toBe(
      'Sincronize antes de gerar os times: Atleta d ainda não estão na nuvem.',
    );
  });

  it('cancelling while preparing starts no Worker even if the chain later succeeds', async () => {
    const players = syncedPlayers();
    let resolve!: (value: unknown) => void;
    chain.prepare.mockImplementation(
      (input) =>
        new Promise((done) => {
          resolve = () =>
            done({
              session: input.session,
              result: {
                ok: true,
                value: {
                  request: authorizedRequest(input.players),
                  estimatedCount: 0,
                  participantCount: 4,
                },
              },
            });
        }),
    );
    const { result } = renderWizard(communitySession(players), players, {
      communities: [COMMUNITY],
    });

    act(() => result.current.generateDivisions());
    expect(result.current.isGenerating).toBe(true);
    act(() => result.current.cancelGeneration());
    await act(async () => {
      resolve(undefined);
    });

    expect(FakeWorker.instances).toHaveLength(0);
    expect(result.current.isGenerating).toBe(false);
    expect(result.current.generationStage).toBeNull();
  });
});
