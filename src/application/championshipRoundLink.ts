import { championshipCloudService } from '@infra/supabase/championshipCloudService';

export interface RoundLinkGateway {
  linkRoundToSession: (roundCloudId: string, sessionCloudId: string) => Promise<void>;
}

export async function linkMaterializedRound(
  input: { roundCloudId: string | undefined; sessionId: string },
  gateway: RoundLinkGateway = championshipCloudService,
): Promise<'synced' | 'pending'> {
  if (!input.roundCloudId) return 'pending';
  try {
    await gateway.linkRoundToSession(input.roundCloudId, input.sessionId);
    return 'synced';
  } catch {
    return 'pending';
  }
}
