import type { AuthRole, CommunityMember, CommunityMemberRole } from '../types';
import { membershipCloudService } from '../services/supabase/membershipCloudService';
import {
  communityDiscoveryService,
  type PublicCommunityResult,
} from '../services/supabase/communityDiscoveryService';
import { appOk, productError, recoverableIssue, technicalError } from './appResult';
import type { AppResult } from './appResult';

export interface CommunityJoinPreview {
  id: string;
  name: string;
  description: string | null;
  memberCount: number;
  myStatus: string | null;
}

export type { PublicCommunityResult };

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
  findByCode: (code: string) => Promise<CommunityJoinPreview | null>;
  requestToJoin: (code: string, communityLocalId?: string) => Promise<CommunityMember>;
}

export interface CommunityDiscoveryGateway {
  searchPublic: (query: string) => Promise<PublicCommunityResult[]>;
  requestToJoinPublic: (communityCloudId: string) => Promise<void>;
}

export const supabaseCommunityMembershipGateway: CommunityMembershipGateway = {
  fetchByCommunity: (communityCloudId, communityLocalId) =>
    membershipCloudService.fetchByCommunity(communityCloudId, communityLocalId),
  addMemberByEmail: (communityCloudId, email, role, communityLocalId) =>
    membershipCloudService.addOrganizerByEmail(communityCloudId, email, role, communityLocalId),
  updateRole: (memberId, role) => membershipCloudService.updateRole(memberId, role),
  removeMember: (memberId) => membershipCloudService.removeMember(memberId),
  approveRequest: (memberId) => membershipCloudService.approveRequest(memberId),
  rejectRequest: (memberId) => membershipCloudService.rejectRequest(memberId),
  generateJoinCode: (communityCloudId) => membershipCloudService.generateJoinCode(communityCloudId),
  disableJoinCode: (communityCloudId) => membershipCloudService.disableJoinCode(communityCloudId),
  leaveCommunity: (communityCloudId) => membershipCloudService.leaveCommunity(communityCloudId),
  findByCode: (code) => membershipCloudService.findByCode(code),
  requestToJoin: (code, communityLocalId) =>
    membershipCloudService.requestToJoin(code, communityLocalId),
};

export const supabaseCommunityDiscoveryGateway: CommunityDiscoveryGateway = {
  searchPublic: (query) => communityDiscoveryService.searchPublic(query),
  requestToJoinPublic: (communityCloudId) =>
    communityDiscoveryService.requestToJoinPublic(communityCloudId),
};

export async function fetchCommunityMembersQuery(
  input: { communityCloudId?: string; communityLocalId?: string },
  gateway: CommunityMembershipGateway = supabaseCommunityMembershipGateway,
): Promise<AppResult<{ members: CommunityMember[] }>> {
  const cloudIdResult = requireCommunityCloudId(input.communityCloudId);
  if (cloudIdResult.ok === false) return cloudIdResult;

  try {
    const members = await gateway.fetchByCommunity(
      cloudIdResult.value.communityCloudId,
      input.communityLocalId,
    );
    return appOk({ members });
  } catch (error) {
    return appOk({ members: [] }, [
      recoverableIssue('cloud_unavailable', 'Nao foi possivel carregar os membros.', error),
    ]);
  }
}

export async function inviteCommunityMemberCommand(
  input: {
    communityCloudId?: string;
    communityLocalId?: string;
    members: CommunityMember[];
    currentUserId: string | null;
    globalRole?: AuthRole | null;
    email: string;
    role: CommunityMemberRole;
  },
  gateway: CommunityMembershipGateway = supabaseCommunityMembershipGateway,
): Promise<AppResult<{ member: CommunityMember }>> {
  const cloudIdResult = requireCommunityCloudId(input.communityCloudId);
  if (cloudIdResult.ok === false) return cloudIdResult;

  const email = input.email.trim().toLowerCase();
  if (!email) return productError('invalid_input', 'Informe um e-mail para convidar.');
  if (input.role === 'owner') {
    return productError('permission_denied', 'O papel de dono nao pode ser atribuido por convite.');
  }

  const managerResult = ensureManagingCurrentMember(
    input.members,
    input.currentUserId,
    input.globalRole,
  );
  if (managerResult.ok === false) return managerResult;

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
    globalRole?: AuthRole | null;
    memberId: string;
    role: CommunityMemberRole;
  },
  gateway: CommunityMembershipGateway = supabaseCommunityMembershipGateway,
): Promise<AppResult<{ member: CommunityMember }>> {
  if (input.role === 'owner') {
    return productError('permission_denied', 'O papel de dono nao pode ser atribuido pela UI.');
  }

  const managerResult = ensureManagingCurrentMember(
    input.members,
    input.currentUserId,
    input.globalRole,
  );
  if (managerResult.ok === false) return managerResult;

  const targetResult = findTargetMember(input.members, input.memberId);
  if (targetResult.ok === false) return targetResult;

  const editableResult = ensureEditableMember(targetResult.value.member, input.currentUserId);
  if (editableResult.ok === false) return editableResult;

  try {
    const member = await gateway.updateRole(input.memberId, input.role);
    return appOk({ member });
  } catch (error) {
    return technicalError('Nao foi possivel alterar o papel do membro.', error);
  }
}

export async function removeCommunityMemberCommand(
  input: {
    members: CommunityMember[];
    currentUserId: string | null;
    globalRole?: AuthRole | null;
    memberId: string;
  },
  gateway: CommunityMembershipGateway = supabaseCommunityMembershipGateway,
): Promise<AppResult<{ removedMemberId: string }>> {
  const managerResult = ensureManagingCurrentMember(
    input.members,
    input.currentUserId,
    input.globalRole,
  );
  if (managerResult.ok === false) return managerResult;

  const targetResult = findTargetMember(input.members, input.memberId);
  if (targetResult.ok === false) return targetResult;

  const editableResult = ensureEditableMember(targetResult.value.member, input.currentUserId);
  if (editableResult.ok === false) return editableResult;

  try {
    await gateway.removeMember(input.memberId);
    return appOk({ removedMemberId: input.memberId });
  } catch (error) {
    return technicalError('Nao foi possivel remover o membro.', error);
  }
}

export async function approveCommunityJoinRequestCommand(
  input: {
    members: CommunityMember[];
    currentUserId: string | null;
    globalRole?: AuthRole | null;
    memberId: string;
  },
  gateway: CommunityMembershipGateway = supabaseCommunityMembershipGateway,
): Promise<AppResult<{ memberId: string }>> {
  const managerResult = ensureManagingCurrentMember(
    input.members,
    input.currentUserId,
    input.globalRole,
  );
  if (managerResult.ok === false) return managerResult;

  const targetResult = findTargetMember(input.members, input.memberId);
  if (targetResult.ok === false) return targetResult;

  try {
    await gateway.approveRequest(input.memberId);
    return appOk({ memberId: input.memberId });
  } catch (error) {
    return technicalError('Nao foi possivel aprovar o pedido.', error);
  }
}

export async function rejectCommunityJoinRequestCommand(
  input: {
    members: CommunityMember[];
    currentUserId: string | null;
    globalRole?: AuthRole | null;
    memberId: string;
  },
  gateway: CommunityMembershipGateway = supabaseCommunityMembershipGateway,
): Promise<AppResult<{ memberId: string }>> {
  const managerResult = ensureManagingCurrentMember(
    input.members,
    input.currentUserId,
    input.globalRole,
  );
  if (managerResult.ok === false) return managerResult;

  const targetResult = findTargetMember(input.members, input.memberId);
  if (targetResult.ok === false) return targetResult;

  try {
    await gateway.rejectRequest(input.memberId);
    return appOk({ memberId: input.memberId });
  } catch (error) {
    return technicalError('Nao foi possivel rejeitar o pedido.', error);
  }
}

export async function generateCommunityJoinCodeCommand(
  input: {
    communityCloudId?: string;
    members: CommunityMember[];
    currentUserId: string | null;
    globalRole?: AuthRole | null;
  },
  gateway: CommunityMembershipGateway = supabaseCommunityMembershipGateway,
): Promise<AppResult<{ joinCode: string }>> {
  const cloudIdResult = requireCommunityCloudId(input.communityCloudId);
  if (cloudIdResult.ok === false) return cloudIdResult;

  const managerResult = ensureManagingCurrentMember(
    input.members,
    input.currentUserId,
    input.globalRole,
  );
  if (managerResult.ok === false) return managerResult;

  try {
    const joinCode = await gateway.generateJoinCode(cloudIdResult.value.communityCloudId);
    return appOk({ joinCode });
  } catch (error) {
    return technicalError('Nao foi possivel gerar o codigo.', error);
  }
}

export async function disableCommunityJoinCodeCommand(
  input: {
    communityCloudId?: string;
    members: CommunityMember[];
    currentUserId: string | null;
    globalRole?: AuthRole | null;
  },
  gateway: CommunityMembershipGateway = supabaseCommunityMembershipGateway,
): Promise<AppResult<Record<string, never>>> {
  const cloudIdResult = requireCommunityCloudId(input.communityCloudId);
  if (cloudIdResult.ok === false) return cloudIdResult;

  const managerResult = ensureManagingCurrentMember(
    input.members,
    input.currentUserId,
    input.globalRole,
  );
  if (managerResult.ok === false) return managerResult;

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
  if (cloudIdResult.ok === false) return cloudIdResult;
  if (!input.currentMember) {
    return productError('not_found', 'Sua participacao nesta comunidade nao foi encontrada.');
  }
  if (input.currentMember.role === 'owner') {
    return productError('permission_denied', 'O dono nao pode sair da comunidade por este fluxo.');
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
  if (cloudIdResult.ok === false) return cloudIdResult;

  try {
    await discoveryGateway.requestToJoinPublic(cloudIdResult.value.communityCloudId);
    return appOk({});
  } catch (error) {
    return technicalError('Nao foi possivel enviar o pedido.', error);
  }
}

export async function previewCommunityJoinByCodeQuery(
  input: { code: string },
  gateway: CommunityMembershipGateway = supabaseCommunityMembershipGateway,
): Promise<AppResult<{ community: CommunityJoinPreview }>> {
  const code = input.code.trim().toUpperCase();
  if (!code) return productError('invalid_input', 'Informe o codigo da comunidade.');

  try {
    const community = await gateway.findByCode(code);
    if (!community) {
      return productError('not_found', 'Codigo de convite invalido ou comunidade nao encontrada.');
    }
    return appOk({ community });
  } catch (error) {
    return technicalError('Nao foi possivel buscar a comunidade.', error);
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
  const trimmedCloudId = communityCloudId?.trim();
  return trimmedCloudId
    ? appOk({ communityCloudId: trimmedCloudId })
    : productError('cloud_unavailable', 'Sincronize a comunidade com a nuvem antes.');
}

function findCurrentMember(
  members: CommunityMember[],
  currentUserId: string | null,
): AppResult<{ member: CommunityMember }> {
  if (!currentUserId) {
    return productError('not_authenticated', 'Entre na sua conta para gerenciar membros.');
  }

  const member = members.find((candidate) => candidate.userId === currentUserId);
  return member
    ? appOk({ member })
    : productError('not_found', 'Sua participacao nesta comunidade nao foi encontrada.');
}

function ensureManagingCurrentMember(
  members: CommunityMember[],
  currentUserId: string | null,
  globalRole?: AuthRole | null,
): AppResult<Record<string, never>> {
  if (!currentUserId) {
    return productError('not_authenticated', 'Entre na sua conta para gerenciar membros.');
  }
  if (globalRole === 'programmer') {
    return productError(
      'permission_denied',
      'Voce nao tem permissao para gerenciar membros desta comunidade.',
    );
  }
  if (globalRole === 'master') return appOk({});

  const currentMemberResult = findCurrentMember(members, currentUserId);
  if (currentMemberResult.ok === false) return currentMemberResult;

  const currentMember = currentMemberResult.value.member;
  if ((currentMember.status ?? 'active') !== 'active') {
    return productError(
      'permission_denied',
      'Sua participacao ainda nao permite gerenciar membros.',
    );
  }
  if (currentMember.role !== 'owner' && currentMember.role !== 'admin') {
    return productError(
      'permission_denied',
      'Voce nao tem permissao para gerenciar membros desta comunidade.',
    );
  }
  return appOk({});
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
