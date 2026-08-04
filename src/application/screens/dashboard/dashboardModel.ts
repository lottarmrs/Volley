import type { Session } from '@shared/types';
import type { SessionDraft } from '@logic/sessionDraft';

export interface DashboardModel {
  activeSession: Session | null;
  sessionDraft: SessionDraft | null;
}
