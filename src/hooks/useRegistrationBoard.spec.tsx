import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RegistrationBoard } from '../types';
import { makeSession } from '../test/fixtures';
import { useRegistrationBoard } from './useRegistrationBoard';

const casos = vi.hoisted(() => ({
  readSessionBoard: vi.fn(),
  join: vi.fn(),
  leave: vi.fn(),
  open: vi.fn(),
}));

vi.mock('../application/registrationUseCases', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../application/registrationUseCases')>();
  return {
    ...actual,
    defaultRegistrationBoardGateway: {
      ...actual.defaultRegistrationBoardGateway,
      readSessionBoard: casos.readSessionBoard,
    },
    joinRegistration: casos.join,
    leaveRegistration: casos.leave,
    openRegistration: casos.open,
  };
});

const quadro: RegistrationBoard = {
  windowId: 'w-1',
  sessionId: 'cloud-session',
  status: 'OPEN',
  revision: 2,
  capacity: 12,
  confirmedCount: 1,
  waitlistedCount: 0,
  viewerCanManage: false,
  viewerPlayerId: 'p-1',
  viewerEntryStatus: null,
  viewerQueuePosition: null,
  entries: [],
};

function render(sessionOverrides = {}) {
  const session = makeSession('session-1', {
    communityId: 'community-1',
    cloudId: 'cloud-session',
    authorityModel: 'target',
    ...sessionOverrides,
  });
  return renderHook(() =>
    useRegistrationBoard({
      session,
      communityCloudId: 'cloud-community',
      defaultCapacity: 12,
    }),
  );
}

describe('useRegistrationBoard', () => {
  beforeEach(() => {
    casos.readSessionBoard.mockReset();
    casos.join.mockReset();
    casos.leave.mockReset();
    casos.open.mockReset();
    casos.readSessionBoard.mockResolvedValue(quadro);
  });

  it('carrega o quadro da sessão ao montar', async () => {
    const { result } = render();
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.board?.windowId).toBe('w-1');
    expect(casos.readSessionBoard).toHaveBeenCalledWith('cloud-session');
  });

  it('inscrever-se troca o quadro pelo que o servidor devolveu', async () => {
    casos.join.mockResolvedValue({
      ok: true,
      value: { ...quadro, viewerEntryStatus: 'WAITLISTED', viewerQueuePosition: 2 },
    });
    const { result } = render();
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.join();
    });

    expect(result.current.board?.viewerEntryStatus).toBe('WAITLISTED');
    expect(result.current.board?.viewerQueuePosition).toBe(2);
    expect(result.current.error).toBeNull();
  });

  it('repetir a ação depois de um erro reenvia o mesmo comando', async () => {
    casos.join
      .mockResolvedValueOnce({
        ok: false,
        error: { kind: 'technical', message: 'Sem conexão.', recoverable: true },
      })
      .mockResolvedValueOnce({ ok: true, value: quadro });
    const { result } = render();
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.join();
    });
    expect(result.current.error).toBe('Sem conexão.');

    await act(async () => {
      await result.current.join();
    });
    expect(result.current.error).toBeNull();
    expect(casos.join.mock.calls[0][0].commandId).toBe(casos.join.mock.calls[1][0].commandId);
  });

  it('sem sessão na nuvem, não tenta ler', async () => {
    casos.readSessionBoard.mockClear();
    const { result } = render({ cloudId: undefined, authorityModel: 'legacy' });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(casos.readSessionBoard).not.toHaveBeenCalled();
    expect(result.current.board).toBeNull();
  });
});
