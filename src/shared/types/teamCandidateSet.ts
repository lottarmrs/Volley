export interface TeamCandidateSetConstraints {
  readonly lockedParticipantTeams: Readonly<Record<string, number>>;
  readonly pairsTogether: readonly (readonly [string, string])[];
  readonly pairsSeparated: readonly (readonly [string, string])[];
}

export interface TeamCandidatePayload {
  readonly teams: readonly (readonly string[])[];
  readonly clientClaimed: Readonly<Record<string, unknown>>;
}

export interface TeamCandidateSetPayload {
  readonly teamCount: number;
  readonly contractVersion: string;
  readonly algorithmVersion: string;
  readonly objectivePolicyVersion: string;
  readonly hardConstraints: TeamCandidateSetConstraints;
  readonly clientClaimed: Readonly<Record<string, unknown>>;
  readonly candidates: readonly TeamCandidatePayload[];
}

export interface PublishTeamCandidateSetRequest {
  readonly commandId: string;
  readonly sessionId: string;
  readonly snapshotId: string;
  readonly set: TeamCandidateSetPayload;
}

export interface PublishedTeamCandidateSet {
  readonly setId: string;
  readonly setFingerprint: string;
}

export interface TeamCandidateSetRead {
  readonly setId: string;
  readonly sessionId: string;
  readonly rosterRevisionId: string;
  readonly snapshotId: string;
  readonly teamCount: number;
  readonly setFingerprint: string;
  readonly candidates: readonly {
    readonly candidateIndex: number;
    readonly candidateFingerprint: string;
    readonly assignment: readonly (readonly string[])[];
  }[];
}

export type CandidateSetPublicationState = 'idle' | 'publishing' | 'published' | 'error';
