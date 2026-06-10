import { useCallback, useEffect, useMemo, useState } from 'react';
import { CommunityPresence, CommunityPresenceStatus, Player } from '../types';
import { STORAGE_KEYS, loadFromStorage, saveToStorage } from '../storage/localStorageRepository';
import { addGuestToPresence, setPresenceItemStatus } from '../logic/communityPresence';

function today() {
  return new Date().toISOString().split('T')[0];
}

function createPresence(communityId: string): CommunityPresence {
  return {
    communityId,
    date: today(),
    items: [],
    updatedAt: new Date().toISOString(),
  };
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
    setPresenceRecords((prev) => {
      const exists = prev.some(
        (record) => record.communityId === next.communityId && record.date === next.date,
      );
      return exists
        ? prev.map((record) =>
            record.communityId === next.communityId && record.date === next.date ? next : record,
          )
        : [...prev, next];
    });
  }, []);

  const setPresenceStatus = useCallback(
    (communityId: string, playerId: string, status: CommunityPresenceStatus) => {
      upsertPresence(setPresenceItemStatus(ensurePresence(communityId), playerId, status));
    },
    [ensurePresence, upsertPresence],
  );

  const clearPresence = useCallback(
    (communityId: string) => {
      upsertPresence(createPresence(communityId));
    },
    [upsertPresence],
  );

  const selectFrequentPlayers = useCallback(
    (communityId: string, players: Player[]) => {
      const base = ensurePresence(communityId);
      const selected = players.filter((player) => player.status.presencaFrequente && player.ativo);
      const next = selected.reduce(
        (acc, player) => setPresenceItemStatus(acc, player.id, 'present'),
        base,
      );
      upsertPresence(next);
    },
    [ensurePresence, upsertPresence],
  );

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

  const addGuest = useCallback(
    (communityId: string, temporaryName: string) => {
      upsertPresence(addGuestToPresence(ensurePresence(communityId), temporaryName));
    },
    [ensurePresence, upsertPresence],
  );

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
