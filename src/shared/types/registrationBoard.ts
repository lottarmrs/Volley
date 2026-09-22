export type RegistrationEntryStatus = 'CONFIRMED' | 'WAITLISTED';

export type RegistrationBoardStatus = 'DRAFT' | 'OPEN' | 'CLOSED' | 'LOCKED';

export interface RegistrationBoardEntry {
  readonly entryId: string;
  readonly playerId: string;
  readonly status: RegistrationEntryStatus;
  readonly queuePosition: number | null;
  readonly source: string;
  readonly joinedAt: string;
}

export interface RegistrationBoard {
  readonly windowId: string;
  readonly sessionId: string;
  readonly status: RegistrationBoardStatus;
  readonly revision: number;
  readonly capacity: number;
  readonly confirmedCount: number;
  readonly waitlistedCount: number;
  readonly viewerCanManage: boolean;
  readonly viewerPlayerId: string | null;
  readonly viewerEntryStatus: RegistrationEntryStatus | null;
  readonly viewerQueuePosition: number | null;
  readonly entries: readonly RegistrationBoardEntry[];
}
