import type {
  AuthorizedFormationProgress,
  Division,
  Player,
  PublishedTeamCandidateSet,
  Session,
} from '@shared/types';
import { sessionCohortCloudService } from '@infra/supabase/sessionCohortCloudService';
import { teamCandidateSetCloudService } from '@infra/supabase/teamCandidateSetCloudService';
import { appOk, productError, type AppResult } from './appResult';
import type { TeamCandidateSetGateway } from './authorizedFormationGateways';
import {
  AuthorizedFormationFailure,
  classifyAuthorizedFormationFailure,
} from './authorizedTeamFormationRules';
import { buildTeamCandidateSetPayload } from './teamCandidateSetMapper';

const PUBLISH_KEY = 'publishCandidateSet';

export interface PublishCandidateSetInput {
  readonly session: Session;
  readonly divisions: readonly Division[];
  readonly players: readonly Player[];
  readonly createId: () => string;
  readonly onSessionChange?: (session: Session) => void;
}

export interface PublishCandidateSetOutput {
  readonly session: Session;
  readonly result: AppResult<PublishedTeamCandidateSet>;
}

export const defaultTeamCandidateSetGateway: TeamCandidateSetGateway = {
  readRosterRevision: (id) => sessionCohortCloudService.readRosterRevision(id),
  publish: (input) => teamCandidateSetCloudService.publish(input),
};

export function clearCandidateSetPublication(session: Session): Session {
  const progress = session.authorizedFormation;
  if (
    !progress ||
    (!progress.publishedCandidateSetId && !progress.pendingCommandIds[PUBLISH_KEY])
  ) {
    return session;
  }
  const { publishedCandidateSetId: _published, ...rest } = progress;
  const { [PUBLISH_KEY]: _pending, ...pendingCommandIds } = progress.pendingCommandIds;
  return { ...session, authorizedFormation: { ...rest, pendingCommandIds } };
}

export async function publishTeamCandidateSet(
  input: PublishCandidateSetInput,
  gateway: TeamCandidateSetGateway = defaultTeamCandidateSetGateway,
): Promise<PublishCandidateSetOutput> {
  let session = input.session;
  const progress = session.authorizedFormation;
  const snapshotId = progress?.snapshotId;
  const rosterRevisionId = progress?.snapshotRosterRevisionId;
  const sessionCloudId = session.cloudId;
  if (
    session.authorityModel !== 'target' ||
    !sessionCloudId ||
    !progress ||
    !snapshotId ||
    !rosterRevisionId ||
    input.divisions.length === 0
  ) {
    return {
      session,
      result: productError('invalid_input', 'Gere os times pela comunidade antes de publicar.'),
    };
  }

  const commit = (next: AuthorizedFormationProgress) => {
    session = { ...session, authorizedFormation: next };
    input.onSessionChange?.(session);
  };

  const commandId = progress.pendingCommandIds[PUBLISH_KEY] ?? input.createId();
  commit({
    ...progress,
    pendingCommandIds: { ...progress.pendingCommandIds, [PUBLISH_KEY]: commandId },
  });

  try {
    const roster = await gateway.readRosterRevision(rosterRevisionId);
    const mapping = buildTeamCandidateSetPayload({
      divisions: input.divisions,
      constraints: session.config?.balanceConstraints,
      roster,
      players: input.players,
    });
    if (!mapping.ok) {
      return {
        session,
        result: classifyAuthorizedFormationFailure(
          new AuthorizedFormationFailure('rekey', new Error('Player without participant')),
        ),
      };
    }
    const published = await gateway.publish({
      commandId,
      sessionId: sessionCloudId,
      snapshotId,
      set: mapping.set,
    });
    const current = session.authorizedFormation ?? progress;
    const { [PUBLISH_KEY]: _done, ...pendingCommandIds } = current.pendingCommandIds;
    commit({ ...current, pendingCommandIds, publishedCandidateSetId: published.setId });
    return { session, result: appOk(published) };
  } catch (error) {
    return {
      session,
      result: classifyAuthorizedFormationFailure(
        new AuthorizedFormationFailure('publishCandidateSet', error),
      ),
    };
  }
}
