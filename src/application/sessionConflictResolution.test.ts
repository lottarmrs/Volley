import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveConflictKeepingMine,
  resolveConflictKeepingTheirs,
  markConflictedEvents,
} from './sessionConflictResolution';

const ev = (id: string, sessionId: string, extra: Record<string, unknown> = {}) =>
  ({ id, sessionId, syncStatus: 'pending', ...extra }) as any;

test('manter o meu libera os eventos da sessao para subir', () => {
  const saida = resolveConflictKeepingMine({
    pointEvents: [ev('e-1', 's-1'), ev('e-2', 's-2')],
    sessionId: 's-1',
    now: '2026-07-31T12:00:00.000Z',
  });
  const meu = saida.find((e) => e.id === 'e-1')!;
  assert.equal(meu.conflictStatus, 'resolved_keep_mine');
  assert.equal(meu.syncStatus, 'pending');
  // A outra sessao nao pode ser tocada.
  assert.equal(saida.find((e) => e.id === 'e-2')!.conflictStatus, undefined);
});

test('manter o do outro faz soft-delete, nunca apaga', () => {
  // Regra do plano: nenhum descarte silencioso. O evento continua na lista, marcado.
  const saida = resolveConflictKeepingTheirs({
    pointEvents: [ev('e-1', 's-1')],
    sessionId: 's-1',
    now: '2026-07-31T12:00:00.000Z',
  });
  assert.equal(saida.length, 1, 'o evento nao pode sumir da lista');
  assert.equal(saida[0].deletedAt, '2026-07-31T12:00:00.000Z');
  assert.equal(saida[0].conflictStatus, 'resolved_keep_theirs');
});

test('resolver uma sessao nao mexe nas outras', () => {
  const saida = resolveConflictKeepingTheirs({
    pointEvents: [ev('e-1', 's-1'), ev('e-2', 's-2')],
    sessionId: 's-1',
    now: '2026-07-31T12:00:00.000Z',
  });
  assert.equal(saida.find((e) => e.id === 'e-2')!.deletedAt, undefined);
});

test('marca so os eventos das sessoes em conflito', () => {
  const saida = markConflictedEvents(
    [ev('e-1', 's-1'), ev('e-2', 's-2')],
    [{ sessionId: 's-1', localEventCount: 1, holderEventCount: 2, holderUserId: 'u-2', holderName: 'Ana' }],
  );
  assert.equal((saida[0] as any).conflictStatus, 'pending_decision');
  assert.equal((saida[1] as any).conflictStatus, undefined);
});

test('nao sobrescreve uma decisao ja tomada', () => {
  // Se a pessoa ja decidiu, redetectar o conflito nao pode reabrir a decisao.
  const saida = markConflictedEvents(
    [ev('e-1', 's-1', { conflictStatus: 'resolved_keep_mine' })],
    [{ sessionId: 's-1', localEventCount: 1, holderEventCount: 2, holderUserId: 'u-2', holderName: 'Ana' }],
  );
  assert.equal((saida[0] as any).conflictStatus, 'resolved_keep_mine');
});

// Os tres testes abaixo separam MEUS eventos dos que vieram da nuvem. Sem essa
// distincao, "manter o da outra pessoa" apagava os eventos DELA — a unica versao
// que o usuario pediu para preservar.
const meu = (id: string, sessionId: string) =>
  ({ id, sessionId, syncStatus: 'pending' }) as any;
const daNuvem = (id: string, sessionId: string) =>
  ({ id, sessionId, cloudId: 'cloud-' + id, syncStatus: 'synced' }) as any;

test('manter o do outro NAO apaga os eventos do outro', () => {
  const saida = resolveConflictKeepingTheirs({
    pointEvents: [meu('e-meu', 's-1'), daNuvem('e-dela', 's-1')],
    sessionId: 's-1',
    now: '2026-07-31T12:00:00.000Z',
  });
  const dela = saida.find((e) => e.id === 'e-dela')!;
  assert.equal(dela.deletedAt, undefined, 'o placar preservado nao pode ser apagado');
  assert.equal((dela as any).conflictStatus, undefined);

  const meuEvento = saida.find((e) => e.id === 'e-meu')!;
  assert.equal(meuEvento.deletedAt, '2026-07-31T12:00:00.000Z');
});

test('manter o meu nao carimba os eventos do outro', () => {
  const saida = resolveConflictKeepingMine({
    pointEvents: [meu('e-meu', 's-1'), daNuvem('e-dela', 's-1')],
    sessionId: 's-1',
    now: '2026-07-31T12:00:00.000Z',
  });
  assert.equal((saida.find((e) => e.id === 'e-meu') as any).conflictStatus, 'resolved_keep_mine');
  assert.equal((saida.find((e) => e.id === 'e-dela') as any).conflictStatus, undefined);
});

test('markConflictedEvents so carimba os meus', () => {
  const saida = markConflictedEvents(
    [meu('e-meu', 's-1'), daNuvem('e-dela', 's-1')],
    [{ sessionId: 's-1', localEventCount: 1, holderEventCount: 1, holderUserId: 'u-2', holderName: 'Ana' }],
  );
  assert.equal((saida.find((e) => e.id === 'e-meu') as any).conflictStatus, 'pending_decision');
  assert.equal((saida.find((e) => e.id === 'e-dela') as any).conflictStatus, undefined);
});
