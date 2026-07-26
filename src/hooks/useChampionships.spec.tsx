import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { STORAGE_KEYS } from '../storage/localStorageRepository';
import type { Championship } from '../types';
import { useChampionships } from './useChampionships';

const createInput = {
  communityId: 'community-1',
  name: 'Liga de Inverno',
  format: 'round_robin' as const,
  classificationPoints: { win: 3, loss: 0, walkoverWin: 3, walkoverLoss: 0 },
  recurrenceRule: {
    daysOfWeek: [2],
    time: '20:00',
    startDate: '2026-08-04',
    endDate: null,
  },
  teams: [
    { id: 'team-a', name: 'Aurora', playerIds: ['p1', 'p2'] },
    { id: 'team-b', name: 'Boreal', playerIds: ['p3', 'p4'] },
  ],
};

describe('useChampionships', () => {
  beforeEach(() => localStorage.clear());

  it('hydrates championship collections from localStorage', () => {
    const championship: Championship = {
      id: 'champ-1',
      communityId: 'community-1',
      name: 'Liga salva',
      format: 'round_robin',
      classificationPoints: { win: 3, loss: 0 },
      recurrenceRule: { daysOfWeek: [2], time: '20:00', startDate: '2026-08-04' },
      createdAt: '2026-07-26T00:00:00.000Z',
      updatedAt: '2026-07-26T00:00:00.000Z',
    };
    localStorage.setItem(STORAGE_KEYS.championships, JSON.stringify([championship]));

    const { result } = renderHook(() => useChampionships());

    expect(result.current.championships).toEqual([championship]);
  });

  it('creates and persists a complete championship aggregate', () => {
    const { result } = renderHook(() => useChampionships());

    let created: ReturnType<typeof result.current.create>;
    act(() => {
      created = result.current.create(createInput);
    });

    expect(created!.ok).toBe(true);
    expect(result.current.championships).toHaveLength(1);
    expect(result.current.championshipTeams).toHaveLength(2);
    expect(result.current.championshipRounds).toHaveLength(1);
    expect(result.current.championships[0]).toMatchObject({
      communityId: 'community-1',
      name: 'Liga de Inverno',
      syncStatus: 'local',
    });
    expect(result.current.championshipTeams.map((team) => team.championshipId)).toEqual([
      result.current.championships[0].id,
      result.current.championships[0].id,
    ]);
    expect(result.current.championshipRounds[0]).toMatchObject({
      championshipId: result.current.championships[0].id,
      teamAId: 'team-a',
      teamBId: 'team-b',
      syncStatus: 'local',
    });

    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.championships)!)).toHaveLength(1);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.championshipTeams)!)).toHaveLength(2);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.championshipRounds)!)).toHaveLength(1);
  });

  it('marks a round as materialized and pending for cloud sync', () => {
    const { result } = renderHook(() => useChampionships());
    act(() => {
      result.current.create(createInput);
    });
    const roundId = result.current.championshipRounds[0].id;

    act(() => {
      result.current.markRoundMaterialized(roundId, 'session-1');
    });

    expect(result.current.championshipRounds[0]).toMatchObject({
      id: roundId,
      sessionId: 'session-1',
      syncStatus: 'pending',
    });
  });
});
