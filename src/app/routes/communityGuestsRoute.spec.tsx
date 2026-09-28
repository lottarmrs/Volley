import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type { Community } from '@shared/types';
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

vi.mock('../shellContext', () => ({
  useCommunityShell: () => ({
    community,
    play: {
      players: [],
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
    canEvaluatePlayer: canManage,
    canCreateSession: role !== 'member',
    canExportCommunity: canManage,
    canSeeManagement: role !== 'member',
    membersResolved: true,
  };
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
});
