import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Community } from '../types';
import { useCommunityPermissions } from './useCommunityPermissions';

const state = vi.hoisted(() => ({
  auth: {
    isSupabaseConfigured: true,
    user: { id: 'user-1' } as { id: string } | null,
    profile: { role: 'user' },
  },
  members: { members: [] as unknown[], resolved: false },
}));

vi.mock('./useAuth', () => ({ useAuth: () => state.auth }));
vi.mock('./useCommunityMembers', () => ({ useCommunityMembers: () => state.members }));

const synced: Community = {
  id: 'community-1',
  name: 'Pelada',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  cloudId: '11111111-1111-4111-8111-111111111111',
};

describe('useCommunityPermissions membersResolved', () => {
  beforeEach(() => {
    state.auth.isSupabaseConfigured = true;
    state.auth.user = { id: 'user-1' };
    state.members = { members: [], resolved: false };
  });

  it('is false while the members of a synced Community are loading', () => {
    const { result } = renderHook(() => useCommunityPermissions(synced));
    expect(result.current.membersResolved).toBe(false);
    expect(result.current.canCreateSession).toBe(false);
  });

  it('resolves a plain member without session creation', () => {
    state.members = {
      members: [{ userId: 'user-1', role: 'member', status: 'active' }],
      resolved: true,
    };
    const { result } = renderHook(() => useCommunityPermissions(synced));
    expect(result.current.membersResolved).toBe(true);
    expect(result.current.canCreateSession).toBe(false);
  });

  it('resolves an owner with session creation', () => {
    state.members = {
      members: [{ userId: 'user-1', role: 'owner', status: 'active' }],
      resolved: true,
    };
    const { result } = renderHook(() => useCommunityPermissions(synced));
    expect(result.current.membersResolved).toBe(true);
    expect(result.current.canCreateSession).toBe(true);
  });

  it('is resolved at once for a local Community and for a signed-out user', () => {
    const local = renderHook(() => useCommunityPermissions({ ...synced, cloudId: undefined }));
    expect(local.result.current.membersResolved).toBe(true);
    expect(local.result.current.canCreateSession).toBe(true);

    state.auth.user = null;
    const signedOut = renderHook(() => useCommunityPermissions(synced));
    expect(signedOut.result.current.membersResolved).toBe(true);
    expect(signedOut.result.current.canCreateSession).toBe(true);
  });
});
