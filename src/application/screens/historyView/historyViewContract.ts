import type { Game, Player, PointEvent, Session, SessionReport, Team } from '@shared/types';
import type { ScreenContract } from '../screenContract';
import type { HistoryTab, HistoryViewModel } from './historyViewModel';
import type { HistoryViewIntent } from './historyViewIntents';

export interface HistoryViewContractInput {
  sessions: Session[];
  games: Game[];
  pointEvents: PointEvent[];
  teams: Team[];
  players: Player[];
  sessionReports: SessionReport[];
  selectedHistorySessionId: string | null;
  setSelectedHistorySessionId: (id: string | null) => void;
  onDeleteSession: (id: string) => void;
  onBackToDashboard: () => void;
  initialTab?: HistoryTab;
  hideTabs?: boolean;
}

function buildModel(input: HistoryViewContractInput): HistoryViewModel {
  return {
    sessions: input.sessions,
    games: input.games,
    pointEvents: input.pointEvents,
    teams: input.teams,
    players: input.players,
    sessionReports: input.sessionReports,
    selectedHistorySessionId: input.selectedHistorySessionId,
    initialTab: input.initialTab,
    hideTabs: input.hideTabs,
  };
}

export function buildHistoryViewContract(
  input: HistoryViewContractInput,
): ScreenContract<HistoryViewModel, HistoryViewIntent> {
  const model = buildModel(input);
  const dispatch = async (intent: HistoryViewIntent): Promise<void> => {
    switch (intent.kind) {
      case 'setSelectedSessionId':
        input.setSelectedHistorySessionId(intent.id);
        return;
      case 'deleteSession':
        input.onDeleteSession(intent.id);
        return;
      case 'backToDashboard':
        input.onBackToDashboard();
        return;
    }
  };
  return { model, dispatch };
}
