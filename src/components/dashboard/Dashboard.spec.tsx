import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Dashboard } from './Dashboard';
import type { DashboardModel } from '@app/screens/dashboard/dashboardModel';

function createMockContract(modelOverrides: Partial<DashboardModel> = {}) {
  const model: DashboardModel = {
    activeSession: null,
    sessionDraft: null,
    games: [],
    ...modelOverrides,
  };
  const dispatch = vi.fn();
  return { contract: { model, dispatch }, dispatch };
}

describe('Dashboard', () => {
  it('renders hero title and nova sessao button', () => {
    const { contract, dispatch } = createMockContract();
    render(<Dashboard contract={contract} />);

    expect(screen.getByRole('heading', { name: /bem-vindo ao panelinha/i })).toBeDefined();

    const newSessionBtn = screen.getByRole('button', { name: /nova sessão/i });
    expect(newSessionBtn).toBeDefined();

    fireEvent.click(newSessionBtn);
    expect(dispatch).toHaveBeenCalledWith({ kind: 'newSession' });
  });

  it('renders active session alert when a session is active', () => {
    const { contract, dispatch } = createMockContract({
      activeSession: {
        id: 's1',
        name: 'Pelada de Quarta',
        type: 'free_play',
        date: '2026-08-19',
        communityId: 'c1',
        status: 'active',
        selectedPlayerIds: [],
        teamIds: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    });
    render(<Dashboard contract={contract} />);

    expect(screen.getByText('Pelada de Quarta')).toBeDefined();

    const continueBtn = screen.getByRole('button', { name: /continuar partida/i });
    fireEvent.click(continueBtn);
    expect(dispatch).toHaveBeenCalledWith({ kind: 'resumeSession' });
  });

  it('renders draft alert when a draft exists without active session', () => {
    const { contract, dispatch } = createMockContract({
      sessionDraft: {
        session: {
          id: 'd1',
          name: 'Rascunho de Pelada',
          type: 'free_play',
          date: '2026-08-19',
          communityId: 'c1',
          status: 'draft',
          selectedPlayerIds: [],
          teamIds: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        wizardStep: 1,
        bestDivisions: [],
        selectedDivisionIndex: 0,
        updatedAt: new Date().toISOString(),
      },
    });
    render(<Dashboard contract={contract} />);

    expect(screen.getByText('Rascunho Salvo')).toBeDefined();

    const resumeDraftBtn = screen.getByRole('button', { name: /continuar rascunho/i });
    fireEvent.click(resumeDraftBtn);
    expect(dispatch).toHaveBeenCalledWith({
      kind: 'resumeDraft',
      draft: expect.anything(),
    });
  });
});
