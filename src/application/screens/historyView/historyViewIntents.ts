export type HistoryViewIntent =
  | { kind: 'setSelectedSessionId'; id: string | null }
  | { kind: 'deleteSession'; id: string }
  | { kind: 'backToDashboard' };
