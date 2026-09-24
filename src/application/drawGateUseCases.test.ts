import assert from 'node:assert/strict';
import test from 'node:test';
import type { RegistrationBoard } from '@shared/types';
import { resolveDrawGate } from './drawGateUseCases';

/**
 * O portão do sorteio.
 *
 * A política de "não sortear com a lista aberta" tentou morar dentro de
 * `prepareAuthorizedTeamFormation` e quebrou dois testes que protegiam
 * comportamento deliberado -- o motor serve os dois caminhos, com lista e sem.
 * Ela mora aqui: na rota, que é onde os caminhos diferem.
 */

function quadro(overrides: Partial<RegistrationBoard> = {}): RegistrationBoard {
  return {
    windowId: 'w-1',
    sessionId: 'cloud-s',
    sessionName: 'Pelada de quinta',
    sessionDate: '2026-10-01',
    sessionLifecycleStatus: 'DRAFT',
    status: 'CLOSED',
    revision: 3,
    capacity: 12,
    confirmedCount: 2,
    waitlistedCount: 0,
    paymentDueAt: null,
    paidCount: 0,
    viewerCanManage: true,
    viewerPlayerId: null,
    viewerEntryStatus: null,
    viewerQueuePosition: null,
    viewerPaidAt: null,
    pendingDeadlineCut: null,
    entries: [
      { entryId: 'e-1', playerId: 'cloud-a', status: 'CONFIRMED', queuePosition: null },
      { entryId: 'e-2', playerId: 'cloud-b', status: 'CONFIRMED', queuePosition: null },
      { entryId: 'e-3', playerId: 'cloud-c', status: 'WAITLISTED', queuePosition: 1 },
    ] as unknown as RegistrationBoard['entries'],
    ...overrides,
  };
}

test('carregando nao decide nada', () => {
  assert.equal(resolveDrawGate({ board: null, loading: true }).kind, 'loading');
});

test('com a lista fechada, o sorteio parte dos confirmados', () => {
  const portao = resolveDrawGate({ board: quadro(), loading: false });

  assert.equal(portao.kind, 'ready');
  if (portao.kind !== 'ready') return;
  assert.deepEqual(
    portao.confirmedPlayerCloudIds,
    ['cloud-a', 'cloud-b'],
    'a reserva nao entra no sorteio',
  );
});

test('lista travada tambem sorteia: travar e o passo seguinte a fechar', () => {
  assert.equal(
    resolveDrawGate({ board: quadro({ status: 'LOCKED' }), loading: false }).kind,
    'ready',
  );
});

test('com a lista aberta, o portao explica em vez de sortear', () => {
  const portao = resolveDrawGate({ board: quadro({ status: 'OPEN' }), loading: false });

  assert.equal(portao.kind, 'listaAberta');
  if (portao.kind !== 'listaAberta') return;
  assert.match(portao.message, /feche a lista/i);
});

test('quem nao organiza nao sorteia, mesmo com a lista fechada', () => {
  const portao = resolveDrawGate({
    board: quadro({ viewerCanManage: false }),
    loading: false,
  });

  assert.equal(portao.kind, 'semPermissao');
});

test('lista fechada e vazia nao sorteia: nao ha quem', () => {
  const portao = resolveDrawGate({
    board: quadro({ confirmedCount: 0, entries: [] }),
    loading: false,
  });

  assert.equal(portao.kind, 'listaVazia');
});

test('sem lista nenhuma, o sorteio segue o caminho manual de sempre', () => {
  const portao = resolveDrawGate({ board: null, loading: false });

  assert.equal(portao.kind, 'semLista', 'pelada sem inscricao ainda se sorteia escolhendo na mao');
});

test('pelada que ja comecou nao volta a sortear', () => {
  const portao = resolveDrawGate({
    board: quadro({ sessionLifecycleStatus: 'IN_PROGRESS' }),
    loading: false,
  });

  assert.equal(portao.kind, 'jaComecou');
});
