import type { CommunityEvaluationCommand, CommunityEvaluationEditorContext } from '@shared/types';
import { isSupabaseConfigured, supabase as client } from '../../lib/supabaseClient';

async function call<T>(name: string, args: Record<string, unknown>): Promise<T> {
  if (!isSupabaseConfigured)
    throw Object.assign(new Error('Cloud unavailable'), { code: 'CLOUD_UNAVAILABLE' });
  const { data, error } = await client.rpc(name, args);
  if (error) throw error;
  return data as T;
}

export const supabase = {
  loadEditor: (communityId: string, playerId: string) =>
    call<CommunityEvaluationEditorContext>('get_community_evaluation_editor', {
      p_community_id: communityId,
      p_player_id: playerId,
    }),
  record: (command: CommunityEvaluationCommand) =>
    call<void>('record_community_player_evaluation', {
      p_command_id: command.commandId,
      p_contribution_id: command.contributionId,
      p_community_id: command.communityId,
      p_player_id: command.playerId,
      p_rubric_version: command.rubricVersion,
      p_dimension_scores: command.dimensions,
      p_expected_contribution_id: command.expectedContributionId,
    }),
  activatedCommunityIds: (communityIds: string[]) =>
    call<string[]>('community_evaluation_target_ids', { p_community_ids: communityIds }),
  activate: (communityId: string) =>
    call<void>('activate_community_evaluation_model', { p_community_id: communityId }),
  setEvaluator: (communityId: string, userId: string, enabled: boolean) =>
    call<void>('set_community_evaluator', {
      p_community_id: communityId,
      p_user_id: userId,
      p_enabled: enabled,
    }),
};
