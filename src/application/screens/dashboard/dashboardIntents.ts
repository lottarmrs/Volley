import type { SessionDraft } from '@logic/sessionDraft';

export type DashboardIntent =
  | { kind: 'newSession' }
  | { kind: 'resumeSession' }
  | { kind: 'resumeDraft'; draft: SessionDraft }
  | { kind: 'clearDraft' }
  | { kind: 'clearActiveSession' }
  | { kind: 'players' }
  | { kind: 'history' }
  | { kind: 'exportBackup' }
  | { kind: 'importBackup'; file: File }
  | { kind: 'communities' };
