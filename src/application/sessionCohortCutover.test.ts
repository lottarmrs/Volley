import assert from 'node:assert/strict';
import test from 'node:test';
import { accepted } from './command/commandOutcome';
import type { CommandPort } from './command/commandPort';
import {
  executeSessionCohortTransition,
  inspectLegacySessionCutover,
  transitionLegacySessionCommand,
  type SessionCohortInspectionGateway,
} from './sessionCohortCutover';

test('inspection delegates only the Session id to its gateway', async () => {
  const calls: string[] = [];
  const gateway: SessionCohortInspectionGateway = {
    async inspect(sessionId) {
      calls.push(sessionId);
      return {
        eligible: true,
        blockers: [],
        sourceFingerprint: 'fingerprint-1',
        selectedPlayerCount: 2,
      };
    },
  };

  const inspection = await inspectLegacySessionCutover(gateway, 'session-1');

  assert.deepEqual(calls, ['session-1']);
  assert.deepEqual(inspection, {
    eligible: true,
    blockers: [],
    sourceFingerprint: 'fingerprint-1',
    selectedPlayerCount: 2,
  });
});

test('transition command uses one UUID for its envelope and RPC payload', () => {
  const command = transitionLegacySessionCommand(
    'session-1',
    'fingerprint-1',
    'QUICK',
    'FREE_PLAY',
  );

  assert.match(
    command.commandId,
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  );
  assert.deepEqual(command.payload, {
    p_command_id: command.commandId,
    p_session_id: 'session-1',
    p_expected_source_fingerprint: 'fingerprint-1',
    p_session_context: 'QUICK',
    p_play_mode: 'FREE_PLAY',
  });
  assert.deepEqual(Object.keys(command.payload).sort(), [
    'p_command_id',
    'p_expected_source_fingerprint',
    'p_play_mode',
    'p_session_context',
    'p_session_id',
  ]);
});

test('transition execution sends its semantic operation with fresh attempts for one command', async () => {
  const attempts: Array<{
    operation: string;
    commandId: string;
    requestId: string;
    clientRelease?: string;
  }> = [];
  const port: CommandPort = {
    async execute<_TPayload, TValue>(operation, context) {
      attempts.push({
        operation,
        commandId: context.envelope.commandId,
        requestId: context.transport.requestId,
        clientRelease: context.transport.clientRelease,
      });
      return accepted(undefined as TValue, context.envelope.commandId);
    },
  };
  const command = transitionLegacySessionCommand(
    'session-1',
    'fingerprint-1',
    'COMMUNITY',
    'STRUCTURED_MATCHES',
  );

  await executeSessionCohortTransition(port, command, 'web-1');
  await executeSessionCohortTransition(port, command, 'web-1');

  assert.equal(attempts.length, 2);
  assert.deepEqual(
    attempts.map((attempt) => attempt.operation),
    ['transition_legacy_session_to_target', 'transition_legacy_session_to_target'],
  );
  assert.deepEqual(
    attempts.map((attempt) => attempt.commandId),
    [command.commandId, command.commandId],
  );
  assert.deepEqual(
    attempts.map((attempt) => attempt.clientRelease),
    ['web-1', 'web-1'],
  );
  assert.notEqual(attempts[0].requestId, attempts[1].requestId);
});
