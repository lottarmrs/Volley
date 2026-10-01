import { Session, Division } from '../types';
import { STORAGE_KEYS, saveToStorage, loadFromStorage } from '../storage/localStorageRepository';
import { normalizeSessionDraft } from './migrations';

export interface SessionDraft {
  session: Session;
  wizardStep: number;
  bestDivisions: Division[];
  selectedDivisionIndex: number;
  updatedAt: string;
}

export function saveSessionDraft(draft: SessionDraft) {
  saveToStorage(STORAGE_KEYS.sessionDraft, draft);
}

export function loadSessionDraft(): SessionDraft | null {
  return normalizeSessionDraft(
    loadFromStorage<SessionDraft | null>(STORAGE_KEYS.sessionDraft, null),
  );
}

export function clearSessionDraft() {
  localStorage.removeItem(STORAGE_KEYS.sessionDraft);
}

export interface SessionDraftStore {
  save: (draft: SessionDraft) => void;
  clear: () => void;
}

export function peladaDrawDraftKey(sessionId: string): string {
  return `vpg_sorteio_${sessionId}`;
}

export function loadPeladaDrawDraft(sessionId: string): SessionDraft | null {
  try {
    return normalizeSessionDraft(
      loadFromStorage<SessionDraft | null>(peladaDrawDraftKey(sessionId), null),
    );
  } catch {
    return null;
  }
}

export function peladaDrawDraftStore(sessionId: string): SessionDraftStore {
  return {
    save: (draft) => saveToStorage(peladaDrawDraftKey(sessionId), draft),
    clear: () => localStorage.removeItem(peladaDrawDraftKey(sessionId)),
  };
}
