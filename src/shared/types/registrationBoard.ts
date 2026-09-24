export type RegistrationEntryStatus = 'CONFIRMED' | 'WAITLISTED';

export type RegistrationBoardStatus = 'DRAFT' | 'OPEN' | 'CLOSED' | 'LOCKED';

export interface RegistrationPendingCut {
  readonly demoted: readonly string[];
  readonly promoted: readonly string[];
}

export interface RegistrationBoardEntry {
  readonly entryId: string;
  readonly playerId: string;
  readonly status: RegistrationEntryStatus;
  readonly queuePosition: number | null;
  readonly source: string;
  readonly joinedAt: string;
  readonly paidAt: string | null;
  readonly paymentLapsedAt: string | null;
}

export interface RegistrationBoard {
  readonly windowId: string;
  readonly sessionId: string;
  /** Fatos da sessao, para quem abre a inscricao sem ter a pelada no aparelho. */
  readonly sessionName: string | null;
  readonly sessionDate: string | null;
  readonly sessionLifecycleStatus: string | null;
  readonly status: RegistrationBoardStatus;
  readonly revision: number;
  readonly capacity: number;
  readonly confirmedCount: number;
  readonly waitlistedCount: number;
  readonly paymentDueAt: string | null;
  readonly paidCount: number;
  readonly viewerCanManage: boolean;
  readonly viewerPlayerId: string | null;
  readonly viewerEntryStatus: RegistrationEntryStatus | null;
  readonly viewerQueuePosition: number | null;
  readonly viewerPaidAt: string | null;
  readonly pendingDeadlineCut: RegistrationPendingCut | null;
  readonly entries: readonly RegistrationBoardEntry[];
}
