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
});
