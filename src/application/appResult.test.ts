import test from 'node:test';
import assert from 'node:assert/strict';
import {
  appOk,
  productError,
  recoverableIssue,
  technicalError,
  isAppOk,
  validationError,
  authorizationError,
  conflictError,
  offlineError,
  unexpectedError,
  type AppError,
  type AppResult,
} from './appResult';

test('appOk carries a value and optional recoverable issues', () => {
  const issue = recoverableIssue('cloud_unavailable', 'Cloud write failed.');
  const result = appOk({ saved: true }, [issue]);

  assert.equal(isAppOk(result), true);
  assert.deepEqual(result.value, { saved: true });
  assert.equal(result.issues?.[0].code, 'cloud_unavailable');
  assert.equal(result.issues?.[0].recoverable, true);
});

test('productError creates a non-technical failure for user-action problems', () => {
  const result = productError('permission_denied', 'Acao nao autorizada.');

  assert.equal(result.ok, false);
  assert.equal(result.error.kind, 'product');
  assert.equal(result.error.code, 'permission_denied');
  assert.equal(result.error.recoverable, false);
});

test('technicalError preserves cause without exposing it as product state', () => {
  const cause = new Error('RLS denied');
  const result = technicalError('Nao foi possivel falar com a nuvem.', cause);

  assert.equal(result.ok, false);
  assert.equal(result.error.kind, 'technical');
  assert.equal(result.error.recoverable, true);
  assert.equal(result.error.cause, cause);
});

test('validationError produces AppError kind=validation', () => {
  const r = validationError('email', 'must be non-empty');
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.error.kind, 'validation');
    assert.equal((r.error as any).field, 'email');
  }
});

test('authorizationError produces AppError kind=authorization with required aal2', () => {
  const r = authorizationError('aal2', 'MFA required');
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.error.kind, 'authorization');
    assert.equal((r.error as any).required, 'aal2');
  }
});

test('conflictError, offlineError, unexpectedError produce matching kinds', () => {
  assert.equal((conflictError('username', 'taken') as any).error.kind, 'conflict');
  assert.equal((offlineError('offline') as any).error.kind, 'offline_unavailable');
  assert.equal((unexpectedError('boom') as any).error.kind, 'unexpected');
  assert.match((unexpectedError('boom') as any).error.correlationId, /^[0-9a-f-]{36}$/i);
});

test('appOk and productError still work unchanged', () => {
  const ok = appOk(42);
  assert.equal(ok.ok, true);
  if (ok.ok) assert.equal(ok.value, 42);
  const p = productError('not_found', 'missing');
  assert.equal(p.ok, false);
});

test('AppError union is exhaustively kind-discriminated', () => {
  const errors: AppError[] = [
    validationError('a', 'b').error as any,
    authorizationError('aal2', 'b').error as any,
    conflictError('r', 'b').error as any,
    offlineError('b').error as any,
    technicalError('b').error as any,
    unexpectedError('b').error as any,
  ];
  const kinds = errors.map((e) => e.kind);
  const expected = [
    'validation',
    'authorization',
    'conflict',
    'offline_unavailable',
    'technical',
    'unexpected',
  ];
  assert.deepEqual(kinds.sort(), expected.sort());
});
