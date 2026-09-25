import { communityCapabilitiesCloudService } from '@infra/supabase/communityCapabilitiesCloudService';
import { appOk, technicalError, type AppResult } from './appResult';

export interface CommunityCapabilitiesGateway {
  has(communityCloudId: string, capability: string): Promise<boolean>;
}

export const CAPABILITIES_OF_INTEREST = ['player.evaluate'] as const;

export async function loadCommunityCapabilities(
  communityCloudId: string | null | undefined,
  userId: string | null | undefined,
  gateway: CommunityCapabilitiesGateway = communityCapabilitiesCloudService,
): Promise<AppResult<string[]>> {
  const community = communityCloudId?.trim();
  const user = userId?.trim();
  if (!community || !user) return appOk([]);
  try {
    const granted: (string | null)[] = await Promise.all(
      CAPABILITIES_OF_INTEREST.map(async (capability) =>
        (await gateway.has(community, capability)) ? capability : null,
      ),
    );
    return appOk(granted.filter((capability): capability is string => capability !== null));
  } catch (error) {
    return technicalError('Não foi possível conferir suas permissões nesta comunidade.', error);
  }
}
