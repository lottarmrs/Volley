import type { Player } from '../types';
import { findDuplicatePlayerByProfile } from '../logic/playerDuplicates';

export type LocalPlayerValidationErrors = Record<string, string>;

export function buildDefaultCommunityPlayer(input: {
  id: string;
  name: string;
  username?: string;
  communityId: string;
  now: string;
}): Player {
  const name = input.name.trim();
  return {
    id: input.id,
    username: input.username,
    nome: name,
    apelido: name,
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
      classe: 'Atleta',
      arquetipo: 'Versatil',
      especialidade: 'Em avaliacao',
      fraqueza: 'Nao informado',
    },
    formaAtual: { valor: 0, observacao: 'Em avaliacao', ultimasPartidas: [] },
    status: { lesionado: false, limitacaoFisica: null, presencaFrequente: true },
    metadata: { criadoEm: input.now, atualizadoEm: input.now },
    communityIds: [input.communityId],
  };
}

export function applyLocalPlayerDeletion(input: {
  players: Player[];
  playerId: string;
  usage: { hasHistory: boolean };
  now: string;
}): Player[] {
  const player = input.players.find((item) => item.id === input.playerId);
  if (!player) return input.players;

  if (player.cloudId) {
    return input.players.map((item) =>
      item.id === input.playerId
        ? { ...item, deletedAt: input.now, syncStatus: 'pending' as const }
        : item,
    );
  }

  if (input.usage.hasHistory) {
    return input.players.map((item) =>
      item.id === input.playerId
        ? {
            ...item,
            ativo: false,
            syncStatus: 'pending' as const,
            metadata: { ...item.metadata, atualizadoEm: input.now },
          }
        : item,
    );
  }

  return input.players.filter((item) => item.id !== input.playerId);
}

export function validateLocalPlayerSave(input: {
  players: Player[];
  player: Player;
}): LocalPlayerValidationErrors {
  const errors: LocalPlayerValidationErrors = {};

  if (!input.player.nome.trim()) {
    errors.nome = 'O nome do atleta é obrigatório.';
  }

  const duplicatePlayer = findDuplicatePlayerByProfile(input.players, input.player);
  if (duplicatePlayer && !errors.nome) {
    errors.nome = `Ja existe um atleta com esse perfil: ${duplicatePlayer.nome}.`;
  }

  if (
    input.player.alturaCm !== undefined &&
    input.player.alturaCm !== null &&
    input.player.alturaCm <= 0
  ) {
    errors.alturaCm = 'A altura deve ser um valor positivo.';
  }

  const invalidAttrs = Object.values(input.player.atributos).filter(
    (value) => value < 0 || value > 10,
  );
  if (invalidAttrs.length > 0) {
    errors.atributos = 'Alguns atributos estão fora do intervalo (0–10).';
  }

  return errors;
}

export function applyPlayerCreationForCommunity(input: {
  players: Player[];
  name: string;
  communityId: string;
  now: string;
  createId: () => string;
  createUsername: (name: string) => string | undefined;
}): { players: Player[]; createdPlayerId: string | null } {
  const name = input.name.trim();
  if (!name) return { players: input.players, createdPlayerId: null };

  const duplicate = findDuplicatePlayerByProfile(input.players, {
    id: '',
    nome: name,
    genero: 'M',
    posicaoPrincipal: 'ponteiro',
    alturaCm: undefined,
  });
  if (duplicate) {
    return {
      createdPlayerId: duplicate.id,
      players: input.players.map((player) =>
        player.id === duplicate.id
          ? {
              ...player,
              communityIds: Array.from(
                new Set([...(player.communityIds ?? []), input.communityId]),
              ),
              syncStatus: 'pending',
              updatedAt: input.now,
            }
          : player,
      ),
    };
  }

  const player = buildDefaultCommunityPlayer({
    id: input.createId(),
    name,
    username: input.createUsername(name),
    communityId: input.communityId,
    now: input.now,
  });
  return { players: [...input.players, player], createdPlayerId: player.id };
}

export function applyGuestPlayerUpsert(
  players: Player[],
  guestPlayer: Player,
): { players: Player[]; selectedPlayer: Player; wasCreated: boolean } {
  const duplicate = findDuplicatePlayerByProfile(players, guestPlayer);
  if (duplicate) return { players, selectedPlayer: duplicate, wasCreated: false };
  return { players: [...players, guestPlayer], selectedPlayer: guestPlayer, wasCreated: true };
}
