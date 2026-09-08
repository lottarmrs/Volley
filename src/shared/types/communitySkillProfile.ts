export interface CommunitySkillProfileRequest {
  communityId: string;
  playerId: string;
  rubricVersion: string;
}

export interface CommunitySkillProfile {
  community_id: string;
  player_id: string;
  rubric_version: string;
  aggregation_policy_version: 'v0-legacy-mad-mean';
  status: 'EXPERIMENTAL';
  source_revision: string;
  calculated_at: string;
  contribution_count: number;
  dimensions: Array<{
    dimension_key: string;
    value: number | null;
    sample_count: number;
    included_count: number;
    excluded_count: number;
  }>;
}
