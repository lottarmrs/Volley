import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyLocalPlayerDeletion,
  applyLocalPlayerSave,
  applyGuestPlayerUpsert,
  applyGuestProfileSave,
  applyPlayerCreationForCommunity,
  buildDefaultCommunityPlayer,
  isForeignAccountPlayer,
  validateLocalPlayerSave,
} from './localPlayerUseCases';
import { buildLevelAttributes } from './quickStart';
import { draftFromPlayer, levelFromAttributes } from '../domain/athleteProfile';
import { makePlayer } from '../test/fixtures';
import type { Player } from '../types';

function makeGuest(id: string): Player {
  return makePlayer(id, { userId: undefined, communityIds: ['c1'], alturaCm: 175 });
}

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

test('applyLocalPlayerSave preserva o contexto de avaliação num save só de perfil', () => {
  const existing = {
    ...player('player-1', 'Ana'),
    cloudId: 'cloud-player-1',
    evaluationCommunityId: 'community-legacy',
    personalAttributes: { ...player('attrs', 'Attrs').atributos, saque: 4 },
  };
  const draft = {
    ...existing,
    apelido: 'Aninha',
    atributos: { ...existing.atributos, saque: 9 },
  };

  const result = applyLocalPlayerSave({
    players: [existing],
    editingPlayer: draft,
    communityId: 'community-target',
    now,
    saveEvaluation: false,
  });

  assert.equal(result.savedPlayer.apelido, 'Aninha');
  assert.equal(result.savedPlayer.atributos.saque, existing.atributos.saque);
  assert.equal(result.savedPlayer.personalAttributes?.saque, 4);
  // Zerar aqui removia o atleta do upload de avaliação legada para sempre — o sync pula
  // quem não tem evaluationCommunityId — inclusive em comunidades que nunca vão migrar.
  // Quem decide omitir uma coorte migrada é resolveTargetCommunityIds, no envio.
  assert.equal(result.savedPlayer.evaluationCommunityId, 'community-legacy');
});

test('applyLocalPlayerSave stamps the community on new players so they are reachable', () => {
  const draft = player('player-new', 'Bruna', []);

  const result = applyLocalPlayerSave({
    players: [],
    editingPlayer: draft,
    communityId: 'community-1',
    now,
  });

  assert.deepEqual(result.savedPlayer.communityIds, ['community-1']);
});

test('applyLocalPlayerSave adds the community to an existing player without dropping prior memberships', () => {
  const existing = player('player-1', 'Ana', ['community-1']);
  const draft = { ...existing, apelido: 'Aninha' };

  const result = applyLocalPlayerSave({
    players: [existing],
    editingPlayer: draft,
    communityId: 'community-2',
    now,
  });

  assert.deepEqual(result.savedPlayer.communityIds, ['community-1', 'community-2']);
});

test('applyPlayerCreationForCommunity reuses duplicate players and adds the community once', () => {
  const existing = player('player-1', 'Ana Silva', ['community-1']);

  const result = applyPlayerCreationForCommunity({
    players: [existing],
    name: ' Ana Silva ',
    communityId: 'community-2',
    now,
    createId: () => 'unused',
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
  });

  assert.equal(result.createdPlayerId, 'player-new');
  assert.equal(result.players.length, 1);
  assert.equal(result.players[0].nome, 'Bruna');
  assert.equal(result.players[0].username, undefined);
});

test('applyPlayerCreationForCommunity cria atleta sem handle', () => {
  const result = applyPlayerCreationForCommunity({
    players: [],
    name: 'Ana Souza',
    communityId: 'c1',
    now: '2026-08-14T00:00:00.000Z',
    createId: () => 'p1',
  });
  const created = result.players.find((player) => player.id === 'p1');
  assert.equal(created?.username, undefined);
  assert.deepEqual(created?.communityIds, ['c1']);
});

test('applyPlayerCreationForCommunity ignores blank names', () => {
  const result = applyPlayerCreationForCommunity({
    players: [player('player-1', 'Ana')],
    name: '   ',
    communityId: 'community-1',
    now,
    createId: () => 'unused',
  });

  assert.equal(result.createdPlayerId, null);
  assert.equal(result.players.length, 1);
});

test('applyGuestPlayerUpsert reuses duplicate guests and appends new guests', () => {
  const existing = player('player-1', 'Convidado');
  const duplicateGuest = { ...player('guest-1', 'Convidado'), isGuest: true };
  const newGuest = { ...player('guest-2', 'Visitante'), isGuest: true };

  const reused = applyGuestPlayerUpsert([existing], duplicateGuest, 'community-1');
  assert.equal(reused.selectedPlayer.id, 'player-1');
  assert.equal(reused.players.length, 1);
  assert.equal(reused.wasCreated, false);

  const inserted = applyGuestPlayerUpsert([existing], newGuest, 'community-1');
  assert.equal(inserted.selectedPlayer.id, 'guest-2');
  assert.equal(inserted.players.length, 2);
  assert.equal(inserted.wasCreated, true);
});

test('applyGuestPlayerUpsert vincula o convidado à comunidade sem duplicar ids', () => {
  const newGuest = { ...player('guest-2', 'Visitante'), isGuest: true, communityIds: [] };

  const inserted = applyGuestPlayerUpsert([], newGuest, 'community-1');
  assert.deepEqual(inserted.selectedPlayer.communityIds, ['community-1']);
  assert.deepEqual(inserted.players[0].communityIds, ['community-1']);

  const alreadyLinked = applyGuestPlayerUpsert(
    [],
    { ...newGuest, communityIds: ['community-1'] },
    'community-1',
  );
  assert.deepEqual(alreadyLinked.selectedPlayer.communityIds, ['community-1']);
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

test('applyPlayerCreationForCommunity distingue criado, vinculado e vazio', () => {
  const base = player('p1', 'Ana Paula');

  const vazio = applyPlayerCreationForCommunity({
    players: [base],
    name: '   ',
    communityId: 'c1',
    now,
    createId: () => 'novo',
  });
  assert.equal(vazio.outcome, 'empty');
  assert.equal(vazio.players.length, 1);

  const vinculado = applyPlayerCreationForCommunity({
    players: [base],
    name: 'Ana Paula',
    communityId: 'c1',
    now,
    createId: () => 'novo',
  });
  assert.equal(vinculado.outcome, 'linked');
  assert.equal(vinculado.name, 'Ana Paula');
  assert.equal(vinculado.players.length, 1, 'vincular nao cria um segundo atleta');

  const criado = applyPlayerCreationForCommunity({
    players: [base],
    name: 'Bia',
    communityId: 'c1',
    now,
    createId: () => 'novo',
  });
  assert.equal(criado.outcome, 'created');
  assert.equal(criado.name, 'Bia');
  assert.equal(criado.players.length, 2);
});

test('salvar convidado grava a ficha e, sem nuvem, o nivel vira atributos', () => {
  const now = '2026-09-28T12:00:00.000Z';
  const draft = {
    genero: 'F' as const,
    posicaoPrincipal: 'central' as const,
    alturaCm: 180,
    maoDominante: 'esquerda' as const,
    apelido: 'Bia',
    posicoesSecundarias: [],
  };
  const result = applyGuestProfileSave({
    players: [],
    playerId: null,
    draft,
    nome: 'Beatriz',
    communityId: 'c1',
    level: 4,
    now,
    createId: () => 'g1',
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const g = result.value.savedPlayer;
  assert.equal(g.nome, 'Beatriz');
  assert.equal(g.apelido, 'Bia');
  assert.equal(g.genero, 'F');
  assert.deepEqual(g.atributos, buildLevelAttributes(4));
  assert.deepEqual(g.communityIds, ['c1']);
  assert.equal(g.userId ?? null, null);
});

test('salvar sem mudar o nivel preserva os atributos (a progressao)', () => {
  const now = '2026-09-28T12:00:00.000Z';
  const existente = { ...makeGuest('g1'), atributos: { ...buildLevelAttributes(3), saque: 9 } };
  const draft = draftFromPlayer(existente);
  const result = applyGuestProfileSave({
    players: [existente],
    playerId: 'g1',
    draft,
    nome: existente.nome,
    communityId: 'c1',
    level: levelFromAttributes(existente.atributos),
    now,
    createId: () => 'x',
  });
  assert.ok(result.ok && result.value.savedPlayer.atributos.saque === 9);
});

test('nao salva ficha com conta nem sem nome, e nao inventa genero', () => {
  const comConta = { ...makeGuest('p1'), userId: 'u9' };
  const draft = draftFromPlayer(comConta);
  assert.equal(
    applyGuestProfileSave({
      players: [comConta],
      playerId: 'p1',
      draft,
      nome: 'X',
      communityId: 'c1',
      level: null,
      now: '',
      createId: () => '',
    }).ok,
    false,
  );
  assert.equal(
    applyGuestProfileSave({
      players: [],
      playerId: null,
      draft: { ...draft, genero: null },
      nome: 'X',
      communityId: 'c1',
      level: null,
      now: '',
      createId: () => '',
    }).ok,
    false,
  );
  assert.equal(
    applyGuestProfileSave({
      players: [],
      playerId: null,
      draft,
      nome: '  ',
      communityId: 'c1',
      level: null,
      now: '',
      createId: () => '',
    }).ok,
    false,
  );
});

test('isForeignAccountPlayer', () => {
  assert.equal(isForeignAccountPlayer({ ...makeGuest('a'), userId: 'u1' }, 'u2'), true);
  assert.equal(isForeignAccountPlayer({ ...makeGuest('a'), userId: 'u1' }, 'u1'), false);
  assert.equal(isForeignAccountPlayer(makeGuest('a'), 'u1'), false);
});
