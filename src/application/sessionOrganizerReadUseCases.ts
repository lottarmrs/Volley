import {
  sessionOrganizerReadCloudService,
  type SessionOrganizer,
} from '@infra/supabase/sessionOrganizerReadCloudService';
import { appOk, technicalError, type AppResult } from './appResult';

export interface SessionOrganizerReadGateway {
  fetchOrganizer(sessionCloudId: string): Promise<SessionOrganizer | null>;
}

export async function loadSessionOrganizer(
  sessionCloudId: string | null | undefined,
  gateway: SessionOrganizerReadGateway = sessionOrganizerReadCloudService,
): Promise<AppResult<SessionOrganizer | null>> {
  const id = sessionCloudId?.trim();
  if (!id) return appOk(null);
  try {
    return appOk(await gateway.fetchOrganizer(id));
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
    if (code === 'CLOUD_UNAVAILABLE') return appOk(null);
    return technicalError('Não foi possível saber quem organiza.', error);
  }
}
