import test from 'node:test';
import assert from 'node:assert/strict';
import type { Session } from '@shared/types';
import { rulesPayloadFor, targetStepFor } from './targetSessionLifecycle';

function pelada(extra: Partial<Session> = {}): Session {
  return {
    id: 's1',
    name: 'Pelada',
    date: '2026-10-01',
    status: 'teams_generated',
    selectedPlayerIds: [],
    teamIds: [],
    createdAt: '',
    updatedAt: '',
    type: 'free_play',
    config: { type: 'free_play', teamCount: 2 } as Session['config'],
    ...extra,
  };
}

test('iniciar congela as regras, agenda e inicia', () => {
  assert.equal(targetStepFor(pelada(), pelada({ status: 'active' })), 'freezeRulesScheduleStart');
});

test('encerrar e cancelar viram os comandos correspondentes', () => {
  assert.equal(
    targetStepFor(pelada({ status: 'active' }), pelada({ status: 'finished' })),
    'finish',
  );
  assert.equal(
    targetStepFor(pelada({ status: 'draft' }), pelada({ status: 'cancelled' })),
    'cancel',
  );
  assert.equal(targetStepFor(pelada(), pelada({ deletedAt: '2026-10-01T00:00:00Z' })), 'cancel');
});

test('sem mudanca de estado nao ha comando', () => {
  assert.equal(targetStepFor(pelada({ status: 'active' }), pelada({ status: 'active' })), null);
  assert.equal(targetStepFor(pelada(), pelada({ name: 'Outra' })), null);
  assert.equal(targetStepFor(undefined, pelada()), null);
  assert.equal(targetStepFor(pelada({ status: 'paused' }), pelada({ status: 'active' })), null);
});

test('as regras congeladas levam o tipo e o config da pelada', () => {
  assert.deepEqual(rulesPayloadFor(pelada()), {
    type: 'free_play',
    config: { type: 'free_play', teamCount: 2 },
  });
  assert.deepEqual(rulesPayloadFor(pelada({ type: undefined, config: undefined })), {
    type: 'free_play',
    config: null,
  });
});
