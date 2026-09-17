export type AuthorizedFormationStage = 'session' | 'roster' | 'snapshot';

export interface AuthorizedFormationProgress {
  readonly windowId?: string;
  readonly finalizedRosterRevisionId?: string;
  readonly finalizedPlayerCloudIds?: readonly string[];
  readonly snapshotId?: string;
  readonly snapshotRosterRevisionId?: string;
  readonly pendingCommandIds: Readonly<Record<string, string>>;
}
