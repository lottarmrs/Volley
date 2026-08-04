import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPlayerEditViewContract } from './playerEditViewContract';
import type { PlayerEditViewContractInput } from './playerEditViewContract';
import type { Player } from '@shared/types';

function spy() {
  const calls: unknown[][] = [];
  const fn = (...a: unknown[]) => {
    calls.push(a);
  };
  return { fn, calls };
}

type Spy = ReturnType<typeof spy>;

function makePlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: 'p1',
    nome: '_TEST_',
    apelido: null,
    posicaoPrincipal: 'ponteiro',
    posicoesSecundarias: [],
    genero: 'M',
    alturaCm: 180,
    maoDominante: 'direita',
    ativo: true,
    status: { lesionado: false, presencaFrequente: false, limitacaoFisica: null },
    userId: null,
    isGuest: false,
    atributos: {
      ataque: 5,
      defesa: 5,
      saque: 5,
      resistencia: 5,
      recepcao: 5,
      levantamento: 5,
      bloqueio: 5,
      velocidade: 5,
      leituraDeJogo: 5,
      regularidade: 5,
      controleEmocional: 5,
    },
    formaAtual: { valor: 0, observacao: null, ultimasPartidas: [] },
    communityIds: [],
    selfEvaluation: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as Player;
}

function makeInput(
  overrides: Partial<PlayerEditViewContractInput> = {},
): PlayerEditViewContractInput {
  return {
    editingPlayer: makePlayer(),
    setEditingPlayer: () => {},
    players: [],
    games: [],
    pointEvents: [],
    teams: [],
    communities: [],
    sessions: [],
    validationErrors: {},
    showDeleteConfirm: false,
    setShowDeleteConfirm: () => {},
    permissions: { canEditPlayerProfile: true, canEvaluatePlayer: true },
    currentUserId: null,
    onBack: () => {},
    onSave: () => {},
    onDelete: () => {},
    ...overrides,
  };
}

test('buildModel projeta os 11 campos read-only', () => {
  const player = makePlayer({ nome: 'A' });
  const perms = { canEditPlayerProfile: false, canEvaluatePlayer: true };
  const c = buildPlayerEditViewContract(
    makeInput({
      editingPlayer: player,
      players: [player],
      games: [],
      pointEvents: [],
      teams: [],
      communities: [],
      sessions: [],
      validationErrors: { nome: 'x' },
      showDeleteConfirm: true,
      permissions: perms,
      currentUserId: 'u1',
    }),
  );
  assert.equal(c.model.editingPlayer, player);
  assert.equal(c.model.players.length, 1);
  assert.equal(c.model.validationErrors.nome, 'x');
  assert.equal(c.model.showDeleteConfirm, true);
  assert.deepEqual(c.model.permissions, perms);
  assert.equal(c.model.currentUserId, 'u1');
});

test('setEditingPlayer repassa o player ao setter', async () => {
  const setEditingPlayer = spy() as unknown as Spy;
  const c = buildPlayerEditViewContract(
    makeInput({ setEditingPlayer: setEditingPlayer.fn as never }),
  );
  const player = makePlayer({ nome: 'B' });
  await c.dispatch({ kind: 'setEditingPlayer', player });
  assert.equal(setEditingPlayer.calls.length, 1);
  assert.deepEqual(setEditingPlayer.calls[0], [player]);
});

test('setEditingPlayer repassa null preservando o tipo', async () => {
  const setEditingPlayer = spy() as unknown as Spy;
  const c = buildPlayerEditViewContract(
    makeInput({ setEditingPlayer: setEditingPlayer.fn as never }),
  );
  await c.dispatch({ kind: 'setEditingPlayer', player: null });
  assert.deepEqual(setEditingPlayer.calls[0], [null]);
});

test('setShowDeleteConfirm repassa o boolean ao setter', async () => {
  const setShowDeleteConfirm = spy() as unknown as Spy;
  const c = buildPlayerEditViewContract(
    makeInput({ setShowDeleteConfirm: setShowDeleteConfirm.fn as never }),
  );
  await c.dispatch({ kind: 'setShowDeleteConfirm', value: true });
  assert.deepEqual(setShowDeleteConfirm.calls[0], [true]);
});

test('back chama onBack (mutual exclusion: nao chama onSave/onDelete)', async () => {
  const onBack = spy() as unknown as Spy;
  const onSave = spy() as unknown as Spy;
  const onDelete = spy() as unknown as Spy;
  const c = buildPlayerEditViewContract(
    makeInput({
      onBack: onBack.fn as never,
      onSave: onSave.fn as never,
      onDelete: onDelete.fn as never,
    }),
  );
  await c.dispatch({ kind: 'back' });
  assert.equal(onBack.calls.length, 1);
  assert.equal(onSave.calls.length, 0);
  assert.equal(onDelete.calls.length, 0);
});

test('save chama onSave (mutual exclusion: nao chama onBack/onDelete)', async () => {
  const onBack = spy() as unknown as Spy;
  const onSave = spy() as unknown as Spy;
  const onDelete = spy() as unknown as Spy;
  const c = buildPlayerEditViewContract(
    makeInput({
      onBack: onBack.fn as never,
      onSave: onSave.fn as never,
      onDelete: onDelete.fn as never,
    }),
  );
  await c.dispatch({ kind: 'save' });
  assert.equal(onSave.calls.length, 1);
  assert.equal(onBack.calls.length, 0);
  assert.equal(onDelete.calls.length, 0);
});

test('delete chama onDelete (mutual exclusion: nao chama onBack/onSave)', async () => {
  const onBack = spy() as unknown as Spy;
  const onSave = spy() as unknown as Spy;
  const onDelete = spy() as unknown as Spy;
  const c = buildPlayerEditViewContract(
    makeInput({
      onBack: onBack.fn as never,
      onSave: onSave.fn as never,
      onDelete: onDelete.fn as never,
    }),
  );
  await c.dispatch({ kind: 'delete' });
  assert.equal(onDelete.calls.length, 1);
  assert.equal(onBack.calls.length, 0);
  assert.equal(onSave.calls.length, 0);
});

test('setEditingPlayer nao chama setShowDeleteConfirm e vice-versa', async () => {
  const setEditingPlayer = spy() as unknown as Spy;
  const setShowDeleteConfirm = spy() as unknown as Spy;
  const c = buildPlayerEditViewContract(
    makeInput({
      setEditingPlayer: setEditingPlayer.fn as never,
      setShowDeleteConfirm: setShowDeleteConfirm.fn as never,
    }),
  );
  await c.dispatch({ kind: 'setEditingPlayer', player: null });
  assert.equal(setShowDeleteConfirm.calls.length, 0);
  await c.dispatch({ kind: 'setShowDeleteConfirm', value: false });
  assert.equal(setEditingPlayer.calls.length, 1);
});
