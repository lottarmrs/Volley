import test from 'node:test';
import assert from 'node:assert/strict';
import { formatLocalDateInput } from './date';

test('formatLocalDateInput uses the local calendar day for date inputs', () => {
  const localLateNight = new Date(2026, 5, 28, 22, 57, 25);

  assert.equal(formatLocalDateInput(localLateNight), '2026-06-28');
});

test('formatLocalDateInput zero-pads month and day', () => {
  const localMorning = new Date(2026, 0, 5, 8, 0, 0);

  assert.equal(formatLocalDateInput(localMorning), '2026-01-05');
});
