import test from 'node:test';
import assert from 'node:assert/strict';
import {
  authorizationError,
  conflictError,
  offlineError,
  productError,
  technicalError,
  unexpectedError,
  validationError,
  type AppError,
} from '../appResult';
import { newCommand, withAttempt } from './commandEnvelope';
import {
  classifyAppError,
  fromAppResult,
  isAccepted,
  RETRIABLE_WITH_SAME_COMMAND_ID,
  rejection,
} from './commandOutcome';
import { createSupabaseCommandGateway } from '../../infra/supabase/commandGateway';
import { COMMAND_OPERATIONS } from './commandPort';
import { ensureAccountReadyCommand } from './ensureAccountReadyCommand';

function errorOf(result: ReturnType<typeof productError>): AppError {
  return result.error;
}

test('retry keeps the logical intent stable and mints a fresh attempt', () => {
  const envelope = newCommand({ thing: 1 });

  const first = withAttempt(envelope);
  const second = withAttempt(envelope);

  // ADR-API-006: one intent, many attempts. Reusing the envelope is what makes a retry a
  // retry rather than a second command.
  assert.equal(first.envelope.commandId, second.envelope.commandId);
  assert.notEqual(first.transport.requestId, second.transport.requestId);
});

test('a new command is a new intent', () => {
  assert.notEqual(newCommand({}).commandId, newCommand({}).commandId);
});

test('the envelope carries no caller identity fields', () => {
  // GINV-AUTH-003 as a shape assertion: anything the browser could forge must not exist on
  // the envelope at all, so a server cannot be tempted to read it.
  const envelope = ensureAccountReadyCommand('handle');
  const keys = Object.keys(envelope);

  assert.deepEqual(keys.sort(), ['commandId', 'payload']);
  for (const forbidden of ['role', 'isAdmin', 'capabilities', 'userId', 'timestamp']) {
    assert.ok(!keys.includes(forbidden), `envelope must not carry ${forbidden}`);
  }
});

test('every AppError kind maps to a stable outcome category', () => {
  assert.equal(classifyAppError(errorOf(validationError('f', 'bad'))), 'DOMAIN_REJECTION');
  assert.equal(
    classifyAppError(errorOf(authorizationError('admin', 'nope'))),
    'AUTHORIZATION_REJECTION',
  );
  assert.equal(classifyAppError(errorOf(conflictError('r', 'clash'))), 'CONFLICT');
  assert.equal(classifyAppError(errorOf(offlineError('offline'))), 'OFFLINE_UNAVAILABLE');
  assert.equal(classifyAppError(errorOf(technicalError('boom'))), 'TECHNICAL_FAILURE');
  assert.equal(classifyAppError(errorOf(unexpectedError('huh'))), 'TECHNICAL_FAILURE');
});

test('product errors keep their real meaning instead of collapsing to a domain refusal', () => {
  // A permission failure retried forever is a bug; so is treating an availability problem
  // as a permanent domain refusal.
  assert.equal(
    classifyAppError(errorOf(productError('permission_denied', 'x'))),
    'AUTHORIZATION_REJECTION',
  );
  assert.equal(
    classifyAppError(errorOf(productError('not_authenticated', 'x'))),
    'AUTHORIZATION_REJECTION',
  );
  assert.equal(
    classifyAppError(errorOf(productError('cloud_unavailable', 'x'))),
    'OFFLINE_UNAVAILABLE',
  );
  assert.equal(classifyAppError(errorOf(productError('conflict', 'x'))), 'CONFLICT');
  assert.equal(classifyAppError(errorOf(productError('not_found', 'x'))), 'DOMAIN_REJECTION');
});

test('only genuinely uncertain outcomes are retriable with the same command id', () => {
  // GINV-REL-002. A domain or authorization refusal will never succeed on retry, so
  // marking it retriable would spin forever.
  assert.deepEqual([...RETRIABLE_WITH_SAME_COMMAND_ID].sort(), [
    'OFFLINE_UNAVAILABLE',
    'TECHNICAL_FAILURE',
    'UNKNOWN_OUTCOME',
  ]);
  assert.equal(rejection('UNKNOWN_OUTCOME', 'm', 'c1').retriable, true);
  assert.equal(rejection('AUTHORIZATION_REJECTION', 'm', 'c1').retriable, false);
  assert.equal(rejection('DOMAIN_REJECTION', 'm', 'c1').retriable, false);
  assert.equal(rejection('CONFLICT', 'm', 'c1').retriable, false);
});

test('fromAppResult bridges existing use cases without changing them', () => {
  const ok = fromAppResult({ ok: true, value: 42 }, 'cmd-1');
  assert.ok(isAccepted(ok));
  assert.equal(ok.value, 42);
  assert.equal(ok.commandId, 'cmd-1');

  const failed = fromAppResult(conflictError('community', 'taken'), 'cmd-2');
  assert.ok(!isAccepted(failed));
  assert.equal(failed.outcome, 'CONFLICT');
  assert.equal(failed.commandId, 'cmd-2');
});

function stubClient(rpc: (name: string, args: unknown) => unknown) {
  return { rpc: async (name: string, args: unknown) => rpc(name, args) } as never;
}

test('gateway maps SQLSTATEs to stable categories', async () => {
  const cases: Array<[string, string]> = [
    ['42501', 'AUTHORIZATION_REJECTION'],
    ['23505', 'CONFLICT'],
    ['40001', 'CONFLICT'],
    ['23514', 'DOMAIN_REJECTION'],
    ['P0001', 'DOMAIN_REJECTION'],
    ['XX000', 'TECHNICAL_FAILURE'],
  ];

  for (const [code, expected] of cases) {
    const gateway = createSupabaseCommandGateway(
      stubClient(() => ({ data: null, error: { code, message: `sqlstate ${code}` } })),
    );
    const result = await gateway.execute(
      COMMAND_OPERATIONS.ensureAccountReady,
      withAttempt(newCommand({})),
    );
    assert.equal(result.outcome, expected, `${code} should map to ${expected}`);
  }
});

test('gateway reports a lost response as UNKNOWN_OUTCOME, never as failure', async () => {
  // The command may have committed. Calling this a failure invites a duplicate effect.
  const thrown = createSupabaseCommandGateway(
    stubClient(() => {
      throw new Error('socket hang up');
    }),
  );
  const envelope = newCommand({});
  const result = await thrown.execute(COMMAND_OPERATIONS.ensureAccountReady, withAttempt(envelope));

  assert.equal(result.outcome, 'UNKNOWN_OUTCOME');
  assert.equal(result.commandId, envelope.commandId);
  assert.ok(!isAccepted(result) && result.retriable, 'unknown outcome must be retriable');
});

test('gateway treats a codeless transport error as unknown, not technical', async () => {
  const gateway = createSupabaseCommandGateway(
    stubClient(() => ({ data: null, error: { message: 'network error' } })),
  );
  const result = await gateway.execute(
    COMMAND_OPERATIONS.ensureAccountReady,
    withAttempt(newCommand({})),
  );

  assert.equal(result.outcome, 'UNKNOWN_OUTCOME');
});
