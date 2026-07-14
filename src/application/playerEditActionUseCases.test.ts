import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getPlayerEditActionErrorMessage,
  PLAYER_PERMISSION_DENIED_MESSAGE,
} from './playerEditActionUseCases';

test('getPlayerEditActionErrorMessage maps permission denied errors to user-facing copy', () => {
  const message = getPlayerEditActionErrorMessage(new Error('PERMISSION_DENIED'));

  assert.equal(message, PLAYER_PERMISSION_DENIED_MESSAGE);
});

test('getPlayerEditActionErrorMessage ignores unrelated errors', () => {
  const message = getPlayerEditActionErrorMessage(new Error('offline'));

  assert.equal(message, null);
});
