import { appOk, productError, technicalError, type AppResult } from './appResult';
import type { UserProfile } from '@shared/types';

export type AccountReadiness = 'needs_username' | 'ready';

export interface AccountSnapshot {
  state: AccountReadiness;
  profile: UserProfile;
  playerId: string;
  username: string | null;
  requiresAal2: boolean;
}

export interface AccountGateway {
  ensureReady(username?: string | null): Promise<AccountSnapshot>;
}

export async function ensureAccountReadyCommand(
  gateway: AccountGateway,
  username?: string | null,
): Promise<AppResult<AccountSnapshot>> {
  const normalized = username?.trim().toLowerCase() || null;
  try {
    return appOk(await gateway.ensureReady(normalized));
  } catch (cause) {
    const code = typeof cause === 'object' && cause && 'code' in cause ? String(cause.code) : '';
    if (code === '23505') {
      return productError('username_unavailable', 'Este username ja esta em uso.');
    }
    if (code === '22023') {
      return productError('invalid_username', 'Use de 3 a 30 letras, numeros, _ ou -.');
    }
    return technicalError('Não foi possível preparar sua conta agora.', cause);
  }
}
