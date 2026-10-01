import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Community, Division, Player, RegistrationBoard, Session } from '@shared/types';
import { makeFreePlayConfig, makePlayer, makeSession, makeTeam } from '../../test/fixtures';
import { loadPeladaDrawDraft, peladaDrawDraftStore } from '@logic/sessionDraft';

const shell = vi.hoisted(() => ({
  current: null as unknown as Record<string, unknown>,
}));
const quadro = vi.hoisted(() => ({ board: null as unknown }));

vi.mock('../shellContext', () => ({
  useShell: () => shell.current,
  useCommunityShell: () => shell.current,
}));

vi.mock('../../hooks/useRegistrationBoard', () => ({
  useRegistrationBoard: () => ({ board: quadro.board, loading: false }),
}));

vi.mock('../../hooks/useCommunityPermissions', () => ({
  useCommunityPermissions: () => ({ canEditPlayerProfile: true }),
}));

import { CommunityDrawRoute } from './CommunityDrawRoute';

const COMUNIDADE: Community = {
  id: 'c-1',
  cloudId: 'cloud-1',
  name: 'Terça Forte',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const ELENCO: Player[] = Array.from({ length: 11 }, (_, i) =>
  makePlayer(`p${i + 1}`, {
    nome: `Atleta ${i + 1}`,
    cloudId: `cp${i + 1}`,
    communityIds: ['c-1'],
  }),
);

const CONFIRMADOS = ELENCO.slice(0, 10).map((p) => p.id);

const PELADA: Session = makeSession('s-1', {
  cloudId: 'cloud-s1',
  communityId: 'c-1',
  name: 'Terça Forte · sex 02/10',
  date: '2026-10-02',
  status: 'draft',
  type: 'free_play',
  selectedPlayerIds: [],
  teamIds: [],
  config: makeFreePlayConfig(),
});

const DIVISAO: Division = {
  teams: [
    makeTeam('t1', 's-1', ['p1', 'p2', 'p3', 'p4', 'p5']),
    makeTeam('t2', 's-1', ['p6', 'p7', 'p8', 'p9', 'p10']),
  ],
  penalty: 1,
  score: 90,
};

function listaFechada(): RegistrationBoard {
  return {
    windowId: 'w1',
    sessionId: 'cloud-s1',
    sessionName: null,
    sessionDate: null,
    sessionLifecycleStatus: 'DRAFT',
    status: 'LOCKED',
    revision: 1,
    capacity: 12,
    confirmedCount: 10,
    waitlistedCount: 1,
    paymentDueAt: null,
    paidCount: 0,
    viewerCanManage: true,
    viewerPlayerId: null,
    viewerEntryStatus: null,
    viewerQueuePosition: null,
    viewerPaidAt: null,
    pendingDeadlineCut: null,
    entries: ELENCO.map((p, i) => ({
      playerId: p.cloudId,
      status: i < 10 ? 'CONFIRMED' : 'WAITLISTED',
    })),
  } as unknown as RegistrationBoard;
}

const ordem: string[] = [];
const setSessions = vi.fn((_: unknown) => ordem.push('sessions'));
const setTeams = vi.fn((_: unknown) => ordem.push('teams'));
const setGames = vi.fn((_: unknown) => ordem.push('games'));
const setActiveSession = vi.fn();

function montar() {
  shell.current = {
    community: COMUNIDADE,
    comm: { communities: [COMUNIDADE] },
    play: { players: ELENCO },
    sess: {
      sessions: [PELADA],
      teams: [],
      games: [],
      setSessions,
      setTeams,
      setGames,
      setActiveSession,
    },
    applyGuestPlayer: vi.fn(),
    reactivateGuestPlayerForSession: vi.fn(),
  };
  return render(
    <MemoryRouter initialEntries={['/comunidades/c-1/sessoes/s-1/sortear']}>
      <Routes>
        <Route
          path="/comunidades/:communityId/sessoes/:sessionId/sortear"
          element={<CommunityDrawRoute />}
        />
        <Route path="/comunidades/:communityId/sessoes/ativa" element={<p>Placar</p>} />
        <Route
          path="/comunidades/:communityId/sessoes/:sessionId/inscricao"
          element={<p>Pelada</p>}
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe('sortear a pelada', () => {
  beforeEach(() => {
    quadro.board = listaFechada();
    ordem.length = 0;
    vi.clearAllMocks();
  });
  afterEach(() => localStorage.clear());

  it('parte dos confirmados, sem o passo de atletas, e guarda o rascunho da pelada', () => {
    montar();
    expect(screen.getByRole('heading', { name: /sortear · terça forte/i })).toBeTruthy();
    expect(screen.queryByText('Atletas')).toBeNull();
    expect(setActiveSession).not.toHaveBeenCalled();

    const rascunho = loadPeladaDrawDraft('s-1');
    expect(rascunho?.wizardStep).toBe(2);
    expect(rascunho?.session.selectedPlayerIds).toEqual(CONFIRMADOS);
    expect(rascunho?.session.authorizedFormation?.windowId).toBe('w1');
  });

  it('voltar do formato leva para a tela da pelada', () => {
    montar();
    fireEvent.click(screen.getByRole('button', { name: /voltar para a pelada/i }));
    expect(screen.getByText('Pelada')).toBeTruthy();
  });

  it('o rascunho volta depois de recarregar e começar grava os times antes da pelada', () => {
    peladaDrawDraftStore('s-1').save({
      session: { ...PELADA, selectedPlayerIds: CONFIRMADOS },
      wizardStep: 5,
      bestDivisions: [DIVISAO],
      selectedDivisionIndex: 0,
      updatedAt: '',
    });
    montar();

    fireEvent.click(screen.getByRole('button', { name: /começar a pelada/i }));

    expect(ordem).toEqual(['teams', 'games', 'sessions']);
    const gravadas = setSessions.mock.calls[0][0] as Session[];
    expect(gravadas.find((s) => s.id === 's-1')?.status).toBe('active');
    expect(setActiveSession).toHaveBeenCalledWith(expect.objectContaining({ status: 'active' }));
    expect(screen.getByText('Placar')).toBeTruthy();
    expect(loadPeladaDrawDraft('s-1')).toBeNull();
  });
});
