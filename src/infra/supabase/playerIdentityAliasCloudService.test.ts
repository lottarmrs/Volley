import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchPlayerIdentityAliases } from './playerIdentityAliasCloudService';

test('player identity aliases are fetched with a read-only RLS query', async () => {
  const requests: Array<{ table: string; columns: string }> = [];
  const aliases = await fetchPlayerIdentityAliases({
    from(table: string) {
      return {
        select(columns: string) {
          requests.push({ table, columns });
          return Promise.resolve({
            data: [
              {
                legacy_player_id: 'legacy-cloud',
                legacy_local_id: 'legacy-local',
                canonical_player_id: 'canonical-cloud',
              },
            ],
            error: null,
          });
        },
      };
    },
  });

  assert.deepEqual(requests, [
    {
      table: 'player_identity_aliases',
      columns: 'legacy_player_id, legacy_local_id, canonical_player_id',
    },
  ]);
  assert.deepEqual(aliases, [
    {
      legacyPlayerId: 'legacy-cloud',
      legacyLocalId: 'legacy-local',
      canonicalPlayerId: 'canonical-cloud',
    },
  ]);
});
