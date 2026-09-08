export interface BalanceInputSnapshotCaptureRequest {
  commandId: string;
  sessionId: string;
  rosterRevisionId: string;
}

export interface BalanceInputSnapshotParticipant {
  participant_id: string;
  identity_kind: 'PLAYER' | 'GUEST';
  display_name_at_time: string;
  attribute_vector: Record<string, number>;
  estimated_dimensions: string[];
  is_estimated: boolean;
  source_profile_revision: string | null;
  height_cm: number | null;
  gender: string | null;
  primary_position: string | null;
  secondary_positions: string[];
  is_injured: boolean;
}

export interface BalanceInputSnapshot {
  snapshot_id: string;
  session_id: string;
  roster_revision_id: string;
  rubric_version: 'v0-legacy-11';
  resolver_version: 'v0-global-roster-mean-5';
  global_policy_version: 'v0-equal-community-mean';
  community_policy_version: 'v0-legacy-mad-mean';
  captured_at: string;
  input_fingerprint: string;
  participants: BalanceInputSnapshotParticipant[];
}
