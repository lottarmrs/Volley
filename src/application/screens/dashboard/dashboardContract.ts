import type { Game, Session } from '@shared/types';
import type { SessionDraft } from '@logic/sessionDraft';
import type { ScreenContract } from '../screenContract';
import type { DashboardModel } from './dashboardModel';
import type { DashboardIntent } from './dashboardIntents';

export interface DashboardContractInput {
  activeSession: Session | null;
  sessionDraft: SessionDraft | null;
  games?: Game[];
  onNewSession: () => void;
  onResumeSession: () => void;
  onResumeDraft: (draft: SessionDraft) => void;
  onClearDraft: () => void;
  onClearActiveSession: () => void;
  onPlayers: () => void;
  onHistory: () => void;
  onExportBackup: () => void;
  onImportBackup: (file: File) => void;
  onCommunities: () => void;
}

function buildModel(input: DashboardContractInput): DashboardModel {
  return {
    activeSession: input.activeSession,
    sessionDraft: input.sessionDraft,
    games: input.games ?? [],
  };
}

export function buildDashboardContract(
  input: DashboardContractInput,
): ScreenContract<DashboardModel, DashboardIntent> {
  const model = buildModel(input);
  const dispatch = async (intent: DashboardIntent): Promise<void> => {
    switch (intent.kind) {
      case 'newSession':
        input.onNewSession();
        return;
      case 'resumeSession':
        input.onResumeSession();
        return;
      case 'resumeDraft':
        input.onResumeDraft(intent.draft);
        return;
      case 'clearDraft':
        input.onClearDraft();
        return;
      case 'clearActiveSession':
        input.onClearActiveSession();
        return;
      case 'players':
        input.onPlayers();
        return;
      case 'history':
        input.onHistory();
        return;
      case 'exportBackup':
        input.onExportBackup();
        return;
      case 'importBackup':
        input.onImportBackup(intent.file);
        return;
      case 'communities':
        input.onCommunities();
        return;
    }
  };
  return { model, dispatch };
}
