import type { CommunitySkillProfile, CommunitySkillProfileRequest } from '@shared/types';
import { communitySkillProfileCloudService } from '@infra/supabase/communitySkillProfileCloudService';
import { appOk, productError, technicalError, type AppResult } from './appResult';

export interface CommunitySkillProfileGateway {
  fetchProfile(input: CommunitySkillProfileRequest): Promise<CommunitySkillProfile>;
}

export async function loadCommunitySkillProfile(
  input: CommunitySkillProfileRequest,
  gateway: CommunitySkillProfileGateway = communitySkillProfileCloudService,
): Promise<AppResult<CommunitySkillProfile>> {
  const request = {
    communityId: input.communityId.trim(),
    playerId: input.playerId.trim(),
    rubricVersion: input.rubricVersion.trim(),
  };
  if (!request.communityId || !request.playerId || !request.rubricVersion) {
    return productError('invalid_input', 'Escolha uma comunidade e um atleta sincronizados.');
  }
  try {
    return appOk(await gateway.fetchProfile(request));
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
    if (code === '42501') {
      return productError(
        'permission_denied',
        'É preciso ser avaliador autorizado nesta comunidade.',
      );
    }
    if (code === '23514') {
      return productError(
        'invalid_input',
        'O atleta ou os critérios não estão disponíveis nesta comunidade.',
      );
    }
    if (code === 'CLOUD_UNAVAILABLE') {
      return productError(
        'cloud_unavailable',
        'Conecte o aplicativo à nuvem para consultar o perfil.',
      );
    }
    if (code === 'PGRST202' || code === '42883') {
      return productError(
        'cloud_unavailable',
        'O perfil experimental ainda não está disponível neste servidor.',
      );
    }
    return technicalError(
      'Não foi possível consultar o perfil. Verifique a conexão e tente novamente.',
      error,
    );
  }
}
