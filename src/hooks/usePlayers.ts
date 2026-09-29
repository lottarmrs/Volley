import { useState, useEffect, useCallback } from 'react';
import { Player, Game, PointEvent, Team } from '../types';
import { INITIAL_PLAYERS } from '../constants';
import { STORAGE_KEYS, saveToStorage } from '../storage/localStorageRepository';
import { generateUUID } from '../logic/uuid';
import {
  applyGuestActiveChange,
  applyGuestDeletion,
  applyGuestProfileSave,
  isForeignAccountPlayer,
} from '../application/localPlayerUseCases';
import type { AthleteProfileDraft } from '../domain/athleteProfile';
import { appOk, productError, type AppResult } from '../application/appResult';

function normalizePlayer(p: any): Player {
  return {
    ...p,
    apelido: p.apelido ?? p.nome,
    ativo: p.ativo ?? true,
    posicoesSecundarias: p.posicoesSecundarias ?? [],
    status: p.status ?? { lesionado: false, limitacaoFisica: null },
    metadata: p.metadata ?? {
      criadoEm: new Date().toISOString(),
      atualizadoEm: new Date().toISOString(),
    },
    communityIds: p.communityIds ?? [],
    userId: p.userId,
  };
}

export function usePlayers(games: Game[], pointEvents: PointEvent[], teams: Team[]) {
  const [players, setPlayers] = useState<Player[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.players);
      if (raw !== null) {
        let loaded = JSON.parse(raw);

        // Migrate old 0-10 physical form values to the new -5 to 5 scale
        let version = localStorage.getItem('vpg_players_schema_version');
        if (version !== '1' && version !== '2') {
          loaded = loaded.map((p: any) => {
            if (p && p.formaAtual) {
              const oldVal = p.formaAtual.valor ?? 5;
              const newVal = Math.max(-5, Math.min(5, oldVal - 5));
              const ultimasPartidas = Array.isArray(p.formaAtual.ultimasPartidas)
                ? p.formaAtual.ultimasPartidas.map((v: number) => Math.max(-5, Math.min(5, v - 5)))
                : [];
              return {
                ...p,
                formaAtual: {
                  ...p.formaAtual,
                  valor: newVal,
                  ultimasPartidas,
                },
              };
            }
            return p;
          });
          localStorage.setItem(STORAGE_KEYS.players, JSON.stringify(loaded));
          localStorage.setItem('vpg_players_schema_version', '1');
          version = '1';
        }

        // Migrate to version 2 (support userId)
        if (version === '1') {
          loaded = loaded.map((p: any) => ({
            ...p,
            userId: p.userId ?? null,
          }));
          localStorage.setItem(STORAGE_KEYS.players, JSON.stringify(loaded));
          localStorage.setItem('vpg_players_schema_version', '2');
          version = '2';
        }

        return loaded.map(normalizePlayer);
      }
    } catch (err) {
      console.error('Error loading/migrating players from storage:', err);
    }
    // For new/fresh instances, mark the schema version as migrated immediately
    localStorage.setItem('vpg_players_schema_version', '2');
    return (INITIAL_PLAYERS as unknown as Player[]).map(normalizePlayer);
  });

  useEffect(() => saveToStorage(STORAGE_KEYS.players, players), [players]);

  const getPlayerHistoryUsage = useCallback(
    (playerId: string) => {
      const playerTeamIds = teams.filter((t) => t.playerIds.includes(playerId)).map((t) => t.id);
      const usedInTeams = playerTeamIds.length > 0;
      const usedInGames = games.some(
        (g) => playerTeamIds.includes(g.teamAId) || playerTeamIds.includes(g.teamBId),
      );
      const usedInPoints = pointEvents.some((p) => p.playerId === playerId);
      return {
        usedInTeams,
        usedInGames,
        usedInPoints,
        hasHistory: usedInTeams || usedInGames || usedInPoints,
      };
    },
    [games, pointEvents, teams],
  );

  const saveGuestPlayer = useCallback(
    (input: {
      playerId: string | null;
      nome: string;
      draft: AthleteProfileDraft;
      communityId: string;
      level: 1 | 2 | 3 | 4 | 5 | null;
      canEdit: boolean;
      currentUserId: string | null;
    }): AppResult<Player> => {
      const existing = input.playerId
        ? players.find((player) => player.id === input.playerId)
        : undefined;

      if (existing && isForeignAccountPlayer(existing, input.currentUserId)) {
        return productError('permission_denied', 'Esta ficha pertence a uma conta.');
      }
      if (!input.canEdit) {
        return productError('permission_denied', 'Voce nao pode editar esta ficha.');
      }

      const result = applyGuestProfileSave({
        players,
        playerId: input.playerId,
        draft: input.draft,
        nome: input.nome,
        communityId: input.communityId,
        level: input.level,
        now: new Date().toISOString(),
        createId: generateUUID,
      });

      if (!result.ok) return result;
      setPlayers(result.value.players);
      return appOk(result.value.savedPlayer);
    },
    [players],
  );

  const removeGuestPlayer = useCallback(
    (input: {
      playerId: string;
      canEdit: boolean;
      currentUserId: string | null;
    }): AppResult<'deactivated'> => {
      const result = applyGuestActiveChange({
        players,
        playerId: input.playerId,
        ativo: false,
        canEdit: input.canEdit,
        currentUserId: input.currentUserId,
        now: new Date().toISOString(),
      });
      if (!result.ok) return result;
      setPlayers(result.value);
      return appOk('deactivated');
    },
    [players],
  );

  const reactivateGuestPlayer = useCallback(
    (input: {
      playerId: string;
      canEdit: boolean;
      currentUserId: string | null;
    }): AppResult<'reactivated'> => {
      const result = applyGuestActiveChange({
        players,
        playerId: input.playerId,
        ativo: true,
        canEdit: input.canEdit,
        currentUserId: input.currentUserId,
        now: new Date().toISOString(),
      });
      if (!result.ok) return result;
      setPlayers(result.value);
      return appOk('reactivated');
    },
    [players],
  );

  const deleteGuestPlayer = useCallback(
    (input: {
      playerId: string;
      isOwner: boolean;
      currentUserId: string | null;
    }): AppResult<'removed' | 'deactivated'> => {
      const result = applyGuestDeletion({
        players,
        playerId: input.playerId,
        isOwner: input.isOwner,
        currentUserId: input.currentUserId,
        usage: getPlayerHistoryUsage(input.playerId),
        now: new Date().toISOString(),
      });
      if (!result.ok) return result;
      setPlayers(result.value.players);
      return appOk(result.value.outcome);
    },
    [players, getPlayerHistoryUsage],
  );

  const handleRestoreDemoPlayers = useCallback(() => {
    if (
      !confirm(
        'Deseja restaurar os atletas de exemplo?\n\nIsso substituirá a lista atual de atletas.',
      )
    )
      return;
    const demo = (INITIAL_PLAYERS as unknown as Player[]).map(normalizePlayer);
    setPlayers(demo);
    localStorage.setItem('vpg_players_schema_version', '1');
  }, []);

  return {
    players: players.filter((p) => !p.deletedAt),
    rawPlayers: players, // Expose full list (with soft deletes) for syncService
    setPlayers,
    getPlayerHistoryUsage,
    saveGuestPlayer,
    removeGuestPlayer,
    reactivateGuestPlayer,
    deleteGuestPlayer,
    handleRestoreDemoPlayers,
  };
}
