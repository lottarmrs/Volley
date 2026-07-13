import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyGuestPlayerUpsert,
  applyPlayerCreationForCommunity,
  buildDefaultCommunityPlayer,
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
