import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  requestPublicCommunityJoinCommand,
  searchPublicCommunitiesQuery,
} from '../application/communityMembershipUseCases';
import { useCommunityDiscovery } from './useCommunityDiscovery';

vi.mock('../application/communityMembershipUseCases', async () => {
  const actual = await vi.importActual<typeof import('../application/communityMembershipUseCases')>(
    '../application/communityMembershipUseCases',
  );
  return {
    ...actual,
    requestPublicCommunityJoinCommand: vi.fn(),
    searchPublicCommunitiesQuery: vi.fn(),
  };
});

const community = {
  id: 'community-cloud',
  name: 'Terca Forte',
  description: null,
  memberCount: 12,
  myStatus: null,
};

describe('useCommunityDiscovery', () => {
  beforeEach(() => {
    vi.mocked(requestPublicCommunityJoinCommand).mockReset();
    vi.mocked(searchPublicCommunitiesQuery).mockReset();
  });

  it('loads public communities through the application query', async () => {
    vi.mocked(searchPublicCommunitiesQuery).mockResolvedValue({
      ok: true,
      value: { communities: [community] },
    });

    const { result } = renderHook(() => useCommunityDiscovery());

    act(() => {
      result.current.setQuery('terca');
    });
    await act(async () => {
      await result.current.search('terca');
    });

    expect(searchPublicCommunitiesQuery).toHaveBeenCalledWith({ query: 'terca' });
    expect(result.current.results).toEqual([community]);
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('shows search errors and preserves previous results', async () => {
    vi.mocked(searchPublicCommunitiesQuery).mockResolvedValueOnce({
      ok: true,
      value: { communities: [community] },
    });
    vi.mocked(searchPublicCommunitiesQuery).mockResolvedValueOnce({
      ok: false,
      error: {
        kind: 'technical',
        code: 'technical_error',
        message: 'Nao foi possivel buscar comunidades.',
        recoverable: true,
      },
    });

    const { result } = renderHook(() => useCommunityDiscovery());

    await act(async () => {
      await result.current.search('');
    });
    await act(async () => {
      await result.current.search('falha');
    });

    expect(result.current.results).toEqual([community]);
    expect(result.current.error).toBe('Não foi possível buscar comunidades.');
    expect(result.current.loading).toBe(false);
  });

  it('shows search technical error causes', async () => {
    vi.mocked(searchPublicCommunitiesQuery).mockResolvedValue({
      ok: false,
      error: {
        kind: 'technical',
        code: 'technical_error',
        message: 'Nao foi possivel buscar comunidades.',
        recoverable: true,
        cause: new Error('RPC search failed'),
      },
    });

    const { result } = renderHook(() => useCommunityDiscovery());

    await act(async () => {
      await result.current.search('falha');
    });

    expect(result.current.error).toBe('RPC search failed');
    expect(result.current.loading).toBe(false);
  });

  it('marks requested community as pending after public join succeeds', async () => {
    vi.mocked(searchPublicCommunitiesQuery).mockResolvedValue({
      ok: true,
      value: { communities: [community] },
    });
    vi.mocked(requestPublicCommunityJoinCommand).mockResolvedValue({
      ok: true,
      value: {},
    });

    const { result } = renderHook(() => useCommunityDiscovery());

    await act(async () => {
      await result.current.search('');
    });
    await act(async () => {
      await result.current.requestJoin(community);
    });

    expect(requestPublicCommunityJoinCommand).toHaveBeenCalledWith({
      communityCloudId: 'community-cloud',
    });
    expect(result.current.results[0].myStatus).toBe('pending');
    expect(result.current.actingId).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('shows public request fallback errors and preserves community status', async () => {
    vi.mocked(searchPublicCommunitiesQuery).mockResolvedValue({
      ok: true,
      value: { communities: [community] },
    });
    vi.mocked(requestPublicCommunityJoinCommand).mockResolvedValue({
      ok: false,
      error: {
        kind: 'technical',
        code: 'technical_error',
        message: 'Nao foi possivel enviar o pedido.',
        recoverable: true,
      },
    });

    const { result } = renderHook(() => useCommunityDiscovery());

    await act(async () => {
      await result.current.search('');
    });
    await act(async () => {
      await result.current.requestJoin(community);
    });

    expect(result.current.error).toBe('Não foi possível enviar o pedido.');
    expect(result.current.actingId).toBeNull();
    expect(result.current.results[0].myStatus).toBeNull();
  });
});
