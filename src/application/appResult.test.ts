import test from 'node:test';
import assert from 'node:assert/strict';
import { appOk, productError, recoverableIssue, technicalError, isAppOk } from './appResult';

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
