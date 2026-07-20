import { useCallback, useEffect, useMemo, useState } from 'react';
import { CommunityPresence, CommunityPresenceStatus, Player } from '../types';
import { STORAGE_KEYS, loadFromStorage, saveToStorage } from '../storage/localStorageRepository';
import { formatLocalDateInput } from '../logic/date';
import {
  addLocalPresenceGuest,
  applyLocalPresenceStatus,
  clearLocalPresence,
  createLocalPresence,
  selectFrequentLocalPresencePlayers,
  upsertLocalPresence,
} from '../application/localCommunityPresenceUseCases';

function today() {
  return formatLocalDateInput();
}

function createPresence(communityId: string): CommunityPresence {
  return createLocalPresence({
    communityId,
    date: today(),
    now: new Date().toISOString(),
  });
}

export function useCommunityPresence() {
  const [presenceRecords, setPresenceRecords] = useState<CommunityPresence[]>(() =>
    loadFromStorage<CommunityPresence[]>(STORAGE_KEYS.communityPresence, []),
  );

  useEffect(() => {
    saveToStorage(STORAGE_KEYS.communityPresence, presenceRecords);
  }, [presenceRecords]);

  const getPresence = useCallback(
    (communityId: string) => {
      return (
        presenceRecords.find(
          (record) => record.communityId === communityId && record.date === today(),
        ) || null
      );
    },
    [presenceRecords],
  );

  const ensurePresence = useCallback(
    (communityId: string) => {
      const current = getPresence(communityId);
      if (current) return current;
      return createPresence(communityId);
    },
    [getPresence],
  );

  const upsertPresence = useCallback((next: CommunityPresence) => {
    setPresenceRecords((prev) =>
      upsertLocalPresence({
        records: prev,
        presence: next,
        now: new Date().toISOString(),
      }),
    );
  }, []);

  const setPresenceStatus = useCallback(
    (communityId: string, playerId: string, status: CommunityPresenceStatus) => {
      setPresenceRecords((prev) =>
        applyLocalPresenceStatus({
          records: prev,
          communityId,
          playerId,
          status,
          date: today(),
          now: new Date().toISOString(),
        }),
      );
    },
    [],
  );

  const clearPresence = useCallback((communityId: string) => {
    setPresenceRecords((prev) =>
      clearLocalPresence({
        records: prev,
        communityId,
        date: today(),
        now: new Date().toISOString(),
      }),
    );
  }, []);

  const selectFrequentPlayers = useCallback((communityId: string, players: Player[]) => {
    setPresenceRecords((prev) =>
      selectFrequentLocalPresencePlayers({
        records: prev,
        communityId,
        players,
        date: today(),
        now: new Date().toISOString(),
      }),
    );
  }, []);

  const useLastPresence = useCallback(
    (communityId: string) => {
      const records = presenceRecords
        .filter((record) => record.communityId === communityId && record.date !== today())
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      const last = records[0];
      if (!last) return;
      upsertPresence({ ...last, date: today(), updatedAt: new Date().toISOString() });
    },
    [presenceRecords, upsertPresence],
  );

  const addGuest = useCallback((communityId: string, temporaryName: string) => {
    setPresenceRecords((prev) =>
      addLocalPresenceGuest({
        records: prev,
        communityId,
        temporaryName,
        date: today(),
        now: new Date().toISOString(),
      }),
    );
  }, []);

  const getPresentPlayers = useCallback(
    (communityId: string, players: Player[]) => {
      const presence = getPresence(communityId);
      return players.filter((player) =>
        presence?.items.some((item) => item.playerId === player.id && item.status === 'present'),
      );
    },
    [getPresence],
  );

  return useMemo(
    () => ({
      presenceRecords,
      setPresenceRecords,
      getPresence,
      setPresenceStatus,
      clearPresence,
      selectFrequentPlayers,
      useLastPresence,
      addGuest,
      getPresentPlayers,
    }),
    [
      presenceRecords,
      getPresence,
      setPresenceStatus,
      clearPresence,
      selectFrequentPlayers,
      useLastPresence,
      addGuest,
      getPresentPlayers,
    ],
  );
}
