import type { Player } from '../types';
import { communityPlayerCloudService } from '@infra/supabase/communityPlayerCloudService';
import { playerCloudService } from '@infra/supabase/playerCloudService';
import { appOk, productError, technicalError, type AppResult } from './appResult';

export type FoundCommunityPlayer = { cloudId: string; username: string; name: string };

export interface CommunityPlayerSearchGateway {
  findByUsername(username: string): Promise<FoundCommunityPlayer | null>;
  linkPlayer(communityCloudId: string, playerCloudId: string, ownerId: string): Promise<void>;
  fetchByCloudId(cloudId: string): Promise<Player | null>;
}

const supabaseCommunityPlayerSearchGateway: CommunityPlayerSearchGateway = {
  findByUsername: playerCloudService.findByUsername,
  linkPlayer: communityPlayerCloudService.linkPlayer,
  fetchByCloudId: playerCloudService.fetchByCloudId,
};

export async function searchPlayerByUsernameQuery(
  username: string,
  gateway: CommunityPlayerSearchGateway = supabaseCommunityPlayerSearchGateway,
): Promise<AppResult<FoundCommunityPlayer | null>> {
  const handle = normalizeUsername(username);
  if (!handle) return productError('invalid_input', 'Informe um username para buscar.');

  try {
    return appOk(await gateway.findByUsername(handle));
  } catch (error) {
    return technicalError('Não foi possível buscar o atleta.', error);
  }
}

export async function linkCommunityPlayerByUsernameCommand(
  input: {
    communityId: string;
    communityCloudId: string;
    playerCloudId: string;
    currentUserId: string | null;
  },
  gateway: CommunityPlayerSearchGateway = supabaseCommunityPlayerSearchGateway,
): Promise<AppResult<{ linkedPlayer: Player | null }>> {
  if (!input.currentUserId) {
    return productError('not_authenticated', 'Usuário não autenticado.');
  }
  if (!input.communityCloudId || !input.playerCloudId) {
    return productError('invalid_input', 'Comunidade ou atleta sem identificador de nuvem.');
  }

  try {
    await gateway.linkPlayer(input.communityCloudId, input.playerCloudId, input.currentUserId);
    const linkedPlayer = await gateway.fetchByCloudId(input.playerCloudId);

    return appOk({
      linkedPlayer: linkedPlayer
        ? {
            ...linkedPlayer,
            communityIds: [...new Set([...(linkedPlayer.communityIds ?? []), input.communityId])],
          }
        : null,
    });
  } catch (error) {
    return technicalError('Não foi possível vincular o atleta.', error);
  }
}

function normalizeUsername(username: string): string {
  return username.trim().replace(/^@/, '').trim();
}
