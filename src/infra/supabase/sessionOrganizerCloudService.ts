import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient';
import type { RpcClient } from './sessionCohortCloudService';

export interface SessionOrganizerService {
  /** Concede ou remove a responsabilidade ORGANIZER na comunidade. Exige AAL2. */
  setCommunityOrganizer(input: {
    communityId: string;
    userId: string;
    enabled: boolean;
  }): Promise<void>;
  /** Amarra a pessoa a esta sessão. Ela precisa já ter a responsabilidade. */
  assignSessionOrganizer(input: {
    commandId: string;
    assignmentId: string;
    sessionId: string;
    expectedRevision: number;
    organizerUserId: string;
  }): Promise<void>;
}

export function createSessionOrganizerCloudService(client: RpcClient): SessionOrganizerService {
  async function call(name: string, args: Record<string, unknown>): Promise<unknown> {
    const { data, error } = await client.rpc(name, args);
    if (error) throw error;
    return data;
  }

  return {
    async setCommunityOrganizer(input) {
      await call('set_community_organizer', {
        p_community_id: input.communityId,
        p_user_id: input.userId,
        p_enabled: input.enabled,
      });
    },
    async assignSessionOrganizer(input) {
      await call('assign_target_session_organizer', {
        p_command_id: input.commandId,
        p_assignment_id: input.assignmentId,
        p_session_id: input.sessionId,
        p_expected_revision: input.expectedRevision,
        p_organizer_user_id: input.organizerUserId,
      });
    },
  };
}

export const sessionOrganizerCloudService: SessionOrganizerService = isSupabaseConfigured
  ? createSessionOrganizerCloudService(supabase)
  : createSessionOrganizerCloudService({
      rpc: async () => {
        throw Object.assign(new Error('Cloud unavailable'), { code: 'CLOUD_UNAVAILABLE' });
      },
    });
