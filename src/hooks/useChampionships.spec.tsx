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

  it('removes a local-only championship aggregate when its community is deleted', () => {
    const { result } = renderHook(() => useChampionships());
    act(() => {
      result.current.create(createInput);
    });

    act(() => {
      result.current.deleteForCommunity('community-1');
    });

    expect(result.current.rawChampionships).toEqual([]);
    expect(result.current.rawChampionshipTeams).toEqual([]);
    expect(result.current.rawChampionshipRounds).toEqual([]);
  });

  it('tombstones a cloud-backed championship aggregate for sync on deletion', () => {
    const { result } = renderHook(() => useChampionships());
    act(() => {
      result.current.create(createInput);
    });
    act(() => {
      result.current.setChampionships((current) =>
        current.map((item) => ({ ...item, cloudId: 'champ-cloud', syncStatus: 'synced' })),
      );
      result.current.setChampionshipTeams((current) =>
        current.map((item, index) => ({
          ...item,
          cloudId: `team-cloud-${index}`,
          syncStatus: 'synced',
        })),
      );
      result.current.setChampionshipRounds((current) =>
        current.map((item) => ({ ...item, cloudId: 'round-cloud', syncStatus: 'synced' })),
      );
    });

    act(() => {
      result.current.deleteChampionship(result.current.rawChampionships[0].id);
    });

    expect(result.current.championships).toEqual([]);
    expect(result.current.rawChampionships[0]).toMatchObject({
      cloudId: 'champ-cloud',
      syncStatus: 'pending',
    });
    expect(result.current.rawChampionships[0].deletedAt).toBeTruthy();
    expect(result.current.rawChampionshipTeams.every((item) => item.deletedAt)).toBe(true);
    expect(result.current.rawChampionshipRounds.every((item) => item.deletedAt)).toBe(true);
  });

  it('updates future recurrence dates while preserving materialized fixtures', () => {
    const { result } = renderHook(() => useChampionships());
    act(() => {
      result.current.create({
        ...createInput,
        teams: [
          ...createInput.teams,
          { id: 'team-c', name: 'Céu', playerIds: ['p5'] },
          { id: 'team-d', name: 'Duna', playerIds: ['p6'] },
        ],
      });
    });
    const championshipId = result.current.championships[0].id;
    const materializedRound = result.current.championshipRounds[0];
    const originalDate = materializedRound.scheduledDate;
    act(() => {
      result.current.markRoundMaterialized(materializedRound.id, 'session-1');
    });

    act(() => {
      const updated = result.current.updateRecurrence(championshipId, {
        daysOfWeek: [4],
        time: '21:30',
        startDate: '2026-09-01',
        endDate: null,
      });
      expect(updated.ok).toBe(true);
    });

    expect(
      result.current.championshipRounds.find((item) => item.id === materializedRound.id)
        ?.scheduledDate,
    ).toBe(originalDate);
    expect(
      result.current.championshipRounds
        .filter((item) => !item.sessionId)
        .every((item) => item.scheduledDate.includes('T21:30')),
    ).toBe(true);
  });

  it('supports manual skip and reschedule only before materialization', () => {
    const { result } = renderHook(() => useChampionships());
    act(() => {
      result.current.create(createInput);
    });
    const roundId = result.current.championshipRounds[0].id;

    act(() => {
      expect(result.current.setRoundSkipped(roundId, true).ok).toBe(true);
      expect(result.current.rescheduleRound(roundId, '2026-09-10T19:15').ok).toBe(true);
    });

    expect(result.current.championshipRounds[0]).toMatchObject({
      skipped: true,
      scheduledDate: '2026-09-10T19:15',
      syncStatus: 'pending',
    });
  });
});
