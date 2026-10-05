import test from 'node:test';
import assert from 'node:assert/strict';
import { offlineError, technicalError, productError } from './appResult';
import type { AccountSnapshot } from './accountUseCases';
import { emptySessionBundle } from './sessionDataQueries';
import { startScoreQueue, type ScoreQueueState } from './scoreQueue';
import { accountForOfflineBoot } from './offlineAccountBoot';

const cached: AccountSnapshot = {
  state: 'ready',
  profile: {
    id: 'u1',
    name: 'Ana',
    email: 'ana@example.com',
    role: 'user',
    createdAt: '2026-10-05T00:00:00Z',
    updatedAt: '2026-10-05T00:00:00Z',
  },
  playerId: 'p1',
  username: 'ana',
  requiresAal2: false,
};

function queue(entries: number): ScoreQueueState {
  const base = startScoreQueue({ userId: 'u1', sessionId: 's1', base: emptySessionBundle() });
  return {
    ...base,
    entries: Array.from({ length: entries }, (_, index) => ({
      seq: index + 1,
      at: '2026-10-05T00:00:00Z',
      sessionId: 's1',
      sessionBefore: {} as never,
      sessionAfter: null,
      upserts: { games: [], pointEvents: [], gameReports: [] },
      removals: { games: [], pointEvents: [], gameReports: [] },
    })),
  };
}

const networkFailure = technicalError(
  'Não foi possível preparar sua conta agora.',
  new TypeError('Failed to fetch'),
).error;

test('falha de rede com conta guardada e fila pendente abre pela conta guardada', () => {
  assert.equal(accountForOfflineBoot({ error: networkFailure, cached, queue: queue(2) }), cached);
});

test('sem conexao classificado abre pela conta guardada', () => {
  const error = offlineError('Sem conexão.').error;
  assert.equal(accountForOfflineBoot({ error, cached, queue: queue(1) }), cached);
});

test('sem fila ou com fila vazia nao abre', () => {
  assert.equal(accountForOfflineBoot({ error: networkFailure, cached, queue: null }), null);
  assert.equal(accountForOfflineBoot({ error: networkFailure, cached, queue: queue(0) }), null);
});

test('sem conta guardada nao abre', () => {
  assert.equal(
    accountForOfflineBoot({ error: networkFailure, cached: null, queue: queue(2) }),
    null,
  );
});

test('falha que nao e de rede nao abre', () => {
  const tecnico = technicalError('x', Object.assign(new Error('boom'), { code: '500' })).error;
  assert.equal(accountForOfflineBoot({ error: tecnico, cached, queue: queue(2) }), null);
  const produto = productError('invalid_username', 'x').error;
  assert.equal(accountForOfflineBoot({ error: produto, cached, queue: queue(2) }), null);
});
