import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient';
import type { RpcClient } from './sessionCohortCloudService';

/** Leitura direta da tabela: a policy deixa membro ativo ler as responsabilidades
 *  da propria comunidade, entao nao precisa de RPC. */
export interface ResponsibilityReader {
  from(table: string): {
    select(columns: string): {
      eq(
        column: string,
        value: unknown,
      ): {
        eq(
          column: string,
          value: unknown,
        ): {
          is(column: string, value: null): Promise<{ data: unknown; error: unknown }>;
        };
      };
    };
  };
}

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
  /** Quem tem a responsabilidade ORGANIZER ativa nesta comunidade. */
  listOrganizers(communityId: string): Promise<string[]>;
}

export function createSessionOrganizerCloudService(
  client: RpcClient,
  reader?: ResponsibilityReader,
): SessionOrganizerService {
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
    async listOrganizers(communityId) {
      if (!reader) {
        throw Object.assign(new Error('Cloud unavailable'), { code: 'CLOUD_UNAVAILABLE' });
      }
      const { data, error } = await reader
        .from('community_responsibilities')
        .select('user_id')
        .eq('community_id', communityId)
        .eq('responsibility', 'ORGANIZER')
        .is('revoked_at', null);
      if (error) throw error;
      return ((data as { user_id: string }[] | null) ?? []).map((linha) => linha.user_id);
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
  ? createSessionOrganizerCloudService(supabase, supabase as unknown as ResponsibilityReader)
  : createSessionOrganizerCloudService({
      rpc: async () => {
        throw Object.assign(new Error('Cloud unavailable'), { code: 'CLOUD_UNAVAILABLE' });
      },
    });
