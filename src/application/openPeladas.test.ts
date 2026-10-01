import test from 'node:test';
import assert from 'node:assert/strict';
import type { Session } from '@shared/types';
import { openPeladas } from './openPeladas';

function pelada(id: string, extra: Partial<Session> = {}): Session {
  return {
    id,
    name: id,
    date: '2026-10-02',
    status: 'draft',
    selectedPlayerIds: [],
    teamIds: [],
    createdAt: '',
    updatedAt: '',
    type: 'free_play',
    communityId: 'c1',
    ...extra,
  } as Session;
}

test('em aberto e tudo que nao encerrou nem foi cancelado, inclusive de dias passados', () => {
  const lista = openPeladas(
    [
      pelada('ontem', { date: '2026-09-30' }),
      pelada('amanha', { date: '2026-10-02' }),
      pelada('rolando', { date: '2026-10-01', status: 'active' }),
      pelada('fim', { status: 'finished' }),
      pelada('cancelada', { status: 'cancelled' }),
      pelada('apagada', { deletedAt: '2026-10-01T00:00:00Z' }),
      pelada('outra', { communityId: 'c2' }),
    ],
    'c1',
  );
  assert.deepEqual(
    lista.map((s) => s.id),
    ['rolando', 'ontem', 'amanha'],
  );
});
