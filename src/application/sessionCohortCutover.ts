import { withAttempt, type CommandEnvelope } from './command/commandEnvelope';
import type { CommandResult } from './command/commandOutcome';
import type { CommandPort } from './command/commandPort';

export type TargetSessionContext = 'QUICK' | 'COMMUNITY';
export type TargetSessionPlayMode = 'FREE_PLAY' | 'STRUCTURED_MATCHES';

export interface SessionCutoverInspection {
  readonly eligible: boolean;
  readonly blockers: readonly string[];
  readonly sourceFingerprint: string;
  readonly selectedPlayerCount: number;
}

export interface SessionCohortInspectionGateway {
  inspect(sessionId: string): Promise<SessionCutoverInspection>;
}

export interface TransitionLegacySessionPayload {
  readonly p_command_id: string;
  readonly p_session_id: string;
  readonly p_expected_source_fingerprint: string;
  readonly p_session_context: TargetSessionContext;
  readonly p_play_mode: TargetSessionPlayMode;
}

export const SESSION_COHORT_OPERATIONS = {
  transition: 'transition_legacy_session_to_target',
} as const;

export function inspectLegacySessionCutover(
  gateway: SessionCohortInspectionGateway,
  sessionId: string,
): Promise<SessionCutoverInspection> {
  return gateway.inspect(sessionId);
}

export function transitionLegacySessionCommand(
  sessionId: string,
  expectedSourceFingerprint: string,
  sessionContext: TargetSessionContext,
  playMode: TargetSessionPlayMode,
): CommandEnvelope<TransitionLegacySessionPayload> {
  const commandId = globalThis.crypto.randomUUID();
  return {
    commandId,
    payload: {
      p_command_id: commandId,
      p_session_id: sessionId,
      p_expected_source_fingerprint: expectedSourceFingerprint,
      p_session_context: sessionContext,
      p_play_mode: playMode,
    },
  };
}

export async function executeSessionCohortTransition<TValue = void>(
  port: CommandPort,
  command: CommandEnvelope<TransitionLegacySessionPayload>,
  clientRelease?: string,
): Promise<CommandResult<TValue>> {
  return port.execute<TransitionLegacySessionPayload, TValue>(
    SESSION_COHORT_OPERATIONS.transition,
    withAttempt(command, clientRelease),
  );
}

export function isTargetCohortSession(session: { authorityModel?: string }): boolean {
  return session.authorityModel === 'target';
}
