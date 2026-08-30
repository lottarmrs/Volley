import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fetchRows,
  mapSessionToDb,
  scopeOperationalFetch,
  TargetSessionRequiresSemanticCommandError,
  upsertRow,
} from './operationalCloudService';
import type { Session } from '../../types';

function makeSession(): Session {
  return {
    id: 'session-local',
    communityId: 'community-local',
    name: 'Treino legado',
    date: '2026-08-29',
    location: 'Quadra 1',
    notes: null,
    status: 'active',
    type: 'free_play',
    selectedPlayerIds: ['player-1'],
    teamIds: ['team-1'],
    createdAt: '2026-08-29T20:00:00.000Z',
    updatedAt: '2026-08-29T20:00:00.000Z',
  };
}

test('mapSessionToDb explicitly marks generic Session uploads as legacy', () => {
  const mapped = mapSessionToDb(makeSession(), 'owner-1');

  assert.equal(mapped.authority_model, 'legacy');
});

test('scopeOperationalFetch restricts only Session roots to the legacy cohort', () => {
  const sessionCalls: Array<[string, string]> = [];
  const gameCalls: Array<[string, string]> = [];
  const sessionQuery = {
    eq(column: string, value: string) {
      sessionCalls.push([column, value]);
      return this;
    },
  };
  const gameQuery = {
    eq(column: string, value: string) {
      gameCalls.push([column, value]);
      return this;
    },
  };

  scopeOperationalFetch('sessions', sessionQuery);
  scopeOperationalFetch('games', gameQuery);

  assert.deepEqual(sessionCalls, [['authority_model', 'legacy']]);
  assert.deepEqual(gameCalls, []);
});

test('fetchRows scopes every Session page to the legacy cohort', async () => {
  const calls: Array<[string, string]> = [];
  const ranges: Array<[number, number]> = [];
  const firstPage = Array.from({ length: 1000 }, (_, index) => ({ id: `legacy-${index}` }));
  const client = {
    from(table: string) {
      assert.equal(table, 'sessions');
      return {
        select() {
          return {
            eq(column: string, value: string) {
              calls.push([column, value]);
              return this;
            },
            async range(from: number, to: number) {
              ranges.push([from, to]);
              return { data: from === 0 ? firstPage : [{ id: 'legacy-final' }], error: null };
            },
          };
        },
      };
    },
  };

  const rows = await fetchRows('sessions', client);

  assert.equal(rows.length, 1001);
  assert.deepEqual(ranges, [
    [0, 999],
    [1000, 1999],
  ]);
  assert.deepEqual(calls, [
    ['authority_model', 'legacy'],
    ['authority_model', 'legacy'],
  ]);
});

test('TargetSessionRequiresSemanticCommandError has a stable code without authority payload', () => {
  const error = new TargetSessionRequiresSemanticCommandError('session-target');

  assert.equal(error.code, 'TARGET_SESSION_REQUIRES_SEMANTIC_COMMAND');
  assert.equal('userId' in error, false);
  assert.equal('communityId' in error, false);
});

test('upsertRow classifies a visible target Session after a generic write is denied', async () => {
  const originalError = { code: '42501', message: 'new row violates row-level security policy' };
  const lookups: Array<Array<[string, string]>> = [];
  const client = {
    from(table: string) {
      assert.equal(table, 'sessions');
      return {
        upsert() {
          return {
            select() {
              return {
                async single() {
                  return { data: null, error: originalError };
                },
              };
            },
          };
        },
        select() {
          const filters: Array<[string, string]> = [];
          lookups.push(filters);
          return {
            eq(column: string, value: string) {
              filters.push([column, value]);
              return this;
            },
            async maybeSingle() {
              return {
                data: filters.some(([column]) => column === 'id')
                  ? { id: 'session-target', authority_model: 'target' }
                  : null,
                error: null,
              };
            },
          };
        },
      };
    },
  };

  await assert.rejects(
    () =>
      upsertRow(
        'sessions',
        { id: 'session-target', owner_id: 'owner-1', local_id: 'session-local' },
        client,
      ),
    (error: unknown) => {
      assert.ok(error instanceof TargetSessionRequiresSemanticCommandError);
      assert.equal(error.code, 'TARGET_SESSION_REQUIRES_SEMANTIC_COMMAND');
      return true;
    },
  );
  assert.deepEqual(lookups, [
    [
      ['owner_id', 'owner-1'],
      ['local_id', 'session-local'],
    ],
    [['id', 'session-target']],
  ]);
});

test('upsertRow classifies a target Session when the primary-key fallback is denied', async () => {
  const primaryKeyError = { code: '23505', message: 'sessions_pkey already exists' };
  const authorizationError = { code: '42501', message: 'write denied' };
  const originalConsoleWarn = console.warn;
  let fallbackAttempted = false;
  const client = {
    from(table: string) {
      assert.equal(table, 'sessions');
      return {
        upsert() {
          return {
            select() {
              return {
                async single() {
                  return { data: null, error: primaryKeyError };
                },
              };
            },
          };
        },
        update() {
          fallbackAttempted = true;
          return {
            eq() {
              return {
                select() {
                  return {
                    async single() {
                      return { data: null, error: authorizationError };
                    },
                  };
                },
              };
            },
          };
        },
        select() {
          return {
            eq() {
              return {
                eq() {
                  return {
                    async maybeSingle() {
                      return { data: { authority_model: 'target' }, error: null };
                    },
                  };
                },
                async maybeSingle() {
                  return { data: { authority_model: 'target' }, error: null };
                },
              };
            },
          };
        },
      };
    },
  };

  try {
    console.warn = () => {};
    await assert.rejects(
      () =>
        upsertRow(
          'sessions',
          { id: 'session-target', owner_id: 'owner-1', local_id: 'session-local' },
          client,
        ),
      TargetSessionRequiresSemanticCommandError,
    );
    assert.equal(fallbackAttempted, true);
  } finally {
    console.warn = originalConsoleWarn;
  }
});

const singularResponseError = {
  code: 'PGRST116',
  details: 'The result contains 0 rows',
  hint: null,
  message: 'Cannot coerce the result to a single JSON object',
};

function collisionClient(input: {
  upsertError?: unknown;
  fallbackError?: unknown;
  ownerLocalAuthority?: string | null;
  primaryAuthority?: string | null;
  lookupError?: unknown;
  table?: 'sessions' | 'teams';
}) {
  const lookups: Array<Array<[string, string]>> = [];
  const writes: string[] = [];
  const client = {
    from(table: string) {
      assert.equal(table, input.table ?? 'sessions');
      return {
        upsert() {
          writes.push('upsert');
          return {
            select() {
              return {
                async single() {
                  return {
                    data: null,
                    error: input.upsertError ?? {
                      code: '23505',
                      message: `${table}_pkey already exists`,
                    },
                  };
                },
              };
            },
          };
        },
        update(record: Record<string, unknown>) {
          writes.push('update');
          assert.equal('id' in record, false);
          return {
            eq(column: string, value: string) {
              assert.deepEqual([column, value], ['id', 'session-target']);
              return {
                select() {
                  return {
                    async single() {
                      return { data: null, error: input.fallbackError ?? singularResponseError };
                    },
                  };
                },
              };
            },
          };
        },
        select(columns: string) {
          assert.equal(columns, 'id, authority_model');
          const filters: Array<[string, string]> = [];
          lookups.push(filters);
          return {
            eq(column: string, value: string) {
              filters.push([column, value]);
              return this;
            },
            async maybeSingle() {
              const authority = filters.some(([column]) => column === 'id')
                ? input.primaryAuthority
                : input.ownerLocalAuthority;
              return {
                data: authority ? { id: 'session-target', authority_model: authority } : null,
                error: input.lookupError ?? null,
              };
            },
          };
        },
      };
    },
  };
  return { client, lookups, writes };
}

for (const lookup of ['owner/local', 'primary ID']) {
  test(`upsertRow classifies a target Session visible by ${lookup} after its PK fallback returns PGRST116`, async (t) => {
    t.mock.method(console, 'warn', () => {});
    const { client, lookups, writes } = collisionClient({
      ownerLocalAuthority: lookup === 'owner/local' ? 'target' : null,
      primaryAuthority: lookup === 'primary ID' ? 'target' : null,
    });

    await assert.rejects(
      () =>
        upsertRow(
          'sessions',
          { id: 'session-target', owner_id: 'owner-1', local_id: 'session-local' },
          client,
        ),
      TargetSessionRequiresSemanticCommandError,
    );
    assert.deepEqual(writes, ['upsert', 'update']);
    assert.deepEqual(lookups, [
      [
        ['owner_id', 'owner-1'],
        ['local_id', 'session-local'],
      ],
      [['id', 'session-target']],
    ]);
  });
}

for (const scenario of [
  { name: 'non-visible Session', options: {} },
  {
    name: 'wrong actor authorization denial',
    options: { upsertError: { code: '42501', message: 'write denied' } },
  },
  {
    name: 'legacy Session authorization denial',
    options: {
      upsertError: { code: '42501', message: 'write denied' },
      primaryAuthority: 'legacy',
    },
  },
  {
    name: 'visible legacy Session',
    options: { ownerLocalAuthority: 'legacy', primaryAuthority: 'legacy' },
  },
  {
    name: 'failed authority lookup',
    options: { primaryAuthority: 'target', lookupError: { code: '42501', message: 'read denied' } },
  },
  {
    name: 'unrelated Session upsert singular response',
    options: { upsertError: singularResponseError, primaryAuthority: 'target' },
  },
  { name: 'non-Session PK fallback', options: { table: 'teams' as const } },
  {
    name: 'unrelated PK fallback error',
    options: {
      fallbackError: { code: 'XX000', message: 'unrelated failure' },
      primaryAuthority: 'target',
    },
  },
]) {
  test(`upsertRow preserves the original error for ${scenario.name}`, async (t) => {
    t.mock.method(console, 'warn', () => {});
    const { client } = collisionClient(scenario.options);
    const originalError =
      scenario.options.upsertError ?? scenario.options.fallbackError ?? singularResponseError;

    await assert.rejects(
      () =>
        upsertRow(
          scenario.options.table ?? 'sessions',
          { id: 'session-target', owner_id: 'owner-1', local_id: 'session-local' },
          client,
        ),
      (error: unknown) => {
        assert.equal(error, originalError);
        return true;
      },
    );
  });
}
