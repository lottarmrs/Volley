import { useCallback, useEffect, useState } from 'react';
import {
  createChampionship as buildChampionship,
  type CreateChampionshipInput,
} from '../application/championshipUseCases';
import { appOk, productError } from '../application/appResult';
import { generateRoundDates } from '../logic/championship';
import { generateUUID } from '../logic/uuid';
import { STORAGE_KEYS, loadFromStorage, saveToStorage } from '../storage/localStorageRepository';
import type { Championship, ChampionshipRound, ChampionshipTeam } from '../types';

export interface CreatedChampionshipAggregate {
  championship: Championship;
  teams: ChampionshipTeam[];
  rounds: ChampionshipRound[];
}

type ChampionshipEntity = Championship | ChampionshipTeam | ChampionshipRound;

function deleteOrTombstone<T extends ChampionshipEntity>(item: T, now: string): T | null {
  if (!item.cloudId) return null;
  return {
    ...item,
    deletedAt: now,
    syncStatus: 'pending',
    updatedAt: now,
  } as T;
}

export function useChampionships() {
  const [championships, setChampionships] = useState<Championship[]>(() =>
    loadFromStorage(STORAGE_KEYS.championships, []),
  );
  const [championshipTeams, setChampionshipTeams] = useState<ChampionshipTeam[]>(() =>
    loadFromStorage(STORAGE_KEYS.championshipTeams, []),
  );
  const [championshipRounds, setChampionshipRounds] = useState<ChampionshipRound[]>(() =>
    loadFromStorage(STORAGE_KEYS.championshipRounds, []),
  );

  useEffect(() => saveToStorage(STORAGE_KEYS.championships, championships), [championships]);
  useEffect(
    () => saveToStorage(STORAGE_KEYS.championshipTeams, championshipTeams),
    [championshipTeams],
  );
  useEffect(
    () => saveToStorage(STORAGE_KEYS.championshipRounds, championshipRounds),
    [championshipRounds],
  );

  const create = useCallback((input: CreateChampionshipInput) => {
    const result = buildChampionship(input);
    if (!result.ok) return result;

    const now = new Date().toISOString();
    const championshipId = generateUUID();
    const championship: Championship = {
      id: championshipId,
      ...result.value.championship,
      syncStatus: 'local',
      createdAt: now,
      updatedAt: now,
    };
    const teams: ChampionshipTeam[] = result.value.teams.map((team) => ({
      ...team,
      championshipId,
      syncStatus: 'local',
      updatedAt: now,
    }));
    const rounds: ChampionshipRound[] = result.value.rounds.map((round) => ({
      id: generateUUID(),
      championshipId,
      ...round,
      syncStatus: 'local',
      updatedAt: now,
    }));

    setChampionships((current) => [...current, championship]);
    setChampionshipTeams((current) => [...current, ...teams]);
    setChampionshipRounds((current) => [...current, ...rounds]);

    return appOk<CreatedChampionshipAggregate>({ championship, teams, rounds });
  }, []);

  const markRoundMaterialized = useCallback((roundId: string, sessionId: string) => {
    const now = new Date().toISOString();
    setChampionshipRounds((current) =>
      current.map((round) =>
        round.id === roundId
          ? { ...round, sessionId, syncStatus: 'pending', updatedAt: now }
          : round,
      ),
    );
  }, []);

  const deleteChampionship = useCallback((championshipId: string) => {
    const now = new Date().toISOString();
    setChampionships((current) =>
      current.flatMap((item) => {
        if (item.id !== championshipId) return [item];
        const deleted = deleteOrTombstone(item, now);
        return deleted ? [deleted] : [];
      }),
    );
    setChampionshipTeams((current) =>
      current.flatMap((item) => {
        if (item.championshipId !== championshipId) return [item];
        const deleted = deleteOrTombstone(item, now);
        return deleted ? [deleted] : [];
      }),
    );
    setChampionshipRounds((current) =>
      current.flatMap((item) => {
        if (item.championshipId !== championshipId) return [item];
        const deleted = deleteOrTombstone(item, now);
        return deleted ? [deleted] : [];
      }),
    );
  }, []);

  const deleteForCommunity = useCallback(
    (communityId: string) => {
      const championshipIds = new Set(
        championships
          .filter((championship) => championship.communityId === communityId)
          .map((championship) => championship.id),
      );
      for (const championshipId of championshipIds) deleteChampionship(championshipId);
    },
    [championships, deleteChampionship],
  );

  const rescheduleRound = useCallback((roundId: string, scheduledDate: string) => {
    const round = championshipRounds.find((item) => item.id === roundId);
    if (!round) return productError('not_found', 'Rodada não encontrada.');
    if (round.sessionId) {
      return productError('invalid_input', 'Uma rodada materializada mantém sua data original.');
    }
    if (!scheduledDate || Number.isNaN(new Date(scheduledDate).getTime())) {
      return productError('invalid_input', 'Informe uma data válida para a rodada.');
    }
    const now = new Date().toISOString();
    setChampionshipRounds((current) =>
      current.map((item) =>
        item.id === roundId
          ? { ...item, scheduledDate, syncStatus: 'pending', updatedAt: now }
          : item,
      ),
    );
    return appOk(undefined);
  }, [championshipRounds]);

  const setRoundSkipped = useCallback((roundId: string, skipped: boolean) => {
    const round = championshipRounds.find((item) => item.id === roundId);
    if (!round) return productError('not_found', 'Rodada não encontrada.');
    if (round.sessionId) {
      return productError('invalid_input', 'Uma rodada materializada não pode ser pulada.');
    }
    const now = new Date().toISOString();
    setChampionshipRounds((current) =>
      current.map((item) =>
        item.id === roundId
          ? { ...item, skipped, syncStatus: 'pending', updatedAt: now }
          : item,
      ),
    );
    return appOk(undefined);
  }, [championshipRounds]);

  const updateRecurrence = useCallback(
    (championshipId: string, recurrenceRule: Championship['recurrenceRule']) => {
      const championship = championships.find((item) => item.id === championshipId);
      if (!championship) return productError('not_found', 'Liga não encontrada.');
      const rounds = championshipRounds.filter((item) => item.championshipId === championshipId);
      const roundCount = Math.max(...rounds.map((item) => item.round), 0);
      const dates = generateRoundDates(recurrenceRule, roundCount);
      if (dates.length !== roundCount) {
        return productError(
          'invalid_input',
          'A recorrência informada não cobre todas as rodadas da liga.',
        );
      }
      const now = new Date().toISOString();
      setChampionships((current) =>
        current.map((item) =>
          item.id === championshipId
            ? { ...item, recurrenceRule, syncStatus: 'pending', updatedAt: now }
            : item,
        ),
      );
      setChampionshipRounds((current) =>
        current.map((item) =>
          item.championshipId === championshipId && !item.sessionId
            ? {
                ...item,
                scheduledDate: dates[item.round - 1],
                syncStatus: 'pending',
                updatedAt: now,
              }
            : item,
        ),
      );
      return appOk(undefined);
    },
    [championshipRounds, championships],
  );

  return {
    championships: championships.filter((item) => !item.deletedAt),
    rawChampionships: championships,
    setChampionships,
    championshipTeams: championshipTeams.filter((item) => !item.deletedAt),
    rawChampionshipTeams: championshipTeams,
    setChampionshipTeams,
    championshipRounds: championshipRounds.filter((item) => !item.deletedAt),
    rawChampionshipRounds: championshipRounds,
    setChampionshipRounds,
    create,
    markRoundMaterialized,
    deleteChampionship,
    deleteForCommunity,
    rescheduleRound,
    setRoundSkipped,
    updateRecurrence,
  };
}
