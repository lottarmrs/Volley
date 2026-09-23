import assert from 'node:assert/strict';
import test from 'node:test';
import { createRegistrationBoardCloudService } from './registrationBoardCloudService';

function recording(data: unknown, error: { code?: string; message: string } | null = null) {
  const calls: [string, Record<string, unknown>][] = [];
  const service = createRegistrationBoardCloudService({
    rpc: async (name, args) => {
      calls.push([name, args]);
      return { data, error };
    },
  });
  return { service, calls };
}

const RAW = {
  window_id: 'w-1',
  session_id: 's-1',
  status: 'OPEN',
  revision: 4,
  capacity: 12,
  confirmed_count: 2,
  waitlisted_count: 1,
  viewer_can_manage: false,
  viewer_player_id: 'p-2',
  viewer_entry_status: 'WAITLISTED',
  viewer_queue_position: 1,
  payment_due_at: '2026-09-24T15:00:00.000Z',
  paid_count: 1,
  viewer_paid_at: null,
  pending_deadline_cut: { demoted: ['p-1'], promoted: ['p-2'] },
  entries: [
    {
      entry_id: 'e-1',
      player_id: 'p-1',
      status: 'CONFIRMED',
      queue_position: null,
      source: 'SELF_JOIN',
      joined_at: '2026-09-22T12:00:00.000Z',
      paid_at: '2026-09-23T10:00:00.000Z',
      payment_lapsed_at: null,
    },
    {
      entry_id: 'e-2',
      player_id: 'p-2',
      status: 'WAITLISTED',
      queue_position: 1,
      source: 'SELF_JOIN',
      joined_at: '2026-09-22T12:05:00.000Z',
      paid_at: null,
      payment_lapsed_at: null,
    },
  ],
};

test('readBoard traduz o quadro para os nomes do app', async () => {
  const { service, calls } = recording(RAW);
  const board = await service.readBoard('w-1');
  assert.deepEqual(calls, [['read_registration_board', { p_window_id: 'w-1' }]]);
  assert.equal(board.windowId, 'w-1');
  assert.equal(board.capacity, 12);
  assert.equal(board.viewerEntryStatus, 'WAITLISTED');
  assert.equal(board.viewerQueuePosition, 1);
  assert.equal(board.entries.length, 2);
  assert.deepEqual(board.entries[1], {
    entryId: 'e-2',
    playerId: 'p-2',
    status: 'WAITLISTED',
    queuePosition: 1,
    source: 'SELF_JOIN',
    joinedAt: '2026-09-22T12:05:00.000Z',
    paidAt: null,
    paymentLapsedAt: null,
  });
});

test('readSessionBoard devolve nulo quando a sessão ainda não tem janela', async () => {
  const { service, calls } = recording(null);
  assert.equal(await service.readSessionBoard('s-1'), null);
  assert.deepEqual(calls, [['read_session_registration', { p_session_id: 's-1' }]]);
});

test('join devolve se a pessoa entrou confirmada ou na reserva', async () => {
  const { service, calls } = recording([{ entry_status: 'WAITLISTED', window_revision: 5 }]);
  const status = await service.join({ commandId: 'c-1', entryId: 'e-9', windowId: 'w-1' });
  assert.equal(status, 'WAITLISTED');
  assert.deepEqual(calls, [
    ['join_registration', { p_command_id: 'c-1', p_entry_id: 'e-9', p_window_id: 'w-1' }],
  ]);
});

test('leave envia comando e janela, e o erro do servidor sobe como veio', async () => {
  const { service, calls } = recording([{ entry_status: 'WITHDRAWN', window_revision: 6 }]);
  await service.leave({ commandId: 'c-2', windowId: 'w-1' });
  assert.deepEqual(calls, [['leave_registration', { p_command_id: 'c-2', p_window_id: 'w-1' }]]);

  const falha = recording(null, { code: '23514', message: 'closed' });
  await assert.rejects(falha.service.leave({ commandId: 'c-3', windowId: 'w-1' }), {
    code: '23514',
  });
});

test('resposta fora do formato é recusada', async () => {
  const { service } = recording({ window_id: 'w-1' });
  await assert.rejects(service.readBoard('w-1'), /Invalid read_registration_board response/);
});

test('o quadro traz pagamento, prazo e corte pendente', async () => {
  const { service } = recording(RAW);
  const board = await service.readBoard('w-1');

  assert.equal(board.paymentDueAt, '2026-09-24T15:00:00.000Z');
  assert.equal(board.paidCount, 1);
  assert.equal(board.viewerPaidAt, null);
  assert.deepEqual(board.pendingDeadlineCut, { demoted: ['p-1'], promoted: ['p-2'] });
  assert.equal(board.entries[0].paidAt, '2026-09-23T10:00:00.000Z');
  assert.equal(board.entries[1].paymentLapsedAt, null);
});

test('marcar pagamento manda os argumentos do comando', async () => {
  const { service, calls } = recording(null);
  await service.markPayment({ commandId: 'c-1', windowId: 'w-1', playerId: 'p-9', paid: true });

  assert.deepEqual(calls, [
    [
      'mark_registration_payment',
      { p_command_id: 'c-1', p_window_id: 'w-1', p_player_id: 'p-9', p_paid: true },
    ],
  ]);
});

test('limpar o prazo manda nulo', async () => {
  const { service, calls } = recording(null);
  await service.setPaymentDue({ commandId: 'c-2', windowId: 'w-1', dueAt: null });

  assert.deepEqual(calls, [
    ['set_registration_payment_due', { p_command_id: 'c-2', p_window_id: 'w-1', p_due_at: null }],
  ]);
});

test('subir ao topo e aplicar o prazo chamam os comandos certos', async () => {
  const { service, calls } = recording(null);
  await service.boostReserve({ commandId: 'c-3', windowId: 'w-1', playerId: 'p-9' });
  await service.applyPaymentDeadline({ commandId: 'c-4', windowId: 'w-1' });

  assert.deepEqual(calls, [
    [
      'boost_registration_reserve_entry',
      { p_command_id: 'c-3', p_window_id: 'w-1', p_player_id: 'p-9' },
    ],
    ['apply_registration_payment_deadline', { p_command_id: 'c-4', p_window_id: 'w-1' }],
  ]);
});
