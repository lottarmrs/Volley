import type { Division, Session } from '@shared/types';

export const DRAW_FIRST_STEP = 2;
export const DRAW_TEAMS_STEP = 5;

export interface DrawDraft {
  session: Session;
  wizardStep: number;
  bestDivisions: Division[];
  selectedDivisionIndex: number;
}

export interface DrawState {
  session: Session;
  wizardStep: number;
  bestDivisions: Division[];
  selectedDivisionIndex: number;
}

function mesmaLista(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const conjunto = new Set(a);
  return b.every((id) => conjunto.has(id));
}

export function initialDrawState(input: {
  session: Session;
  confirmedPlayerIds: string[];
  draft: DrawDraft | null;
}): DrawState {
  const doRascunho = input.draft?.session.id === input.session.id ? input.draft : null;
  const base = doRascunho
    ? { ...input.session, config: doRascunho.session.config, type: doRascunho.session.type }
    : input.session;
  const session = { ...base, selectedPlayerIds: input.confirmedPlayerIds };

  const retoma =
    doRascunho &&
    doRascunho.wizardStep >= DRAW_FIRST_STEP &&
    mesmaLista(doRascunho.session.selectedPlayerIds, input.confirmedPlayerIds);

  if (!retoma) {
    return { session, wizardStep: DRAW_FIRST_STEP, bestDivisions: [], selectedDivisionIndex: 0 };
  }
  return {
    session,
    wizardStep: Math.min(doRascunho.wizardStep, DRAW_TEAMS_STEP),
    bestDivisions: doRascunho.bestDivisions,
    selectedDivisionIndex: doRascunho.selectedDivisionIndex,
  };
}
