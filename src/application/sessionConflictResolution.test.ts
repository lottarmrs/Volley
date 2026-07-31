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
