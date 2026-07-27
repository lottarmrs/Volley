import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchProfilesByUserIds } from './membershipCloudService';

type TableResponse = { data: unknown[] | null; error: unknown };

function fakeClient(responses: Record<string, TableResponse>) {
  const calls: string[] = [];
  return {
    calls,
    from(table: string) {
      calls.push(table);
      const response = responses[table] ?? { data: null, error: new Error(`unstubbed: ${table}`) };
      return {
        select() {
          return {
            in() {
              return Promise.resolve(response);
            },
          };
        },
      };
    },
  };
}

test('fetchProfilesByUserIds falls back to community_profile_summary for RLS-hidden profiles, nulling their email', async () => {
  const client = fakeClient({
    profiles: {
      data: [{ id: 'u1', name: 'Ana', email: 'ana@example.com' }],
      error: null,
    },
    community_profile_summary: {
      data: [{ id: 'u2', name: 'Bruno' }],
      error: null,
    },
  });

  const profiles = await fetchProfilesByUserIds(['u1', 'u2'], client);

  assert.deepEqual(profiles.get('u1'), { id: 'u1', name: 'Ana', email: 'ana@example.com' });
  assert.deepEqual(profiles.get('u2'), { id: 'u2', name: 'Bruno', email: null });
  assert.deepEqual(client.calls, ['profiles', 'community_profile_summary']);
});

test('fetchProfilesByUserIds skips the fallback query when the first query returns every id', async () => {
  const client = fakeClient({
    profiles: {
      data: [{ id: 'u1', name: 'Ana', email: 'ana@example.com' }],
      error: null,
    },
  });

  const profiles = await fetchProfilesByUserIds(['u1'], client);

  assert.deepEqual(profiles.get('u1'), { id: 'u1', name: 'Ana', email: 'ana@example.com' });
  assert.deepEqual(client.calls, ['profiles']);
});

test('fetchProfilesByUserIds returns an empty map when the profiles query errors', async () => {
  const client = fakeClient({
    profiles: { data: null, error: new Error('boom') },
  });

  const profiles = await fetchProfilesByUserIds(['u1'], client);

  assert.equal(profiles.size, 0);
});

test('fetchProfilesByUserIds keeps already-fetched profiles if the fallback query errors', async () => {
  const client = fakeClient({
    profiles: {
      data: [{ id: 'u1', name: 'Ana', email: 'ana@example.com' }],
      error: null,
    },
    community_profile_summary: { data: null, error: new Error('boom') },
  });

  const profiles = await fetchProfilesByUserIds(['u1', 'u2'], client);

  assert.deepEqual(profiles.get('u1'), { id: 'u1', name: 'Ana', email: 'ana@example.com' });
  assert.equal(profiles.has('u2'), false);
});
