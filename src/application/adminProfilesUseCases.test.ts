import test from 'node:test';
import assert from 'node:assert/strict';
import { changeUserRoleCommand, listAdminProfilesQuery } from './adminProfilesUseCases';
import type { AuthRole, UserProfile } from '../types';

const profile = (input: Partial<UserProfile> = {}): UserProfile => ({
  id: 'user-1',
  email: 'ana@example.com',
  name: 'Ana',
  role: 'user',
  createdAt: '2026-07-17T00:00:00.000Z',
  updatedAt: '2026-07-17T00:00:00.000Z',
  ...input,
});

test('listAdminProfilesQuery returns profiles from the gateway', async () => {
  const result = await listAdminProfilesQuery({
    listProfiles: async () => [profile()],
    setRole: async () => profile(),
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.profiles[0].email, 'ana@example.com');
});

test('listAdminProfilesQuery maps gateway failures to technical errors', async () => {
  const cause = new Error('RLS denied');
  const result = await listAdminProfilesQuery({
    listProfiles: async () => {
      throw cause;
    },
    setRole: async () => profile(),
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error.kind, 'technical');
  assert.equal(result.error.cause, cause);
});

test('changeUserRoleCommand updates a user role through the gateway', async () => {
  const calls: Array<{ userId: string; role: AuthRole }> = [];
  const result = await changeUserRoleCommand(
    { userId: 'user-1', role: 'master' },
    {
      listProfiles: async () => [],
      setRole: async (userId, role) => {
        calls.push({ userId, role });
        return profile({ id: userId, role });
      },
    },
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(calls, [{ userId: 'user-1', role: 'master' }]);
  assert.equal(result.value.profile.role, 'master');
});

test('changeUserRoleCommand rejects missing user ids', async () => {
  const result = await changeUserRoleCommand(
    { userId: ' ', role: 'user' },
    {
      listProfiles: async () => [],
      setRole: async () => assert.fail('invalid input should not call gateway'),
    },
  );

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error.code, 'invalid_input');
});
