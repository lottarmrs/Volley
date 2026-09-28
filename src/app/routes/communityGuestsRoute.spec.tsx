import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type { Community, Player } from '@shared/types';
import type { CommunityPermissions } from '@domain/communityPermissions';

const { permissionsMock } = vi.hoisted(() => ({ permissionsMock: vi.fn() }));
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

vi.mock('../shellContext', () => ({
  useCommunityShell: () => ({
    community,
    play: {
      players: [guestPlayer],
      setPlayers: vi.fn(),
      saveGuestPlayer: vi.fn(),
      removeGuestPlayer: vi.fn(),
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
    </MemoryRouter>,
  );
}

describe('Gestao > Convidados — acesso por papel', () => {
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
});
