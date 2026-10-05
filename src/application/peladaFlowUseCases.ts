import type { SessionType } from '@shared/types';
import { generateUUID } from '@logic/uuid';
import { registrationCloudService } from '@infra/supabase/registrationCloudService';
import { sessionCohortCloudService } from '@infra/supabase/sessionCohortCloudService';
import { targetSessionLifecycleCloudService } from '@infra/supabase/targetSessionLifecycleCloudService';
import type { RegistrationGateway } from './authorizedFormationGateways';
import type { SessionCohortCreationGateway } from './sessionCohortCutover';
import { appOk, productError, type AppResult } from './appResult';
import { toOnlineError } from './onlineErrors';
import { unpaidRefusalMessage } from './registrationRefusals';

export type PeladaFlowGateway = SessionCohortCreationGateway &
  Pick<
    RegistrationGateway,
    | 'createWindow'
    | 'openWindow'
    | 'addEntry'
    | 'closeWindow'
    | 'lockWindow'
    | 'finalizeRoster'
    | 'readWindow'
  > & {
    setDetails(
      sessionId: string,
      details: { location: string | null; notes: string | null },
    ): Promise<void>;
  };

const defaultGateway: PeladaFlowGateway = {
  createTargetSession: (input) => sessionCohortCloudService.createTargetSession(input),
  createWindow: (input) => registrationCloudService.createWindow(input),
  openWindow: (input) => registrationCloudService.openWindow(input),
  addEntry: (input) => registrationCloudService.addEntry(input),
  closeWindow: (input) => registrationCloudService.closeWindow(input),
  lockWindow: (input) => registrationCloudService.lockWindow(input),
  finalizeRoster: (input) => registrationCloudService.finalizeRoster(input),
  readWindow: (windowId) => registrationCloudService.readWindow(windowId),
  setDetails: (sessionId, details) =>
    targetSessionLifecycleCloudService.setDetails(sessionId, details),
};

const playMode = (type: SessionType) =>
  type === 'tournament' ? 'STRUCTURED_MATCHES' : 'FREE_PLAY';

async function createWithOpenList(
  input: {
    communityCloudId: string;
    name: string;
    plannedStartAt: string;
    capacity: number;
    type: SessionType;
  },
  gateway: PeladaFlowGateway,
) {
  const sessionId = generateUUID();
  const windowId = generateUUID();
  await gateway.createTargetSession({
    sessionId,
    communityId: input.communityCloudId,
    name: input.name,
    playMode: playMode(input.type),
    plannedStartAt: input.plannedStartAt,
  });
  const created = await gateway.createWindow({
    commandId: generateUUID(),
    windowId,
    sessionId,
    capacity: input.capacity,
  });
  const revision = await gateway.openWindow({
    commandId: generateUUID(),
    windowId,
    expectedRevision: created,
  });
  return { sessionId, windowId, revision };
}

async function closeLockFinalize(windowId: string, revision: number, gateway: PeladaFlowGateway) {
  const closed = await gateway.closeWindow({
    commandId: generateUUID(),
    windowId,
    expectedRevision: revision,
  });
  const locked = await gateway.lockWindow({
    commandId: generateUUID(),
    windowId,
    expectedRevision: closed,
  });
  return gateway.finalizeRoster({ commandId: generateUUID(), windowId, expectedRevision: locked });
}

export async function markPelada(
  input: {
    communityCloudId: string;
    name: string;
    plannedStartAt: string;
    location: string | null;
    capacity: number;
    type: SessionType;
  },
  gateway: PeladaFlowGateway = defaultGateway,
): Promise<AppResult<{ sessionId: string; windowId: string }>> {
  if (!input.plannedStartAt) return productError('invalid_input', 'Escolha o horário da pelada.');
  if (!Number.isInteger(input.capacity) || input.capacity < 2) {
    return productError('invalid_input', 'A lista precisa de pelo menos 2 vagas.');
  }
  try {
    const { sessionId, windowId } = await createWithOpenList(input, gateway);
    if (input.location?.trim()) {
      await gateway.setDetails(sessionId, { location: input.location.trim(), notes: null });
    }
    return appOk({ sessionId, windowId });
  } catch (error) {
    return { ok: false, error: toOnlineError(error) };
  }
}

export async function startQuickPelada(
  input: { communityCloudId: string; name: string; playerCloudIds: string[]; type: SessionType },
  gateway: PeladaFlowGateway = defaultGateway,
): Promise<AppResult<{ sessionId: string; windowId: string }>> {
  if (input.playerCloudIds.length < 4) {
    return productError('invalid_input', 'Escolha pelo menos 4 atletas.');
  }
  try {
    const opened = await createWithOpenList(
      { ...input, plannedStartAt: new Date().toISOString(), capacity: input.playerCloudIds.length },
      gateway,
    );
    let revision = opened.revision;
    for (const playerId of input.playerCloudIds) {
      revision = await gateway.addEntry({
        commandId: generateUUID(),
        entryId: generateUUID(),
        windowId: opened.windowId,
        playerId,
      });
    }
    await closeLockFinalize(opened.windowId, revision, gateway);
    return appOk({ sessionId: opened.sessionId, windowId: opened.windowId });
  } catch (error) {
    return { ok: false, error: toOnlineError(error) };
  }
}

export async function closeListAndFinalize(
  input: { windowId: string },
  gateway: PeladaFlowGateway = defaultGateway,
): Promise<AppResult<{ rosterRevisionId: string }>> {
  try {
    const window = await gateway.readWindow(input.windowId);
    let revision = window.revision;
    if (window.status === 'OPEN') {
      revision = await gateway.closeWindow({
        commandId: generateUUID(),
        windowId: input.windowId,
        expectedRevision: revision,
      });
    }
    if (window.status === 'OPEN' || window.status === 'CLOSED') {
      revision = await gateway.lockWindow({
        commandId: generateUUID(),
        windowId: input.windowId,
        expectedRevision: revision,
      });
    }
    const finalized = await gateway.finalizeRoster({
      commandId: generateUUID(),
      windowId: input.windowId,
      expectedRevision: revision,
    });
    return appOk({ rosterRevisionId: finalized.rosterRevisionId });
  } catch (error) {
    const semPagar = unpaidRefusalMessage(error);
    if (semPagar) return productError('invalid_input', semPagar);
    return { ok: false, error: toOnlineError(error) };
  }
}
