import { useState, useEffect, useCallback } from 'react';
import { Player, Game, PointEvent, Team } from '../types';
import { INITIAL_PLAYERS } from '../constants';
import { STORAGE_KEYS, saveToStorage } from '../storage/localStorageRepository';
import { generateUUID } from '../logic/uuid';
import {
  applyLocalPlayerDeletion,
  applyLocalPlayerSave,
  validateLocalPlayerSave,
} from '../application/localPlayerUseCases';

function normalizePlayer(p: any): Player {
  return {
    ...p,
    apelido: p.apelido ?? p.nome,
    ativo: p.ativo ?? true,
    posicoesSecundarias: p.posicoesSecundarias ?? [],
    status: p.status ?? { lesionado: false, limitacaoFisica: null, presencaFrequente: true },
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

  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

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

  const handleSavePlayer = useCallback(
    (permissions?: { canEditPlayerProfile: boolean; canEvaluatePlayer: boolean }) => {
      if (!editingPlayer) return false;

      const original = players.find((p) => p.id === editingPlayer.id);

      // Impedir edição direta da propriedade userId
      if (original && original.userId !== editingPlayer.userId) {
        throw new Error('PERMISSION_DENIED');
      }
      if (!original && editingPlayer.userId) {
        throw new Error('PERMISSION_DENIED');
      }

      if (permissions) {
        if (!permissions.canEvaluatePlayer) {
          throw new Error('PERMISSION_DENIED');
        }

        if (!permissions.canEditPlayerProfile && original) {
          const profileFieldsChanged =
            original.nome !== editingPlayer.nome ||
            original.apelido !== editingPlayer.apelido ||
            original.posicaoPrincipal !== editingPlayer.posicaoPrincipal ||
            JSON.stringify(original.posicoesSecundarias) !==
              JSON.stringify(editingPlayer.posicoesSecundarias) ||
            original.genero !== editingPlayer.genero ||
            original.alturaCm !== editingPlayer.alturaCm ||
            original.maoDominante !== editingPlayer.maoDominante ||
            original.ativo !== editingPlayer.ativo ||
            original.isGuest !== editingPlayer.isGuest ||
            original.status.lesionado !== editingPlayer.status.lesionado ||
            original.status.presencaFrequente !== editingPlayer.status.presencaFrequente ||
            original.status.limitacaoFisica !== editingPlayer.status.limitacaoFisica ||
            original.formaAtual.valor !== editingPlayer.formaAtual.valor ||
            original.formaAtual.observacao !== editingPlayer.formaAtual.observacao;

          if (profileFieldsChanged) {
            throw new Error('PERMISSION_DENIED');
          }
        }
      }

      const errors = validateLocalPlayerSave({ players, player: editingPlayer });

      if (Object.keys(errors).length > 0) {
        setValidationErrors(errors);
        return false;
      }

      // ponytail: this generic save flow has no "active community" context wired
      // yet (that lands with the dedicated evaluation UI); fall back to the
      // player's own first community so the upload is never mis-tagged.
      const { players: updated } = applyLocalPlayerSave({
        players,
        editingPlayer,
        communityId: editingPlayer.communityIds?.[0] ?? '',
        now: new Date().toISOString(),
      });

      setPlayers(updated);
      setEditingPlayer(null);
      setValidationErrors({});
      return true;
    },
    [editingPlayer, players],
  );

  const handleDeletePlayer = useCallback(
    (permissions?: { canEditPlayerProfile: boolean }) => {
      if (!editingPlayer) return;

      if (permissions && !permissions.canEditPlayerProfile) {
        throw new Error('PERMISSION_DENIED');
      }

      const updated = applyLocalPlayerDeletion({
        players,
        playerId: editingPlayer.id,
        usage: getPlayerHistoryUsage(editingPlayer.id),
        now: new Date().toISOString(),
      });

      setPlayers(updated);
      setEditingPlayer(null);
      setShowDeleteConfirm(false);
    },
    [editingPlayer, players, getPlayerHistoryUsage],
  );

  const handleEditPlayer = useCallback((player: Player) => {
    setEditingPlayer({
      ...player,
      atributos: player.personalAttributes || player.atributos,
    });
    setValidationErrors({});
    setShowDeleteConfirm(false);
  }, []);

  const handleAddPlayer = useCallback(() => {
    const now = new Date().toISOString();
    const newPlayer: Player = {
      id: generateUUID(),
      nome: '',
      apelido: '',
      genero: 'M',
      ativo: true,
      posicaoPrincipal: 'ponteiro',
      posicoesSecundarias: [],
      maoDominante: 'direita',
      atributos: {
        saque: 5,
        recepcao: 5,
        levantamento: 5,
        ataque: 5,
        bloqueio: 5,
        defesa: 5,
        velocidade: 5,
        resistencia: 5,
        leituraDeJogo: 5,
        regularidade: 5,
        controleEmocional: 5,
      },
      perfil: {
        nivel: 1,
        classe: 'Recruta',
        arquetipo: 'Versátil',
        especialidade: 'Novato',
        fraqueza: 'Inexperiência',
      },
      formaAtual: { valor: 0, observacao: 'Em treinamento', ultimasPartidas: [] },
      status: { lesionado: false, limitacaoFisica: null, presencaFrequente: true },
      metadata: { criadoEm: now, atualizadoEm: now },
      communityIds: [],
      syncStatus: 'local',
      updatedAt: now,
    };
    setEditingPlayer(newPlayer);
    setValidationErrors({});
    setShowDeleteConfirm(false);
  }, []);

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
    editingPlayer,
    setEditingPlayer,
    validationErrors,
    setValidationErrors,
    showDeleteConfirm,
    setShowDeleteConfirm,
    getPlayerHistoryUsage,
    handleSavePlayer,
    handleDeletePlayer,
    handleEditPlayer,
    handleAddPlayer,
    handleRestoreDemoPlayers,
  };
}
