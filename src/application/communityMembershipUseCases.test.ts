import test from 'node:test';
import assert from 'node:assert/strict';
import type { AuthRole, CommunityMember } from '../types';
import type { AppResult } from './appResult';
import {
  approveCommunityJoinRequestCommand,
  changeCommunityMemberRoleCommand,
  disableCommunityJoinCodeCommand,
  fetchCommunityMembersQuery,
  generateCommunityJoinCodeCommand,
  inviteCommunityMemberCommand,
  leaveCommunityCommand,
  previewCommunityJoinByCodeQuery,
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
    async addMemberByIdentifier(communityCloudId, email, role, communityLocalId) {
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

function assertProductError(result: AppResult<unknown>, code: string): void {
  assert.equal(result.ok, false);
  if (result.ok) assert.fail('Expected product error result.');
  assert.equal(result.error.kind, 'product');
  assert.equal(result.error.code, code);
}

function assertTechnicalError(result: AppResult<unknown>): void {
  assert.equal(result.ok, false);
  if (result.ok) assert.fail('Expected technical error result.');
  assert.equal(result.error.kind, 'technical');
  assert.equal(result.error.code, 'technical_error');
}

function manageableMembers(current: Partial<CommunityMember> = {}): CommunityMember[] {
  return [
    member({
      id: 'manager-member',
      userId: 'manager-user',
      role: 'admin',
      status: 'active',
      ...current,
    }),
    member({ id: 'target-member', userId: 'target-user', role: 'member' }),
    member({ id: 'pending-member', userId: 'pending-user', role: 'member', status: 'pending' }),
  ];
}

const managerCommandCases: {
  name: string;
  expectedCall: string;
  run: (
    members: CommunityMember[],
    currentUserId: string | null,
    calls: string[],
    globalRole?: AuthRole | null,
  ) => Promise<AppResult<unknown>>;
}[] = [
  {
    name: 'change role',
    expectedCall: 'role:target-member:admin',
    run: (members, currentUserId, calls, globalRole) =>
      changeCommunityMemberRoleCommand(
        { members, currentUserId, globalRole, memberId: 'target-member', role: 'admin' },
        membershipGateway(calls),
      ),
  },
  {
    name: 'remove member',
    expectedCall: 'remove:target-member',
    run: (members, currentUserId, calls, globalRole) =>
      removeCommunityMemberCommand(
        { members, currentUserId, globalRole, memberId: 'target-member' },
        membershipGateway(calls),
      ),
  },
  {
    name: 'generate join code',
    expectedCall: 'generate:community-cloud',
    run: (members, currentUserId, calls, globalRole) =>
      generateCommunityJoinCodeCommand(
        { communityCloudId: 'community-cloud', members, currentUserId, globalRole },
        membershipGateway(calls),
      ),
  },
  {
    name: 'disable join code',
    expectedCall: 'disable:community-cloud',
    run: (members, currentUserId, calls, globalRole) =>
      disableCommunityJoinCodeCommand(
        { communityCloudId: 'community-cloud', members, currentUserId, globalRole },
        membershipGateway(calls),
      ),
  },
];

const approverCommandCases: {
  name: string;
  expectedCall: string;
  run: (
    members: CommunityMember[],
    currentUserId: string | null,
    calls: string[],
    globalRole?: AuthRole | null,
  ) => Promise<AppResult<unknown>>;
}[] = [
  {
    name: 'approve request',
    expectedCall: 'approve:pending-member',
    run: (members, currentUserId, calls, globalRole) =>
      approveCommunityJoinRequestCommand(
        { members, currentUserId, globalRole, memberId: 'pending-member' },
        membershipGateway(calls),
      ),
  },
  {
    name: 'reject request',
    expectedCall: 'reject:pending-member',
    run: (members, currentUserId, calls, globalRole) =>
      rejectCommunityJoinRequestCommand(
        { members, currentUserId, globalRole, memberId: 'pending-member' },
        membershipGateway(calls),
      ),
  },
];

test('manager-only commands do not call gateways when current user cannot manage', async () => {
  const scenarios: {
    name: string;
    members: CommunityMember[];
    currentUserId: string | null;
    code: string;
  }[] = [
    {
      name: 'no current user',
      members: manageableMembers(),
      currentUserId: null,
      code: 'not_authenticated',
    },
    {
      name: 'no matching member',
      members: manageableMembers(),
      currentUserId: 'missing-user',
      code: 'not_found',
    },
    {
      name: 'pending current member',
      members: manageableMembers({ status: 'pending' }),
      currentUserId: 'manager-user',
      code: 'permission_denied',
    },
    {
      name: 'regular current member',
      members: manageableMembers({ role: 'member' }),
      currentUserId: 'manager-user',
      code: 'permission_denied',
    },
    {
      name: 'moderator current member',
      members: manageableMembers({ role: 'moderator' }),
      currentUserId: 'manager-user',
      code: 'permission_denied',
    },
    {
      name: 'organizador current member',
      members: manageableMembers({ role: 'organizador' }),
      currentUserId: 'manager-user',
      code: 'permission_denied',
    },
  ];

  for (const command of managerCommandCases) {
    for (const scenario of scenarios) {
      const calls: string[] = [];
      const result = await command.run(scenario.members, scenario.currentUserId, calls);

      assertProductError(result, scenario.code);
      assert.deepEqual(calls, [], `${command.name} called gateway for ${scenario.name}`);
    }
  }
});

test('manager-only commands call gateways for active owner and admin', async () => {
  for (const role of ['owner', 'admin'] as const) {
    for (const command of managerCommandCases) {
      const calls: string[] = [];
      const result = await command.run(manageableMembers({ role }), 'manager-user', calls);

      assert.equal(result.ok, true, `${command.name} rejected active ${role}`);
      assert.deepEqual(calls, [command.expectedCall]);
    }
  }
});

test('manager-only commands allow signed-in master without community membership', async () => {
  for (const command of managerCommandCases) {
    const calls: string[] = [];
    const result = await command.run(
      manageableMembers().filter((candidate) => candidate.userId !== 'master-user'),
      'master-user',
      calls,
      'master',
    );

    assert.equal(result.ok, true, `${command.name} rejected signed-in master`);
    assert.deepEqual(calls, [command.expectedCall]);
  }
});

test('manager-only commands do not let programmer bypass manager checks', async () => {
  for (const command of managerCommandCases) {
    const calls: string[] = [];
    const result = await command.run(
      manageableMembers({ role: 'owner' }),
      'manager-user',
      calls,
      'programmer',
    );

    assertProductError(result, 'permission_denied');
    assert.deepEqual(calls, [], `${command.name} called gateway for programmer`);
  }
});

test('manager-only commands require an authenticated user before global role bypass', async () => {
  for (const command of managerCommandCases) {
    const calls: string[] = [];
    const result = await command.run(manageableMembers(), null, calls, 'master');

    assertProductError(result, 'not_authenticated');
    assert.deepEqual(calls, [], `${command.name} called gateway without current user`);
  }
});

test('approver-only commands do not call gateways when current user cannot approve', async () => {
  const scenarios: {
    name: string;
    members: CommunityMember[];
    currentUserId: string | null;
    code: string;
  }[] = [
    {
      name: 'no current user',
      members: manageableMembers(),
      currentUserId: null,
      code: 'not_authenticated',
    },
    {
      name: 'no matching member',
      members: manageableMembers(),
      currentUserId: 'missing-user',
      code: 'not_found',
    },
    {
      name: 'pending current member',
      members: manageableMembers({ status: 'pending' }),
      currentUserId: 'manager-user',
      code: 'permission_denied',
    },
    {
      name: 'regular current member',
      members: manageableMembers({ role: 'member' }),
      currentUserId: 'manager-user',
      code: 'permission_denied',
    },
    {
      name: 'organizador current member',
      members: manageableMembers({ role: 'organizador' }),
      currentUserId: 'manager-user',
      code: 'permission_denied',
    },
  ];

  for (const command of approverCommandCases) {
    for (const scenario of scenarios) {
      const calls: string[] = [];
      const result = await command.run(scenario.members, scenario.currentUserId, calls);

      assertProductError(result, scenario.code);
      assert.deepEqual(calls, [], `${command.name} called gateway for ${scenario.name}`);
    }
  }
});

test('approver-only commands call gateways for active owner admin and moderator', async () => {
  for (const role of ['owner', 'admin', 'moderator'] as const) {
    for (const command of approverCommandCases) {
      const calls: string[] = [];
      const result = await command.run(manageableMembers({ role }), 'manager-user', calls);

      assert.equal(result.ok, true, `${command.name} rejected active ${role}`);
      assert.deepEqual(calls, [command.expectedCall]);
    }
  }
});

test('approver-only commands allow signed-in master without community membership', async () => {
  for (const command of approverCommandCases) {
    const calls: string[] = [];
    const result = await command.run(
      manageableMembers().filter((candidate) => candidate.userId !== 'master-user'),
      'master-user',
      calls,
      'master',
    );

    assert.equal(result.ok, true, `${command.name} rejected signed-in master`);
    assert.deepEqual(calls, [command.expectedCall]);
  }
});

test('approver-only commands do not let programmer bypass approver checks', async () => {
  for (const command of approverCommandCases) {
    const calls: string[] = [];
    const result = await command.run(
      manageableMembers({ role: 'admin' }),
      'manager-user',
      calls,
      'programmer',
    );

    assertProductError(result, 'permission_denied');
    assert.deepEqual(calls, [], `${command.name} called gateway for programmer`);
  }
});

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

test('fetchCommunityMembersQuery rejects missing cloud id', async () => {
  const calls: string[] = [];
  const result = await fetchCommunityMembersQuery({}, membershipGateway(calls));

  assertProductError(result, 'cloud_unavailable');
  assert.deepEqual(calls, []);
});

test('fetchCommunityMembersQuery trims cloud id before calling gateway', async () => {
  const calls: string[] = [];
  const result = await fetchCommunityMembersQuery(
    { communityCloudId: '  community-cloud  ', communityLocalId: 'community-local' },
    membershipGateway(calls),
  );

  assert.equal(result.ok, true);
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
      members: manageableMembers(),
      currentUserId: 'manager-user',
      identifier: '  ANA@EXAMPLE.COM ',
      role: 'moderator',
    },
    membershipGateway(calls),
  );

  assert.equal(result.ok, true);
  assert.equal(result.value.member.email, 'ana@example.com');
  assert.deepEqual(calls, ['invite:community-cloud:ana@example.com:moderator:community-local']);
});

test('inviteCommunityMemberCommand authorizes active owner admin and signed-in master only', async () => {
  const allowed: Array<{
    name: string;
    members: CommunityMember[];
    currentUserId: string;
    globalRole?: AuthRole | null;
  }> = [
    {
      name: 'owner',
      members: manageableMembers({ role: 'owner' }),
      currentUserId: 'manager-user',
    },
    {
      name: 'admin',
      members: manageableMembers({ role: 'admin' }),
      currentUserId: 'manager-user',
    },
    {
      name: 'master',
      members: manageableMembers().filter((candidate) => candidate.userId !== 'master-user'),
      currentUserId: 'master-user',
      globalRole: 'master',
    },
  ];

  for (const scenario of allowed) {
    const calls: string[] = [];
    const result = await inviteCommunityMemberCommand(
      {
        communityCloudId: 'community-cloud',
        communityLocalId: 'community-local',
        members: scenario.members,
        currentUserId: scenario.currentUserId,
        globalRole: scenario.globalRole,
        identifier: `${scenario.name}@example.com`,
        role: 'member',
      },
      membershipGateway(calls),
    );

    assert.equal(result.ok, true, `invite rejected ${scenario.name}`);
    assert.deepEqual(calls, [
      `invite:community-cloud:${scenario.name}@example.com:member:community-local`,
    ]);
  }

  const denied: Array<{
    name: string;
    members: CommunityMember[];
    currentUserId: string | null;
    globalRole?: AuthRole | null;
    code: string;
  }> = [
    {
      name: 'no current user with master role',
      members: manageableMembers(),
      currentUserId: null,
      globalRole: 'master',
      code: 'not_authenticated',
    },
    {
      name: 'regular member',
      members: manageableMembers({ role: 'member' }),
      currentUserId: 'manager-user',
      code: 'permission_denied',
    },
    {
      name: 'programmer owner membership',
      members: manageableMembers({ role: 'owner' }),
      currentUserId: 'manager-user',
      globalRole: 'programmer',
      code: 'permission_denied',
    },
  ];

  for (const scenario of denied) {
    const calls: string[] = [];
    const result = await inviteCommunityMemberCommand(
      {
        communityCloudId: 'community-cloud',
        members: scenario.members,
        currentUserId: scenario.currentUserId,
        globalRole: scenario.globalRole,
        identifier: 'ana@example.com',
        role: 'member',
      },
      membershipGateway(calls),
    );

    assertProductError(result, scenario.code);
    assert.deepEqual(calls, [], `invite called gateway for ${scenario.name}`);
  }
});

test('inviteCommunityMemberCommand rejects missing cloud id', async () => {
  const calls: string[] = [];
  const result = await inviteCommunityMemberCommand(
    {
      members: manageableMembers(),
      currentUserId: 'manager-user',
      identifier: 'ana@example.com',
      role: 'member',
    },
    membershipGateway(calls),
  );

  assertProductError(result, 'cloud_unavailable');
  assert.deepEqual(calls, []);
});

test('inviteCommunityMemberCommand rejects empty email and owner role', async () => {
  const calls: string[] = [];
  const gateway = membershipGateway(calls);

  const emptyEmail = await inviteCommunityMemberCommand(
    {
      communityCloudId: 'community-cloud',
      members: manageableMembers(),
      currentUserId: 'manager-user',
      identifier: ' ',
      role: 'member',
    },
    gateway,
  );
  const ownerRole = await inviteCommunityMemberCommand(
    {
      communityCloudId: 'community-cloud',
      members: manageableMembers(),
      currentUserId: 'manager-user',
      identifier: 'ana@example.com',
      role: 'owner',
    },
    gateway,
  );

  assert.equal(emptyEmail.ok, false);
  assert.equal((emptyEmail.error as any).code, 'invalid_input');
  assert.equal(ownerRole.ok, false);
  assert.equal((ownerRole.error as any).code, 'permission_denied');
  assert.deepEqual(calls, []);
});

test('inviteCommunityMemberCommand returns technical error when gateway throws', async () => {
  const gateway = membershipGateway([]);
  gateway.addMemberByIdentifier = async () => {
    throw new Error('invite failed');
  };

  const result = await inviteCommunityMemberCommand(
    {
      communityCloudId: 'community-cloud',
      members: manageableMembers(),
      currentUserId: 'manager-user',
      identifier: 'ana@example.com',
      role: 'member',
    },
    gateway,
  );

  assertTechnicalError(result);
});

test('inviteCommunityMemberCommand surfaces the server message for a 22023 error', async () => {
  // O PostgrestError e um objeto simples, NAO uma instancia de Error — verificado no
  // app rodando. Testar por instanceof descartava toda mensagem do servidor e a tela
  // mostrava so o generico, escondendo "Ja e membro da comunidade" e a orientacao
  // sobre o codigo de claim.
  const gateway = membershipGateway([]);
  gateway.addMemberByIdentifier = async () => {
    throw { code: '22023', message: 'Ja e membro da comunidade', details: null, hint: null };
  };

  const result = await inviteCommunityMemberCommand(
    {
      communityCloudId: 'community-cloud',
      members: manageableMembers(),
      currentUserId: 'manager-user',
      identifier: 'testedev',
      role: 'member',
    },
    gateway,
  );

  assert.equal(result.ok, false);
  if (result.ok === false) {
    assert.equal(result.error.kind, 'product');
    assert.equal(result.error.message, 'Ja e membro da comunidade');
  }
});

test('inviteCommunityMemberCommand keeps the generic message for a non-22023 failure', async () => {
  // Erro tecnico (rede, permissao) nao deve vazar texto cru do servidor para a tela.
  const gateway = membershipGateway([]);
  gateway.addMemberByIdentifier = async () => {
    throw { code: '42501', message: 'permission denied for function', details: null, hint: null };
  };

  const result = await inviteCommunityMemberCommand(
    {
      communityCloudId: 'community-cloud',
      members: manageableMembers(),
      currentUserId: 'manager-user',
      identifier: 'ana@example.com',
      role: 'member',
    },
    gateway,
  );

  assertTechnicalError(result);
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
  assert.equal((ownerTarget.error as any).code, 'permission_denied');
  assert.equal(selfTarget.ok, false);
  assert.equal((selfTarget.error as any).code, 'permission_denied');
  assert.equal(assignOwner.ok, false);
  assert.equal((assignOwner.error as any).code, 'permission_denied');
  assert.deepEqual(calls, []);
});

test('changeCommunityMemberRoleCommand returns not found for missing member', async () => {
  const calls: string[] = [];
  const result = await changeCommunityMemberRoleCommand(
    {
      members: manageableMembers(),
      currentUserId: 'manager-user',
      memberId: 'missing-member',
      role: 'admin',
    },
    membershipGateway(calls),
  );

  assertProductError(result, 'not_found');
  assert.deepEqual(calls, []);
});

test('changeCommunityMemberRoleCommand calls gateway for editable member', async () => {
  const calls: string[] = [];
  const result = await changeCommunityMemberRoleCommand(
    {
      members: manageableMembers(),
      currentUserId: 'manager-user',
      memberId: 'target-member',
      role: 'admin',
    },
    membershipGateway(calls),
  );

  assert.equal(result.ok, true);
  assert.equal(result.value.member.role, 'admin');
  assert.deepEqual(calls, ['role:target-member:admin']);
});

test('changeCommunityMemberRoleCommand returns technical error when gateway throws', async () => {
  const gateway = membershipGateway([]);
  gateway.updateRole = async () => {
    throw new Error('role failed');
  };

  const result = await changeCommunityMemberRoleCommand(
    {
      members: manageableMembers(),
      currentUserId: 'manager-user',
      memberId: 'target-member',
      role: 'admin',
    },
    gateway,
  );

  assertTechnicalError(result);
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
  assert.equal((ownerTarget.error as any).code, 'permission_denied');
  assert.equal(selfTarget.ok, false);
  assert.equal((selfTarget.error as any).code, 'permission_denied');
  assert.deepEqual(calls, []);
});

test('removeCommunityMemberCommand returns not found for missing member', async () => {
  const calls: string[] = [];
  const result = await removeCommunityMemberCommand(
    {
      members: manageableMembers(),
      currentUserId: 'manager-user',
      memberId: 'missing-member',
    },
    membershipGateway(calls),
  );

  assertProductError(result, 'not_found');
  assert.deepEqual(calls, []);
});

test('removeCommunityMemberCommand returns technical error when gateway throws', async () => {
  const gateway = membershipGateway([]);
  gateway.removeMember = async () => {
    throw new Error('remove failed');
  };

  const result = await removeCommunityMemberCommand(
    {
      members: manageableMembers(),
      currentUserId: 'manager-user',
      memberId: 'target-member',
    },
    gateway,
  );

  assertTechnicalError(result);
});

test('approveCommunityJoinRequestCommand and rejectCommunityJoinRequestCommand call gateway', async () => {
  const calls: string[] = [];
  const gateway = membershipGateway(calls);

  const approved = await approveCommunityJoinRequestCommand(
    { members: manageableMembers(), currentUserId: 'manager-user', memberId: 'pending-member' },
    gateway,
  );
  const rejected = await rejectCommunityJoinRequestCommand(
    { members: manageableMembers(), currentUserId: 'manager-user', memberId: 'pending-member' },
    gateway,
  );

  assert.equal(approved.ok, true);
  assert.equal(approved.value.memberId, 'pending-member');
  assert.equal(rejected.ok, true);
  assert.equal(rejected.value.memberId, 'pending-member');
  assert.deepEqual(calls, ['approve:pending-member', 'reject:pending-member']);
});

test('approveCommunityJoinRequestCommand returns not found for missing target member', async () => {
  const calls: string[] = [];
  const result = await approveCommunityJoinRequestCommand(
    { members: manageableMembers(), currentUserId: 'manager-user', memberId: 'missing-member' },
    membershipGateway(calls),
  );

  assertProductError(result, 'not_found');
  assert.deepEqual(calls, []);
});

test('rejectCommunityJoinRequestCommand returns not found for missing target member', async () => {
  const calls: string[] = [];
  const result = await rejectCommunityJoinRequestCommand(
    { members: manageableMembers(), currentUserId: 'manager-user', memberId: 'missing-member' },
    membershipGateway(calls),
  );

  assertProductError(result, 'not_found');
  assert.deepEqual(calls, []);
});

test('approveCommunityJoinRequestCommand returns technical error when gateway throws', async () => {
  const gateway = membershipGateway([]);
  gateway.approveRequest = async () => {
    throw new Error('approve failed');
  };

  const result = await approveCommunityJoinRequestCommand(
    { members: manageableMembers(), currentUserId: 'manager-user', memberId: 'pending-member' },
    gateway,
  );

  assertTechnicalError(result);
});

test('rejectCommunityJoinRequestCommand returns technical error when gateway throws', async () => {
  const gateway = membershipGateway([]);
  gateway.rejectRequest = async () => {
    throw new Error('reject failed');
  };

  const result = await rejectCommunityJoinRequestCommand(
    { members: manageableMembers(), currentUserId: 'manager-user', memberId: 'pending-member' },
    gateway,
  );

  assertTechnicalError(result);
});

test('generateCommunityJoinCodeCommand requires cloud id, generate and disable call gateway', async () => {
  const calls: string[] = [];
  const gateway = membershipGateway(calls);

  const missing = await generateCommunityJoinCodeCommand(
    { members: manageableMembers(), currentUserId: 'manager-user' },
    gateway,
  );
  const generated = await generateCommunityJoinCodeCommand(
    {
      communityCloudId: 'community-cloud',
      members: manageableMembers(),
      currentUserId: 'manager-user',
    },
    gateway,
  );
  const disabled = await disableCommunityJoinCodeCommand(
    {
      communityCloudId: 'community-cloud',
      members: manageableMembers(),
      currentUserId: 'manager-user',
    },
    gateway,
  );

  assert.equal(missing.ok, false);
  assert.equal((missing.error as any).code, 'cloud_unavailable');
  assert.equal(generated.ok, true);
  assert.equal(generated.value.joinCode, 'ABCD1234');
  assert.equal(disabled.ok, true);
  assert.deepEqual(calls, ['generate:community-cloud', 'disable:community-cloud']);
});

test('disableCommunityJoinCodeCommand rejects missing cloud id', async () => {
  const calls: string[] = [];
  const result = await disableCommunityJoinCodeCommand(
    { members: manageableMembers(), currentUserId: 'manager-user' },
    membershipGateway(calls),
  );

  assertProductError(result, 'cloud_unavailable');
  assert.deepEqual(calls, []);
});

test('generateCommunityJoinCodeCommand trims cloud id before calling gateway', async () => {
  const calls: string[] = [];
  const result = await generateCommunityJoinCodeCommand(
    {
      communityCloudId: '  community-cloud  ',
      members: manageableMembers(),
      currentUserId: 'manager-user',
    },
    membershipGateway(calls),
  );

  assert.equal(result.ok, true);
  assert.deepEqual(calls, ['generate:community-cloud']);
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
  assert.equal((owner.error as any).code, 'permission_denied');
  assert.equal(left.ok, true);
  assert.deepEqual(calls, ['leave:community-cloud']);
});

test('leaveCommunityCommand rejects missing cloud id and missing current member', async () => {
  const calls: string[] = [];
  const gateway = membershipGateway(calls);

  const missingCloud = await leaveCommunityCommand(
    { currentMember: member({ role: 'member' }) },
    gateway,
  );
  const missingMember = await leaveCommunityCommand(
    { communityCloudId: 'community-cloud', currentMember: null },
    gateway,
  );

  assertProductError(missingCloud, 'cloud_unavailable');
  assertProductError(missingMember, 'not_found');
  assert.deepEqual(calls, []);
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

test('requestPublicCommunityJoinCommand rejects missing cloud id', async () => {
  const calls: string[] = [];
  const result = await requestPublicCommunityJoinCommand({}, discoveryGateway(calls));

  assertProductError(result, 'cloud_unavailable');
  assert.deepEqual(calls, []);
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

test('requestCommunityJoinByCodeCommand rejects empty code', async () => {
  const calls: string[] = [];
  const result = await requestCommunityJoinByCodeCommand(
    { code: ' ', communityLocalId: 'community-local' },
    membershipGateway(calls),
  );

  assertProductError(result, 'invalid_input');
  assert.deepEqual(calls, []);
});

test('previewCommunityJoinByCodeQuery normalizes code and returns found community', async () => {
  const calls: string[] = [];
  const result = await previewCommunityJoinByCodeQuery(
    { code: ' abcd1234 ' },
    membershipGateway(calls),
  );

  assert.equal(result.ok, true);
  assert.equal(result.value.community.id, 'community-cloud');
  assert.equal(result.value.community.name, 'Terca Forte');
  assert.deepEqual(calls, ['find:ABCD1234']);
});

test('previewCommunityJoinByCodeQuery rejects empty code without calling gateway', async () => {
  const calls: string[] = [];
  const result = await previewCommunityJoinByCodeQuery({ code: ' ' }, membershipGateway(calls));

  assertProductError(result, 'invalid_input');
  assert.deepEqual(calls, []);
});

test('previewCommunityJoinByCodeQuery returns not found when gateway returns null', async () => {
  const calls: string[] = [];
  const gateway = membershipGateway(calls);
  gateway.findByCode = async (code) => {
    calls.push(`find:${code}`);
    return null;
  };

  const result = await previewCommunityJoinByCodeQuery({ code: 'missing' }, gateway);

  assertProductError(result, 'not_found');
  assert.deepEqual(calls, ['find:MISSING']);
});

test('previewCommunityJoinByCodeQuery returns technical error when gateway throws', async () => {
  const gateway = membershipGateway([]);
  gateway.findByCode = async () => {
    throw new Error('preview failed');
  };

  const result = await previewCommunityJoinByCodeQuery({ code: 'ABCD1234' }, gateway);

  assertTechnicalError(result);
});

test('requestCommunityJoinByCodeCommand returns technical error when gateway throws', async () => {
  const gateway = membershipGateway([]);
  gateway.requestToJoin = async () => {
    throw new Error('join failed');
  };

  const result = await requestCommunityJoinByCodeCommand({ code: 'ABCD1234' }, gateway);

  assertTechnicalError(result);
});
