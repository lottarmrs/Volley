import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyLocalPlayerDeletion,
  applyLocalPlayerSave,
  applyGuestPlayerUpsert,
  applyPlayerCreationForCommunity,
  buildDefaultCommunityPlayer,
  validateLocalPlayerSave,
} from './localPlayerUseCases';
import type { Player } from '../types';

const now = '2026-07-13T12:00:00.000Z';

function player(id: string, name: string, communityIds: string[] = []): Player {
  return {
    id,
    username: name.toLowerCase(),
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
    perfil: { nivel: 1, classe: 'Atleta', arquetipo: '', especialidade: '', fraqueza: '' },
    formaAtual: { valor: 0, observacao: '', ultimasPartidas: [] },
    status: { lesionado: false, limitacaoFisica: null, presencaFrequente: true },
    metadata: { criadoEm: now, atualizadoEm: now },
    communityIds,
  };
}

test('buildDefaultCommunityPlayer creates a local player with defaults and community membership', () => {
  const built = buildDefaultCommunityPlayer({
    id: 'new-id',
    name: ' Ana Silva ',
    username: 'ana-silva',
    communityId: 'community-1',
    now,
  });

  assert.equal(built.id, 'new-id');
  assert.equal(built.nome, 'Ana Silva');
  assert.equal(built.apelido, 'Ana Silva');
  assert.equal(built.username, 'ana-silva');
  assert.deepEqual(built.communityIds, ['community-1']);
  assert.equal(built.metadata.criadoEm, now);
});

test('applyLocalPlayerSave updates an existing player as pending with personal evaluation data', () => {
  const existing = player('player-1', 'Ana Silva');
  const draft = {
    ...existing,
    apelido: 'Ana',
    atributos: { ...existing.atributos, ataque: 9 },
  };

  const result = applyLocalPlayerSave({
    players: [existing],
    editingPlayer: draft,
    communityId: 'community-1',
    now,
  });

  assert.equal(result.players.length, 1);
  assert.equal(result.savedPlayer.id, 'player-1');
  assert.equal(result.savedPlayer.syncStatus, 'pending');
  assert.equal(result.savedPlayer.updatedAt, now);
  assert.equal(result.savedPlayer.personalAttributes?.ataque, 9);
  assert.equal(result.savedPlayer.evaluationCommunityId, 'community-1');
  assert.equal(result.players[0].metadata.atualizadoEm, now);
});

test('applyLocalPlayerSave appends new players and preserves the resolved username', () => {
  const existing = player('player-1', 'Ana Silva');
  const draft = player('player-2', 'Ana Silva');

  const result = applyLocalPlayerSave({
    players: [existing],
    editingPlayer: draft,
    communityId: 'community-1',
    now,
  });

  assert.equal(result.players.length, 2);
  assert.equal(result.savedPlayer.id, 'player-2');
  assert.equal(result.savedPlayer.username, draft.username);
  assert.equal(result.savedPlayer.syncStatus, 'pending');
});

test('applyPlayerCreationForCommunity reuses duplicate players and adds the community once', () => {
  const existing = player('player-1', 'Ana Silva', ['community-1']);

  const result = applyPlayerCreationForCommunity({
    players: [existing],
    name: ' Ana Silva ',
    communityId: 'community-2',
    now,
    createId: () => 'unused',
    createUsername: () => 'unused',
  });

  assert.equal(result.createdPlayerId, 'player-1');
  assert.equal(result.players.length, 1);
  assert.deepEqual(result.players[0].communityIds, ['community-1', 'community-2']);
  assert.equal(result.players[0].syncStatus, 'pending');
  assert.equal(result.players[0].updatedAt, now);
});

test('applyPlayerCreationForCommunity appends a new player when no duplicate exists', () => {
  const result = applyPlayerCreationForCommunity({
    players: [],
    name: 'Bruna',
    communityId: 'community-1',
    now,
    createId: () => 'player-new',
    createUsername: () => 'bruna',
  });

  assert.equal(result.createdPlayerId, 'player-new');
  assert.equal(result.players.length, 1);
  assert.equal(result.players[0].nome, 'Bruna');
  assert.equal(result.players[0].username, 'bruna');
});

test('applyPlayerCreationForCommunity ignores blank names', () => {
  const result = applyPlayerCreationForCommunity({
    players: [player('player-1', 'Ana')],
    name: '   ',
    communityId: 'community-1',
    now,
    createId: () => 'unused',
    createUsername: () => 'unused',
  });

  assert.equal(result.createdPlayerId, null);
  assert.equal(result.players.length, 1);
});

test('applyGuestPlayerUpsert reuses duplicate guests and appends new guests', () => {
  const existing = player('player-1', 'Convidado');
  const duplicateGuest = { ...player('guest-1', 'Convidado'), isGuest: true };
  const newGuest = { ...player('guest-2', 'Visitante'), isGuest: true };

  const reused = applyGuestPlayerUpsert([existing], duplicateGuest);
  assert.equal(reused.selectedPlayer.id, 'player-1');
  assert.equal(reused.players.length, 1);
  assert.equal(reused.wasCreated, false);

  const inserted = applyGuestPlayerUpsert([existing], newGuest);
  assert.equal(inserted.selectedPlayer.id, 'guest-2');
  assert.equal(inserted.players.length, 2);
  assert.equal(inserted.wasCreated, true);
});

test('applyLocalPlayerDeletion soft-deletes cloud players', () => {
  const existing = { ...player('player-1', 'Ana'), cloudId: 'cloud-player-1' };

  const result = applyLocalPlayerDeletion({
    players: [existing],
    playerId: 'player-1',
    usage: { hasHistory: false },
    now,
  });

  assert.equal(result[0].deletedAt, now);
  assert.equal(result[0].syncStatus, 'pending');
});

test('applyLocalPlayerDeletion inactivates local players with history', () => {
  const existing = player('player-1', 'Ana');

  const result = applyLocalPlayerDeletion({
    players: [existing],
    playerId: 'player-1',
    usage: { hasHistory: true },
    now,
  });

  assert.equal(result.length, 1);
  assert.equal(result[0].ativo, false);
  assert.equal(result[0].syncStatus, 'pending');
  assert.equal(result[0].metadata.atualizadoEm, now);
});

test('applyLocalPlayerDeletion removes local players without history', () => {
  const result = applyLocalPlayerDeletion({
    players: [player('player-1', 'Ana')],
    playerId: 'player-1',
    usage: { hasHistory: false },
    now,
  });

  assert.deepEqual(result, []);
});

test('validateLocalPlayerSave requires a non-empty player name', () => {
  const result = validateLocalPlayerSave({
    players: [],
    player: { ...player('player-1', '   '), nome: '   ' },
  });

  assert.equal(result.nome, 'O nome do atleta é obrigatório.');
});

test('validateLocalPlayerSave detects duplicate player profiles', () => {
  const existing = player('player-1', 'Ana Silva');
  const draft = { ...player('player-2', 'Ana Silva'), username: 'ana-2' };

  const result = validateLocalPlayerSave({
    players: [existing],
    player: draft,
  });

  assert.equal(result.nome, 'Ja existe um atleta com esse perfil: Ana Silva.');
});

test('validateLocalPlayerSave rejects non-positive heights and out-of-range attributes', () => {
  const draft = {
    ...player('player-1', 'Ana'),
    alturaCm: 0,
    atributos: { ...player('attrs', 'Attrs').atributos, saque: 11 },
  };

  const result = validateLocalPlayerSave({
    players: [],
    player: draft,
  });

  assert.equal(result.alturaCm, 'A altura deve ser um valor positivo.');
  assert.equal(result.atributos, 'Alguns atributos estão fora do intervalo (0–10).');
});
