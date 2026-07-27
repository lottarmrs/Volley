import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveCommunityPermissions } from './communityPermissions';
import type { Community, CommunityMember } from '../types';

const community: Pick<Community, 'id' | 'cloudId'> = {
  id: 'community-local',
  cloudId: 'community-cloud',
};

function member(overrides: Partial<CommunityMember>): CommunityMember {
  return {
    id: 'member-id',
    communityId: 'community-local',
    userId: 'user-1',
    role: 'member',
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function assertWritePermissions(
  permissions: ReturnType<typeof deriveCommunityPermissions>,
  expected: {
    read: boolean;
    delete: boolean;
    clear: boolean;
    manage: boolean;
    approve?: boolean;
    rules: boolean;
    profile: boolean;
    evaluate: boolean;
    create: boolean;
  },
) {
  assert.equal(permissions.canReadCommunity, expected.read);
  assert.equal(permissions.canDeleteCommunity, expected.delete);
  assert.equal(permissions.canClearHistory, expected.clear);
  assert.equal(permissions.canManageMembers, expected.manage);
  if (expected.approve !== undefined) {
    assert.equal(permissions.canApproveMembers, expected.approve);
  }
  assert.equal(permissions.canEditRules, expected.rules);
  assert.equal(permissions.canEditPlayerProfile, expected.profile);
  assert.equal(permissions.canEvaluatePlayer, expected.evaluate);
  assert.equal(permissions.canCreateSession, expected.create);
}

test('offline or anonymous local-first mode grants owner permissions', () => {
  const permissions = deriveCommunityPermissions({
    isSupabaseConfigured: false,
    userId: null,
    globalRole: null,
    community,
    members: [],
  });

  assert.equal(permissions.role, 'owner');
  assert.equal(permissions.isSupabaseConfigured, false);
  assertWritePermissions(permissions, {
    read: true,
    delete: true,
    clear: true,
    manage: true,
    rules: true,
    profile: true,
    evaluate: true,
    create: true,
  });
});

test('master has write access regardless of membership', () => {
  const permissions = deriveCommunityPermissions({
    isSupabaseConfigured: true,
    userId: 'master-user',
    globalRole: 'master',
    community,
    members: [],
  });

  assert.equal(permissions.isGlobalAdmin, true);
  assert.equal(permissions.role, 'admin');
  assertWritePermissions(permissions, {
    read: true,
    delete: true,
    clear: true,
    manage: true,
    rules: true,
    profile: true,
    evaluate: true,
    create: true,
  });
});

test('programmer is read-only support in product permissions', () => {
  const permissions = deriveCommunityPermissions({
    isSupabaseConfigured: true,
    userId: 'support-user',
    globalRole: 'programmer',
    community,
    members: [member({ userId: 'support-user', role: 'owner' })],
  });

  assert.equal(permissions.role, null);
  assertWritePermissions(permissions, {
    read: true,
    delete: false,
    clear: false,
    manage: false,
    rules: false,
    profile: false,
    evaluate: false,
    create: false,
  });
});

test('pending memberships do not grant write permissions', () => {
  const permissions = deriveCommunityPermissions({
    isSupabaseConfigured: true,
    userId: 'user-1',
    globalRole: 'user',
    community,
    members: [member({ status: 'pending', role: 'admin' })],
  });

  assert.equal(permissions.role, null);
  assertWritePermissions(permissions, {
    read: false,
    delete: false,
    clear: false,
    manage: false,
    rules: false,
    profile: false,
    evaluate: false,
    create: false,
  });
});

test('active owner admin moderator and member roles map to product permissions', () => {
  const owner = deriveCommunityPermissions({
    isSupabaseConfigured: true,
    userId: 'user-1',
    globalRole: 'user',
    community,
    members: [member({ role: 'owner' })],
  });
  const admin = deriveCommunityPermissions({
    isSupabaseConfigured: true,
    userId: 'user-1',
    globalRole: 'user',
    community,
    members: [member({ role: 'admin' })],
  });
  const moderator = deriveCommunityPermissions({
    isSupabaseConfigured: true,
    userId: 'user-1',
    globalRole: 'user',
    community,
    members: [member({ role: 'moderator' })],
  });
  const regularMember = deriveCommunityPermissions({
    isSupabaseConfigured: true,
    userId: 'user-1',
    globalRole: 'user',
    community,
    members: [member({ role: 'member' })],
  });

  assertWritePermissions(owner, {
    read: true,
    delete: true,
    clear: true,
    manage: true,
    rules: true,
    profile: true,
    evaluate: true,
    create: true,
  });
  assertWritePermissions(admin, {
    read: true,
    delete: false,
    clear: false,
    manage: true,
    rules: true,
    profile: true,
    evaluate: true,
    create: true,
  });
  assertWritePermissions(moderator, {
    read: true,
    delete: false,
    clear: false,
    manage: false,
    approve: true,
    rules: false,
    profile: false,
    // A RLS de player_evaluations so aceita owner/admin, entao moderator nao avalia.
    evaluate: false,
    create: true,
  });
  assertWritePermissions(regularMember, {
    read: true,
    delete: false,
    clear: false,
    manage: false,
    approve: false,
    rules: false,
    profile: false,
    evaluate: false,
    create: false,
  });
});

test('organizador can create sessions but has no other management permissions', () => {
  const organizador = deriveCommunityPermissions({
    isSupabaseConfigured: true,
    userId: 'user-1',
    globalRole: 'user',
    community,
    members: [member({ role: 'organizador' })],
  });

  assertWritePermissions(organizador, {
    read: true,
    delete: false,
    clear: false,
    manage: false,
    approve: false,
    rules: false,
    profile: false,
    evaluate: false,
    create: true,
  });
});

test('memberships without status are treated as active legacy rows', () => {
  const permissions = deriveCommunityPermissions({
    isSupabaseConfigured: true,
    userId: 'user-1',
    globalRole: 'user',
    community,
    members: [member({ role: 'moderator', status: undefined })],
  });

  assert.equal(permissions.role, 'moderator');
  assert.equal(permissions.canCreateSession, true);
});
