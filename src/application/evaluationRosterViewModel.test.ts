import test from 'node:test';
import assert from 'node:assert/strict';
import type { CommunityEvaluationRosterEntry } from '@shared/types';
import { buildEvaluationRosterView, nextPendingAfter } from './evaluationRosterViewModel';

function entry(overrides: Partial<CommunityEvaluationRosterEntry>): CommunityEvaluationRosterEntry {
  return {
    playerId: overrides.playerId ?? 'p',
    name: overrides.name ?? 'Nome',
    nickname: overrides.nickname ?? null,
    position: overrides.position ?? null,
    hasAccount: overrides.hasAccount ?? true,
    myLastEvaluatedAt: overrides.myLastEvaluatedAt ?? null,
    isSelf: overrides.isSelf ?? false,
  };
}

test('pendentes primeiro, por nome; avaliados depois; a propria ficha a parte e fora da contagem', () => {
  const view = buildEvaluationRosterView([
    entry({ playerId: 'b', name: 'Bruna', myLastEvaluatedAt: '2026-09-20T10:00:00Z' }),
    entry({ playerId: 'eu', name: 'Eu', isSelf: true }),
    entry({ playerId: 'c', name: 'Carla' }),
    entry({ playerId: 'a', name: 'Zé', nickname: 'Ana' }),
  ]);

  assert.equal(view.self?.playerId, 'eu');
  assert.deepEqual(
    view.pending.map((e) => e.playerId),
    ['a', 'c'],
  );
  assert.deepEqual(
    view.evaluated.map((e) => e.playerId),
    ['b'],
  );
  assert.equal(view.total, 3);
  assert.equal(view.evaluatedCount, 1);
});

test('o proximo pendente e o seguinte na ordem, e volta ao comeco; sem pendentes, nenhum', () => {
  const view = buildEvaluationRosterView([
    entry({ playerId: 'a', name: 'Ana' }),
    entry({ playerId: 'b', name: 'Bia' }),
    entry({ playerId: 'c', name: 'Caio', myLastEvaluatedAt: '2026-09-20T10:00:00Z' }),
  ]);
  assert.equal(nextPendingAfter(view, 'a'), 'b');
  assert.equal(nextPendingAfter(view, 'b'), 'a');
  assert.equal(nextPendingAfter(view, 'c'), 'a');

  const completo = buildEvaluationRosterView([
    entry({ playerId: 'a', name: 'Ana', myLastEvaluatedAt: '2026-09-20T10:00:00Z' }),
  ]);
  assert.equal(nextPendingAfter(completo, 'a'), null);
});
