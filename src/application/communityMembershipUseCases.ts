import type { CommunityMember, CommunityMemberRole } from '../types';
import { membershipCloudService } from '../services/supabase/membershipCloudService';
import {
  communityDiscoveryService,
  type PublicCommunityResult,
} from '../services/supabase/communityDiscoveryService';
import { appOk, productError, recoverableIssue, technicalError } from './appResult';
import type { AppResult } from './appResult';

export interface CommunityMembershipGateway {
  fetchByCommunity: (
    communityCloudId: string,
    communityLocalId?: string,
  ) => Promise<CommunityMember[]>;
  addMemberByEmail: (
    communityCloudId: string,
    email: string,
    role: CommunityMemberRole,
    communityLocalId?: string,
  ) => Promise<CommunityMember>;
  updateRole: (memberId: string, role: CommunityMemberRole) => Promise<CommunityMember>;
  removeMember: (memberId: string) => Promise<void>;
  approveRequest: (memberId: string) => Promise<void>;
  rejectRequest: (memberId: string) => Promise<void>;
  generateJoinCode: (communityCloudId: string) => Promise<string>;
  disableJoinCode: (communityCloudId: string) => Promise<void>;
  leaveCommunity: (communityCloudId: string) => Promise<void>;
  findByCode: (code: string) => Promise<{
    id: string;
    name: string;
    description: string | null;
    memberCount: number;
    myStatus: string | null;
  } | null>;
  requestToJoin: (code: string, communityLocalId?: string) => Promise<CommunityMember>;
}

export interface CommunityDiscoveryGateway {
  searchPublic: (query: string) => Promise<PublicCommunityResult[]>;
  requestToJoinPublic: (communityCloudId: string) => Promise<void>;
}

export const supabaseCommunityMembershipGateway: CommunityMembershipGateway = {
  fetchByCommunity: membershipCloudService.fetchByCommunity,
  addMemberByEmail: membershipCloudService.addOrganizerByEmail,
  updateRole: membershipCloudService.updateRole,
  removeMember: membershipCloudService.removeMember,
  approveRequest: membershipCloudService.approveRequest,
  rejectRequest: membershipCloudService.rejectRequest,
  generateJoinCode: membershipCloudService.generateJoinCode,
  disableJoinCode: membershipCloudService.disableJoinCode,
  leaveCommunity: membershipCloudService.leaveCommunity,
  findByCode: membershipCloudService.findByCode,
  requestToJoin: membershipCloudService.requestToJoin,
};

export const supabaseCommunityDiscoveryGateway: CommunityDiscoveryGateway = {
  searchPublic: communityDiscoveryService.searchPublic,
  requestToJoinPublic: communityDiscoveryService.requestToJoinPublic,
};

export async function fetchCommunityMembersQuery(
  input: { communityCloudId?: string; communityLocalId?: string },
  gateway: CommunityMembershipGateway = supabaseCommunityMembershipGateway,
): Promise<AppResult<{ members: CommunityMember[] }>> {
  const cloudIdResult = requireCommunityCloudId(input.communityCloudId);
  if (!cloudIdResult.ok) return cloudIdResult;

  try {
    const members = await gateway.fetchByCommunity(
      cloudIdResult.value.communityCloudId,
      input.communityLocalId,
    );
    return appOk({ members });
  } catch (error) {
    return appOk(
      { members: [] },
      [recoverableIssue('cloud_unavailable', 'Nao foi possivel carregar os membros.', error)],
    );
  }
}

export async function inviteCommunityMemberCommand(
  input: {
    communityCloudId?: string;
    communityLocalId?: string;
    email: string;
    role: CommunityMemberRole;
  },
  gateway: CommunityMembershipGateway = supabaseCommunityMembershipGateway,
): Promise<AppResult<{ member: CommunityMember }>> {
  const cloudIdResult = requireCommunityCloudId(input.communityCloudId);
  if (!cloudIdResult.ok) return cloudIdResult;

  const email = input.email.trim().toLowerCase();
  if (!email) return productError('invalid_input', 'Informe um e-mail para convidar.');
  if (input.role === 'owner') {
    return productError('permission_denied', 'O papel de dono nao pode ser atribuido por convite.');
  }

  try {
    const member = await gateway.addMemberByEmail(
      cloudIdResult.value.communityCloudId,
      email,
      input.role,
      input.communityLocalId,
    );
    return appOk({ member });
  } catch (error) {
    return technicalError('Nao foi possivel convidar o membro.', error);
  }
}

export async function changeCommunityMemberRoleCommand(
  input: {
    members: CommunityMember[];
    currentUserId: string | null;
    memberId: string;
    role: CommunityMemberRole;
  },
  gateway: CommunityMembershipGateway = supabaseCommunityMembershipGateway,
): Promise<AppResult<{ member: CommunityMember }>> {
  if (input.role === 'owner') {
    return productError('permission_denied', 'O papel de dono nao pode ser atribuido pela UI.');
  }

  const targetResult = findTargetMember(input.members, input.memberId);
  if (!targetResult.ok) return targetResult;

  const editableResult = ensureEditableMember(targetResult.value.member, input.currentUserId);
  if (!editableResult.ok) return editableResult;

  try {
    const member = await gateway.updateRole(input.memberId, input.role);
    return appOk({ member });
  } catch (error) {
    return technicalError('Nao foi possivel alterar o papel do membro.', error);
  }
}

export async function removeCommunityMemberCommand(
  input: { members: CommunityMember[]; currentUserId: string | null; memberId: string },
  gateway: CommunityMembershipGateway = supabaseCommunityMembershipGateway,
): Promise<AppResult<{ removedMemberId: string }>> {
  const targetResult = findTargetMember(input.members, input.memberId);
  if (!targetResult.ok) return targetResult;

  const editableResult = ensureEditableMember(targetResult.value.member, input.currentUserId);
  if (!editableResult.ok) return editableResult;

  try {
    await gateway.removeMember(input.memberId);
    return appOk({ removedMemberId: input.memberId });
  } catch (error) {
    return technicalError('Nao foi possivel remover o membro.', error);
  }
}

export async function approveCommunityJoinRequestCommand(
  input: { memberId: string },
  gateway: CommunityMembershipGateway = supabaseCommunityMembershipGateway,
): Promise<AppResult<{ memberId: string }>> {
  try {
    await gateway.approveRequest(input.memberId);
    return appOk({ memberId: input.memberId });
  } catch (error) {
    return technicalError('Nao foi possivel aprovar o pedido.', error);
  }
}

export async function rejectCommunityJoinRequestCommand(
  input: { memberId: string },
  gateway: CommunityMembershipGateway = supabaseCommunityMembershipGateway,
): Promise<AppResult<{ memberId: string }>> {
  try {
    await gateway.rejectRequest(input.memberId);
    return appOk({ memberId: input.memberId });
  } catch (error) {
    return technicalError('Nao foi possivel rejeitar o pedido.', error);
  }
}

export async function generateCommunityJoinCodeCommand(
  input: { communityCloudId?: string },
  gateway: CommunityMembershipGateway = supabaseCommunityMembershipGateway,
): Promise<AppResult<{ joinCode: string }>> {
  const cloudIdResult = requireCommunityCloudId(input.communityCloudId);
  if (!cloudIdResult.ok) return cloudIdResult;

  try {
    const joinCode = await gateway.generateJoinCode(cloudIdResult.value.communityCloudId);
    return appOk({ joinCode });
  } catch (error) {
    return technicalError('Nao foi possivel gerar o codigo.', error);
  }
}

export async function disableCommunityJoinCodeCommand(
  input: { communityCloudId?: string },
  gateway: CommunityMembershipGateway = supabaseCommunityMembershipGateway,
): Promise<AppResult<Record<string, never>>> {
  const cloudIdResult = requireCommunityCloudId(input.communityCloudId);
  if (!cloudIdResult.ok) return cloudIdResult;

  try {
    await gateway.disableJoinCode(cloudIdResult.value.communityCloudId);
    return appOk({});
  } catch (error) {
    return technicalError('Nao foi possivel desativar o codigo.', error);
  }
}

export async function leaveCommunityCommand(
  input: { communityCloudId?: string; currentMember: CommunityMember | null },
  gateway: CommunityMembershipGateway = supabaseCommunityMembershipGateway,
): Promise<AppResult<Record<string, never>>> {
  const cloudIdResult = requireCommunityCloudId(input.communityCloudId);
  if (!cloudIdResult.ok) return cloudIdResult;
  if (!input.currentMember) {
    return productError('not_found', 'Sua participacao nesta comunidade nao foi encontrada.');
  }
  if (input.currentMember.role === 'owner') {
    return productError(
      'permission_denied',
      'O dono nao pode sair da comunidade por este fluxo.',
    );
  }

  try {
    await gateway.leaveCommunity(cloudIdResult.value.communityCloudId);
    return appOk({});
  } catch (error) {
    return technicalError('Nao foi possivel sair da comunidade.', error);
  }
}

export async function searchPublicCommunitiesQuery(
  input: { query: string },
  discoveryGateway: CommunityDiscoveryGateway = supabaseCommunityDiscoveryGateway,
): Promise<AppResult<{ communities: PublicCommunityResult[] }>> {
  try {
    const communities = await discoveryGateway.searchPublic(input.query.trim());
    return appOk({ communities });
  } catch (error) {
    return technicalError('Nao foi possivel buscar comunidades.', error);
  }
}

export async function requestPublicCommunityJoinCommand(
  input: { communityCloudId?: string },
  discoveryGateway: CommunityDiscoveryGateway = supabaseCommunityDiscoveryGateway,
): Promise<AppResult<Record<string, never>>> {
  const cloudIdResult = requireCommunityCloudId(input.communityCloudId);
  if (!cloudIdResult.ok) return cloudIdResult;

  try {
    await discoveryGateway.requestToJoinPublic(cloudIdResult.value.communityCloudId);
    return appOk({});
  } catch (error) {
    return technicalError('Nao foi possivel enviar o pedido.', error);
  }
}

export async function requestCommunityJoinByCodeCommand(
  input: { code: string; communityLocalId?: string },
  gateway: CommunityMembershipGateway = supabaseCommunityMembershipGateway,
): Promise<AppResult<{ member: CommunityMember }>> {
  const code = input.code.trim().toUpperCase();
  if (!code) return productError('invalid_input', 'Informe o codigo da comunidade.');

  try {
    const member = await gateway.requestToJoin(code, input.communityLocalId);
    return appOk({ member });
  } catch (error) {
    return technicalError('Nao foi possivel enviar o pedido.', error);
  }
}

function requireCommunityCloudId(
  communityCloudId: string | undefined,
): AppResult<{ communityCloudId: string }> {
  return communityCloudId
    ? appOk({ communityCloudId })
    : productError('cloud_unavailable', 'Sincronize a comunidade com a nuvem antes.');
}

function findTargetMember(
  members: CommunityMember[],
  memberId: string,
): AppResult<{ member: CommunityMember }> {
  const member = members.find((candidate) => candidate.id === memberId);
  return member ? appOk({ member }) : productError('not_found', 'Membro nao encontrado.');
}

function ensureEditableMember(
  member: CommunityMember,
  currentUserId: string | null,
): AppResult<Record<string, never>> {
  if (member.role === 'owner') {
    return productError('permission_denied', 'O dono nao pode ser alterado por este fluxo.');
  }
  if (member.userId === currentUserId) {
    return productError(
      'permission_denied',
      'Voce nao pode alterar sua propria participacao aqui.',
    );
  }
  return appOk({});
}
