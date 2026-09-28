import type { Gender, Player, Position } from '../types';
import { getAutoSpecialty, getAutoWeakness } from '../logic/calculations';
import { findDuplicatePlayerByProfile } from '../logic/playerDuplicates';
import { simulateLocalConsensus } from '../logic/playerEvaluations';
import { resolveUsername } from '../logic/username';
import type { AthleteProfileDraft } from '../domain/athleteProfile';
import { levelFromAttributes, validateAthleteProfile } from '../domain/athleteProfile';
import { buildLevelAttributes } from './quickStart';
import type { AppResult } from './appResult';
import { appOk, productError } from './appResult';

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

export function applyLocalPlayerSave(input: {
  players: Player[];
  editingPlayer: Player;
  communityId: string;
  now: string;
  saveEvaluation?: boolean;
}): { players: Player[]; savedPlayer: Player } {
  const username = resolveUsername(
    input.editingPlayer,
    input.players
      .filter((player) => player.id !== input.editingPlayer.id && player.username)
      .map((player) => player.username as string),
  );
  const originalPlayer =
    input.players.find((player) => player.id === input.editingPlayer.id) || input.editingPlayer;
  const saveEvaluation = input.saveEvaluation ?? true;
  const simulated = saveEvaluation
    ? simulateLocalConsensus(originalPlayer, input.editingPlayer.atributos)
    : null;

  const savedPlayerTemp: Player = {
    ...input.editingPlayer,
    username,
    personalAttributes: saveEvaluation
      ? input.editingPlayer.atributos
      : originalPlayer.personalAttributes,
    atributos: saveEvaluation ? simulated!.atributos : originalPlayer.atributos,
    evaluationAggregate: saveEvaluation
      ? simulated!.evaluationAggregate
      : originalPlayer.evaluationAggregate,
    hasOwnEvaluation: saveEvaluation
      ? simulated!.hasOwnEvaluation
      : originalPlayer.hasOwnEvaluation,
    // Preserva o contexto de avaliação quando o save é só de perfil. Zerar aqui removia o
    // atleta do upload de avaliação legada para sempre (syncService pula quem não tem
    // evaluationCommunityId) — inclusive em comunidades que nunca vão ativar o modelo novo.
    // A omissão de coorte migrada é decidida por resolveTargetCommunityIds, não por isto.
    evaluationCommunityId: saveEvaluation
      ? input.communityId
      : originalPlayer.evaluationCommunityId,
    communityIds: Array.from(
      new Set([...(input.editingPlayer.communityIds ?? []), input.communityId]),
    ),
    syncStatus: 'pending',
    updatedAt: input.now,
  };

  const savedPlayer: Player = {
    ...savedPlayerTemp,
    perfil: {
      ...input.editingPlayer.perfil,
      especialidade: getAutoSpecialty(savedPlayerTemp),
      fraqueza: getAutoWeakness(savedPlayerTemp),
    },
  };

  const exists = input.players.some((player) => player.id === savedPlayer.id);
  const players = exists
    ? input.players.map((player) =>
        player.id === savedPlayer.id
          ? { ...savedPlayer, metadata: { ...savedPlayer.metadata, atualizadoEm: input.now } }
          : player,
      )
    : [...input.players, savedPlayer];

  return { players, savedPlayer };
}

/**
 * O que de fato aconteceu ao "criar" um atleta.
 *
 * `linked` existe porque nome repetido não cria ninguém: vincula o atleta que
 * já estava no elenco da conta a esta comunidade. Sem esse discriminante a tela
 * dizia "criado" para os três casos — inclusive para o nome vazio, que não fazia
 * nada.
 */
export type PlayerCreationResult = {
  players: Player[];
  createdPlayerId: string | null;
  outcome: 'created' | 'linked' | 'empty';
  /** Nome como deve aparecer na confirmação. */
  name: string;
};

export function applyPlayerCreationForCommunity(input: {
  players: Player[];
  name: string;
  communityId: string;
  now: string;
  createId: () => string;
}): PlayerCreationResult {
  const name = input.name.trim();
  if (!name) return { players: input.players, createdPlayerId: null, outcome: 'empty', name: '' };

  const duplicate = findDuplicatePlayerByProfile(input.players, {
    id: '',
    nome: name,
    genero: 'M',
    posicaoPrincipal: 'ponteiro',
    alturaCm: undefined,
  });
  if (duplicate) {
    return {
      outcome: 'linked',
      name: duplicate.apelido || duplicate.nome,
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
    communityId: input.communityId,
    now: input.now,
  });
  return {
    players: [...input.players, player],
    createdPlayerId: player.id,
    outcome: 'created',
    name,
  };
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
