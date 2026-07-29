import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Community, CommunityMember } from '../../types';
import { CommunityMembersPanel } from './CommunityMembersPanel';

const { useCommunityMembersMock } = vi.hoisted(() => ({
  useCommunityMembersMock: vi.fn(),
}));

vi.mock('../../hooks/useCommunityMembers', () => ({
  useCommunityMembers: useCommunityMembersMock,
}));

const community: Community = {
  id: 'community-local',
  cloudId: 'community-cloud',
  name: 'Terca Forte',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function member(overrides: Partial<CommunityMember>): CommunityMember {
  return {
    id: 'member-id',
    communityId: 'community-local',
    userId: 'user-1',
    role: 'member',
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function mockUseCommunityMembers(members: CommunityMember[]) {
  useCommunityMembersMock.mockReturnValue({
    members,
    loading: false,
    error: null,
    reload: vi.fn(),
    invite: vi.fn(),
    changeRole: vi.fn(),
    remove: vi.fn(),
    approveRequest: vi.fn(),
    rejectRequest: vi.fn(),
    generateJoinCode: vi.fn(),
    disableJoinCode: vi.fn(),
    leave: vi.fn(),
  });
}

describe('CommunityMembersPanel', () => {
  it('offers Organizador as a role option when the viewer can manage members', () => {
    mockUseCommunityMembers([
      member({ id: 'owner-row', userId: 'owner-1', role: 'owner', name: 'Ana' }),
      member({ id: 'member-row', userId: 'user-2', role: 'member', name: 'Bruno' }),
    ]);

    render(
      <CommunityMembersPanel
        community={community}
        currentUserId="owner-1"
        isSupabaseConfigured={true}
        globalRole="user"
      />,
    );

    const roleSelect = screen.getByLabelText('Papel do membro');
    const option = within(roleSelect).getByText('Organizador') as HTMLOptionElement;
    expect(option.value).toBe('organizador');
  });

  it('does not render an email line for a member whose email was hidden by RLS (email: null)', () => {
    mockUseCommunityMembers([
      member({ id: 'owner-row', userId: 'owner-1', role: 'owner', name: 'Ana' }),
      member({
        id: 'member-row',
        userId: 'user-2',
        role: 'member',
        name: 'Bruno',
        email: null,
      }),
    ]);

    render(
      <CommunityMembersPanel
        community={community}
        currentUserId="owner-1"
        isSupabaseConfigured={true}
        globalRole="user"
      />,
    );

    expect(screen.getByText('Bruno')).toBeTruthy();
    expect(screen.queryByText(/@/)).toBeNull();
  });

  it('renders the email line for a member whose email is visible', () => {
    mockUseCommunityMembers([
      member({ id: 'owner-row', userId: 'owner-1', role: 'owner', name: 'Ana' }),
      member({
        id: 'member-row',
        userId: 'user-2',
        role: 'member',
        name: 'Bruno',
        email: 'bruno@example.com',
      }),
    ]);

    render(
      <CommunityMembersPanel
        community={community}
        currentUserId="owner-1"
        isSupabaseConfigured={true}
        globalRole="user"
      />,
    );

    expect(screen.getByText('bruno@example.com')).toBeTruthy();
  });

  it('lets a moderator see and act on pending join requests', () => {
    // O banco (capability approve_members) e o caso de uso
    // (ensureApprovingCurrentMember) ja liberavam moderador, mas o painel gateava a
    // secao por canManage (owner/admin), entao o moderador nunca via os botoes — o
    // recurso ficava inalcancavel justamente para o papel para o qual foi feito.
    mockUseCommunityMembers([
      member({ id: 'mod-row', userId: 'mod-1', role: 'moderator', name: 'Carla' }),
      member({
        id: 'pending-row',
        userId: 'user-9',
        role: 'member',
        status: 'pending',
        name: 'Diego',
      }),
    ]);

    render(
      <CommunityMembersPanel
        community={community}
        currentUserId="mod-1"
        isSupabaseConfigured={true}
        globalRole="user"
      />,
    );

    expect(screen.getByText(/pedidos para entrar/i)).toBeTruthy();
    expect(screen.getByText('Diego')).toBeTruthy();
  });

  it('does not show pending join requests to an ordinary member', () => {
    // approve_members nao e concedida a 'member', entao a secao nao deve aparecer.
    mockUseCommunityMembers([
      member({ id: 'me-row', userId: 'plain-1', role: 'member', name: 'Elisa' }),
      member({
        id: 'pending-row',
        userId: 'user-9',
        role: 'member',
        status: 'pending',
        name: 'Diego',
      }),
    ]);

    render(
      <CommunityMembersPanel
        community={community}
        currentUserId="plain-1"
        isSupabaseConfigured={true}
        globalRole="user"
      />,
    );

    expect(screen.queryByText(/pedidos para entrar/i)).toBeNull();
  });
});
