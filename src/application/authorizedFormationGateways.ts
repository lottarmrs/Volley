import type {
  BalanceInputSnapshot,
  BalanceInputSnapshotCaptureRequest,
  PublishedTeamCandidateSet,
  PublishTeamCandidateSetRequest,
} from '@shared/types';
import type { CreateTargetSessionInput, TargetSessionRead } from './sessionCohortCutover';

export type RegistrationWindowStatus = 'DRAFT' | 'OPEN' | 'CLOSED' | 'LOCKED';

export interface RegistrationWindowRead {
  readonly windowId: string;
  readonly sessionId: string;
  readonly status: RegistrationWindowStatus;
  readonly revision: number;
  readonly capacity: number;
  readonly confirmedPlayerIds: readonly string[];
}

export interface WindowCommand {
  readonly commandId: string;
  readonly windowId: string;
  readonly expectedRevision: number;
}

export interface FinalizedRoster {
  readonly rosterRevisionId: string;
  readonly rosterRevisionNumber: number;
}

export interface RegistrationGateway {
  createWindow(input: {
    commandId: string;
    windowId: string;
    sessionId: string;
    capacity: number;
  }): Promise<number>;
  openWindow(input: WindowCommand): Promise<number>;
  reopenWindow(input: WindowCommand): Promise<number>;
  closeWindow(input: WindowCommand): Promise<number>;
  lockWindow(input: WindowCommand): Promise<number>;
  changeCapacity(input: { commandId: string; windowId: string; capacity: number }): Promise<number>;
  addEntry(input: {
    commandId: string;
    entryId: string;
    windowId: string;
    playerId: string;
  }): Promise<number>;
  removeEntry(input: {
    commandId: string;
    windowId: string;
    playerId: string;
    reason: string;
  }): Promise<number>;
  finalizeRoster(input: WindowCommand): Promise<FinalizedRoster>;
  readWindow(windowId: string): Promise<RegistrationWindowRead>;
}

export interface RosterRevisionEntryRead {
  readonly participantId: string;
  readonly identityKind: 'PLAYER' | 'GUEST';
  readonly playerId: string | null;
}

export interface RosterRevisionRead {
  readonly rosterRevisionId: string;
  readonly sessionId: string;
  readonly entries: readonly RosterRevisionEntryRead[];
}

export interface SessionCohortRosterGateway {
  readRosterRevision(rosterRevisionId: string): Promise<RosterRevisionRead>;
}

export interface AuthorizedFormationGateway {
  createTargetSession(input: CreateTargetSessionInput): Promise<{ id: string }>;
  readTargetSession(sessionCloudId: string): Promise<TargetSessionRead>;
  readRosterRevision(rosterRevisionId: string): Promise<RosterRevisionRead>;
  readonly registration: RegistrationGateway;
  captureSnapshot(input: BalanceInputSnapshotCaptureRequest): Promise<BalanceInputSnapshot>;
  readSnapshot(snapshotId: string): Promise<BalanceInputSnapshot>;
}

export interface TeamCandidateSetGateway {
  readRosterRevision(rosterRevisionId: string): Promise<RosterRevisionRead>;
  publish(input: PublishTeamCandidateSetRequest): Promise<PublishedTeamCandidateSet>;
}
