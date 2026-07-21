import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import type { AppResult } from '@app/appResult';
import type { Session } from '@shared/types';

test('architecture aliases resolve through TypeScript', () => {
  const result: AppResult<Session | null> = { ok: true, value: null, issues: [] };

  assert.equal(result.ok, true);
});

test('common UI components live under the ui boundary', () => {
  assert.equal(existsSync('src/ui/common/ToastViewport.tsx'), true);
  assert.equal(existsSync('src/components/common/ToastViewport.tsx'), false);
});
