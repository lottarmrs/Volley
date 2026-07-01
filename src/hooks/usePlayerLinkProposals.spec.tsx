import { act, renderHook } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchAllPlayerLinkProposalsQuery } from '../application/playerLinkUseCases';
import { STORAGE_KEYS } from '../storage/localStorageRepository';
import { makePlayer } from '../test/fixtures';
import type { Player, PlayerLinkProposal } from '../types';
import { usePlayerLinkProposals } from './usePlayerLinkProposals';

vi.mock('../application/playerLinkUseCases', async () => {
  const actual = await vi.importActual<typeof import('../application/playerLinkUseCases')>(
    '../application/playerLinkUseCases',
  );
  return {
    ...actual,
    fetchAllPlayerLinkProposalsQuery: vi.fn(),
  };
});

const now = '2026-01-01T12:00:00.000Z';

function proposal(overrides: Partial<PlayerLinkProposal> = {}): PlayerLinkProposal {
  return {
    id: 'proposal-1',
    playerId: 'player-local',
    playerCloudId: 'player-cloud',
    userId: 'user-1',
    status: 'pending',
    createdAt: now,
    syncStatus: 'synced',
    ...overrides,
  };
}

function useHarness(initialPlayers: Player[]) {
  const [players, setPlayers] = useState(initialPlayers);
  return usePlayerLinkProposals(players, setPlayers, 'admin-user');
}

function mockRefresh(proposals: PlayerLinkProposal[]) {
  vi.mocked(fetchAllPlayerLinkProposalsQuery).mockResolvedValue({
    ok: true,
    value: { linkProposals: proposals },
  });
}

function seedStoredProposals(proposals: PlayerLinkProposal[]) {
  localStorage.setItem(STORAGE_KEYS.playerLinkProposals, JSON.stringify(proposals));
}

describe('usePlayerLinkProposals refresh', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(fetchAllPlayerLinkProposalsQuery).mockReset();
  });

  it('normalizes refreshed cloud proposal player identity', async () => {
    const players = [makePlayer('player-local', { cloudId: 'player-cloud' })];
    mockRefresh([proposal({ playerId: 'player-cloud', playerCloudId: undefined })]);

    const { result } = renderHook(() => useHarness(players));

    await act(async () => {
      await result.current.handleRefreshPlayerLinkProposals();
    });

    expect(result.current.linkProposals[0]).toMatchObject({
      playerId: 'player-local',
      playerCloudId: 'player-cloud',
    });
  });

  it('does not overwrite a local pending proposal with refreshed cloud data', async () => {
    const localPending = proposal({
      playerId: 'player-local',
      status: 'pending',
      syncStatus: 'local',
      createdAt: '2026-01-02T12:00:00.000Z',
    });
    seedStoredProposals([localPending]);
    mockRefresh([
      proposal({
        playerId: 'player-cloud',
        status: 'pending',
        syncStatus: 'synced',
        createdAt: '2026-01-01T12:00:00.000Z',
      }),
    ]);

    const { result } = renderHook(() =>
      useHarness([makePlayer('player-local', { cloudId: 'player-cloud' })]),
    );

    await act(async () => {
      await result.current.handleRefreshPlayerLinkProposals();
    });

    expect(result.current.linkProposals[0]).toMatchObject({
      playerId: 'player-local',
      syncStatus: 'local',
      createdAt: '2026-01-02T12:00:00.000Z',
    });
  });

  it('does not overwrite a locally reviewed proposal with stale pending refresh data', async () => {
    const reviewed = proposal({
      status: 'approved',
      reviewedBy: 'admin-user',
      reviewedAt: '2026-01-02T12:00:00.000Z',
      syncStatus: 'synced',
    });
    seedStoredProposals([reviewed]);
    mockRefresh([
      proposal({
        status: 'pending',
        reviewedAt: undefined,
        reviewedBy: undefined,
        syncStatus: 'synced',
      }),
    ]);

    const { result } = renderHook(() =>
      useHarness([makePlayer('player-local', { cloudId: 'player-cloud' })]),
    );

    await act(async () => {
      await result.current.handleRefreshPlayerLinkProposals();
    });

    expect(result.current.linkProposals[0]).toMatchObject({
      status: 'approved',
      reviewedBy: 'admin-user',
      reviewedAt: '2026-01-02T12:00:00.000Z',
    });
  });
});
