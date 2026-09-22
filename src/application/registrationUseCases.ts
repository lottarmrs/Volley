import type { RegistrationBoard, Session } from '@shared/types';
import { registrationCloudService } from '@infra/supabase/registrationCloudService';
import { registrationBoardCloudService } from '@infra/supabase/registrationBoardCloudService';
import { sessionCohortCloudService } from '@infra/supabase/sessionCohortCloudService';
import { appOk, productError, type AppResult } from './appResult';
import type { RegistrationBoardGateway } from './registrationBoardGateway';
import {
  AuthorizedFormationFailure,
  classifyAuthorizedFormationFailure,
} from './authorizedTeamFormationRules';

export const defaultRegistrationBoardGateway: RegistrationBoardGateway = {
  readSessionBoard: (sessionId) => registrationBoardCloudService.readSessionBoard(sessionId),
  readBoard: (windowId) => registrationBoardCloudService.readBoard(windowId),
  join: (input) => registrationBoardCloudService.join(input),
  leave: (input) => registrationBoardCloudService.leave(input),
  createTargetSession: (input) => sessionCohortCloudService.createTargetSession(input),
  readTargetSession: (sessionId) => sessionCohortCloudService.readTargetSession(sessionId),
  registration: registrationCloudService,
};

function codeOf(error: unknown): string | undefined {
  if (error && typeof error === 'object' && 'code' in error) {
    const { code } = error as { code?: unknown };
    return typeof code === 'string' ? code : undefined;
  }
  return undefined;
}

function classify(step: string, error: unknown): AppResult<RegistrationBoard> {
  const code = codeOf(error);
  if (code === '42501' && (step === 'join' || step === 'leave')) {
    return productError(
      'permission_denied',
      'Você precisa ser membro ativo desta comunidade para se inscrever.',
    );
  }
  if (code === '23514') {
    return productError('invalid_input', 'A inscrição está fechada. Fale com quem organiza.');
  }
  if (code === '40001') {
    return productError(
      'invalid_input',
      'A lista mudou enquanto você olhava. Atualize e tente de novo.',
    );
  }
  return classifyAuthorizedFormationFailure(new AuthorizedFormationFailure(step, error));
}

async function comQuadro(
  step: string,
  windowId: string,
  gateway: RegistrationBoardGateway,
  acao: () => Promise<unknown>,
): Promise<AppResult<RegistrationBoard>> {
  try {
    await acao();
    return appOk(await gateway.readBoard(windowId));
  } catch (error) {
    return classify(step, error);
  }
}

export async function openRegistration(
  input: {
    session: Session;
    communityCloudId: string | null;
    capacity: number;
    commandId: string;
    windowId: string;
    onSessionChange?: (session: Session) => void;
  },
  gateway: RegistrationBoardGateway = defaultRegistrationBoardGateway,
): Promise<AppResult<RegistrationBoard>> {
  if (!input.communityCloudId) {
    return productError(
      'invalid_input',
      'Esta comunidade ainda não está na nuvem. Sincronize antes de abrir a inscrição.',
    );
  }

  let session = input.session;
  try {
    let cloudId = session.authorityModel === 'target' ? session.cloudId : undefined;
    if (!cloudId) {
      try {
        cloudId = (
          await gateway.createTargetSession({
            sessionId: session.id,
            communityId: input.communityCloudId,
            name: session.name,
            playMode: session.type === 'tournament' ? 'STRUCTURED_MATCHES' : 'FREE_PLAY',
          })
        ).id;
      } catch (error) {
        if (codeOf(error) !== '23505') throw error;
        cloudId = (await gateway.readTargetSession(session.id)).id;
      }
      session = { ...session, cloudId, authorityModel: 'target' };
      input.onSessionChange?.(session);
    }

    const progress = session.authorizedFormation ?? { pendingCommandIds: {} };
    session = {
      ...session,
      authorizedFormation: { ...progress, windowId: input.windowId },
    };
    input.onSessionChange?.(session);

    const revision = await gateway.registration.createWindow({
      commandId: input.commandId,
      windowId: input.windowId,
      sessionId: cloudId,
      capacity: input.capacity,
    });
    await gateway.registration.openWindow({
      commandId: `${input.commandId}-open`,
      windowId: input.windowId,
      expectedRevision: revision,
    });
    return appOk(await gateway.readBoard(input.windowId));
  } catch (error) {
    return classify('openRegistration', error);
  }
}

export function joinRegistration(
  input: { windowId: string; commandId: string; entryId: string },
  gateway: RegistrationBoardGateway = defaultRegistrationBoardGateway,
): Promise<AppResult<RegistrationBoard>> {
  return comQuadro('join', input.windowId, gateway, () =>
    gateway.join({ commandId: input.commandId, entryId: input.entryId, windowId: input.windowId }),
  );
}

export function leaveRegistration(
  input: { windowId: string; commandId: string },
  gateway: RegistrationBoardGateway = defaultRegistrationBoardGateway,
): Promise<AppResult<RegistrationBoard>> {
  return comQuadro('leave', input.windowId, gateway, () =>
    gateway.leave({ commandId: input.commandId, windowId: input.windowId }),
  );
}

export function addAthleteToRegistration(
  input: { windowId: string; playerCloudId: string; commandId: string; entryId: string },
  gateway: RegistrationBoardGateway = defaultRegistrationBoardGateway,
): Promise<AppResult<RegistrationBoard>> {
  return comQuadro('addEntry', input.windowId, gateway, () =>
    gateway.registration.addEntry({
      commandId: input.commandId,
      entryId: input.entryId,
      windowId: input.windowId,
      playerId: input.playerCloudId,
    }),
  );
}

export function removeAthleteFromRegistration(
  input: { windowId: string; playerCloudId: string; commandId: string },
  gateway: RegistrationBoardGateway = defaultRegistrationBoardGateway,
): Promise<AppResult<RegistrationBoard>> {
  return comQuadro('removeEntry', input.windowId, gateway, () =>
    gateway.registration.removeEntry({
      commandId: input.commandId,
      windowId: input.windowId,
      playerId: input.playerCloudId,
      reason: 'ORGANIZER_DESELECTED',
    }),
  );
}

export function changeRegistrationCapacity(
  input: { windowId: string; capacity: number; commandId: string },
  gateway: RegistrationBoardGateway = defaultRegistrationBoardGateway,
): Promise<AppResult<RegistrationBoard>> {
  return comQuadro('changeCapacity', input.windowId, gateway, () =>
    gateway.registration.changeCapacity({
      commandId: input.commandId,
      windowId: input.windowId,
      capacity: input.capacity,
    }),
  );
}

export function setRegistrationOpen(
  input: { windowId: string; open: boolean; expectedRevision: number; commandId: string },
  gateway: RegistrationBoardGateway = defaultRegistrationBoardGateway,
): Promise<AppResult<RegistrationBoard>> {
  const command = {
    commandId: input.commandId,
    windowId: input.windowId,
    expectedRevision: input.expectedRevision,
  };
  return comQuadro(input.open ? 'reopenWindow' : 'closeWindow', input.windowId, gateway, () =>
    input.open
      ? gateway.registration.reopenWindow(command)
      : gateway.registration.closeWindow(command),
  );
}
