import type { Game, Player, PointEvent, Session, SessionReport, Team } from '@shared/types';

export type HistoryTab = 'sessions' | 'stats';

export interface HistoryViewModel {
  sessions: Session[];
  games: Game[];
  pointEvents: PointEvent[];
  teams: Team[];
  players: Player[];
  sessionReports: SessionReport[];
  selectedHistorySessionId: string | null;
  initialTab?: HistoryTab;
  hideTabs?: boolean;
}
