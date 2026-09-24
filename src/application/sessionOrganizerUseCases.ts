import { sessionCohortCloudService } from '@infra/supabase/sessionCohortCloudService';
import { sessionOrganizerCloudService } from '@infra/supabase/sessionOrganizerCloudService';
import { appOk, offlineError, productError, unexpectedError, type AppResult } from './appResult';

export interface SessionOrganizerGateway {
  readTargetSession(sessionId: string): Promise<{ revision: number }>;
  setCommunityOrganizer(input: {
    communityId: string;
    userId: string;
    enabled: boolean;
  }): Promise<void>;
  assignSessionOrganizer(input: {
    commandId: string;
    assignmentId: string;
    sessionId: string;
    expectedRevision: number;
    organizerUserId: string;
  }): Promise<void>;
}

export const defaultSessionOrganizerGateway: SessionOrganizerGateway = {
  readTargetSession: (sessionId) => sessionCohortCloudService.readTargetSession(sessionId),
  setCommunityOrganizer: (input) => sessionOrganizerCloudService.setCommunityOrganizer(input),
  assignSessionOrganizer: (input) => sessionOrganizerCloudService.assignSessionOrganizer(input),
};

function codeOf(error: unknown): string | undefined {
  if (error && typeof error === 'object' && 'code' in error) {
    const { code } = error as { code?: unknown };
    return typeof code === 'string' ? code : undefined;
  }
  return undefined;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function classify(error: unknown): AppResult<void> {
  const code = codeOf(error);
  const message = messageOf(error);

  if (/AAL2|duas etapas/i.test(message)) {
    return productError(
      'permission_denied',
      'Esta ação pede verificação em duas etapas. Ative os dois fatores na sua conta e tente de novo.',
    );
  }
  if (code === '42501') {
    return productError(
      'permission_denied',
      'Só quem administra a comunidade pode mudar quem organiza a pelada.',
    );
  }
  if (code === '23514') {
    return productError(
      'invalid_input',
      'Essa pessoa não pode organizar esta pelada. Ela precisa ser membro ativo da comunidade.',
    );
  }
  if (code === '40001') {
    return productError(
      'invalid_input',
      'A pelada mudou enquanto você olhava. Atualize e tente de novo.',
    );
  }
  if (code === 'CLOUD_UNAVAILABLE') {
    return offlineError('Sem conexão com a nuvem. Mudar quem organiza precisa de internet.');
  }
  return unexpectedError('Não foi possível mudar quem organiza. Tente de novo.');
}

/**
 * Passa a organização de uma pelada para alguém -- ou assume para si.
 *
 * São dois comandos do servidor, nesta ordem: conceder a responsabilidade
 * ORGANIZER na comunidade e amarrar a pessoa àquela sessão. O segundo exige
 * `session.manage`, que vem só da primeira, então `granterUserId` também a
 * recebe quando informado: sem isso o dono não consegue delegar.
 */
export async function transferSessionOrganizer(
  input: {
    sessionCloudId: string;
    communityCloudId: string | null;
    organizerUserId: string;
    commandId: string;
    assignmentId: string;
    granterUserId?: string;
  },
  gateway: SessionOrganizerGateway = defaultSessionOrganizerGateway,
): Promise<AppResult<void>> {
  if (!input.communityCloudId) {
    return productError(
      'invalid_input',
      'Esta comunidade ainda não está na nuvem. Sincronize antes de mudar quem organiza.',
    );
  }

  try {
    if (input.granterUserId && input.granterUserId !== input.organizerUserId) {
      await gateway.setCommunityOrganizer({
        communityId: input.communityCloudId,
        userId: input.granterUserId,
        enabled: true,
      });
    }
    await gateway.setCommunityOrganizer({
      communityId: input.communityCloudId,
      userId: input.organizerUserId,
      enabled: true,
    });

    const sessao = await gateway.readTargetSession(input.sessionCloudId);
    await gateway.assignSessionOrganizer({
      commandId: input.commandId,
      assignmentId: input.assignmentId,
      sessionId: input.sessionCloudId,
      expectedRevision: sessao.revision,
      organizerUserId: input.organizerUserId,
    });
    return appOk(undefined);
  } catch (error) {
    return classify(error);
  }
}
