import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CommunityEvaluationRosterEntry } from '@shared/types';
import {
  loadCommunityEvaluationEditor,
  loadCommunityEvaluationRoster,
  submitCommunityEvaluation,
} from '@app/communityEvaluationUseCases';
import { CommunityEvaluationPlayerRoute, CommunityEvaluationRoute } from './evaluationRoutes';

vi.mock('@app/communityEvaluationUseCases', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@app/communityEvaluationUseCases')>()),
  loadCommunityEvaluationRoster: vi.fn(),
  loadCommunityEvaluationEditor: vi.fn(),
  submitCommunityEvaluation: vi.fn(),
}));

const { capabilitiesMock } = vi.hoisted(() => ({ capabilitiesMock: vi.fn() }));
vi.mock('../../hooks/useCommunityCapabilities', () => ({
  useCommunityCapabilities: capabilitiesMock,
}));
vi.mock('../../hooks/useCommunityPermissions', () => ({
  useCommunityPermissions: () => ({ canManageMembers: true }),
}));
vi.mock('../shellContext', () => ({
  useCommunityShell: () => ({
    community: { id: 'c1', cloudId: 'cloud-1', name: 'Terça' },
    auth: { user: { id: 'u1' } },
  }),
}));

const entry = (
  playerId: string,
  name: string,
  evaluated = false,
): CommunityEvaluationRosterEntry => ({
  playerId,
  name,
  nickname: null,
  position: null,
  hasAccount: true,
  myLastEvaluatedAt: evaluated ? '2026-09-25T10:00:00Z' : null,
  isSelf: false,
});

function Onde() {
  return <p data-testid="onde">{useLocation().pathname}</p>;
}

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/comunidades/c1" element={<p>Visão geral</p>} />
        <Route path="/comunidades/c1/avaliacao" element={<CommunityEvaluationRoute />} />
        <Route
          path="/comunidades/c1/avaliacao/:playerId"
          element={<CommunityEvaluationPlayerRoute />}
        />
      </Routes>
      <Onde />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  capabilitiesMock.mockReturnValue({ capabilities: new Set(['player.evaluate']), resolved: true });
  vi.mocked(loadCommunityEvaluationEditor).mockImplementation(async (_c, playerId) => ({
    ok: true,
    value: {
      community_id: 'cloud-1',
      player_id: playerId,
      authority_model: 'target',
      can_evaluate: true,
      can_manage_evaluators: false,
      rubric_version: 'v0-legacy-11',
      own_evaluation: null,
      members: [],
    },
  }));
  vi.mocked(submitCommunityEvaluation).mockResolvedValue({ ok: true, value: undefined });
});

describe('rotas da Avaliação', () => {
  it('sem a capacidade, volta para a visão geral', async () => {
    capabilitiesMock.mockReturnValue({ capabilities: new Set(), resolved: true });
    vi.mocked(loadCommunityEvaluationRoster).mockResolvedValue({ ok: true, value: [] });
    renderAt('/comunidades/c1/avaliacao');
    expect(await screen.findByText('Visão geral')).toBeTruthy();
  });

  it('salvar leva ao proximo pendente e, no fim da fila, volta a lista sem repetir ninguem', async () => {
    const estados = [
      [entry('a', 'Ana'), entry('b', 'Bia')],
      [entry('a', 'Ana', true), entry('b', 'Bia')],
    ];
    vi.mocked(loadCommunityEvaluationRoster).mockImplementation(async () => ({
      ok: true,
      value: estados.shift() ?? [entry('a', 'Ana', true), entry('b', 'Bia', true)],
    }));

    renderAt('/comunidades/c1/avaliacao/a');
    const salvar = await screen.findByRole('button', { name: 'Salvar · próximo: Bia' });
    fireEvent.change(screen.getByLabelText('Saque'), { target: { value: '6' } });
    fireEvent.click(salvar);

    await waitFor(() =>
      expect(screen.getByTestId('onde').textContent).toBe('/comunidades/c1/avaliacao/b'),
    );
    expect(await screen.findByText('Avaliação de Ana salva.')).toBeTruthy();

    const ultimo = await screen.findByRole('button', { name: 'Salvar' });
    fireEvent.change(await screen.findByLabelText('Saque'), { target: { value: '7' } });
    fireEvent.click(ultimo);

    await waitFor(() =>
      expect(screen.getByTestId('onde').textContent).toBe('/comunidades/c1/avaliacao'),
    );
    expect(await screen.findByText('Avaliação de Bia salva.')).toBeTruthy();
  });
});
