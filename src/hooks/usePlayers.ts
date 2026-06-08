import { useState, useEffect, useCallback } from 'react';
import { Player, Attributes, Game, PointEvent, Team } from '../types';
import { INITIAL_PLAYERS } from '../constants';
import { STORAGE_KEYS, saveToStorage } from '../storage/localStorageRepository';
import { getAutoSpecialty, getAutoWeakness } from '../logic/calculations';

function normalizePlayer(p: any): Player {
  return {
    ...p,
    apelido: p.apelido ?? p.nome,
    ativo: p.ativo ?? true,
    posicoesSecundarias: p.posicoesSecundarias ?? [],
    status: p.status ?? { lesionado: false, limitacaoFisica: null, presencaFrequente: true },
    metadata: p.metadata ?? { criadoEm: new Date().toISOString(), atualizadoEm: new Date().toISOString() },
    communityIds: p.communityIds ?? []
  };
}

export function usePlayers(
  games: Game[],
  pointEvents: PointEvent[],
  teams: Team[]
) {
  const [players, setPlayers] = useState<Player[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.players);
      if (raw !== null) {
        let loaded = JSON.parse(raw);
        
        // Migrate old 0-10 physical form values to the new -5 to 5 scale
        const version = localStorage.getItem('vpg_players_schema_version');
        if (version !== '1') {
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
                  ultimasPartidas
                }
              };
            }
            return p;
          });
          localStorage.setItem(STORAGE_KEYS.players, JSON.stringify(loaded));
          localStorage.setItem('vpg_players_schema_version', '1');
        }
        return loaded.map(normalizePlayer);
      }
    } catch (err) {
      console.error('Error loading/migrating players from storage:', err);
    }
    // For new/fresh instances, mark the schema version as migrated immediately
    localStorage.setItem('vpg_players_schema_version', '1');
    return (INITIAL_PLAYERS as unknown as Player[]).map(normalizePlayer);
  });

  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => saveToStorage(STORAGE_KEYS.players, players), [players]);

  const getPlayerHistoryUsage = useCallback((playerId: string) => {
    const playerTeamIds = teams.filter(t => t.playerIds.includes(playerId)).map(t => t.id);
    const usedInTeams = playerTeamIds.length > 0;
    const usedInGames = games.some(g => playerTeamIds.includes(g.teamAId) || playerTeamIds.includes(g.teamBId));
    const usedInPoints = pointEvents.some(p => p.playerId === playerId);
    return { usedInTeams, usedInGames, usedInPoints, hasHistory: usedInTeams || usedInGames || usedInPoints };
  }, [games, pointEvents, teams]);

  const handleSavePlayer = useCallback(() => {
    if (!editingPlayer) return false;

    const errors: Record<string, string> = {};
    if (!editingPlayer.nome.trim()) errors.nome = 'O nome do atleta é obrigatório.';
    if (editingPlayer.alturaCm !== undefined && editingPlayer.alturaCm !== null && editingPlayer.alturaCm <= 0)
      errors.alturaCm = 'A altura deve ser um valor positivo.';

    const invalidAttrs = (Object.entries(editingPlayer.atributos) as Array<[keyof Attributes, number]>)
      .filter(([, val]) => val < 0 || val > 10);
    if (invalidAttrs.length > 0)
      errors.atributos = 'Alguns atributos estão fora do intervalo (0–10).';

    if (Object.keys(errors).length > 0) { setValidationErrors(errors); return false; }

    const now = new Date().toISOString();
    const savedPlayer: Player = {
      ...editingPlayer,
      perfil: {
        ...editingPlayer.perfil,
        especialidade: getAutoSpecialty(editingPlayer),
        fraqueza: getAutoWeakness(editingPlayer)
      },
      syncStatus: 'pending',
      updatedAt: now
    };

    const exists = players.some(p => p.id === savedPlayer.id);
    const updated = exists
      ? players.map(p => p.id === savedPlayer.id ? { ...savedPlayer, metadata: { ...savedPlayer.metadata, atualizadoEm: now } } : p)
      : [...players, savedPlayer];

    setPlayers(updated);
    setEditingPlayer(null);
    setValidationErrors({});
    return true;
  }, [editingPlayer, players]);

  const handleDeletePlayer = useCallback(() => {
    if (!editingPlayer) return;
    const usage = getPlayerHistoryUsage(editingPlayer.id);
    const hasCloud = !!editingPlayer.cloudId;

    let updated: Player[];
    if (hasCloud) {
      updated = players.map(p => p.id === editingPlayer.id
        ? { ...p, deletedAt: new Date().toISOString(), syncStatus: 'pending' as const }
        : p
      );
    } else if (usage.hasHistory) {
      updated = players.map(p => p.id === editingPlayer.id
        ? { ...p, ativo: false, syncStatus: 'pending' as const, metadata: { ...p.metadata, atualizadoEm: new Date().toISOString() } }
        : p);
    } else {
      updated = players.filter(p => p.id !== editingPlayer.id);
    }

    setPlayers(updated);
    setEditingPlayer(null);
    setShowDeleteConfirm(false);
  }, [editingPlayer, players, getPlayerHistoryUsage]);

  const handleEditPlayer = useCallback((player: Player) => {
    setEditingPlayer({ ...player });
    setValidationErrors({});
    setShowDeleteConfirm(false);
  }, []);

  const handleAddPlayer = useCallback(() => {
    const now = new Date().toISOString();
    const newPlayer: Player = {
      id: `player-${Date.now()}`,
      nome: '',
      apelido: '',
      genero: 'M',
      ativo: true,
      posicaoPrincipal: 'ponteiro',
      posicoesSecundarias: [],
      maoDominante: 'direita',
      atributos: {
        saque: 5, recepcao: 5, levantamento: 5, ataque: 5, bloqueio: 5,
        defesa: 5, velocidade: 5, resistencia: 5, leituraDeJogo: 5,
        regularidade: 5, controleEmocional: 5
      },
      perfil: { nivel: 1, classe: 'Recruta', arquetipo: 'Versátil', especialidade: 'Novato', fraqueza: 'Inexperiência' },
      formaAtual: { valor: 0, observacao: 'Em treinamento', ultimasPartidas: [] },
      status: { lesionado: false, limitacaoFisica: null, presencaFrequente: true },
      metadata: { criadoEm: now, atualizadoEm: now },
      communityIds: [],
      syncStatus: 'local',
      updatedAt: now
    };
    setEditingPlayer(newPlayer);
    setValidationErrors({});
    setShowDeleteConfirm(false);
  }, []);

  const handleRestoreDemoPlayers = useCallback(() => {
    if (!confirm('Deseja restaurar os atletas de exemplo?\n\nIsso substituirá a lista atual de atletas.')) return;
    const demo = (INITIAL_PLAYERS as unknown as Player[]).map(normalizePlayer);
    setPlayers(demo);
    localStorage.setItem('vpg_players_schema_version', '1');
  }, []);

  return {
    players: players.filter(p => !p.deletedAt),
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
    handleRestoreDemoPlayers
  };
}
