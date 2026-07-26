import { useCallback, useEffect, useState } from 'react';
import {
  createChampionship as buildChampionship,
  type CreateChampionshipInput,
} from '../application/championshipUseCases';
import { appOk } from '../application/appResult';
import { generateUUID } from '../logic/uuid';
import { STORAGE_KEYS, loadFromStorage, saveToStorage } from '../storage/localStorageRepository';
import type { Championship, ChampionshipRound, ChampionshipTeam } from '../types';

export interface CreatedChampionshipAggregate {
  championship: Championship;
  teams: ChampionshipTeam[];
  rounds: ChampionshipRound[];
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
  };
}
