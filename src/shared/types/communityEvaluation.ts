import type { Attributes } from './player';

export const COMMUNITY_EVALUATION_RUBRIC = 'v0-legacy-11';

export interface CommunityEvaluationCommand {
  commandId: string;
  contributionId: string;
  communityId: string;
  playerId: string;
  rubricVersion: string;
  dimensions: Partial<Record<keyof Attributes, number>>;
  expectedContributionId: string | null;
}

export interface CommunityEvaluationMember {
  user_id: string;
  label: string;
  is_evaluator: boolean;
}

export interface CommunityEvaluationEditorContext {
  community_id: string;
  player_id: string;
  authority_model: 'legacy' | 'target';
  can_evaluate: boolean;
  can_manage_evaluators: boolean;
  rubric_version: string;
  own_evaluation: {
    contribution_id: string;
    rubric_version: string;
    dimensions: Partial<Record<keyof Attributes, number>>;
  } | null;
  members: CommunityEvaluationMember[];
}
