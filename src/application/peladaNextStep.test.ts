import test from 'node:test';
import assert from 'node:assert/strict';
import { peladaNextStep } from './peladaNextStep';

const base = { windowStatus: 'OPEN' as const, confirmed: 9, capacity: 18, canManage: true };

test('lista aberta: fechar a lista', () => {
  const passo = peladaNextStep({ ...base, status: 'draft' });
  assert.equal(passo.stage, 'lista_aberta');
  assert.equal(passo.line, 'Lista aberta · 9 de 18 confirmados');
  assert.deepEqual(passo.action, { kind: 'fechar_lista', label: 'Fechar a lista' });
});

test('lista ainda nao aberta: abrir a lista', () => {
  const passo = peladaNextStep({ ...base, status: 'draft', windowStatus: 'DRAFT' });
  assert.equal(passo.stage, 'lista_nao_aberta');
  assert.deepEqual(passo.action, { kind: 'abrir_lista', label: 'Abrir a lista' });
});

test('lista fechada: sortear, com reabrir como secundaria', () => {
  const passo = peladaNextStep({ ...base, status: 'draft', windowStatus: 'LOCKED', confirmed: 16 });
  assert.equal(passo.line, 'Lista fechada · 16 jogam');
  assert.deepEqual(passo.action, { kind: 'sortear', label: 'Sortear os times' });
  assert.deepEqual(passo.secondary, { kind: 'reabrir_lista', label: 'Reabrir a lista' });
});

test('times prontos, rolando, encerrada e cancelada', () => {
  assert.deepEqual(peladaNextStep({ ...base, status: 'teams_generated' }).action, {
    kind: 'comecar',
    label: 'Começar a pelada',
  });
  const rolando = peladaNextStep({ ...base, status: 'active', gameNumber: 3 });
  assert.equal(rolando.line, 'Rolando agora · Jogo 3');
  assert.equal(rolando.action?.kind, 'abrir_placar');
  const fim = peladaNextStep({ ...base, status: 'finished', mvpName: 'Ana' });
  assert.equal(fim.line, 'Encerrada · MVP Ana');
  assert.equal(fim.action?.kind, 'ver_resumo');
  const cancelada = peladaNextStep({ ...base, status: 'cancelled' });
  assert.equal(cancelada.line, 'Pelada cancelada');
  assert.equal(cancelada.action, null);
});

test('quem nao organiza ve o estado sem as acoes de quem organiza', () => {
  const passo = peladaNextStep({ ...base, status: 'draft', canManage: false });
  assert.equal(passo.action, null);
  const rolando = peladaNextStep({ ...base, status: 'active', canManage: false });
  assert.deepEqual(rolando.action, { kind: 'abrir_placar', label: 'Acompanhar o placar' });
});

test('um so confirmado no singular', () => {
  const passo = peladaNextStep({ ...base, status: 'draft', windowStatus: 'CLOSED', confirmed: 1 });
  assert.equal(passo.line, 'Lista fechada · 1 joga');
});
