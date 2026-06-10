import { Session, Division } from '../types';
import {
  STORAGE_KEYS,
  saveToStorage,
  loadFromStorage,
  removeFromStorage,
} from '../storage/localStorageRepository';
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
