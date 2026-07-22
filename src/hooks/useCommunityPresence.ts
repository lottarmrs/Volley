import { useCallback, useEffect, useMemo, useState } from 'react';
import { CommunityPresence, CommunityPresenceStatus, Player } from '../types';
import { STORAGE_KEYS, loadFromStorage, saveToStorage } from '../storage/localStorageRepository';
import { formatLocalDateInput } from '../logic/date';
import {
  addLocalPresenceGuest,
  applyLocalPresenceStatus,
  clearLocalPresence,
  reuseLastLocalPresence,
  selectFrequentLocalPresencePlayers,
  selectLocalPresence,
  selectPresentLocalPresencePlayers,
} from '../application/localCommunityPresenceUseCases';

function today() {
  return formatLocalDateInput();
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
      return selectLocalPresence(presenceRecords, communityId, today());
    },
    [presenceRecords],
  );

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

  const useLastPresence = useCallback((communityId: string) => {
    setPresenceRecords((prev) =>
      reuseLastLocalPresence({
        records: prev,
        communityId,
        date: today(),
        now: new Date().toISOString(),
      }),
    );
  }, []);

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
      return selectPresentLocalPresencePlayers({
        records: presenceRecords,
        communityId,
        date: today(),
        players,
      });
    },
    [presenceRecords],
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
