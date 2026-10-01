import test from 'node:test';
import assert from 'node:assert/strict';
import type { Division, Session } from '@shared/types';
import { DRAW_FIRST_STEP, DRAW_TEAMS_STEP, initialDrawState } from './drawDraftUseCases';

function pelada(extra: Partial<Session> = {}): Session {
  return {
    id: 's1',
    name: 'Pelada',
    date: '2026-10-02',
    status: 'draft',
    selectedPlayerIds: [],
    teamIds: [],
    createdAt: '',
    updatedAt: '',
    type: 'free_play',
    config: { type: 'free_play', teamCount: 2 } as Session['config'],
    ...extra,
  };
}

const times = [{ teams: [] }] as unknown as Division[];

test('sem rascunho o sorteio parte dos confirmados, no passo do formato', () => {
  const estado = initialDrawState({
    session: pelada({ selectedPlayerIds: ['velho'] }),
    confirmedPlayerIds: ['a', 'b', 'c', 'd'],
    draft: null,
  });
  assert.deepEqual(estado.session.selectedPlayerIds, ['a', 'b', 'c', 'd']);
  assert.equal(estado.wizardStep, DRAW_FIRST_STEP);
  assert.deepEqual(estado.bestDivisions, []);
});

test('rascunho da mesma lista volta ao passo e aos times de antes', () => {
  const salvo = pelada({
    selectedPlayerIds: ['b', 'a'],
    config: { type: 'free_play', teamCount: 3 } as Session['config'],
  });
  const estado = initialDrawState({
    session: pelada(),
    confirmedPlayerIds: ['a', 'b'],
    draft: { session: salvo, wizardStep: 5, bestDivisions: times, selectedDivisionIndex: 0 },
  });
  assert.equal(estado.wizardStep, 5);
  assert.equal(estado.bestDivisions, times);
  assert.equal(estado.session.config?.teamCount, 3);
});

test('lista mudou depois do rascunho: guarda as regras e refaz os times', () => {
  const salvo = pelada({
    selectedPlayerIds: ['a', 'b'],
    config: { type: 'free_play', teamCount: 3 } as Session['config'],
  });
  const estado = initialDrawState({
    session: pelada(),
    confirmedPlayerIds: ['a', 'b', 'c'],
    draft: { session: salvo, wizardStep: 5, bestDivisions: times, selectedDivisionIndex: 1 },
  });
  assert.deepEqual(estado.session.selectedPlayerIds, ['a', 'b', 'c']);
  assert.equal(estado.session.config?.teamCount, 3);
  assert.equal(estado.wizardStep, DRAW_FIRST_STEP);
  assert.deepEqual(estado.bestDivisions, []);
  assert.equal(estado.selectedDivisionIndex, 0);
});

test('rascunho de outra pelada ou antes do formato e ignorado', () => {
  const outra = initialDrawState({
    session: pelada(),
    confirmedPlayerIds: ['a'],
    draft: {
      session: pelada({ id: 'outra', selectedPlayerIds: ['a'] }),
      wizardStep: 5,
      bestDivisions: times,
      selectedDivisionIndex: 0,
    },
  });
  assert.equal(outra.wizardStep, DRAW_FIRST_STEP);
  assert.deepEqual(outra.bestDivisions, []);

  const cedo = initialDrawState({
    session: pelada(),
    confirmedPlayerIds: ['a'],
    draft: {
      session: pelada({ selectedPlayerIds: ['a'] }),
      wizardStep: 1,
      bestDivisions: [],
      selectedDivisionIndex: 0,
    },
  });
  assert.equal(cedo.wizardStep, DRAW_FIRST_STEP);
});

test('a tabela nao sobrevive a recarregar: volta aos times', () => {
  const estado = initialDrawState({
    session: pelada(),
    confirmedPlayerIds: ['a'],
    draft: {
      session: pelada({ selectedPlayerIds: ['a'] }),
      wizardStep: 6,
      bestDivisions: times,
      selectedDivisionIndex: 0,
    },
  });
  assert.equal(estado.wizardStep, DRAW_TEAMS_STEP);
  assert.equal(estado.bestDivisions, times);
});
