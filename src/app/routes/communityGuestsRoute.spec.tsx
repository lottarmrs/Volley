import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type { Community, Player } from '@shared/types';
import type { CommunityPermissions } from '@domain/communityPermissions';

const { permissionsMock, elenco } = vi.hoisted(() => ({
  permissionsMock: vi.fn(),
  elenco: { loading: false, readError: null },
}));
vi.mock('../../hooks/useCommunityPermissions', () => ({
  useCommunityPermissions: permissionsMock,
}));

const community: Community = {
  id: 'c1',
  cloudId: 'cloud-1',
  name: 'Terça',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const guestPlayer: Player = {
  id: 'g1',
  nome: 'Zé',
  apelido: 'Zé',
  genero: 'M',
  ativo: true,
  posicaoPrincipal: 'ponteiro',
  posicoesSecundarias: [],
  maoDominante: 'direita',
  alturaCm: 180,
  atributos: {
    saque: 5,
    recepcao: 5,
    levantamento: 5,
    ataque: 5,
    bloqueio: 5,
    defesa: 5,
    velocidade: 5,
    resistencia: 5,
    leituraDeJogo: 5,
    regularidade: 5,
    controleEmocional: 5,
  },
  perfil: {
    nivel: 1,
    classe: 'Atleta',
    arquetipo: 'Versátil',
    especialidade: 'Teste',
    fraqueza: 'Teste',
  },
  formaAtual: { valor: 0, observacao: '', ultimasPartidas: [] },
  status: { lesionado: false, limitacaoFisica: null, presencaFrequente: true },
  metadata: { criadoEm: '2026-01-01T00:00:00.000Z', atualizadoEm: '2026-01-01T00:00:00.000Z' },
  communityIds: ['c1'],
};

const inactiveGuest: Player = {
  ...guestPlayer,
  id: 'g9',
  nome: 'Beto Parado',
  apelido: 'Beto Parado',
  ativo: false,
};

const { deleteGuestPlayerMock, reactivateGuestPlayerMock } = vi.hoisted(() => ({
  deleteGuestPlayerMock: vi.fn(),
  reactivateGuestPlayerMock: vi.fn(),
}));

vi.mock('../shellContext', () => ({
  useCommunityShell: () => ({
    community,
    play: {
      players: [guestPlayer, inactiveGuest],
      status: elenco,
      saveGuestPlayer: vi.fn(),
      removeGuestPlayer: vi.fn(),
      reactivateGuestPlayer: reactivateGuestPlayerMock,
      deleteGuestPlayer: deleteGuestPlayerMock,
      getPlayerHistoryUsage: () => ({ hasHistory: false }),
    },
    auth: { user: { id: 'u1' }, isSupabaseConfigured: true, profile: { role: 'user' } },
    communityRules: { getRules: () => ({}) },
    sess: { sessions: [], games: [], teams: [] },
    comm: { communities: [community] },
  }),
}));

import { CommunityGestaoRoute, CommunityGuestsRoute } from './communityRoutes';

function permissionsFor(role: 'owner' | 'admin' | 'moderator' | 'member'): CommunityPermissions & {
  membersResolved: boolean;
} {
  const canManage = role === 'owner' || role === 'admin';
  return {
    role: role === 'member' ? null : (role as CommunityPermissions['role']),
    isGlobalAdmin: false,
    isSupabaseConfigured: true,
    canReadCommunity: role !== 'member',
    canDeleteCommunity: role === 'owner',
    canClearHistory: role === 'owner',
    canManageMembers: canManage,
    canApproveMembers: canManage || role === 'moderator',
    canEditRules: canManage,
    canEditPlayerProfile: canManage,
    canCreateSession: role !== 'member',
    canExportCommunity: canManage,
    canSeeManagement: role !== 'member',
    membersResolved: true,
  };
}

function LocationProbe() {
  const location = useLocation();
  return (
    <p data-testid="location">
      {location.pathname}
      {location.search}
    </p>
  );
}

function renderAt(path: string) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/comunidades/:communityId" element={<p>Visão geral</p>} />
          <Route path="/comunidades/:communityId/gestao" element={<CommunityGestaoRoute />} />
          <Route
            path="/comunidades/:communityId/gestao/convidados"
            element={<CommunityGuestsRoute />}
          />
        </Routes>
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Gestao > Convidados — acesso por papel', () => {
  it('enquanto o elenco chega do banco, mostra que esta carregando', () => {
    permissionsMock.mockReturnValue(permissionsFor('owner'));
    elenco.loading = true;
    try {
      renderAt('/comunidades/c1/gestao/convidados');
      expect(screen.getByRole('status').textContent).toMatch(/carregando convidados/i);
      expect(screen.queryByRole('button', { name: /cadastrar convidado/i })).toBeNull();
    } finally {
      elenco.loading = false;
    }
  });

  it('dono ve a aba Convidados e entra na area', () => {
    permissionsMock.mockReturnValue(permissionsFor('owner'));
    renderAt('/comunidades/c1/gestao/convidados');

    expect(screen.getByRole('tab', { name: 'Convidados' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /cadastrar convidado/i })).toBeTruthy();
  });

  it('admin ve a aba Convidados e entra na area', () => {
    permissionsMock.mockReturnValue(permissionsFor('admin'));
    renderAt('/comunidades/c1/gestao/convidados');

    expect(screen.getByRole('tab', { name: 'Convidados' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /cadastrar convidado/i })).toBeTruthy();
  });

  it('moderador nao ve a aba Convidados em Gestao', () => {
    permissionsMock.mockReturnValue(permissionsFor('moderator'));
    renderAt('/comunidades/c1/gestao');

    expect(screen.queryByRole('tab', { name: 'Convidados' })).toBeNull();
  });

  it('moderador e redirecionado da rota de Convidados para a comunidade', () => {
    permissionsMock.mockReturnValue(permissionsFor('moderator'));
    renderAt('/comunidades/c1/gestao/convidados');

    expect(screen.getByText('Visão geral')).toBeTruthy();
  });

  it('membro e redirecionado da rota de Convidados para a comunidade', () => {
    permissionsMock.mockReturnValue(permissionsFor('member'));
    renderAt('/comunidades/c1/gestao/convidados');

    expect(screen.getByText('Visão geral')).toBeTruthy();
  });

  it('Voltar do editor limpa o parametro editar da URL', () => {
    permissionsMock.mockReturnValue(permissionsFor('owner'));
    renderAt('/comunidades/c1/gestao/convidados?editar=g1');

    expect(screen.getByTestId('location').textContent).toContain('editar=g1');
    expect(screen.getByLabelText('Nome')).toHaveProperty('value', 'Zé');

    fireEvent.click(screen.getByRole('button', { name: /voltar/i }));

    expect(screen.getByTestId('location').textContent).not.toContain('editar');
    expect(screen.getByRole('button', { name: /cadastrar convidado/i })).toBeTruthy();
  });

  it('dono ve os desativados com Reativar e Excluir; Excluir chama deleteGuestPlayer como dono', () => {
    permissionsMock.mockReturnValue(permissionsFor('owner'));
    deleteGuestPlayerMock.mockReturnValue({ ok: true, value: 'removed' });
    renderAt('/comunidades/c1/gestao/convidados');

    const secao = screen.getByRole('list', { name: 'Desativados' });
    expect(within(secao).getByText('Beto Parado')).toBeTruthy();
    expect(within(secao).getByRole('button', { name: 'Reativar' })).toBeTruthy();

    fireEvent.click(within(secao).getByRole('button', { name: 'Excluir' }));
    fireEvent.click(within(secao).getByRole('button', { name: /confirmar exclusão/i }));

    expect(deleteGuestPlayerMock).toHaveBeenCalledWith(
      expect.objectContaining({ playerId: 'g9', isOwner: true, currentUserId: 'u1' }),
    );
  });

  it('admin ve os desativados com Reativar, sem Excluir', () => {
    permissionsMock.mockReturnValue(permissionsFor('admin'));
    reactivateGuestPlayerMock.mockReturnValue({ ok: true, value: 'reactivated' });
    renderAt('/comunidades/c1/gestao/convidados');

    const secao = screen.getByRole('list', { name: 'Desativados' });
    expect(within(secao).queryByRole('button', { name: /excluir/i })).toBeNull();
    fireEvent.click(within(secao).getByRole('button', { name: 'Reativar' }));

    expect(reactivateGuestPlayerMock).toHaveBeenCalledWith(
      expect.objectContaining({ playerId: 'g9', canEdit: true }),
    );
  });

  it('?editar= de um convidado desativado abre o editor dele', () => {
    permissionsMock.mockReturnValue(permissionsFor('owner'));
    renderAt('/comunidades/c1/gestao/convidados?editar=g9');

    expect(screen.getByLabelText('Nome')).toHaveProperty('value', 'Beto Parado');
    expect(screen.getByRole('button', { name: 'Reativar' })).toBeTruthy();
  });
});
