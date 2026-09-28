import type { Gender, Player, Position } from '../types';
import { findDuplicatePlayerByProfile } from '../logic/playerDuplicates';
import type { AthleteProfileDraft } from '../domain/athleteProfile';
import { levelFromAttributes, validateAthleteProfile } from '../domain/athleteProfile';
import { buildLevelAttributes } from './quickStart';
import type { AppResult } from './appResult';
import { appOk, productError } from './appResult';

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
      fraqueza: 'Não informado',
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

export function isForeignAccountPlayer(player: Player, currentUserId: string | null): boolean {
  return !!player.userId && player.userId !== currentUserId;
}

export function applyGuestProfileSave(input: {
  players: Player[];
  playerId: string | null;
  draft: AthleteProfileDraft;
  nome: string;
  communityId: string;
  level: 1 | 2 | 3 | 4 | 5 | null;
  now: string;
  createId: () => string;
}): AppResult<{ players: Player[]; savedPlayer: Player }> {
  const nome = input.nome.trim();
  if (!nome) return productError('invalid_input', 'O nome do atleta é obrigatório.');

  const existing = input.playerId
    ? (input.players.find((player) => player.id === input.playerId) ?? null)
    : null;
  if (existing?.userId) {
    return productError('permission_denied', 'Esta ficha pertence a uma conta.');
  }

  const draftErrors = validateAthleteProfile(input.draft);
  const firstError = Object.values(draftErrors)[0];
  if (firstError) return productError('invalid_input', firstError);

  const base =
    existing ??
    buildDefaultCommunityPlayer({
      id: input.playerId ?? input.createId(),
      name: nome,
      communityId: input.communityId,
      now: input.now,
    });

  const currentLevel = existing ? levelFromAttributes(existing.atributos) : null;
  const shouldApplyLevel = input.level !== null && (!existing || input.level !== currentLevel);

  const savedPlayer: Player = {
    ...base,
    nome,
    apelido: input.draft.apelido.trim() || nome,
    genero: input.draft.genero as Gender,
    posicaoPrincipal: input.draft.posicaoPrincipal as Position,
    posicoesSecundarias: input.draft.posicoesSecundarias,
    alturaCm: input.draft.alturaCm ?? undefined,
    maoDominante: input.draft.maoDominante as 'direita' | 'esquerda',
    atributos: shouldApplyLevel ? buildLevelAttributes(input.level as number) : base.atributos,
    status: {
      ...base.status,
      lesionado: input.draft.lesionado ?? base.status.lesionado,
      limitacaoFisica: input.draft.limitacaoFisica ?? base.status.limitacaoFisica,
    },
    communityIds: Array.from(new Set([...(base.communityIds ?? []), input.communityId])),
    syncStatus: 'pending',
    updatedAt: input.now,
  };

  const exists = input.players.some((player) => player.id === savedPlayer.id);
  const players = exists
    ? input.players.map((player) => (player.id === savedPlayer.id ? savedPlayer : player))
    : [...input.players, savedPlayer];

  return appOk({ players, savedPlayer });
}

export function applyGuestPlayerUpsert(
  players: Player[],
  guestPlayer: Player,
  communityId: string,
): { players: Player[]; selectedPlayer: Player; wasCreated: boolean } {
  const duplicate = findDuplicatePlayerByProfile(players, guestPlayer);
  if (duplicate) return { players, selectedPlayer: duplicate, wasCreated: false };
  const selectedPlayer: Player = {
    ...guestPlayer,
    communityIds: Array.from(new Set([...(guestPlayer.communityIds ?? []), communityId])),
  };
  return { players: [...players, selectedPlayer], selectedPlayer, wasCreated: true };
}
