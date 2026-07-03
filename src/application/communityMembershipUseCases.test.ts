import test from 'node:test';
import assert from 'node:assert/strict';
import type { CommunityMember } from '../types';
import {
  approveCommunityJoinRequestCommand,
  changeCommunityMemberRoleCommand,
  disableCommunityJoinCodeCommand,
  fetchCommunityMembersQuery,
  generateCommunityJoinCodeCommand,
  inviteCommunityMemberCommand,
  leaveCommunityCommand,
  rejectCommunityJoinRequestCommand,
  removeCommunityMemberCommand,
  requestCommunityJoinByCodeCommand,
  requestPublicCommunityJoinCommand,
  searchPublicCommunitiesQuery,
  type CommunityDiscoveryGateway,
  type CommunityMembershipGateway,
} from './communityMembershipUseCases';

function member(overrides: Partial<CommunityMember> = {}): CommunityMember {
  return {
    id: overrides.id ?? 'member-1',
    communityId: overrides.communityId ?? 'community-local',
    userId: overrides.userId ?? 'user-1',
    role: overrides.role ?? 'member',
    status: overrides.status ?? 'active',
    name: overrides.name ?? null,
    email: overrides.email ?? null,
    invitedBy: overrides.invitedBy ?? null,
    createdAt: overrides.createdAt ?? '2026-01-01T00:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-01-01T00:00:00.000Z',
  };
}

function membershipGateway(calls: string[]): CommunityMembershipGateway {
  return {
    async fetchByCommunity(communityCloudId, communityLocalId) {
      calls.push(`fetch:${communityCloudId}:${communityLocalId ?? ''}`);
      return [member({ id: 'member-fetched' })];
    },
    async addMemberByEmail(communityCloudId, email, role, communityLocalId) {
      calls.push(`invite:${communityCloudId}:${email}:${role}:${communityLocalId ?? ''}`);
      return member({ id: 'member-invited', email, role });
    },
    async updateRole(memberId, role) {
      calls.push(`role:${memberId}:${role}`);
      return member({ id: memberId, role });
    },
    async removeMember(memberId) {
      calls.push(`remove:${memberId}`);
    },
    async approveRequest(memberId) {
      calls.push(`approve:${memberId}`);
    },
    async rejectRequest(memberId) {
      calls.push(`reject:${memberId}`);
    },
    async generateJoinCode(communityCloudId) {
      calls.push(`generate:${communityCloudId}`);
      return 'ABCD1234';
    },
    async disableJoinCode(communityCloudId) {
      calls.push(`disable:${communityCloudId}`);
    },
    async leaveCommunity(communityCloudId) {
      calls.push(`leave:${communityCloudId}`);
    },
    async findByCode(code) {
      calls.push(`find:${code}`);
      return {
        id: 'community-cloud',
        name: 'Terca Forte',
        description: null,
        memberCount: 12,
        myStatus: null,
      };
    },
    async requestToJoin(code, communityLocalId) {
      calls.push(`join-code:${code}:${communityLocalId ?? ''}`);
      return member({ id: 'member-pending', status: 'pending' });
    },
  };
}

function discoveryGateway(calls: string[]): CommunityDiscoveryGateway {
  return {
    async searchPublic(query) {
      calls.push(`search:${query}`);
      return [
        {
          id: 'community-cloud',
          name: 'Terca Forte',
          description: null,
          memberCount: 12,
          myStatus: null,
        },
      ];
    },
    async requestToJoinPublic(communityCloudId) {
      calls.push(`join-public:${communityCloudId}`);
    },
  };
}

test('fetchCommunityMembersQuery returns members from gateway and calls fetch with cloud/local ids', async () => {
  const calls: string[] = [];
  const result = await fetchCommunityMembersQuery(
    { communityCloudId: 'community-cloud', communityLocalId: 'community-local' },
    membershipGateway(calls),
  );

  assert.equal(result.ok, true);
  assert.equal(result.value.members[0].id, 'member-fetched');
  assert.deepEqual(calls, ['fetch:community-cloud:community-local']);
});

test('fetchCommunityMembersQuery returns empty members and recoverable cloud issue when fetch throws', async () => {
  const gateway = membershipGateway([]);
  gateway.fetchByCommunity = async () => {
    throw new Error('offline');
  };

  const result = await fetchCommunityMembersQuery({ communityCloudId: 'community-cloud' }, gateway);

  assert.equal(result.ok, true);
  assert.deepEqual(result.value.members, []);
  assert.equal(result.issues?.[0].code, 'cloud_unavailable');
  assert.equal(result.issues?.[0].recoverable, true);
});

test('inviteCommunityMemberCommand normalizes email and calls gateway', async () => {
  const calls: string[] = [];
  const result = await inviteCommunityMemberCommand(
    {
      communityCloudId: 'community-cloud',
      communityLocalId: 'community-local',
      email: '  ANA@EXAMPLE.COM ',
      role: 'moderator',
    },
    membershipGateway(calls),
  );

  assert.equal(result.ok, true);
  assert.equal(result.value.member.email, 'ana@example.com');
  assert.deepEqual(calls, ['invite:community-cloud:ana@example.com:moderator:community-local']);
});

test('inviteCommunityMemberCommand rejects empty email and owner role', async () => {
  const calls: string[] = [];
  const gateway = membershipGateway(calls);

  const emptyEmail = await inviteCommunityMemberCommand(
    { communityCloudId: 'community-cloud', email: ' ', role: 'member' },
    gateway,
  );
  const ownerRole = await inviteCommunityMemberCommand(
    { communityCloudId: 'community-cloud', email: 'ana@example.com', role: 'owner' },
    gateway,
  );

  assert.equal(emptyEmail.ok, false);
  assert.equal(emptyEmail.error.code, 'invalid_input');
  assert.equal(ownerRole.ok, false);
  assert.equal(ownerRole.error.code, 'permission_denied');
  assert.deepEqual(calls, []);
});

test('changeCommunityMemberRoleCommand blocks owner target, self target, and assigning owner role', async () => {
  const calls: string[] = [];
  const gateway = membershipGateway(calls);
  const members = [
    member({ id: 'owner-member', userId: 'owner-user', role: 'owner' }),
    member({ id: 'self-member', userId: 'self-user', role: 'admin' }),
    member({ id: 'target-member', userId: 'target-user', role: 'member' }),
  ];

  const ownerTarget = await changeCommunityMemberRoleCommand(
    { members, currentUserId: 'self-user', memberId: 'owner-member', role: 'member' },
    gateway,
  );
  const selfTarget = await changeCommunityMemberRoleCommand(
    { members, currentUserId: 'self-user', memberId: 'self-member', role: 'member' },
    gateway,
  );
  const assignOwner = await changeCommunityMemberRoleCommand(
    { members, currentUserId: 'self-user', memberId: 'target-member', role: 'owner' },
    gateway,
  );

  assert.equal(ownerTarget.ok, false);
  assert.equal(ownerTarget.error.code, 'permission_denied');
  assert.equal(selfTarget.ok, false);
  assert.equal(selfTarget.error.code, 'permission_denied');
  assert.equal(assignOwner.ok, false);
  assert.equal(assignOwner.error.code, 'permission_denied');
  assert.deepEqual(calls, []);
});

test('changeCommunityMemberRoleCommand calls gateway for editable member', async () => {
  const calls: string[] = [];
  const result = await changeCommunityMemberRoleCommand(
    {
      members: [member({ id: 'target-member', userId: 'target-user', role: 'member' })],
      currentUserId: 'self-user',
      memberId: 'target-member',
      role: 'admin',
    },
    membershipGateway(calls),
  );

  assert.equal(result.ok, true);
  assert.equal(result.value.member.role, 'admin');
  assert.deepEqual(calls, ['role:target-member:admin']);
});

test('removeCommunityMemberCommand blocks owner and self', async () => {
  const calls: string[] = [];
  const gateway = membershipGateway(calls);
  const members = [
    member({ id: 'owner-member', userId: 'owner-user', role: 'owner' }),
    member({ id: 'self-member', userId: 'self-user', role: 'admin' }),
  ];

  const ownerTarget = await removeCommunityMemberCommand(
    { members, currentUserId: 'self-user', memberId: 'owner-member' },
    gateway,
  );
  const selfTarget = await removeCommunityMemberCommand(
    { members, currentUserId: 'self-user', memberId: 'self-member' },
    gateway,
  );

  assert.equal(ownerTarget.ok, false);
  assert.equal(ownerTarget.error.code, 'permission_denied');
  assert.equal(selfTarget.ok, false);
  assert.equal(selfTarget.error.code, 'permission_denied');
  assert.deepEqual(calls, []);
});

test('approveCommunityJoinRequestCommand and rejectCommunityJoinRequestCommand call gateway', async () => {
  const calls: string[] = [];
  const gateway = membershipGateway(calls);

  const approved = await approveCommunityJoinRequestCommand({ memberId: 'member-pending' }, gateway);
  const rejected = await rejectCommunityJoinRequestCommand({ memberId: 'member-rejected' }, gateway);

  assert.equal(approved.ok, true);
  assert.equal(approved.value.memberId, 'member-pending');
  assert.equal(rejected.ok, true);
  assert.equal(rejected.value.memberId, 'member-rejected');
  assert.deepEqual(calls, ['approve:member-pending', 'reject:member-rejected']);
});

test('generateCommunityJoinCodeCommand requires cloud id, generate and disable call gateway', async () => {
  const calls: string[] = [];
  const gateway = membershipGateway(calls);

  const missing = await generateCommunityJoinCodeCommand({}, gateway);
  const generated = await generateCommunityJoinCodeCommand(
    { communityCloudId: 'community-cloud' },
    gateway,
  );
  const disabled = await disableCommunityJoinCodeCommand(
    { communityCloudId: 'community-cloud' },
    gateway,
  );

  assert.equal(missing.ok, false);
  assert.equal(missing.error.code, 'cloud_unavailable');
  assert.equal(generated.ok, true);
  assert.equal(generated.value.joinCode, 'ABCD1234');
  assert.equal(disabled.ok, true);
  assert.deepEqual(calls, ['generate:community-cloud', 'disable:community-cloud']);
});

test('leaveCommunityCommand blocks owner and calls gateway for non-owner', async () => {
  const calls: string[] = [];
  const gateway = membershipGateway(calls);

  const owner = await leaveCommunityCommand(
    { communityCloudId: 'community-cloud', currentMember: member({ role: 'owner' }) },
    gateway,
  );
  const left = await leaveCommunityCommand(
    { communityCloudId: 'community-cloud', currentMember: member({ role: 'member' }) },
    gateway,
  );

  assert.equal(owner.ok, false);
  assert.equal(owner.error.code, 'permission_denied');
  assert.equal(left.ok, true);
  assert.deepEqual(calls, ['leave:community-cloud']);
});

test('searchPublicCommunitiesQuery and requestPublicCommunityJoinCommand call discovery gateway', async () => {
  const calls: string[] = [];
  const gateway = discoveryGateway(calls);

  const searched = await searchPublicCommunitiesQuery({ query: '  terca  ' }, gateway);
  const requested = await requestPublicCommunityJoinCommand(
    { communityCloudId: 'community-cloud' },
    gateway,
  );

  assert.equal(searched.ok, true);
  assert.equal(searched.value.communities[0].id, 'community-cloud');
  assert.equal(requested.ok, true);
  assert.deepEqual(calls, ['search:terca', 'join-public:community-cloud']);
});

test('requestCommunityJoinByCodeCommand normalizes code trim/uppercase and calls gateway', async () => {
  const calls: string[] = [];
  const result = await requestCommunityJoinByCodeCommand(
    { code: ' abcd1234 ', communityLocalId: 'community-local' },
    membershipGateway(calls),
  );

  assert.equal(result.ok, true);
  assert.equal(result.value.member.id, 'member-pending');
  assert.deepEqual(calls, ['join-code:ABCD1234:community-local']);
});
