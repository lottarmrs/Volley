import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Community, Player } from '@shared/types';
import { makePlayer } from '../../test/fixtures';

const shell = vi.hoisted(() => ({ current: null as unknown as Record<string, unknown> }));
const fluxo = vi.hoisted(() => ({ startQuickPelada: vi.fn() }));

vi.mock('../shellContext', () => ({
  useShell: () => shell.current,
  useCommunityShell: () => shell.current,
}));

vi.mock('@hooks/useCommunitiesWithCapability', () => ({
  useCommunitiesWithCapability: (communities: Community[]) => ({
    allowedIds: new Set(communities.map((item) => item.id)),
    pending: false,
  }),
}));

vi.mock('@app/peladaFlowUseCases', () => ({ startQuickPelada: fluxo.startQuickPelada }));

import { QuickStartRoute } from './onboardingRoutes';

const COMUNIDADE: Community = {
  id: 'c1',
  cloudId: 'cloud-c1',
  name: 'Terça Forte',
  createdAt: '',
  updatedAt: '',
};

const ELENCO: Player[] = ['Rafa', 'Bia', 'Gus'].map((nome, i) =>
  makePlayer(`p${i + 1}`, { nome, apelido: nome, cloudId: `cp${i + 1}`, communityIds: ['c1'] }),
);

const addPlayersAndWait = vi.fn();
const refresh = vi.fn();

function montar(communities: Community[]) {
  shell.current = {
    comm: { communities, status: { loading: false } },
    play: { players: ELENCO, addPlayersAndWait },
    communityRules: { getRules: () => ({ defaultFormat: 'tournament' }) },
    sess: { online: true, refresh },
    toasts: { push: vi.fn() },
  };
  render(
    <MemoryRouter initialEntries={['/comecar']}>
      <Routes>
        <Route path="/comecar" element={<QuickStartRoute />} />
        <Route path="/comunidades" element={<p>Comunidades</p>} />
        <Route
          path="/comunidades/:communityId/sessoes/:sessionId/sortear"
          element={<p>Sortear</p>}
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe('pelada rápida com conta', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    addPlayersAndWait.mockImplementation(async (novos: Player[]) => ({
      ok: true,
      value: novos.map((player) => ({ ...player, cloudId: `nuvem-${player.nome}` })),
    }));
    fluxo.startQuickPelada.mockResolvedValue({
      ok: true,
      value: { sessionId: 's9', windowId: 'w9' },
    });
  });

  it('sem comunidade para organizar, manda criar ou entrar numa', async () => {
    montar([]);
    expect(await screen.findByText('Comunidades')).toBeTruthy();
  });

  it('salva os novos antes e cria a pelada com todos, depois vai sortear', async () => {
    montar([COMUNIDADE]);
    for (const nome of ['Rafa', 'Bia', 'Gus']) {
      fireEvent.click(await screen.findByRole('checkbox', { name: nome }));
    }
    fireEvent.click(screen.getByRole('button', { name: /colar lista do whatsapp/i }));
    fireEvent.change(screen.getByRole('textbox', { name: /lista colada/i }), {
      target: { value: 'Joana\nKiko\nLeo' },
    });
    fireEvent.click(screen.getByRole('button', { name: /usar esta lista/i }));
    fireEvent.click(screen.getByRole('button', { name: /sortear os times/i }));

    await screen.findByText('Sortear');
    expect(addPlayersAndWait.mock.calls[0][0].map((p: Player) => p.nome)).toEqual([
      'Joana',
      'Kiko',
      'Leo',
    ]);
    expect(fluxo.startQuickPelada).toHaveBeenCalledWith(
      expect.objectContaining({
        communityCloudId: 'cloud-c1',
        playerCloudIds: ['cp1', 'cp2', 'cp3', 'nuvem-Joana', 'nuvem-Kiko', 'nuvem-Leo'],
        type: 'tournament',
      }),
    );
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });
});
