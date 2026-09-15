import test from 'node:test';
import assert from 'node:assert/strict';
import { communityCloudService } from './communityCloudService';

function fakeClient(rows: { id: string }[]) {
  const calls: { table?: string; patch?: Record<string, unknown>; id?: string } = {};
  const client = {
    from(table: string) {
      calls.table = table;
      return {
        update(patch: Record<string, unknown>) {
          calls.patch = patch;
          return {
            eq(_column: string, id: string) {
              calls.id = id;
              return {
                select: async () => ({ data: rows, error: null }),
              };
            },
          };
        },
      };
    },
  };
  return { client, calls };
}

test('softDelete throws when the update changes no row, so the sync keeps the deletion pending', async () => {
  const { client } = fakeClient([]);

  await assert.rejects(communityCloudService.softDelete('cloud-c1', client), /não foi aplicada/i);
});

test('softDelete marks deleted_at on the community row and resolves when the row changed', async () => {
  const { client, calls } = fakeClient([{ id: 'cloud-c1' }]);

  await communityCloudService.softDelete('cloud-c1', client);

  assert.equal(calls.table, 'communities');
  assert.equal(calls.id, 'cloud-c1');
  assert.equal(typeof calls.patch?.deleted_at, 'string');
});
