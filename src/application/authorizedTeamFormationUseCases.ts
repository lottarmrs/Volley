import type {
  AuthorizedFormationProgress,
  AuthorizedFormationStage,
  BalanceInputSnapshot,
  Player,
  Session,
  SessionConfig,
  TeamFormationRequest,
} from '@shared/types';
import { balanceInputSnapshotCloudService } from '@infra/supabase/balanceInputSnapshotCloudService';
import { registrationCloudService } from '@infra/supabase/registrationCloudService';
import { sessionCohortCloudService } from '@infra/supabase/sessionCohortCloudService';
import { appOk, type AppResult } from './appResult';
import type {
  AuthorizedFormationGateway,
  RegistrationWindowRead,
  WindowCommand,
} from './authorizedFormationGateways';
import {
  AuthorizedFormationFailure,
  classifyAuthorizedFormationFailure,
  rekeyAuthorizedRequest,
} from './authorizedTeamFormationRules';
import { fromAuthorizedSnapshot } from './teamFormationAdapters';

export interface PrepareAuthorizedFormationInput {
  readonly session: Session;
  readonly communityCloudId: string | null;
  readonly players: readonly Player[];
  readonly teamCount: number;
  readonly config: SessionConfig;
  readonly createId: () => string;
  readonly onStage?: (stage: AuthorizedFormationStage) => void;
  readonly onSessionChange?: (session: Session) => void;
  readonly isCancelled?: () => boolean;
}

export interface AuthorizedFormationDraw {
  readonly request: TeamFormationRequest;
  readonly estimatedCount: number;
  readonly participantCount: number;
}

export interface PrepareAuthorizedFormationOutput {
  readonly session: Session;
  readonly result: AppResult<AuthorizedFormationDraw> | null;
}

export const defaultAuthorizedFormationGateway: AuthorizedFormationGateway = {
  createTargetSession: (input) => sessionCohortCloudService.createTargetSession(input),
  readTargetSession: (id) => sessionCohortCloudService.readTargetSession(id),
  readRosterRevision: (id) => sessionCohortCloudService.readRosterRevision(id),
  registration: registrationCloudService,
  captureSnapshot: (input) => balanceInputSnapshotCloudService.capture(input),
  readSnapshot: (id) => balanceInputSnapshotCloudService.read(id),
};

class ChainCancelled extends Error {}

const EMPTY_PROGRESS: AuthorizedFormationProgress = { pendingCommandIds: {} };

function codeOf(error: unknown): string | undefined {
  if (error && typeof error === 'object' && 'code' in error) {
    const { code } = error as { code?: unknown };
    return typeof code === 'string' ? code : undefined;
  }
  return undefined;
}

function sameMembers(left: readonly string[], right: readonly string[]): boolean {
  const a = new Set(left.map((id) => id.toLowerCase()));
  const b = new Set(right.map((id) => id.toLowerCase()));
  return a.size === b.size && [...a].every((id) => b.has(id));
}

export async function prepareAuthorizedTeamFormation(
  input: PrepareAuthorizedFormationInput,
  gateway: AuthorizedFormationGateway = defaultAuthorizedFormationGateway,
): Promise<PrepareAuthorizedFormationOutput> {
  let session = input.session;
  let progress: AuthorizedFormationProgress = session.authorizedFormation ?? EMPTY_PROGRESS;
  const playerCloudIds = input.players.map((player) => player.cloudId as string);

  const commit = (next: Partial<AuthorizedFormationProgress>, patch: Partial<Session> = {}) => {
    progress = { ...progress, ...next };
    session = { ...session, ...patch, authorizedFormation: progress };
    input.onSessionChange?.(session);
  };

  const checkCancelled = () => {
    if (input.isCancelled?.()) throw new ChainCancelled();
  };

  const step = async <T>(key: string, work: () => Promise<T>, player?: Player): Promise<T> => {
    try {
      return await work();
    } catch (error) {
      if (error instanceof ChainCancelled) throw error;
      throw new AuthorizedFormationFailure(key, error, player);
    }
  };

  const command = async <T>(
    key: string,
    work: (commandId: string) => Promise<T>,
    player?: Player,
  ): Promise<T> => {
    const commandId = progress.pendingCommandIds[key] ?? input.createId();
    commit({ pendingCommandIds: { ...progress.pendingCommandIds, [key]: commandId } });
    const value = await step(key, () => work(commandId), player);
    const { [key]: _done, ...pending } = progress.pendingCommandIds;
    commit({ pendingCommandIds: pending });
    checkCancelled();
    return value;
  };

  const ensureTargetSession = async (): Promise<string> => {
    if (session.authorityModel === 'target' && session.cloudId) return session.cloudId;
    if (!input.communityCloudId) {
      throw new AuthorizedFormationFailure('createSession', new Error('Community is not synced'));
    }
    input.onStage?.('session');
    let cloudId: string;
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
      if (codeOf(error) !== '23505') throw new AuthorizedFormationFailure('createSession', error);
      cloudId = (await step('createSession', () => gateway.readTargetSession(session.id))).id;
    }
    commit({}, { cloudId, authorityModel: 'target' });
    checkCancelled();
    return cloudId;
  };

  const readWindow = async (windowId: string): Promise<RegistrationWindowRead | null> => {
    try {
      return await gateway.registration.readWindow(windowId);
    } catch (error) {
      if (codeOf(error) === 'P0002') return null;
      throw new AuthorizedFormationFailure('readWindow', error);
    }
  };

  const syncRegistration = async (sessionCloudId: string): Promise<string> => {
    input.onStage?.('roster');
    let windowId = progress.windowId;
    let window: RegistrationWindowRead | null = null;
    if (windowId) {
      window = await readWindow(windowId);
    } else {
      windowId = input.createId();
      commit({ windowId });
    }
    const id = windowId;

    if (!window) {
      await command('createWindow', (commandId) =>
        gateway.registration.createWindow({
          commandId,
          windowId: id,
          sessionId: sessionCloudId,
          capacity: playerCloudIds.length,
        }),
      );
      window = await readWindow(id);
      if (!window) {
        throw new AuthorizedFormationFailure(
          'readWindow',
          new Error('Registration Window missing'),
        );
      }
    }

    const confirmed = window.confirmedPlayerIds;
    const differs = !sameMembers(confirmed, playerCloudIds);
    if (window.status === 'LOCKED' && !differs && progress.finalizedRosterRevisionId) {
      return progress.finalizedRosterRevisionId;
    }

    let status = window.status;
    let revision = window.revision;
    const lifecycle = <T>(key: string, run: (windowCommand: WindowCommand) => Promise<T>) =>
      command(key, (commandId) => run({ commandId, windowId: id, expectedRevision: revision }));

    const inscricaoAberta = status === 'OPEN' && confirmed.length > 0 && !!progress.windowId;
    if (inscricaoAberta) {
      revision = await lifecycle('closeWindow', (c) => gateway.registration.closeWindow(c));
      revision = await lifecycle('lockWindow', (c) => gateway.registration.lockWindow(c));
      const finalizada = await lifecycle('finalizeRoster', (c) =>
        gateway.registration.finalizeRoster(c),
      );
      commit({
        finalizedRosterRevisionId: finalizada.rosterRevisionId,
        finalizedPlayerCloudIds: confirmed,
      });
      return finalizada.rosterRevisionId;
    }

    if (status === 'DRAFT') {
      revision = await lifecycle('openWindow', (c) => gateway.registration.openWindow(c));
      status = 'OPEN';
    }
    if ((status === 'CLOSED' || status === 'LOCKED') && differs) {
      revision = await lifecycle('reopenWindow', (c) => gateway.registration.reopenWindow(c));
      status = 'OPEN';
    }
    if (status === 'OPEN') {
      const selected = new Set(playerCloudIds.map((cloudId) => cloudId.toLowerCase()));
      const confirmedSet = new Set(confirmed.map((cloudId) => cloudId.toLowerCase()));
      for (const playerId of confirmed.filter((cloudId) => !selected.has(cloudId.toLowerCase()))) {
        revision = await command(`removeEntry:${playerId}`, (commandId) =>
          gateway.registration.removeEntry({
            commandId,
            windowId: id,
            playerId,
            reason: 'ORGANIZER_DESELECTED',
          }),
        );
      }
      if (window.capacity !== playerCloudIds.length) {
        revision = await command('changeCapacity', (commandId) =>
          gateway.registration.changeCapacity({
            commandId,
            windowId: id,
            capacity: playerCloudIds.length,
          }),
        );
      }
      for (const player of input.players) {
        const cloudId = player.cloudId as string;
        if (confirmedSet.has(cloudId.toLowerCase())) continue;
        revision = await command(
          `addEntry:${cloudId}`,
          (commandId) =>
            gateway.registration.addEntry({
              commandId,
              entryId: input.createId(),
              windowId: id,
              playerId: cloudId,
            }),
          player,
        );
      }
      revision = await lifecycle('closeWindow', (c) => gateway.registration.closeWindow(c));
      status = 'CLOSED';
    }
    if (status === 'CLOSED') {
      revision = await lifecycle('lockWindow', (c) => gateway.registration.lockWindow(c));
    }
    const finalized = await lifecycle('finalizeRoster', (c) =>
      gateway.registration.finalizeRoster(c),
    );
    commit({
      finalizedRosterRevisionId: finalized.rosterRevisionId,
      finalizedPlayerCloudIds: playerCloudIds,
    });
    return finalized.rosterRevisionId;
  };

  const capture = async (sessionCloudId: string, rosterRevisionId: string) => {
    input.onStage?.('snapshot');
    const roster = await step('readRoster', () => gateway.readRosterRevision(rosterRevisionId));
    checkCancelled();
    let snapshot: BalanceInputSnapshot;
    if (progress.snapshotId && progress.snapshotRosterRevisionId === rosterRevisionId) {
      const snapshotId = progress.snapshotId;
      snapshot = await step('readSnapshot', () => gateway.readSnapshot(snapshotId));
    } else {
      snapshot = await command('captureSnapshot', (commandId) =>
        gateway.captureSnapshot({ commandId, sessionId: sessionCloudId, rosterRevisionId }),
      );
      commit({ snapshotId: snapshot.snapshot_id, snapshotRosterRevisionId: rosterRevisionId });
    }
    checkCancelled();
    return { roster, snapshot };
  };

  const attempt = async (): Promise<AuthorizedFormationDraw> => {
    checkCancelled();
    const sessionCloudId = await ensureTargetSession();
    const rosterRevisionId = await syncRegistration(sessionCloudId);
    const { roster, snapshot } = await capture(sessionCloudId, rosterRevisionId);
    const request = rekeyAuthorizedRequest(
      fromAuthorizedSnapshot({ snapshot, teamCount: input.teamCount, config: input.config }),
      roster,
      input.players,
    );
    if (!request) {
      throw new AuthorizedFormationFailure('rekey', new Error('Participant without local Player'));
    }
    return {
      request,
      estimatedCount: snapshot.participants.filter((participant) => participant.is_estimated)
        .length,
      participantCount: snapshot.participants.length,
    };
  };

  for (let attemptIndex = 0; ; attemptIndex += 1) {
    try {
      const draw = await attempt();
      return { session, result: appOk(draw) };
    } catch (error) {
      if (error instanceof ChainCancelled) return { session, result: null };
      const failure =
        error instanceof AuthorizedFormationFailure
          ? error
          : new AuthorizedFormationFailure('buildRequest', error);
      if (attemptIndex === 0 && codeOf(failure.reason) === '40001') {
        const { [failure.step]: _stale, ...pending } = progress.pendingCommandIds;
        commit({
          pendingCommandIds: pending,
          finalizedRosterRevisionId: undefined,
          snapshotId: undefined,
          snapshotRosterRevisionId: undefined,
        });
        continue;
      }
      return { session, result: classifyAuthorizedFormationFailure(failure) };
    }
  }
}
