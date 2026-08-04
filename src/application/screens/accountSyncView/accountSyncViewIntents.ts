export type AccountSyncViewIntent =
  | { kind: 'sync' }
  | { kind: 'repairDuplicates' }
  | { kind: 'signOut' }
  | { kind: 'linkGoogleIdentity' }
  | { kind: 'retryPrimarySyncAction' }
  | { kind: 'clearResolvedSyncIssues' }
  | { kind: 'keepMineConflict'; sessionId: string }
  | { kind: 'keepTheirsConflict'; sessionId: string };
