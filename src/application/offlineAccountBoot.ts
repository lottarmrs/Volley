import type { AppError } from './appResult';
import type { AccountSnapshot } from './accountUseCases';
import type { ScoreQueueState } from './scoreQueue';
import { isNetworkError } from './onlineErrors';

function isNetworkFailure(error: AppError): boolean {
  if (error.kind === 'offline_unavailable') return true;
  return error.kind === 'technical' && isNetworkError(error.cause);
}

export function accountForOfflineBoot(input: {
  error: AppError;
  cached: AccountSnapshot | null;
  queue: ScoreQueueState | null;
}): AccountSnapshot | null {
  if (!isNetworkFailure(input.error)) return null;
  if (!input.cached || !input.queue || input.queue.entries.length === 0) return null;
  return input.cached;
}
