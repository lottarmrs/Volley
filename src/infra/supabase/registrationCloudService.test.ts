import assert from 'node:assert/strict';
import test from 'node:test';
import { createRegistrationCloudService } from './registrationCloudService';

function recording(data: unknown, error: { code?: string; message: string } | null = null) {
  const calls: [string, Record<string, unknown>][] = [];
  const service = createRegistrationCloudService({
    rpc: async (name, args) => {
      calls.push([name, args]);
      return { data, error };
    },
  });
  return { service, calls };
}

test('createWindow sends the command, window, session and capacity and returns the revision', async () => {
  const { service, calls } = recording([{ window_id: 'w-1', window_revision: 1 }]);
  const revision = await service.createWindow({
    commandId: 'c-1',
    windowId: 'w-1',
    sessionId: 's-1',
    capacity: 4,
  });
  assert.equal(revision, 1);
  assert.deepEqual(calls, [
    [
      'create_registration_window',
      {
        p_command_id: 'c-1',
        p_window_id: 'w-1',
        p_session_id: 's-1',
        p_capacity: 4,
        p_closes_at: null,
      },
    ],
  ]);
});

test('lifecycle commands map to their RPCs with the expected revision', async () => {
  for (const [method, rpcName] of [
    ['openWindow', 'open_registration'],
    ['reopenWindow', 'reopen_registration'],
    ['closeWindow', 'close_registration'],
    ['lockWindow', 'lock_registration'],
  ] as const) {
    const { service, calls } = recording([{ window_revision: 7 }]);
    const revision = await service[method]({ commandId: 'c', windowId: 'w', expectedRevision: 6 });
    assert.equal(revision, 7);
    assert.deepEqual(calls, [
      [rpcName, { p_command_id: 'c', p_window_id: 'w', p_expected_revision: 6 }],
    ]);
  }
});

test('entry and capacity commands send their own parameters', async () => {
  const add = recording([{ entry_status: 'CONFIRMED', window_revision: 3 }]);
  assert.equal(
    await add.service.addEntry({ commandId: 'c', entryId: 'e', windowId: 'w', playerId: 'p' }),
    3,
  );
  assert.deepEqual(add.calls, [
    [
      'add_registration_entry',
      { p_command_id: 'c', p_entry_id: 'e', p_window_id: 'w', p_player_id: 'p' },
    ],
  ]);

  const remove = recording([{ entry_status: 'REMOVED', window_revision: 4 }]);
  assert.equal(
    await remove.service.removeEntry({ commandId: 'c', windowId: 'w', playerId: 'p', reason: 'R' }),
    4,
  );
  assert.deepEqual(remove.calls, [
    [
      'remove_registration_entry',
      { p_command_id: 'c', p_window_id: 'w', p_player_id: 'p', p_reason: 'R' },
    ],
  ]);

  const capacity = recording([{ window_capacity: 5, window_revision: 5 }]);
  assert.equal(
    await capacity.service.changeCapacity({ commandId: 'c', windowId: 'w', capacity: 5 }),
    5,
  );
  assert.deepEqual(capacity.calls, [
    ['change_registration_capacity', { p_command_id: 'c', p_window_id: 'w', p_capacity: 5 }],
  ]);
});

test('finalizeRoster sends the expected Registration revision and returns the roster revision', async () => {
  const { service, calls } = recording([
    {
      roster_revision_id: 'r-1',
      roster_revision_number: 2,
      source_registration_revision: 9,
      session_revision: 3,
    },
  ]);
  assert.deepEqual(
    await service.finalizeRoster({ commandId: 'c', windowId: 'w', expectedRevision: 9 }),
    {
      rosterRevisionId: 'r-1',
      rosterRevisionNumber: 2,
    },
  );
  assert.deepEqual(calls, [
    [
      'finalize_session_roster',
      { p_command_id: 'c', p_window_id: 'w', p_expected_registration_revision: 9 },
    ],
  ]);
});

test('readWindow maps the row and rejects an unknown status', async () => {
  const { service } = recording([
    {
      window_id: 'w',
      session_id: 's',
      status: 'LOCKED',
      revision: 8,
      capacity: 3,
      confirmed_player_ids: ['a', 'b'],
    },
  ]);
  assert.deepEqual(await service.readWindow('w'), {
    windowId: 'w',
    sessionId: 's',
    status: 'LOCKED',
    revision: 8,
    capacity: 3,
    confirmedPlayerIds: ['a', 'b'],
  });

  const bad = recording([
    {
      window_id: 'w',
      session_id: 's',
      status: 'PAUSED',
      revision: 1,
      capacity: 1,
      confirmed_player_ids: [],
    },
  ]);
  await assert.rejects(bad.service.readWindow('w'), /Invalid read_registration_window response/);
});

test('RPC errors are rethrown with their code', async () => {
  const { service } = recording(null, {
    code: '40001',
    message: 'Stale Registration Window revision',
  });
  await assert.rejects(service.openWindow({ commandId: 'c', windowId: 'w', expectedRevision: 1 }), {
    code: '40001',
  });
});
