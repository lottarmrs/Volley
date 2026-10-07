import test from 'node:test';
import assert from 'node:assert/strict';
import type { Player } from '@shared/types';
import { toSkillValuesMap } from './cardStats';

test('toSkillValuesMap agrupa por atleta usando o id do app', () => {
  const players = [
    { id: 'local-ana', cloudId: 'uuid-ana' },
    { id: 'uuid-bia', cloudId: 'uuid-bia' },
  ] as unknown as Player[];
  const map = toSkillValuesMap(
    [
      { playerId: 'uuid-ana', dimensionKey: 'ataque', value: 8 },
      { playerId: 'uuid-ana', dimensionKey: 'saque', value: 6.5 },
      { playerId: 'uuid-bia', dimensionKey: 'defesa', value: 7 },
      { playerId: 'uuid-fora', dimensionKey: 'defesa', value: 3 },
      { playerId: 'uuid-ana', dimensionKey: 'inventado', value: 9 },
    ],
    players,
  );
  assert.deepEqual(map.get('local-ana'), { ataque: 8, saque: 6.5 });
  assert.deepEqual(map.get('uuid-bia'), { defesa: 7 });
  assert.equal(map.size, 2);
});
