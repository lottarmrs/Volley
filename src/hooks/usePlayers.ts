import { useState, useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Community, Player, Game, PointEvent, Team } from '../types';
import { INITIAL_PLAYERS } from '../constants';
import { STORAGE_KEYS, saveToStorage } from '../storage/localStorageRepository';
import { generateUUID } from '../logic/uuid';
import {
  applyGuestActiveChange,
  applyGuestDeletion,
  applyGuestPlayerUpsert,
  applyGuestProfileSave,
  isForeignAccountPlayer,
} from '../application/localPlayerUseCases';
import { applyLinkedCloudPlayer } from '../application/localCommunityUseCases';
import { fetchMyCommunities, fetchRoster } from '../application/communityDataQueries';
import { queryKeys } from '../application/queryKeys';
import type { AthleteProfileDraft } from '../domain/athleteProfile';
import { appOk, productError, type AppResult } from '../application/appResult';
import { playerCloudService } from '../infra/supabase/playerCloudService';
import { communityPlayerCloudService } from '../infra/supabase/communityPlayerCloudService';
import { useOnlineAccount, useOnlineList } from './useOnlineList';

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

function loadLocalPlayers(): Player[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.players);
    if (raw !== null) {
      let loaded = JSON.parse(raw);

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
  localStorage.setItem('vpg_players_schema_version', '2');
  return (INITIAL_PLAYERS as unknown as Player[]).map(normalizePlayer);
}

function diffPlayers(prev: Player[], next: Player[]) {
  const before = new Map(prev.map((player) => [player.id, player]));
  const nextIds = new Set(next.map((player) => player.id));
  return {
    changed: next.filter((player) => before.get(player.id) !== player),
    removed: prev.filter((player) => !nextIds.has(player.id)),
    before,
  };
}

export function usePlayers(games: Game[], pointEvents: PointEvent[], teams: Team[]) {
  const { online, userId } = useOnlineAccount();
  const queryClient = useQueryClient();
  const [localPlayers, setLocalPlayers] = useState<Player[]>(loadLocalPlayers);
  const remote = useOnlineList<Player>({
    enabled: online,
    queryKey: queryKeys.atletas(userId ?? ''),
    fetch: async () => {
      const communities = await queryClient.ensureQueryData<Community[]>({
        queryKey: queryKeys.comunidades(userId ?? ''),
        queryFn: fetchMyCommunities,
      });
      return (await fetchRoster(userId ?? '', communities)).map(normalizePlayer);
    },
  });
  const players = online ? remote.data : localPlayers;

  useEffect(() => {
    if (!online) saveToStorage(STORAGE_KEYS.players, localPlayers);
  }, [localPlayers, online]);

  const communityCloudId = useCallback(
    (communityId: string) => {
      const communities =
        queryClient.getQueryData<Community[]>(queryKeys.comunidades(userId ?? '')) ?? [];
      return communities.find((item) => item.id === communityId)?.cloudId ?? null;
    },
    [queryClient, userId],
  );

  const persistPlayer = useCallback(
    async (player: Player, before: Player | undefined) => {
      if (!userId) return;
      if (player.deletedAt) {
        if (player.cloudId && !(await playerCloudService.softDelete(player.cloudId))) {
          throw { code: '42501', message: 'Só o dono da comunidade pode excluir este convidado.' };
        }
        return;
      }
      if (player.userId && player.userId !== userId) return;
      const saved = await playerCloudService.upsert(player, player.cloudOwnerId ?? userId);
      const known = new Set(before?.communityIds ?? []);
      for (const communityId of player.communityIds ?? []) {
        if (known.has(communityId)) continue;
        const cloudCommunityId = communityCloudId(communityId);
        if (!cloudCommunityId || !saved.cloudId) continue;
        await communityPlayerCloudService.linkPlayer(cloudCommunityId, saved.cloudId, userId);
      }
    },
    [communityCloudId, userId],
  );

  const commit = useCallback(
    (next: Player[]) => {
      if (!online) {
        setLocalPlayers(next);
        return;
      }
      const { changed, removed, before } = diffPlayers(players, next);
      void remote.write(
        () => next,
        async () => {
          for (const player of removed) {
            await persistPlayer({ ...player, deletedAt: new Date().toISOString() }, player);
          }
          for (const player of changed) await persistPlayer(player, before.get(player.id));
        },
      );
    },
    [online, persistPlayer, players, remote],
  );

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
      commit(result.value.players);
      return appOk(result.value.savedPlayer);
    },
    [players, commit],
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
      commit(result.value);
      return appOk('deactivated');
    },
    [players, commit],
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
      commit(result.value);
      return appOk('reactivated');
    },
    [players, commit],
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
      commit(result.value.players);
      return appOk(result.value.outcome);
    },
    [players, commit, getPlayerHistoryUsage],
  );

  const handleRestoreDemoPlayers = useCallback(() => {
    if (
      !confirm(
        'Deseja restaurar os atletas de exemplo?\n\nIsso substituirá a lista atual de atletas.',
      )
    )
      return;
    const demo = (INITIAL_PLAYERS as unknown as Player[]).map(normalizePlayer);
    setLocalPlayers(demo);
    localStorage.setItem('vpg_players_schema_version', '1');
  }, []);

  const addPlayers = useCallback(
    (novos: Player[]) => {
      commit([...players, ...novos]);
    },
    [commit, players],
  );

  const upsertQuickGuest = useCallback(
    (guest: Player, communityId: string) => {
      const result = applyGuestPlayerUpsert(players, guest, communityId);
      commit(result.players);
      return result;
    },
    [commit, players],
  );

  const applyProgression = useCallback(
    async (atualizados: Player[]) => {
      if (!online) {
        setLocalPlayers(atualizados);
        return;
      }
      const { changed, before } = diffPlayers(players, atualizados);
      remote.setData(() => atualizados);
      for (const player of changed) {
        try {
          await persistPlayer(player, before.get(player.id));
        } catch {
          continue;
        }
      }
      void remote.refresh();
    },
    [online, persistPlayer, players, remote],
  );

  const linkCloudPlayer = useCallback(
    (player: Player, communityId: string) => {
      if (!online) {
        setLocalPlayers((prev) => applyLinkedCloudPlayer(prev, player, communityId));
        return;
      }
      remote.setData((prev) => applyLinkedCloudPlayer(prev, player, communityId));
      void remote.refresh();
    },
    [online, remote],
  );

  const replacePlayer = useCallback(
    (atualizado: Player) => {
      const swap = (list: Player[]) =>
        list.map((player) => (player.id === atualizado.id ? atualizado : player));
      if (!online) {
        setLocalPlayers(swap);
        return;
      }
      remote.setData(swap);
      void remote.refresh();
    },
    [online, remote],
  );

  const setAvatar = useCallback(
    (playerId: string, url: string) => {
      const apply = (list: Player[]) =>
        list.map((player) => (player.id === playerId ? { ...player, avatarUrl: url } : player));
      if (online) remote.setData(apply);
      else setLocalPlayers(apply);
    },
    [online, remote],
  );

  const forgetCommunity = useCallback(
    (communityId: string) => {
      if (online) {
        void remote.refresh();
        return;
      }
      setLocalPlayers((prev) =>
        prev.map((player) => ({
          ...player,
          communityIds: (player.communityIds ?? []).filter((id) => id !== communityId),
        })),
      );
    },
    [online, remote],
  );

  const refreshRoster = useCallback(() => {
    if (online) void remote.refresh();
  }, [online, remote]);

  return {
    players: players.filter((p) => !p.deletedAt),
    rawPlayers: players,
    online,
    status: remote.status,
    getPlayerHistoryUsage,
    saveGuestPlayer,
    removeGuestPlayer,
    reactivateGuestPlayer,
    deleteGuestPlayer,
    handleRestoreDemoPlayers,
    replaceLocalPlayers: setLocalPlayers,
    addPlayers,
    upsertQuickGuest,
    applyProgression,
    linkCloudPlayer,
    replacePlayer,
    setAvatar,
    forgetCommunity,
    refreshRoster,
  };
}
