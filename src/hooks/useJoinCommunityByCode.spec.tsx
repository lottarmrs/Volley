import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  previewCommunityJoinByCodeQuery,
  requestCommunityJoinByCodeCommand,
} from '../application/communityMembershipUseCases';
import { useJoinCommunityByCode } from './useJoinCommunityByCode';

vi.mock('../application/communityMembershipUseCases', async () => {
  const actual = await vi.importActual<typeof import('../application/communityMembershipUseCases')>(
    '../application/communityMembershipUseCases',
  );
  return {
    ...actual,
    previewCommunityJoinByCodeQuery: vi.fn(),
    requestCommunityJoinByCodeCommand: vi.fn(),
  };
});

const preview = {
  id: 'community-cloud',
  name: 'Terca Forte',
  description: null,
  memberCount: 12,
  myStatus: null,
};

describe('useJoinCommunityByCode', () => {
  beforeEach(() => {
    vi.mocked(previewCommunityJoinByCodeQuery).mockReset();
    vi.mocked(requestCommunityJoinByCodeCommand).mockReset();
  });

  it('uppercases code input and loads preview through the application query', async () => {
    vi.mocked(previewCommunityJoinByCodeQuery).mockResolvedValue({
      ok: true,
      value: { community: preview },
    });

    const { result } = renderHook(() => useJoinCommunityByCode());

    act(() => {
      result.current.setCode(' abcd1234 ');
    });

    await act(async () => {
      await result.current.previewCommunity();
    });

    expect(result.current.code).toBe(' ABCD1234 ');
    expect(result.current.preview).toEqual(preview);
    expect(result.current.error).toBeNull();
    expect(result.current.requested).toBe(false);
    expect(previewCommunityJoinByCodeQuery).toHaveBeenCalledWith({ code: ' ABCD1234 ' });
  });

  it('shows application errors and clears stale preview', async () => {
    vi.mocked(previewCommunityJoinByCodeQuery).mockResolvedValueOnce({
      ok: true,
      value: { community: preview },
    });
    vi.mocked(previewCommunityJoinByCodeQuery).mockResolvedValueOnce({
      ok: false,
      error: {
        kind: 'product',
        code: 'not_found',
        message: 'Codigo de convite invalido ou comunidade nao encontrada.',
        recoverable: false,
      },
    });

    const { result } = renderHook(() => useJoinCommunityByCode());

    act(() => {
      result.current.setCode('ABCD1234');
    });
    await act(async () => {
      await result.current.previewCommunity();
    });
    await act(async () => {
      await result.current.previewCommunity();
    });

    expect(result.current.preview).toBeNull();
    expect(result.current.error).toBe('Codigo de convite invalido ou comunidade nao encontrada.');
    expect(result.current.loading).toBe(false);
  });

  it('marks request as sent when join by code succeeds', async () => {
    vi.mocked(requestCommunityJoinByCodeCommand).mockResolvedValue({
      ok: true,
      value: {
        member: {
          id: 'member-pending',
          communityId: 'community-local',
          userId: 'user-1',
          role: 'member',
          status: 'pending',
          name: null,
          email: null,
          invitedBy: null,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      },
    });

    const { result } = renderHook(() => useJoinCommunityByCode());

    act(() => {
      result.current.setCode('abcd1234');
    });
    await act(async () => {
      await result.current.requestJoin();
    });

    expect(requestCommunityJoinByCodeCommand).toHaveBeenCalledWith({ code: 'ABCD1234' });
    expect(result.current.requested).toBe(true);
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });
});
