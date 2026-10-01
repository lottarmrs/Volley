import { afterEach, describe, expect, it } from 'vitest';
import type { Session } from '../types';
import {
  loadPeladaDrawDraft,
  loadSessionDraft,
  peladaDrawDraftKey,
  peladaDrawDraftStore,
} from './sessionDraft';

const pelada = {
  id: 's1',
  name: 'Pelada',
  date: '2026-10-02',
  status: 'configured',
  selectedPlayerIds: ['a', 'b'],
  teamIds: [],
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  type: 'free_play',
  config: { type: 'free_play', teamCount: 3 },
} as unknown as Session;

describe('rascunho do sorteio por pelada', () => {
  afterEach(() => localStorage.clear());

  it('guarda numa chave da pelada e volta depois de recarregar', () => {
    peladaDrawDraftStore('s1').save({
      session: pelada,
      wizardStep: 4,
      bestDivisions: [],
      selectedDivisionIndex: 0,
      updatedAt: '2026-10-01T00:00:00.000Z',
    });

    expect(localStorage.getItem(peladaDrawDraftKey('s1'))).not.toBeNull();
    expect(loadSessionDraft()).toBeNull();
    const lido = loadPeladaDrawDraft('s1');
    expect(lido?.wizardStep).toBe(4);
    expect(lido?.session.config?.teamCount).toBe(3);
    expect(loadPeladaDrawDraft('outra')).toBeNull();
  });

  it('limpar apaga só o rascunho daquela pelada', () => {
    peladaDrawDraftStore('s1').save({
      session: pelada,
      wizardStep: 3,
      bestDivisions: [],
      selectedDivisionIndex: 0,
      updatedAt: '',
    });
    peladaDrawDraftStore('s2').save({
      session: { ...pelada, id: 's2' },
      wizardStep: 3,
      bestDivisions: [],
      selectedDivisionIndex: 0,
      updatedAt: '',
    });

    peladaDrawDraftStore('s1').clear();

    expect(loadPeladaDrawDraft('s1')).toBeNull();
    expect(loadPeladaDrawDraft('s2')).not.toBeNull();
  });
});
