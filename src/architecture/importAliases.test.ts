import test from 'node:test';
import assert from 'node:assert/strict';
import type { AppResult } from '@app/appResult';
import type { Session } from '@shared/types';

test('architecture aliases resolve through TypeScript', () => {
  const result: AppResult<Session | null> = { ok: true, value: null, issues: [] };

  assert.equal(result.ok, true);
});
